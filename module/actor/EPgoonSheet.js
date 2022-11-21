import * as Dice from "../dice.js"

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
            Chi: [],
            Gamma: []
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
                rangedweapon.push(item)
            }
            //IMPORTANT: I reverted the ccWeapon-registration back to this state, since the item model did not work for them ON NPC&GOON Sheets.
            //I did not fully understand the issue, but please make sure that your changes work before updating this section, as otherwise items 
            //(ccWeapons) will not be usable anymore for goons & NPCs
            else if (item.type === 'ccWeapon') {
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
                aspect[itemModel.psiType].push(item);
            }
            else if (item.type === 'vehicle') {
                item.wt = Math.round(itemModel.dur / 5);
                item.dr = Math.round(itemModel.dur * 2);
                vehicle.push(item)
            }
            if (item.type === 'specialSkill') {
                let aptSelect = 0;
                if (itemModel.aptitude === "Intuition") {
                  aptSelect = actorModel.aptitudes.int.value;
                }
                else if (itemModel.aptitude === "Cognition") {
                  aptSelect = actorModel.aptitudes.cog.value;
                }
                else if (itemModel.aptitude === "Reflexes") {
                  aptSelect = actorModel.aptitudes.ref.value;
                }
                else if (itemModel.aptitude === "Somatics") {
                  aptSelect = actorModel.aptitudes.som.value;
                }
                else if (itemModel.aptitude === "Willpower") {
                  aptSelect = actorModel.aptitudes.wil.value;
                }
                else if (itemModel.aptitude === "Savvy") {
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
        if (actor.aspect.Chi.length>0){
          actorModel.additionalSystems.hasPsi = 1;
        }
        else if (actor.aspect.Gamma.length>0){
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
        html.find('.damage-roll').click(this._onDamageRoll.bind(this));

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


        Dice.TaskCheck ({
            skillName : dataset.name.toLowerCase(),
            specName : dataset.specname,
            rollType : dataset.type,
            skillValue : dataset.rollvalue,
            actorData : actorModel,
            actorWhole : actorWhole,
            threatLevel: threatLevel,
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

}

