import { registerEffectHandlers,registerCommonHandlers, confirmation } from "../common/common-sheet-functions.js";

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export default class EPmorphTraitSheet extends ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["eclipsephase", "sheet", "item"],
      resizable: false,
      width: 520,
      height: 350,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".item-sheet-body", initial: "description" }]
    });
  }

  /** @override */
  get template() {
    const path = "systems/eclipsephase/templates/item";
    // Return a single sheet for all item types.
    // return `${path}/item-sheet.html`;

    // Alternatively, you could use the following return statement to do a
    // unique item sheet by type, like `weapon-sheet.html`.
    return `${path}/item-${this.item.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const sheetData = super.getData()
    const item = sheetData.item

    sheetData.config = CONFIG.eclipsephase
    item.showEffectsTab = true
    if(game.settings.get("eclipsephase", "effectPanel") && game.user.isGM) {
      item.showEffectsTab=true
    }

    return sheetData
  }

  /* -------------------------------------------- */

  /** @override 
  setPosition(options = {}) {
    const position = super.setPosition(options);
    const sheetBody = this.element.find(".item-sheet-body");
    const bodyHeight = position.height - 192;
    sheetBody.css("height", bodyHeight);
    return position;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    registerEffectHandlers(html,this.item);
    registerCommonHandlers(html,this.item);
    // Roll handlers, click handlers, etc. would go here.
  }
}
