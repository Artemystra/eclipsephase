import { elapsedTime } from "./time.js";

const MANAGED_TYPES = ["character", "npc", "goon"];

const RECHARGE_FIELDS = ["short1", "short2", "shortExtra", "long"];

// RAW: a short recharge is a task action with a timeframe of 10 minutes, a long one 4 hours.
// Biomorphs without biomods need longer for both.
const DURATIONS = {
  short: { withBiomods: "ep2e.recharge.duration.shortBiomods", without: "ep2e.recharge.duration.shortFlat" },
  long: { withBiomods: "ep2e.recharge.duration.longBiomods", without: "ep2e.recharge.duration.longFlat" }
};

/**
 * Whether the actor's body carries biomods, which is what decides how long a recharge takes. The
 * marker is the same one the healing dialog reads.
 * @param {Actor} actor - The recharging actor
 * @returns {Boolean} True when biomods are present
 */
export function hasBiomods(actor) {
  return actor?.system?.additionalSystems?.healing?.biomods === true;
}

/**
 * How long a recharge takes this actor, as a localization key.
 * @param {Actor} actor - The recharging actor
 * @param {String} restType - Either "short" or "long"
 * @returns {String} The key naming the duration
 */
export function rechargeDurationKey(actor, restType) {
  const entry = DURATIONS[restType] ?? DURATIONS.short;
  return hasBiomods(actor) ? entry.withBiomods : entry.without;
}

/**
 * The campaign day an actor's recharge allowances were last reset on, or null when the actor has
 * never been stamped.
 * @param {Actor} actor - The actor
 * @returns {Number|null} The day, or null
 */
export function stampedDay(actor) {
  const day = foundry.utils.getProperty(actor, "flags.eclipsephase.rechargeDay");
  return Number.isFinite(day) ? day : null;
}

/**
 * What a day change means for one actor: nothing, a first stamp, or a reset of its allowances.
 * An actor that has never been stamped is only stamped, never reset, so that switching the
 * setting on does not hand everybody a fresh set of recharges.
 * @param {Actor} actor - The actor to judge
 * @param {Number} today - The current campaign day
 * @returns {Object|null} An update payload for the actor, or null when nothing is due
 */
export function rechargeResetUpdate(actor, today) {
  if (!MANAGED_TYPES.includes(actor?.type)) return null;

  const stamped = stampedDay(actor);
  if (stamped === today) return null;
  if (stamped === null) return { "flags.eclipsephase.rechargeDay": today };

  const update = { "flags.eclipsephase.rechargeDay": today };
  for (const field of RECHARGE_FIELDS) update[`system.rest.${field}`] = false;
  return update;
}

/**
 * Resets the recharge allowances of every managed actor whose stamp predates the current day.
 * Runs on the active GM's client only, since it writes to actors a player may not own.
 * @returns {Promise<void>} Resolves once every due actor has been updated
 */
export async function resetRechargesForNewDay() {
  if (!game.users.activeGM?.isSelf) return;
  if (!game.settings.get("eclipsephase", "rechargeAutoReset")) return;

  const today = elapsedTime(game.time.worldTime).day;
  for (const actor of game.actors) {
    const update = rechargeResetUpdate(actor, today);
    if (update) await actor.update(update);
  }
}
