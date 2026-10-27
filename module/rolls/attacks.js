import { RollCheck, isCriticalSuccess, isHit } from "./dice.js";
import { spentOrOriginalResult, settleOnRoll } from "./cards.js";
import { confirmation, gmList, isChecked, timedEffectData } from "../common/general-sheet-functions.js";
import { targetKinds } from "../common/morp-functions.js";
import { gammaSleight, sleightModifiers, psiRangeBand, isAsync, pushesRange, PSI_CURSOR, PSI_UNSUITABLE } from "./psi.js";
import { pickTokensOnCanvas, attackerToken, tokenGap, pointGap, areaPolygon, createShadowedArea, createPrivateArea, wholeShapes, spotShapes, clearAreas, shapeContains, unitsToPixels, scatterPoint, areaSquares, MELEE_CURSOR, TARGET_COLOR, AREA_FLAG, iconImage, sheetsAside, cellCentre, spotTop, hasCells } from "../common/targeting.js";
import { registerCard, renderCard, updateCard, inOrder } from "../common/chat-cards.js";
import { ANY_TARGETS, ATTACK_MODES, minimumTargets, attackTargetCount, weaponRange, rangeBand, rangeRefusal, isConeWeapon, blastReach, PROXIMITY_ARMING, CONE_MAX_TARGETS, SUPPRESSIVE_WIDTH } from "../common/weapon-functions.js";

// An attack that lands on targets: the attacker picks them at the end of the attack dialog, or after
// the hit from a button on the attack card, and every target's owner rolls a defence from a card of
// their own. What a hit does is not this file's business - an effect registered here brings it: a
// dose (doses.js) or damage (damage.js).

export const DEFENCE_TEMPLATE = "systems/eclipsephase/templates/chat/targeted-defence.html";
const EFFECTS = new Map();

registerCard("attackDefence", {
  render: renderDefenceCard,
  mutations: { markOutcome: (state, { targetUuid, outcome, lockedOut = false, cover = false }) => ({ ...state, entries: state.entries.map(entry => entry.uuid === targetUuid ? { ...entry, outcome, lockedOut, cover } : entry) }) }
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
 * ranged attack or a thrown grenade by dodging, a melee attack by dodging or parrying.
 * @param {String} rolledFrom - The attack roll's source
 * @returns {String} "will", "ranged" or "melee"
 */
export function defenceKind(rolledFrom) {
  if (rolledFrom === "psiSleight") return "will";
  return rolledFrom === "rangedWeapon" || rolledFrom === "grenade" ? "ranged" : "melee";
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

// What a defence card calls a target that got out of the way without a roll.
const COVER_LABELS = { moved: "ep2e.chat.defence.outcome.cover", remain: "ep2e.chat.defence.outcome.remainCover", inCover: "ep2e.chat.defence.outcome.inCover", spared: "ep2e.chat.defence.outcome.spared" };

/**
 * A button on a defence card, as the card's one template draws it.
 * @param {String} cls - The class its click is known by, e.g. "defenceRoll"
 * @param {String} label - The localization key of its words
 * @param {Object} [options] - target (the entry it acts for, also who may press it), kind, primary,
 *   gm (only the GM sees it), uuid (who may press it when it acts for no one entry)
 * @returns {Object} The button
 */
function defenceButton(cls, label, { target = "", kind = "", primary = false, gm = false, uuid = target } = {}) {
  return { cls, action: cls, label: game.i18n.localize(label), target, kind, primary, gm, uuid };
}

/**
 * The choices one target has on a defence card: resisting or not against psi, dodging or parrying
 * in melee, dodging a shot - from behind a wall from a blast's centre also staying in cover, and in
 * suppressive fire the cover the fire allows.
 * @param {Object} attack - The attack
 * @param {Object} entry - The target's entry
 * @returns {Object} pair (one or two secondaries side by side) and primary (one below, or null)
 */
function defenceChoices(attack, entry) {
  const uuid = entry.uuid;
  if (attack.defence === "will") return { pair: [defenceButton("defenceYield", "ep2e.chat.defence.yield", { target: uuid }), defenceButton("defenceRoll", "ep2e.chat.defence.resist", { target: uuid, kind: "will" })], primary: null };
  const dodge = defenceButton("defenceRoll", "ep2e.chat.defence.dodge", { target: uuid, kind: "dodge" });
  if (attack.defence === "melee") return { pair: [dodge, defenceButton("defenceRoll", "ep2e.chat.defence.parry", { target: uuid, kind: "parry" })], primary: null };
  if (attack.coverOption) return { pair: [defenceButton("defenceCover", attack.coverOption === "remain" ? "ep2e.chat.defence.remainCover" : "ep2e.chat.defence.cover", { target: uuid }), dodge], primary: null };
  if (attack.area === true && entry.shadow === true) return { pair: [dodge, defenceButton("defenceCover", "ep2e.chat.defence.inCover", { target: uuid })], primary: null };
  return { pair: [dodge], primary: null };
}

/**
 * The choices a defence card offers below its targets: for one target against a weapon, to soak the
 * damage; for several, to resolve the rest without a roll (the GM's ruling), to soak the rest, and
 * to dodge the rest last.
 * @param {Object} attack - The attack
 * @param {Object[]} entries - The card's entries
 * @returns {Object[]} The buttons
 */
function defenceControls(attack, entries) {
  const remaining = entries.filter(entry => !entry.outcome);
  if (attack.defence === "will" || !remaining.length) return [];
  if (entries.length === 1) return [defenceButton("defenceYield", "ep2e.chat.defence.soak", { target: remaining[0].uuid })];
  const first = remaining[0].uuid;
  return [
    defenceButton("defenceSpare", "ep2e.chat.defence.spareRest", { gm: true }),
    defenceButton("defenceSoakRest", "ep2e.chat.defence.soakRest", { uuid: first }),
    ...(remaining.length > 1 || attack.defence === "ranged" ? [defenceButton("defenceRollAll", "ep2e.chat.defence.rollAll", { uuid: first, primary: true })] : [])
  ];
}

/**
 * Renders a defence card from its state: one card for one target or many - each target under its
 * name with its own choices and a note, and below them the choices for the rest. Its headline says
 * what to defend against, and when every target on it stands behind a wall, that they do.
 * @param {Object} state - The card's attackDefence flag
 * @returns {Promise<String>} The markup
 */
export function renderDefenceCard(state) {
  const attack = state.attack;
  const behindWalls = state.entries.length > 0 && attack.area === true && state.entries.every(entry => entry.shadow === true);
  return foundry.applications.handlebars.renderTemplate(DEFENCE_TEMPLATE, {
    headline: game.i18n.format(behindWalls ? "ep2e.chat.defence.headlineCover" : "ep2e.chat.defence.headline", { weapon: attack.weaponName }),
    effectLabel: attack.effectLabel ?? "",
    effectInfo: attack.effectInfo ?? null,
    icon: attack.defence === "will" ? "fa-brain" : "fa-crosshairs",
    entries: state.entries.map(entry => ({
      uuid: entry.uuid,
      name: entry.name,
      outcome: entry.outcome,
      lockedOut: entry.lockedOut,
      note: blastNote(entry),
      outcomeLabel: entry.cover ? game.i18n.localize(COVER_LABELS[entry.cover] ?? COVER_LABELS.moved) : outcomeLabel(entry.outcome, attack.defence),
      ...(entry.outcome ? {} : defenceChoices(attack, entry))
    })),
    controls: defenceControls(attack, state.entries)
  });
}

/**
 * What a defence card notes about where a target stands in a blast: how far from its centre, and
 * whether at its edge, where a dodge gets it clear (Core p.218). Behind a wall the card's headline
 * says so instead.
 * @param {Object} entry - The card's entry, with distance, nearEdge and shadow for a blast
 * @returns {String} The note, "" for a target not in a blast
 */
export function blastNote(entry) {
  if (!Number.isFinite(entry?.distance)) return "";
  const where = game.i18n.format("ep2e.chat.defence.blastDistance", { distance: Math.floor(entry.distance) });
  return entry.nearEdge && !entry.shadow ? `${where} · ${game.i18n.localize("ep2e.chat.defence.blastEdge")}` : where;
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
 * Every GM, online or not, for a card no player may see - such as one about someone behind a wall.
 * @returns {String[]} The GMs' user ids
 */
export function gmWhisper() {
  return (game.users?.filter(user => user.isGM) ?? []).map(user => user.id);
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
 * @param {Object} [options] - gmOnly: whisper the cards to the GMs alone; details: a Map of target
 *   uuid to fields kept on its entry, such as where it stands in a blast
 * @returns {Promise<ChatMessage[]>} The cards
 */
export async function postDefenceCards(attack, targets, { gmOnly = false, details = new Map() } = {}) {
  const origin = attack.messageId ? game.messages.get(attack.messageId) ?? null : null;
  const cards = [];
  for (const group of defenceGroups(targets)) {
    const state = { attack, entries: group.targets.map(target => ({ uuid: target.uuid, name: target.name, outcome: null, ...(details.get(target.uuid) ?? {}) })) };
    cards.push(await ChatMessage.create({
      speaker: defenceSpeaker(group.targets),
      content: await renderCard("attackDefence", state),
      whisper: gmOnly ? gmWhisper() : followUpVisibility(origin, group.targets).whisper,
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
export function markDefenceRolled(message, targetUuid, outcome, { lockedOut = false, cover = false } = {}) {
  return updateCard(message, "attackDefence", "markOutcome", { targetUuid, outcome, lockedOut, cover });
}

/**
 * A target who takes cover instead of dodging, without a roll: caught in suppressive fire, moving
 * into cover on their turn or staying behind the wall they are behind (Core p.207); or standing
 * behind a wall from a blast's centre, where whoever defends them may rule the wall holds.
 * @param {ChatMessage} message - The defence card
 * @param {String} targetUuid - The target
 * @returns {Promise<Boolean>} True once noted, false when it was not this user's to choose
 */
export async function takeCover(message, targetUuid) {
  const state = message?.getFlag?.("eclipsephase", "attackDefence");
  const entry = state?.entries?.find(candidate => candidate.uuid === targetUuid);
  const cover = state?.attack?.coverOption || (state?.attack?.area === true && entry?.shadow === true ? "inCover" : null);
  if (!entry || entry.outcome || !cover) return false;
  const target = await fromUuid(targetUuid);
  if (!target?.isOwner) return false;
  await markDefenceRolled(message, targetUuid, "none", { cover });
  await EFFECTS.get(state.attack.effect)?.resolve?.(state.attack, target, "none", { kind: "cover" });
  return true;
}

/**
 * The GM's ruling that the targets still to defend on a card are not reached at all - a wall too
 * thick, a door shut in time: each is noted unharmed without a roll.
 * @param {ChatMessage} message - The defence card
 * @returns {Promise<Number>} How many were spared, 0 when it is not the GM's to rule
 */
export async function spareRemaining(message) {
  const state = message?.getFlag?.("eclipsephase", "attackDefence");
  if (!game.user.isGM || !state || state.attack?.defence === "will") return 0;
  const remaining = state.entries.filter(entry => !entry.outcome);
  for (const entry of remaining) {
    await markDefenceRolled(message, entry.uuid, "none", { cover: "spared" });
    const target = await fromUuid(entry.uuid);
    if (target) await EFFECTS.get(state.attack.effect)?.resolve?.(state.attack, target, "none", { kind: "cover" });
  }
  return remaining.length;
}

/**
 * Lets every target still to defend on a card take the attack without a roll - soaking it - as far
 * as this user may choose for them.
 * @param {ChatMessage} message - The defence card
 * @returns {Promise<Number>} How many took it
 */
export async function soakRemaining(message) {
  const state = message?.getFlag?.("eclipsephase", "attackDefence");
  let taken = 0;
  for (const entry of (state?.entries ?? []).filter(candidate => !candidate.outcome)) {
    if (await yieldDefence(message, entry.uuid)) taken++;
  }
  return taken;
}

/**
 * A target's choice not to resist (Core p.276: a willing target who knows what is happening): the
 * attack lands without a defence roll. Against a weapon this is soaking the damage.
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
    if (context?.flags?.targetedAttack?.suppressive && context.message) layDownSuppression(context);
    if (context?.flags?.targetedAttack?.blast?.origin && context.message) return detonateBlast(context.message);
    if (context?.flags?.targetedAttack?.preTargets?.length && context.message) return deliverToChosen(context.message);
  });

  Hooks.on("eclipsephase.poolResult", ({ context }) => {
    const message = context?.messageId ? game.messages.get(context.messageId) : null;
    const attack = message?.getFlag?.("eclipsephase", "roll")?.targetedAttack;
    if (attack?.blast?.origin) return detonateBlast(message);
    if (attack?.preTargets?.length) return deliverToChosen(message);
  });

  settleOnRoll("attackDefence", async (defence, passed, { byPool, result, value }) => {
    const card = game.messages.get(defence.messageId);
    const state = card?.getFlag?.("eclipsephase", "attackDefence");
    if (!state) return;
    const origin = state.attack.messageId ? game.messages.get(state.attack.messageId) : null;
    const attack = origin ? { ...state.attack, roll: attackRoll(origin) } : state.attack;
    const entry = state.entries.find(candidate => candidate.uuid === defence.targetUuid);
    const outcome = defenceOutcome(attack, { passed, result, value, behindCover: defence.behindCover || entry?.nearEdge === true || entry?.shadow === true });
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
 * Joins a picker's refusals: the first that refuses a token speaks.
 * @param {...Function|null} checks - refuse(token) functions, nulls skipped
 * @returns {Function|null} The joined refusal, or null when there is none
 */
function refuseAny(...checks) {
  const active = checks.filter(Boolean);
  return active.length ? token => active.map(check => check(token)).find(Boolean) ?? null : null;
}

// How far a touch reaches: point-blank (Core p.205, p.276).
const TOUCH_REACH = 2;

/**
 * A picker's refusal of targets out of a touch's reach, measured from the attacker's token.
 * @param {Actor} actor - The attacker
 * @returns {Function} refuse(token) for pickTokensOnCanvas
 */
function refuseBeyondTouch(actor) {
  return token => {
    const origin = attackerToken(actor);
    if (!origin || token === origin || tokenGap(origin, token, canvas.grid) <= TOUCH_REACH) return null;
    return game.i18n.format("ep2e.targeting.outOfTouch", { name: token.actor?.name ?? token.name ?? "" });
  };
}

/**
 * The distance as the picker shows it: metres and the category with its modifier.
 * @param {Number} distance - The distance in metres
 * @param {Object} band - band and modifier
 * @returns {String} e.g. "12 m · Range (-10)"
 */
function distanceText(distance, band) {
  const modifier = band.modifier > 0 ? `+${band.modifier}` : `${band.modifier}`;
  return `${Math.round(distance)} m · ${game.i18n.localize(`ep2e.targeting.band.${band.band}`)} (${modifier})`;
}

/**
 * What a ranged attack measures while its targets are picked: the distance from the attacker's
 * token, shown with its range category, and the farthest picked target's category set as the
 * dialog's distance. Targets the weapon cannot be fired at so close are refused.
 * @param {Object} rollContext - The roll context
 * @returns {Object} measure(form), applyMeasured(form, distances) and refuse(token)
 */
function rangedMeasuring(rollContext) {
  const range = weaponRange(rollContext.weapon);
  const traits = rollContext.weapon?.weaponTraits?.automatedEffects ?? {};
  const from = () => attackerToken(rollContext.actor);
  return {
    measure: () => {
      const origin = from();
      return origin ? { from: origin, describe: distance => distanceText(distance, rangeBand(distance, range, traits)) } : null;
    },
    applyMeasured: (form, distances) => {
      const select = form?.elements?.range;
      if (select && distances.length) select.value = rangeBand(Math.max(...distances), range, traits).select;
    },
    refuse: token => {
      const origin = from();
      return origin && token !== origin ? (game.i18n.localize(rangeRefusal(tokenGap(origin, token, canvas.grid), traits) ?? "") || null) : null;
    }
  };
}

// The Region behavior suppressive fire leaves: whoever moves in its cone has to defend.
export const SUPPRESSIVE_BEHAVIOR = "suppressive";

/**
 * Leaves suppressive fire's cone in the scene once it is rolled, as Regions that make whoever moves
 * inside defend against the roll: red in the open, yellow behind walls, grey when the roll missed.
 * @param {Object} context - The roll context at postRoll
 * @returns {Promise<Object[]|null>} The Regions, null when there is no cone, empty when the GM creates them
 */
export async function layDownSuppression(context) {
  const placed = (() => { try { return JSON.parse(context.options?.placedArea || "null"); } catch { return null; } })();
  if (!placed?.origin) return null;
  const attack = context.flags.targetedAttack;
  return laySuppression(placed, { attackId: attack.id, messageId: context.message.id, actorUuid: attack.actorUuid, actorName: context.actor?.name ?? "", spent: !isHit(context.outputData?.alternatives?.originalResult) });
}

/**
 * Lays suppressive fire's cone as Regions: red and yellow when its roll hit, grey when it missed -
 * then it strikes nobody (Core p.207 knows no stray rounds), and on a square grid it leaves out the
 * squares a hitting burst already covers.
 * @param {Object} placed - kind, origin, radius, angle, rotation
 * @param {Object} options - attackId, messageId, actorUuid, actorName; spent: the roll missed
 * @returns {Promise<Object[]>} The Regions, empty when the GM creates them
 */
async function laySuppression(placed, { attackId, messageId, actorUuid, actorName, spent }) {
  const name = game.i18n.format("ep2e.chat.attack.suppressiveArea", { name: actorName });
  return createShadowedArea({ ...placed, polygon: areaPolygon(placed.origin, placed) }, {
    name,
    spent,
    exclude: spent ? squaresUnderFire(canvas.scene) : new Set(),
    flags: { attackId, messageId, actorUuid, suppressive: true },
    behaviors: [{ type: SUPPRESSIVE_BEHAVIOR, name, system: { messageId } }]
  });
}

/**
 * The grid cells a hitting suppressive fire covers on a scene.
 * @param {Scene} scene - The scene
 * @returns {Set<String>} The cells, as "i,j"
 */
function squaresUnderFire(scene) {
  const cells = new Set();
  for (const region of Array.from(scene?.regions ?? [])) {
    const flag = region.getFlag?.("eclipsephase", "area");
    if (!flag?.suppressive || flag.part === "spent") continue;
    for (const cell of flag.cells ?? []) cells.add(cell);
  }
  return cells;
}

/**
 * Turns suppressive fire that missed into fire that strikes, once a pool point turns its roll into a
 * hit: the grey cone gives way to the red and yellow one.
 * @param {Object} context - The roll card's context, as the poolResult hook hands it on
 * @param {Number} newResult - The result after the spend
 * @returns {Promise<Object[]|null>} The new Regions, or null when nothing changes
 */
export async function reviveSuppression(context, newResult) {
  const attack = context?.targetedAttack;
  if (!attack?.suppressive || !isHit(newResult)) return null;
  const spent = Array.from(canvas.scene?.regions ?? []).find(region => region.getFlag?.("eclipsephase", "area")?.attackId === attack.id && region.getFlag("eclipsephase", "area").part === "spent");
  if (!spent) return null;
  const flag = spent.getFlag("eclipsephase", "area");
  await clearAreas(other => other.attackId === attack.id, canvas.scene);
  const actor = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
  return laySuppression({ kind: flag.kind, origin: flag.origin, radius: flag.radius, angle: flag.angle, rotation: flag.rotation }, { attackId: attack.id, messageId: flag.messageId, actorUuid: attack.actorUuid, actorName: actor?.name ?? "", spent: false });
}

/**
 * Makes someone in suppressive fire's cone defend against its roll (Core p.207): once per burst,
 * when the roll hit, never the shooter. They join the attack card's targets and get a defence card;
 * a hit deals a single shot's damage. Behind a wall they may stay in cover instead of dodging, and
 * only the GM sees the cards of someone no player owns; in the open, only someone already there when
 * their turn begins may move into cover. Someone whose card from behind a wall is still open who then steps into the open
 * gets the open card in its place.
 * @param {ChatMessage} card - The suppressive fire's roll card
 * @param {Actor} actor - Who is in the cone
 * @param {Object} [options] - onTurn: their turn begins in the cone; hidden: they stand in its part
 *   behind walls
 * @returns {Promise<ChatMessage[]|null>} The defence cards, or null when nothing is due
 */
export function strikeUnderSuppression(card, actor, { onTurn = false, hidden = false } = {}) {
  return inOrder(`suppress:${card?.id}`, async () => {
    const context = card?.getFlag?.("eclipsephase", "roll");
    const attack = context?.targetedAttack;
    if (!attack?.suppressive || !actor || actor.uuid === attack.actorUuid) return null;
    if (!isHit(spentOrOriginalResult(context))) return null;
    const known = (card.getFlag("eclipsephase", "taskCard")?.targets ?? []).find(target => target.uuid === actor.uuid);
    if (known && !(known.shadow && !hidden && !known.outcome)) return null;
    const secret = hidden && !actor.hasPlayerOwner;
    if (known) {
      await game.messages.get(known.defenceMessageId)?.delete();
      await updateCard(card, "taskCard", "updateTarget", { uuid: actor.uuid, shadow: false, hidden: false });
    }
    else await updateCard(card, "taskCard", "addTarget", { uuid: actor.uuid, name: actor.name, hidden: secret });
    if (!known) await updateCard(card, "taskCard", "updateTarget", { uuid: actor.uuid, shadow: hidden });
    const coverOption = hidden ? "remain" : onTurn ? "moved" : false;
    const cards = await postDefenceCards({ ...attack, delivered: true, roll: attackRoll(card), messageId: card.id, coverOption }, [actor], { gmOnly: secret });
    await updateCard(card, "taskCard", "updateTarget", { uuid: actor.uuid, defenceMessageId: cards[0]?.id ?? null });
    return cards;
  });
}

/**
 * Whether a token stands in an area's open part rather than behind walls, by its centre: a token
 * touching both parts - such as one in a narrow strip behind a wall - counts where its centre is.
 * A token that is moving is looked at where its move ends - the token itself still stands where it
 * started when Foundry reports the move.
 * @param {Object} flag - The area flag of either part, with attackId and part
 * @param {Object} token - The token, or the position it moves to: x, y, width and height in squares, elevation
 * @param {Scene} scene - Its scene
 * @returns {Boolean} True in the open part
 */
export function inOpenPart(flag, token, scene) {
  const open = Array.from(scene?.regions ?? []).find(region => {
    const other = region.getFlag?.("eclipsephase", "area");
    return other?.attackId === flag?.attackId && other?.part === "open";
  });
  if (!open) return flag?.part !== "shadow";
  const size = Number(scene?.grid?.size) || 100;
  const centre = { x: token.x + (token.width ?? 1) * size / 2, y: token.y + (token.height ?? 1) * size / 2 };
  return open.testPoint({ x: centre.x, y: centre.y, elevation: token.elevation ?? 0 });
}

/**
 * Gives a token whose turn begins inside suppressive fire's cones a defence card for each, with the
 * choice to take cover - for the GM's eyes only when it stands behind a wall and no player owns it.
 * Its centre decides which part it stands in.
 * @param {TokenDocument} token - The token whose turn begins
 * @param {Scene} scene - Its scene
 * @returns {Promise<void>} Resolves once the cards are posted
 */
export async function suppressOnTurn(token, scene) {
  const actor = token?.actor;
  if (!actor) return;
  const handled = new Set();
  for (const region of Array.from(scene?.regions ?? [])) {
    const flag = region.getFlag?.("eclipsephase", "area");
    if (!flag?.suppressive || handled.has(flag.attackId) || !region.tokens?.has?.(token)) continue;
    handled.add(flag.attackId);
    const card = game.messages.get(flag.messageId);
    if (card) await strikeUnderSuppression(card, actor, { onTurn: true, hidden: !inOpenPart(flag, token, scene) });
  }
}

/**
 * Ends every suppressive fire and clears every blast on a combat's scene when the combat ends: they
 * only last until their attacker's next turn, and without a combat no turn comes. Done on the
 * active GM's client.
 * @param {Combat} combat - The combat that ended
 * @returns {Promise<Number>} How many Regions were removed
 */
export function endSuppression(combat) {
  if (!game.user.isActiveGM) return Promise.resolve(0);
  return clearAreas(flag => flag.suppressive === true || flag.blast === true, combat?.scene ?? canvas?.scene);
}

/**
 * Registers what suppressive fire needs in the scene: its Region behavior, which acts on the active
 * GM's client, the end of its cone when the shooter's next turn begins or the combat ends, and a
 * defence card for whoever stands in a cone when their turn begins. A blast's area goes at the
 * same time.
 * @returns {void}
 */
export function registerSuppressiveFire() {
  const Base = foundry.data.regionBehaviors.RegionBehaviorType;
  class SuppressiveFireBehaviorType extends Base {
    static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.suppressive", "BEHAVIOR.TYPES.base"];

    /**
     * The roll card the behavior answers to.
     * @returns {Object} The schema
     */
    static defineSchema() {
      return { messageId: new foundry.data.fields.StringField({ required: true, blank: true }) };
    }

    /**
     * Sends a token that moved in the cone to its defence.
     * @param {Object} event - The Region event
     * @returns {Promise<void>} Resolves once noted
     */
    static async onMove(event) {
      if (!game.user.isActiveGM) return;
      const card = game.messages.get(this.messageId);
      const token = event.data?.token;
      const position = event.data?.movement?.destination ?? token;
      if (card && token?.actor) await strikeUnderSuppression(card, token.actor, { hidden: !inOpenPart(this.region?.getFlag?.("eclipsephase", "area"), position, this.region?.parent) });
    }

    static events = {
      [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: SuppressiveFireBehaviorType.onMove,
      [CONST.REGION_EVENTS.TOKEN_MOVE_WITHIN]: SuppressiveFireBehaviorType.onMove
    };
  }
  CONFIG.RegionBehavior.dataModels[SUPPRESSIVE_BEHAVIOR] = SuppressiveFireBehaviorType;
  CONFIG.RegionBehavior.typeIcons[SUPPRESSIVE_BEHAVIOR] = "fa-solid fa-person-rifle";
  Hooks.on("eclipsephase.poolResult", ({ context, newResult }) => reviveSuppression(context, newResult));
  Hooks.on("deleteCombat", combat => endSuppression(combat));
  Hooks.on("combatTurnChange", async combat => {
    const actor = combat?.combatant?.actor;
    if (!game.user.isActiveGM || !actor) return;
    const scene = combat.scene ?? canvas?.scene;
    await clearAreas(flag => (flag.suppressive === true || flag.blast === true) && flag.actorUuid === actor.uuid, scene);
    await suppressOnTurn(combat.combatant.token, scene);
  });
}

/**
 * The cone suppressive fire covers, placed from the shooter's token: as long as the shooter chooses
 * and 20 metres across at its end (Core p.207). Nobody is picked, the roll comes at once - its
 * length counts as the range - and whoever moves in the cone later has to defend.
 * @param {Object} rollContext - The roll context
 * @returns {Function} area(form)
 */
function suppressiveArea(rollContext) {
  return form => {
    const from = attackerToken(rollContext.actor);
    if (!from || form?.elements?.attackMode?.value !== "suppressive") return null;
    return { kind: "cone", radius: SUPPRESSIVE_WIDTH, width: SUPPRESSIVE_WIDTH, from, max: 0 };
  };
}

/**
 * The blast a grenade is thrown to make, placed at the cursor before the roll: as wide as the throw
 * dialog dials it, the throw's distance measured from the thrower's token to its centre. Nobody is
 * picked - whoever stands in it once it goes off has to defend.
 * @param {Object} rollContext - The roll context
 * @returns {Function} area(form)
 */
function blastArea(rollContext) {
  const range = weaponRange(rollContext.weapon);
  const traits = rollContext.weapon?.weaponTraits?.automatedEffects ?? {};
  return form => {
    const reach = blastReach(rollContext.weapon?.blast, { radius: form?.elements?.blastRadius?.value, reduction: form?.elements?.blastReduction?.value });
    if (!(reach.radius > 0)) return null;
    const from = attackerToken(rollContext.actor);
    return {
      kind: "circle", radius: reach.radius, max: 0, from,
      measure: from ? { from, describe: distance => distanceText(distance, rangeBand(distance, range, traits)) } : null,
      distance: area => (from ? pointGap(from, area.origin, canvas.grid) : null)
    };
  };
}

/**
 * Where a token stands in a blast. On a square or hex grid it counts by the cells it stands on, as
 * the blast is drawn: a cell is in the blast when its centre is, so a token beside the blast is not;
 * elsewhere its centre counts.
 * @param {Object} token - The token, with bounds in pixels
 * @param {Object} area - The blast: origin, radius and the wall-cut polygon
 * @param {Object} grid - The scene's grid
 * @returns {Object|null} distance from the centre in metres, nearEdge (within a metre of the edge)
 *   and shadow (behind a wall from the centre), or null when it is not in the blast
 */
export function blastPosition(token, area, grid) {
  const { x, y, width, height } = token.bounds;
  let centre = { x: x + width / 2, y: y + height / 2 };
  let squares = [centre];
  if (hasCells(grid)) {
    const occupied = token.document?.getOccupiedGridSpaceOffsets?.() ?? [];
    const points = [];
    if (!occupied.length && grid.isSquare) {
      for (let py = y + grid.size / 2; py < y + height; py += grid.size) {
        for (let px = x + grid.size / 2; px < x + width; px += grid.size) points.push({ x: px, y: py });
      }
    }
    squares = occupied.length ? occupied.map(offset => grid.getCenterPoint(offset)) : (points.length ? points : [centre]).map(point => grid.getCenterPoint(grid.getOffset(point)));
    centre = grid.getCenterPoint(grid.getOffset(centre));
  }
  const inside = squares.filter(point => shapeContains(area, point));
  if (!inside.length) return null;
  const distance = Math.min(...inside.map(point => Math.hypot(point.x - area.origin.x, point.y - area.origin.y))) / unitsToPixels(1);
  const shadow = area.polygon ? !area.polygon.contains(centre.x, centre.y) : false;
  return { distance, nearEdge: area.radius - distance <= 1, shadow };
}

// How long a blast that caught nobody stays in sight before it goes, in milliseconds.
const BLAST_LINGER = 3000;

/**
 * Clears a blast's area once it has done its work. A blast that leaves something behind, such as
 * smoke or a gas cloud, stays.
 * @param {Object} attack - The attack, with id and blast
 * @param {Number} [delay] - How long to wait first, in milliseconds
 * @returns {Promise<Number>} How many Regions were removed
 */
export async function clearBlast(attack, delay = 0) {
  if (!attack?.blast || attack.blast.lingers) return 0;
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  return clearAreas(flag => flag.attackId === attack.id && flag.blast === true);
}

/**
 * Who a blast catches: every actor with a token in it, each counted once where it stands nearest the
 * centre. Someone behind a wall from the centre, or whose token is hidden, whom no player owns is the
 * GM's to see alone.
 * @param {Object} area - The blast: origin, radius and the wall-cut polygon
 * @param {Object[]} tokens - The canvas tokens
 * @param {Object} [grid] - The scene's grid
 * @returns {Object[]} actor, distance, nearEdge, shadow and secret each
 */
export function blastTargets(area, tokens, grid = canvas.grid) {
  const caught = new Map();
  for (const token of tokens) {
    const actor = token.actor;
    const position = actor ? blastPosition(token, area, grid) : null;
    if (!position) continue;
    const known = caught.get(actor.uuid);
    if (known && known.distance <= position.distance) continue;
    caught.set(actor.uuid, { actor, ...position, secret: (position.shadow || token.document?.hidden === true) && !actor.hasPlayerOwner });
  }
  return Array.from(caught.values());
}

/**
 * Sets a thrown grenade or a fired seeker off where it was placed, once its attack card shows a hit -
 * straight after the roll, or when a pool point turns a miss into one. One set to go off later
 * scatters even on a hit (Core p.212), as does one that missed: its card offers the scatter instead.
 * @param {ChatMessage} message - The attack card
 * @returns {Promise<Object[]|null>} Who was caught, or null when nothing went off
 */
export function detonateBlast(message) {
  return inOrder(`blast:${message?.id}`, async () => {
    const context = message?.getFlag?.("eclipsephase", "roll");
    const attack = context?.targetedAttack;
    const blast = attack?.blast;
    if (!blast?.origin || attack.delivered || attack.armed || blast.delayed || !isHit(spentOrOriginalResult(context))) return null;
    const attacker = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
    if (attacker && !attacker.isOwner) return null;
    return setOffBlast(message, attack, blast.origin);
  });
}

/**
 * Sets a blast off at a point: its area is left in the scene, red in the open and yellow behind
 * walls, and everyone in it defends - halved Fray, a dodge clearing them only at the blast's edge or
 * in cover (Core p.218). A thrower caught in their own blast is warned and defends like anyone else.
 * A blast that scattered leaves the area it was aimed at in grey.
 * @param {ChatMessage} message - The attack card
 * @param {Object} attack - The attack
 * @param {Object} origin - Where it goes off, in canvas coordinates
 * @param {Object} [scatter] - How it scattered: direction, degrees, distance, blocked
 * @returns {Promise<Object[]>} Who was caught
 */
async function setOffBlast(message, attack, origin, scatter = null) {
  const blast = attack.blast;
  const area = { kind: "circle", origin, radius: blast.radius, angle: 360, rotation: 0 };
  area.polygon = areaPolygon(area.origin, area);
  const name = game.i18n.format("ep2e.chat.attack.blastArea", { name: attack.weaponName });
  const flags = { attackId: attack.id, messageId: message.id, actorUuid: attack.actorUuid, blast: true };
  await createShadowedArea(area, { name, flags });
  if (scatter) {
    const aimed = { kind: "circle", origin: blast.origin, radius: blast.radius, angle: 360, rotation: 0 };
    aimed.polygon = areaPolygon(aimed.origin, aimed);
    await createShadowedArea(aimed, { name, flags, spent: true, exclude: coveredSquares(area) });
  }
  const caught = blast.harmless && !attack.dose ? [] : blastTargets(area, canvas.tokens?.placeables ?? []);
  if (!caught.length) clearBlast(attack, BLAST_LINGER);
  const own = caught.find(entry => entry.actor.uuid === attack.actorUuid);
  if (own) ui.notifications.warn(game.i18n.format("ep2e.targeting.ownBlast", { name: own.actor.name }));
  const names = caught.map(entry => entry.actor.name);
  const roll = attackRoll(message);
  const delivered = { "flags.eclipsephase.roll.targetedAttack.delivered": true, "flags.eclipsephase.roll.targetedAttack.targetNames": names, "flags.eclipsephase.roll.targetedAttack.roll": roll, ...(scatter ? { "flags.eclipsephase.roll.targetedAttack.scatter": scatter } : {}) };
  await updateCard(message, "taskCard", "blastTargets", { targets: caught.map(entry => ({ uuid: entry.actor.uuid, name: entry.actor.name, hidden: entry.secret, shadow: entry.shadow, distance: entry.distance })), scatter }, { extra: delivered });
  const sent = { ...attack, delivered: true, targetNames: names, roll, messageId: message.id, ...(scatter ? { scatter } : {}) };
  const details = new Map(caught.map(entry => [entry.actor.uuid, { distance: entry.distance, nearEdge: entry.nearEdge, shadow: entry.shadow }]));
  const open = caught.filter(entry => !entry.secret).map(entry => entry.actor);
  const secret = caught.filter(entry => entry.secret).map(entry => entry.actor);
  if (open.length) await postDefenceCards(sent, open, { details });
  if (secret.length) await postDefenceCards(sent, secret, { gmOnly: true, details });
  return caught;
}

/**
 * The grid squares an area covers, open or behind walls, so that another area can leave them out.
 * @param {Object} area - kind, origin, radius and the wall-cut polygon
 * @returns {Set<String>} The squares, as "i,j"; none on a scene without squares
 */
function coveredSquares(area) {
  const grid = canvas.grid;
  if (!hasCells(grid)) return new Set();
  const { open, shadow } = areaSquares(area, grid);
  return new Set([...open, ...shadow].map(({ i, j }) => `${i},${j}`));
}

/**
 * How many superior failures a failed roll has: one at 66 or less, two at 33 or less.
 * @param {Number} value - The die
 * @returns {Number} 0, 1 or 2
 */
export function superiorFailures(value) {
  const die = Number(value) || 0;
  if (die >= 99) return 0;
  return die <= 33 ? 2 : die <= 66 ? 1 : 0;
}

/**
 * Where a blast scatters to (Core p.218), from the d100 and d10 rolled for it: the d100 turns it 3.6
 * degrees a point clockwise from the line of the throw - 00 straight on beyond the aim, 25 to its
 * right, 50 back towards the thrower, 75 to its left - and the d10 is how many metres, doubled for
 * each superior failure.
 * @param {Number} direction - The d100, 1 to 100
 * @param {Number} metres - The d10
 * @param {Number} superior - Superior failures
 * @param {Number} bearing - The line of the throw, in radians, 0 pointing right
 * @returns {Object} angle in radians, degrees off the line of the throw, and distance in metres
 */
export function scatterOffset(direction, metres, superior, bearing) {
  const degrees = (Number(direction) % 100) * 3.6;
  return { angle: bearing + degrees * Math.PI / 180, degrees: Math.round(degrees * 10) / 10, distance: (Number(metres) || 0) * 2 ** superior };
}

/**
 * Rolls the d100 and the d10 a scatter needs, shown as dice where the table shows them.
 * @returns {Promise<Object>} direction and metres
 */
async function rollScatterDice() {
  const roll = await new Roll("1d100 + 1d10").evaluate();
  await game.dice3d?.showForRoll?.(roll, game.user, true);
  const [direction, metres] = roll.dice.map(die => die.total);
  return { direction, metres };
}

/**
 * Scatters a blast that missed, or that was set to go off later, from its card (Core p.218): it
 * comes down where the d100 and d10 send it - short of the first wall in the way - and goes off
 * there; the area it was aimed at is left in grey. Pool points can no longer change the roll then.
 * @param {ChatMessage} message - The attack card
 * @param {Object} [seams] - rollDice, replaced in tests
 * @returns {Promise<Object[]|null>} Who was caught, or null when nothing scattered
 */
export function scatterBlast(message, { rollDice = rollScatterDice } = {}) {
  return inOrder(`blast:${message?.id}`, async () => {
    const context = message?.getFlag?.("eclipsephase", "roll");
    const attack = context?.targetedAttack;
    const blast = attack?.blast;
    if (!blast?.origin || attack.delivered || attack.armed) return null;
    const hit = isHit(spentOrOriginalResult(context));
    if (hit && !blast.delayed) return null;
    const attacker = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
    if (attacker && !attacker.isOwner) return null;
    const { direction, metres } = await rollDice();
    const from = blast.from ?? attackerToken(attacker)?.center ?? null;
    const bearing = from && (from.x !== blast.origin.x || from.y !== blast.origin.y) ? Math.atan2(blast.origin.y - from.y, blast.origin.x - from.x) : -Math.PI / 2;
    const offset = scatterOffset(direction, metres, hit ? 0 : superiorFailures(attackRoll(message).value), bearing);
    const landing = scatterPoint(blast.origin, offset.angle, unitsToPixels(offset.distance));
    const scatter = { direction, degrees: offset.degrees, distance: offset.distance, blocked: landing.blocked };
    return blast.delayed ? armBlast(message, attack, landing.point, scatter) : setOffBlast(message, attack, landing.point, scatter);
  });
}

// The Region behavior a proximity trigger leaves: whoever moves within its reach sets the blast off.
export const PROXIMITY_BEHAVIOR = "proximity";

// A proximity sensor's colour while it is still arming; once live it shows in the target colour.
const ARMING_COLOR = "#99fbf4";

/**
 * The users who own an actor, for something lying in the scene that only they and the GMs see.
 * @param {Actor|null} actor - The actor
 * @returns {String[]} Their user ids
 */
function ownerIds(actor) {
  return Array.from(game.users ?? []).filter(user => !user.isGM && actor?.testUserPermission?.(user, "OWNER")).map(user => user.id);
}

/**
 * Who sees an explosive an actor left lying armed: its owners and the GMs, and everyone else as the
 * world's "Show Traps" setting allows - the traps of all, of player characters only, or of none.
 * @param {Actor|null} actor - Who left it
 * @returns {Object} The Region ownership
 */
export function trapOwnership(actor) {
  const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const ownership = { default: levels.NONE };
  for (const id of ownerIds(actor)) ownership[id] = levels.OWNER;
  const show = game.settings.get("eclipsephase", "showTraps");
  if (show === "all" || (show === "players" && actor?.hasPlayerOwner)) ownership.default = levels.OBSERVER;
  return ownership;
}

/**
 * Brings every armed explosive in the world in line with the "Show Traps" setting. Done by the
 * active GM.
 * @returns {Promise<void>} Resolves once updated
 */
export async function applyTrapVisibility() {
  if (!game.user.isActiveGM) return;
  for (const scene of Array.from(game.scenes ?? [])) {
    const updates = Array.from(scene.regions ?? []).filter(region => region.getFlag?.("eclipsephase", AREA_FLAG)?.armed)
      .map(region => ({ _id: region.id, ownership: trapOwnership(fromUuidSync(region.getFlag("eclipsephase", AREA_FLAG).actorUuid)) }));
    if (updates.length) await scene.updateEmbeddedDocuments("Region", updates);
  }
}

/**
 * The combat running on the viewed scene, if it has begun.
 * @returns {Combat|null} The combat
 */
function sceneCombat() {
  const combat = game.combat;
  if (!combat?.started) return null;
  return !combat.scene || combat.scene.id === canvas.scene?.id ? combat : null;
}

/**
 * Leaves a blast with a delayed trigger lying where it came down, armed (Core p.212): a mark on its
 * square that only its thrower's owners and the GMs see, and for a proximity trigger the reach of its
 * sensor, pale until it is live three action turns later. A timer counts down in the combat's rounds,
 * to the end of the thrower's turn, or on the world clock outside combat; a signal waits for its
 * owner. The blast itself appears only when it goes off.
 * @param {ChatMessage} message - The attack card
 * @param {Object} attack - The attack
 * @param {Object} landing - Where it came down, in canvas coordinates; on a grid it lies in the
 *   middle of that cell
 * @param {Object} [scatter] - How it scattered on its way there
 * @returns {Promise<null>} Resolves once it lies armed
 */
async function armBlast(message, attack, landing, scatter = null) {
  const blast = attack.blast;
  const point = cellCentre(landing);
  const actor = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
  const combat = sceneCombat();
  const now = Number(game.time?.worldTime) || 0;
  const turn = Number(CONFIG.time?.roundTime) || 3;
  const due = blast.trigger === "timer"
    ? (combat ? { combatId: combat.id, round: combat.round + blast.timer.rounds } : { at: now + blast.timer.seconds })
    : blast.trigger === "proximity"
      ? (combat ? { combatId: combat.id, round: combat.round + PROXIMITY_ARMING } : { at: now + PROXIMITY_ARMING * turn })
      : {};
  const armed = { point, sceneId: canvas.scene?.id ?? null, trigger: blast.trigger, sensor: blast.sensor ?? null, timer: blast.timer ?? null, ...due };
  const name = attack.weaponName;
  const flags = { attackId: attack.id, messageId: message.id, actorUuid: attack.actorUuid, armed: true, trigger: blast.trigger, point, ...due };
  const ownership = trapOwnership(actor);
  await createPrivateArea(spotShapes(point), { name, flags: { ...flags, part: "marker" }, ownership });
  if (blast.trigger === "proximity") {
    await createPrivateArea(wholeShapes({ kind: "circle", origin: point, radius: blast.sensor }), {
      name, color: ARMING_COLOR, ownership,
      flags: { ...flags, part: "sensor", live: false },
      behaviors: [{ type: PROXIMITY_BEHAVIOR, name, system: { messageId: message.id } }]
    });
  }
  const extra = { "flags.eclipsephase.roll.targetedAttack.armed": armed, ...(scatter ? { "flags.eclipsephase.roll.targetedAttack.scatter": scatter } : {}) };
  await updateCard(message, "taskCard", "armed", { armed: { ...armed, actorName: actor?.name ?? "" }, scatter }, { extra });
  return null;
}

/**
 * Sets an armed blast off where it lies - by its timer or its sensor, or by whoever owns it, or the
 * GM, choosing to. Its scene has to be the one in view.
 * @param {ChatMessage} message - The attack card
 * @returns {Promise<Object[]|null>} Who was caught, or null when nothing went off
 */
export function detonateArmed(message) {
  return inOrder(`blast:${message?.id}`, async () => {
    const attack = message?.getFlag?.("eclipsephase", "roll")?.targetedAttack;
    if (!attack?.armed || attack.delivered || attack.defused) return null;
    const attacker = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
    if (!game.user.isGM && !attacker?.isOwner) return null;
    if (attack.armed.sceneId && canvas.scene?.id !== attack.armed.sceneId) {
      ui.notifications.warn(game.i18n.localize("ep2e.targeting.armedElsewhere"));
      return null;
    }
    await clearAreas(flag => flag.attackId === attack.id && flag.armed === true);
    return setOffBlast(message, attack, attack.armed.point, attack.scatter ?? null);
  });
}

/**
 * Takes an armed blast away without it going off: defused, picked up, or simply never set off.
 * @param {ChatMessage} message - The attack card
 * @returns {Promise<Boolean>} True once it is gone
 */
export function defuseArmed(message) {
  return inOrder(`blast:${message?.id}`, async () => {
    const attack = message?.getFlag?.("eclipsephase", "roll")?.targetedAttack;
    if (!attack?.armed || attack.delivered || attack.defused) return false;
    const attacker = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
    if (!game.user.isGM && !attacker?.isOwner) return false;
    const scene = game.scenes?.get?.(attack.armed.sceneId) ?? canvas.scene;
    await clearAreas(flag => flag.attackId === attack.id && flag.armed === true, scene);
    await updateCard(message, "taskCard", "defused", {}, { extra: { "flags.eclipsephase.roll.targetedAttack.defused": true } });
    return true;
  });
}

/**
 * The explosives an actor has lying armed, on any scene.
 * @param {Actor} actor - The actor
 * @param {Object[]} [scenes] - The scenes to look in, all by default
 * @returns {Object[]} messageId, name, place (trigger and scene, as words) and here (on the viewed
 *   scene) of each
 */
export function armedExplosives(actor, scenes = Array.from(game.scenes ?? [])) {
  if (!actor) return [];
  const found = [];
  for (const scene of scenes) {
    for (const region of Array.from(scene.regions ?? [])) {
      const flag = region.getFlag?.("eclipsephase", AREA_FLAG);
      if (!flag?.armed || flag.part !== "marker" || flag.actorUuid !== actor.uuid) continue;
      const trigger = game.i18n.localize(`ep2e.item.weapon.table.trigger.${flag.trigger}`);
      found.push({ messageId: flag.messageId, name: region.name, place: game.i18n.format("ep2e.sideCar.armed.place", { trigger, scene: scene.name }), here: scene.id === globalThis.canvas?.scene?.id });
    }
  }
  return found;
}

/**
 * Opens the sheet of an armed explosive: the grenade itself while its thrower still has it, else a
 * copy of it as it was thrown; for a seeker, its launcher.
 * @param {ChatMessage} message - The attack card
 * @returns {Object|null} The sheet, or null when there is nothing to show
 */
export function openArmedItem(message) {
  const context = message?.getFlag?.("eclipsephase", "roll");
  const actor = context?.actorUuid ? fromUuidSync(context.actorUuid) : null;
  const owned = actor?.items?.get?.(context?.item?.weaponId);
  const item = owned ?? (context?.targetedAttack?.thrown?.item ? new CONFIG.Item.documentClass(context.targetedAttack.thrown.item) : null);
  return item?.sheet?.render(true) ?? null;
}

/**
 * Moves the view to an armed explosive lying on the viewed scene, with the open sheets minimised so
 * that it can be seen.
 * @param {ChatMessage} message - The attack card
 * @returns {Promise<Boolean>} True once panned, false for one on another scene
 */
export async function panToArmed(message) {
  const armed = message?.getFlag?.("eclipsephase", "roll")?.targetedAttack?.armed;
  if (!armed?.point || armed.sceneId !== canvas.scene?.id) return false;
  sheetsAside();
  await canvas.animatePan({ x: armed.point.x, y: armed.point.y });
  return true;
}

// The icon an armed explosive shows over its mark, by trigger; a proximity trigger shows the clock until it is live.
const ARMED_ICONS = { timer: "fa-clock", signal: "fa-tower-broadcast", proximity: "fa-satellite-dish" };

/**
 * How long until something an armed explosive waits for: in a combat the turns left, outside it the
 * seconds or minutes on the world clock.
 * @param {Object} flag - The mark's area flag, with combatId and round, or at
 * @param {Combat|null} combat - The combat on the scene
 * @param {Boolean} [short] - The number alone with its unit's letter, as shown beside the icon
 * @returns {String} The words
 */
export function armedCountdown(flag, combat, short = false) {
  if (flag.combatId) {
    const turns = Math.max(0, flag.round - (Number(combat?.round) || 0));
    return short ? `${turns}` : game.i18n.format("ep2e.chat.attack.countdownTurns", { count: turns });
  }
  const seconds = Math.max(0, Math.ceil((Number(flag.at) || 0) - (Number(game.time?.worldTime) || 0)));
  if (seconds >= 120) return short ? `${Math.ceil(seconds / 60)}m` : game.i18n.format("ep2e.chat.attack.countdownMinutes", { count: Math.ceil(seconds / 60) });
  return short ? `${seconds}s` : game.i18n.format("ep2e.chat.attack.countdownSeconds", { count: seconds });
}

/**
 * The icon over an armed explosive's mark and what hovering it tells: whose it is - "(You)" for a
 * player's own - and for a timer or a proximity sensor still arming, how long until then, which also
 * stands as a number beside the icon.
 * @param {Object} flag - The mark's area flag
 * @param {Object|null} sensor - The flag of its proximity sensor
 * @param {Combat|null} combat - The combat on the scene
 * @returns {Object} icon, text, and count for a countdown
 */
export function armedIcon(flag, sensor, combat) {
  const actor = flag.actorUuid ? fromUuidSync(flag.actorUuid) : null;
  const own = !game.user.isGM && actor?.isOwner;
  const owner = own ? game.i18n.format("ep2e.chat.attack.armedYours", { name: actor?.name ?? "" }) : actor?.name ?? "";
  if (flag.trigger === "signal") return { icon: ARMED_ICONS.signal, text: game.i18n.format("ep2e.chat.attack.armedBy", { name: owner }) };
  if (flag.trigger === "proximity" && sensor?.live) return { icon: ARMED_ICONS.proximity, text: game.i18n.format("ep2e.chat.attack.armedLive", { name: owner }) };
  const timing = flag.trigger === "proximity" && sensor ? sensor : flag;
  const key = flag.trigger === "proximity" ? "ep2e.chat.attack.armedArming" : "ep2e.chat.attack.armedTimer";
  return { icon: ARMED_ICONS.timer, text: game.i18n.format(key, { name: owner, time: armedCountdown(timing, combat) }), count: armedCountdown(timing, combat, true) };
}

let armedLayer = null;
let mapTip = null;

/**
 * Shows a short text beside the pointer on the canvas, centred above it.
 * @param {Object} event - The pointer event, with clientX and clientY
 * @param {String} text - The text
 * @returns {void}
 */
function showMapTip(event, text) {
  mapTip?.remove();
  mapTip = document.createElement("div");
  mapTip.className = "ep-map-tip";
  mapTip.textContent = text;
  mapTip.style.left = `${event.clientX}px`;
  mapTip.style.top = `${event.clientY - 10}px`;
  document.body.append(mapTip);
}

/**
 * Removes the text shown beside the pointer.
 * @returns {void}
 */
function hideMapTip() {
  mapTip?.remove();
  mapTip = null;
}

/**
 * Draws an icon above every armed explosive's mark this user may see on the viewed scene - a clock
 * with the turns or time left for a timer or a sensor still arming, a remote for a signal, a sensor
 * once live - and tells on hover whose it is and how long until it goes off or is live.
 * @returns {void}
 */
export function drawArmedIcons() {
  hideMapTip();
  armedLayer?.destroy({ children: true });
  armedLayer = null;
  if (!globalThis.canvas?.ready || !globalThis.PIXI || !canvas.controls) return;
  armedLayer = new PIXI.Container();
  armedLayer.eventMode = "passive";
  canvas.controls.addChild(armedLayer);
  const combat = sceneCombat();
  const sensors = new Map(armedOnScene("sensor").map(({ flag }) => [flag.attackId, flag]));
  const size = (Number(canvas.grid?.size) || 100) * 0.6;
  for (const { region, flag } of armedOnScene("marker")) {
    if (region.object && !region.object.isVisible) continue;
    const shown = armedIcon(flag, sensors.get(flag.attackId) ?? null, combat);
    if (!shown || !flag.point) continue;
    const above = { x: flag.point.x, y: spotTop(flag.point) - size / 2 };
    const sprite = PIXI.Sprite.from(iconImage(shown.icon, TARGET_COLOR));
    sprite.anchor.set(0.5);
    sprite.width = size;
    sprite.height = size;
    sprite.position.set(above.x, above.y);
    sprite.eventMode = "static";
    sprite.cursor = "help";
    sprite.on("pointerover", event => showMapTip(event, armedIcon(flag, sensors.get(flag.attackId) ?? null, sceneCombat()).text));
    sprite.on("pointerout", hideMapTip);
    armedLayer.addChild(sprite);
    if (!shown.count) continue;
    const count = new PIXI.Text(shown.count, { fontFamily: "Signika, sans-serif", fontSize: size * 0.5, fontWeight: "bold", fill: 0xffffff, stroke: 0x000000, strokeThickness: 4 });
    count.anchor.set(0, 0.5);
    count.position.set(above.x + size / 2 + 4, above.y);
    armedLayer.addChild(count);
  }
}

/**
 * The armed explosives on the viewed scene of one part, each with its Region and area flag.
 * @param {String} part - "marker" or "sensor"
 * @returns {Object[]} region and flag of each
 */
function armedOnScene(part) {
  return Array.from(canvas.scene?.regions ?? []).map(region => ({ region, flag: region.getFlag?.("eclipsephase", AREA_FLAG) })).filter(({ flag }) => flag?.armed && flag.part === part);
}

/**
 * Sets off the timers that are due and brings the proximity sensors that are ready live, on the
 * viewed scene: in a combat once its round comes - a timer at the end of its thrower's turn in that
 * round - and outside combat on the world clock. Done on the active GM's client.
 * @param {Object} [moment] - combat, and prior ({ round, combatantId }), the turn that just ended
 * @returns {Promise<void>} Resolves once done
 */
export async function tickArmed({ combat = null, prior = null } = {}) {
  if (!game.user.isActiveGM) return;
  const now = Number(game.time?.worldTime) || 0;
  const reached = flag => {
    if (flag.combatId) {
      if (!combat || combat.id !== flag.combatId) return false;
      if (flag.part === "sensor") return combat.round >= flag.round;
      const ended = combat.combatants?.get?.(prior?.combatantId)?.actor?.uuid;
      const throwerFights = Array.from(combat.combatants ?? []).some(combatant => combatant.actor?.uuid === flag.actorUuid);
      return (prior?.round > flag.round) || (prior?.round === flag.round && ended === flag.actorUuid) || (!throwerFights && combat.round > flag.round);
    }
    return Number.isFinite(flag.at) && now >= flag.at;
  };
  for (const { region, flag } of armedOnScene("sensor")) {
    if (!flag.live && reached(flag)) await region.update({ color: TARGET_COLOR, [`flags.eclipsephase.${AREA_FLAG}.live`]: true });
  }
  for (const { flag } of armedOnScene("marker")) {
    if (flag.trigger !== "timer" || !reached(flag)) continue;
    const message = game.messages.get(flag.messageId);
    if (message) await detonateArmed(message);
  }
}

/**
 * Moves the armed explosives a combat counts down onto the world clock when the combat ends, so
 * their time still runs: what is left of their rounds, three seconds each.
 * @param {Combat} combat - The combat that ended
 * @returns {Promise<void>} Resolves once moved
 */
export async function armedAfterCombat(combat) {
  if (!game.user.isActiveGM) return;
  const now = Number(game.time?.worldTime) || 0;
  const turn = Number(CONFIG.time?.roundTime) || 3;
  for (const part of ["marker", "sensor"]) {
    for (const { region, flag } of armedOnScene(part)) {
      if (flag.combatId !== combat?.id) continue;
      const left = Math.max(0, flag.round - combat.round + 1);
      await region.update({ [`flags.eclipsephase.${AREA_FLAG}.combatId`]: null, [`flags.eclipsephase.${AREA_FLAG}.at`]: now + left * turn });
      const message = part === "marker" ? game.messages.get(flag.messageId) : null;
      const armed = message?.getFlag?.("eclipsephase", "taskCard")?.armed;
      if (armed) await updateCard(message, "taskCard", "armed", { armed: { ...armed, combatId: null, round: null, at: now + left * turn }, scatter: message.getFlag("eclipsephase", "taskCard").scatter ?? null });
    }
  }
}

/**
 * Registers what armed explosives need: the proximity sensor's Region behavior, which acts on the
 * active GM's client for a token moving within its reach once it is live; timers and sensors counting
 * down with the combat's turns and the world clock; and the sheets of their owners kept up to date.
 * @returns {void}
 */
export function registerArmedBlasts() {
  const Base = foundry.data.regionBehaviors.RegionBehaviorType;
  class ProximityTriggerBehaviorType extends Base {
    static LOCALIZATION_PREFIXES = ["BEHAVIOR.TYPES.proximity", "BEHAVIOR.TYPES.base"];

    /**
     * The attack card the sensor answers to.
     * @returns {Object} The schema
     */
    static defineSchema() {
      return { messageId: new foundry.data.fields.StringField({ required: true, blank: true }) };
    }

    /**
     * Sets the blast off once something moves within the live sensor's reach.
     * @param {Object} event - The Region event
     * @returns {Promise<void>} Resolves once done
     */
    static async onMove(event) {
      if (!game.user.isActiveGM || !this.region?.getFlag?.("eclipsephase", AREA_FLAG)?.live) return;
      const card = game.messages.get(this.messageId);
      if (card) await detonateArmed(card);
    }

    static events = {
      [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: ProximityTriggerBehaviorType.onMove,
      [CONST.REGION_EVENTS.TOKEN_MOVE_WITHIN]: ProximityTriggerBehaviorType.onMove
    };
  }
  CONFIG.RegionBehavior.dataModels[PROXIMITY_BEHAVIOR] = ProximityTriggerBehaviorType;
  CONFIG.RegionBehavior.typeIcons[PROXIMITY_BEHAVIOR] = "fa-solid fa-satellite-dish";
  Hooks.on("combatTurnChange", (combat, prior) => tickArmed({ combat, prior }));
  Hooks.on("updateWorldTime", () => tickArmed({ combat: sceneCombat() }));
  Hooks.on("canvasReady", () => tickArmed({ combat: sceneCombat() }));
  Hooks.on("deleteCombat", combat => armedAfterCombat(combat));
  const refreshOwner = region => {
    const flag = region.getFlag?.("eclipsephase", AREA_FLAG);
    if (!flag?.armed || flag.part !== "marker") return;
    const sheet = fromUuidSync(flag.actorUuid)?.sheet;
    if (sheet?.rendered) sheet.render();
  };
  Hooks.on("createRegion", refreshOwner);
  Hooks.on("deleteRegion", refreshOwner);
  const redraw = foundry.utils.debounce(drawArmedIcons, 50);
  for (const hook of ["canvasReady", "createRegion", "updateRegion", "deleteRegion", "updateWorldTime", "updateCombat", "deleteCombat"]) Hooks.on(hook, redraw);
}

/**
 * What a psi-gamma sleight measures while its targets are picked: the distance from the async's
 * token with its psi range category (Core p.276), doubled against asyncs and by the Increased Range
 * push.
 * @param {Object} rollContext - The roll context
 * @returns {Function} measure(form)
 */
function psiMeasuring(rollContext) {
  return form => {
    const origin = attackerToken(rollContext.actor);
    if (!origin) return null;
    const pushRange = pushesRange({ actor: rollContext.actor, options: { push: form?.elements?.push?.value } });
    return {
      from: origin,
      describe: (distance, token) => distanceText(distance, psiRangeBand(distance, { async: isAsync(token?.actor), pushRange }))
    };
  };
}

/**
 * How an attack dialog picks its targets, or null for a roll that is no attack: a roll with a
 * weapon, a psi-gamma sleight, or one that brings an attack of its own, such as a forced dose.
 * Ranged weapons and sleights measure the distance from the attacker's token while picking. An attack
 * that brings its targets already, such as a touch for a sleight, picks none.
 * @param {Object} rollContext - The roll context the dialog is shown for
 * @returns {Object|null} cursor; refuse, the picker's refusal of unsuitable targets; count(form), the targets the chosen options strike (Infinity
 *   for any number); minimum(form), the fewest a mode needs; refuseFor(form), the refusal as the dialog now stands - a touch
 *   reaches no farther than point-blank; measure(form) and applyMeasured(form, distances) where the attack is measured;
 *   allowed(form), for a cone, how many of the picked targets its measured range lets it strike (Core p.218);
 *   area(form) and label(form) for a grenade's blast, placed instead of picking targets
 */
export function attackPicking(rollContext) {
  const preset = rollContext?.flags?.targetedAttack;
  const weapon = rollContext?.weapon?.weapon ?? null;
  const rolledFrom = rollContext?.rolledFrom;
  if (!preset && gammaSleight(rollContext)) {
    const unsuitable = refuseUnsuitable(PSI_UNSUITABLE);
    return { cursor: PSI_CURSOR, refuse: unsuitable, refuseFor: form => form?.elements?.psiTouch?.checked ? refuseAny(unsuitable, refuseBeyondTouch(rollContext.actor)) : unsuitable, measure: psiMeasuring(rollContext), count: form => form?.elements?.push?.value === "target" && !form?.elements?.psiTouch?.checked ? 2 : 1, minimum: () => 1 };
  }
  if (!preset && !(weapon && (rolledFrom === "rangedWeapon" || rolledFrom === "ccWeapon" || rolledFrom === "grenade"))) return null;
  if (preset?.preTargets?.length) return null;
  const thrown = !preset && rolledFrom === "grenade";
  const blast = !preset && (thrown || rolledFrom === "rangedWeapon") && !!rollContext.weapon?.blast?.kind && rollContext.weapon.blast.kind !== "none";
  const ranged = !preset && (rolledFrom === "rangedWeapon" || thrown) ? rangedMeasuring(rollContext) : null;
  const refuse = refuseAny(refuseUnsuitable(preset?.unsuitable), ranged?.refuse);
  const area = blast ? blastArea(rollContext) : ranged && !thrown && !isConeWeapon(weapon) ? suppressiveArea(rollContext) : null;
  return {
    cursor: preset?.cursor ?? (rolledFrom === "ccWeapon" ? MELEE_CURSOR : {}),
    refuse,
    refuseFor: form => form?.elements?.touchOnly?.checked ? refuseAny(refuse, refuseBeyondTouch(rollContext.actor)) : refuse,
    ...(ranged ? { measure: ranged.measure, applyMeasured: ranged.applyMeasured } : {}),
    ...(area ? { area } : {}),
    ...(blast ? { label: () => "ep2e.roll.dialog.throw.place" } : {}),
    count: form => {
      if (preset) return preset.targets === ANY_TARGETS ? Infinity : preset.targets ?? 1;
      if (thrown) return 1;
      if (rolledFrom !== "rangedWeapon") return meleeTargets(form);
      if (isConeWeapon(weapon)) return CONE_MAX_TARGETS;
      const count = attackTargetCount(weapon, { attackMode: form?.elements?.attackMode?.value, range: form?.elements?.range?.value });
      return count === ANY_TARGETS ? Infinity : count;
    },
    ...(ranged && isConeWeapon(weapon) ? { allowed: form => attackTargetCount(weapon, { attackMode: form?.elements?.attackMode?.value, range: form?.elements?.range?.value }) } : {}),
    minimum: form => rolledFrom === "ccWeapon" && !preset ? meleeTargets(form) : minimumTargets(form?.elements?.attackMode?.value)
  };
}
