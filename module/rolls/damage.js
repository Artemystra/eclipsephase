import { weaponPreparation, grenadePreparation, blastReach, formulaMax, isDelayedTrigger, timerSpan, munitionDose, PROXIMITY_REACH, coneDamage, beyondRangeDamage, ATTACK_MODES, ANY_TARGETS, chemicalDoses, attackArmorUsed, attackTargetCount, isConeWeapon } from "../common/weapon-functions.js";
import { damageValueCalc, inheritChatVisibility, readRollContext, escapeText, isChecked } from "../common/general-sheet-functions.js";
import { WEAPON_DAMAGE_OUTPUT, DAMAGE_STATUS_OUTPUT, TASK_RESULT, rollToChat, isHit } from "./dice.js";
import { gammaAutoPushDamageMultiplier, GAMMA_PUSH_EFFECTS, detectSleightAttack } from "./psi.js";
import { damageFormula } from "./damage-formula.js";
import { registerAttackEffect, attackEffect, followUpVisibility, outcomeLabel, gmWhisper, clearBlast } from "./attacks.js";
import { MELEE_CURSOR } from "../common/targeting.js";
import { spentOrOriginalResult, damageReady } from "./cards.js";
import { registerCard, renderCard, updateCard, storable, inOrder } from "../common/chat-cards.js";
import { registerSocketActions, relayToActiveGM, runOrRelay } from "../common/socket.js";
export { applySuccessTierBonus } from "./damage-formula.js";

// Damage: what a weapon or sleight rolls, how it reaches an actor as damage or stress, and an
// attack's damage card, on which the active GM puts one roll on every target struck.

/**
 * Rolls and posts a weapon's damage from its attack card.
 * @param {Object} data - The click on the card's damage button
 * @param {Number} [result] - The attack's result tier; read off the card when not given
 * @param {Object} [preparedContext] - The roll context, when the caller has it already
 * @returns {Promise<Object|undefined>} What rollToChat returned, or nothing when no damage is due
 */
export async function prepareWeapon(data, result, preparedContext) {
  const context = preparedContext ?? readRollContext(data.currentTarget);
  const rollResult = Number.isFinite(result) ? result : spentOrOriginalResult(context);
  const {blind, recipientList} = inheritChatVisibility(context.messageId, context.options.rollMode);
  const damage = await weaponDamage(context, rollResult);
  if (!damage) return;
  return rollToChat(null, damage.message, WEAPON_DAMAGE_OUTPUT, damage.roll, damage.actor.name, recipientList, blind, "rollOutput");
}

/**
 * The damage a weapon attack deals, rolled but not posted: on a hit the weapon's damage with the
 * firing mode's dice and the success tier's bonus, on a miss the damage a weapon deals even then. A
 * blast that missed and scattered goes off where it lands with its plain damage (Core p.218).
 * @param {Object} context - The attack's roll context
 * @param {Number} rollResult - The attack's result tier
 * @returns {Promise<Object|null>} actor, message (the card's data) and roll (false for a weapon
 *   that deals no damage), or null when nothing is due
 */
export async function weaponDamage(context, rollResult) {
  const actorWhole = await fromUuid(context.actorUuid);
  const rolledFrom = context.rolledFrom;
  const skillKey = rolledFrom === "ccWeapon" ? "melee" : "guns";
  const weaponSelected = rolledFrom === "grenade" ? grenadePreparation(actorWhole, context.item.weaponId) ?? context.targetedAttack?.thrown ?? null : await weaponPreparation(actorWhole, skillKey, rolledFrom, context.item.weaponId, context.item.weaponMode);
  if (!weaponSelected) return null;

  const result = !isHit(rollResult) && context.targetedAttack?.scatter ? TASK_RESULT.SUCCESS : rollResult;
  if (isHit(result)) {
    const modeDice = modeDamage(context.options.attackMode) + coneDamage(weaponSelected.weapon, context.options.range) + beyondRangeDamage(weaponSelected.weapon, context.options.range, isChecked(context.options.vacuum)) + (weaponSelected.blast?.damage ?? "");
    return { actor: actorWhole, ...(await hitDamage(actorWhole, weaponSelected, result, modeDice, context.options.biomorphTarget, context.options.touchOnly)) };
  }
  if (!weaponSelected.weaponTraits.automatedEffects.dvOnMiss) return null;

  const damageCalc = await damageValueCalc({ type: "kinetic" }, weaponSelected.weaponTraits.automatedEffects.dvOnMiss.dv, null, "ammo");
  const message = {
    type: "damage",
    weaponName: weaponSelected.weaponName,
    ammoLoadedName: rolledFrom === "rangedWeapon" ? weaponSelected.weapon.system.ammoSelected.name : null,
    weaponTraits: weaponSelected.weaponTraits.additionalEffects,
    rollTitle: "ep2e.roll.announce.damageDone"
  };
  message.weaponTraits["dvOnMiss"] = weaponSelected.weaponTraits.automatedEffects["dvOnMiss"];
  message.weaponTraits.dvOnMiss["calculated"] = damageCalc.dv;
  return { actor: actorWhole, message, roll: await new Roll(damageCalc.dv).evaluate() };
}

/**
 * The extra damage dice a firing or attack mode adds. A burst or full auto at several targets, and
 * suppressive fire, deal a single shot's damage.
 * @param {String} attackMode - The mode chosen in the attack dialog
 * @returns {String} A formula fragment, "" for none
 */
export function modeDamage(attackMode) {
  return ATTACK_MODES[attackMode]?.damage ?? "";
}

/**
 * A hit's damage card data and roll.
 * @param {Actor} actorWhole - The attacker
 * @param {Object} weaponSelected - What weaponPreparation returned
 * @param {Number} rollResult - The attack's result tier
 * @param {String} modeDice - The firing mode's extra dice
 * @param {Boolean} biomorphTarget - The target is a biomorph, for weapons that deal more to one
 * @param {Boolean} touchOnly - A touch that deals no damage
 * @returns {Promise<Object>} message and roll (false when the weapon deals no damage)
 */
async function hitDamage(actorWhole, weaponSelected, rollResult, modeDice, biomorphTarget, touchOnly) {
  const meleeDamageMod = weaponSelected.rolledFrom === "ccWeapon" ? actorWhole.system.mods.meleeDamageMod || "" : "";
  const weaponDamage = touchOnly ? "ep2e.item.weapon.table.noDamage" : weaponSelected.weaponDamage;
  const rollFormula = damageFormula({
    base: weaponDamage,
    extras: [modeDice, meleeDamageMod, biomorphTarget ? " + 1d6" : ""],
    halved: !!weaponSelected.weaponTraits.automatedEffects.dvHalved,
    multiplier: Number(weaponSelected.blast?.damageMultiplier) || 1
  }, rollResult);

  const message = {
    type: "damage",
    weaponName: weaponSelected.weaponName,
    ammoLoadedName: weaponSelected.rolledFrom === "rangedWeapon" ? weaponSelected.weapon.system.ammoSelected.name : null,
    rollTitle: "ep2e.roll.announce.damageDone",
    weaponTraits: weaponSelected.weaponTraits.additionalEffects
  };
  if (biomorphTarget) message.weaponTraits["bioMorphsOnly"] = weaponSelected.weaponTraits.confirmationEffects["bioMorphsOnly"];
  if (!Object.keys(message.weaponTraits).length) delete message.weaponTraits;

  if (weaponSelected.weaponTraits.automatedEffects.noDamage || weaponDamage === "ep2e.item.weapon.table.noDamage") {
    message.total = false;
    return { message, roll: false };
  }
  return { message, roll: await new Roll(rollFormula).evaluate() };
}

// Rolls and posts a psi sleight's damage (e.g. Psychic Stab, Nightmare) - the GM still judges whether it hit.
export async function preparePsiDamage(data) {
  const context = readRollContext(data.currentTarget);
  const actorWhole = await fromUuid(context.actorUuid);
  const sleightItem = actorWhole.items.get(context.item.sleightId);
  if (!sleightItem) return;

  const {blind, recipientList} = inheritChatVisibility(context.messageId, context.options.rollMode);

  await dealPsiDamage(actorWhole, sleightItem, spentOrOriginalResult(context), blind, recipientList, context.options.push);
}

export async function dealPsiDamage(actorWhole, sleightItem, rollResult, blind, recipientList, manualPush) {
  if (!isHit(rollResult)) return;
  const { message, roll } = await sleightDamage(actorWhole, sleightItem, rollResult, manualPush);
  await rollToChat(null, message, WEAPON_DAMAGE_OUTPUT, roll, actorWhole.name, recipientList, blind, "rollOutput");
}

/**
 * A sleight's damage, rolled but not posted: its damage value, multiplied by an Effect push - a
 * gamma-boosted async's free one or the one chosen - and doubled on a critical.
 * @param {Actor} actorWhole - The async
 * @param {Item} sleightItem - The sleight
 * @param {Number} rollResult - The psi test's result tier
 * @param {String} [manualPush] - The push chosen in the dialog
 * @returns {Promise<Object>} message (the card's data) and roll
 */
export async function sleightDamage(actorWhole, sleightItem, rollResult, manualPush) {
  const baseDamage = (await damageValueCalc(sleightItem, sleightItem.system.damage, null, "ammo")).dv;
  const manualPushMultiplier = GAMMA_PUSH_EFFECTS[manualPush]?.damageMultiplier ?? 1;
  const pushMultiplier = sleightItem.system.psiType !== "chi" ? Math.max(gammaAutoPushDamageMultiplier(actorWhole), manualPushMultiplier) : 1;
  const rollFormula = damageFormula({ base: baseDamage, multiplier: pushMultiplier }, rollResult);
  const message = { type: "psiDamage", sleightName: sleightItem.name, rollTitle: "ep2e.roll.announce.damageDone" };
  return { message, roll: await new Roll(rollFormula).evaluate() };
}

/**
 * The damage an attack on targets deals, rolled but not posted: a sleight's or a weapon's.
 * @param {Object} context - The attack's roll context
 * @param {Number} rollResult - The attack's result tier
 * @returns {Promise<Object|null>} actor, message and roll, or null when nothing is due
 */
export async function attackDamageRoll(context, rollResult) {
  if (context.rolledFrom !== "psiSleight") return weaponDamage(context, rollResult);
  const actor = await fromUuid(context.actorUuid);
  const sleight = actor?.items?.get(context.item?.sleightId);
  if (!sleight || !isHit(rollResult)) return null;
  return { actor, ...(await sleightDamage(actor, sleight, rollResult, context.options?.push)) };
}


// Where damage and stress live on an actor, how far they may go, and what counts a wound or trauma.
export const DAMAGE_CONFIG = {
  physical: { attribute: "health.physical", ceilingPath: "physical.dr", thresholdPath: "physical.wt", modifierPath: "physical.wounds", barPath: "physical.relativePhysicalDamage", overBarPath: "physical.relativeDeathDamage", oldBarPath: "physical.oldHealthBarValue", oldOverBarPath: "physical.oldDeathBarValue", barModifier: "physicalUp" },
  mental: { attribute: "health.mental", ceilingPath: "mental.ir", thresholdPath: "mental.tt", modifierPath: "mental.trauma", barPath: "mental.relativeStressDamage", overBarPath: "mental.relativeInsanityDamage", oldBarPath: "mental.oldStressBarValue", oldOverBarPath: "mental.oldInsanityBarValue", barModifier: "mentalUp" }
};

/**
 * Puts damage or stress on an actor through the one path every source uses: the amount is held to
 * what the actor can still take, wounds or traumas follow from the Wound or Trauma Threshold, and
 * the sheet's bars move from where they stood. Several amounts - the ticks of a dose - are each
 * measured against the threshold on their own but written at once, so the bars move once. A
 * status card is posted only when asked for - a source that shows the result on a card of its own
 * stays quiet, so nothing is announced twice.
 * @param {Actor} actor - Who takes it
 * @param {Number|Number[]} amount - The damage or stress, or several amounts in turn
 * @param {Object} [options] - target: "physical" (damage, the default) or "mental" (stress);
 *   announce: post the status card
 * @returns {Promise<Object>} taken and wounds (traumas for stress)
 */
export async function applyDamage(actor, amount, { target = "physical", announce = false } = {}) {
  const config = DAMAGE_CONFIG[target] ?? DAMAGE_CONFIG.physical;
  const read = path => Number(foundry.utils.getProperty(actor.system, path)) || 0;
  const current = read(`${config.attribute}.value`);
  const threshold = read(config.thresholdPath) || 1;
  let room = read(config.ceilingPath) - current;
  const pieces = (Array.isArray(amount) ? amount : [amount]).map(piece => Math.max(0, Math.floor(Number(piece) || 0)));
  let taken = 0;
  let wounds = 0;
  for (const piece of pieces) {
    const part = Math.max(0, Math.min(piece, room));
    room -= part;
    taken += part;
    wounds += Math.floor(part / threshold);
  }
  if (taken < 1) return { taken: 0, wounds: 0 };

  const currentModifier = read(config.modifierPath);
  if (pieces.length === 1) {
    await takeDamage({ value: taken }, current, read(config.barPath), read(config.overBarPath), currentModifier, threshold, `system.${config.attribute}.value`, `system.${config.modifierPath}`, actor, target === "mental" ? "mental" : "physical", read(config.ceilingPath), { announce });
  }
  else {
    await actor.update({
      [`system.${config.attribute}.value`]: current + taken,
      [`system.${config.modifierPath}`]: currentModifier + wounds,
      [`system.${config.oldBarPath}`]: Math.max(1, read(config.barPath)),
      [`system.${config.oldOverBarPath}`]: read(config.overBarPath),
      "system.health.barModifier": config.barModifier
    });
  }
  return { taken, wounds };
}

/**
 * The line a card shows for damage or stress taken.
 * @param {Actor} actor - Who took it
 * @param {Object} result - What applyDamage returned
 * @param {String} [target] - "physical" or "mental"
 * @returns {String} The line
 */
export function damageLine(actor, { taken, wounds }, target = "physical") {
  return game.i18n.format(target === "mental" ? "ep2e.chat.damage.appliedMental" : "ep2e.chat.damage.appliedPhysical", { name: actor.name, taken, wounds });
}

/**
 * Adds result lines under a damage card already posted, once the damage is on the sheet - after
 * the dice have shown, so the bars do not give the result away early.
 * @param {Object} output - What rollToChat returned for the card
 * @param {String[]} lines - The lines
 * @returns {Promise<void>} Resolves once the card shows them
 */
export async function appendDamageLines(output, lines) {
  if (!output?.chatMessage || !lines.length) return;
  await updateCard(output.chatMessage, "damageCard", "applied", { lines });
}

//Take Damage through character sheet
export async function takeDamage(receiveDamage, currentDamage, bar, overBar, currentModifier, threshold, damageTarget, modifierTarget, actor, barTarget, maxHealth, { announce = true } = {}) {
  let inputValue = Number(receiveDamage?.value) < maxHealth ? Number(receiveDamage?.value) : maxHealth;
  let oldDamageBarTarget = "";
  let oldOverBarTarget = "";

  const barModifierTarget = "system.health.barModifier";
  let barModifier = "";

  let message = {};

  if (barTarget === "mental") {
    oldDamageBarTarget = "system.mental.oldStressBarValue";
    oldOverBarTarget = "system.mental.oldInsanityBarValue";
    barModifier = "mentalUp";
    message.title = "ep2e.roll.announce.combat.damage.mentalDamage";
    message.damageType = "ep2e.roll.announce.combat.damage.stress";
    message.modifierType = "ep2e.roll.announce.combat.damage.trauma";
  }
  else if (barTarget === "physical") {
    oldDamageBarTarget = "system.physical.oldHealthBarValue";
    oldOverBarTarget = "system.physical.oldDeathBarValue";
    barModifier = "physicalUp";
    message.title = "ep2e.roll.announce.combat.damage.physicalDamage";
    message.damageType = "ep2e.roll.announce.combat.damage.damage";
    message.modifierType = "ep2e.roll.announce.combat.damage.wounds";
  }

  if (inputValue >= 1 && oldDamageBarTarget != "" && oldOverBarTarget != "") {
    bar = bar >= 1 ? bar : 1;
    let newDamage = eval(inputValue + currentDamage) >= maxHealth ? maxHealth : eval(inputValue + currentDamage);
    let newModifier = Math.floor(inputValue / threshold) + currentModifier;

    if (announce && actor.type === "character") {
      message.damageValue = inputValue;
      message.modifierValue = Math.floor(inputValue / threshold);

      let html = await foundry.applications.handlebars.renderTemplate(DAMAGE_STATUS_OUTPUT, message);

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: html
      });
    }

    return actor.update({
      [damageTarget]: newDamage,
      [modifierTarget]: newModifier,
      [oldDamageBarTarget]: bar,
      [oldOverBarTarget]: overBar,
      [barModifierTarget]: barModifier
    });
  }
}

// A weapon hit lands on the targets the attacker picks: each defends, and once every defence is in
// a damage card follows the last of them, offering the damage. One roll counts for every target
// struck; the active GM puts it on each of them, less the armour it meets, and the same card names
// what each one took.

export const DAMAGE_READY_TEMPLATE = "systems/eclipsephase/templates/chat/attack-damage-ready.html";
const ROLLING = new Set();

registerCard("damageCard", {
  render: renderDamageCard,
  mutations: {
    rolled: (state, { data }) => ({ ...state, data }),
    applied: (state, { lines }) => ({ ...state, lines })
  }
});

/**
 * Draws a damage card: before the roll, the targets' outcomes and the button to roll; after it,
 * the roll and what each target took.
 * @param {Object} state - The card's damageCard flag
 * @returns {Promise<String>} The markup
 */
export function renderDamageCard(state) {
  if (state.data) return foundry.applications.handlebars.renderTemplate(WEAPON_DAMAGE_OUTPUT, { ...state.data, appliedLines: state.lines ?? [] });
  return foundry.applications.handlebars.renderTemplate(DAMAGE_READY_TEMPLATE, {
    headline: game.i18n.format("ep2e.chat.attack.damageReady", { weapon: state.weaponName }),
    actorUuid: state.actorUuid,
    targets: (state.targets ?? []).map(target => ({ ...target, outcomeLabel: outcomeLabel(target.outcome) }))
  });
}

/**
 * What a defence card says of the payload an attack brings: its name, with the substance to look up.
 * @param {String} name - The substance's name
 * @param {String} [uuid] - The substance
 * @returns {Object} label, text and uuid for the card's effect box
 */
export function payloadEffectInfo(name, uuid = "") {
  return { label: game.i18n.localize("ep2e.chat.defence.payloadLabel"), text: name, uuid };
}

/**
 * The attack a weapon roll carries: a weapon that deals damage or carries a payload, fires no
 * chemicals and is not used for a touch only - a payload brings its dose along, with or without
 * damage. Ranged weapons pick with the crosshair, melee weapons with the slash. A cone
 * strikes as an area; a cone or a burst at several targets takes targets within a meter of each
 * other.
 * @param {Object} context - The roll context at preRoll
 * @returns {Object|null} The attack's data, or null when the roll is no such attack
 */
export function detectWeaponAttack(context) {
  if (context.rolledFrom === "grenade" || (context.rolledFrom === "rangedWeapon" && context.weapon?.blast)) return detectThrow(context);
  if (context.rolledFrom !== "rangedWeapon" && context.rolledFrom !== "ccWeapon") return null;
  const selected = context.weapon;
  if (!selected?.weapon || chemicalDoses(selected.weaponTraits)) return null;
  if (isChecked(context.options?.touchOnly)) return null;
  const noDamage = !!selected.weaponTraits?.automatedEffects?.noDamage;
  const dose = context.rolledFrom === "rangedWeapon" ? munitionDose(selected.weapon.system?.ammoSelected?.payload, !noDamage) : null;
  if (noDamage && !dose) return null;
  const targets = context.rolledFrom === "rangedWeapon" ? attackTargetCount(selected.weapon, context.options ?? {}) : 1;
  return {
    ...(dose ? { dose, effectInfo: payloadEffectInfo(dose.name, dose.uuid) } : {}),
    ...(noDamage ? { noDamage: true } : {}),
    targets,
    area: isConeWeapon(selected.weapon),
    suppressive: context.options?.attackMode === "suppressive",
    within: targets > 1 ? 1 : null,
    labelKey: "ep2e.chat.attack.chooseTarget",
    cursor: context.rolledFrom === "ccWeapon" ? MELEE_CURSOR : {},
    payload: {
      armorUsed: attackArmorUsed(selected.weapon, selected.weaponMode || "1"),
      armorPiercing: !!selected.weaponTraits?.additionalEffects?.armorPiercing?.value
    }
  };
}

/**
 * The attack a thrown grenade or a fired seeker carries, with what a grenade's damage needs once the
 * last grenade of the stack is gone. A blast strikes whoever is in it once it goes off where it was
 * placed - without a placed blast the roll is narrative and offers only its damage; a blast without
 * damage, such as smoke, is still laid but strikes nobody. A grenade without a blast strikes the one
 * target picked.
 * @param {Object} context - The roll context at preRoll
 * @returns {Object|null} The attack's data, or null for a grenade that neither blasts nor damages
 */
export function detectThrow(context) {
  const selected = context.weapon;
  if (!selected?.weapon) return null;
  const options = context.options ?? {};
  const grenade = context.rolledFrom === "grenade";
  const harmless = !!selected.weaponTraits?.automatedEffects?.noDamage || !formulaMax(selected.weaponDamage);
  const munition = grenade ? selected.weapon.system?.payload : selected.weapon.system?.ammoSelected?.payload;
  const dose = munitionDose(munition, !harmless);
  const reach = blastReach(selected.blast, { radius: options.blastRadius, reduction: options.blastReduction });
  const placed = (() => { try { return JSON.parse(options.placedArea || "null"); } catch { return null; } })();
  const trigger = options.trigger || selected.blast?.trigger || "impact";
  const blast = reach.kind !== "none" ? {
    ...reach, origin: placed?.origin ?? null, from: placed?.from ?? null, trigger, harmless, delayed: isDelayedTrigger(trigger), lingers: harmless && !dose,
    ...(trigger === "timer" ? { timer: { value: Number(options.timerValue) || 1, unit: options.timerUnit || "rounds", ...timerSpan(options.timerValue || 1, options.timerUnit || "rounds") } } : {}),
    ...(trigger === "proximity" ? { sensor: Math.min(PROXIMITY_REACH, Math.max(1, Number(options.proximityRadius) || PROXIMITY_REACH)) } : {})
  } : null;
  if (!blast && harmless && !dose) return null;
  const armorUsed = grenade ? selected.weapon.system?.armorused : attackArmorUsed(selected.weapon, selected.weaponMode || "1");
  return {
    ...(dose ? { dose, effectInfo: payloadEffectInfo(dose.name, dose.uuid) } : {}),
    ...(harmless ? { noDamage: true } : {}),
    ...(grenade ? { thrown: { weaponName: selected.weaponName, weaponDamage: selected.weaponDamage, weaponTraits: selected.weaponTraits, rolledFrom: "grenade", item: selected.weapon.toObject?.() ?? null } } : {}),
    targets: blast ? ANY_TARGETS : 1,
    area: !!blast,
    ...(blast ? { blast } : {}),
    labelKey: "ep2e.chat.attack.chooseTarget",
    cursor: {},
    payload: {
      armorUsed: armorUsed === "energy" || armorUsed === "kinetic" ? armorUsed : "none",
      armorPiercing: !!selected.weaponTraits?.additionalEffects?.armorPiercing?.value
    }
  };
}

/**
 * Notes a target's defence on the attack card, where the card may be changed and otherwise by the
 * active GM. Any attack on targets can resolve through it; only a damage attack goes on to its
 * damage card. A payload that takes hold on striking gives its dose here.
 * @param {Object} attack - The attack
 * @param {Actor} target - The target
 * @param {String} outcome - "hit", "half" or "none"
 * @param {Object} [options] - kind: "dodge" or "parry"; byPool and defenceId, for a payload's dose
 * @returns {Promise<*>} What settling reported, or null when it was sent on
 */
export async function noteDefence(attack, target, outcome, { kind = "dodge", byPool = false, defenceId = null } = {}) {
  const card = game.messages.get(attack.messageId);
  if (!card) return null;
  if (attack.dose?.when === "struck") await attackEffect("payload")?.resolve?.(attack, target, outcome, { byPool, defenceId });
  return runOrRelay(card, "noteAttackDefence", () => settleAttackDefence(card, target.uuid, outcome, kind), { payload: { messageId: card.id, uuid: target.uuid, outcome, kind } });
}

/**
 * Notes a defence on the attack card, and once every target has defended and one was struck,
 * posts the damage card after them. Defences settled together are noted one after another, so
 * the card is posted once.
 * @param {ChatMessage} card - The attack card
 * @param {String} uuid - The target
 * @param {String} outcome - "hit", "half" or "none"
 * @param {String} [kind] - "dodge" or "parry"
 * @returns {Promise<ChatMessage|null>} The damage card, once posted
 */
export function settleAttackDefence(card, uuid, outcome, kind = "dodge") {
  const settle = async () => {
    await updateCard(card, "taskCard", "defence", { uuid, outcome, kind });
    const state = card.getFlag("eclipsephase", "taskCard");
    const attack = card.getFlag("eclipsephase", "roll")?.targetedAttack;
    if (attack?.suppressive) {
      const target = (state.targets ?? []).find(entry => entry.uuid === uuid);
      if (!target || target.outcome === "none" || target.damageOffered) return null;
      await updateCard(card, "taskCard", "targetDamageOffered", { uuid });
      return postDamageCard(card, [target]);
    }
    const settled = (state.targets ?? []).length && state.targets.every(target => target.outcome);
    if (settled && attack?.blast && (attack.noDamage || state.targets.every(target => target.outcome === "none"))) await clearBlast(attack);
    if (!damageReady(state) || attack?.effect !== "damage" || attack.noDamage) return null;
    await updateCard(card, "taskCard", "damageOffered");
    return postDamageCard(card, state.targets);
  };
  return inOrder(`settle:${card.id}`, settle);
}

/**
 * Posts an attack's damage card, seen as the attack card was and by the targets' owners.
 * @param {ChatMessage} card - The attack card
 * @param {Object[]} targets - { uuid, name, outcome } each
 * @returns {Promise<ChatMessage>} The damage card
 */
async function postDamageCard(card, targets) {
  const context = card.getFlag("eclipsephase", "roll");
  const actors = (await Promise.all(targets.map(target => fromUuid(target.uuid)))).filter(Boolean);
  const shown = actors.filter(actor => !targets.find(target => target.uuid === actor.uuid)?.hidden);
  const { whisper, blind } = targets.length && targets.every(target => target.hidden) ? { whisper: gmWhisper(), blind: false } : followUpVisibility(card, shown);
  const state = { attackMessageId: card.id, actorUuid: context.actorUuid, weaponName: context.targetedAttack.weaponName, targets, data: null, lines: [] };
  return ChatMessage.create({
    speaker: card.speaker,
    content: await renderCard("damageCard", state),
    whisper: whisper.length ? whisper : null,
    blind,
    flags: { eclipsephase: { damageCard: state } }
  });
}

/**
 * What one target takes of an attack's damage: less what a centred blast loses on its way to them,
 * half of that when they only partly dodged, less the armour it meets - halved by armour piercing.
 * Halves round up.
 * @param {Number} total - The damage rolled
 * @param {String} outcome - "hit" or "half"
 * @param {Number} armor - The target's armour value against it
 * @param {Boolean} [armorPiercing] - The attack pierces armour
 * @param {Number} [falloff] - The damage lost to distance from a blast's centre
 * @returns {Object} share (before armour), armor (as counted) and dealt
 */
export function damageAgainst(total, outcome, armor, armorPiercing = false, falloff = 0) {
  const reaching = Math.max(0, total - falloff);
  const share = outcome === "half" ? Math.ceil(reaching / 2) : reaching;
  const counted = armorPiercing ? Math.ceil(armor / 2) : armor;
  return { share, armor: counted, dealt: Math.max(0, share - counted) };
}

/**
 * The armour an actor has against a kind of damage.
 * @param {Actor} actor - The target
 * @param {String} armorUsed - "energy", "kinetic", "mental" (against psi) or "none"
 * @returns {Number} The armour value
 */
export function armorAgainst(actor, armorUsed) {
  if (armorUsed === "energy") return Number(actor.system?.physical?.energyArmorTotal) || 0;
  if (armorUsed === "kinetic") return Number(actor.system?.physical?.kineticArmorTotal) || 0;
  if (armorUsed === "mental") return Number(actor.system?.mental?.armorTotal) || 0;
  return 0;
}

/**
 * What the damage card shows for one target. A target that got away is named as such for
 * everyone; for one that was struck, the target's owners and the GMs see the reckoning, everyone
 * else only whether damage got through.
 * @param {Object} target - uuid, name, outcome and kind ("dodge" or "parry")
 * @param {Object} [result] - What damageAgainst and applyDamage reported, with armorUsed
 * @returns {String|Object} The line, or uuid, detail and summary for a target that was struck
 */
export function attackDamageLine(target, result) {
  if (target.outcome === "none") return game.i18n.format(target.kind === "parry" ? "ep2e.chat.damage.attackParried" : "ep2e.chat.damage.attackMissed", { name: target.name });
  const key = target.outcome === "half" ? "ep2e.chat.damage.attackHalf" : "ep2e.chat.damage.attackHit";
  const summary = game.i18n.format(result.taken > 0 ? "ep2e.chat.damage.attackTookDamage" : "ep2e.chat.damage.attackSoaked", { name: target.name });
  return { uuid: target.uuid, summary, detail: reckoning(key, target, result) };
}

/**
 * The reckoning of what a struck target took, as markup: what got through and the wounds stand out.
 * @param {String} key - The line's localization key
 * @param {Object} target - name
 * @param {Object} result - share, armor, armorUsed, taken and wounds
 * @returns {String} The line
 */
function reckoning(key, target, result) {
  return game.i18n.format(key, {
    name: escapeText(target.name),
    share: result.share,
    armor: result.armor,
    armorType: escapeText(game.i18n.localize(`ep2e.item.weapon.table.armorUsed.${result.armorUsed}`)),
    damage: highlighted(result.damageTarget === "mental" ? "ep2e.chat.damage.amountStress" : "ep2e.chat.damage.amountDamage", result.taken),
    woundsTaken: highlighted(result.damageTarget === "mental" ? "ep2e.chat.damage.amountTraumas" : "ep2e.chat.damage.amountWounds", result.wounds)
  });
}

/**
 * An amount in a damage reckoning, as markup that stands out: the number in bold, number and word
 * in the text colour.
 * @param {String} key - The amount's localization key, with {value}
 * @param {Number} value - The amount
 * @returns {String} The markup
 */
function highlighted(key, value) {
  const amount = game.i18n.format(key, { value: `<b>${Number(value) || 0}</b>` });
  return `<span class="ep-damage-value">${amount}</span>`;
}

/**
 * Puts an attack's damage on every target its card names, as the active GM: each takes its share
 * less its armour, and the damage card lists what each one took.
 * @param {Object} request - cardId (the damage card), total, armorUsed, armorPiercing, damageTarget
 *   ("physical" or "mental", for stress), reduction (DV a centred blast loses per metre), dose (a
 *   payload released once damage gets through) and targets ({ uuid, name, outcome, and distance and
 *   hidden in a blast } each)
 * @returns {Promise<Array<String|Object>>} The lines written onto the card
 */
export async function applyAttackDamage({ cardId, total, armorUsed, armorPiercing, damageTarget = "physical", reduction = 0, dose = null, targets }) {
  const lines = [];
  for (const target of targets) {
    if (target.outcome === "none") {
      lines.push(secretLine(target, attackDamageLine(target)));
      continue;
    }
    const actor = await fromUuid(target.uuid);
    if (!actor) continue;
    const falloff = reduction && Number.isFinite(target.distance) ? reduction * Math.floor(target.distance) : 0;
    const against = damageAgainst(total, target.outcome, armorAgainst(actor, armorUsed), armorPiercing, falloff);
    const result = await applyDamage(actor, against.dealt, { target: damageTarget });
    if (dose?.when === "dealt" && against.dealt > 0) await attackEffect("payload")?.resolve?.({ dose }, actor, "hit");
    const name = falloff ? game.i18n.format("ep2e.chat.damage.blastFalloff", { name: actor.name, distance: Math.floor(target.distance), falloff }) : actor.name;
    lines.push(secretLine(target, attackDamageLine({ ...target, name }, { ...against, ...result, armorUsed, damageTarget })));
  }
  const card = game.messages.get(cardId);
  if (card) await updateCard(card, "damageCard", "applied", { lines });
  return lines;
}

/**
 * A damage line about a target only the GM may know of - one behind a wall that no player owns: shown
 * to its owners alone, with nothing in its place for anyone else.
 * @param {Object} target - The target, with hidden
 * @param {String|Object} line - What attackDamageLine returned
 * @returns {String|Object} The line, kept from the others when the target is hidden
 */
function secretLine(target, line) {
  if (!target.hidden) return line;
  return typeof line === "string" ? { uuid: target.uuid, detail: escapeText(line), summary: "", secret: true } : { ...line, summary: "", secret: true };
}

/**
 * Rolls an attack's damage from its damage card: one roll for every target struck. The card turns
 * into the roll, and the active GM puts the damage on the targets.
 * @param {ChatMessage} card - The damage card
 * @returns {Promise<Number|null>} The damage rolled, or null when nothing was rolled
 */
export async function rollAttackDamage(card) {
  const state = card?.getFlag?.("eclipsephase", "damageCard");
  const attackCard = state ? game.messages.get(state.attackMessageId) : null;
  const context = attackCard?.getFlag?.("eclipsephase", "roll");
  const attack = context?.targetedAttack;
  if (!state || state.data || !attack || ROLLING.has(card.id)) return null;
  const attacker = await fromUuid(context.actorUuid);
  if (!attacker?.isOwner) return null;

  ROLLING.add(card.id);
  try {
    const damage = await attackDamageRoll({ ...foundry.utils.deepClone(context), messageId: attackCard.id }, spentOrOriginalResult(context));
    if (!damage?.roll) return null;
    const shown = await rollToChat({ preventPrintToChat: true }, damage.message, WEAPON_DAMAGE_OUTPUT, damage.roll, damage.actor.name, card.whisper ?? [], card.blind === true, "rollOutput");
    await updateCard(card, "damageCard", "rolled", { data: storable(shown) });

    const total = Number(shown.total) || 0;
    const request = { cardId: card.id, total, armorUsed: attack.payload?.armorUsed ?? "kinetic", armorPiercing: attack.payload?.armorPiercing === true, damageTarget: attack.payload?.damageTarget ?? "physical", reduction: Number(attack.blast?.reduction) || 0, dose: attack.dose ?? null, targets: state.targets };
    if (game.user.isGM) await applyAttackDamage(request);
    else relayToActiveGM("applyAttackDamage", request);
    await clearBlast(attack);
    return total;
  } finally {
    ROLLING.delete(card.id);
  }
}

/**
 * Lets weapon attacks land on targets through the "damage" attack effect. Registered after the
 * dose effect, so a chemical weapon's hit stays a dose.
 * @returns {void}
 */
export function registerWeaponAttacks() {
  registerAttackEffect("damage", {
    detect: context => detectWeaponAttack(context) ?? detectSleightAttack(context, { damaging: true }),
    resolve: noteDefence
  });
}

/**
 * Registers the socket actions the active GM notes defences on attack cards and puts an attack's
 * damage on its targets under.
 * @returns {void}
 */
export function registerWeaponAttackSocket() {
  registerSocketActions({
    applyAttackDamage: payload => applyAttackDamage(payload),
    noteAttackDefence: payload => settleAttackDefence(game.messages.get(payload.messageId), payload.uuid, payload.outcome, payload.kind)
  });
}
