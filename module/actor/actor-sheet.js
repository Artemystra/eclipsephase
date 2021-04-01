import * as Dice from "../dice.js"
/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class EclipsePhaseActorSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["eclipsephase", "sheet", "actor"],
      template: "systems/eclipsephase/templates/actor/actor-sheet.html",
      width: 800,
      height: 1000,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "skills" }]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {
    const data = super.getData();
    data.dtypes = ["String", "Number", "Boolean"];
    for (let attr of Object.values(data.data.attributes)) {
      attr.isCheckbox = attr.dtype === "Boolean";
    }

    // Prepare items.
    if (this.actor.data.type == 'character') {
      this._prepareCharacterItems(data);
    }

    //Prepare dropdowns
    data.config = CONFIG.eclipsephase;

    return data;
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} actorData The actor to prepare.
   *
   * @return {undefined}
   */
  _prepareCharacterItems(sheetData) {
    const actorData = sheetData.actor;
    const data = actorData.data;

    // Initialize containers.

    const gear = [];
    const know = [];
    const special = [];
    const trait = [];
    const flaw = [];
    const rangedweapon = [];
    const ccweapon = [];
    const armor = [];
    const ware = [];
    const aspect = [];
    const program = [];
    const item = [];

    // Iterate through items, allocating to containers
    // let totalWeight = 0;
    for (let i of sheetData.items) {
      let item = i.data;
      i.img = i.img || DEFAULT_TOKEN;
      // Append to features.
      if (i.type === 'specialSkill') {
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
        special.push(i);
      }
      // Append to spells.
      else if (i.type === 'knowSkill') {
        let aptSelect = 0;
        if (i.data.aptitude === "Intuition") {
          aptSelect = data.aptitudes.int.value;
        }
        else if (i.data.aptitude === "Cognition") {
          aptSelect = data.aptitudes.cog.value;
        }
        i.roll = Number(i.data.value) + aptSelect;
        know.push(i);
      }
      else if (i.type === 'trait') {
        trait.push(i)
      }
      else if (i.type === 'flaw') {
        flaw.push(i)
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
      else if (i.type === 'program') {
        program.push(i)
      }
      else if (i.type === 'gear') {
        gear.push(i)
      }
    }

    // Assign and return
    actorData.trait = trait;
    actorData.flaw = flaw;
    actorData.rangedWeapon = rangedweapon;
    actorData.ccweapon = ccweapon;
    actorData.armor = armor;
    actorData.ware = ware;
    actorData.aspect = aspect;
    actorData.program = program;
    actorData.gear = gear;
    actorData.knowSkill = know;
    actorData.specialSkill = special;
  }

  /* -------------------------------------------- */

  /** @override */
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

      //Item Input Fields
      html.find(".sheet-inline-edit").change(this._onSkillEdit.bind(this));

    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
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

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
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

