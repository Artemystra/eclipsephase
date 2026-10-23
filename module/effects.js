import { strainSubstrate, boundToActiveBody } from "./common/morp-functions.js";
import { endExpiredChiPushes } from "./rolls/psi.js";
import { deleteRunOutTempEffects } from "./common/general-sheet-functions.js";
import { endRunOutDoses } from "./common/doses.js";
import { durationRunOut, TEMP_EFFECT_FLAGS } from "./common/time.js";
import { owningActor } from "./rolls/pools.js";

const EP2eActiveEffectBaseDataModel =
  foundry.data?.ActiveEffectTypeDataModel ??
  foundry.abstract.TypeDataModel;

/**
 * Whether an item's own effects are a blueprint rather than effects that ever apply by themselves.
 * A drug's effects describe what one dose does: taking a dose copies them onto the actor for as
 * long as the dose lasts, so the copies sitting on the item must never apply - least of all
 * because the item is at hand, which only ever meant the drug is carried, not taken.
 * @param {Item} item - The item carrying the effect
 * @returns {Boolean} True when the item's own effects never apply
 */
function isEffectBlueprint(item) {
  return item.type === "drug";
}

//Effect-Supression on Morph Switch
export class EP2eActiveEffectData extends EP2eActiveEffectBaseDataModel {
  static defineSchema() {
    if (foundry.data?.ActiveEffectTypeDataModel) {
      return super.defineSchema();
    }
    return {};
  }

  /**
   * Whether this effect should be left out of the actor's data. An effect whose duration has run
   * out is suppressed whatever else is true of it - that is how a timed effect stops applying,
   * since Foundry marks it expired rather than deleting it.
   * @returns {boolean}
   */
  get isSuppressed() {
    if (this.parent?.duration?.expired === true) return true;
    return this.#suppressedByBodyRules();
  }

  /**
   * The system's own suppression rules: morph binding for ware and traits, the equipped flag for
   * carried items, and the nervous-system rules for sleights.
   * @returns {boolean}
   */
  #suppressedByBodyRules() {
    const effect = this.parent;
    const item = effect.parent;
    if (!(item instanceof Item)) return false;

    const actor = item.parent;
    if (!(actor instanceof Actor)) return false;

    // Normalize item type (system-specific!)
    const t = item.type;

    // --- Case A: Traits / Ware are morph-bound
    // (only suppress when item is boundTo a different active morph)
    if (t === "traits" || t === "ware") return !boundToActiveBody(actor, item);

    if (isEffectBlueprint(item)) return true;

    // --- Case B: Gear / Weapons / Armor depend on an "active/equipped" flag
    // (suppress if not active). For Armor, "active" isn't a manual toggle anymore - EPitem.js
    // keeps it in sync with whether the body it's boundTo is the currently active/jammed one,
    // so this check alone already covers body-relevance without a separate case here.
    if (t === "gear" || t === "weapon" || t === "armor" || t === "rangedWeapon" || t === "ccWeapon" || t === "ammo" || t === "grenade") {
      // Change this path to whatever you actually store: active, equipped, carried, worn, etc.
      const isActive = !!item.system?.active; // or item.system.equipped / item.system.worn / etc.

      const suppressed = !isActive;
      // console.debug("[EP2e] equipment suppression", { item: item.name, isActive, suppressed });
      return suppressed;
    }

    // --- Case C: brain/nervous-system rules, plus Psi's jamming suppression
    const result = { suppressed: t === "aspect"
      ? strainSubstrate(actor, item.system?.strainFamily ?? "psi").blocked
      : false };
    Hooks.callAll("eclipsephase.effectSuppression", item, actor, result);
    return result.suppressed;
  }
}

/**
 * Takes a system effect off once Foundry has marked it expired: a chi push ends, a temporary
 * effect and a dose are deleted. Anything else Foundry marked is left alone.
 * @param {ActiveEffect} effect - The effect just marked expired
 * @returns {Promise<void>} Resolves once the clean-up has run
 */
export async function cleanUpExpired(effect) {
  const actor = owningActor(effect);
  if (!actor) return;
  await endExpiredChiPushes(actor, [effect]);
  await deleteRunOutTempEffects(actor, [effect]);
  await endRunOutDoses(actor, [effect]);
  await sweepTokenCopies(actor, effect);
}

/**
 * Removes what an expired effect of a world actor leaves behind on its unlinked tokens. Foundry
 * marks the tokens' inherited copies expired too, and marking an inherited copy writes it into the
 * token's own data; once the world actor's effect is gone, that written copy stays behind,
 * inactive. Waits a tick so the tokens have rebuilt from the world actor first.
 * @param {Actor} actor - The actor the effect expired on
 * @param {ActiveEffect} effect - The expired effect
 * @returns {Promise<void>} Resolves once every left-behind copy is gone
 */
export async function sweepTokenCopies(actor, effect) {
  if (actor.isToken || typeof actor.getDependentTokens !== "function") return;
  const systemEffect = TEMP_EFFECT_FLAGS.some(flag => effect.getFlag?.("eclipsephase", flag) !== undefined);
  if (!systemEffect) return;

  await new Promise(resolve => setTimeout(resolve, 0));
  for (const token of actor.getDependentTokens()) {
    const copy = Array.from(token.actor?.effects ?? []).find(candidate => candidate.id === effect.id);
    if (copy && durationRunOut(copy)) await token.actor.deleteEmbeddedDocuments("ActiveEffect", [copy.id]);
  }
}

/**
 * Hangs the clean-up on Foundry's own expiry, and marks the system's clock-timed effects whose time
 * is up when the clock moves, which Foundry leaves running during a combat. When the clock runs an
 * effect out, Foundry's effect registry marks it expired with an update and does not wait for the
 * actor's duration hook;
 * deleting from that hook raced the update and left the server updating effects already gone.
 * Waiting for the update to land - on the client that made it, the active GM's - lets the two
 * happen one after the other.
 * @returns {void}
 */
export function registerExpiryCleanup() {
  Hooks.on("updateActiveEffect", (effect, changes, options, userId) => {
    if (userId !== game.user.id) return;
    const expired = changes?.["duration.expired"] ?? foundry.utils.getProperty(changes ?? {}, "duration.expired");
    if (expired !== true) return;
    cleanUpExpired(effect);
  });
  Hooks.on("updateWorldTime", () => expireOverdue());
}

// The duration units an effect runs on the clock with, rather than on combat turns.
const CLOCK_UNITS = ["seconds", "minutes", "hours", "days", "weeks", "months", "years"];

/**
 * The system's clock-timed effects whose time is up but which Foundry has not marked expired. An
 * effect given an expiry event - Foundry sets "turnStart" once its duration is changed - waits for
 * its actor's next turn while that actor is in combat, however far the clock was moved. An effect
 * counted in rounds is meant to end on a turn and is left alone.
 * @param {ActiveEffect[]} effects - The effects to look through
 * @returns {ActiveEffect[]} The overdue ones
 */
export function overdueByClock(effects) {
  const units = CONST.ACTIVE_EFFECT_TIME_DURATION_UNITS ?? CLOCK_UNITS;
  return effects.filter(effect => TEMP_EFFECT_FLAGS.some(flag => effect.getFlag?.("eclipsephase", flag) !== undefined)
    && units.includes(effect.duration?.units)
    && effect.duration?.expired !== true
    && durationRunOut(effect));
}

/**
 * Marks the system's overdue clock-timed effects expired once the clock has moved, so they end on
 * time during a combat as well; their clean-up follows from the mark. Runs on the active GM.
 * @returns {Promise<void>} Resolves once they are marked
 */
export async function expireOverdue() {
  if (!game.users?.activeGM?.isSelf) return;
  const effects = ActiveEffect.registry ? Array.from(ActiveEffect.registry) : game.actors.contents.flatMap(actor => Array.from(actor.effects));
  for (const effect of overdueByClock(effects)) await effect.update({ "duration.expired": true });
}
