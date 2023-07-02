export default class EPitem extends Item {

    prepareData() {
        super.prepareData();
        
        const brewStatus = game.settings.get("eclipsephase", "superBrew");
        let model = this.system
    
        // Homebrew Switch
        if (brewStatus) {
          model.homebrew = true;
        }
        else {
          model.homebrew = false;
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

        chatData.content = await renderTemplate(this.chatTemplate[this.type], cardData);

        chatData.roll = true;

        return ChatMessage.create(chatData);
    }
}