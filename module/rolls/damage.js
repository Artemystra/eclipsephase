import { weaponPreparation, grenadePreparation, blastReach, formulaMax, isDelayedTrigger, timerSpan, munitionDose, cloudColor, PROXIMITY_REACH, coneDamage, beyondRangeDamage, ATTACK_MODES, ANY_TARGETS, chemicalDoses, attackArmorUsed, attackTargetCount, isConeWeapon, strikeTraits } from "../common/weapon-functions.js";
import { damageValueCalc, inheritChatVisibility, readRollContext, escapeText, isChecked, postCard } from "../common/general-sheet-functions.js";
import { WEAPON_DAMAGE_OUTPUT, DAMAGE_STATUS_OUTPUT, TASK_RESULT, rollToChat, isHit, superiorResults } from "./dice.js";
import { targetKinds } from "../common/morp-functions.js";
import { inflictCondition, conditionEntry, activeConditions, isUnder } from "../common/conditions.js";
import { postCheckCard, requestCardCheck, settleOnRoll, modifiersOnRoll, registerCheckCard } from "./cards.js";
import { gammaAutoPushDamageMultiplier, GAMMA_PUSH_EFFECTS, detectSleightAttack } from "./psi.js";
import { damageFormula } from "./damage-formula.js";
import { registerAttackEffect, attackEffect, followUpVisibility, outcomeLabel, gmWhisper, clearBlast, postDefenceCards, rollOnTable } from "./attacks.js";
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

  if (weaponSelected.weaponTraits.automatedEffects.noDamage || weaponDamage === "ep2e.item.weapon.table.noDamage" || !formulaMax(weaponDamage)) {
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
 * Takes damage or stress off an actor, as far as it has any: wounds and traumas stay, as healing
 * points alone never removes them. The sheet's bars move from where they stood.
 * @param {Actor} actor - Who is healed
 * @param {Number} amount - The points healed
 * @param {Object} [options] - target: "physical" (damage, the default) or "mental" (stress)
 * @returns {Promise<Number>} The points actually taken off
 */
export async function applyHealing(actor, amount, { target = "physical" } = {}) {
  const config = DAMAGE_CONFIG[target] ?? DAMAGE_CONFIG.physical;
  const read = path => Number(foundry.utils.getProperty(actor.system, path)) || 0;
  const current = read(`${config.attribute}.value`);
  const healed = Math.max(0, Math.min(current, Math.floor(Number(amount) || 0)));
  if (healed < 1) return 0;
  await actor.update({
    [`system.${config.attribute}.value`]: current - healed,
    [`system.${config.oldBarPath}`]: Math.max(1, read(config.barPath)),
    [`system.${config.oldOverBarPath}`]: read(config.overBarPath)
  });
  return healed;
}

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
 *   announce: post the status card; woundCheck: false when the caller asks for the wound's check
 *   itself, together with what else the hit brings - otherwise the wound asks for it, as any does
 * @returns {Promise<Object>} taken and wounds (traumas for stress)
 */
export async function applyDamage(actor, amount, { target = "physical", announce = false, woundCheck = true } = {}) {
  const updateOptions = woundCheck ? {} : { eclipsephase: { woundCheck: false } };
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
    await takeDamage({ value: taken }, current, read(config.barPath), read(config.overBarPath), currentModifier, threshold, `system.${config.attribute}.value`, `system.${config.modifierPath}`, actor, target === "mental" ? "mental" : "physical", read(config.ceilingPath), { announce, updateOptions });
  }
  else {
    await actor.update({
      [`system.${config.attribute}.value`]: current + taken,
      [`system.${config.modifierPath}`]: currentModifier + wounds,
      [`system.${config.oldBarPath}`]: Math.max(1, read(config.barPath)),
      [`system.${config.oldOverBarPath}`]: read(config.overBarPath),
      "system.health.barModifier": config.barModifier
    }, updateOptions);
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
export async function takeDamage(receiveDamage, currentDamage, bar, overBar, currentModifier, threshold, damageTarget, modifierTarget, actor, barTarget, maxHealth, { announce = true, updateOptions = {} } = {}) {
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
    }, updateOptions);
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
    applied: (state, { lines, checks = [] }) => ({ ...state, lines, checks: [...(state.checks ?? []), ...checks] }),
    checkRolled: (state, { id }) => ({ ...state, checks: (state.checks ?? []).map(entry => entry.id === id ? { ...entry, rolled: true } : entry) }),
    checksResolved: (state, { ids }) => ({ ...state, checks: (state.checks ?? []).map(entry => ids.includes(entry.id) ? { ...entry, rolled: true } : entry) })
  }
});

/**
 * Draws a damage card: before the roll, the targets' outcomes and the button to roll; after it,
 * the roll, what each target took and the checks the weapon asks of them.
 * @param {Object} state - The card's damageCard flag
 * @returns {Promise<String>} The markup
 */
export function renderDamageCard(state) {
  if (state.data) return foundry.applications.handlebars.renderTemplate(WEAPON_DAMAGE_OUTPUT, { ...state.data, appliedLines: state.lines ?? [], ...strikeButtons(state) });
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
 * The attack a weapon roll carries: a weapon that deals damage, carries a payload or has a trait
 * whose hit asks for a check, and fires no chemicals - a payload brings its dose along, with or
 * without damage, and a touch only brings the checks. Ranged weapons pick with the crosshair, melee weapons with the slash. A cone
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
  const checks = strikeTraits(selected.weaponTraits?.additionalEffects);
  const touch = isChecked(context.options?.touchOnly);
  if (touch && !checks.length) return null;
  const noDamage = touch || !!selected.weaponTraits?.automatedEffects?.noDamage || !formulaMax(selected.weaponDamage);
  const dose = context.rolledFrom === "rangedWeapon" ? munitionDose(selected.weapon.system?.ammoSelected?.payload, !noDamage) : null;
  if (noDamage && !dose && !checks.length) return null;
  const targets = context.rolledFrom === "rangedWeapon" ? attackTargetCount(selected.weapon, context.options ?? {}) : 1;
  return {
    ...(dose ? { dose, effectInfo: payloadEffectInfo(dose.name, dose.uuid) } : {}),
    ...(noDamage ? { noDamage: true } : {}),
    ...(checks.length ? { checks } : {}),
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
 * damage, such as smoke, is still laid but strikes nobody, unless its traits ask for checks. A
 * grenade without a blast strikes the one target picked.
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
  const clouds = (grenade ? selected.weapon.system?.cloud : selected.weapon.system?.ammoSelected?.cloud) === true && munition?.enabled === true;
  const breathed = munition?.enabled && munition.vector === "inhalation" ? munition.loaded?.[0] : null;
  const color = cloudColor(grenade ? selected.weapon.system?.cloudColor : selected.weapon.system?.ammoSelected?.cloudColor);
  const cloud = clouds ? (breathed?.uuid ? { kind: "gas", uuid: breathed.uuid, name: breathed.name ?? "", color } : { kind: "smoke", color }) : null;
  const reach = blastReach(selected.blast, { radius: options.blastRadius, reduction: options.blastReduction });
  const placed = (() => { try { return JSON.parse(options.placedArea || "null"); } catch { return null; } })();
  const trigger = options.trigger || selected.blast?.trigger || "impact";
  if (harmless) {
    delete reach.reach;
    delete reach.falloffFrom;
    if (reach.kind === "uniform") reach.reduction = 0;
  }
  const blast = reach.kind !== "none" ? {
    ...reach, origin: placed?.origin ?? null, from: placed?.from ?? null, trigger, harmless, delayed: isDelayedTrigger(trigger), lingers: !!cloud, ...(cloud ? { cloud } : {}),
    ...(trigger === "timer" ? { timer: { value: Number(options.timerValue) || 1, unit: options.timerUnit || "rounds", ...timerSpan(options.timerValue || 1, options.timerUnit || "rounds") } } : {}),
    ...(trigger === "proximity" ? { sensor: Math.min(PROXIMITY_REACH, Math.max(1, Number(options.proximityRadius) || PROXIMITY_REACH)) } : {})
  } : null;
  const checks = strikeTraits(selected.weaponTraits?.additionalEffects);
  if (!blast && harmless && !dose && !checks.length) return null;
  const armorUsed = grenade ? selected.weapon.system?.armorused : attackArmorUsed(selected.weapon, selected.weaponMode || "1");
  return {
    ...(dose ? { dose, effectInfo: payloadEffectInfo(dose.name, dose.uuid) } : {}),
    ...(harmless ? { noDamage: true } : {}),
    ...(checks.length ? { checks } : {}),
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
 * posts the damage card after them - for an attack without damage whose hit asks for checks, at
 * once as the card saying so, with the checks on it. Defences settled together are noted one after another, so
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
    if (!damageReady(state) || attack?.effect !== "damage" || (attack.noDamage && !attack.checks?.length)) return null;
    await updateCard(card, "taskCard", "damageOffered");
    const posted = await postDamageCard(card, state.targets);
    if (attack.noDamage) await rollAttackDamage(posted);
    return posted;
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
  const state = { attackMessageId: card.id, actorUuid: context.actorUuid, weaponName: context.targetedAttack.weaponName, area: context.targetedAttack.area === true, targets, data: null, lines: [], checks: [] };
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
export async function applyAttackDamage({ cardId, total, armorUsed, armorPiercing, damageTarget = "physical", reduction = 0, falloffFrom = 0, dose = null, strike = null, noDamage = false, targets }) {
  const lines = [];
  const checks = [];
  const card = game.messages.get(cardId);
  const whisper = card ? card.whisper ?? [] : null;
  for (const target of targets) {
    if (target.outcome === "none") {
      if (!noDamage) lines.push(secretLine(target, attackDamageLine(target)));
      continue;
    }
    const actor = await fromUuid(target.uuid);
    if (!actor) continue;
    if (noDamage) {
      checks.push(...await strikeChecks(actor, { ...(strike ?? {}), wounds: 0, whisper }));
      continue;
    }
    const falloff = reduction && Number.isFinite(target.distance) ? reduction * Math.floor(Math.max(0, target.distance - falloffFrom)) : 0;
    const outerZone = falloffFrom > 0 && target.distance > falloffFrom;
    const against = damageAgainst(total, target.outcome, armorAgainst(actor, armorUsed), armorPiercing, falloff);
    const result = await applyDamage(actor, against.dealt, { target: damageTarget, woundCheck: false });
    if (dose?.when === "dealt" && against.dealt > 0 && !outerZone) await attackEffect("payload")?.resolve?.({ dose }, actor, "hit");
    checks.push(...await strikeChecks(actor, { ...(strike ?? {}), wounds: damageTarget === "physical" ? result.wounds : 0, whisper }));
    const name = falloff ? game.i18n.format("ep2e.chat.damage.blastFalloff", { name: actor.name, distance: Math.floor(target.distance), falloff }) : actor.name;
    lines.push(secretLine(target, attackDamageLine({ ...target, name }, { ...against, ...result, armorUsed, damageTarget })));
  }
  if (card) await updateCard(card, "damageCard", "applied", { lines, checks });
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
    if (!damage?.message) return null;
    const shown = damage.roll ? await rollToChat({ preventPrintToChat: true }, damage.message, WEAPON_DAMAGE_OUTPUT, damage.roll, damage.actor.name, card.whisper ?? [], card.blind === true, "rollOutput") : damage.message;
    await updateCard(card, "damageCard", "rolled", { data: storable(shown) });

    const total = Number(shown.total) || 0;
    const request = { cardId: card.id, total, armorUsed: attack.payload?.armorUsed ?? "kinetic", armorPiercing: attack.payload?.armorPiercing === true, damageTarget: attack.payload?.damageTarget ?? "physical", falloffFrom: Number(attack.blast?.falloffFrom) || 0, reduction: Number(attack.blast?.reduction) || 0, dose: attack.dose ?? null, strike: strikeOf(attack), noDamage: !damage.roll, targets: state.targets };
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
  registerStrikeChecks();
}

/**
 * Registers the socket actions the active GM notes defences on attack cards and puts an attack's
 * damage on its targets under.
 * @returns {void}
 */
export function registerWeaponAttackSocket() {
  registerSocketActions({
    applyAttackDamage: payload => applyAttackDamage(payload),
    noteAttackDefence: payload => settleAttackDefence(game.messages.get(payload.messageId), payload.uuid, payload.outcome, payload.kind),
    postSecretDefenceCards: async ({ attack, targetUuids, details }) => postDefenceCards(attack, (await Promise.all(targetUuids.map(uuid => fromUuid(uuid)))).filter(Boolean), { gmOnly: true, details: new Map(details) })
  });
}


// What a hit does beyond its damage (Core p.216, 219, 220). A wound, or a weapon that knocks down,
// asks for a SOM Check against falling prone - one check, even for both; two wounds at once knock
// prone and ask for one against passing out. A weapon's traits ask for the checks they name. Each
// check is a card for the target's owners; its result puts the conditions on, and a pool point that
// turns the result puts on what the new one brings instead.

export const STRIKE_CHECK_KEY = "strikeCheck";

// The aptitude each check is rolled on, its card's icon - a Foundry image where it has one - the
// armour that adds to it and a modifier of its own.
export const STRIKE_CHECKS = {
  knockdown: { aptitude: "som", icon: "fa-person-falling" },
  unconscious: { aptitude: "som", icon: "fa-bed", img: "icons/svg/unconscious.svg" },
  shock: { aptitude: "som", icon: "fa-bolt", img: "icons/svg/lightning.svg", armor: "energy" },
  stun: { aptitude: "som", icon: "fa-burst", img: "icons/svg/lightning.svg", armor: "kinetic" },
  blinding: { aptitude: "ref", icon: "fa-eye-slash" },
  entangling: { aptitude: "ref", icon: "fa-spider", img: "systems/eclipsephase/resources/icons/conditions/grappled.svg" },
  pain: { aptitude: "wil", icon: "fa-face-grimace" },
  confused: { aptitude: "cog", icon: "fa-question", img: "icons/svg/daze.svg", modifier: -30 }
};

// What a confused character does who fails the COG Check, by the d100 (Core p.226): 00-24, 25-49,
// 50-74 and 75-99.
export const CONFUSION_TABLE = ["mutter", "random", "flee", "attack"];

// What Pain Tolerance I adds to the check against pain (Core p.216).
export const PAIN_TOLERANCE_BONUS = 30;

// The check each trait asks for and who is immune to it (Core p.216, 219): synthmorphs, bots and
// vehicles to shock, everyone but biomorphs to the biomorph stun and to pain, Pain Tolerance II to
// pain, Anti-Glare to blinding.
const TRAIT_CHECKS = [
  { trait: "shock", check: "shock", immune: ({ kind }) => ["synthmorph", "bot", "vehicle"].includes(kind) },
  { trait: "stun", check: "stun", immune: () => false },
  { trait: "stunBiomorphs", check: "stun", immune: ({ kind }) => kind !== "biomorph" },
  { trait: "blinding", check: "blinding", immune: ({ systems }) => systems.antiGlare === true },
  { trait: "entangling", check: "entangling", immune: () => false },
  { trait: "pain", check: "pain", immune: ({ kind, tolerance }) => kind !== "biomorph" || tolerance >= 2 }
];

/**
 * What an attack's hit brings beyond its damage, for the active GM to put on its targets.
 * @param {Object} attack - The attack
 * @returns {Object} checks (trait keys), weaponName and superiors (the attack's superior successes)
 */
export function strikeOf(attack) {
  const roll = attack?.roll;
  const superiors = roll && isHit(roll.result) ? superiorResults(roll.result, roll.value) : 0;
  return { checks: attack?.checks ?? [], weaponName: attack?.weaponName ?? "", superiors };
}

/**
 * Puts what a hit brings beyond its damage on a target. The wound's own check - and the one against
 * passing out after two wounds, which knock prone at once - gets a card of its own; the checks the
 * weapon's traits ask for come back to go on the damage card, a knockdown weapon's covering the
 * wound's. A target immune to an effect gets a note instead, and pain puts its modifier on at once.
 * @param {Actor} actor - The target
 * @param {Object} [strike] - checks (trait keys), wounds taken, weaponName, the attack's superiors and
 *   whisper: who sees an immunity note, as the damage card is seen; by default as the actor's cards
 * @returns {Promise<Object[]>} The damage card's check entries for this target
 */
export async function strikeChecks(actor, { checks = [], wounds = 0, weaponName = "", superiors = 0, whisper = null } = {}) {
  const systems = actor.system?.additionalSystems ?? {};
  const target = { kind: targetKinds(actor)[0], systems, tolerance: Number(systems.painTolerance) || 0 };
  const onCard = [];
  const immune = [];

  if (wounds >= 2) {
    await inflictCondition(actor, "prone");
    await postStrikeCheck(actor, "unconscious");
  }
  else if (checks.includes("knockdown")) onCard.push("knockdown");
  else if (wounds === 1) await postStrikeCheck(actor, "knockdown");

  for (const { trait, check, immune: spared } of TRAIT_CHECKS) {
    if (!checks.includes(trait) || onCard.includes(check) || immune.includes(check)) continue;
    if (spared(target)) {
      immune.push(check);
      continue;
    }
    if (check === "pain") await sufferPain(actor, target.tolerance);
    onCard.push(check);
  }

  for (const check of immune) await postCard(actor, { icon: STRIKE_CHECKS[check].icon, iconImg: STRIKE_CHECKS[check].img, headline: game.i18n.format("ep2e.chat.strike.immune", { name: actor.name, effect: game.i18n.localize(`ep2e.chat.strike.${check}.name`) }) }, {}, whisper);
  return onCard.map(check => ({ id: foundry.utils.randomID(), actorUuid: actor.uuid, name: actor.name, check, weaponName, superiors: check === "entangling" ? superiors : 0, npc: !actor.hasPlayerOwner, rolled: false }));
}

/**
 * The -20 a pain beam leaves until the end of the next turn, -10 with Pain Tolerance I (Core p.216),
 * as an Impaired condition - unless a stronger one is on already.
 * @param {Actor} actor - The target
 * @param {Number} tolerance - Its Pain Tolerance level
 * @returns {Promise<void>} Resolves once put on
 */
async function sufferPain(actor, tolerance) {
  const id = tolerance >= 1 ? "impaired10" : "impaired20";
  const level = entry => Math.abs(Number(Object.values(conditionEntry(entry)?.changes ?? {})[0]) || 0);
  const stronger = Array.from(activeConditions(actor)).some(entry => conditionEntry(entry)?.group === "impaired" && level(entry) >= level(id));
  if (!stronger) await inflictCondition(actor, id, { span: { value: 1, units: "rounds" } });
}

/**
 * Posts the card asking a target for one check of a hit, for its owners.
 * @param {Actor} actor - The target
 * @param {String} check - The check's key
 * @param {Object} [options] - weaponName, and superiors: the attack's superior successes, for entangling
 * @returns {Promise<ChatMessage>} The card
 */
export function postStrikeCheck(actor, check, { weaponName = "", superiors = 0 } = {}) {
  const label = game.i18n.format("ep2e.chat.dose.checkLabel", { aptitude: STRIKE_CHECKS[check].aptitude.toUpperCase() });
  return postCheckCard(actor, STRIKE_CHECK_KEY, {
    card: {
      icon: STRIKE_CHECKS[check].icon,
      iconImg: STRIKE_CHECKS[check].img,
      headline: game.i18n.format("ep2e.chat.strike.checkNeeded", { effect: game.i18n.localize(`ep2e.chat.strike.${check}.name`), name: actor.name, check: label }),
      rows: [
        ...(weaponName ? [{ label: game.i18n.localize("ep2e.chat.strike.weapon"), value: weaponName }] : []),
        { value: game.i18n.localize(`ep2e.chat.strike.${check}.rule`) }
      ]
    },
    button: { action: "rollStrikeCheck", label: game.i18n.format("ep2e.chat.strike.roll", { check: label }) },
    payload: { check, id: foundry.utils.randomID(), weaponName, superiors }
  });
}

/**
 * Rolls a hit's check, once: from its own card, or one of those on a damage card.
 * @param {String} messageId - The card's id
 * @param {String|null} [checkId] - The check on a damage card; none for a card of its own
 * @param {Object} [systemOptions] - Passed on to RollCheck; tests answer the dialog through it
 * @returns {Promise<*>} Whatever the roll returned, or null when nothing was rolled
 */
export function requestStrikeCheck(messageId, checkId = null, systemOptions = {}) {
  const prepare = ({ check, id, weaponName, superiors }, actor) => ({
    aptitude: STRIKE_CHECKS[check].aptitude,
    check: { actorUuid: actor.uuid, check, id, weaponName, superiors },
    ...(check === "confused" ? { flags: { acceptResult: true } } : {})
  });
  if (checkId) return requestCardCheck(messageId, "damageCard", prepare, systemOptions, { entryId: checkId, flag: STRIKE_CHECK_KEY });
  return requestCardCheck(messageId, STRIKE_CHECK_KEY, prepare, systemOptions);
}

/**
 * The buttons a damage card shows for its checks: one per check still open - named after the target
 * when the card holds several - and, for an area attack, the GM's choices for the NPCs' and Goons'
 * checks left: roll them all, or resolve them without a roll.
 * @param {Object} state - The damage card's state
 * @returns {Object} strikeButtons and strikeRest (whether the GM's choices show)
 */
export function strikeButtons(state) {
  const open = (state.checks ?? []).filter(entry => !entry.rolled);
  const several = new Set((state.checks ?? []).map(entry => entry.actorUuid)).size > 1;
  const strikeRest = state.area === true && open.some(entry => entry.npc);
  return {
    strikeButtons: open.map((entry, index) => ({
      id: entry.id,
      uuid: entry.actorUuid,
      primary: !strikeRest && index === open.length - 1,
      label: game.i18n.format(several ? "ep2e.chat.strike.resistFor" : "ep2e.chat.strike.resist", { name: entry.name, effect: game.i18n.localize(`ep2e.chat.strike.${entry.check}.name`) })
    })),
    strikeRest
  };
}

/**
 * The GM's roll of every NPC's and Goon's check still open on a damage card, without a dialog.
 * @param {ChatMessage} message - The damage card
 * @returns {Promise<void>} Resolves once all are rolled
 */
export async function rollRemainingStrikes(message) {
  const open = (message?.getFlag?.("eclipsephase", "damageCard")?.checks ?? []).filter(entry => entry.npc && !entry.rolled);
  const options = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } };
  await Promise.all(open.map(entry => requestStrikeCheck(message.id, entry.id, options)));
}

/**
 * The GM's ruling that the NPCs' and Goons' checks still open on a damage card need no roll: they
 * are taken off the card, and nothing comes of them.
 * @param {ChatMessage} message - The damage card
 * @returns {Promise<*>} What updateCard reported
 */
export function resolveRemainingStrikes(message) {
  const ids = (message?.getFlag?.("eclipsephase", "damageCard")?.checks ?? []).filter(entry => entry.npc && !entry.rolled).map(entry => entry.id);
  return ids.length ? updateCard(message, "damageCard", "checksResolved", { ids }) : null;
}

/**
 * What a check's result brings (Core p.216, 219, 220): the conditions and how long each runs - no
 * span until removed - and, for pain, whether the target must flee.
 * @param {String} check - The check's key
 * @param {Number} result - The result tier
 * @param {Number} value - The die
 * @returns {Object} conditions ({id, span} each), flee, and for confusion whether the table decides
 */
export function strikeOutcome(check, result, value) {
  const passed = isHit(result);
  const critical = result === TASK_RESULT.CRITICAL_FAILURE;
  const superior = superiorResults(result, value);
  const rounds = count => ({ value: count, units: "rounds" });
  const outcome = conditions => ({ conditions, flee: false });
  switch (check) {
    case "knockdown": return outcome(passed ? [] : [{ id: "prone" }]);
    case "unconscious": return outcome(passed ? [] : [{ id: "unconscious" }]);
    case "shock": return outcome(passed
      ? [{ id: "stunned", span: rounds(3) }]
      : [{ id: "prone" }, { id: "incapacitated", span: rounds(1 + 2 * superior) }, { id: "stunned", span: { value: 3, units: "minutes" } }]);
    case "stun": return outcome(passed ? [] : critical
      ? [{ id: "incapacitated", span: rounds(1) }, { id: "stunned", span: { value: 1, units: "minutes" } }]
      : [{ id: "stunned", span: rounds(1 + superior) }]);
    case "blinding": return outcome(passed ? [] : [{ id: "blinded", ...(critical ? {} : { span: rounds(1 + superior) }) }]);
    case "entangling": return outcome(passed ? [] : [{ id: "grappled" }]);
    case "pain": return { conditions: [], flee: !passed };
    case "confused": return { conditions: [], flee: false, confusion: !passed };
    default: return outcome([]);
  }
}

/**
 * How long a condition runs, as the outcome card gives it.
 * @param {Object} [span] - {value, units}
 * @returns {String} e.g. "3 action turns", "" without a span
 */
export function spanText(span) {
  if (!span?.value) return "";
  if (span.units === "rounds") return game.i18n.format(span.value === 1 ? "ep2e.chat.strike.spanRound" : "ep2e.chat.strike.spanRounds", { count: span.value });
  return game.i18n.format("ep2e.chat.strike.spanMinutes", { count: span.value });
}

/**
 * Settles a hit's check: what an earlier result of it put on goes, what this one brings is put on,
 * and a card says what that is, seen as the check's roll was. A pool point spent on the check
 * settles it again. A confused character's check settles once: on the roll, or - while a pool point
 * could still turn it - once its result is accepted; a failure has the table decide what they do.
 * @param {Object} check - The strikeCheck the roll carried
 * @param {Number} result - The result tier as it now stands
 * @param {Number} value - The die as it now stands
 * @param {ChatMessage} [roll] - The check's roll card
 * @param {Object} [options] - byPool: settled again by a pool point; accepted: its result accepted
 * @returns {Promise<Object|null>} The outcome, or null when the target is gone or it waits
 */
export async function settleStrikeCheck(check, result, value, roll = null, { byPool = false, accepted = false } = {}) {
  const actor = await fromUuid(check.actorUuid);
  if (!actor) return null;
  const whisper = roll ? roll.whisper ?? [] : null;
  if (check.check === "confused") {
    const waits = byPool || roll?.getFlag?.("eclipsephase", "taskCard")?.data?.alternatives?.options?.available === true;
    if (waits && !accepted) return null;
    const outcome = strikeOutcome(check.check, result, value);
    if (!outcome.confusion) await postCard(actor, { icon: STRIKE_CHECKS.confused.icon, iconImg: STRIKE_CHECKS.confused.img, headline: game.i18n.format("ep2e.chat.confusion.clear", { name: actor.name }) }, {}, whisper);
    else await rollConfusion(actor, { whisper, blind: roll?.blind === true });
    return outcome;
  }
  const earlier = Array.from(actor.effects ?? []).filter(effect => effect.getFlag?.("eclipsephase", STRIKE_CHECK_KEY) === check.id);
  if (earlier.length) await actor.deleteEmbeddedDocuments("ActiveEffect", earlier.map(effect => effect.id));
  const outcome = strikeOutcome(check.check, result, value);
  for (const { id, span } of outcome.conditions) await inflictCondition(actor, id, { span, flags: { [STRIKE_CHECK_KEY]: check.id } });
  const names = outcome.conditions.map(({ id, span }) => {
    const name = game.i18n.localize(`ep2e.conditions.${id}.name`);
    return span ? `${name} (${spanText(span)})` : name;
  });
  const headline = outcome.flee
    ? game.i18n.format("ep2e.chat.strike.flee", { name: actor.name })
    : names.length
      ? game.i18n.format("ep2e.chat.strike.outcome", { name: actor.name, conditions: names.join(", ") })
      : game.i18n.format("ep2e.chat.strike.resisted", { name: actor.name, effect: game.i18n.localize(`ep2e.chat.strike.${check.check}.name`) });
  await postCard(actor, { icon: STRIKE_CHECKS[check.check].icon, iconImg: STRIKE_CHECKS[check.check].img, headline }, {}, whisper);
  return outcome;
}

/**
 * Accepts a confused character's check as it stands - after a pool point, if one was spent - and
 * settles it: the table decides on a failure.
 * @param {ChatMessage} message - The check's roll card
 * @returns {Promise<Object|null>} The outcome, or null when there is nothing to accept
 */
export async function acceptStrikeCheck(message) {
  const roll = message?.getFlag?.("eclipsephase", "roll");
  if (!roll?.strikeCheck || message.getFlag("eclipsephase", "taskCard")?.accepted) return null;
  await updateCard(message, "taskCard", "accepted");
  const value = Number(message.getFlag("eclipsephase", "taskCard")?.data?.rollResult) || 0;
  return settleStrikeCheck(roll.strikeCheck, spentOrOriginalResult(roll), value, message, { accepted: true });
}

/**
 * What a confused character does by the d100 (Core p.226).
 * @param {Number} value - The d100, 00-99
 * @returns {String} A key of CONFUSION_TABLE
 */
export function confusionResult(value) {
  return CONFUSION_TABLE[Math.min(3, Math.floor((Number(value) || 0) / 25))];
}

/**
 * Rolls the d100 that decides what a confused character who failed the COG Check does, and posts it
 * on a card of its own, seen as the check was.
 * @param {Actor} actor - The confused character
 * @param {Object} [visibility] - whisper (user ids, empty for public) and blind
 * @returns {Promise<String>} What they do, a key of CONFUSION_TABLE
 */
export async function rollConfusion(actor, { whisper = [], blind = false } = {}) {
  const value = await rollOnTable(actor, roll => ({
    icon: STRIKE_CHECKS.confused.icon,
    iconImg: STRIKE_CHECKS.confused.img,
    rollTitle: "ep2e.chat.confusion.rollTitle",
    headline: game.i18n.format("ep2e.chat.confusion.headline", { name: actor.name }),
    outcome: game.i18n.format(`ep2e.chat.confusion.${confusionResult(roll)}`, { name: actor.name })
  }), { recipientList: whisper ?? [], blind });
  return confusionResult(value);
}

/**
 * Asks a confused character for the COG Check at the start of each of their turns in a combat. Done
 * by the active GM; the card reaches the character's owners.
 * @param {Combat} combat - The combat whose turn changed
 * @returns {Promise<ChatMessage|null>} The card, or null when the one now acting is not confused
 */
export function confusionOnTurn(combat) {
  const actor = combat?.combatant?.actor;
  if (!game.user.isActiveGM || !actor || !isUnder(actor, "confused")) return null;
  return postStrikeCheck(actor, "confused");
}

/**
 * The modifiers a hit's check brings: the armour that adds to it, the attack's superior successes
 * against entangling, Pain Tolerance I against pain and the check's own, such as confusion's -30.
 * @param {Object} check - The strikeCheck the roll carried
 * @returns {Object[]} text and value each
 */
export function strikeModifiers(check) {
  const actor = fromUuidSync(check.actorUuid);
  const armor = STRIKE_CHECKS[check.check]?.armor;
  const found = [];
  const worn = armor && actor ? armorAgainst(actor, armor) : 0;
  if (worn) found.push({ text: game.i18n.localize(`ep2e.chat.strike.armor.${armor}`), value: worn });
  if (check.check === "entangling" && check.superiors) found.push({ text: game.i18n.localize("ep2e.chat.strike.attackSuperiors"), value: -10 * check.superiors });
  if (check.check === "pain" && Number(actor?.system?.additionalSystems?.painTolerance) === 1) found.push({ text: game.i18n.localize("ep2e.chat.strike.painTolerance"), value: PAIN_TOLERANCE_BONUS });
  const own = STRIKE_CHECKS[check.check]?.modifier;
  if (own) found.push({ text: game.i18n.localize(`ep2e.chat.strike.${check.check}.name`), value: own });
  return found;
}

/**
 * Hangs a hit's checks on the roll pipeline: their modifiers land on the roll, and the result -
 * or a pool point that turns it - settles what they bring.
 * @returns {void}
 */
export function registerStrikeChecks() {
  registerCheckCard(STRIKE_CHECK_KEY);
  modifiersOnRoll(STRIKE_CHECK_KEY, strikeModifiers);
  settleOnRoll(STRIKE_CHECK_KEY, (check, passed, { result, value, message, byPool }) => settleStrikeCheck(check, result, value, message, { byPool }));
  Hooks.on("combatTurnChange", combat => confusionOnTurn(combat));
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (foundry.utils.getProperty(foundry.utils.expandObject(changes), "system.physical.wounds") !== undefined) WOUNDS_BEFORE.set(actor.uuid, Number(actor.system?.physical?.wounds) || 0);
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => woundCheck(actor, options, userId));
}

// The wounds an actor had before an update that changes them, until the update has gone through.
const WOUNDS_BEFORE = new Map();

/**
 * Asks for a wound's check whenever wounds are added (Core p.220) - by damage, the sheet or typed in -
 * on the client that added them; the card reaches the actor's owners. Damage whose caller asks for
 * the check itself, as an attack's does, says so in its update.
 * @param {Actor} actor - The actor updated
 * @param {Object} options - The update's options
 * @param {String} userId - Who updated it
 * @returns {Promise<Object[]|null>} What strikeChecks returned, or null when no wound was added
 */
export async function woundCheck(actor, options, userId) {
  if (!WOUNDS_BEFORE.has(actor.uuid)) return null;
  const before = WOUNDS_BEFORE.get(actor.uuid);
  WOUNDS_BEFORE.delete(actor.uuid);
  const gained = (Number(actor.system?.physical?.wounds) || 0) - before;
  if (userId !== game.user.id || options?.eclipsephase?.woundCheck === false || gained < 1) return null;
  return strikeChecks(actor, { wounds: gained });
}
