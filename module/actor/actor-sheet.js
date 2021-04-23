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
    // Prepare items.
      console.log("Super getData ", data);
    if (data.data.type === 'character') {
      this._prepareCharacterItems(data);
    }

    //Prepare dropdowns
    data.config = CONFIG.eclipsephase;

    return data;
  }

  //Binds morphFlaws/Traits/Gear to a singular morph
  async _onDropItemCreate(itemData) {

    // Create a Consumable spell scroll on the Inventory tab
    if (itemData.type === "morphFlaw" || itemData.type === "morphTrait" || itemData.type === "ware") {
      let actor = this.actor;
      let actorData = actor.data.data;
      let currentMorph = actorData.bodies.activeMorph
      let data = itemData.data;
      data.boundTo = currentMorph;
    }

    // Create the owned item as normal
    return super._onDropItemCreate(itemData);
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} actorData The actor to prepare.
   *
   * @return {undefined}
   */
 async _prepareCharacterItems(sheetData) {
    const actorData = this;
    const data = actorData.data;

    // Initialize containers.

    const gear = [];
    const know = [];
    const special = [];
    const trait = [];
    const flaw = [];
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
    };;
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
    };;
    const aspect = [];
    const program = [];
    const vehicle = [];
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
        i.specroll = Number(i.data.value) + aptSelect + 10;
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
        i.specroll = Number(i.data.value) + aptSelect + 10;
        know.push(i);
      }
      else if (i.type === 'trait') {
        trait.push(i);
      }
      else if (i.type === 'flaw') {
        flaw.push(i);
      }
      else if (i.type === 'rangedWeapon') {
        rangedweapon.push(i);
      }
      else if (i.type === 'ccWeapon') {
        ccweapon.push(i);
      }
      else if (i.type === 'armor') {
        armor.push(i);
      }
      else if (i.type === 'aspect') {
        aspect.push(i);
      }
      else if (i.type === 'program') {
        program.push(i);
      }
      else if (i.type === 'gear') {
        gear.push(i);
      }
      else if (i.type === 'vehicle') {
        i.wt = Math.round(i.data.dur / 5);
        i.dr = Math.round(i.data.dur * 2);
        vehicle.push(i)
      }
    }

    for (let i of sheetData.items) {
        if (i.type === 'ware' && i.data.boundTo) {
            ware[i.data.boundTo].push(i);
        }
        else if (i.type === 'morphFlaw' && i.data.boundTo) {
            if (i.data.boundTo === "morph1"){
                morphtrait.present1 = true;
            }
            else if (i.data.boundTo === "morph2"){
                morphtrait.present2 = true;
            }
            else if (i.data.boundTo === "morph3"){
                morphtrait.present3 = true;
            }
            else if (i.data.boundTo === "morph4"){
                morphtrait.present4 = true;
            }
            else if (i.data.boundTo === "morph5"){
                morphtrait.present5 = true;
            }
            else if (i.data.boundTo === "morph6"){
                morphtrait.present6 = true;
            }
            morphflaw[i.data.boundTo].push(i);
        }
        else if (i.type === 'morphTrait' && i.data.boundTo) {
            if (i.data.boundTo === "morph1"){
                morphtrait.present1 = true;
            }
            else if (i.data.boundTo === "morph2"){
                morphtrait.present2 = true;
            }
            else if (i.data.boundTo === "morph3"){
                morphtrait.present3 = true;
            }
            else if (i.data.boundTo === "morph4"){
                morphtrait.present4 = true;
            }
            else if (i.data.boundTo === "morph5"){
                morphtrait.present5 = true;
            }
            else if (i.data.boundTo === "morph6"){
                morphtrait.present6 = true;
            }
            morphtrait[i.data.boundTo].push(i);
        }
    }

    // Assign and return
    actorData.trait = trait;
    actorData.flaw = flaw;
    actorData.morphTrait = morphtrait;
    actorData.morphFlaw = morphflaw;
    actorData.rangedWeapon = rangedweapon;
    actorData.ccweapon = ccweapon;
    actorData.armor = armor;
    actorData.ware = ware;
    actorData.aspect = aspect;
    actorData.program = program;
    actorData.gear = gear;
    actorData.knowSkill = know;
    actorData.specialSkill = special;
    actorData.vehicle = vehicle;

    console.log("Normal Traits: ", actorData.trait)
    console.log("Normal Flaws: ", actorData.flaw)

    console.log("Morph Flaw Array", actorData.morphFlaw)
    console.log("Morph Trait Array", actorData.morphTrait)
    console.log("Ware Array", actorData.ware)

    console.log("Morph Flaw Array 1 ", actorData.morphFlaw.morph1)
  }

  /* -------------------------------------------- */

  _onDrop

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
    if (this.actor.isOwner) {
      let handler = ev => this._onDragItemStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });

      //Item Input Fields
      html.find(".sheet-inline-edit").change(this._onSkillEdit.bind(this));
    }

    //show on hover
      html.find(".reveal").on("mouseover mouseout", this._onToggleReveal.bind(this));
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
    // Update Item on Creation
    if (itemData.type === "specialSkill" || itemData.type === "knowSkill") {
      itemData.name = "New Skill";
    }

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
    let item = this.actor.getOwnedItem(itemId);
    let field = element.dataset.field;

    return item.update({ [field]: element.value });
    }

    _onToggleReveal(event) {
      const reveals = event.currentTarget.getElementsByClassName("far");
      $.each(reveals, function (index, value){
        $(value).toggleClass("hidden");
      })
  }

  }


