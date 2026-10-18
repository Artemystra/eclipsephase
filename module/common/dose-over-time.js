import { rollToChat, WEAPON_DAMAGE_OUTPUT } from "../rolls/dice.js";
import { gmList, diceFormula } from "./general-sheet-functions.js";
import { conditionData } from "./dose-checks.js";
import { postDrugCard } from "./doses.js";
import { GLOBAL_MOD_KEY } from "./global-mod.js";

// Toxins that keep working while they run (Core p.334-335): Necrosis's DV 1d6 every action turn,
// BTX2's DV 2d10 + 10 for three turns, CR Gas's single DV 1d6, Disruptor's -5 to all actions that
// grows every hour. Everything is counted from the world time elapsed since the dose took hold,
// so a jump of the clock settles every tick it skipped at once.

const SECONDS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
const settling = new Map();

/**
 * How many seconds one tick of an effect over time lasts.
 * @param {String} interval - "turn" or "hour"
 * @returns {Number} Seconds per tick
 */
function intervalSeconds(interval) {
  if (interval === "hour") return SECONDS.hours;
  return Number(CONFIG.time?.roundTime) || 3;
}

/**
 * How long a dose runs, in seconds, or Infinity for one that runs until ended.
 * @param {ActiveEffect} effect - The dose
 * @returns {Number} The span
 */
function doseSeconds(effect) {
  const { value, units } = effect?.duration ?? {};
  if (!Number.isFinite(value) || value <= 0) return Infinity;
  const unit = units === "rounds" || units === "turns" ? intervalSeconds("turn") : SECONDS[units];
  return unit ? value * unit : Infinity;
}

/**
 * Seconds since the dose took hold.
 * @param {ActiveEffect} effect - The dose
 * @param {Number} now - The world time
 * @returns {Number} Elapsed seconds, never negative
 */
function elapsedSeconds(effect, now) {
  const start = Number(effect?.start?.time);
  return Number.isFinite(start) ? Math.max(0, now - start) : 0;
}

/**
 * Whether a drug does anything over time.
 * @param {Object} overTime - The drug's or the dose's overTime
 * @returns {Boolean} True for damage per tick or a growing modifier
 */
export function hasOverTime(overTime) {
  return !!diceFormula(overTime?.damage) || !!Number(overTime?.modifier);
}

/**
 * How many damage ticks are due by now. The first lands when the dose takes hold, then one per
 * interval, up to the drug's count or, without one, for as long as the dose runs.
 * @param {Object} overTime - The dose's overTime
 * @param {ActiveEffect} effect - The dose
 * @param {Number} now - The world time
 * @returns {Number} Ticks due in total
 */
export function damageTicksDue(overTime, effect, now) {
  if (!diceFormula(overTime?.damage)) return 0;
  const step = intervalSeconds(overTime.interval);
  const cap = Number(overTime.ticks) > 0 ? Number(overTime.ticks) : Math.floor(doseSeconds(effect) / step);
  return Math.min(Math.floor(elapsedSeconds(effect, now) / step) + 1, cap);
}

/**
 * How many steps a growing modifier has taken by now: the first as the dose takes hold, then one
 * per full interval, up to the dose's span.
 * @param {Object} overTime - The dose's overTime
 * @param {ActiveEffect} effect - The dose
 * @param {Number} now - The world time
 * @returns {Number} Steps in total
 */
export function modifierStepsDue(overTime, effect, now) {
  if (!Number(overTime?.modifier)) return 0;
  const step = intervalSeconds(overTime.interval);
  const cap = Math.max(1, Math.floor(doseSeconds(effect) / step));
  return Math.min(Math.floor(elapsedSeconds(effect, now) / step) + 1, cap);
}

/**
 * The damage of several ticks as one formula, e.g. 20d6 for twenty turns of Necrosis.
 * @param {Object} damage - {d10, d6, bonus} of one tick
 * @param {Number} ticks - How many ticks
 * @returns {String} The combined formula
 */
export function combinedDamage(damage, ticks) {
  return diceFormula({ d10: (Number(damage?.d10) || 0) * ticks, d6: (Number(damage?.d6) || 0) * ticks, bonus: (Number(damage?.bonus) || 0) * ticks });
}

/**
 * Splits one roll for several ticks back into the ticks it stands for: each takes its own dice, in
 * the order they were rolled, plus the flat bonus of one tick.
 * @param {Roll} roll - The evaluated combined roll
 * @param {Object} damage - {d10, d6, bonus} of one tick
 * @param {Number} ticks - How many ticks the roll covers
 * @returns {Object[]} One dice breakdown per tick: tens, sixes, bonus as shown, total and its number
 */
export function tickBreakdowns(roll, damage, ticks) {
  const per = { 10: Number(damage?.d10) || 0, 6: Number(damage?.d6) || 0 };
  const bonus = Number(damage?.bonus) || 0;
  const pools = { 10: [], 6: [] };
  for (const die of roll?.dice ?? []) {
    if (pools[die.faces]) pools[die.faces].push(...(die.results ?? []).filter(result => result.active !== false));
  }
  if (!pools[10].length && !pools[6].length) return [{ tens: [], sixes: [], hundreds: [], bonus: "", total: roll.total, rollNumber: 1, rollType: "rollOutput" }];

  return Array.from({ length: ticks }, (_, tick) => {
    const tens = pools[10].slice(tick * per[10], (tick + 1) * per[10]);
    const sixes = pools[6].slice(tick * per[6], (tick + 1) * per[6]);
    const total = [...tens, ...sixes].reduce((sum, result) => sum + result.result, 0) + bonus;
    return { tens, sixes, hundreds: [], bonus: bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : "", total, rollNumber: tick + 1, rollType: "rollOutput" };
  });
}

/**
 * Rolls the damage of the ticks that came due in one roll, then deals it tick by tick, so each
 * tick is measured against the Wound Threshold on its own. Armour does not stop a toxin.
 * @param {Actor} actor - The actor the dose is on
 * @param {Object} dose - The dose flag
 * @param {Number} ticks - How many ticks to roll
 * @returns {Promise<Number[]>} The damage of each tick
 */
async function dealTickDamage(actor, dose, ticks) {
  const roll = await new Roll(combinedDamage(dose.overTime.damage, ticks)).evaluate();
  const perTick = tickBreakdowns(roll, dose.overTime.damage, ticks);
  const output = {
    type: "defaultDamage",
    copy: game.i18n.format("ep2e.chat.dose.overTimeFlavor", { name: dose.name, count: ticks }),
    rollTitle: "ep2e.roll.announce.total",
    diceArray: perTick.length > 1 ? perTick : null
  };
  await rollToChat(null, output, WEAPON_DAMAGE_OUTPUT, roll, actor.name, actor.type === "character" ? null : gmList(), false, "rollOutput");
  for (const tick of perTick) await actor.modifyTokenAttribute("health.physical", tick.total, true, true);
  return perTick.map(tick => tick.total);
}

/**
 * Sets a growing modifier on the dose: one change on the modifier to all actions, kept apart from
 * the drug's own changes by its index, rewritten as it grows.
 * @param {ActiveEffect} effect - The dose
 * @param {Object} state - The dose's overTimeState
 * @param {Number} value - The modifier now
 * @returns {Promise<Number>} The index of the change
 */
async function setGrowingModifier(effect, state, value) {
  const changes = foundry.utils.deepClone(effect.system?.changes ?? effect.changes ?? []);
  const change = { key: GLOBAL_MOD_KEY, value: String(value), priority: null, type: "add" };
  let index = Number.isInteger(state.changeIndex) ? state.changeIndex : -1;
  if (index >= 0 && index < changes.length) changes[index] = change;
  else index = changes.push(change) - 1;
  await effect.update({ "system.changes": changes, "flags.eclipsephase.dose.overTimeState.changeIndex": index });
  return index;
}

/**
 * Incapacitates the actor once a growing penalty reaches their Durability - Disruptor's paralysis.
 * Lasts as long as the dose and goes with it.
 * @param {Actor} actor - The actor
 * @param {ActiveEffect} effect - The dose
 * @param {Object} dose - The dose flag
 * @param {Number} value - The penalty now
 * @returns {Promise<Boolean>} True when the condition was put on
 */
async function incapacitateAtDurability(actor, effect, dose, value) {
  const durability = Number(actor.system?.health?.physical?.max) || 0;
  if (!dose.overTime.incapacitates || !durability || Math.abs(value) < durability) return false;
  const already = Array.from(actor.effects ?? []).some(entry => entry.getFlag?.("eclipsephase", "incapacitatedBy") === effect.id);
  if (already) return false;
  await actor.createEmbeddedDocuments("ActiveEffect", [conditionData(dose.name, effect, "incapacitated", null)]);
  await postDrugCard(actor, { icon: "fa-syringe", color: "--negative", headline: game.i18n.format("ep2e.chat.dose.outcomeIncapacitated", { name: dose.name }) });
  return true;
}

/**
 * Whether the dose on an unlinked token is only the world actor's own dose shown on it. The world
 * actor's dose does the work; its copies on the tokens would deal every tick once more.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The dose
 * @returns {Boolean} True for an inherited copy
 */
function inheritedCopy(actor, effect) {
  return actor?.isToken === true && Array.from(actor.token?.baseActor?.effects ?? []).some(entry => entry.id === effect.id);
}

/**
 * Brings one dose's effects over time up to the world time: deals the damage of every tick due
 * and not yet dealt, grows the modifier to the steps due. The progress is written to the dose
 * before anything is rolled, so a second call cannot deal the same tick twice.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The dose
 * @param {Number} [now] - The world time
 * @returns {Promise<Object|null>} ticks and steps settled, or null when nothing was due
 */
export async function settleOverTime(actor, effect, now = game.time.worldTime) {
  const dose = effect?.getFlag?.("eclipsephase", "dose");
  if (!dose || !hasOverTime(dose.overTime) || !effect.active || inheritedCopy(actor, effect)) return null;
  const state = dose.overTimeState ?? {};
  const ticks = damageTicksDue(dose.overTime, effect, now) - (Number(state.ticks) || 0);
  const steps = modifierStepsDue(dose.overTime, effect, now);
  const grew = steps !== (Number(state.steps) || 0);
  if (ticks <= 0 && !grew) return null;

  await effect.update({
    "flags.eclipsephase.dose.overTimeState.ticks": (Number(state.ticks) || 0) + Math.max(0, ticks),
    "flags.eclipsephase.dose.overTimeState.steps": steps
  });
  if (grew) {
    const value = Number(dose.overTime.modifier) * steps;
    await setGrowingModifier(effect, state, value);
    await incapacitateAtDurability(actor, effect, dose, value);
  }
  if (ticks > 0) await dealTickDamage(actor, dose, ticks);
  return { ticks: Math.max(0, ticks), steps };
}

/**
 * Settles a dose one call at a time: a call arriving while the dose is still being settled runs
 * once more after it, never alongside it.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The dose
 * @returns {Promise<void>} Resolves once settled
 */
async function settleInTurn(actor, effect) {
  const key = effect.uuid ?? effect.id;
  if (settling.has(key)) {
    settling.set(key, true);
    return;
  }
  settling.set(key, false);
  try {
    do {
      settling.set(key, false);
      await settleOverTime(actor, effect);
    } while (settling.get(key) === true && Array.from(actor.effects ?? []).some(entry => entry.id === effect.id));
  } finally {
    settling.delete(key);
  }
}

/**
 * Every dose with effects over time that is running anywhere: on the world's actors, and on the
 * unlinked tokens whose effects Foundry tracks.
 * @returns {Object[]} actor and effect per dose
 */
function dosesOverTime() {
  const found = new Map();
  const consider = effect => {
    const actor = effect?.parent;
    if (!actor || !(actor instanceof Actor) || effect.getFlag?.("eclipsephase", "dose") === undefined) return;
    if (!hasOverTime(effect.getFlag("eclipsephase", "dose").overTime)) return;
    found.set(effect.uuid ?? `${actor.uuid}.${effect.id}`, { actor, effect });
  };
  for (const actor of game.actors ?? []) for (const effect of actor.effects ?? []) consider(effect);
  for (const effect of foundry.documents.ActiveEffect?.registry ?? []) consider(effect);
  return [...found.values()];
}

/**
 * Runs the effects over time on the active GM's client: when a dose takes hold or is renewed, so a
 * first tick lands at once, and whenever the world time moves - the clock, or a new combat round.
 * Foundry's own duration report is not enough: it only fires when the remaining time changes in
 * the dose's own unit, so an hour-long BTX2 would report nothing until its hour ran out.
 * @returns {void}
 */
export function registerOverTimeHooks() {
  Hooks.on("createActiveEffect", effect => {
    if (!game.users.activeGM?.isSelf || effect.getFlag?.("eclipsephase", "dose") === undefined) return;
    const actor = effect.parent;
    if (actor) settleInTurn(actor, effect);
  });
  Hooks.on("updateActiveEffect", (effect, changes) => {
    if (!game.users.activeGM?.isSelf || changes?.start === undefined || effect.getFlag?.("eclipsephase", "dose") === undefined) return;
    const actor = effect.parent;
    if (actor) settleInTurn(actor, effect);
  });
  Hooks.on("updateWorldTime", () => {
    if (!game.users.activeGM?.isSelf) return;
    for (const { actor, effect } of dosesOverTime()) settleInTurn(actor, effect);
  });
}
