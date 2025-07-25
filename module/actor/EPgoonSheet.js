import * as Dice from "../rolls/dice.js"
import { eclipsephase } from "../config.js";
import { registerEffectHandlers,registerCommonHandlers,itemCreate,registerItemHandlers, _tempEffectCreation,moreInfo } from "../common/common-sheet-functions.js";
import * as damage from "../rolls/damage.js";
import { weaponPreparation,reloadWeapon } from "../common/weapon-functions.js";
import { traitAndAccessoryFinder } from "../common/sheet-preparation.js";

export default class EPgoonSheet extends ActorSheet {

    constructor(...args) {
      super(...args);
      
      const hideNPCs = game.settings.get("eclipsephase", "hideNPCs");
      if (hideNPCs && !game.user.isGM && !this.actor.isOwner){
        this.position.height = 340;
        this.position.width = 800;
      }
      else {
        if (!game.user.isGM && !this.actor.isOwner){
          this.position.height = 340;
          this.position.width = 800;
        }
        else{
          this.position.height = 550;
          this.position.width = 1058;
        }
      }
    }
  
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["eclipsephase", "sheet", "actor"],
            resizable: false,
            tabs: [{ navSelector: ".primary-tabs", contentSelector: ".primary-body", initial: "skills" }]
        });
    }

    /** @override */

    get template() {
      const hideNPCs = game.settings.get("eclipsephase", "hideNPCs");
      if (hideNPCs && !game.user.isGM && !this.actor.isOwner){
        return "systems/eclipsephase/templates/actor/sheet-limited.html"
      }
      else{
        if (!game.user.isGM && !this.actor.isOwner){
          return "systems/eclipsephase/templates/actor/sheet-limited.html";
        }
        else{
          return "systems/eclipsephase/templates/actor/goon-sheet.html";
        }
      }
    }

    async getData() {
        const sheetData = super.getData();
        let actor = sheetData.actor

        sheetData.dtypes = ["String", "Number", "Boolean"];
        if(actor.img === "icons/svg/mystery-man.svg"){
            actor.img = "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg";
          }



        if (actor.type == 'goon') {
            this._prepareCharacterItems(sheetData);
        }

        //Prepare dropdowns
        sheetData.config = CONFIG.eclipsephase;

        // Rich text editor now requires preformatted text
        sheetData.enrichedDescription = await TextEditor.enrichHTML(sheetData.actor.system.description, {async: true})

        console.log("******* goon sheet")
        console.log(sheetData)

        return foundry.utils.mergeObject(sheetData, {
          isGM: game.user.isGM
        });
      }
    
    async _onDropItemCreate(item){
      const actor = this.actor
      const actorModel = actor.system
      const itemModel = item.system
      let traitSelection
      
      item.system.updated = game.system.version

      //Loading weapons with Standard Ammo
      if (item.type === "rangedWeapon"){
        if (item.system.ammoType != "seeker" && !item.system.mode1.traits.specialAmmoDrugs.value && !item.system.mode1.traits.specialAmmoBugs.value){
        let name = item.system.ammoType
        let capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
        item.system.ammoMin = item.system.ammoMax;
        item.system.ammoSelected.name = capitalizedName + " (Standard)";
        }
      }

      //Auto switches the trait to a morph trait if the trait has both a morph and a ego variant
      if(item.type === "traits" && item.system.morph === true && item.system.ego === true){

        itemModel.ego = false;
  
      }

      // Create the owned item as normal
      return super._onDropItemCreate(item)

    }

    _prepareCharacterItems(sheetData) {

        let actor = sheetData.actor
        let actorModel = actor.system

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
        const features = [];
        const special = [];
        const rangedweapon = [];
        const ccweapon = [];
        const armor = [];
        const ware = [];
        const morphTrait = [];
        const morphFlaw = [];
        const effects = [];
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
        const vehicle = {
          robot: [],
          vehicle: [],
          morph: [],
          animal: []
        };

        // Iterate through items, allocating to containers
        // let totalWeight = 0;
        for (let item of sheetData.actor.items) {
            let itemModel = item.system

            item.img = item.img || DEFAULT_TOKEN;
            // Append to gear.
            if (itemModel.displayCategory === 'gear' && item.type != "drug") {
                gear.push(item);
            }
            // Append to ammunition
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
            else if (item.system.slotType === 'consumable' && item.system.slotType != 'digital' && item.type != "ammo") {
              if (item.type === "drug"){
                itemModel.slotName = "ep2e.item.general.table.slot.drug";
                ammo.chemical.push(item);
              }
              else {
                itemModel.slotName = "ep2e.item.general.table.slot.consumable";
              }
              gear.push(item);
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
                rangedweapon.push(item)
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
                ccweapon.push(item)
            }
            else if (itemModel.displayCategory === 'armor') {
                armor.push(item)
            }
            else if (item.type === 'ware') {
                ware.push(item)
            }
            else if (item.type === 'morphTrait' || item.system.traitType === 'trait' && item.system.morph){
                morphTrait.push(item);
            }

            else if (item.type === 'morphFlaw' || item.system.traitType === 'flaw' && item.system.morph){
              morphFlaw.push(item);
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
                if(!itemModel.value)
                  item.roll=aptSelect;
                else
                  item.roll = Number(itemModel.value);
                item.specroll = item.roll + 10;
                special.push(item);
            }
        }

        actor.showEffectsTab=false
        if(game.settings.get("eclipsephase", "effectPanel")  && game.user.isGM){
          var effectList=this.actor.getEmbeddedCollection('ActiveEffect');
          for(let item of effectList){
            effects.push(item);
          }
          actor.showEffectsTab=true;
        }

        // Assign and return
        actor.rangedWeapon = rangedweapon;
        actor.ccweapon = ccweapon;
        actor.armor = armor;
        actor.ware = ware;
        actor.aspect = aspect;
        actor.gear = gear;
        actor.features = features;
        actor.vehicle = vehicle;
        actor.specialSkill = special;
        actor.morphTrait = morphTrait;
        actor.morphFlaw = morphFlaw;
        actor.activeEffects = effects;
        actor.ammo = ammo;

        // Check if sleights are present and toggle Psi Tab based on this
        if (actor.aspect.chi.length>0){
          actorModel.additionalSystems.hasPsi = 1;
        }
        else if (actor.aspect.gamma.length>0){
          actorModel.additionalSystems.hasPsi = 1;
        }

    }

    

    activateListeners(html) {
        super.activateListeners(html);

        const actor = this.actor

        // Everything below here is only needed if the sheet is editable
        if (!this.options.editable) return;

        registerEffectHandlers(html, actor);
        registerCommonHandlers(html, actor);

        // Add Inventory Item
        html.find('.item-create').click(this._onItemCreate.bind(this));

        // Update Inventory Item
        html.find('.item-edit').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            if(item.type=="specialSkill" || item.type=="knowSkill")
              item.sheet.isThreat = true;
            item.sheet.render(true);
        });

        // Delete Inventory Item
        html.find('.item-delete').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            this.actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
            li.slideUp(200, () => this.render(false));
        });

        // Rollable abilities.
        html.find('.task-check').click(this._onTaskCheck.bind(this));

        // Drag events for macros.
        if (this.actor.isOwner) {
            let handler = ev => this._onDragItemStart(ev);
            html.find('li.item').each((i, li) => {
                if (li.classList.contains("inventory-header")) return;
                li.setAttribute("draggable", true);
                li.addEventListener("dragstart", handler, false);
            });
        }
        
        //Item Input Fields
        html.find(".sheet-inline-edit").change(this._onSkillEdit.bind(this));

        //show on hover
        html.find(".reveal").on("mouseover mouseout", this._onToggleReveal.bind(this));

        //More Information Dialog
        html.on('click', 'a.moreInfoDialog', moreInfo);

        //Reload Ranged Weapon Functionality
        reloadWeapon(html, actor);
        
        //Calculate the healthBar
        html.find(".healthPanelNoSubmit").change(this.autoSubmitPrevention.bind(this))

        damage.healthBarChange(actor, html);

    }

    async autoSubmitPrevention(event, options) {
      super._onSubmit(event, { ...options, preventRender: true });
    }

    _onItemCreate(event) {
        event.preventDefault();
        const header = event.currentTarget;
        // Get the type of item to create.
        const type = header.dataset.type;
        // Grab any data associated with this control.
        const data = duplicate(header.dataset);
        // Initialize a default name.
        const name = `New ${type.capitalize()}`;
        // Prepare the item object.
        const itemData = {
            name: name,
            type: type,
            data: data
        };
        // Remove the type from the dataset since it's in the itemData.type prop.
        delete itemData.data["type"];
        if (itemData.type === "specialSkill" || itemData.type === "knowSkill") {
            itemData.name = "New Skill";
          }

        // Finally, create the item!
        return this.actor.createEmbeddedDocuments("Item", [itemData]);
    }

    async _onTaskCheck(event) {
        event.preventDefault();

        const element = event.currentTarget;
        const dataset = element.dataset;
        const actorWhole = this.actor;
        const actorModel = this.actor.system;
        let skillKey = dataset.key ? dataset.key.toLowerCase() : null;
        let weaponPrep = null;
        let rolledFrom = dataset.rolledfrom ? dataset.rolledfrom : null;
        let weaponSelected = null;
        const systemOptions = {"askForOptions" : event.shiftKey, "optionsSettings" : game.settings.get("eclipsephase", "showTaskOptions"), "brewStatus" : game.settings.get("eclipsephase", "superBrew")}
    
        if(dataset.type === 'skill') {
    
          if (rolledFrom === "psiSleight") {
            skillKey = "psi";
            dataset.rollvalue = actorModel.skillsMox.psi.roll;
            dataset.specname = actorModel.skillsMox.psi.specname;
            dataset.pooltype = "Moxie";
          }
    
          if (rolledFrom === "rangedWeapon") {
            skillKey = "guns";
            dataset.rollvalue = actorModel.skillsVig.guns.roll;
            dataset.specname = actorModel.skillsVig.guns.specname;
            dataset.pooltype = "Vigor";
          }
          else if (rolledFrom === "ccWeapon") {
            skillKey = "melee";
            dataset.rollvalue = actorModel.skillsVig.melee.roll;
            dataset.specname = actorModel.skillsVig.melee.specname;
            dataset.pooltype = "Vigor";
          }
    
          if (skillKey === "guns" || skillKey === "melee"){
        
            weaponPrep = await weaponPreparation(actorWhole, skillKey, rolledFrom, dataset.weaponid)
            
            if (!weaponPrep || weaponPrep.cancel){
              return;
            }
            weaponSelected = weaponPrep
            rolledFrom = weaponPrep.rolledFrom
          }
          this._onRollCheck(dataset, actorModel, actorWhole, systemOptions, weaponSelected, rolledFrom)
        }
        
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

    
    _onRollCheck(dataset, actorModel, actorWhole, systemOptions, weaponSelected, rolledFrom) {
      Dice.RollCheck(dataset, actorModel, actorWhole, systemOptions, weaponSelected, rolledFrom)
    }

}

