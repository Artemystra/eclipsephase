import { eclipsephase } from "../config.js";
import { registerEffectHandlers,registerCommonHandlers,itemCreate,registerItemHandlers } from "../common/common-sheet-functions.js";
import * as Dice from "../dice.js";
import itemRoll from "../item/EPitem.js";


/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export default class EPactorSheet extends ActorSheet {

    constructor(...args) {
      super(...args);

      const showEverything = game.settings.get("eclipsephase", "showEverything");
      if(showEverything){
        this.position.height = 850;
        this.position.width = 1400;
      }
      else {
        if (!game.user.isGM && !this.actor.isOwner){
          this.position.height = 650;
          this.position.width = 800;
        }
        else{
          this.position.height = 850;
          this.position.width = 1400;
        }
      }
    }

    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        classes: ["eclipsephase", "sheet", "actor"],
        resizable: false,
        tabs: [{ navSelector: ".primary-tabs", contentSelector: ".primary-body", initial: "skills" },{ navSelector: ".secondary-tabs", contentSelector: ".secondary-body", initial: "health" }]
      });
    }

  /** @override */

  get template() {
    const showEverything = game.settings.get("eclipsephase", "showEverything");
    if (showEverything){
      return "systems/eclipsephase/templates/actor/actor-sheet.html"
    }
    else{
      if (!game.user.isGM && !this.actor.isOwner){
        return "systems/eclipsephase/templates/actor/sheet-limited.html";
      }
      else{
        return "systems/eclipsephase/templates/actor/actor-sheet.html";
      }
    }
  }

  async getData() {
    const sheetData = super.getData();
    const actor = sheetData.actor;

    if(actor.system.mods.woundMultiplier < 1){
      actor.update({"system.mods.woundMultiplier" : 1});
    }


    sheetData.dtypes = ["String", "Number", "Boolean"];
    // Prepare items.
    if(actor.img === "icons/svg/mystery-man.svg"){
      actor.img = "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg";
    }

    eclipsephase.morphNames.forEach(name => {
      if(actor.system.bodies[name].img === ""){
        actor.system.bodies[name].img = "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg";
      }
    })

    if (actor.type === 'character') {
      this._prepareCharacterItems(sheetData);
    }

    await this._prepareRenderedHTMLContent(sheetData)

    //Prepare dropdowns
    sheetData.config = CONFIG.eclipsephase;

    // Why jump through hoops in the template when we can set the active morph
    // here?!
    let morphKey = actor.system.bodies.activeMorph
    let description = await TextEditor.enrichHTML(actor.system.bodies[morphKey].description,
      { async: true })

    sheetData.activeMorph = {
      key: morphKey,
      name: actor.system.bodies[morphKey].name || "New Morph",
      morph: actor.system.bodies[morphKey],
      wares: actor.ware[morphKey],
      traits: actor.morphTrait[morphKey],
      presentTraits: actor.morphTrait[morphKey].length + actor.morphFlaw[morphKey].length > 0,
      flaws: actor.morphFlaw[morphKey],
      description: description
    }




    return mergeObject(sheetData, {
      isGM: game.user.isGM
    });
  }
  //Binds morphFlaws/Traits/Gear to a singular morph
  async _onDropItemCreate(item) {

  

    // Create a Consumable spell scroll on the Inventory tab
    if (item.type === "morphFlaw" || item.type === "morphTrait" || item.type === "ware") {
      let actor = this.actor
      let actorModel = actor.system
      let currentMorph = actorModel.bodies.activeMorph
      let itemModel = item.system

      itemModel.boundTo = currentMorph
    }

    if (item.type === "rangedWeapon"){
      let ammoUp = item.system.ammoMax;
      item.system.ammoMin = ammoUp;
    }


    // Create the owned item as normal
    return super._onDropItemCreate(item)
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} sheetData the object handlebars uses to render templates
   *
   * @return {undefined}
   */
 async _prepareCharacterItems(sheetData) {
   const actor = sheetData.actor
   const actorModel = sheetData.actor.system

    // Initialize containers.

    const gear = [];
    const know = [];
    const special = [];
    const trait = [];
    const flaw = [];
    const effects = [];
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
    };
      const aspect = {
          Chi: [],
          Gamma: []
      };
      const program = [];
      const vehicle = {
          Robot: [],
          Vehicle: [],
          Morph: [],
          'Smart-Animal': []
      };
      //this will become more important once morphs are items themselves
      const morph = [];

    // Iterate through items, allocating to containers
    for (let item of sheetData.items) {
      let itemModel = item.system;

      item.img = item.img || DEFAULT_TOKEN;
      // Append to features.
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
        special.push(item);
        }
        else if (item.type === 'knowSkill') {
          let aptSelect = 0;
          if (itemModel.aptitude === "Intuition") {
            aptSelect = actorModel.aptitudes.int.value;
          }
          else if (itemModel.aptitude === "Cognition") {
            aptSelect = actorModel.aptitudes.cog.value;
          }
          item.roll = Number(itemModel.value) + aptSelect;
          item.specroll = Number(itemModel.value) + aptSelect + 10;
          know.push(item);
        }
        else if (item.type === 'trait') {
          trait.push(item);
        }
        else if (item.type === 'flaw') {
          flaw.push(item);
        }
        else if (itemModel.displayCategory === 'ranged') {
          rangedweapon.push(item);
        }
        else if (itemModel.displayCategory === 'ccweapon') {
          ccweapon.push(item);
        }
        else if (itemModel.displayCategory === 'armor') {
          armor.push(item);
        }
        else if (item.type === 'aspect') {
          aspect[itemModel.psiType].push(item);
        }
        else if (item.type === 'program') {
          program.push(item);
        }
        else if (itemModel.displayCategory === 'gear') {
          gear.push(item);
        }
        else if (item.type === 'vehicle') {
          itemModel.wt = Math.round(itemModel.dur / 5);
          if (itemModel.type != "Smart-Animal"){
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
      else if (item.type === 'ware' && itemModel.boundTo) {
            ware[itemModel.boundTo].push(item);
        }
        else if (item.type === 'morphFlaw' && itemModel.boundTo) {
            if (itemModel.boundTo === "morph1"){
                morphtrait.present1 = true;
            }
            else if (itemModel.boundTo === "morph2"){
                morphtrait.present2 = true;
            }
            else if (itemModel.boundTo === "morph3"){
                morphtrait.present3 = true;
            }
            else if (itemModel.boundTo === "morph4"){
                morphtrait.present4 = true;
            }
            else if (itemModel.boundTo === "morph5"){
                morphtrait.present5 = true;
            }
            else if (itemModel.boundTo === "morph6"){
                morphtrait.present6 = true;
            }
            morphflaw[itemModel.boundTo].push(item);
        }
        else if (item.type === 'morphTrait' && itemModel.boundTo) {
            if (itemModel.boundTo === "morph1"){
                morphtrait.present1 = true;
            }
            else if (itemModel.boundTo === "morph2"){
                morphtrait.present2 = true;
            }
            else if (itemModel.boundTo === "morph3"){
                morphtrait.present3 = true;
            }
            else if (itemModel.boundTo === "morph4"){
                morphtrait.present4 = true;
            }
            else if (itemModel.boundTo === "morph5"){
                morphtrait.present5 = true;
            }
            else if (itemModel.boundTo === "morph6"){
                morphtrait.present6 = true;
            }
            morphtrait[itemModel.boundTo].push(item);
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
    actor.knowSkill = know;
    actor.specialSkill = special;
    actor.vehicle = vehicle;
    actor.activeEffects=effects;
    actor.actorType = "PC";

    // Check if sleights are present and toggle Psi Tab based on this
    if (actor.aspect.Chi.length>0){
      actorModel.additionalSystems.hasPsi = 1;
    }
    else if (actor.aspect.Gamma.length>0){
      actorModel.additionalSystems.hasPsi = 1;
    }
    

   /* In case ACTOR DATA is needed */
   console.log(actor) 

  }

  //Needed for a functioning HTML editor

  async _prepareRenderedHTMLContent(sheetData) {
    let actorModel = sheetData.actor.system

    let bio = await TextEditor.enrichHTML(actorModel.biography, { async: true })
    sheetData["htmlBiography"] = bio

    let muse = await TextEditor.enrichHTML(actorModel.muse.description, { async: true })
    sheetData["htmlMuseDescription"] = muse
  }



  /* -------------------------------------------- */

  _onDrop

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    let actor = this.actor;

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;



    registerEffectHandlers(html, actor);
    registerCommonHandlers(html, actor);
   /* registerItemHandlers(html,this.actor,this);*/

   // Add Inventory Item
   html.find('.item-create').click(this._onItemCreate.bind(this));

    // Update Inventory Item
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

        // Delete Inventory Item
  html.find('.item-delete').click(ev => {
    const li = $(ev.currentTarget).parents(".item");
    actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
    li.slideUp(200, () => this.render(false));
  });


    // Rollable abilities.
    html.find('.task-check').click(this._onTaskCheck.bind(this));

    // Recover Pools
    html.find('.rest').click(async func => {
      const element = event.currentTarget;
      const dataset = element.dataset;
      const brewStatus = game.settings.get("eclipsephase", "superBrew");
      const actorWhole = this.actor;
      const actorModel = this.actor.system;
      const curInsight = actorModel.pools.insight.value;
      const curVigor = actorModel.pools.vigor.value;
      const curMoxie = actorModel.pools.moxie.value;
      const curFlex = actorModel.pools.flex.value;
      const maxInsight = actorModel.pools.insight.totalInsight;
      const maxVigor = actorModel.pools.vigor.totalVigor;
      const maxMoxie = actorModel.pools.moxie.totalMoxie;
      const maxFlex = actorModel.pools.flex.totalFlex;
      let poolSpend = null

      if (!brewStatus){
        poolSpend = (maxInsight - curInsight) + ( maxVigor - curVigor) + (maxMoxie - curMoxie) + (maxFlex - curFlex);
      }
      else {
        poolSpend = (maxInsight - curInsight) + ( maxVigor - curVigor) + (maxMoxie - curMoxie);
      }

      let roll = await new Roll("1d6").evaluate({async: true});
      let recover = null;
      let restValue = null;
      if (dataset.resttype === "short"){
    
        let label = "I used a<p/><strong>Short Rest<p/></strong>to recover some pool points<p/>";
        recover = await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: label
        });

        restValue = recover.content

        await game.dice3d.waitFor3DAnimationByMessageID(recover.id);
      }

      if (dataset.resttype === "long" && !brewStatus){
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          flavor: "I used my<p/><strong>Long Rest<p/></strong>to recover all pools<p/>"
      })
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.pools.flex.value" : maxFlex, "system.rest.restValue" : null});
      }
      else if (dataset.resttype === "long" && brewStatus){
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: "I used my<p/><strong>Long Rest<p/></strong>to recover all pools but Flex<p/>"
        })
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.rest.restValue" : null});
      }
      else if (restValue >= poolSpend && !brewStatus){
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.pools.flex.value" : maxFlex, "system.rest.restValue" : null});
      }
      else if (restValue >= poolSpend && brewStatus){
        return actorWhole.update({"system.pools.insight.value" : maxInsight, "system.pools.vigor.value" : maxVigor, "system.pools.moxie.value" : maxMoxie, "system.rest.restValue" : null});
      }
      else {
        return actorWhole.update({"system.rest.restValue" : restValue});
      }
  });

  html.find('.restReset').click(async func => {
        const actorWhole = this.actor
        return actorWhole.update({"system.rest.short1" : false, "system.rest.short2" : false, "system.rest.long" : false});
  });

  html.find('.distribute').click(async func => {
    const actorWhole = this.actor;
    const actorModel = this.actor.system;
    const curInsight = actorModel.pools.insight.value;
    const curVigor = actorModel.pools.vigor.value;
    const curMoxie = actorModel.pools.moxie.value;
    const curFlex = actorModel.pools.flex.value;
    const insightUpdate = actorModel.pools.update.insight + curInsight;
    const vigorUpdate = actorModel.pools.update.vigor + curVigor;
    const moxieUpdate = actorModel.pools.update.moxie + curMoxie;
    const flexUpdate = actorModel.pools.update.flex + curFlex;

    return actorWhole.update({"system.pools.insight.value" : insightUpdate, "system.pools.vigor.value" : vigorUpdate, "system.pools.moxie.value" : moxieUpdate, "system.pools.flex.value" : flexUpdate, "system.rest.restValue" : null, "system.pools.update.insight" : null, "system.pools.update.vigor" : null, "system.pools.update.moxie" : null, "system.pools.update.flex" : null});
  });

    // Drag events for macros.
    if (actor.isOwner) {
        let handler = ev => this._onDragItemStart(ev);
        html.find('li.item').each((i, li) => {
            if (li.classList.contains("inventory-header")) return;
            li.setAttribute("draggable", true);
            li.addEventListener("dragstart", handler, false);
        });
    }
      //Edit Item Input Fields
      html.find(".sheet-inline-edit").change(this._onSkillEdit.bind(this));

      //Reload Ranged Weapon Functionality
      html.find(".reload").click(this._onReloadWeapon.bind(this));

      ///(De)Activate morph/body bound traits/flaws/ware
      html.find(".bodySelect").change(this._onMorphSwitch.bind(this));

      //Edit Item Checkboxes
      html.find('.equipped.checkBox').click(async ev => {
          const itemId = ev.currentTarget.closest(".equipped.checkBox").dataset.itemId;
          const item = actor.items.get(itemId);
          let toggle = !item.system.active;
          const updateData = {
              "system.active": toggle
          };
          const updated = item.update(updateData);
          
          //handles activation/deactivation of values provided by effects inherited from items
          let allEffects = this.object.effects
          let effUpdateData=[];
          for(let effectScan of allEffects){

            if (effectScan.origin){
              let parentItem = await fromUuid(effectScan.origin);

              if (itemId === parentItem._id){

                effUpdateData.push({
                  "_id" : effectScan._id,
                  disabled: !toggle
                });

              }
            }
          }
          actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
      });

      //show on hover
      html.find(".reveal").on("mouseover mouseout", this._onToggleReveal.bind(this));

      //post to chat WIP
      html.find('.post-chat').click(this._postToChat.bind(this));

  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */

  async _postToChat(event) {
    const itemID = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.items.get(itemID);

    console.log("this is item ", item);


    await item.roll();

  }

  

  async _onMorphSwitch(event) {
    event.preventDefault();

    let actor = this.actor
    let allEffects = this.object.effects

    let currentMorph = event.currentTarget.value;
    
    //browses through ALL effects and identifies, whether they are bound to an item or not
    for (let effectScan of allEffects){
      if (effectScan.origin){
        
        let parentItem = await fromUuid(effectScan.origin)
        if (parentItem.system.boundTo){

          let effUpdateData=[];

          //If a found item is bound to the currently active morph it gets prepared to be activated
          if (parentItem.system.boundTo === currentMorph) {
            effUpdateData.push({
              "_id" : effectScan._id,
              disabled: false
            });
          }
          //If a found item is NOT bound to the currently active morph it gets prepared to be DEactivated
          else {
            effUpdateData.push({
              "_id" : effectScan._id,
              disabled: true
            });
          }
          //This pushes the updated data into the effect
          actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
        }
      }   
    }
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

    this.actor.createEmbeddedDocuments("Item", [itemData]);
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
    const actorWhole = this.actor;
    const actorModel = this.actor.system;

    if(dataset.type === 'rep') {
      this._onRepRoll(dataset, actorModel)
      return
    }

    let specNameValue = dataset.specname;
    let skillRollValue = dataset.rollvalue;
    let poolType = dataset.pooltype;
    let aptType = dataset.apttype;
    const flexPool = actorModel.pools.flex.value;
    let skillPoolValue = null

    if (dataset.rolledfrom === "rangedWeapon") {
      specNameValue = actorModel.skillsVig.guns.specname;
      skillRollValue = actorModel.skillsVig.guns.roll;
      poolType = "Vigor"
    }

    if (dataset.rolledfrom === "ccWeapon") {
      specNameValue = actorModel.skillsVig.melee.specname;
      skillRollValue = actorModel.skillsVig.melee.roll;
      poolType = "Vigor"
    }

    console.log("My aptType: ", aptType)

    switch (aptType) {
      case 'Intuition':
        poolType = "Insight"
        break;
      case 'Cognition':
        poolType = "Insight"
        break;
      case 'Reflexes':
        poolType = "Vigor"
        break;
      case 'Somatics':
        poolType = "Vigor"
        break;
      case 'Willpower':
        poolType = "Moxie"
        break;
      case 'Savvy':
        poolType = "Moxie"
        break;
      default:
        break;
    }

    switch (poolType) {
      case 'Insight':
        skillPoolValue = actorModel.pools.insight.value;
        break;
      case 'Vigor':
        skillPoolValue = actorModel.pools.vigor.value;
        break;
      case 'Moxie':
        skillPoolValue = actorModel.pools.moxie.value;
        break;
      default:
        break;
    }

      Dice.TaskCheck ({
        //Actor data
        actorWhole : actorWhole,
        actorData : actorModel,
        //Skill data
        skillName : dataset.name.toLowerCase(),
        specName : specNameValue,
        rollType : dataset.type,
        skillValue : skillRollValue,
        rolledFrom : dataset.rolledfrom,
        //Pools
        poolType: poolType,
        poolValue: skillPoolValue,
        flexValue: flexPool,
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

  _onReloadWeapon(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;
    let currentAmmo = dataset.currentammo;
    let maxAmmo = dataset.maxammo;
    let weaponName = dataset.weaponname;
    let weaponID = dataset.weaponid;
    let difference = maxAmmo - currentAmmo;
    let ammoUpdate = [];

    if (difference>0){
      currentAmmo = maxAmmo;
      ammoUpdate.push({
        "_id" : weaponID,
        "system.ammoMin": currentAmmo
      });

      this.actor.updateEmbeddedDocuments("Item", ammoUpdate);

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: this.actor}),
        flavor: "I reloaded my<p/><strong>" + weaponName + "<p/></strong>with a total of " + difference + " bullets. <p/>"
    })
    }
    else {
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor: this.actor}),
      content: "<center>Your " + weaponName + " is still fully loaded.<p/><strong>No reload needed</strong></center>",
      whisper: [game.user._id]
    })
    }

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

  _onRepRoll(dataset, actorModel) {
    Dice.ReputationRoll(dataset, actorModel)
  }
}


