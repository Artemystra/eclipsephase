import { eclipsephase } from "../config.js"
import { normaliseDrugSystem } from "../common/drugs.js"

// Default Morph Points -> cost-tier thresholds. RAW MP range is 0-12. A feature may override
// the resulting tier through the prepareItemData hook.
const MORPH_TIER_THRESHOLDS = { moderate: 2, major: 5, rare: 8 };

export default class EPitem extends Item {

    /**
     * Repairs a drug whose data predates the current schema as it is created, so that a drug
     * dragged in from a compendium that was never repacked lands with a usable duration span and
     * a full pack of doses instead of the free text it was authored with.
     * @param {Object} data - The item source data
     * @param {Object} options - The creation options
     * @param {User} user - The user performing the creation
     * @returns {Boolean|void} False to block the creation
     */
    async _preCreate(data, options, user) {
        const allowed = await super._preCreate(data, options, user);
        if (allowed === false) return false;
        if (this.type !== "drug") return allowed;

        const repairs = normaliseDrugSystem(this._source.system);
        if (!repairs) return allowed;

        const update = {};
        for (const [key, value] of Object.entries(repairs)) update[`system.${key}`] = value;
        this.updateSource(update);
        return allowed;
    }

    async _preUpdate(changes, options, user) {
        await super._preUpdate(changes, options, user);

        // Only vehicles/robots have real intrinsic (frame) armor - Smart Animals get theirs from
        // Armor Ware items instead, same as Biomorphs. Switching a body's chassis to "animal"
        // always zeroes out whatever intrinsic armor it had as a vehicle/robot, so a leftover
        // value can't silently keep counting after the switch.
        const newChassisType = changes.system?.chassisType ?? changes["system.chassisType"];
        if (this.type === "vehicle" && newChassisType === "animal") {
            changes["system.armor.energy"] = 0;
            changes["system.armor.kinetic"] = 0;
        }
    }

    async prepareData() {
        super.prepareData();

        if (this.type === "drug") {
            const repairs = normaliseDrugSystem(this.system);
            if (repairs) Object.assign(this.system, repairs);
        }
        
        const brewStatus = game.settings.get("eclipsephase", "superBrew");
        const item = this;
        const itemModel = item.system;
    
        // Homebrew Switch
        if (brewStatus) {
          itemModel.homebrew = true;
        }
        else {
          itemModel.homebrew = false;
        }

        // Armor is always body-bound and always "worn" once bound - active reflects whether the
        // body it's boundTo is the one currently sleeved/jammed, recomputed every prepare cycle
        // instead of being a manually-toggled flag like Gear/Weapons still use. Armor with no
        // boundTo yet (not migrated to the new body-bound design) is left untouched.
        if (item.type === "armor" && itemModel.boundTo) {
          const actor = item.parent;
          if (actor instanceof Actor) {
            if (actor.type !== "character") {
              itemModel.active = true;
            } else {
              const activeBody = actor.system?.activeJam || actor.system?.activeMorph;
              itemModel.active = itemModel.boundTo === activeBody;
            }
          }
        }

        // Morph cost tier is derived live from Morph Points, unlike Gear/Ware's manually-set
        // system.cost. Each threshold is the MP value where that tier starts (mp >= threshold);
        // anything below it falls through to the next lower tier. Checked highest-first, so if two
        // thresholds are set to the same value, the higher tier wins the tie. A feature may
        // override the thresholds afterwards via the prepareItemData hook below.
        if (item.type === "morph") {
          const mp = Number(itemModel.morphPoints) || 0;
          if (mp >= MORPH_TIER_THRESHOLDS.rare) itemModel.cost = "rare";
          else if (mp >= MORPH_TIER_THRESHOLDS.major) itemModel.cost = "major";
          else if (mp >= MORPH_TIER_THRESHOLDS.moderate) itemModel.cost = "moderate";
          else itemModel.cost = "minor";
        }

        Hooks.callAll("eclipsephase.prepareItemData", item, itemModel);
      }

    chatTemplate = {
        "rangedWeapon": "systems/eclipsephase/templates/actor/partials/item-partials/ranged-weapons.html",
        "ccWeapon": "systems/eclipsephase/templates/actor/partials/item-partials/cc-weapons.html",
        "gear": "systems/eclipsephase/templates/actor/partials/item-partials/gear.html"
    };

    async roll() {
        let chatData = {
            user: game.user._id,
            speaker: ChatMessage.getSpeaker()
        };

        let cardData = {
            ...this.system,
            owner: this.actor.id
        };

        chatData.content = await foundry.applications.handlebars.renderTemplate(this.chatTemplate[this.type], cardData);

        chatData.roll = true;

        return ChatMessage.create(chatData);
    }
}