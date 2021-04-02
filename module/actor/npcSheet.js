import * as Dice from "../dice.js"

export class NpcSheet extends ActorSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["eclipsephase", "sheet", "actor"],
            template: "systems/eclipsephase/templates/actor/npc-sheet.html",
            width: 800,
            height: 600,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "skills" }]
        });
    }

    getData() {
        const data = super.getData();
        data.dtypes = ["String", "Number", "Boolean"];
        for (let attr of Object.values(data.data.attributes)) {
            attr.isCheckbox = attr.dtype === "Boolean";
        }
        if (this.actor.data.type == 'npc') {
            this._prepareCharacterItems(data);
        }

        return data;
}

    _prepareCharacterItems(sheetData) {
        const actorData = sheetData.actor;

        // Initialize containers.
        const gear = [];
        const features = [];
        const spells = {
            0: [],
            1: [],
            2: [],
            3: [],
            4: [],
            5: [],
            6: [],
            7: [],
            8: [],
            9: []
        };
        const rangedweapon = [];
        const ccweapon = [];
        const armor = [];
        const ware = [];
        const aspect = [];
        const vehicle = [];

        // Iterate through items, allocating to containers
        // let totalWeight = 0;
        for (let i of sheetData.items) {
            let item = i.data;
            i.img = i.img || DEFAULT_TOKEN;
            // Append to gear.
            if (i.type === 'item') {
                gear.push(i);
            }
            // Append to features.
            else if (i.type === 'feature') {
                features.push(i);
            }
            // Append to spells.
            else if (i.type === 'spell') {
                if (i.data.spellLevel != undefined) {
                    spells[i.data.spellLevel].push(i);
                }
            }
            else if (i.type === 'rangedWeapon') {
                rangedweapon.push(i)
            }
            else if (i.type === 'ccWeapon') {
                ccweapon.push(i)
            }
            else if (i.type === 'armor') {
                armor.push(i)
            }
            else if (i.type === 'ware') {
                ware.push(i)
            }
            else if (i.type === 'aspect') {
                aspect.push(i)
            }
            else if (i.type === 'vehicle') {
                i.wt = Math.round(i.data.dur / 5);
                i.dr = Math.round(i.data.dur * 2);
                vehicle.push(i)
            }
        }

        // Assign and return
        actorData.rangedWeapon = rangedweapon;
        actorData.ccweapon = ccweapon;
        actorData.armor = armor;
        actorData.ware = ware;
        actorData.aspect = aspect;
        actorData.gear = gear;
        actorData.features = features;
        actorData.spells = spells;
        actorData.vehicle = vehicle;
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
            const item = this.actor.getOwnedItem(li.data("itemId"));
            item.sheet.render(true);
        });

        // Delete Inventory Item
        html.find('.item-delete').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            this.actor.deleteOwnedItem(li.data("itemId"));
            li.slideUp(200, () => this.render(false));
        });

        // Rollable abilities.
        html.find('.task-check').click(this._onTaskCheck.bind(this));
        html.find('.damage-roll').click(this._onDamageRoll.bind(this));

        // Drag events for macros.
        if (this.actor.owner) {
            let handler = ev => this._onDragItemStart(ev);
            html.find('li.item').each((i, li) => {
                if (li.classList.contains("inventory-header")) return;
                li.setAttribute("draggable", true);
                li.addEventListener("dragstart", handler, false);
            });
        }

        //Item Input Fields
        html.find(".sheet-inline-edit").change(this._onSkillEdit.bind(this));
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

        // Finally, create the item!
        return this.actor.createOwnedItem(itemData);
    }

    _onTaskCheck(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;
        const actorData = this.actor.data.data;

        Dice.TaskCheck ({
            skillName : dataset.name,
            specName : dataset.specname,
            rollType : dataset.type,
            skillValue : dataset.rollvalue,
            actorData : actorData,
            askForOptions : event.shiftKey,
            optionsSettings: game.settings.get("eclipsephase", "showTaskOptions")
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
            actorData : actorData,
            askForOptions : event.shiftKey,
            optionsSettings: game.settings.get("eclipsephase", "showDamageOptions")
        });
    }



    _onSkillEdit(event) {
        event.preventDefault();
        let element = event.currentTarget;
        let itemId = element.closest(".item").dataset.itemId;
        let item = this.actor.getOwnedItem(itemId);
        let field = element.dataset.field;

        return item.update({ [field]: element.value });
    }

}

