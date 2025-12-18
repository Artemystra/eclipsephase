import { registerEffectHandlers,registerCommonHandlers,itemToggle,moreInfo } from "../common/common-sheet-functions.js";

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export default class EPgearSheet extends ItemSheet {
  constructor(...args) {
    super(...args);

    if(this.item.type === "ccWeapon"){
      this.position.width = 690;
      this.position.height = 445;
    }
    else if(this.item.type === "rangedWeapon"){
      this.position.width = 755;
      this.position.height = 445;
    }
    else if(this.item.type === "drug"){
      this.position.width = 520;
      this.position.height = 420;
    }
    else if(this.item.type === "morph"){
      this.position.width = 620;
      this.position.height = 500;
    }
    else {
      this.position.width = 520;
      this.position.height = 415;
    }
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["eclipsephase", "sheet", "item"],
      resizable: false,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".item-sheet-body", initial: "details" }]
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

    sheetData.config = CONFIG.eclipsephase;
    item.showEffectsTab = true;
    if(game.settings.get("eclipsephase", "effectPanel") && game.user.isGM){
      item.showEffectsTab = true;
    }

    if(item.type === "ccWeapon" || item.type === "rangedWeapon"){
      item.system.costName = "ep2e.item.general.table.cost." + item.system.cost;
      item.system.slotName = "ep2e.item.weapon.table.slot." + item.system.slotType;
    }

    if(item.type === "rangedWeapon"){
      item.system.ammoName = "ep2e.item.weapon.table.ammoUsed." + item.system.ammoType;
    }

    if (item.type === 'morph') {
      sheetData.itemList = CONFIG.compendiumList;
    }

    await this._prepareRenderedHTMLContent(sheetData)

    console.log("***** gear-sheet")
    console.log(sheetData)

    return sheetData
  }

  /**
   * Organize and classify Lists using the entries of given compendiums. 
   * This is used to list possible trait/flaw/ware option on morphs
   *
   * @param {Object} sheetData the object handlebars uses to render templates
   *
   * @return {undefined}
   */
  async _prepareMorphAdditions(sheetData){
    const item = sheetData.item;
    const itemModel = item.system;
    const itemList = {};
    itemList.ware = {};
    itemList.flaw = {};
    itemList.trait = {};
    const traitsPack = game.packs.get("eclipsephase.traits");
    const traitsIndex = await traitsPack.getIndex();
    const warePack = game.packs.get("eclipsephase.ware");
    const wareIndex = await warePack.getIndex();
    const joinedIndex = [...wareIndex, ...traitsIndex]

    for(const entry of joinedIndex){
      const fullItem = await fromUuid(entry.uuid);
      switch (fullItem.type) {
        case "traits":
          fullItem.system.traitType === "trait" ? itemList.trait[fullItem.uuid] = fullItem.name : itemList.flaw[fullItem.uuid] = fullItem.name;
          break;
        case "ware":
          itemList.ware[fullItem.uuid] = fullItem.name;
          break;
        default: break
      }
    }

    sheetData.itemList = itemList;
    console.log("this is my wareList", item.wareList)
    console.log("This is my item:", sheetData)
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    
    if(this.item.system.type === "seeker" || this.item.type === "grenade"){
      this.position.width = 680;
      this.position.height = 415;
    }
    else if(this.item.system.type != "seeker" && this.item.type === "ammo"){
      this.position.width = 520;
      this.position.height = 415;
    }

    let item = this.item;

    itemToggle(html, item);
    
    //More Information Dialog
    html.on('click', 'a.moreInfoDialog', moreInfo);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    registerEffectHandlers(html, this.item);
    registerCommonHandlers(html, this.item);
  }

    async _prepareRenderedHTMLContent(sheetData) {
    let itemModel = sheetData.item.system

    let bio = await TextEditor.enrichHTML(itemModel.description, { async: true })
    sheetData["htmlDescription"] = bio
  }

  /* -------------------------------------------- */

  /* @override 
  setPosition(options = {}) {
    const position = super.setPosition(options);
    const sheetBody = this.element.find(".item-sheet-body");
    const bodyHeight = position.height - 170;
    sheetBody.css("height", bodyHeight);
    return position;
  }

  /* -------------------------------------------- */
}
