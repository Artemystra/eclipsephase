import { eclipsephase } from "../config.js";
import { registerEffectHandlers,registerCommonHandlers,itemCreate,registerItemHandlers } from "../common/common-sheet-functions.js";
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

    for(let item of actor.items) {
      let itemID = item._id;
      let itemType = item.type;
      let update = "";
      let itemUpdate = [];
      let skillApt = "";
      let psiType = "";
      let slotType = item.system.slotType;
      let costType = item.system.cost;
      let firingMode = item.system.firingMode;
      let armorUsed = item.system.armorused;
      let programLevel = item.system.programLevel;
      let vehicleType = item.system.type;
      let wareType = item.system.wareType;
      
      if (itemType === "gear" || itemType === "rangedWeapon" || itemType === "ccWeapon" || itemType === "armor" || itemType === "ware" || itemType === "vehicle" || itemType === "drug" || itemType === "grenade"){
        if (firingMode){
          switch (firingMode) {
            case 'SS':
              update = "ss"
              break;
            case 'SA':
              update = "sa"
              break;
            case 'SA/BF':
              update = "saBF"
              break;
            case 'BF/FA':
              update = "bfFA"
              break;
            case 'SA/BF/FA':
              update = "saBFfa"
              break;
            default:
              break;
          }
          if(update != ""){ 
            itemUpdate.push({
              "_id" : itemID,
              "system.firingMode": update
            });
            actor.updateEmbeddedDocuments("Item", itemUpdate);
          }
        }

        if (armorUsed){
          switch (armorUsed) {
            case 'None':
              update = "none"
              break;
            case 'Kinetic':
              update = "kinetic"
              break;
            case 'Energy':
              update = "energy"
              break;
            default:
              break;
          }
          if(update != ""){ 
            itemUpdate.push({
              "_id" : itemID,
              "system.armorUsed": update
            });
            actor.updateEmbeddedDocuments("Item", itemUpdate);
          }
        }

        if (programLevel){
          switch (programLevel) {
            case 'Intruder':
              update = "intruder"
              break;
            case 'User':
              update = "user"
              break;
            case 'Admin':
              update = "admin"
              break;
            case 'Owner':
              update = "owner"
              break;
            default:
              break;
          }
          if(update != ""){ 
            itemUpdate.push({
              "_id" : itemID,
              "system.programLevel": update
            });
            actor.updateEmbeddedDocuments("Item", itemUpdate);
          }
        }

        if (vehicleType){
          switch (vehicleType) {
            case 'Robot':
              update = "robot"
              break;
            case 'Vehicle':
              update = "vehicle"
              break;
            case 'Morph':
              update = "morph"
              break;
            case 'Smart-Animal':
              update = "animal"
              break;
            default:
              break;
          }
          if(update != ""){ 
            itemUpdate.push({
              "_id" : itemID,
              "system.type": update
            });
            actor.updateEmbeddedDocuments("Item", itemUpdate);
          }
        }

        if (wareType){
          switch (wareType) {
            case 'B':
              update = "b"
              break;
            case 'BCH':
              update = "bch"
              break;
            case 'BH':
              update = "bh"
              break;
            case 'BHM':
              update = "bhm"
              break;
            case 'BM':
              update = "bm"
              break;
            case 'C':
              update = "c"
              break;
            case 'CH':
              update = "ch"
              break;
            case 'CHN':
              update = "chn"
              break;
            case 'CHM':
              update = "chm"
              break;
            case 'H':
              update = "h"
              break;
            case 'HN':
              update = "hn"
              break;
            case 'HMN':
              update = "hmn"
              break;
            case 'N':
              update = "n"
              break;
            case 'NH':
              update = "nh"
              break;
            case 'MN':
              update = "mn"
              break;
            default:
              break;
          }
          if(update != ""){ 
            itemUpdate.push({
              "_id" : itemID,
              "system.wareType": update
            });
            actor.updateEmbeddedDocuments("Item", itemUpdate);
          }
        }
        
        if (slotType){
          switch (slotType) {
            case 'Sidearm':
              update = "sidearm"
              break;
            case 'One Handed':
              update = "oneHanded"
              break;
            case 'Two Handed':
              update = "twoHanded"
              break;
            case 'Bulky':
              update = "bulky"
              break;
            case 'Consumable':
              update = "consumable"
              break;
            case 'Accessory':
              update = "accessory"
              break;
            case 'Integrated':
              update = "integrated"
              break;
            case 'Digital':
              update = "digital"
              break;
            case 'Not Mobile':
              update = "notMobile"
              break;
            case 'Main Armor':
              update = "main"
              break;
            case 'Additional Armor':
              update = "additional"
              break;
            case 'Very Small':
              update = "vs"
              break;
            case 'Small':
              update = "s"
              break;
            case 'Medium':
              update = "m"
              break;
            case 'Large':
              update = "l"
              break;
            case 'Very Large':
              update = "vl"
              break;
            default:
              break;
          }
          if(update != ""){ 
            itemUpdate.push({
              "_id" : itemID,
              "system.slotType": update
            });
            actor.updateEmbeddedDocuments("Item", itemUpdate);
          }
        }
        
        switch (costType) {
          case 'Minor':
            update = "minor"
            break;
          case 'Moderate':
            update = "moderate"
            break;
          case 'Major':
            update = "major"
            break;
          case 'Rare':
            update = "rare"
            break;
          default:
            break;
        }
        if(update != ""){
          itemUpdate.push({
            "_id" : itemID,
            "system.cost": update
          });
          actor.updateEmbeddedDocuments("Item", itemUpdate);
        }
      }
      if (item.type === "knowSkill" || item.type === "specialSkill"){
        skillApt = item.system.aptitude;
        switch (skillApt) {
          case 'Intuition':
            update = "int"
            break;
          case 'Cognition':
            update = "cog"
            break;
          case 'Reflexes':
            update = "ref"
            break;
          case 'Savvy':
            update = "sav"
            break;
          case 'Somatics':
            update = "som"
            break;
          case 'Willpower':
            update = "wil"
            break;
          default:
            break;
        }
        if(update != ""){
          itemUpdate.push({
            "_id" : itemID,
            "system.aptitude": update
          });
          actor.updateEmbeddedDocuments("Item", itemUpdate);}
      }

      if (item.type === "aspect"){
        psiType = item.system.psiType;
        switch (psiType) {
          case '':
            update = "gamma"
            break;
          case 'none':
            update = "gamma"
            break;
          case 'Gamma':
            update = "gamma"
            break;
          case 'Chi':
            update = "chi"
            break;
          case 'Epsilon':
            update = "epsilon"
            break;
          default:
            break;
        }
        if(update != ""){
          itemUpdate.push({
            "_id" : itemID,
            "system.psiType": update
          });
          actor.updateEmbeddedDocuments("Item", itemUpdate);
        }
      }
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

  

    // Create a Consumable spell scroll on the Inventory tab
    if (item.type === "morphFlaw" || item.type === "morphTrait" || item.type === "ware") {
      let actor = this.actor
      let actorModel = actor.system
      let currentMorph = actorModel.bodies.activeMorph
      let itemModel = item.system

      itemModel.boundTo = currentMorph
    }

    if (item.type === "rangedWeapon"){
      let ammoUp = item.system.ammoMax;
      item.system.ammoMin = ammoUp;
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
   const actorModel = sheetData.actor.system

    // Initialize containers.

    const gear = [];
    const consumable = [];
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
          epsilon: []
      };
      const program = [];
      const vehicle = {
          robot: [],
          vehicle: [],
          morph: [],
          animal: []
      };
      //this will become more important once morphs are items themselves
      const morph = [];

    // Iterate through items, allocating to containers
    for (let item of sheetData.items) {
      let itemModel = item.system;

      item.img = item.img || DEFAULT_TOKEN;
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
        item.roll = Number(itemModel.value) + aptSelect;
        item.specroll = Number(itemModel.value) + aptSelect + 10;
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
          let slotType = itemModel.slotType;
          let firingMode = itemModel.firingMode;
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
          switch (firingMode){
            case 'ss':
              itemModel.firingModeLabel = "ep2e.item.weapon.table.firingMode.ss";
              break;
            case 'sa':
              itemModel.firingModeLabel = "ep2e.item.weapon.table.firingMode.sa";
              break;
            case 'saBF':
              itemModel.firingModeLabel = "ep2e.item.weapon.table.firingMode.saBF";
              break;
            case 'bfFA':
              itemModel.firingModeLabel = "ep2e.item.weapon.table.firingMode.bfFA";
              break;
            case 'saBFfa':
              itemModel.firingModeLabel = "ep2e.item.weapon.table.firingMode.saBFfa";
              break;
            default:
              break;
          }
          rangedweapon.push(item);
        }
        else if (itemModel.displayCategory === 'ccweapon') {
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
          aspect[itemModel.psiType].push(item);
        }
        else if (item.type === 'program') {
          program.push(item);
        }
        else if (item.system.slotType === 'accessory' || item.system.slotType === 'bulky' || item.system.slotType === 'digital' || item.system.slotType === 'notMobile') {
          let slotType = itemModel.slotType;
            switch (slotType){
              case 'accessory':
                itemModel.slotName = "ep2e.item.general.table.slot.accessory";
                break;
              case 'bulky':
                itemModel.slotName = "ep2e.item.general.table.slot.bulky";
                break;
              case 'digital':
                itemModel.slotName = "ep2e.item.general.table.slot.digital";
                break;
              case 'notMobile':
                itemModel.slotName = "ep2e.item.general.table.slot.notMobile";
                break;
              default:
                break;
            }
          gear.push(item);
        }
        else if (item.system.slotType === 'consumable') {
          itemModel.slotName = "ep2e.item.general.table.slot.consumable";
          consumable.push(item);
        }
        else if (item.type === 'vehicle') {
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

    // Recover Pools
    html.find('.rest').click(async func => {
      const element = event.currentTarget;
      const dataset = element.dataset;
      const brewStatus = game.settings.get("eclipsephase", "superBrew");
      const actorWhole = this.actor;
      const actorModel = this.actor.system;
      const curInsight = actorModel.pools.insight.value;
      const curVigor = actorModel.pools.vigor.value;
      const curMoxie = actorModel.pools.moxie.value;
      const curFlex = actorModel.pools.flex.value;
      const maxInsight = actorModel.pools.insight.totalInsight;
      const maxVigor = actorModel.pools.vigor.totalVigor;
      const maxMoxie = actorModel.pools.moxie.totalMoxie;
      const maxFlex = actorModel.pools.flex.totalFlex;
      let poolSpend = null

      if (!brewStatus){
        poolSpend = (maxInsight - curInsight) + ( maxVigor - curVigor) + (maxMoxie - curMoxie) + (maxFlex - curFlex);
      }
      else {
        poolSpend = (maxInsight - curInsight) + ( maxVigor - curVigor) + (maxMoxie - curMoxie);
      }

      let roll = await new Roll("1d6").evaluate({async: true});
      let recover = null;
      let restValue = null;
      if (dataset.resttype === "short"){
    
        let label = "I used a<p/><strong>Short Rest<p/></strong>to recover some pool points<p/>";
        recover = await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: label
        });

        restValue = recover.content

        await game.dice3d.waitFor3DAnimationByMessageID(recover.id);
      }

      if (dataset.resttype === "long" && !brewStatus){
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          flavor: "I used my<p/><strong>Long Rest<p/></strong>to recover all pools<p/>"
      })
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.pools.flex.value" : maxFlex, "system.rest.restValue" : null});
      }
      else if (dataset.resttype === "long" && brewStatus){
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: "I used my<p/><strong>Long Rest<p/></strong>to recover all pools but Flex<p/>"
        })
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.rest.restValue" : null});
      }
      else if (restValue >= poolSpend && !brewStatus){
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.pools.flex.value" : maxFlex, "system.rest.restValue" : null});
      }
      else if (restValue >= poolSpend && brewStatus){
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.rest.restValue" : null});
      }
      else {
        return actorWhole.update({"system.rest.restValue" : restValue});
      }
  });

  html.find('.restReset').click(async func => {
        const actorWhole = this.actor
        return actorWhole.update({"system.rest.short1" : false, "system.rest.short2" : false, "system.rest.long" : false});
  });

  html.find('.distribute').click(async func => {
    const actorWhole = this.actor;
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
      html.find(".reload").click(this._onReloadWeapon.bind(this));

      ///(De)Activate morph/body bound traits/flaws/ware
      html.find(".bodySelect").change(this._onMorphSwitch.bind(this));

      //Edit Item Checkboxes
      html.find('.equipped.checkBox').click(async ev => {
          const itemId = ev.currentTarget.closest(".equipped.checkBox").dataset.itemId;
          const item = actor.items.get(itemId);
          let toggle = !item.system.active;
          const updateData = {
              "system.active": toggle
          };
          const updated = item.update(updateData);
          
          //handles activation/deactivation of values provided by effects inherited from items
          let allEffects = this.object.effects
          let effUpdateData=[];
          for(let effectScan of allEffects){

            if (effectScan.origin){
              let parentItem = await fromUuid(effectScan.origin);

              if (itemId === parentItem._id){

                effUpdateData.push({
                  "_id" : effectScan._id,
                  disabled: !toggle
                });

              }
            }
          }
          actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
      });

      //show on hover
      html.find(".reveal").on("mouseover mouseout", this._onToggleReveal.bind(this));

      //post to chat WIP
      html.find('.post-chat').click(this._postToChat.bind(this));

  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */

  async _postToChat(event) {
    const itemID = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.items.get(itemID);

    console.log("this is item ", item);


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

  _onTaskCheck(event) {
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
    let skillPoolValue = null

    if (dataset.rolledfrom === "rangedWeapon") {
      specNameValue = actorModel.skillsVig.guns.specname;
      skillRollValue = actorModel.skillsVig.guns.roll;
      poolType = "Vigor"
    }

    if (dataset.rolledfrom === "ccWeapon") {
      specNameValue = actorModel.skillsVig.melee.specname;
      skillRollValue = actorModel.skillsVig.melee.roll;
      poolType = "Vigor"
    }

    console.log("My aptType: ", aptType)

    switch (aptType) {
      case 'Intuition':
        poolType = "Insight"
        break;
      case 'Cognition':
        poolType = "Insight"
        break;
      case 'Reflexes':
        poolType = "Vigor"
        break;
      case 'Somatics':
        poolType = "Vigor"
        break;
      case 'Willpower':
        poolType = "Moxie"
        break;
      case 'Savvy':
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
        skillName : dataset.name.toLowerCase(),
        specName : specNameValue,
        rollType : dataset.type,
        skillValue : skillRollValue,
        rolledFrom : dataset.rolledfrom,
        //Pools
        poolType: poolType,
        poolValue: skillPoolValue,
        flexValue: flexPool,
        //Weapon data
        weaponID : dataset.weaponid,
        weaponName : dataset.weaponname,
        weaponDamage : dataset.roll,
        weaponType : dataset.weapontype,
        currentAmmo : dataset.currentammo,
        maxAmmo : dataset.maxammo,
        meleeDamageMod: actorModel.mods.meleeDamageMod,
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

  _onReloadWeapon(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;
    let currentAmmo = dataset.currentammo;
    let maxAmmo = dataset.maxammo;
    let weaponName = dataset.weaponname;
    let weaponID = dataset.weaponid;
    let difference = maxAmmo - currentAmmo;
    let ammoUpdate = [];

    if (difference>0){
      currentAmmo = maxAmmo;
      ammoUpdate.push({
        "_id" : weaponID,
        "system.ammoMin": currentAmmo
      });

      this.actor.updateEmbeddedDocuments("Item", ammoUpdate);

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: this.actor}),
        flavor: "I reloaded my<p/><strong>" + weaponName + "<p/></strong>with a total of " + difference + " bullets. <p/>"
    })
    }
    else {
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor: this.actor}),
      content: "<center>Your " + weaponName + " is still fully loaded.<p/><strong>No reload needed</strong></center>",
      whisper: [game.user._id]
    })
    }

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


