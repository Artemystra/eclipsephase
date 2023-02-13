import * as Dice from "../dice.js"
import { eclipsephase } from "../config.js";
import { registerEffectHandlers,registerCommonHandlers,itemCreate,registerItemHandlers, _tempEffectCreation } from "../common/common-sheet-functions.js";

export default class EPgoonSheet extends ActorSheet {

    constructor(...args) {
      super(...args);
      
      const hideNPCs = game.settings.get("eclipsephase", "hideNPCs");
      console.log(this);
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
        return mergeObject(super.defaultOptions, {
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
        return sheetData
}

    _prepareCharacterItems(sheetData) {

        let actor = sheetData.actor
        let actorModel = actor.system

        // Initialize containers.
        const gear = [];
        const features = [];
        const special = [];
        const rangedweapon = [];
        const ccweapon = [];
        const armor = [];
        const ware = [];
        const morphTrait = [];
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
        const vehicle = [];

        // Iterate through items, allocating to containers
        // let totalWeight = 0;
        for (let item of sheetData.items) {
            let itemModel = item.system

            item.img = item.img || DEFAULT_TOKEN;
            // Append to gear.
            if (itemModel.displayCategory === 'gear') {
                gear.push(item);
              }
            // Append to features.
            else if (item.type === 'feature') {
                features.push(item);
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
                rangedweapon.push(item)
            }
            //IMPORTANT: I reverted the ccWeapon-registration back to this state, since the item model did not work for them ON NPC&GOON Sheets.
            //I did not fully understand the issue, but please make sure that your changes work before updating this section, as otherwise items 
            //(ccWeapons) will not be usable anymore for goons & NPCs
            else if (item.type === 'ccWeapon') {
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
            else if (item.type === 'morphTrait' || item.type === 'morphFlaw'){
                morphTrait.push(item);
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
                item.wt = Math.round(itemModel.dur / 5);
                item.dr = Math.round(itemModel.dur * 2);
                vehicle.push(item)
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
          for(let i of effectList){
            effects.push(i.data);
          }
          actor.showEffectsTab=true;
        }

        // Assign and return
        actor.rangedWeapon = rangedweapon;
        actor.ccWeapon = ccweapon;
        actor.armor = armor;
        actor.ware = ware;
        actor.aspect = aspect;
        actor.gear = gear;
        actor.features = features;
        actor.vehicle = vehicle;
        actor.specialSkill = special;
        actor.morphTrait = morphTrait;
        actor.activeEffects = effects;

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

        html.find('.effect-create').click(ev => {
            this.actor.createEmbeddedDocuments('ActiveEffect', [{
              label: 'Active Effect',
              icon: '/icons/svg/mystery-man.svg'
            }]);
          });
      
          html.find('.effect-edit').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const effect = this.actor.getEmbeddedDocument('ActiveEffect',li.data("itemId"));
            effect.sheet.render(true);
          });
      
          html.find('.effect-delete').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            this.actor.deleteEmbeddedDocuments("ActiveEffect", [li.data("itemId")]);
            li.slideUp(200, () => this.render(false));
          });
        //Item Input Fields
        html.find(".sheet-inline-edit").change(this._onSkillEdit.bind(this));

        //show on hover
        html.find(".reveal").on("mouseover mouseout", this._onToggleReveal.bind(this));

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

    _onTaskCheck(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;
        const actorModel = this.actor.system;
        const actorWhole = this.actor;
        const threatLevel = actorModel.threatLevel.current;

        let specNameValue = dataset.specname;
        let skillRollValue = dataset.rollvalue;
        let poolType = "Threat";

        if (dataset.rolledfrom === "rangedWeapon") {
          specNameValue = actorModel.skillsVig.guns.specname;
          skillRollValue = actorModel.skillsVig.guns.roll;
        }
    
        if (dataset.rolledfrom === "ccWeapon") {
          specNameValue = actorModel.skillsVig.melee.specname;
          skillRollValue = actorModel.skillsVig.melee.roll;
        }

        if (dataset.rolledfrom === "psiSleight") {
          specNameValue = actorModel.skillsMox.psi.specname;
          skillRollValue = actorModel.skillsMox.psi.roll;
        }


        Dice.TaskCheck ({
            //Actor data
            actorData : actorModel,
            actorWhole : actorWhole,
            //Skill data
            skillKey : dataset.key.toLowerCase(),
            skillName : dataset.name,
            specName : specNameValue,
            rollType : dataset.type,
            skillValue : skillRollValue,
            rolledFrom : dataset.rolledfrom,
            //Pools
            poolValue: threatLevel,
            poolType: poolType,
            //Weapon data
            weaponID : dataset.weaponid,
            weaponName : dataset.weaponname,
            weaponDamage : dataset.roll,
            weaponType : dataset.weapontype,
            currentAmmo : dataset.currentammo,
            maxAmmo : dataset.maxammo,
            meleeDamageMod: actorModel.mods.meleeDamageMod,
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

}

