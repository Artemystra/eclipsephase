import { eclipsephase } from "../config.js";
import { registerEffectHandlers,registerCommonHandlers,tempEffectCreation,tempEffectDeletion,confirmation,embeddedItemToggle,moreInfo,listSelection, gmList} from "../common/common-sheet-functions.js";
import * as damage from "../rolls/damage.js";
import { weaponPreparation,reloadWeapon } from "../common/weapon-functions.js";
import { traitAndAccessoryFinder } from "../common/sheet-preparation.js";
import * as COMMON from "../common/common-sheet-functions.js"
import * as DICE from "../rolls/dice.js";
import * as MORPHFUNCTION from "../common/morp-functions.js"
import itemRoll from "../item/EPitem.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;


export default class EPactorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    classes: ["eclipsephase", "sheet", "actor"],
    tag: "form",
    form: {
      submitOnChange: false,
      closeOnSubmit: false
    },
    position: {
      width: 1400,
      height: 850
    },
    window: {
      resizable: false
    }
  });

  static PARTS = {
    body: {
      template: "systems/eclipsephase/templates/actor/actor-sheet.html",
      root: true
    }
  };

  static TABS = {
    primary: {
      initial: "skills",
      tabs: [
        { id: "skills", label: "Skills" },
        { id: "morph", label: "Morph" },
        { id: "weapons", label: "Weapons" },
        { id: "vehicles", label: "Vehicles" },
        { id: "psi", label: "Psi" },
        { id: "gmInfo", label: "GM Info" }
      ]
    },
    secondary: {
      initial: "ego",
      tabs: [
        { id: "ego" },
        { id: "identification" },
        { id: "muse" }
      ]
    },
    morph: {
      initial: "sleeved",
      tabs: [
        { id: "sleeved" }
      ]
    },
    id: {
      initial: "active",
      tabs: [
        { id: "active" }
      ]
    }
  };

  tabGroups = {
    primary: "skills",
    secondary: "ego",
    morph: "sleeved",
    id: "active"
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.config = CONFIG.eclipsephase;
    context.isGM = game.user.isGM;

    context.tabs = {
      primary: this._prepareTabs("primary"),
      secondary: this._prepareTabs("secondary"),
      morph: this._prepareTabs("morph"),
      id: this._prepareTabs("id")
    };

    context.tabGroups = this.tabGroups;

    await this._prepareCharacterItems(context);
    await this._prepareRenderedHTMLContent(context);

    return context;
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.body.template = this._getSheetTemplate();
    return parts;
  }

  _getSheetTemplate() {
    const actor = this.document;
    const showEverything = game.settings.get("eclipsephase", "showEverything");
    const hideNPCs = game.settings.get("eclipsephase", "hideNPCs");

    const actorSheet = "systems/eclipsephase/templates/actor/actor-sheet.html";
    const npcSheet = "systems/eclipsephase/templates/actor/npc-sheet.html";
    const goonSheet = "systems/eclipsephase/templates/actor/goon-sheet.html";
    const limitedSheet = "systems/eclipsephase/templates/actor/sheet-limited.html";

    if (actor.type === "character") {
      if (showEverything) return actorSheet;
      return (!game.user.isGM && !actor.isOwner) ? limitedSheet : actorSheet;
    }

    if (actor.type === "npc") {
      return (!game.user.isGM && !actor.isOwner) ? limitedSheet : actorSheet;
    }

    if (actor.type === "goon") {
      return (!game.user.isGM && !actor.isOwner) ? limitedSheet : actorSheet;
    }

    return actorSheet;
  }

  _getSheetDimensions() {
    const actor = this.document;
    const showEverything = game.settings.get("eclipsephase", "showEverything");
    const hideNPCs = game.settings.get("eclipsephase", "hideNPCs");

    if (actor.type === "character") {
      if (showEverything) return { width: 1400, height: 850 };
      return (!game.user.isGM && !actor.isOwner)
        ? { width: 800, height: 682 }
        : { width: 1400, height: 850 };
    }

    if (hideNPCs && !game.user.isGM && !actor.isOwner) {
      return { width: 800, height: 366 };
    }

    return (!game.user.isGM && !actor.isOwner)
      ? { width: 800, height: 366 }
      : { width: 1058, height: 600 };
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.setPosition(this._getSheetDimensions());
  }

  async _prepareRenderedHTMLContent(sheetData) {
    const actor = this.document;
    const actorModel = actor.system;

    sheetData.actor = actor;
    sheetData.htmlBiography = await TextEditor.enrichHTML(actorModel.biography, { async: true });

    if (actor.type === "character") {
      sheetData.htmlMuseDescription = await TextEditor.enrichHTML(
        actorModel.muse.description,
        { async: true }
      );
    }
  }
  
  async _prepareCharacterItems(sheetData) {
    const actor = this.document;
    const actorModel = actor.system;

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
      const id = [];
      const know = [];
      const special = [];
      const trait = [];
      const flaw = [];
      const effects = [];
      const rangedweapon = [];
      const ccweapon = [];
      const armor = [];
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
      const bodies = {};
      const morph = [];
      //section is marked to be deleted due to being deprecated since morphs are items now
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
      const ware = {
          morph1: [],
          morph2: [],
          morph3: [],
          morph4: [],
          morph5: [],
          morph6: []
      };

      let migrationBridge = 0;
      for (let item of actor.items){
        if (item.type === "morph"){
          let morphID
          migrationBridge += 1;
          if (actor.type === "character") morphID = item.id
          if (actor.type !== "character") morphID = "activeMorph"
          bodies[morphID] = { morphdetails: [], morphtraits: [], morphflaws: [], morphgear: [], traitsCount: 0, flawsCount: 0, gearCount: 0}
        }

        
      }
      if (migrationBridge === 0){
        bodies["migrationBody"] = { morphdetails: [], morphtraits: [], morphflaws: [], morphgear: [], traitsCount: 0, flawsCount: 0, gearCount: 0}
      }
      actor.bodies = bodies;
      // Iterate through items, allocating to containers
      for (let item of actor.items) {
        let itemModel = item.system;
        const boundTo = item.system.boundTo;

        item.img = item.img || DEFAULT_TOKEN;

        //Adds morphs to their container AND creates a subcontainer to morphflaws/traits and ware
        if (item.type === "morph" && actor.type === "character"){
          const morphID = (item.id);
          const category = bodies[morphID];
          category.morphdetails.push(item);
        }
        else if (item.type === "morph" && actor.type !== "character"){
          const category = bodies["activeMorph"];
          category.morphdetails.push(item);
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
          else if (item.type === "id"){
            item.system.displayNumber =  id.length + 1;
            id.push(item);
          }
          else if (item.type === 'trait' || item.system.traitType === "trait" && item.system.ego) {
            trait.push(item);
          }
          else if (item.type === 'flaw' || item.system.traitType === "flaw" && item.system.ego) {
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

            if (itemModel.slotType === 'digital')
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
            itemModel.luc = Math.round(itemModel.wil * 2);
            itemModel.tt = Math.round(itemModel.luc / 5);
            itemModel.ir = Math.round(itemModel.luc * 2);
            vehicle[itemModel.type].push(item)
          }
        else if (item.type === 'ware' && itemModel.boundTo) {
              const path = bodies[boundTo].morphgear;
              bodies[boundTo].gearCount += 1;
              path.push(item);
        }
        else if (item.type === "traits" && itemModel.traitType === "flaw" && itemModel.boundTo) {
            const path = bodies[boundTo].morphflaws;
            bodies[boundTo].flawsCount += 1;
            path.push(item);
        }
        else if (item.type === "traits" && itemModel.traitType === "trait" && itemModel.boundTo) {
            const path = bodies[boundTo].morphtraits;
            bodies[boundTo].traitsCount += 1;
            path.push(item);
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
      actor.morph = morph;
      actor.ids = id;

      // Check if sleights are present and toggle Psi Tab based on this
      if (actor.aspect.chi.length>0){
        actorModel.additionalSystems.hasPsi = 1;
      }
      else if (actor.aspect.gamma.length>0){
        actorModel.additionalSystems.hasPsi = 1;
      }
      

    /* In case ACTOR DATA is needed */
    console.log(this) 

  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    await this.changeTab(this.tabGroups.primary, "primary", { force: true });
    //await this.changeTab(this.tabGroups.secondary, "secondary", { force: true });
    //await this.changeTab(this.tabGroups.morph, "morph", { force: true });
    //await this.changeTab(this.tabGroups.id, "id", { force: true });

    const html = this.element;
    if (!html) return;

    //registerEffectHandlers(html, this.actor);
    //registerCommonHandlers(html, this.actor);

    if (!this.isEditable) return;

    //this._activateItemListeners(html);
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

//Pool usage confirmation check results
function _traitSelection(form) {
    return {
        value: form.TraitTypeSelection.value
    }
}