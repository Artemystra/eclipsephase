import { eclipsephase } from "../config.js";
import { registerEffectHandlers,registerCommonHandlers,itemCreate,registerItemHandlers,_tempEffectCreation,confirmation,embeddedItemToggle,moreInfo } from "../common/common-sheet-functions.js";
import { weaponPreparation,reloadWeapon } from "../common/weapon-functions.js";
import { traitAndAccessoryFinder } from "../common/sheet-preparation.js";
import * as Dice from "../dice.js";
import itemRoll from "../item/EPitem.js";


/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export default class EPactorSheet extends ActorSheet {
    constructor(...args) {
      super(...args);

      const showEverything = game.settings.get("eclipsephase", "showEverything");
      if(showEverything){
        this.position.height = 850;
        this.position.width = 1400;
      }
      else {
        if (!game.user.isGM && !this.actor.isOwner){
          this.position.height = 650;
          this.position.width = 800;
        }
        else{
          this.position.height = 850;
          this.position.width = 1400;
        }
      }
    }

    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        classes: ["eclipsephase", "sheet", "actor"],
        resizable: false,
        tabs: [{ navSelector: ".primary-tabs", contentSelector: ".primary-body", initial: "skills" },{ navSelector: ".secondary-tabs", contentSelector: ".secondary-body", initial: "health" }]
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
    const actor = sheetData.actor;

    if(actor.system.mods.woundMultiplier < 1){
      actor.update({"system.mods.woundMultiplier" : 1});
    }

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
      name: actor.system.bodies[morphKey].name || "New Morph",
      morph: actor.system.bodies[morphKey],
      wares: actor.ware[morphKey],
      traits: actor.morphTrait[morphKey],
      presentTraits: actor.morphTrait[morphKey].length + actor.morphFlaw[morphKey].length > 0,
      flaws: actor.morphFlaw[morphKey],
      description: description
    }

    return mergeObject(sheetData, {
      isGM: game.user.isGM
    });
  }

  //Binds morphFlaws/Traits/Gear to a singular morph
  async _onDropItemCreate(item) {
    const actor = this.actor
    const actorModel = actor.system
    const itemModel = item.system
    
    let currentMorph = actorModel.bodies.activeMorph


    // Create a Consumable spell scroll on the Inventory tab
    if (item.type === "morphFlaw" || item.type === "morphTrait" || item.type === "ware") {
      itemModel.boundTo = currentMorph
    }

    //Loading weapons with Standard Ammo
    if (item.type === "rangedWeapon"){
      if (item.system.ammoType != "seeker" && !item.system.mode1.traits.specialAmmoDrugs.value && !item.system.mode1.traits.specialAmmoBugs.value){
      let name = item.system.ammoType
      let capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
      item.system.ammoMin = item.system.ammoMax;
      item.system.ammoSelected.name = capitalizedName + " (Standard)";
      }
    }

    item.system.updated = game.system.version

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
   const actorModel = sheetData.actor.system

    // Initialize containers.

    const gear = [];
    const consumable = [];
    const ammo = {
      beam: [],
      kinetic: [],
      seeker: [],
      spray: [],
      rail: [],
      chemical: [],
      swarm: []
    };
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
          none: [],
          chi: [],
          gamma: [],
          epsilon: [],
          None: [],
          Chi: [],
          Gamma: [],
          Epsilon: []
      };
      const program = [];
      const vehicle = {
          robot: [],
          vehicle: [],
          morph: [],
          animal: [],
          Robot: [],
          Vehicle: [],
          Morph: [],
          'Smart-Animal': []
      };
      //this will become more important once morphs are items themselves
      const morph = [];

    // Iterate through items, allocating to containers
    for (let item of sheetData.actor.items) {
      let itemModel = item.system;

      item.img = item.img || DEFAULT_TOKEN;
      //Sort drugs into ammo as well
      if (item.type === "drug"){

      }

      // Append to features.
      if (item.type === 'specialSkill') {
        let aptSelect = 0;
        if (itemModel.aptitude === "int") {
          aptSelect = actorModel.aptitudes.int.value;
        }
        else if (itemModel.aptitude === "cog") {
          aptSelect = actorModel.aptitudes.cog.value;
        }
        else if (itemModel.aptitude === "ref") {
          aptSelect = actorModel.aptitudes.ref.value;
        }
        else if (itemModel.aptitude === "som") {
          aptSelect = actorModel.aptitudes.som.value;
        }
        else if (itemModel.aptitude === "wil") {
          aptSelect = actorModel.aptitudes.wil.value;
        }
        else if (itemModel.aptitude === "sav") {
          aptSelect = actorModel.aptitudes.sav.value;
        }
        item.roll = (Number(itemModel.value) + aptSelect)<100 ? Number(itemModel.value) + aptSelect : 100;
        item.specroll = ((Number(itemModel.value) + aptSelect)<100 ? Number(itemModel.value) + aptSelect : 100) + 10;
        special.push(item);
        }
        else if (item.type === 'knowSkill') {
          let aptSelect = 0;
          if (itemModel.aptitude === "int") {
            aptSelect = actorModel.aptitudes.int.value;
          }
          else if (itemModel.aptitude === "cog") {
            aptSelect = actorModel.aptitudes.cog.value;
          }
          item.roll = (Number(itemModel.value) + aptSelect)<100 ? Number(itemModel.value) + aptSelect : 100;
          item.specroll = ((Number(itemModel.value) + aptSelect)<100 ? Number(itemModel.value) + aptSelect : 100) + 10;
          know.push(item);
        }
        else if (item.type === 'trait') {
          trait.push(item);
        }
        else if (item.type === 'flaw') {
          flaw.push(item);
        }
        else if (itemModel.displayCategory === 'ranged') {

          let weaponAdditions = traitAndAccessoryFinder(itemModel)

          itemModel.additionalSystems.mode1Traits = weaponAdditions.mode1TraitCounter
          itemModel.additionalSystems.mode2Traits = weaponAdditions.mode2TraitCounter
          itemModel.additionalSystems.accessories = weaponAdditions.accessoryCounter

          let slotType = itemModel.slotType;
          let firingMode1 = itemModel.mode1.firingMode;
          let firingMode2 = itemModel.mode2.firingMode;
          switch (slotType){
            case 'integrated':
              itemModel.slotName = "ep2e.item.weapon.table.slot.integrated";
              break;
            case 'sidearm':
              itemModel.slotName = "ep2e.item.weapon.table.slot.sidearm";
              break;
            case 'oneHanded':
              itemModel.slotName = "ep2e.item.weapon.table.slot.oneHanded";
              break;
            case 'twoHanded':
              itemModel.slotName = "ep2e.item.weapon.table.slot.twoHanded";
              break;
            case 'bulky':
              itemModel.slotName = "ep2e.item.weapon.table.slot.bulky";
              break;
            default:
              break;
          }
          switch (firingMode1){
            case 'ss':
              itemModel.firingModeLabel1 = "ep2e.item.weapon.table.firingMode.ss";
              break;
            case 'sa':
              itemModel.firingModeLabel1 = "ep2e.item.weapon.table.firingMode.sa";
              break;
            case 'saBF':
              itemModel.firingModeLabel1 = "ep2e.item.weapon.table.firingMode.saBF";
              break;
            case 'bfFA':
              itemModel.firingModeLabel1 = "ep2e.item.weapon.table.firingMode.bfFA";
              break;
            case 'saBFfa':
              itemModel.firingModeLabel1 = "ep2e.item.weapon.table.firingMode.saBFfa";
              break;
            default:
              break;
          }
          switch (firingMode2){
            case 'ss':
              itemModel.firingModeLabel2 = "ep2e.item.weapon.table.firingMode.ss";
              break;
            case 'sa':
              itemModel.firingModeLabel2 = "ep2e.item.weapon.table.firingMode.sa";
              break;
            case 'saBF':
              itemModel.firingModeLabel2 = "ep2e.item.weapon.table.firingMode.saBF";
              break;
            case 'bfFA':
              itemModel.firingModeLabel2 = "ep2e.item.weapon.table.firingMode.bfFA";
              break;
            case 'saBFfa':
              itemModel.firingModeLabel2 = "ep2e.item.weapon.table.firingMode.saBFfa";
              break;
            default:
              break;
          }
          rangedweapon.push(item);
        }
        else if (itemModel.displayCategory === 'ccweapon') {

          let weaponAdditions = traitAndAccessoryFinder(itemModel)

          itemModel.additionalSystems.mode1Traits = weaponAdditions.mode1TraitCounter
          itemModel.additionalSystems.mode2Traits = weaponAdditions.mode2TraitCounter
          itemModel.additionalSystems.accessories = weaponAdditions.accessoryCounter

          let slotType = itemModel.slotType;
            switch (slotType){
              case 'integrated':
                itemModel.slotName = "ep2e.item.weapon.table.slot.integrated";
                break;
              case 'sidearm':
                itemModel.slotName = "ep2e.item.weapon.table.slot.sidearm";
                break;
              case 'oneHanded':
                itemModel.slotName = "ep2e.item.weapon.table.slot.oneHanded";
                break;
              case 'twoHanded':
                itemModel.slotName = "ep2e.item.weapon.table.slot.twoHanded";
                break;
              case 'bulky':
                itemModel.slotName = "ep2e.item.weapon.table.slot.bulky";
                break;
              default:
                break;
            }
          ccweapon.push(item);
        }
        else if (itemModel.displayCategory === 'armor') {
          let slotType = itemModel.slotType;
            switch (slotType){
              case 'main':
                itemModel.slotName = "ep2e.item.armor.table.type.main";
                break;
              case 'additional':
                itemModel.slotName = "ep2e.item.armor.table.type.additional";
                break;
              default:
                break;
            }
          armor.push(item);
        }
        else if (item.type === 'aspect') {
          let psiDuration = itemModel.duration;
          let psiAction = itemModel.actionType;
          switch (psiDuration) {
            case 'instant':
              itemModel.durationName = "ep2e.item.aspect.table.duration.instant"
              break;
            case 'action':
              itemModel.durationName = "ep2e.item.aspect.table.duration.action"
              break;
            case 'minutes':
              itemModel.durationName = "ep2e.item.aspect.table.duration.minutes"
              break;
            case 'hours':
              itemModel.durationName = "ep2e.item.aspect.table.duration.hours"
              break;
            case 'sustained':
              itemModel.durationName = "ep2e.item.aspect.table.duration.sustained"
              break;
            default:
              break;
          }
  
          switch (psiAction) {
            case 'quick':
              itemModel.actionName = "ep2e.item.aspect.table.action.quick"
              break;
            case 'task':
              itemModel.actionName = "ep2e.item.aspect.table.action.task"
              break;
            case 'complex':
              itemModel.actionName = "ep2e.item.aspect.table.action.complex"
              break;
            default:
              break;
          }
          aspect[itemModel.psiType].push(item);
        }
        else if (item.type === 'program' || item.system.slotType === 'digital') {

          if (itemModel.slotType = 'digital')
          itemModel.slotName = "ep2e.item.general.table.slot.digital";

          program.push(item);
        }
        else if (item.system.slotType === 'accessory' || item.system.slotType === 'bulky' || item.system.slotType === 'notMobile') {
          let slotType = itemModel.slotType;
            switch (slotType){
              case 'accessory':
                itemModel.slotName = "ep2e.item.general.table.slot.accessory";
                break;
              case 'bulky':
                itemModel.slotName = "ep2e.item.general.table.slot.bulky";
                break;
              case 'notMobile':
                itemModel.slotName = "ep2e.item.general.table.slot.notMobile";
                break;
              default:
                break;
            }
          gear.push(item);
        }
        else if (item.system.slotType === 'consumable' && item.system.slotType != 'digital' && item.type != "grenade" && item.type != "ammo") {
          if (item.type === "drug"){
            itemModel.slotName = "ep2e.item.general.table.slot.drug";
            if (item.system.active){
              ammo.chemical.push(item);
            }
          }
          else {
            itemModel.slotName = "ep2e.item.general.table.slot.consumable";
          }
          consumable.push(item);
        }
        else if (item.type === 'ammo'|| item.type === 'grenade'){
          switch (item.type) {
            case 'grenade':
            itemModel.slotName = "ep2e.item.general.table.slot.grenade";
            break;
            case 'ammo':
            itemModel.slotName = "ep2e.item.general.table.slot.ammo";
            break;
            default:
            break;
          }

          if (item.system.active){
            switch(item.system.type){
              case 'beam':
              ammo.beam.push(item);
              break;
              case 'kinetic':
              ammo.kinetic.push(item);
              break;
              case 'seeker':
              ammo.seeker.push(item);
              break;
              case 'spray':
                if(item.system.traits.nanoSwarm.value){
                  ammo.swarm.push(item);
                }
                else{
                  ammo.spray.push(item);
                }
              break;
              case 'rail':
              ammo.rail.push(item);
              break;
              default:
                break;
            }
          }
          consumable.push(item);
        }
        else if (item.type === 'vehicle') {
          let slotType = itemModel.slotType;
            switch (slotType){
              case 'vs':
                itemModel.slotName = "ep2e.item.vehicle.table.size.vs";
                break;
              case 's':
                itemModel.slotName = "ep2e.item.vehicle.table.size.s";
                break;
              case 'n':
                itemModel.slotName = "ep2e.item.vehicle.table.size.m";
                break;
              case 'l':
                itemModel.slotName = "ep2e.item.vehicle.table.size.l";
                break;
              case 'vl':
                itemModel.slotName = "ep2e.item.vehicle.table.size.vl";
                break;
              default:
                break;
            }
          itemModel.wt = Math.round(itemModel.dur / 5);
          if (itemModel.type != "animal"){
            itemModel.dr = Math.round(itemModel.dur * 2);
          }
          else {
            itemModel.dr = Math.round(itemModel.dur * 1.5);
          }
          itemModel.luc = Math.round(itemModel.wil * 2)
          itemModel.tt = Math.round(itemModel.luc / 5);
          itemModel.ir = Math.round(itemModel.luc * 2);
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
    actor.consumable = consumable;
    actor.knowSkill = know;
    actor.specialSkill = special;
    actor.vehicle = vehicle;
    actor.activeEffects=effects;
    actor.actorType = "PC";
    actor.ammo = ammo;

    // Check if sleights are present and toggle Psi Tab based on this
    if (actor.aspect.chi.length>0){
      actorModel.additionalSystems.hasPsi = 1;
    }
    else if (actor.aspect.gamma.length>0){
      actorModel.additionalSystems.hasPsi = 1;
    }
    

   /* In case ACTOR DATA is needed */
   console.log(actor) 

  }

  //Needed for a functioning HTML editor

  async _prepareRenderedHTMLContent(sheetData) {
    let actorModel = sheetData.actor.system

    let bio = await TextEditor.enrichHTML(actorModel.biography, { async: true })
    sheetData["htmlBiography"] = bio

    let muse = await TextEditor.enrichHTML(actorModel.muse.description, { async: true })
    sheetData["htmlMuseDescription"] = muse
  }



  /* -------------------------------------------- */

  _onDrop

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    let actor = this.actor;
    let allEffects = this.object.effects

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    registerEffectHandlers(html, actor);
    registerCommonHandlers(html, actor);
   /* registerItemHandlers(html,this.actor,this);*/

    

    // Add Custom Skill Item
    html.find('.item-create').click(this._onItemCreate.bind(this));

    // Update Inventory Item
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    // Delete Inventory Item
    html.find('.item-delete').click(async ev => {
      let askForOptions = ev.shiftKey;

      if (!askForOptions){
        const li = $(ev.currentTarget).parents(".item");
        const itemName = [li.data("itemName")] ? [li.data("itemName")] : null;
        const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
        const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.button.delete"))+ " " +(itemName?itemName:"");
        const popUpCopy = "ep2e.actorSheet.popUp.deleteCopyGeneral";
        const popUpInfo = "ep2e.actorSheet.popUp.deleteAdditionalInfo";

        let popUp = await confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo);

        if(popUp.confirm === true){
          actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
          li.slideUp(200, () => this.render(false));
        }
        else{
          return
        }

      }
      else if (askForOptions){
        const li = $(ev.currentTarget).parents(".item");
        actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
        li.slideUp(200, () => this.render(false));
      }
    });


    // Rollable abilities.
    html.find('.task-check').click(this._onTaskCheck.bind(this));

    // Use Pools Outside rolls
    html.find('.poolUse').click(async f => {
      const dialog = 'systems/eclipsephase/templates/chat/pop-up.html';
      const result = 'systems/eclipsephase/templates/chat/pool-usage.html';
      const brewStatus = game.settings.get("eclipsephase", "superBrew");
      const element = f.currentTarget;
      const dataset = element.dataset;
      const type = dataset.type;
      const pool = dataset.pool;
      const dialogType = "poolUsage"

      let poolUpdate = "";
      let poolValue = null;
      let subtitle = "";
      let copy = "";
      let poolName = "";
      let newPoolValue = null;
      let poolChange = 1;
      let inputNeeded = false;
      let inputType = null;
      
      //Temp effect variables
      let effectLabel = "";
      let effectIcon = ""
      let effectTarget = "";
      let effectMode = 0;
      let effectVal = "";

      switch (pool){
        case "ins":
          poolValue = actor.system.pools.insight.value;
          poolUpdate = "system.pools.insight.value"
          poolName = "ep2e.skills.insightSkills.poolHeadline"
          subtitle = "ep2e.skills.insightSkills.poolSubheadline"+type;
          copy = "ep2e.skills.insightSkills.poolCopy"+type;
          break;
        case "vig":
          poolValue = actor.system.pools.vigor.value;
          poolUpdate = "system.pools.vigor.value"
          poolName = "ep2e.skills.vigorSkills.poolHeadline"
          subtitle = "ep2e.skills.vigorSkills.poolSubheadline"+type;
          copy = "ep2e.skills.vigorSkills.poolCopy"+type;
          if (type === "3"){
            inputNeeded = true;
            inputType = "woundIgnore";
            effectLabel = "Temp Ignore Wound";
            effectIcon = "systems/eclipsephase/resources/icons/add.png";
            effectTarget = "system.mods.woundMod";
            effectMode = 2;
            effectVal = "-1";
          }
          break;
        case "mox":
          poolValue = actor.system.pools.moxie.value;
          poolUpdate = "system.pools.moxie.value"
          poolName = "ep2e.skills.moxieSkills.poolHeadline"
          subtitle = "ep2e.skills.moxieSkills.poolSubheadline"+type;
          copy = "ep2e.skills.moxieSkills.poolCopy"+type; 
          if (type === "1"){
            inputNeeded = true;
            inputType = "traumaIgnore";
            effectLabel = "Temp Ignore Trauma";
            effectIcon = "systems/eclipsephase/resources/icons/add.png";
            effectTarget = "system.mods.traumaMod";
            effectMode = 2;
            effectVal = "-1";
          }    
          if (type === "2"){
            inputNeeded = true;
            inputType = "repFill";
          }
          break; 
        case "flex":
          poolValue = actor.system.pools.flex.value;
          poolUpdate = "system.pools.flex.value"
          poolName = "ep2e.skills.flex.poolHeadline"
          subtitle = "ep2e.skills.flex.poolSubheadline"+type;
          copy = "ep2e.skills.flex.poolCopy"+type;
          break;
        default:
          break;
      }
      
      let purpose = await poolUsageConfirmation(dialog, type, pool, dialogType, subtitle, copy, poolName, inputType, inputNeeded)

      if(purpose.cancelled){
        return
      }

      let modifier = Number(purpose.modifier);

      if (modifier){
        poolChange *= modifier
      }

      newPoolValue = poolValue - poolChange

      if (newPoolValue >= 0) {

        if (inputType === "woundIgnore" || inputType === "traumaIgnore"){
          await _tempEffectCreation(actor, poolChange, effectLabel, effectIcon, effectTarget, effectMode, effectVal);
        }
  
        let dialogData = {type : dialogType, poolName : poolName, subtitle : subtitle, copy : copy, number : poolChange}
        let html = await renderTemplate(result, dialogData)

        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          flavor: html
        })
  
          return actor.update({[poolUpdate] : newPoolValue});

      }
      else {
        let chatData = {type : "notEnoughPool", poolName : poolName, brewStatus : brewStatus, poolType : pool}
        let html = await renderTemplate(result, chatData)

        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          flavor: html,
          whisper: [game.user._id]
        })
      }

    });

    // Recover Pools
    html.find('.rest').click(async func => {
      const element = event.currentTarget;
      const dataset = element.dataset;
      const brewStatus = game.settings.get("eclipsephase", "superBrew");
      const restReset = game.settings.get("eclipsephase", "restReset");
      const actorWhole = actor;
      const actorModel = this.actor.system;
      const restType = dataset.resttype;
      const curInsight = actorModel.pools.insight.value;
      const curVigor = actorModel.pools.vigor.value;
      const curMoxie = actorModel.pools.moxie.value;
      const curFlex = actorModel.pools.flex.value;
      const maxInsight = actorModel.pools.insight.totalInsight;
      const maxVigor = actorModel.pools.vigor.totalVigor;
      const maxMoxie = actorModel.pools.moxie.totalMoxie;
      const maxFlex = actorModel.pools.flex.totalFlex;
      const easeInfection = actorModel.psiStrain.infection - 10;
      const resetInfection = actorModel.psiStrain.minimumInfection
      let poolSpend = null

      await actorWhole.update({"system.pools.update.insight" : null, "system.pools.update.vigor" : null, "system.pools.update.moxie" : null, "system.pools.update.flex" : null});

      if (!restReset && restType === "long"){
        for (let effect of actor.effects){
          if (effect.name === "Temp Ignore Trauma" || effect.name === "Temp Ignore Wound"){
            let effectID = effect._id;
            actor.deleteEmbeddedDocuments('ActiveEffect', [effectID]);
          }
        }
      }
      else if (restReset) {
        for (let effect of actor.effects){
          if (effect.name === "Temp Ignore Trauma" || effect.name === "Temp Ignore Wound"){
            let effectID = effect._id;
            actor.deleteEmbeddedDocuments('ActiveEffect', [effectID]);
          }
        }
      }

      if (!brewStatus){
        poolSpend = (maxInsight - curInsight) + ( maxVigor - curVigor) + (maxMoxie - curMoxie) + (maxFlex - curFlex);
      }
      else {
        poolSpend = (maxInsight - curInsight) + ( maxVigor - curVigor) + (maxMoxie - curMoxie);
      }

      let rollFormula = "1d6" + (actorModel.additionalSystems.restChiMod ? " + " + eval(actorModel.additionalSystems.restChiMod)*actorModel.mods.psiMultiplier : "")
      let roll = await new Roll(rollFormula).evaluate({async: true});
      let recover = null;
      let restValue = null;
      if (restType === "short"){
        
        let label = game.i18n.localize("ep2e.roll.announce.rest.short");
        recover = await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: label
        });

        restValue = recover.content

        if (game.dice3d){
          await game.dice3d.waitFor3DAnimationByMessageID(recover.id);
        }
      }

      if (restType === "long" && !brewStatus){
        let label = game.i18n.localize("ep2e.roll.announce.rest.long");
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          flavor: label
      })
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.pools.flex.value" : maxFlex, "system.rest.restValue" : null, "system.psiStrain.infection" : resetInfection});
      }
      else if (restType === "long" && brewStatus){
          let label = game.i18n.localize("ep2e.roll.announce.rest.long");
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: label
        })
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.rest.restValue" : null, "system.psiStrain.infection" : resetInfection});
      }
      else if (restValue >= poolSpend && !brewStatus){
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.pools.flex.value" : maxFlex, "system.rest.restValue" : null, "system.psiStrain.infection" : easeInfection});
      }
      else if (restValue >= poolSpend && brewStatus){
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.rest.restValue" : null, "system.psiStrain.infection" : easeInfection});
      }
      else {
        return actorWhole.update({"system.rest.restValue" : restValue, "system.psiStrain.infection" : easeInfection});
      }
  });

  html.find('.restReset').click(async func => {
        const actorWhole = this.actor
        return actorWhole.update({"system.rest.short1" : false, "system.rest.short2" : false, "system.rest.shortExtra" : false, "system.rest.long" : false});
  });

  html.find('.distribute').click(async func => {
    const actorWhole = actor;
    const actorModel = this.actor.system;
    const curInsight = actorModel.pools.insight.value;
    const curVigor = actorModel.pools.vigor.value;
    const curMoxie = actorModel.pools.moxie.value;
    const curFlex = actorModel.pools.flex.value;
    const insightUpdate = actorModel.pools.update.insight + curInsight;
    const vigorUpdate = actorModel.pools.update.vigor + curVigor;
    const moxieUpdate = actorModel.pools.update.moxie + curMoxie;
    const flexUpdate = actorModel.pools.update.flex + curFlex;

    return actorWhole.update({"system.pools.insight.value" : insightUpdate, "system.pools.vigor.value" : vigorUpdate, "system.pools.moxie.value" : moxieUpdate, "system.pools.flex.value" : flexUpdate, "system.rest.restValue" : null, "system.pools.update.insight" : null, "system.pools.update.vigor" : null, "system.pools.update.moxie" : null, "system.pools.update.flex" : null});
  });

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

      //Reload Ranged Weapon Functionality
      reloadWeapon(html, actor);

      //(De)Activate morph/body bound traits/flaws/ware
      html.find(".bodySelect").change(this._onMorphSwitch.bind(this));

      //Edit Item Checkboxes
      embeddedItemToggle(html, actor, allEffects);

      //show on hover
      html.find(".reveal").on("mouseover mouseout", this._onToggleReveal.bind(this));

      //post to chat WIP
      html.find('.post-chat').click(this._postToChat.bind(this));

      //Reset Psi
      html.find(".strainSelection").change(ev => {
        actor.update({"system.subStrain.influence2.label" : "none", "system.subStrain.influence2.description" : "none", "system.subStrain.influence3.label" : "none", "system.subStrain.influence3.description" : "none", "system.subStrain.influence4.description" : "none", "system.subStrain.influence5.description" : "none", "system.subStrain.influence6.description" : "none",})
      });

      //More Information Dialog
      html.on('click', 'a.moreInfoDialog', moreInfo);

  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */

  async _postToChat(event) {
    const itemID = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.items.get(itemID);

    await item.roll();

  }

  

  async _onMorphSwitch(event) {
    event.preventDefault();

    let actor = this.actor
    let allEffects = this.object.effects

    let currentMorph = event.currentTarget.value;
    
    //browses through ALL effects and identifies, whether they are bound to an item or not
    for (let effectScan of allEffects){
      if (effectScan.origin){

        /*Woraround fromUuid. Currently not needed - just in case fromUuid changes in the future/will become deactivated during an unstable dev release
        let Uuid = (effectScan.origin).split(".");
        let parentItem = actor.items.get(Uuid[3]);
        */
      
        let parentItem = await fromUuid(effectScan.origin)

        if (parentItem.system.boundTo){

          let effUpdateData=[];

          //If a found item is bound to the currently active morph it gets prepared to be activated
          if (parentItem.system.boundTo === currentMorph) {
            effUpdateData.push({
              "_id" : effectScan._id,
              disabled: false
            });
          }
          //If a found item is NOT bound to the currently active morph it gets prepared to be DEactivated
          else {
            effUpdateData.push({
              "_id" : effectScan._id,
              disabled: true
            });
          }
          //This pushes the updated data into the effect
          actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
        }
      }   
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

    this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */

  async _onTaskCheck(event) {
    event.preventDefault();

    const element = event.currentTarget;
    const dataset = element.dataset;
    const actorWhole = this.actor;
    const actorModel = this.actor.system;

    if(dataset.type === 'rep') {
      this._onRepRoll(dataset, actorModel)
      return
    }

    let specNameValue = dataset.specname;
    let skillRollValue = dataset.rollvalue;
    let poolType = dataset.pooltype;
    let aptType = dataset.apttype;
    const flexPool = actorModel.pools.flex.value;
    let skillPoolValue = null;
    let skillKey = dataset.key.toLowerCase();
    let weaponPrep = null;
    let rolledFrom = dataset.rolledfrom ? dataset.rolledfrom : null;
    let weaponSelected = null;

    if (rolledFrom === "rangedWeapon") {
      specNameValue = actorModel.skillsVig.guns.specname;
      skillRollValue = actorModel.skillsVig.guns.roll;
      poolType = "Vigor";
    }
    else if (rolledFrom === "ccWeapon") {
      specNameValue = actorModel.skillsVig.melee.specname;
      skillRollValue = actorModel.skillsVig.melee.roll;
      poolType = "Vigor";
    }

    if (skillKey === "guns" || skillKey === "melee"){

      weaponPrep = await weaponPreparation(actorModel, actorWhole, skillKey, rolledFrom, dataset.weaponid)
      
      if (!weaponPrep || weaponPrep.cancel){
        return;
      }
      weaponSelected = weaponPrep.selection
      rolledFrom = weaponSelected.rolledFrom 
    }

    if (rolledFrom === "psiSleight") {
      specNameValue = actorModel.skillsMox.psi.specname;
      skillRollValue = actorModel.skillsMox.psi.roll;
      poolType = "Moxie";
    }

    switch (aptType) {
      case 'int':
        poolType = "Insight"
        break;
      case 'cog':
        poolType = "Insight"
        break;
      case 'ref':
        poolType = "Vigor"
        break;
      case 'som':
        poolType = "Vigor"
        break;
      case 'wil':
        poolType = "Moxie"
        break;
      case 'sav':
        poolType = "Moxie"
        break;
      default:
        break;
    }

    switch (poolType) {
      case 'Insight':
        skillPoolValue = actorModel.pools.insight.value;
        break;
      case 'Vigor':
        skillPoolValue = actorModel.pools.vigor.value;
        break;
      case 'Moxie':
        skillPoolValue = actorModel.pools.moxie.value;
        break;
      default:
        break;
    }
      Dice.TaskCheck ({
        //Actor data
        actorWhole : actorWhole,
        actorData : actorModel,
        //Skill data
        skillKey : skillKey,
        skillName : dataset.name,
        specName : specNameValue,
        rollType : dataset.type,
        skillValue : skillRollValue,
        rolledFrom : rolledFrom,
        //Pools
        poolType: poolType,
        poolValue: skillPoolValue,
        flexValue: flexPool,
        //Weapon data
        weaponSelected : weaponSelected ? weaponSelected.weapon : null,
        weaponID : weaponSelected ? weaponSelected.weaponID : null,
        weaponName : weaponSelected ? weaponSelected.weaponName : null,
        weaponDamage : weaponSelected ? weaponSelected.weaponDamage : null,
        weaponType : weaponSelected ? weaponSelected.weaponType : null,
        currentAmmo : weaponSelected ? weaponSelected.currentAmmo : null,
        maxAmmo : weaponSelected ? weaponSelected.maxAmmo : null,
        meleeDamageMod: actorModel.mods.meleeDamageMod,
        weaponTraits : weaponSelected ? weaponSelected.weaponTraits : null,
        //Psi
        sleightName : dataset.sleightname,
        sleightDescription : dataset.description,
        sleightAction : dataset.action,
        sleightDuration : dataset.duration,
        sleightInfection : dataset.infection,
        //System Options
        askForOptions : event.shiftKey,
        optionsSettings: game.settings.get("eclipsephase", "showTaskOptions"),
        brewStatus: game.settings.get("eclipsephase", "superBrew")
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

//Special Dialogs

async function poolUsageConfirmation(dialog, type, pool, dialogType, subtitle, copy, poolName, inputType, inputNeeded) {
  let dialogName = game.i18n.localize('ep2e.skills.pool.dialogHeadline') + " (" + game.i18n.localize(poolName) +")";
  let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
  let confirmButton = game.i18n.localize('ep2e.actorSheet.button.confirm');
  const html = await renderTemplate(dialog, {type, pool, dialogType, subtitle, copy, poolName, inputType, inputNeeded});

  return new Promise(resolve => {
      const data = {
          title: dialogName,
          content: html,
          buttons: {
              cancel: {
                  label: cancelButton,
                  callback: html => resolve ({cancelled: true})
              },
              normal: {
                  label: confirmButton,
                  callback: html => resolve(_poolUsageModifiers(html[0].querySelector("form")))
              }
          },
          default: "normal",
          close: () => resolve ({cancelled: true})
      };
      let options = {width:315}
      new Dialog(data, options).render(true);
  });
}

//Pool usage confirmation check results
function _poolUsageModifiers(form) {
    return {
        modifier: form.modifier ? form.modifier.value : null
    }
}