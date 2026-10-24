import { strainSubstrate, boundToActiveBody } from "./common/body-markers.js";

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