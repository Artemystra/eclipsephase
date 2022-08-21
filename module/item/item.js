/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class EclipsePhaseItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */

  //*override //
  get transferredEffects() {
    return this.effects.filter(e => (e.data.transfer === true && e.data.active === true));
  }


  prepareData() {
    super.prepareData();

    // Get the Item's data
    // const itemData = this.data;
    // const actorData = this.actor ? this.actor.data : {};
    // const data = itemData.data;
    
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
  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    // Basic template rendering data
    const token = this.actor.token;
    const item = this.data;
    const actorData = this.actor ? this.actor.data.data : {};
    const itemData = item.data;

    let roll = new Roll('d20+@abilities.str.mod', actorData);
    let label = `Rolling ${item.name}`;
    roll.roll().toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: label
    });
  }
}
