import { eclipsephase } from "../config.js"

export default class EPitem extends Item {

    async prepareData() {
        super.prepareData();
        
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