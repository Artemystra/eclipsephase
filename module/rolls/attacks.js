import { RollCheck, isCriticalSuccess, isHit } from "./dice.js";
import { spentOrOriginalResult, settleOnRoll } from "./cards.js";
import { confirmation, gmList, isChecked, timedEffectData } from "../common/general-sheet-functions.js";
import { targetKinds } from "../common/morp-functions.js";
import { gammaSleight, sleightModifiers, PSI_CURSOR, PSI_UNSUITABLE } from "./psi.js";
import { pickTokensOnCanvas, MELEE_CURSOR } from "../common/targeting.js";
import { registerCard, renderCard, updateCard } from "../common/chat-cards.js";
import { ANY_TARGETS, ATTACK_MODES, minimumTargets, attackTargetCount } from "../common/weapon-functions.js";

// An attack that lands on targets: the attacker picks them at the end of the attack dialog, or after
// the hit from a button on the attack card, and every target's owner rolls a defence from a card of
// their own. What a hit does is not this file's business - an effect registered here brings it: a
// dose (doses.js) or damage (damage.js).

export const DEFENCE_TEMPLATE = "systems/eclipsephase/templates/chat/targeted-defence.html";
const EFFECTS = new Map();

registerCard("attackDefence", {
  render: renderDefenceCard,
  mutations: { markOutcome: (state, { targetUuid, outcome, lockedOut = false }) => ({ ...state, entries: state.entries.map(entry => entry.uuid === targetUuid ? { ...entry, outcome, lockedOut } : entry) }) }
});

/**
 * Registers what an attack can bring onto its targets.
 * @param {String} effect - The effect's key, carried on the attack
 * @param {Object} handlers - detect(rollContext) returns {targets, area, payload, labelKey, and
 *   optionally cursor: {icon, color} to pick the targets with} for an attack that brings the effect,
 *   or null; beforeDelivery(attack) may refuse delivery by returning
 *   false; resolve(attack, target, outcome, {byPool, defenceId, kind}) carries out "hit", "half" or
 *   "none", kind being how the target defended ("dodge" or "parry")
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
 * How a target defends against an attack rolled from a source: a sleight with WIL (Core p.276), a
 * ranged attack by dodging, a melee attack by dodging or parrying.
 * @param {String} rolledFrom - The attack roll's source
 * @returns {String} "will", "ranged" or "melee"
 */
export function defenceKind(rolledFrom) {
  if (rolledFrom === "psiSleight") return "will";
  return rolledFrom === "rangedWeapon" ? "ranged" : "melee";
}

/**
 * The targets an attack was aimed at in its dialog, before the roll. The dialog turns an empty
 * field into false, which names no target.
 * @param {Object} options - The dialog's options
 * @returns {String[]} Their actor uuids
 */
export function chosenTargets(options) {
  const picked = options?.preTargets;
  return typeof picked === "string" ? picked.split(",").filter(Boolean) : [];
}

/**
 * The attack roll a defence is measured against: the die and result the attack card shows now, a
 * pool point spent on it included.
 * @param {ChatMessage} message - The attack card
 * @returns {Object} value (the die) and result (the tier)
 */
export function attackRoll(message) {
  return { value: Number(message.getFlag("eclipsephase", "taskCard")?.data?.rollResult) || null, result: spentOrOriginalResult(message.getFlag("eclipsephase", "roll") ?? {}) };
}

/**
 * The notice for a target an attack cannot strike, or nothing when it can. An attack names the
 * kinds of target it cannot strike - a sleight cannot reach a synthmorph, for instance - and a
 * module can name its own.
 * @param {Actor} actor - The target
 * @param {String[]} [unsuitable] - The kinds the attack cannot strike, as targetKinds names them
 * @returns {String|null} The notice
 */
export function unsuitableTarget(actor, unsuitable = []) {
  const kind = targetKinds(actor).find(entry => unsuitable.includes(entry));
  return kind ? game.i18n.format("ep2e.targeting.unsuitable", { name: actor.name, kind: game.i18n.localize(`ep2e.targeting.kind.${kind}`) }) : null;
}

/**
 * A picker's refusal for an attack's unsuitable targets.
 * @param {String[]} [unsuitable] - The kinds the attack cannot strike
 * @returns {Function|null} refuse(token) for pickTokensOnCanvas, or null when nothing is refused
 */
export function refuseUnsuitable(unsuitable = []) {
  return unsuitable.length ? token => (token.actor ? unsuitableTarget(token.actor, unsuitable) : null) : null;
}

/**
 * Builds the attack a roll carries: either one the caller set up already, or one a registered
 * effect recognises in the roll. Targets picked in the dialog come along with it.
 * @param {Object} context - The roll context at preRoll
 * @returns {Object|null} The attack, or null for an ordinary roll
 */
export function attackFor(context) {
  const preset = context.flags?.targetedAttack;
  const found = preset ? null : Array.from(EFFECTS.entries()).map(([effect, handlers]) => ({ effect, found: handlers.detect?.(context) })).find(entry => entry.found);
  if (!preset && !found) return null;
  const preTargets = chosenTargets(context.options);
  return {
    id: foundry.utils.randomID(),
    actorUuid: context.actor?.uuid ?? null,
    weaponName: context.weapon?.weaponName ?? context.dataset?.name ?? "",
    defence: defenceKind(context.rolledFrom),
    area: false,
    delivered: false,
    targetNames: [],
    ...(found ? { effect: found.effect, ...found.found } : {}),
    ...(preset ?? {}),
    ...(preTargets.length ? { preTargets } : {})
  };
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
 * Carries out an attack card's target button: the attacker marks the targets, the attack is noted
 * as delivered, and each target's owner gets a card to defend from.
 * @param {ChatMessage} message - The attack card
 * @param {Object} [seams] - pick and confirm, replaced in tests
 * @returns {Promise<Actor[]|null>} The targets, or null when nothing was delivered
 */
export async function applyTargetedAttack(message, { pick = pickTokensOnCanvas, confirm = confirmFewer } = {}) {
  const attack = message?.getFlag?.("eclipsephase", "roll")?.targetedAttack ?? null;
  if (!attack) return null;
  const attacker = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
  if (attacker && !attacker.isOwner) return null;
  if (attack.delivered) {
    ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.attackDelivered"));
    return null;
  }
  const handlers = EFFECTS.get(attack.effect);
  if (handlers?.ready && !handlers.ready(attack)) return null;

  const any = attack.targets === ANY_TARGETS;
  const tokens = await pick({ multi: any || attack.targets > 1, max: any ? Infinity : attack.targets, within: attack.within ?? null, refuse: refuseUnsuitable(attack.unsuitable), ...(attack.cursor ?? {}) });
  if (!tokens?.length) return null;
  if (!any && tokens.length < attack.targets && !(await confirm(attack, tokens.length))) return null;
  const targets = tokens.map(token => token.actor).filter(Boolean);
  if (handlers?.beforeDelivery && (await handlers.beforeDelivery(attack)) === false) return null;

  const names = targets.map(target => target.name);
  const uuids = targets.map(target => target.uuid);
  const roll = attackRoll(message);
  const delivered = { "flags.eclipsephase.roll.targetedAttack.delivered": true, "flags.eclipsephase.roll.targetedAttack.targetNames": names, "flags.eclipsephase.roll.targetedAttack.roll": roll };
  if (message.getFlag("eclipsephase", "taskCard")) await updateCard(message, "taskCard", "targets", { names, uuids }, { extra: delivered });
  else await message.update(delivered);
  const sent = { ...attack, delivered: true, targetNames: names, roll, messageId: message.id };
  if (attack.willing) {
    for (const target of targets) await handlers?.resolve?.(sent, target, "hit", { kind: "willing" });
  }
  else await postDefenceCards(sent, targets);
  return targets;
}

/**
 * Sends an attack to the targets picked before its roll, once its card shows a hit - straight
 * after the roll, or when a pool point turns a miss into one.
 * @param {ChatMessage} message - The attack card
 * @returns {Promise<Actor[]|null>} The targets, or null when nothing was sent
 */
export async function deliverToChosen(message) {
  const context = message?.getFlag?.("eclipsephase", "roll");
  const attack = context?.targetedAttack;
  if (!attack?.preTargets?.length || attack.delivered || !isHit(spentOrOriginalResult(context))) return null;
  const actors = (await Promise.all(attack.preTargets.map(uuid => fromUuid(uuid)))).filter(Boolean);
  if (!actors.length) return null;
  return applyTargetedAttack(message, { pick: async () => actors.map(actor => ({ actor })), confirm: async () => true });
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
 * What a defence's outcome is called on a card: a target that resisted a sleight "resisted", one
 * it reached "affected", the rest as hit, half or avoided.
 * @param {String|null} outcome - "hit", "half" or "none"
 * @param {String} [defence] - How the target defended: "will", "ranged" or "melee"
 * @returns {String} The label, "" while the target has yet to defend
 */
export function outcomeLabel(outcome, defence) {
  if (!outcome) return "";
  return game.i18n.localize(defence === "will" ? `ep2e.chat.defence.outcome.will.${outcome}` : `ep2e.chat.defence.outcome.${outcome}`);
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
    several: state.entries.length > 1,
    entries: state.entries.map(entry => ({ ...entry, outcomeLabel: outcomeLabel(entry.outcome, state.attack.defence) })),
    will: state.attack.defence === "will",
    icon: state.attack.defence === "will" ? "fa-brain" : "fa-crosshairs",
    rollAll: state.attack.defence === "ranged" && remaining.length > 1,
    rollAllUuid: remaining[0]?.uuid ?? ""
  });
}

/**
 * Who sees a card that follows from an attack: everyone when the attack card was public, otherwise
 * those who saw it, the GMs and the owners of the targets the card concerns. An attack card that is
 * gone leaves the card to the targets' owners and the GMs.
 * @param {ChatMessage|null} origin - The attack card
 * @param {Actor[]} targets - The targets the card concerns
 * @returns {Object} whisper (user ids, empty for public) and blind
 */
export function followUpVisibility(origin, targets = []) {
  const owners = targets.flatMap(target => defenders(target));
  if (origin && !(origin.whisper?.length)) return { whisper: [], blind: false };
  return { whisper: [...new Set([...(origin?.whisper ?? []), ...owners, ...gmList()])], blind: origin?.blind === true };
}

/**
 * Who a defence card speaks as: its one defender, or "several targets" when it holds more.
 * @param {Actor[]} targets - The targets on the card
 * @returns {Object} The speaker
 */
export function defenceSpeaker(targets) {
  return targets.length === 1 ? ChatMessage.getSpeaker({ actor: targets[0] }) : { alias: game.i18n.localize("ep2e.chat.defence.severalTargets") };
}

/**
 * Posts one defence card per owner of the targets, speaking as the defender. It is seen as the
 * attack card was, and always by that owner, who has to roll from it.
 * @param {Object} attack - The attack, delivered
 * @param {Actor[]} targets - Who it struck
 * @returns {Promise<ChatMessage[]>} The cards
 */
export async function postDefenceCards(attack, targets) {
  const origin = attack.messageId ? game.messages.get(attack.messageId) ?? null : null;
  const cards = [];
  for (const group of defenceGroups(targets)) {
    const state = { attack, entries: group.targets.map(target => ({ uuid: target.uuid, name: target.name, outcome: null })) };
    cards.push(await ChatMessage.create({
      speaker: defenceSpeaker(group.targets),
      content: await renderCard("attackDefence", state),
      whisper: followUpVisibility(origin, group.targets).whisper,
      flags: { eclipsephase: { attackDefence: state } }
    }));
  }
  return cards;
}

/**
 * The roll a defence takes: Fray, halved against a ranged attack; Melee to parry; a WIL Check
 * against psi, on half WIL against a pushed Power.
 * @param {Actor} actor - The defender
 * @param {Object} attack - The attack
 * @param {String} kind - "dodge", "parry" or "will"
 * @returns {Object} The roll's dataset, without its context flags
 */
export function defenceDataset(actor, attack, kind) {
  if (kind === "will") {
    const will = Number(actor.system.aptitudes?.wil?.roll) || 0;
    return { type: "skill", key: "system.aptitudes.wil.value", apttype: "wil", name: game.i18n.localize(actor.system.aptitudes?.wil?.name ?? "WIL"), rollvalue: attack.payload?.halveWill ? Math.floor(will / 2) : will, pooltype: "Moxie", defence: true };
  }
  if (kind === "parry") {
    return { type: "skill", key: "melee", name: game.i18n.localize("ep2e.skills.vigorSkills.melee"), rollvalue: actor.system.skillsVig?.melee?.roll ?? 0, pooltype: "Vigor", defence: true };
  }
  return {
    type: "skill",
    key: "fray",
    name: game.i18n.localize("ep2e.skills.vigorSkills.fray"),
    rollvalue: actor.system.skillsVig?.fray?.roll ?? 0,
    pooltype: "Vigor",
    frayMelee: attack.defence === "melee",
    dodgeCover: attack.defence === "ranged" && attack.area === true,
    defence: true
  };
}

/**
 * Rolls one target's defence from a defence card. The roll is seen as the attack was, and by the
 * defender; a blind attack still lets the defender see their own roll.
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
  const origin = state.attack.messageId ? game.messages.get(state.attack.messageId) ?? null : null;
  const dataset = {
    ...defenceDataset(actor, state.attack, kind),
    visibility: { whisper: followUpVisibility(origin ?? message, [actor]).whisper, blind: false },
    contextFlags: { attackDefence: { messageId: message.id, targetUuid, attackId: state.attack.id, defenceId: foundry.utils.randomID(), behindCover: false, kind } }
  };
  return RollCheck(dataset, actor.system, actor, systemOptions, null, "skill");
}

/**
 * Rolls every remaining target's defence on a card together, without a dialog - a dodge, or WIL
 * against psi: the dice fly at once and each target keeps a roll card of its own.
 * @param {ChatMessage} message - The defence card
 * @returns {Promise<void>} Resolves once all are rolled
 */
export async function rollRemainingDefences(message) {
  const state = message?.getFlag?.("eclipsephase", "attackDefence");
  const presetOptions = { rangedFray: state?.attack?.defence === "ranged", behindCover: false, fullDefense: false, rollMode: "public", usePool: "", globalMod: 0 };
  const remaining = (state?.entries ?? []).filter(entry => !entry.outcome);
  const kind = state?.attack?.defence === "will" ? "will" : "dodge";
  await Promise.all(remaining.map(entry => rollDefence(message, entry.uuid, kind, { skipDialog: true, presetOptions })));
}

/**
 * What a defence does to the attack. A failed defence lets it hit. Against an area attack a
 * successful dodge still lets half through, unless the defender was behind cover (Core p.218).
 * Otherwise it is an opposed test (Core p.202): when both succeed, a critical success beats one that
 * is not, and between equals the higher die wins - a tie goes to the defender.
 * @param {Object} attack - The attack, with roll ({ value, result }) once its targets were chosen
 * @param {Object} defence - passed, result (tier), value (die) and behindCover
 * @returns {String} "hit", "half" or "none"
 */
export function defenceOutcome(attack, { passed, result, value, behindCover = false } = {}) {
  if (!passed) return "hit";
  if (attack.area === true) return attack.defence === "ranged" && !behindCover ? "half" : "none";
  const roll = attack.roll;
  if (!roll || !Number.isFinite(Number(roll.value))) return "none";
  const attackCritical = isCriticalSuccess(roll.result);
  if (attackCritical !== isCriticalSuccess(result)) return attackCritical ? "hit" : "none";
  return Number(roll.value) > Number(value) ? "hit" : "none";
}

/**
 * Notes a target's outcome on its defence card.
 * @param {ChatMessage} message - The defence card
 * @param {String} targetUuid - The target
 * @param {String} outcome - "hit", "half" or "none"
 * @param {Object} [options] - lockedOut: the target won with a critical success against psi
 * @returns {Promise<Boolean>} What updateCard reported
 */
export function markDefenceRolled(message, targetUuid, outcome, { lockedOut = false } = {}) {
  return updateCard(message, "attackDefence", "markOutcome", { targetUuid, outcome, lockedOut });
}

/**
 * A target's choice not to resist (Core p.276: a willing target who knows what is happening): the
 * attack lands without a defence roll.
 * @param {ChatMessage} message - The defence card
 * @param {String} targetUuid - The target
 * @returns {Promise<Boolean>} True once noted, false when it was not this user's to choose
 */
export async function yieldDefence(message, targetUuid) {
  const state = message?.getFlag?.("eclipsephase", "attackDefence");
  const entry = state?.entries?.find(candidate => candidate.uuid === targetUuid);
  if (!entry || entry.outcome) return false;
  const target = await fromUuid(targetUuid);
  if (!target?.isOwner) return false;
  await markDefenceRolled(message, targetUuid, "hit");
  await EFFECTS.get(state.attack.effect)?.resolve?.(state.attack, target, "hit", { kind: "yield" });
  return true;
}

// What an attack that leaves its attacker open is marked by on the attacker.
export const EXPOSURE_KEY = "attackExposure";

/**
 * Leaves an attacker open after an aggressive attack (Core p.204: "-10 to Fray Tests until your
 * next action"): during a combat that has started, a state named after the attack runs until the
 * attacker's next turn begins, replacing an earlier one. Outside combat the scene is narrative,
 * and nothing is written. The state brings its penalty onto Fray tests as a modifier of its own,
 * so the roll card names it.
 * @param {Object} context - The roll context at postRoll
 * @returns {Promise<ActiveEffect[]|null>} The state, or null when none is due
 */
export async function exposeAttacker(context) {
  const exposure = ATTACK_MODES[context?.options?.attackMode]?.exposure;
  const actor = context?.actor;
  if (!exposure || !actor?.isOwner || !game.combat?.started) return null;
  const earlier = Array.from(actor.effects ?? []).filter(effect => effect.getFlag?.("eclipsephase", "effectKey") === EXPOSURE_KEY).map(effect => effect.id);
  if (earlier.length) await actor.deleteEmbeddedDocuments("ActiveEffect", earlier);
  const state = timedEffectData({
    name: game.i18n.localize(exposure.nameKey),
    img: "icons/svg/sword.svg",
    span: { value: 1, units: "rounds" },
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    flags: { effectKey: EXPOSURE_KEY, exposure: { fray: exposure.fray } }
  });
  state.duration.expiry = "turnStart";
  return actor.createEmbeddedDocuments("ActiveEffect", [state]);
}

/**
 * The modifiers an attacker's open states bring onto a Fray test.
 * @param {Actor} actor - The one rolling
 * @param {Object} dataset - The roll's dataset
 * @returns {Object[]} { text, value } per state
 */
export function exposureModifiers(actor, dataset) {
  if (dataset?.key !== "fray") return [];
  return Array.from(actor?.effects ?? [])
    .filter(effect => effect.getFlag?.("eclipsephase", "effectKey") === EXPOSURE_KEY && !effect.disabled && effect.duration?.expired !== true)
    .map(effect => ({ text: effect.name, value: Number(effect.getFlag("eclipsephase", "exposure")?.fray) || 0 }));
}

/**
 * Registers the hooks targeted attacks run on: the attack is put on the roll, and a defence settles
 * its target's outcome. A pool spend that turns a miss into a hit needs no hook - the roll card is
 * redrawn and shows the target button itself.
 * @returns {void}
 */
export function registerTargetedAttackHooks() {
  Hooks.on("eclipsephase.preRoll", context => {
    if (context?.modifiers) context.modifiers.push(...exposureModifiers(context.actor, context.dataset), ...sleightModifiers(context, targetKinds));
    if (context?.flags?.attackDefence) context.flags.attackDefence.behindCover = isChecked(context.options?.behindCover);
    if (context?.flags?.targetedAttack?.id) return;
    const attack = attackFor(context);
    if (attack) context.flags.targetedAttack = attack;
  });

  Hooks.on("eclipsephase.postRoll", context => {
    exposeAttacker(context);
    if (context?.flags?.targetedAttack?.preTargets?.length && context.message) return deliverToChosen(context.message);
  });

  Hooks.on("eclipsephase.poolResult", ({ context }) => {
    const message = context?.messageId ? game.messages.get(context.messageId) : null;
    if (message?.getFlag?.("eclipsephase", "roll")?.targetedAttack?.preTargets?.length) return deliverToChosen(message);
  });

  settleOnRoll("attackDefence", async (defence, passed, { byPool, result, value }) => {
    const card = game.messages.get(defence.messageId);
    const state = card?.getFlag?.("eclipsephase", "attackDefence");
    if (!state) return;
    const origin = state.attack.messageId ? game.messages.get(state.attack.messageId) : null;
    const attack = origin ? { ...state.attack, roll: attackRoll(origin) } : state.attack;
    const outcome = defenceOutcome(attack, { passed, result, value, behindCover: defence.behindCover });
    const lockedOut = attack.defence === "will" && outcome === "none" && isCriticalSuccess(result);
    await markDefenceRolled(card, defence.targetUuid, outcome, { lockedOut });
    const target = await fromUuid(defence.targetUuid);
    if (target) await EFFECTS.get(state.attack.effect)?.resolve?.(state.attack, target, outcome, { byPool, defenceId: defence.defenceId, kind: defence.kind ?? "dodge" });
  });
}

/**
 * How many targets a melee attack dialog names: each is attacked on its own, so every one of them
 * is picked.
 * @param {HTMLFormElement} form - The dialog's form
 * @returns {Number} The targets, at least one
 */
function meleeTargets(form) {
  return Math.max(1, parseInt(form?.elements?.numberOfTargets?.value) || 1);
}

/**
 * How an attack dialog picks its targets, or null for a roll that is no attack: a roll with a
 * weapon, a psi-gamma sleight, or one that brings an attack of its own, such as a forced dose.
 * @param {Object} rollContext - The roll context the dialog is shown for
 * @returns {Object|null} cursor; refuse, the picker's refusal of unsuitable targets; count(form), the targets the chosen options strike (Infinity
 *   for any number); minimum(form), the fewest a mode needs
 */
export function attackPicking(rollContext) {
  const preset = rollContext?.flags?.targetedAttack;
  const weapon = rollContext?.weapon?.weapon ?? null;
  const rolledFrom = rollContext?.rolledFrom;
  if (!preset && gammaSleight(rollContext)) {
    return { cursor: PSI_CURSOR, refuse: refuseUnsuitable(PSI_UNSUITABLE), count: form => form?.elements?.push?.value === "target" ? 2 : 1, minimum: () => 1 };
  }
  if (!preset && !(weapon && (rolledFrom === "rangedWeapon" || rolledFrom === "ccWeapon"))) return null;
  return {
    cursor: preset?.cursor ?? (rolledFrom === "ccWeapon" ? MELEE_CURSOR : {}),
    refuse: refuseUnsuitable(preset?.unsuitable),
    count: form => {
      if (preset) return preset.targets === ANY_TARGETS ? Infinity : preset.targets ?? 1;
      if (rolledFrom !== "rangedWeapon") return meleeTargets(form);
      const count = attackTargetCount(weapon, { attackMode: form?.elements?.attackMode?.value, range: form?.elements?.range?.value });
      return count === ANY_TARGETS ? Infinity : count;
    },
    minimum: form => rolledFrom === "ccWeapon" && !preset ? meleeTargets(form) : minimumTargets(form?.elements?.attackMode?.value)
  };
}
