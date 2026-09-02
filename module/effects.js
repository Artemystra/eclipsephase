const EP2eActiveEffectBaseDataModel =
  foundry.data?.ActiveEffectTypeDataModel ??
  foundry.abstract.TypeDataModel;

//Effect-Supression on Morph Switch
export class EP2eActiveEffectData extends EP2eActiveEffectBaseDataModel {
  static defineSchema() {
    if (foundry.data?.ActiveEffectTypeDataModel) {
      return super.defineSchema();
    }
    return {};
  }

  /** @returns {boolean} */
  get isSuppressed() {
    const effect = this.parent;
    const item = effect.parent;
    if (!(item instanceof Item)) return false;

    const actor = item.parent;
    if (!(actor instanceof Actor)) return false;

    // Normalize item type (system-specific!)
    const t = item.type;

    // --- Case A: Traits / Ware are morph-bound
    // (only suppress when item is boundTo a different active morph)
    if (t === "traits" || t === "ware") {

      //NPCs & Threats morph mods will never be suppressed
      if(actor.type !== "character") return false;

      const boundTo = item.system?.boundTo;
      if (!boundTo) return false; // not morph-bound => never suppressed by morph switching

      const activeMorph = actor.system?.activeMorph;
      if (!activeMorph) return false;

      // While jamming, the ego is sleeved into the remote body instead of its own morph:
      // ware/traits bound to the original morph must be suppressed just like any other resleeve,
      // while anything bound to the jammed vehicle itself (if ever supported) stays active.
      // Some ware (e.g. Drone Rig) is specifically meant to keep working while jamming, so it
      // opts out of the jam-suppression and is only ever checked against the sleeved morph.
      const activeJam = actor.system?.activeJam;
      const staysActiveWhileJamming = !!item.system?.additionalSystems?.staysActiveWhileJamming;
      const activeBody = (activeJam && !staysActiveWhileJamming) ? activeJam : activeMorph;

      const suppressed = boundTo !== activeBody;
      // console.debug("[EP2e] morph suppression", { item: item.name, boundTo, activeBody, suppressed });
      return suppressed;
    }

    // --- Case B: Gear / Weapons / Armor depend on an "active/equipped" flag
    // (suppress if not active). For Armor, "active" isn't a manual toggle anymore - EPitem.js
    // keeps it in sync with whether the body it's boundTo is the currently active/jammed one,
    // so this check alone already covers body-relevance without a separate case here.
    if (t === "gear" || t === "weapon" || t === "armor" || t === "rangedWeapon" || t === "ccWeapon" || t === "ammo" || t === "grenade" || t === "drug") {
      // Change this path to whatever you actually store: active, equipped, carried, worn, etc.
      const isActive = !!item.system?.active; // or item.system.equipped / item.system.worn / etc.

      const suppressed = !isActive;
      // console.debug("[EP2e] equipment suppression", { item: item.name, isActive, suppressed });
      return suppressed;
    }

    // --- Case C: Psi is suppressed while jamming; Ki is suppressed unless every body in the chain has a Cyberbrain.
    if (t === "aspect") {
      const strainFamily = item.system?.strainFamily ?? "psi";
      if (strainFamily === "ki") {
        const hasCyberbrain = (bodyId) => !!bodyId && actor.items?.some(wareCheck =>
          wareCheck.type === "ware" &&
          wareCheck.system?.boundTo === bodyId &&
          wareCheck.effects?.some(e => e.changes?.some(c => c.key === "flags.eclipsephase.grantsCyberbrain")));
        const activeJam = actor.system?.activeJam;
        return !hasCyberbrain(actor.system?.activeMorph) || (!!activeJam && !hasCyberbrain(activeJam));
      }
      return !!actor.system?.activeJam || !!foundry.utils.getProperty(actor, "flags.eclipsephase.psiJamSuppression");
    }

    // Default: don't suppress other item effects
    return false;
  }
}