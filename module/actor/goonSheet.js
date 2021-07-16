import * as Dice from "../dice.js"

export class GoonSheet extends ActorSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["eclipsephase", "sheet", "actor"],
            template: "systems/eclipsephase/templates/actor/goon-sheet.html",
            width: 800,
            height: 600,
            resizable: false,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "skills" }]
        });
    }

    getData() {
        const data = super.getData();
        data.dtypes = ["String", "Number", "Boolean"];
        if(data.data.img === "icons/svg/mystery-man.svg"){
            data.data.img = "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg";
          }
        if (data.data.type == 'goon') {
            this._prepareCharacterItems(data);
        }

        //Prepare dropdowns
        data.config = CONFIG.eclipsephase;

        return data;
}

    _prepareCharacterItems(sheetData) {
        const actorData = sheetData.data;
        const data = actorData.data;

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
        for (let i of sheetData.items) {
            let item = i.data;
            i.img = i.img || DEFAULT_TOKEN;
            // Append to gear.
            if (i.data.displayCategory === 'gear') {
                gear.push(i);
              }
            // Append to features.
            else if (i.type === 'feature') {
                features.push(i);
            }
            else if (i.data.displayCategory === 'ranged') {
                rangedweapon.push(i)
            }
            else if (i.data.displayCategory === 'ccweapon') {
                ccweapon.push(i)
            }
            else if (i.data.displayCategory === 'armor') {
                armor.push(i)
            }
            else if (i.type === 'ware') {
                ware.push(i)
            }
            else if (i.type === 'morphTrait' || i.type === 'morphFlaw'){
                morphTrait.push(i);
            }
                
            else if (i.type === 'aspect') {
                aspect[i.data.psiType].push(i);
            }
            else if (i.type === 'vehicle') {
                i.wt = Math.round(i.data.dur / 5);
                i.dr = Math.round(i.data.dur * 2);
                vehicle.push(i)
            }
            if (i.type === 'specialSkill') {
            /*
                let aptSelect = 0;
                if (i.data.aptitude === "Intuition") {
                  aptSelect = data.aptitudes.int.value;
                }
                else if (i.data.aptitude === "Cognition") {
                  aptSelect = data.aptitudes.cog.value;
                }
                else if (i.data.aptitude === "Reflexes") {
                  aptSelect = data.aptitudes.ref.value;
                }
                else if (i.data.aptitude === "Somatics") {
                  aptSelect = data.aptitudes.som.value;
                }
                else if (i.data.aptitude === "Willpower") {
                  aptSelect = data.aptitudes.wil.value;
                }
                else if (i.data.aptitude === "Savvy") {
                  aptSelect = data.aptitudes.sav.value;
                }
                
                i.roll = Number(i.data.value) + aptSelect;
                i.specroll = Number(i.data.value) + aptSelect + 10;
                if(!i.data.value)
                  i.roll=aptSelect;
                else
                  i.roll = Number(i.data.value);
                i.specroll = i.roll + 10;
                */
                special.push(i);
            }
        }

        actorData.showEffectsTab=false
        if(game.settings.get("eclipsephase", "effectPanel")  && game.user.isGM){
          var effectList=this.actor.getEmbeddedCollection('ActiveEffect');
          for(let i of effectList){
            effects.push(i.data);
          }
          actorData.showEffectsTab=true;
        }

        // Assign and return
        actorData.rangedWeapon = rangedweapon;
        actorData.ccweapon = ccweapon;
        actorData.armor = armor;
        actorData.ware = ware;
        actorData.aspect = aspect;
        actorData.gear = gear;
        actorData.features = features;
        actorData.vehicle = vehicle;
        actorData.specialSkill = special;
        actorData.morphTrait = morphTrait;
        actorData.activeEffects = effects;
        
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
        const actorData = this.actor.data.data;

        Dice.TaskCheck ({
            skillName : dataset.name.toLowerCase(),
            specName : dataset.specname,
            rollType : dataset.type,
            skillValue : dataset.rollvalue,
            actorData : actorData,
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
          $(value).toggleClass("hidden");
        })
        const revealer = event.currentTarget.getElementsByClassName("toggle");
        $.each(revealer, function (index, value){
          $(value).toggleClass("noShow");
        })
    }

}

