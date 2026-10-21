import { RollCheck, isHit } from "./dice.js";
import { settleOnRoll } from "./check-cards.js";
import { pickTokensOnCanvas, confirmation, gmList, postCard } from "../common/general-sheet-functions.js";
import { registerSocketActions, relayToActiveGM } from "../common/general-helper-functions.js";

// An attack that lands on targets the attacker picks after the hit: a button on the attack card
// marks them on the canvas, and every target's owner rolls a defence from a card of their own. What
// a hit does is not this file's business - an effect registered here brings it (a dose, for now).

export const DEFENCE_TEMPLATE = "systems/eclipsephase/templates/chat/targeted-defence.html";
const EFFECTS = new Map();
const MARKING = new Map();

/**
 * Registers what an attack can bring onto its targets.
 * @param {String} effect - The effect's key, carried on the attack
 * @param {Object} handlers - detect(rollContext) returns {targets, area, payload, labelKey} for an
 *   attack that brings the effect, or null; beforeDelivery(attack) may refuse delivery by returning
 *   false; resolve(attack, target, outcome, {byPool, defenceId}) carries out "hit", "half" or "none"
 * @returns {void}
 */
export function registerAttackEffect(effect, handlers) {
  EFFECTS.set(effect, handlers);
}

/**
 * The effect registered under a key.
 * @param {String} effect - The effect's key
 * @returns {Object|undefined} Its handlers
 */
export function attackEffect(effect) {
  return EFFECTS.get(effect);
}

/**
 * How a target defends against an attack rolled from a source.
 * @param {String} rolledFrom - The attack roll's source
 * @returns {String} "ranged" or "melee"
 */
export function defenceKind(rolledFrom) {
  return rolledFrom === "rangedWeapon" ? "ranged" : "melee";
}

/**
 * Builds the attack a roll carries: either one the caller set up already, or one a registered
 * effect recognises in the roll.
 * @param {Object} context - The roll context at preRoll
 * @returns {Object|null} The attack, or null for an ordinary roll
 */
export function attackFor(context) {
  const preset = context.flags?.targetedAttack;
  const found = preset ? null : Array.from(EFFECTS.entries()).map(([effect, handlers]) => ({ effect, found: handlers.detect?.(context) })).find(entry => entry.found);
  if (!preset && !found) return null;
  return {
    id: foundry.utils.randomID(),
    actorUuid: context.actor?.uuid ?? null,
    weaponName: context.weapon?.weaponName ?? context.dataset?.name ?? "",
    defence: defenceKind(context.rolledFrom),
    area: false,
    delivered: false,
    targetNames: [],
    ...(found ? { effect: found.effect, ...found.found } : {}),
    ...(preset ?? {})
  };
}

/**
 * The attack a card carries and the flag path it sits under: on the attack roll itself, or on the
 * card a pool spend posted after turning a miss into a hit.
 * @param {ChatMessage} message - The card
 * @returns {Object} attack, or null, and its path
 */
export function attackOn(message) {
  const onRoll = message?.getFlag?.("eclipsephase", "roll")?.targetedAttack;
  if (onRoll) return { attack: onRoll, path: "flags.eclipsephase.roll.targetedAttack" };
  const onCard = message?.getFlag?.("eclipsephase", "targetedAttack");
  return { attack: onCard ?? null, path: "flags.eclipsephase.targetedAttack" };
}

/**
 * Asks whether fewer targets than the attack delivers to are meant.
 * @param {Object} attack - The attack
 * @param {Number} count - The targets picked
 * @returns {Promise<Boolean>} True to go on
 */
async function confirmFewer(attack, count) {
  const copy = game.i18n.format("ep2e.dialog.targeting.fewerCopy", { max: attack.targets, count });
  const answer = await confirmation(game.i18n.localize("ep2e.dialog.targeting.fewerTitle"), game.i18n.localize("ep2e.dialog.targeting.fewerHeadline"), copy, "", "", "ep2e.dialog.targeting.fewerConfirm");
  return answer.confirm === true;
}

/**
 * The attack card with its target button turned into the list of who was picked.
 * @param {String} content - The card's markup
 * @param {String[]} names - The targets' names
 * @returns {String} The new markup
 */
export function contentWithTargets(content, names) {
  const holder = document.createElement("div");
  holder.innerHTML = content;
  const note = document.createElement("p");
  note.className = "ep-attack-targets";
  note.textContent = game.i18n.format("ep2e.chat.attack.targets", { names: names.join(", ") });
  const button = holder.querySelector("button.targetedAttack");
  const controls = button?.closest(".chatControls") ?? button;
  if (controls) controls.replaceWith(note);
  else holder.append(note);
  return holder.innerHTML;
}

/**
 * Carries out an attack card's target button: the attacker marks the targets, the attack is noted
 * as delivered, and each target's owner gets a card to defend from.
 * @param {ChatMessage} message - The attack card
 * @param {Object} [seams] - pick and confirm, replaced in tests
 * @returns {Promise<Actor[]|null>} The targets, or null when nothing was delivered
 */
export async function applyTargetedAttack(message, { pick = pickTokensOnCanvas, confirm = confirmFewer } = {}) {
  const { attack, path } = attackOn(message);
  if (!attack) return null;
  const attacker = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
  if (attacker && !attacker.isOwner) return null;
  if (attack.delivered) {
    ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.attackDelivered"));
    return null;
  }
  const handlers = EFFECTS.get(attack.effect);
  if (handlers?.ready && !handlers.ready(attack)) return null;

  const tokens = await pick({ max: attack.targets });
  if (!tokens?.length) return null;
  if (tokens.length < attack.targets && !(await confirm(attack, tokens.length))) return null;
  const targets = tokens.map(token => token.actor).filter(Boolean);
  if (handlers?.beforeDelivery && (await handlers.beforeDelivery(attack)) === false) return null;

  const names = targets.map(target => target.name);
  await message.update({ content: contentWithTargets(message.content, names), [`${path}.delivered`]: true, [`${path}.targetNames`]: names });
  await postDefenceCards({ ...attack, delivered: true, targetNames: names }, targets);
  return targets;
}

/**
 * The users who defend a target: its player owners, or the GM when no player owns it.
 * @param {Actor} actor - The target
 * @returns {String[]} User ids, empty for the GM
 */
export function defenders(actor) {
  return Array.from(game.users ?? []).filter(user => !user.isGM && actor.testUserPermission?.(user, "OWNER")).map(user => user.id).sort();
}

/**
 * The targets grouped by who defends them, so each owner gets one card.
 * @param {Actor[]} targets - The targets
 * @returns {Object[]} { users, targets } per owner; users is empty for the GM
 */
export function defenceGroups(targets) {
  const groups = new Map();
  for (const target of targets) {
    const users = defenders(target);
    const key = users.join(",");
    if (!groups.has(key)) groups.set(key, { users, targets: [] });
    groups.get(key).targets.push(target);
  }
  return Array.from(groups.values());
}

/**
 * Renders a defence card from its state.
 * @param {Object} state - The card's attackDefence flag
 * @returns {Promise<String>} The markup
 */
export function renderDefenceCard(state) {
  const remaining = state.entries.filter(entry => !entry.outcome);
  return foundry.applications.handlebars.renderTemplate(DEFENCE_TEMPLATE, {
    headline: game.i18n.format("ep2e.chat.defence.headline", { weapon: state.attack.weaponName }),
    effectLabel: state.attack.effectLabel ?? "",
    melee: state.attack.defence === "melee",
    entries: state.entries.map(entry => ({ ...entry, outcomeLabel: entry.outcome ? game.i18n.localize(`ep2e.chat.defence.outcome.${entry.outcome}`) : "" })),
    rollAll: state.attack.defence === "ranged" && remaining.length > 1
  });
}

/**
 * Posts one defence card per owner of the targets, whispered to that owner and the GMs.
 * @param {Object} attack - The attack, delivered
 * @param {Actor[]} targets - Who it struck
 * @returns {Promise<ChatMessage[]>} The cards
 */
export async function postDefenceCards(attack, targets) {
  const attacker = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
  const cards = [];
  for (const group of defenceGroups(targets)) {
    const state = { attack, entries: group.targets.map(target => ({ uuid: target.uuid, name: target.name, outcome: null })) };
    cards.push(await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content: await renderDefenceCard(state),
      whisper: [...new Set([...group.users, ...gmList()])],
      flags: { eclipsephase: { attackDefence: state } }
    }));
  }
  return cards;
}

/**
 * The roll a defence takes: Fray, halved against a ranged attack, or Melee to parry.
 * @param {Actor} actor - The defender
 * @param {Object} attack - The attack
 * @param {String} kind - "dodge" or "parry"
 * @returns {Object} The roll's dataset, without its context flags
 */
export function defenceDataset(actor, attack, kind) {
  if (kind === "parry") {
    return { type: "skill", key: "melee", name: game.i18n.localize("ep2e.skills.vigorSkills.melee"), rollvalue: actor.system.skillsVig?.melee?.roll ?? 0, pooltype: "Vigor" };
  }
  return {
    type: "skill",
    key: "fray",
    name: game.i18n.localize("ep2e.skills.vigorSkills.fray"),
    rollvalue: actor.system.skillsVig?.fray?.roll ?? 0,
    pooltype: "Vigor",
    frayMelee: attack.defence === "melee",
    dodgeCover: attack.defence === "ranged" && attack.area === true
  };
}

/**
 * Rolls one target's defence from a defence card.
 * @param {ChatMessage} message - The defence card
 * @param {String} targetUuid - The target
 * @param {String} kind - "dodge" or "parry"
 * @param {Object} [systemOptions] - Passed on to RollCheck
 * @returns {Promise<*>} Whatever the roll returned, or nothing when it is not this user's to roll
 */
export async function rollDefence(message, targetUuid, kind = "dodge", systemOptions = {}) {
  const state = message?.getFlag?.("eclipsephase", "attackDefence");
  const entry = state?.entries?.find(candidate => candidate.uuid === targetUuid);
  if (!entry || entry.outcome) return null;
  const actor = await fromUuid(targetUuid);
  if (!actor?.isOwner) return null;
  const dataset = {
    ...defenceDataset(actor, state.attack, kind),
    contextFlags: { attackDefence: { messageId: message.id, targetUuid, attackId: state.attack.id, defenceId: foundry.utils.randomID(), behindCover: false } }
  };
  return RollCheck(dataset, actor.system, actor, systemOptions, null, "skill");
}

/**
 * Rolls every remaining target's dodge on a card together, without a dialog: the dice fly at once
 * and each target keeps a roll card of its own.
 * @param {ChatMessage} message - The defence card
 * @returns {Promise<void>} Resolves once all are rolled
 */
export async function rollRemainingDefences(message) {
  const state = message?.getFlag?.("eclipsephase", "attackDefence");
  const presetOptions = { rangedFray: state?.attack?.defence === "ranged", behindCover: false, rollMode: "public", usePool: "", globalMod: 0 };
  const remaining = (state?.entries ?? []).filter(entry => !entry.outcome);
  await Promise.all(remaining.map(entry => rollDefence(message, entry.uuid, "dodge", { skipDialog: true, presetOptions })));
}

/**
 * What a defence does to the attack: a failed one lets it hit; a successful dodge against an area
 * attack still lets half through, unless the defender was behind cover; any other successful
 * defence stops it.
 * @param {Object} attack - The attack
 * @param {Boolean} passed - Whether the defence succeeded
 * @param {Boolean} behindCover - Whether the defender dodged behind cover
 * @returns {String} "hit", "half" or "none"
 */
export function defenceOutcome(attack, passed, behindCover) {
  if (!passed) return "hit";
  if (attack.defence === "ranged" && attack.area === true && !behindCover) return "half";
  return "none";
}

/**
 * Notes a target's outcome on its defence card. Done where the card may be changed; anyone else
 * asks the active GM. Notes on one card are written one after another, each on top of the last,
 * so outcomes landing together do not overwrite each other.
 * @param {ChatMessage} message - The defence card
 * @param {String} targetUuid - The target
 * @param {String} outcome - "hit", "half" or "none"
 * @returns {Promise<void>} Resolves once noted or asked
 */
export function markDefenceRolled(message, targetUuid, outcome) {
  if (!message?.getFlag?.("eclipsephase", "attackDefence")) return Promise.resolve();
  if (!message.isOwner && !game.user.isGM) {
    relayToActiveGM("markDefenceRolled", { messageId: message.id, targetUuid, outcome }, { warn: false });
    return Promise.resolve();
  }
  const write = async () => {
    const state = message.getFlag("eclipsephase", "attackDefence");
    const entries = state.entries.map(entry => entry.uuid === targetUuid ? { ...entry, outcome } : entry);
    await message.update({ content: await renderDefenceCard({ ...state, entries }), "flags.eclipsephase.attackDefence.entries": entries });
  };
  const next = (MARKING.get(message.id) ?? Promise.resolve()).then(write, write);
  MARKING.set(message.id, next);
  next.finally(() => { if (MARKING.get(message.id) === next) MARKING.delete(message.id); });
  return next;
}

/**
 * Posts the card a pool spend leaves when it turns an attack's miss into a hit, carrying the target
 * button the attack card never showed.
 * @param {Object} attack - The attack
 * @returns {Promise<ChatMessage|null>} The card
 */
async function postHitByPoolCard(attack) {
  const attacker = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
  if (!attacker) return null;
  const label = game.i18n.localize(attack.labelKey ?? "ep2e.chat.attack.applyTargets");
  return postCard(attacker, { icon: "fa-crosshairs", color: "--negative", headline: game.i18n.format("ep2e.chat.attack.hitByPool", { weapon: attack.weaponName }), button: { action: "targetedAttack", label }, actorUuid: attacker.uuid }, { eclipsephase: { targetedAttack: attack } });
}

/**
 * Registers the hooks targeted attacks run on: the attack is put on the roll, a pool spend that
 * turns a miss into a hit offers the target button, and a defence settles its target's outcome.
 * @returns {void}
 */
export function registerTargetedAttackHooks() {
  Hooks.on("eclipsephase.preRoll", context => {
    if (context?.flags?.attackDefence) context.flags.attackDefence.behindCover = context.options?.behindCover === true || context.options?.behindCover === "on";
    if (context?.flags?.targetedAttack?.id) return;
    const attack = attackFor(context);
    if (attack) context.flags.targetedAttack = attack;
  });

  settleOnRoll("targetedAttack", async (attack, passed, { byPool, message, context }) => {
    if (!byPool || !passed || isHit(context?.alternatives?.originalResult)) return;
    if (message?.getFlag?.("eclipsephase", "roll")?.targetedAttack?.offeredByPool) return;
    if (message) await message.update({ "flags.eclipsephase.roll.targetedAttack.offeredByPool": true });
    await postHitByPoolCard(attack);
  });

  settleOnRoll("attackDefence", async (defence, passed, { byPool }) => {
    const card = game.messages.get(defence.messageId);
    const state = card?.getFlag?.("eclipsephase", "attackDefence");
    if (!state) return;
    const outcome = defenceOutcome(state.attack, passed, defence.behindCover);
    await markDefenceRolled(card, defence.targetUuid, outcome);
    const target = await fromUuid(defence.targetUuid);
    if (target) await EFFECTS.get(state.attack.effect)?.resolve?.(state.attack, target, outcome, { byPool, defenceId: defence.defenceId });
  });
}

/**
 * Registers the socket action the active GM notes defences under for players.
 * @returns {void}
 */
export function registerTargetedAttackSocket() {
  registerSocketActions({
    markDefenceRolled: payload => markDefenceRolled(game.messages.get(payload.messageId), payload.targetUuid, payload.outcome)
  });
}
