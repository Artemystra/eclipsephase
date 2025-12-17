//Effect-Supression on Morph Switch
export class EP2eActiveEffectData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
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
    if (t === "trait" || t === "ware" || t === "flaw") {

      //NPCs & Threats morph mods will never be suppressed
      if(actor.type !== "character") return false;

      const boundTo = item.system?.boundTo;
      if (!boundTo) return false; // not morph-bound => never suppressed by morph switching

      const activeMorph = actor.system?.activeMorph;
      if (!activeMorph) return false;

      const suppressed = boundTo !== activeMorph;
      // console.debug("[EP2e] morph suppression", { item: item.name, boundTo, activeMorph, suppressed });
      return suppressed;
    }

    // --- Case B: Gear / Weapons / Armor depend on an "active/equipped" flag
    // (suppress if not active)
    if (t === "gear" || t === "weapon" || t === "armor" || t === "rangedWeapon" || t === "ccWeapon" || t === "ammo" || t === "grenade" || t === "drug") {
      // Change this path to whatever you actually store: active, equipped, carried, worn, etc.
      const isActive = !!item.system?.active; // or item.system.equipped / item.system.worn / etc.

      const suppressed = !isActive;
      // console.debug("[EP2e] equipment suppression", { item: item.name, isActive, suppressed });
      return suppressed;
    }

    // Default: don't suppress other item effects
    return false;
  }
}