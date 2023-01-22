import * as Dice from "../dice.js"

export default class EPnpcSheet extends ActorSheet {

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
          return "systems/eclipsephase/templates/actor/npc-sheet.html";
        }
      }
    }

    async getData() {
        const sheetData = super.getData();
        const actor = sheetData.actor;
        sheetData.dtypes = ["String", "Number", "Boolean"];
        if(sheetData.actor.img === "icons/svg/mystery-man.svg"){
            sheetData.actor.img = "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg";
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
          
        if (sheetData.actor.type == 'npc') {
            this._prepareCharacterItems(sheetData);
        }

        //Prepare dropdowns
        sheetData.config = CONFIG.eclipsephase;

        // Rich text editor now requires preformatted text
        sheetData.htmlDescription = await TextEditor.enrichHTML(sheetData.actor.system.description, {async: true})

        console.log("******* npc sheet")
        console.log(sheetData)

        return sheetData;
    }

    _prepareCharacterItems(sheetData) {
        let actor = sheetData.actor
        let actorModel = actor.system


      // console.log("***** in _prepareCharacterItems")
      // console.log(sheetData)
      // console.log(actor)
      // console.log(actorModel)


        // const actorData = sheetData.data;
        // const data = actorData.data;

        // Initialize containers.
        const gear = [];
        const features = [];
        const special = [];
        const rangedweapon = [];
        const ccweapon = [];
        const armor = [];
        const ware = [];
        const aspect = {
          none: [],
          chi: [],
          gamma: [],
          epsilon: []
        };
        const vehicle = [];
        const morphtrait = [];
        const morphflaw = [];
        const effects=[];

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

            else if (item.type === 'aspect') {
                aspect[itemModel.psiType].push(item);
            }


          
            else if (item.type === 'vehicle') {
                item.wt = Math.round(itemModel.dur / 5);
                item.dr = Math.round(itemModel.dur * 2);
                vehicle.push(item)
            }
            else if (item.type === 'morphTrait') {
                morphtrait.present = true
                morphtrait.push(item)
            }
            else if (item.type === 'morphFlaw') {
                morphtrait.present = true
                morphflaw.push(item)
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
                item.roll = Number(item.system.value) + aptSelect;
                item.specroll = Number(item.system.value) + aptSelect + 10;
                special.push(item);
            }
        }

        actor.showEffectsTab=false
        if(game.settings.get("eclipsephase", "effectPanel")  && game.user.isGM){
          var effectList=actor.getEmbeddedCollection('ActiveEffect');
          for(let item of effectList){
            effects.push(item);
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
        actor.morphTrait = morphtrait;
        actor.morphFlaw = morphflaw;
        actor.specialSkill = special;
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

        // Everything below here is only needed if the sheet is editable
        if (!this.options.editable) return;

        // Add Inventory Item
        html.find('.item-create').click(this._onItemCreate.bind(this));

        // Update Inventory Item
        html.find('.item-edit').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
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

        //slide-show on click
        html.find(".slideShow").click(ev => {
            const current = $(ev.currentTarget);
            const first = current.children().first();
            const last = current.children().last();
            const target = current.parent(".item").children().last();
            first.toggleClass("noShow");
            last.toggleClass("noShow");
            target.slideToggle(200);
        })
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

        Dice.TaskCheck ({
            //Actor data
            actorData : actorModel,
            actorWhole : actorWhole,
            //Skill data
            skillName : dataset.name.toLowerCase(),
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

