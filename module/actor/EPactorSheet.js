import { eclipsephase } from "../config.js";
import { registerCommonHandlers,tempEffectCreation,tempEffectDeletion,confirmation,embeddedItemToggle,moreInfo,listSelection, gmList} from "../common/general-sheet-functions.js";
import * as damage from "../rolls/damage.js";
import { weaponPreparation,reloadWeapon } from "../common/weapon-functions.js";
import { traitAndAccessoryFinder } from "../common/sheet-preparation.js";
import * as SHEET from "../common/general-sheet-functions.js"
import * as HELPER from "../common/general-helper-functions.js"
import * as DICE from "../rolls/dice.js";
import * as MORPHFUNCTION from "../common/morp-functions.js"
import itemRoll from "../item/EPitem.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;


export default class EPactorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  
  //Fallback config for sheets in general
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    classes: ["eclipsephase", "sheet", "actor"],
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    position: {
      width: 1400,
      height: 870
    },
    window: {
      resizable: false
    },
    actions: {
      editImage: this._onEditImage
    },
    dragDrop: [
      {
        dragSelector: ".item-drag",
        dropSelector: ".window-content"
      }
    ]
  });

  //Fallback template for sheets in general
  static PARTS = {
    body: {
      template: "systems/eclipsephase/templates/actor/actor-sheet.html",
      root: true
    }
  };

  //Config for fixed Tabs
  static TABS = {
    primary: {
      initial: "skills",
      tabs: [
        { id: "ego", label: "ep2e.actorSheet.leftTabs.egoTab" },
        { id: "skills", label: "ep2e.actorSheet.rightTabs.skillsTab" },
        { id: "morph", label: "ep2e.actorSheet.rightTabs.morphTab" },
        { id: "weapons", label: "ep2e.actorSheet.rightTabs.inventoryTab" },
        { id: "vehicles", label: "ep2e.actorSheet.rightTabs.peripheralsTab" },
        { id: "psi", label: "ep2e.actorSheet.rightTabs.psiTab" },
        { id: "gmInfo", label: "ep2e.actorSheet.rightTabs.gmInfoTab" }
      ]
    },
    secondary: {
      initial: "ego",
      tabs: [
        { id: "ego", label: "ep2e.actorSheet.leftTabs.egoTab" },
        { id: "identification", label: "ep2e.actorSheet.leftTabs.idTab" },
        { id: "muse", label: "ep2e.actorSheet.leftTabs.museTab" }
      ]
    }
  };

  //Config for dynamic Tabs based on items (e.g. morphs)
  _getTabsConfig(group) {
  if (group === "morph") {
    const tabs = [];

    for (const body of Object.values(this.document.bodies ?? {})) {
      const morphId = body?.morphdetails?.[0]?.id;
      if (!morphId) continue;

      tabs.push({
        id: this.document.system.activeMorph === morphId ? "sleeved" : morphId
      });
    }

    return {
      initial: "sleeved",
      tabs
    };
  }

  if (group === "id") {
    const tabs = [];

    for (const item of this.document.ids ?? []) {
      const idTab = this.document.system.activeID === item.id ? "active" : item.id;
      tabs.push({ id: idTab });
    }

    return {
      initial: "active",
      tabs
    };
  }

  return super._getTabsConfig(group);
  }

  //Config of tab groups
  tabGroups = {
    primary: "skills",
    secondary: "ego",
    morph: "sleeved",
    id: "active"
  };

  static async _onEditImage(event, target) {
    const field = target.dataset.field || "img";
    const current = foundry.utils.getProperty(this.document, field) || "";

    const FilePickerClass =
      foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;

    const fp = new FilePickerClass({
      type: "image",
      current,
      callback: async (path) => {
        await this.document.update({ [field]: path });
      }
    });

    return fp.browse();
  }

  //Preparation of the whole Sheet context
  async _prepareContext(options) {
    const actor = this.document
    const context = await super._prepareContext(options);
    context.config = CONFIG.eclipsephase;
    context.isGM = game.user.isGM;

    await this._prepareCharacterItems(context);
    await this._prepareRenderedHTMLContent(context);

    context.editable = this.isEditable;
    
    //Tabs are getting prepared AFTER the items are created, as some items define the tabs (e.g. morph/id)
    if (game.user.isGM || actor.isOwner){
      context.tabs = {
        primary: this._prepareTabs("primary"),
        secondary: this._prepareTabs("secondary"),
        morph: this._prepareTabs("morph"),
        id: this._prepareTabs("id")
      };

      context.tabGroups = this.tabGroups;
    }

    return context;
  }

  //Insert the template
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.body.template = this._getSheetTemplate();
    return parts;
  }

  //Insert the sheet dimensions
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.setPosition(this._getSheetDimensions());
  }

  //Sheet template based on actor.type
  _getSheetTemplate() {
    const actor = this.document;
    const showEverything = game.settings.get("eclipsephase", "showEverything");
    const hideNPCs = game.settings.get("eclipsephase", "hideNPCs");

    const actorSheet = "systems/eclipsephase/templates/actor/actor-sheet.html";
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

  //Sheet dimensions based on actor.type
  _getSheetDimensions() {
    const actor = this.document;
    const showEverything = game.settings.get("eclipsephase", "showEverything");
    const hideNPCs = game.settings.get("eclipsephase", "hideNPCs");

    if (actor.type === "character") {
      if (showEverything) return { width: 1400, height: 870 };
      return (!game.user.isGM && !actor.isOwner)
        ? { width: 800, height: 682 }
        : { width: 1400, height: 870 };
    }

    if (hideNPCs && !game.user.isGM && !actor.isOwner) {
      return { width: 800, height: 366 };
    }

    return (!game.user.isGM && !actor.isOwner)
      ? { width: 800, height: 366 }
      : { width: 1058, height: 600 };
  }

  //Registering HTML-editors to actor sheets
  async _prepareRenderedHTMLContent(sheetData) {
    const actor = this.document;
    const actorModel = actor.system;

    const biographyRaw = actorModel.biography ?? "";
    const museRaw = actorModel.muse?.description ?? "";

    sheetData.actor = actor;

    sheetData.htmlBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      biographyRaw,
      { async: true }
    );

    sheetData.htmlPsiStrainDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      actorModel.psiStrain?.description ?? "",
      { async: true }
    );

    sheetData.biographyValue = HELPER._normalizeRichTextForProseMirror(biographyRaw);

    if (actor.type === "character") {
      sheetData.htmlMuseDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        museRaw,
        { async: true }
      );

      sheetData.museDescriptionValue = HELPER._normalizeRichTextForProseMirror(museRaw);
    }
  }
  
  //Registering and sorting character items into buckets for context
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
        const effectList = this.document.getEmbeddedCollection("ActiveEffect");
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

  //Code that runs every time the sheet renders anew (e.g. open a formerly closed sheet)
  async _onRender(context, options) {
      const actor = this.document;

      await super._onRender(context, options);

      if (game.user.isGM || actor.isOwner){
      await this.changeTab(this.tabGroups.primary, "primary", { force: true });

      //Sets the opened tab for PC sheets
      if (actor.type === "character"){
        await this.changeTab(this.tabGroups.secondary, "secondary", { force: true });

        this._syncManualTabGroup("morph");
        this._syncManualTabGroup("id");

      }
    }

   for (const el of this.element.querySelectorAll(".item-drag")) {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", this._onNativeItemDragStart.bind(this));
    }

    const html = this.element;
    const actorModel = actor.system;
    const brewStatus = game.settings.get("eclipsephase", "superBrew");
    if (!html) return;

    SHEET.registerEffectHandlers(html, this.actor);
    SHEET.registerCommonHandlers(html, this.actor);

    if (!this.isEditable) return;

    this._activItemListeners(html, actor, brewStatus);
    this._activPoolListeners(html, actor, brewStatus);
    this._activSupportListeners(html, actor, brewStatus);
    this._activIdentityListeners(html, actor, brewStatus);
    this._activHealthListeners(html, actor, actorModel, brewStatus);
  }

    _canDragStart(selector) {
    return this.isEditable;
  }

  _canDragDrop(selector) {
    return true;
  }


  //Drag Items
  _onNativeItemDragStart(event) {

    const dragHandle = event.currentTarget;
    const itemId = dragHandle.dataset.itemid;
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const dragData = {
      type: "Item",
      uuid: item.uuid,
      itemId: item.id,
      actorId: this.actor.id,
      actorUuid: this.actor.uuid,
      itemType: item.type,
      systemId: game.system.id,
      epTransfer: {
        sourceActorId: this.actor.id,
        sourceActorUuid: this.actor.uuid
      }
    };

    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    return super._onDrop(event);
  }

  async _onDropItem(event, item) {
    const targetActor = this.actor;
    const sourceActor = item.parent instanceof Actor ? item.parent : null;

    // Dropped back onto the same actor sheet: do nothing
    if (sourceActor && sourceActor.id === targetActor.id) {
      return null;
    }

    // Cross-actor transfer
    if (sourceActor && sourceActor.id !== targetActor.id) {
      const quantity = 1;

      const canEditSource = sourceActor.isOwner;
      const canEditTarget = targetActor.isOwner;
      // Direct transfer if current user owns both sides
      if (canEditSource && canEditTarget) {
        return SHEET.transferItemBetweenActors({
          sourceActor,
          targetActor,
          item,
          quantity
        });
      }

      // Fallback: ask a GM to execute the transfer
      const activeGM = game.users.activeGM;
      if (!activeGM) {
        ui.notifications.warn("No GM is connected, so the transfer cannot be completed.");
        return null;
      }

      const result = await HELPER.requestGMItemTransfer({
        sourceActorId: sourceActor.id,
        targetActorId: targetActor.id,
        itemId: item.id,
        quantity
      });

      if (!result?.ok) {
        ui.notifications.warn(result?.error ?? "The transfer could not be completed.");
        return null;
      }

      return null;
    }

    // External drop handling only
    const actor = this.actor;
    const actorModel = actor.system;
    const itemData = item.toObject();
    const itemModel = itemData.system;
    let traitSelection;

    const currentMorph = actorModel.activeMorph;

    if (itemData.type === "morph" && actor.type !== "character") {
      await MORPHFUNCTION.replaceMorph(actor, currentMorph, itemData);
      const created = await actor.createEmbeddedDocuments("Item", [itemData]);
      await actor.update({
        "system.activeMorph": created[0].id,
        "flags.eclipsephase.resleeving": true
      });
      return created[0];
    }

    if (itemData.type === "traits" && itemModel.morph === true && itemModel.ego === true) {
      const dialogName = game.i18n.localize("ep2e.dialog.selectTrait.header");
      const dialogCopy = "ep2e.dialog.selectTrait.copy";
      const listOptions = [
        { id: "ego", label: "ep2e.actorSheet.leftTabs.egoTab" },
        { id: "morph", label: "ep2e.actorSheet.rightTabs.morphTab" }
      ];

      traitSelection = await listSelection(
        listOptions,
        "standardSelectionList",
        250,
        dialogName,
        "",
        dialogCopy
      );

      if (traitSelection.cancelled) return null;

      if (traitSelection.selection === "morph") itemModel.ego = false;
      else itemModel.morph = false;
    }

    if (
      (itemData.type === "traits" && itemModel.morph === true) ||
      itemData.type === "ware" ||
      itemModel.morph === true
    ) {
      itemModel.boundTo = actor.type === "character" ? currentMorph : "activeMorph";
    }

    if (itemData.type === "rangedWeapon") {
      if (
        itemModel.ammoType !== "seeker" &&
        !itemModel.mode1.traits.specialAmmoDrugs.value &&
        !itemModel.mode1.traits.specialAmmoBugs.value
      ) {
        const name = itemModel.ammoType;
        const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
        itemModel.ammoMin = itemModel.ammoMax;
        itemModel.ammoSelected.name = `${capitalizedName} (Standard)`;
      }
    }

    itemModel.updated = game.system.version;

    const created = await actor.createEmbeddedDocuments("Item", [itemData]);
    return created[0] ?? null;
  }

  //Registering own tab click behavior (This is important since some tabGroups are dynamically created)
  async _onClickTab(event) {
    const target = event.target.closest("[data-action='tab'][data-group][data-tab]");
    if (!target) return;

    const group = target.dataset.group;
    const tab = target.dataset.tab;

    // Let Foundry handle the normal top-level static groups
    if (group === "primary" || group === "secondary") {
      return super._onClickTab(event);
    }

    // Handle nested dynamic groups manually
    if (group === "morph" || group === "id") {
      event.preventDefault();
      event.stopPropagation();

      this.tabGroups[group] = tab;
      this._syncManualTabGroup(group);
      return;
    }

    return super._onClickTab(event);
  }

  //Registering own tab-highlight behavior (This is important since some tabGroups are dynamically created)
  _syncManualTabGroup(group) {
    const root = this.element;
    if (!root) return;

    const activeTab = this.tabGroups[group];
    if (!activeTab) return;

    // Update nav items
    root.querySelectorAll(`nav[data-group="${group}"] [data-action="tab"][data-tab]`).forEach(el => {
      el.classList.toggle("active", el.dataset.tab === activeTab);
    });

    // Update tab panes
    root.querySelectorAll(`.tab[data-group="${group}"][data-tab]`).forEach(el => {
      el.classList.toggle("active", el.dataset.tab === activeTab);
    });
  }

  /**
   * ===========================
   *      ACTIVE LISTENERS
   * ===========================
   */

  //Creation, Curation & Deletion of items directly on the sheet
  _activItemListeners(html, actor, brewStatus){

    // Add Custom Skill Item
    html.querySelectorAll(".item-create").forEach(element => {
      element.addEventListener("click", this._onItemCreate.bind(this));
    });

    // Update Inventory Item
    html.querySelectorAll(".item-edit").forEach(element => {
      element.addEventListener("click", ev => {
        const li = ev.currentTarget.closest(".item");
        if (!li) return;

        const item = actor.items.get(li.dataset.itemId);
        item?.sheet?.render(true);
      });
    });

    // Delete Inventory Item
    html.querySelectorAll(".item-delete").forEach(element => {
      element.addEventListener("click", async ev => {
        let askForOptions = ev.shiftKey;
        const li = ev.currentTarget.closest(".item");
        if (!li) return;

        const itemId = li.dataset.itemId;
        if (!itemId) return;

        if (!askForOptions) {
          const item = actor.items.get(itemId);
          const itemName = li.dataset.itemName ? li.dataset.itemName : null;
          const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
          const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.button.delete")) + " " + (itemName ? itemName : "");
          const popUpCopy = "ep2e.actorSheet.popUp.deleteCopyGeneral";
          const popUpInfo = "ep2e.actorSheet.popUp.deleteAdditionalInfo";

          let popUp = await confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo);

          if (popUp.confirm === true && item?.type === "morph") {
            await MORPHFUNCTION.deleteMorph(actor, itemId);
          }
          else if (popUp.confirm === true) {
            await actor.deleteEmbeddedDocuments("Item", [itemId]);
            HELPER.slideUp(li, 200, () => this.render(false));
          }
          else {
            return;
          }

        }
        else if (askForOptions) {
          await actor.deleteEmbeddedDocuments("Item", [itemId]);
          HELPER.slideUp(li, 200, () => this.render(false));
        }
      });
    });

    html.querySelectorAll(".deleteEffect").forEach(element => {
      element.addEventListener("click", async f => {
        const dataset = f.currentTarget.dataset;
        const actorWhole = actor;
        const target = dataset.target;

        await tempEffectDeletion(actorWhole, "eclipsephase", "effectKey", [target]);
      });
    });

  };

  _activPoolListeners(html, actor, brewStatus) {

    // Use Pools Outside rolls
    html.querySelectorAll(".poolUse").forEach(element => {
      element.addEventListener("click", async f => {
        const dialog = "systems/eclipsephase/templates/chat/pop-up.html";
        const result = "systems/eclipsephase/templates/chat/pool-usage.html";
        const dataset = f.currentTarget.dataset;
        const type = dataset.type;
        const pool = dataset.pool;
        const dialogType = "poolUsage";

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
        let effectIcon = "";
        let effectTarget = "";
        let effectMode = 0;
        let effectVal = "";

        switch (pool) {
          case "ins":
            poolValue = actor.system.pools.insight.value;
            poolUpdate = "system.pools.insight.value";
            poolName = "ep2e.skills.insightSkills.poolHeadline";
            subtitle = "ep2e.skills.insightSkills.poolSubheadline" + type;
            copy = "ep2e.skills.insightSkills.poolCopy" + type;
            break;
          case "vig":
            poolValue = actor.system.pools.vigor.value;
            poolUpdate = "system.pools.vigor.value";
            poolName = "ep2e.skills.vigorSkills.poolHeadline";
            subtitle = "ep2e.skills.vigorSkills.poolSubheadline" + type;
            copy = "ep2e.skills.vigorSkills.poolCopy" + type;
            if (type === "3") {
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
            poolUpdate = "system.pools.moxie.value";
            poolName = "ep2e.skills.moxieSkills.poolHeadline";
            subtitle = "ep2e.skills.moxieSkills.poolSubheadline" + type;
            copy = "ep2e.skills.moxieSkills.poolCopy" + type;
            if (type === "1") {
              inputNeeded = true;
              inputType = "traumaIgnore";
              effectLabel = "Temp Ignore Trauma";
              effectIcon = "systems/eclipsephase/resources/icons/add.png";
              effectTarget = "system.mods.traumaMod";
              effectMode = 2;
              effectVal = "-1";
            }
            if (type === "2") {
              inputNeeded = true;
              inputType = "repFill";
            }
            break;
          case "flex":
            poolValue = actor.system.pools.flex.value;
            poolUpdate = "system.pools.flex.value";
            poolName = "ep2e.skills.flex.poolHeadline";
            subtitle = "ep2e.skills.flex.poolSubheadline" + type;
            copy = "ep2e.skills.flex.poolCopy" + type;
            break;
          default:
            break;
        }
        
        let purpose = await poolUsageConfirmation(dialog, type, pool, dialogType, subtitle, copy, poolName, inputType, inputNeeded);

        if (purpose.cancelled) {
          return;
        }

        let modifier = Number(purpose.modifier);

        if (modifier) {
          poolChange *= modifier;
        }

        newPoolValue = poolValue - poolChange;

        if (newPoolValue >= 0) {
          let changes = [{ "key": effectTarget, "mode": effectMode, "value": effectVal * poolChange }];
          if (inputType === "woundIgnore" || inputType === "traumaIgnore") {
            await tempEffectCreation(actor, effectLabel, effectIcon, changes, inputType);
          }
    
          let dialogData = { type: dialogType, poolName: poolName, subtitle: subtitle, copy: copy, number: poolChange };
          let renderedHtml = await foundry.applications.handlebars.renderTemplate(result, dialogData);

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: renderedHtml
          });
    
          return actor.update({ [poolUpdate]: newPoolValue });

        } else {
          let chatData = { type: "notEnoughPool", poolName: poolName, brewStatus: brewStatus, poolType: pool };
          let renderedHtml = await foundry.applications.handlebars.renderTemplate(result, chatData);

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: renderedHtml,
            whisper: [game.user._id]
          });
        }
      });
    });

    // Recover Pools
    html.querySelectorAll(".rest").forEach(element => {
      element.addEventListener("click", async func => {
        const dataset = func.currentTarget.dataset;
        const brewStatus = false;
        //const brewStatus = game.settings.get("eclipsephase", "superBrew"); -> Out of order for the time being (25.07.2025)
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
        const resetInfection = actorModel.psiStrain.minimumInfection;
        let poolSpend = null;

        await actorWhole.update({
          "system.pools.update.insight": null,
          "system.pools.update.vigor": null,
          "system.pools.update.moxie": null,
          "system.pools.update.flex": null
        });

        if (!restReset && restType === "long") {
          await tempEffectDeletion(actorWhole, "eclipsephase", "effectKey", ["woundIgnore", "traumaIgnore"]);
        }
        else if (restReset) {
          await tempEffectDeletion(actorWhole, "eclipsephase", "effectKey", ["woundIgnore", "traumaIgnore"]);
        }

        if (!brewStatus) {
          poolSpend = (maxInsight - curInsight) + (maxVigor - curVigor) + (maxMoxie - curMoxie) + (maxFlex - curFlex);
        }
        else {
          poolSpend = (maxInsight - curInsight) + (maxVigor - curVigor) + (maxMoxie - curMoxie);
        }

        let rollFormula = "1d6" + (actorModel.additionalSystems.restChiMod ? " + " + eval(actorModel.additionalSystems.restChiMod) * actorModel.mods.psiMultiplier : "") + (actorModel.mods.recoverBonus ? " + " + eval(actorModel.mods.recoverBonus) : "");
        let roll = await new Roll(rollFormula).evaluate();
        let restValue = null;

        if (restType === "short") {
          let message = {};

          message.rollTitle = "ep2e.roll.announce.total";
          message.mainMessage = "ep2e.roll.announce.rest.short";

          await DICE.rollToChat(null, message, DICE.DEFAULT_ROLL, roll, actorWhole.name, null, false, "rollOutput");

          restValue = roll.total;
        }

        if (restType === "long" && !brewStatus) {
          let label = game.i18n.localize("ep2e.roll.announce.rest.long");
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
          });
          return actorWhole.update({
            "system.pools.insight.value": maxInsight,
            "system.pools.vigor.value": maxVigor,
            "system.pools.moxie.value": maxMoxie,
            "system.pools.flex.value": maxFlex,
            "system.rest.restValue": null,
            "system.psiStrain.infection": resetInfection
          });
        }
        else if (restType === "long" && brewStatus) {
          let label = game.i18n.localize("ep2e.roll.announce.rest.long");
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
          });
          return actorWhole.update({
            "system.pools.insight.value": maxInsight,
            "system.pools.vigor.value": maxVigor,
            "system.pools.moxie.value": maxMoxie,
            "system.rest.restValue": null,
            "system.psiStrain.infection": resetInfection
          });
        }
        else if (restValue >= poolSpend && !brewStatus) {
          return actorWhole.update({
            "system.pools.insight.value": maxInsight,
            "system.pools.vigor.value": maxVigor,
            "system.pools.moxie.value": maxMoxie,
            "system.pools.flex.value": maxFlex,
            "system.rest.restValue": null,
            "system.psiStrain.infection": easeInfection
          });
        }
        else if (restValue >= poolSpend && brewStatus) {
          return actorWhole.update({
            "system.pools.insight.value": maxInsight,
            "system.pools.vigor.value": maxVigor,
            "system.pools.moxie.value": maxMoxie,
            "system.rest.restValue": null,
            "system.psiStrain.infection": easeInfection
          });
        }
        else {
          return actorWhole.update({
            "system.rest.restValue": restValue,
            "system.psiStrain.infection": easeInfection
          });
        }
      });
    });

    html.querySelectorAll(".restReset").forEach(element => {
      element.addEventListener("click", async func => {
        return actor.update({
          "system.rest.short1": false,
          "system.rest.short2": false,
          "system.rest.shortExtra": false,
          "system.rest.long": false
        });
      });
    });

    html.querySelectorAll(".distribute").forEach(element => {
      element.addEventListener("click", async func => {
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

        return actorWhole.update({
          "system.pools.insight.value": insightUpdate,
          "system.pools.vigor.value": vigorUpdate,
          "system.pools.moxie.value": moxieUpdate,
          "system.pools.flex.value": flexUpdate,
          "system.rest.restValue": null,
          "system.pools.update.insight": null,
          "system.pools.update.vigor": null,
          "system.pools.update.moxie": null,
          "system.pools.update.flex": null
        });
      });
    });

  };

  _activSupportListeners(html, actor, brewStatus) {

    //Edit Item Input Fields
    html.querySelectorAll(".sheet-inline-edit").forEach(element => {
      element.addEventListener("change", this._onSkillEdit.bind(this));
    });

    //Reload Ranged Weapon Functionality
    reloadWeapon(html, actor);

    //Edit Item Checkboxes
    embeddedItemToggle(html, actor);

    //show on hover
    html.querySelectorAll(".reveal").forEach(element => {
      element.addEventListener("mouseover", this._onToggleReveal.bind(this));
      element.addEventListener("mouseout", this._onToggleReveal.bind(this));
    });

    //post to chat WIP
    html.querySelectorAll(".post-chat").forEach(element => {
      element.addEventListener("click", this._postToChat.bind(this));
    });
    
    //More Information Dialog
    html.querySelectorAll("a.moreInfoDialog").forEach(element => {
      element.addEventListener("click", moreInfo);
    });
    
    // Rollable abilities.
    html.querySelectorAll(".task-check").forEach(element => {
      element.addEventListener("click", this._onTaskCheck.bind(this));
    });

  };

  _activIdentityListeners(html, actor, brewStatus) {

    html.querySelectorAll(".sleeveButton").forEach(element => {
      element.addEventListener("click", ev => {
        MORPHFUNCTION.resleeveMorph(actor, ev.currentTarget, this);
      });
    });

    html.querySelectorAll(".changeIdentityButton").forEach(element => {
      element.addEventListener("click", async func => {
        const dataset = func.currentTarget.dataset;
        const itemID = dataset.itemId;
        if (!itemID) return;

        const newID = actor.items.get(itemID);
        if (!newID) return;

        const itemName = newID.name;
        const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
        const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.button.changeID")) + ": " + (itemName ? itemName : "");
        const popUpCopy = "ep2e.actorSheet.popUp.IDswitchCopyGeneral";
        const popUpInfo = "ep2e.actorSheet.popUp.IDswitchAdditionalInfo";
        const popUpPrimary = "ep2e.actorSheet.button.changeID";
        const ID_CHANGE_MESSAGE = "systems/eclipsephase/templates/chat/change.html";
        let popUp = await confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, "", popUpPrimary);

        if (popUp.confirm === true) {
          this.tabGroups.id = "active";
          await actor.update({ "system.activeID": itemID });

          let message = {
            type: "identification",
            actor: actor,
            idName: newID.name
          };

          let renderedHtml = await foundry.applications.handlebars.renderTemplate(ID_CHANGE_MESSAGE, message);

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: renderedHtml,
            whisper: gmList()
          });
        }
        else {
          return;
        }
      });
    });

    //Reset Psi
    html.querySelectorAll(".strainSelection").forEach(element => {
      element.addEventListener("change", ev => {
        actor.update({
          "system.subStrain.influence2.label": "none",
          "system.subStrain.influence2.description": "none",
          "system.subStrain.influence3.label": "none",
          "system.subStrain.influence3.description": "none",
          "system.subStrain.influence4.description": "none",
          "system.subStrain.influence5.description": "none",
          "system.subStrain.influence6.description": "none"
        });
      });
    });

  };

  _activHealthListeners(html, actor, actorModel, brewStatus) {

    html.querySelectorAll(".healthPanelNoSubmit").forEach(element => {
      element.addEventListener("change", event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      });
    });

    //Healthbar Change
    damage.healthBarChange(actor, html, actorModel);

    //Spend Rez
    html.querySelectorAll("#spendRez").forEach(element => {
      element.addEventListener("click", async ev => {
        let object = {};
        const availableRez = actorModel.rezPoints.value;
        const spentRez = actorModel.rezPoints.spent;
        const ledger = actorModel.rezPoints.ledger;

        if (!brewStatus) {
          object = {
            0: { id: "rep", label: "ep2e.healthbar.tooltip.spendRez.rep.label", description: "ep2e.healthbar.tooltip.spendRez.rep.description", type: "input" },
            1: { id: "skill", label: "ep2e.healthbar.tooltip.spendRez.skill.label", description: "ep2e.healthbar.tooltip.spendRez.skill.description", type: "input" },
            2: { id: "spec", label: "ep2e.healthbar.tooltip.spendRez.spec.label", description: "ep2e.healthbar.tooltip.spendRez.spec.description", type: "input" },
            3: { id: "psi", label: "ep2e.healthbar.tooltip.spendRez.psi.label", description: "ep2e.healthbar.tooltip.spendRez.psi.description", type: "input" },
            4: { id: "lang", label: "ep2e.healthbar.tooltip.spendRez.lang.label", description: "ep2e.healthbar.tooltip.spendRez.lang.description", type: "input" },
            5: { id: "apt", label: "ep2e.healthbar.tooltip.spendRez.apt.label", description: "ep2e.healthbar.tooltip.spendRez.apt.description", type: "input" },
            6: { id: "flex", label: "ep2e.healthbar.tooltip.spendRez.flex.label", description: "ep2e.healthbar.tooltip.spendRez.flex.description", type: "input" },
            7: { id: "traits", label: "ep2e.healthbar.tooltip.spendRez.traits.label", description: "ep2e.healthbar.tooltip.spendRez.traits.description", type: "input" }
          };
        }
        else {
          object = {
            0: { id: "repH", label: "ep2e.healthbar.tooltip.spendRez.homebrew.rep.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.rep.description", type: "input" },
            1: { id: "skill33", label: "ep2e.healthbar.tooltip.spendRez.homebrew.skill33.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.skill33.description", type: "input" },
            2: { id: "skill3366", label: "ep2e.healthbar.tooltip.spendRez.homebrew.skill3366.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.skill3366.description", type: "input" },
            3: { id: "skill66", label: "ep2e.healthbar.tooltip.spendRez.homebrew.skill66.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.skill66.description", type: "input" },
            4: { id: "specH", label: "ep2e.healthbar.tooltip.spendRez.homebrew.spec.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.spec.description", type: "input" },
            5: { id: "psiH", label: "ep2e.healthbar.tooltip.spendRez.homebrew.psi.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.psi.description", type: "input" },
            6: { id: "langH", label: "ep2e.healthbar.tooltip.spendRez.homebrew.lang.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.lang.description", type: "input" },
            7: { id: "aptH", label: "ep2e.healthbar.tooltip.spendRez.homebrew.apt.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.apt.description", type: "input" },
            8: { id: "flexH", label: "ep2e.healthbar.tooltip.spendRez.homebrew.flex.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.flex.description", type: "input" },
            9: { id: "traitsH", label: "ep2e.healthbar.tooltip.spendRez.homebrew.traits.label", description: "ep2e.healthbar.tooltip.spendRez.homebrew.traits.description", type: "input" }
          };
        }

        const costMatrix = {
          "rep": 1,
          "skill": 1,
          "spec": 1,
          "psi": 1,
          "lang": 1,
          "apt": 1,
          "flex": 2,
          "traits": 1,
          "repH": 1,
          "skill33": 1,
          "skill3366": 1,
          "skill66": 1,
          "specH": 5,
          "psiH": 5,
          "langH": 5,
          "aptH": 5,
          "flexH": 10,
          "traitsH": 1
        };

        let total = 0;
        const date = new Date().toLocaleDateString("en-EN");

        const spending = await SHEET.listSelection(
          object,
          "standardSelectionList",
          350,
          "Spend Rez",
          "",
          "This dialog lets you spend your rez. It will document everything for the DM in the background"
        );

        if (spending.cancelled) return;

        for (const item in spending.selection) {
          total += spending.selection[item] * costMatrix[item];
        }

        const ledgerUpdate = {
          date: date,
          ...spending.selection,
          cost: total
        };

        if (ledgerUpdate.cost <= availableRez) {
          // Find existing ledger entry for the same date
          const existingEntry = ledger.find(entry => entry.date === date);

          if (existingEntry) {
            // Add new values onto the existing entry
            for (const [key, value] of Object.entries(spending.selection)) {
              existingEntry[key] = (existingEntry[key] ?? 0) + value;
            }

            existingEntry.cost = (existingEntry.cost ?? 0) + total;
          } else {
            // No entry for this date yet, create a new one
            ledger.unshift(ledgerUpdate);
          }

          await actor.update({
            "system.rezPoints.value": availableRez - total,
            "system.rezPoints.spent": spentRez + total,
            "system.rezPoints.ledger": ledger
          });
        }
        else {
          let message = {};
          message.type = "general";
          message.headline = "Rez Not spent";
          message.subheadline = "Reason";
          message.copy = game.i18n.localize("ep2e.roll.announce.spendRez.spent") + ledgerUpdate["cost"] + game.i18n.localize("ep2e.roll.announce.spendRez.available") + availableRez;
          
          const renderedHtml = await foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/chat/general-chat-message.html", message);

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: renderedHtml,
            whisper: [game.user.id]
          });
        }
      });
    });

  };

  /**
   * ========================================
   * FUNCTIONS TRIGGERED BY ACTIVE LISTENERS
   * ========================================
   */

  _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const data = foundry.utils.deepClone?.(header.dataset) ?? foundry.utils.duplicate(header.dataset);
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

  async _postToChat(event) {
    const itemID = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.items.get(itemID);

    await item.roll();

  }

  async _onTaskCheck(event) {
    event.preventDefault();

    const element = event.currentTarget;
    const dataset = element.dataset;
    const actorWhole = this.actor;
    let rolledFrom = dataset.rolledfrom ? dataset.rolledfrom : "";
    let weaponID = dataset.weaponid ? dataset.weaponid : "";
    const systemOptions = {"askForOptions" : event.shiftKey, "optionsSettings" : game.settings.get("eclipsephase", "showTaskOptions"), "brewStatus" : game.settings.get("eclipsephase", "superBrew")}

    SHEET.rollBuilder(actorWhole, dataset, rolledFrom, weaponID, systemOptions)
    
  }

  _onSkillEdit(event) {
    event.preventDefault();

    const element = event.currentTarget;
    const itemElement = element.closest(".item");
    if (!itemElement) return;

    const itemId = itemElement.dataset.itemId;
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const field = element.dataset.field;
    if (!field) return;

    return item.update({ [field]: element.value });
  }

  _onToggleReveal(event) {
    const reveals = event.currentTarget.getElementsByClassName("info");
    for (const value of reveals) {
      value.classList.toggle("icon-hidden");
    }

    const revealer = event.currentTarget.getElementsByClassName("toggle");
    for (const value of revealer) {
      value.classList.toggle("noShow");
    }
  }

}


//Special Dialogs

async function poolUsageConfirmation(dialog, type, pool, dialogType, subtitle, copy, poolName, inputType, inputNeeded) {
  const dialogName = game.i18n.localize("ep2e.skills.pool.dialogHeadline") + " (" + game.i18n.localize(poolName) + ")";
  const cancelButton = game.i18n.localize("ep2e.roll.dialog.button.cancel");
  const confirmButton = game.i18n.localize("ep2e.actorSheet.button.confirm");
  const content = await foundry.applications.handlebars.renderTemplate(dialog, {
    type,
    pool,
    dialogType,
    subtitle,
    copy,
    poolName,
    inputType,
    inputNeeded
  });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: dialogName },
    content,
    buttons: [
      {
        action: "cancel",
        label: cancelButton,
        callback: () => ({ cancelled: true })
      },
      {
        action: "confirm",
        label: confirmButton,
        default: true,
        callback: (event, button) => _poolUsageModifiers(button.form)
      }
    ],
    position: { width: 315 },
    modal: true,
    rejectClose: false
  });

  return result ?? { cancelled: true };
}

//Pool usage confirmation check results
function _poolUsageModifiers(form) {
  return {
    modifier: form?.modifier ? form.modifier.value : null
  };
}

//Pool usage confirmation check results
function _traitSelection(form) {
    return {
        value: form.TraitTypeSelection.value
    }
}