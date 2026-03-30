import { registerEffectHandlers,registerCommonHandlers,itemToggle,moreInfo } from "../common/common-sheet-functions.js";
/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export default class EPtraitSheet extends ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["eclipsephase", "sheet", "item"],
      resizable: false,
      width: 520,
      height: 450,
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
  getData() {
    const sheetData = super.getData()
    const item = sheetData.item

    sheetData.config = CONFIG.eclipsephase;
    item.showEffectsTab = true;
    if(game.settings.get("eclipsephase", "effectPanel") && game.user.isGM){
      item.showEffectsTab = true
    }

    if(item.system.traitType === "trait"){
      item.img = "systems/eclipsephase/resources/icons/add.png"
    }
    else
    item.img = "systems/eclipsephase/resources/icons/subtract.png"

    /* In case ACTOR DATA is needed */
   console.log(item) 

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
  
      let item = this.item;
  
      itemToggle(html, item);
      
      //More Information Dialog
      html.on('click', 'a.moreInfoDialog', moreInfo);
  
      // Everything below here is only needed if the sheet is editable
      if (!this.options.editable) return;
  
      registerEffectHandlers(html, this.item);
      registerCommonHandlers(html, this.item);
  
      html.find(".reveal").on("mouseover mouseout", this._onToggleReveal.bind(this));
      
    }
  
    _onToggleReveal(event) {
      const reveals = event.currentTarget.getElementsByClassName("info");
      $.each(reveals, function (index, value){
        $(value).toggleClass("icon-hidden");
      })
      const revealer = event.currentTarget.getElementsByClassName("toggle");
      $.each(revealer, function (index, value){
        $(value).toggleClass("noShow");
      })
    }
  
      async _prepareRenderedHTMLContent(sheetData) {
      let itemModel = sheetData.item.system
  
      let bio = await TextEditor.enrichHTML(itemModel.description, { async: true })
      sheetData["htmlDescription"] = bio
    }
}
