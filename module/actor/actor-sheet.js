import { eclipsephase } from "../config.js"
import { registerEffectHandlers,registerCommonHandlers,itemCreate,registerItemHandlers } from "../common/common-sheet-functions.js";
import * as Dice from "../dice.js"

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class EclipsePhaseActorSheet extends ActorSheet {

    constructor(...args) {
      super(...args);

      const showEverything = game.settings.get("eclipsephase", "showEverything");
      console.log(this);
      if(showEverything){
        this.position.height = 900;
        this.position.width = 800;
      }
      else {
        if (!game.user.isGM && !this.actor.isOwner){
          this.position.height = 575;
          this.position.width = 800;
        }
        else{
          this.position.height = 900;
          this.position.width = 800;
        }
      }
    }

    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        classes: ["eclipsephase", "sheet", "actor"],
        resizable: false,
        tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "skills" }]
      });
    }

  /** @override */

  get template() {
    const showEverything = game.settings.get("eclipsephase", "showEverything");
    if (showEverything){
      return "systems/eclipsephase/templates/actor/actor-sheet.html"
    }
    else{
      if (!game.user.isGM && !this.actor.isOwner){
        return "systems/eclipsephase/templates/actor/sheet-limited.html";
      }
      else{
        return "systems/eclipsephase/templates/actor/actor-sheet.html";
      }
    }
  }

  async getData() {
    const sheetData = super.getData();
    const actor = sheetData.actor

    sheetData.dtypes = ["String", "Number", "Boolean"];
    // Prepare items.
    if(actor.img === "icons/svg/mystery-man.svg"){
      actor.img = "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg";
    }

    eclipsephase.morphNames.forEach(name => {
      if(actor.system.bodies[name].img === ""){
        actor.system.bodies[name].img = "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg";
      }
    })

    if (actor.type === 'character') {
      this._prepareCharacterItems(sheetData);
    }

    await this._prepareRenderedHTMLContent(sheetData)

    //Prepare dropdowns
    sheetData.config = CONFIG.eclipsephase;

    // Why jump through hoops in the template when we can set the active morph
    // here?!
    let morphKey = actor.system.bodies.activeMorph
    let description = await TextEditor.enrichHTML(actor.system.bodies[morphKey].description,
      { async: true })

    sheetData.activeMorph = {
      key: morphKey,
      name: actor.system.bodies[morphKey].name || "Morph",
      morph: actor.system.bodies[morphKey],
      wares: actor.ware[morphKey],
      traits: actor.morphTrait[morphKey],
      presentTraits: actor.morphTrait[morphKey].length > 0,
      flaws: actor.morphFlaw[morphKey],
      presentFlaws: actor.morphFlaw[morphKey].length > 0,
      description: description
    }


    console.log("******* actor-sheet")
    console.log(sheetData)

    return sheetData
  }

  //Binds morphFlaws/Traits/Gear to a singular morph
  async _onDropItemCreate(item) {

    console.log("***** _onDropItemCreate")
    console.log(item)

    // Create a Consumable spell scroll on the Inventory tab
    if (item.type === "morphFlaw" || item.type === "morphTrait" || item.type === "ware") {
      let actor = this.actor
      let actorModel = actor.system
      let currentMorph = actorModel.bodies.activeMorph
      let itemModel = item.system

      itemModel.boundTo = currentMorph
    }


    // Create the owned item as normal
    return super._onDropItemCreate(item)
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} sheetData the object handlebars uses to render templates
   *
   * @return {undefined}
   */
 async _prepareCharacterItems(sheetData) {
   const actor = sheetData.actor
   const model = sheetData.actor.system

    // Initialize containers.

    const gear = [];
    const know = [];
    const special = [];
    const trait = [];
    const flaw = [];
    const effects = [];
    const morphtrait = {
        morph1: [],
        morph2: [],
        morph3: [],
        morph4: [],
        morph5: [],
        morph6: []
    };
    const morphflaw = {
        morph1: [],
        morph2: [],
        morph3: [],
        morph4: [],
        morph5: [],
        morph6: []
    };
    const rangedweapon = [];
    const ccweapon = [];
    const armor = [];
    const ware = {
        morph1: [],
        morph2: [],
        morph3: [],
        morph4: [],
        morph5: [],
        morph6: []
    };
      const aspect = {
          Chi: [],
          Gamma: []
      };
      const program = [];
      const vehicle = {
          Robot: [],
          Vehicle: [],
          Morph: []
      };
    // const item = [];

    // Iterate through items, allocating to containers
    // let totalWeight = 0;
    for (let item of sheetData.items) {
      let itemModel = item.system;

      item.img = item.img || DEFAULT_TOKEN;
      // Append to features.
      if (item.type === 'specialSkill') {
        let aptSelect = 0;
        if (itemModel.aptitude === "Intuition") {
          aptSelect = model.aptitudes.int.value;
        }
        else if (itemModel.aptitude === "Cognition") {
          aptSelect = model.aptitudes.cog.value;
        }
        else if (itemModel.aptitude === "Reflexes") {
          aptSelect = model.aptitudes.ref.value;
        }
        else if (itemModel.aptitude === "Somatics") {
          aptSelect = model.aptitudes.som.value;
        }
        else if (itemModel.aptitude === "Willpower") {
          aptSelect = model.aptitudes.wil.value;
        }
        else if (itemModel.aptitude === "Savvy") {
          aptSelect = model.aptitudes.sav.value;
        }
        item.roll = Number(itemModel.value) + aptSelect;
        item.specroll = Number(itemModel.value) + aptSelect + 10;
        special.push(item);
        }
        else if (item.type === 'knowSkill') {
          let aptSelect = 0;
          if (itemModel.aptitude === "Intuition") {
            aptSelect = model.aptitudes.int.value;
          }
          else if (itemModel.aptitude === "Cognition") {
            aptSelect = model.aptitudes.cog.value;
          }
          item.roll = Number(itemModel.value) + aptSelect;
          item.specroll = Number(itemModel.value) + aptSelect + 10;
          know.push(item);
        }
        else if (item.type === 'trait') {
          trait.push(item);
        }
        else if (item.type === 'flaw') {
          flaw.push(item);
        }
        else if (itemModel.displayCategory === 'ranged') {
          rangedweapon.push(item);
        }
        else if (itemModel.displayCategory === 'ccweapon') {
          ccweapon.push(item);
        }
        else if (itemModel.displayCategory === 'armor') {
          armor.push(item);
        }
        else if (item.type === 'aspect') {
          aspect[itemModel.psiType].push(item);
        }
        else if (item.type === 'program') {
          program.push(item);
        }
        else if (itemModel.displayCategory === 'gear') {
          gear.push(item);
        }
        else if (item.type === 'vehicle') {
          item.wt = Math.round(itemModel.dur / 5);
          item.dr = Math.round(itemModel.dur * 2);
          vehicle[itemModel.type].push(item)
        }
      else if (item.type === 'ware' && itemModel.boundTo) {
            ware[itemModel.boundTo].push(item);
        }
        else if (item.type === 'morphFlaw' && itemModel.boundTo) {
            if (itemModel.boundTo === "morph1"){
                morphtrait.present1 = true;
            }
            else if (itemModel.boundTo === "morph2"){
                morphtrait.present2 = true;
            }
            else if (itemModel.boundTo === "morph3"){
                morphtrait.present3 = true;
            }
            else if (itemModel.boundTo === "morph4"){
                morphtrait.present4 = true;
            }
            else if (itemModel.boundTo === "morph5"){
                morphtrait.present5 = true;
            }
            else if (itemModel.boundTo === "morph6"){
                morphtrait.present6 = true;
            }
            morphflaw[itemModel.boundTo].push(item);
        }
        else if (item.type === 'morphTrait' && itemModel.boundTo) {
            if (itemModel.boundTo === "morph1"){
                morphtrait.present1 = true;
            }
            else if (itemModel.boundTo === "morph2"){
                morphtrait.present2 = true;
            }
            else if (itemModel.boundTo === "morph3"){
                morphtrait.present3 = true;
            }
            else if (itemModel.boundTo === "morph4"){
                morphtrait.present4 = true;
            }
            else if (itemModel.boundTo === "morph5"){
                morphtrait.present5 = true;
            }
            else if (itemModel.boundTo === "morph6"){
                morphtrait.present6 = true;
            }
            morphtrait[itemModel.boundTo].push(item);
        }
    }

    actor.showEffectsTab=false
    if(game.settings.get("eclipsephase", "effectPanel") && game.user.isGM){
      var effectList=this.actor.getEmbeddedCollection('ActiveEffect');
      for(let item of effectList){
        effects.push(item);
      }
      actor.showEffectsTab=true;
    }

    // Assign and return
    actor.trait = trait;
    actor.flaw = flaw;
    actor.morphTrait = morphtrait;
    actor.morphFlaw = morphflaw;
    actor.rangedWeapon = rangedweapon;
    actor.ccweapon = ccweapon;
    actor.armor = armor;
    actor.ware = ware;
    actor.aspect = aspect;
    actor.program = program;
    actor.gear = gear;
    actor.knowSkill = know;
    actor.specialSkill = special;
    actor.vehicle = vehicle;
    actor.activeEffects=effects;
    actor.actorType = "PC";
    

   console.log(actor)

    //console.log("What is actorData? ", actorData)
    //console.log("Normal Traits: ", actorData.trait)
    //console.log("Normal Flaws: ", actorData.flaw)

    //console.log("Morph Flaw Array", actorData.morphFlaw)
    // console.log("Morph Trait Array", actorData.morphTrait)
    //console.log("Ware Array", actorData.ware)

    //console.log("Morph Flaw Array 1 ", actorData.morphFlaw.morph1)
  }

  async _prepareRenderedHTMLContent(sheetData) {
    let model = sheetData.actor.system

    let bio = await TextEditor.enrichHTML(model.biography, { async: true })
    sheetData["htmlBiography"] = bio

    let muse = await TextEditor.enrichHTML(model.muse.description, { async: true })
    sheetData["htmlMuseDescription"] = muse
  }



  /* -------------------------------------------- */

  _onDrop

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    let actor = this.actor

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;



    registerEffectHandlers(html, actor);
    registerCommonHandlers(html, actor);
   /* registerItemHandlers(html,this.actor,this);*/

   // Add Inventory Item
   html.find('.item-create').click(this._onItemCreate.bind(this));

    // Update Inventory Item
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

        // Delete Inventory Item
  html.find('.item-delete').click(ev => {
    const li = $(ev.currentTarget).parents(".item");
    actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
    li.slideUp(200, () => this.render(false));
  });


    // Rollable abilities.
    html.find('.task-check').click(this._onTaskCheck.bind(this));
    html.find('.damage-roll').click(this._onDamageRoll.bind(this));

    // Drag events for macros.
    if (actor.isOwner) {
        let handler = ev => this._onDragItemStart(ev);
        html.find('li.item').each((i, li) => {
            if (li.classList.contains("inventory-header")) return;
            li.setAttribute("draggable", true);
            li.addEventListener("dragstart", handler, false);
        });
    }
      //Edit Item Input Fields
      html.find(".sheet-inline-edit").change(this._onSkillEdit.bind(this));

      //Change active/passive state of morph/body bound flaws
      html.find(".bodySelect").change(this._onMorphSwitch.bind(this));

      //Edit Item Checkboxes
      html.find('.equipped.checkBox').click(ev => {
          const itemId = ev.currentTarget.closest(".equipped.checkBox").dataset.itemId;
          const item = actor.items.get(itemId);
          let toggle = !item.system.active;
          const updateData = {
              "system.active": toggle
          };
          const updated = item.update(updateData);
          
          let effUpdateData=[];
          for(let eff of this.object.effects.filter(e => 
            (e.disabled === toggle && e.origin.indexOf(itemId)>=0))){

              effUpdateData.push({
                "_id" : eff._id,
                disabled: !toggle
              });
          }
          actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
      });

      //show on hover
      html.find(".reveal").on("mouseover mouseout", this._onToggleReveal.bind(this));

  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */

  /* _onMorphSwitch(event) {
    event.preventDefault();
    
    let actor = this.actor

    console.log("**** _onMorphSwitch")
    console.log(this)

    let itemTypes = this.actor.itemTypes

    console.log(itemTypes)

    let mTraits = itemTypes.morphTrait
    let mFlaws = itemTypes.morphFlaw
    let mWare = itemTypes.ware
    let mtToggle = null;
    let mfToggle = null;
    let mwToggle = null;
    let currentMorph = event.currentTarget.value;


    for (let trait of mTraits){
      if (trait.system.boundTo === currentMorph){
        mtToggle = true
      }
      else {
        mtToggle = false
      }
    let effUpdateData=[];
    for(let eff of actor.effects.filter(e =>
      (e.data.disabled === mtToggle && e.data.origin.indexOf(trait.data._id)>=0))){
        console.log("This is e.data.origin.indexOf(ware.data._id): ", eff)
        effUpdateData.push({
          "_id" : eff.data._id,
          disabled: !mtToggle
        });
    }
    actor.updateEmbeddedDocuments("ActiveEffect",effUpdateData);
    }

    for (let flaw of mFlaws){
      if (flaw.system.boundTo === currentMorph){
        mfToggle = true
      }
      else {
        mfToggle = false
      }
    let effUpdateData=[];
    for(let eff of actor.effects.filter(e => 
      (e.data.disabled === mfToggle && e.data.origin.indexOf(flaw.data._id)>=0))){
        console.log("This is e.data.origin.indexOf(ware.data._id): ", eff)
        effUpdateData.push({
          "_id" : eff.data._id,
          disabled: !mfToggle
        });
    }
    actor.updateEmbeddedDocuments("ActiveEffect",effUpdateData);
    }
    for (let ware of mWare){
      if (ware.system.boundTo === currentMorph){
        mwToggle = true
      }
      else {
        mwToggle = false
      }
    let effUpdateData=[];
    for(let eff of actor.effects.filter(e => 
      (e.data.disabled === mwToggle && e.data.origin.indexOf(ware.data._id)>=0))){
        console.log("This is e.data.origin.indexOf(ware.data._id): ", eff)
        effUpdateData.push({
          "_id" : eff.data._id,
          disabled: !mwToggle
        });
    }
    actor.updateEmbeddedDocuments("ActiveEffect",effUpdateData);
    }
  }

  _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const data = duplicate(header.dataset);
    const name = `New ${type.capitalize()}`;
    const itemData = {
      name: name,
      type: type,
      data: data
    };
    
    delete itemData.data["type"];
    if (itemData.type === "specialSkill") {
      itemData.name = "New Skill";
    }
    return this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  ------------------------------------------- New Version? --------------------------------------
  _onMorphSwitch(event) {
    event.preventDefault();
    
    let actor = this.actorData

    console.log("**** _onMorphSwitch")
    console.log(this.actor.activeEffects)

    let itemTypes = this.actor.itemTypes

    console.log(itemTypes)

    let mTraits = itemTypes.morphTrait
    let mFlaws = itemTypes.morphFlaw
    let mWare = itemTypes.ware
    let mtToggle = null;
    let mfToggle = null;
    let mwToggle = null;
    let currentMorph = event.currentTarget.value;


    for (let trait of mTraits){
      if (trait.system.boundTo === currentMorph){
        mtToggle = true
      }
      else {
        mtToggle = false
      }
      let effUpdateData=[];
      console.log("**** eff of actor.activeEffects")
      console.log(this.actor.activeEffects)
      for(let eff of actor.activeEffects.filter(e => 
        (e.disabled === mtToggle && e.origin.indexOf(mTraits._id)>=0))){

          effUpdateData.push({
            "_id" : eff._id,
            disabled: !mtToggle
          });
      }
      actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
    }

    for (let flaw of mFlaws){
      if (flaw.system.boundTo === currentMorph){
        mfToggle = true
      }
      else {
        mfToggle = false
      }
      let effUpdateData=[];
      for(let eff of actor.activeEffects.filter(e => 
        (e.disabled === mfToggle && e.origin.indexOf(mFlaws._id)>=0))){

          effUpdateData.push({
            "_id" : eff._id,
            disabled: !mfToggle
          });
      }
      actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
    }
    for (let ware of mWare){
      if (ware.system.boundTo === currentMorph){
        mwToggle = true
      }
      else {
        mwToggle = false
      }
      let effUpdateData=[];
      for(let eff of actor.activeEffects.filter(e => 
        (e.disabled === mwToggle && e.origin.indexOf(mWare._id)>=0))){

          effUpdateData.push({
            "_id" : eff._id,
            disabled: !mwToggle
          });
      }
      actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
    }
  }

  */

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */

  _onTaskCheck(event) {
    event.preventDefault();

    const element = event.currentTarget;
    const dataset = element.dataset;
    const actorModel = this.actor.system

    if(dataset.type === 'rep') {
      this._onRepRoll(dataset, actorModel)
      return
    }

      Dice.TaskCheck ({
        skillName : dataset.name.toLowerCase(),
        specName : dataset.specname,
        rollType : dataset.type,
        skillValue : dataset.rollvalue,
        actorData : actorModel,
        askForOptions : event.shiftKey,
        optionsSettings: game.settings.get("eclipsephase", "showTaskOptions"),
        brewStatus: game.settings.get("eclipsephase", "superBrew")
      });
    }

  _onDamageRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;
    const actorData = this.actor.data.data;

      Dice.DamageRoll ({
        weaponName : dataset.weaponname,
        weaponDamage : dataset.roll,
        weaponType : dataset.type,
        actorData : actorData,
        askForOptions : event.shiftKey,
        optionsSettings: game.settings.get("eclipsephase", "showDamageOptions")
      });
  }

  _onSkillEdit(event) {
    event.preventDefault();
    let element = event.currentTarget;
    let itemId = element.closest(".item").dataset.itemId;
    let item = this.actor.items.get(itemId);
    let field = element.dataset.field;

    return item.update({ [field]: element.value });
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

  _onRepRoll(dataset, actorModel) {
    Dice.ReputationRoll(dataset, actorModel)
  }
}


