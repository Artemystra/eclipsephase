// Import Modules
// const util = require('util');
import  EPactor from "./actor/EPactor.js";
import  EPitem  from "./item/EPitem.js";
import { EPmenu } from './menu.js';
import  EPactorSheet from "./actor/EPactorSheet.js";
import  EPnpcSheet from "./actor/EPnpcSheet.js";
import  EPgoonSheet from "./actor/EPgoonSheet.js";
import  EPgearSheet from "./item/EPgearSheet.js";
import  EPtraitSheet  from "./item/EPtraitSheet.js";
import  EPflawSheet from "./item/EPflawSheet.js";
import  EPaspectSheet  from "./item/EPaspectSheet.js";
import  EPprogramSheet  from "./item/EPprogramSheet.js";
import  EPspecialSkillSheet  from "./item/EPspecialSkillSheet.js";
import  EPknowSkillSheet  from "./item/EPknowSkillSheet.js";
import  EPmorphTraitSheet  from "./item/EPmorphTraitSheet.js";
import  EPmorphFlawSheet from "./item/EPmorphFlawSheet.js";
import  EPvehicleSheet  from "./item/EPvehicleSheet.js";
import  { eclipsephase } from "./config.js";

function registerSystemSettings() {
  game.settings.register("eclipsephase", "showTaskOptions", {
    config: true,
    scope: "client",
    name: "Default Show Skill Modifier Dialog",
    hint: "Check this option to show the skill-modification-dialog per default when clicking any roll icon on the character sheet",
    type: Boolean,
    default: true
  });

  game.settings.register("eclipsephase", "showDamageOptions", {
    config: true,
    scope: "client",
    name: "Default Show Damage Dialog",
    hint: "Check this option to show the damage-dialog per default when clicking any damage roll icon on the character sheet",
    type: Boolean,
    default: true
  });

  game.settings.register("eclipsephase", "showEverything", {
    config: true,
    scope: "world",
    name: "Always Reveal Player Stats",
    hint: 'Always show playercharacter details/stats to everyone with at least "limited" permissions. If deactivated, shows a "limited"-sheet of all player characters to everyone (not only the GM and owner of given character)',
    type: Boolean,
    default: false
  });

  game.settings.register("eclipsephase", "hideNPCs", {
    config: true,
    scope: "world",
    name: "Always Hide NPC/Threat Stats",
    hint: 'If activated, shows a "limited"-sheet of all NPCs & Threats to everyone instead of showing all details and values',
    type: Boolean,
    default: true
  });

  game.settings.register("eclipsephase", "effectPanel", {
    config: true,
    scope: "world",
    name: "Enable Effect Panel",
    hint: 'Enable the Effect Panel on Actors',
    type: Boolean,
    default: false
  });

  game.settings.register("eclipsephase", "GMmenu", {
    config: true,
    scope: "world",
    name: "Enable GM Menu",
    hint: 'Shows special GM menu on the lefthand side of the game canvas (marked in blue)',
    type: Boolean,
    default: true
  });

  game.settings.register("eclipsephase", "migrationVersion", {
    config: true,
    scope: "world",
    name: "Migration Version",
    hint: "Marks the last time this system was migrated. (WARNING: Don't change this value unless you know what it is for! Can break your system.)",
    type: String,
    default: "0.8.0.1"
  });

  game.settings.register("eclipsephase", "superBrew", {
    config: true,
    scope: "world",
    name: "Diemen's Special Brew",
    hint: "Check this to activate Diemen's special homebrew rules. WARNING: NOT THE REAL THING!",
    type: Boolean,
    default: false
  });
}

Hooks.once('init', async function() {

  game.eclipsephase = {
    EPactor,
    EPitem,
    rollItemMacro
  };

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "1d6 + @initiative.value",
    decimals: 0
  };

  // Define custom Entity classes
  CONFIG.Actor.documentClass = EPactor;
  CONFIG.eclipsephase = eclipsephase;
  CONFIG.Item.documentClass = EPitem;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("eclipsephase", EPactorSheet, {types: ["character"], makeDefault: true });
  Actors.registerSheet("eclipsephase", EPnpcSheet, {types: ["npc"], makeDefault: true });
  Actors.registerSheet("eclipsephase", EPgoonSheet, {types: ["goon"], makeDefault: true });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("eclipsephase", EPgearSheet, {types: ["gear","rangedWeapon","ccWeapon","grenade","armor","ware","drug"], makeDefault: true });
  Items.registerSheet("eclipsephase", EPmorphTraitSheet, {types: ["morphTrait","trait","flaw","morphFlaw"], makeDefault: true });
  Items.registerSheet("eclipsephase", EPaspectSheet, {types: ["aspect"], makeDefault: true});
  Items.registerSheet("eclipsephase", EPprogramSheet, {types: ["program"], makeDefault: true });
  Items.registerSheet("eclipsephase", EPknowSkillSheet, {types: ["knowSkill"], makeDefault: true });
  Items.registerSheet("eclipsephase", EPspecialSkillSheet, {types: ["specialSkill"], makeDefault: true });
  Items.registerSheet("eclipsephase", EPvehicleSheet, {types: ["vehicle"], makeDefault: true });

  //Handlebars.registerPartial('NPCSkills', `{{> "systems/eclipsephase/templates/actor/npc-skills-tab.html"}}`);
  // If you need to add Handlebars helpers, here are a few useful examples:
  Handlebars.registerHelper('concat', function() {
    var outStr = '';
    for (var arg in arguments) {
      if (typeof arguments[arg] != 'object') {
        outStr += arguments[arg];
      }
    }
    return outStr;
  });
  var templates = [
    "systems/eclipsephase/templates/actor/partials/headerblock.html",
    "systems/eclipsephase/templates/actor/partials/health-bar.html",
    "systems/eclipsephase/templates/actor/partials/morph-details.html",
    "systems/eclipsephase/templates/actor/partials/morph-traits.html",
    "systems/eclipsephase/templates/actor/partials/tabs/vehicles-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/skills.html",
    "systems/eclipsephase/templates/actor/partials/tabs/npcgear.html",
    "systems/eclipsephase/templates/actor/partials/tabs/psi.html",
    "systems/eclipsephase/templates/actor/partials/tabs/id-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/id-details.html",
    "systems/eclipsephase/templates/actor/partials/tabs/effects-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/ego-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/muse-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/gear-tab.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/sideCar.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/armorSummary.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/rangedWeaponSummary.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/ccWeaponSummary.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/gearSummary.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/statusSummary.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/consumableSummary.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/consumable.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/gear.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/ranged-weapons.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/cc-weapons.html"
  ];
  await loadTemplates(templates);
  Handlebars.registerHelper('toLowerCase', function(str) {
    return str.toLowerCase();
  });

  // Helper to dump content from within the handlebars system
  Handlebars.registerHelper('inspect', function(obj) {
    return '> ' + JSON.stringify(obj)
  })

  registerSystemSettings();
});

Hooks.once("ready", async function() {

//Migration script if actorSheets are changing

const testVar = game.settings.get("eclipsephase", "migrationVersion");
let startMigration = false
let endMigration = false

let isNewVersion = foundry.utils.isNewerVersion(game.system.version, testVar)

if (isNewVersion){
  let migration = await migrationStart(endMigration);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

}
else {
}


if (startMigration){
  
  for (let actor of game.actors){

    //Item migration script
    for(let item of actor.items) {
      let itemID = item._id;
      let itemType = item.type;
      let itemUpdated = item.system.updated
      let updateCost = "";
      let updateSlot = "";
      let updateMode = "";
      let updateWare = "";
      let updateSize = "";
      let updateVehicleType = "";
      let updateApt = "";
      let updatePsiType = "";
      let updateDuration = "";
      let updateAction = "";
      let updateProgram = "";
      let updateArmorUsed = "";
      let itemUpdate = [];
      let skillApt = item.system.aptitude;
      let psiType = item.system.psiType;
      let psiDuration = item.system.duration;
      let psiAction = item.system.actionType;
      let slotType = item.system.slotType;
      let costType = item.system.cost;
      let firingMode = item.system.firingMode;
      let armorUsed = item.system.armorused;
      let programLevel = item.system.programLevel;
      let vehicleType = item.system.type;
      let wareType = item.system.wareType;

      if (itemType === "gear" && !itemUpdated){
        console.log("Gear Switch Triggert!")
        switch (costType) {
          case 'Minor':
            updateCost = "minor"
            break;
          case 'Moderate':
            updateCost = "moderate"
            break;
          case 'Major':
            updateCost = "major"
            break;
          case 'Rare':
            updateCost = "rare"
            break;
          default:
            break;
        }

        switch (slotType) {
          case 'Bulky':
            updateSlot = "bulky"
            break;
          case 'Consumable':
            updateSlot = "consumable"
            break;
          case 'Accessory':
            updateSlot = "accessory"
            break;
          case 'Not Mobile':
            updateSlot = "notMobile"
            break;
          default:
            break;
        }
        itemUpdate.push({
          "_id" : itemID,
          "system.updated": true,
          "system.slotType": updateSlot,
          "system.cost": updateCost
        });
        actor.updateEmbeddedDocuments("Item", itemUpdate);
      }

      if (itemType === "rangedWeapon" && !itemUpdated){
        console.log("Ranged Switch Triggert!")
        if (firingMode){
          switch (firingMode) {
            case 'SS':
              updateMode = "ss"
              break;
            case 'SA':
              updateMode = "sa"
              break;
            case 'SA/BF':
              updateMode = "saBF"
              break;
            case 'BF/FA':
              updateMode = "bfFA"
              break;
            case 'SA/BF/FA':
              updateMode = "saBFfa"
              break;
            default:
              break;
          }
        }

        switch (costType) {
          case 'Minor':
            updateCost = "minor"
            break;
          case 'Moderate':
            updateCost = "moderate"
            break;
          case 'Major':
            updateCost = "major"
            break;
          case 'Rare':
            updateCost = "rare"
            break;
          default:
            break;
        }

        switch (slotType) {
          case 'Integrated':
            updateSlot = "integrated"
            break;
          case 'Sidearm':
            updateSlot = "sidearm"
            break;
          case 'One Handed':
            updateSlot = "oneHanded"
            break;
          case 'Two Handed':
            updateSlot = "twoHanded"
            break;
          case 'Bulky':
            updateSlot = "bulky"
            break;
          default:
            break;
        }
        itemUpdate.push({
          "_id" : itemID,
          "system.updated": true,
          "system.firingMode": updateMode,
          "system.slotType": updateSlot,
          "system.cost": updateCost
        });
        actor.updateEmbeddedDocuments("Item", itemUpdate);
      }

      if (itemType === "ccWeapon" && !itemUpdated){
        console.log("Melee Switch Triggert!")
        switch (costType) {
          case 'Minor':
            updateCost = "minor"
            break;
          case 'Moderate':
            updateCost = "moderate"
            break;
          case 'Major':
            updateCost = "major"
            break;
          case 'Rare':
            updateCost = "rare"
            break;
          default:
            break;
        }

        switch (slotType) {
          case 'Integrated':
            updateSlot = "integrated"
            break;
          case 'Sidearm':
            updateSlot = "sidearm"
            break;
          case 'One Handed':
            updateSlot = "oneHanded"
            break;
          case 'Two Handed':
            updateSlot = "twoHanded"
            break;
          case 'Bulky':
            updateSlot = "bulky"
            break;
          default:
            break;
        }
        itemUpdate.push({
          "_id" : itemID,
          "system.updated": true,
          "system.slotType": updateSlot,
          "system.cost": updateCost
        });
        actor.updateEmbeddedDocuments("Item", itemUpdate);
      }

      if (itemType === "armor" && !itemUpdated){
        console.log("Armor Switch Triggert!")
        switch (costType) {
          case 'Minor':
            updateCost = "minor"
            break;
          case 'Moderate':
            updateCost = "moderate"
            break;
          case 'Major':
            updateCost = "major"
            break;
          case 'Rare':
            updateCost = "rare"
            break;
          default:
            break;
        }

        switch (slotType) {
          case 'Main Armor':
            updateSlot = "main"
            break;
          case 'Additional Armor':
            updateSlot = "additional"
            break;
          default:
            break;
        }
        itemUpdate.push({
          "_id" : itemID,
          "system.updated": true,
          "system.slotType": updateSlot,
          "system.cost": updateCost
        });
        actor.updateEmbeddedDocuments("Item", itemUpdate);
      }

      if (itemType === "ware" && !itemUpdated){
        console.log("Ware Switch Triggert!")
        switch (costType) {
          case 'Minor':
            updateCost = "minor"
            break;
          case 'Moderate':
            updateCost = "moderate"
            break;
          case 'Major':
            updateCost = "major"
            break;
          case 'Rare':
            updateCost = "rare"
            break;
          default:
            break;
        }

        switch (wareType) {
          case 'B':
            updateWare = "b"
            break;
          case 'BCH':
            updateWare = "bch"
            break;
          case 'BH':
            updateWare = "bh"
            break;
          case 'BHM':
            updateWare = "bhm"
            break;
          case 'BM':
            updateWare = "bm"
            break;
          case 'C':
            updateWare = "c"
            break;
          case 'CH':
            updateWare = "ch"
            break;
          case 'CHN':
            updateWare = "chn"
            break;
          case 'CHM':
            updateWare = "chm"
            break;
          case 'H':
            updateWare = "h"
            break;
          case 'HN':
            updateWare = "hn"
            break;
          case 'HMN':
            updateWare = "hmn"
            break;
          case 'N':
            updateWare = "n"
            break;
          case 'NH':
            updateWare = "nh"
            break;
          case 'MN':
            updateWare = "mn"
            break;
          default:
            break;
        }

        itemUpdate.push({
          "_id" : itemID,
          "system.updated": true,
          "system.wareType": updateWare,
          "system.cost": updateCost
        });
        actor.updateEmbeddedDocuments("Item", itemUpdate);
      }

      if (itemType === "vehicle" && !itemUpdated){
        console.log("Vehicle Switch Triggert!")
        switch (costType) {
          case 'Minor':
            updateCost = "minor"
            break;
          case 'Moderate':
            updateCost = "moderate"
            break;
          case 'Major':
            updateCost = "major"
            break;
          case 'Rare':
            updateCost = "rare"
            break;
          default:
            break;
        }

        switch (vehicleType) {
          case 'Robot':
            updateVehicleType = "robot"
            break;
          case 'Vehicle':
            updateVehicleType = "vehicle"
            break;
          case 'Morph':
            updateVehicleType = "morph"
            break;
          case 'Smart-Animal':
            updateVehicleType = "animal"
            break;
          default:
            break;
        }
        
        switch (slotType) {
          case 'Very Small':
            updateSize = "vs"
            break;
          case 'Small':
            updateSize = "s"
            break;
          case 'Medium':
            updateSize = "m"
            break;
          case 'Large':
            updateSize = "l"
            break;
          case 'Very Large':
            updateSize = "vl"
            break;
          default:
            break;
        }

        itemUpdate.push({
          "_id" : itemID,
          "system.updated": true,
          "system.type": updateVehicleType,
          "system.slotType": updateSize,
          "system.cost": updateCost
        });
        actor.updateEmbeddedDocuments("Item", itemUpdate);
      }

      if (itemType === "grenade" && !itemUpdated){
        console.log("Grenade Switch Triggert!")
        switch (costType) {
          case 'Minor':
            updateCost = "minor"
            break;
          case 'Moderate':
            updateCost = "moderate"
            break;
          case 'Major':
            updateCost = "major"
            break;
          case 'Rare':
            updateCost = "rare"
            break;
          default:
            break;
        }
        
        switch (slotType) {
          case 'Consumable':
            updateSize = "consumable"
            break;
          default:
            break;
        }

        switch (armorUsed) {
          case 'None':
            updateArmorUsed = "none"
            break;
          case 'Kinetic':
            updateArmorUsed = "kinetic"
            break;
          case 'Energy':
            updateArmorUsed = "energy"
            break;
          default:
            break;
        }

        itemUpdate.push({
          "_id" : itemID,
          "system.updated": true,
          "system.armorUsed": updateArmorUsed,
          "system.slotType": updateSize,
          "system.cost": updateCost
        });
        actor.updateEmbeddedDocuments("Item", itemUpdate);
      }

      if (itemType === "program" && !itemUpdated){
        console.log("Program Switch Triggert!")
        switch (programLevel) {
          case 'Intruder':
            updateProgram = "intruder"
            break;
          case 'User':
            updateProgram = "user"
            break;
          case 'Admin':
            updateProgram = "admin"
            break;
          case 'Owner':
            updateProgram = "owner"
            break;
          default:
            break;
        }

        itemUpdate.push({
          "_id" : itemID,
          "system.updated": true,
          "system.programLevel": updateProgram
        });
        actor.updateEmbeddedDocuments("Item", itemUpdate);
      }
      
      if (item.type === "knowSkill" && !itemUpdated || item.type === "specialSkill" && !itemUpdated){
        console.log("Skill Switch Triggert!")
        switch (skillApt) {
          case 'Intuition':
            updateApt = "int"
            break;
          case 'Cognition':
            updateApt = "cog"
            break;
          case 'Reflexes':
            updateApt = "ref"
            break;
          case 'Savvy':
            updateApt = "sav"
            break;
          case 'Somatics':
            updateApt = "som"
            break;
          case 'Willpower':
            updateApt = "wil"
            break;
          default:
            break;
        }
          itemUpdate.push({
            "_id" : itemID,
            "system.updated": true,
            "system.aptitude": updateApt
          });
          actor.updateEmbeddedDocuments("Item", itemUpdate);
        }
      

      if (item.type === "aspect" && !itemUpdated){
        console.log("Aspect Switch Triggert!")
        switch (psiType) {
          case '':
            updatePsiType = "gamma"
            break;
          case 'none':
            updatePsiType = "gamma"
            break;
          case 'Gamma':
            updatePsiType = "gamma"
            break;
          case 'Chi':
            updatePsiType = "chi"
            break;
          case 'Epsilon':
            updatePsiType = "epsilon"
            break;
          default:
            break;
        }

        switch (psiDuration) {
          case 'Instant':
            updateDuration = "instant"
            break;
          case 'Actions Turns':
            updateDuration = "action"
            break;
          case 'Minutes':
            updateDuration = "minutes"
            break;
          case 'Hours':
            updateDuration = "hours"
            break;
          case 'Sustained':
            updateDuration = "sustained"
            break;
          default:
            break;
        }

        switch (psiAction) {
          case 'Quick':
            updateAction = "quick"
            break;
          case 'Task':
            updateAction = "task"
            break;
          case 'Complex':
            updateAction = "complex"
            break;
          default:
            break;
        }

        itemUpdate.push({
          "_id" : itemID,
          "system.updated": true,
          "system.psiType": updatePsiType,
          "system.actionType": updateAction,
          "system.duration": updateDuration
        });
        actor.updateEmbeddedDocuments("Item", itemUpdate);
      }
    }

    //Ego Details migration (only player characters)
    if (actor.type === "character"){
      let genderSelection = actor.system.ego.gender;
      let originSelection = actor.system.ego.origin;
      let sexSelection = actor.system.ego.sex;
      let updateGender = "";
      let updateOrigin = "";
      let updateSex = "";
      switch (originSelection) {
        case 'Anarchist':
          updateOrigin = "anarchist"
          break;
        case 'Argonaut':
          updateOrigin = "argonaut"
          break;
        case 'Barsoomian':
          updateOrigin = "barsoomian"
          break;
        case 'Brinker':
          updateOrigin = "brinker"
          break;
        case 'Criminal':
          updateOrigin = "criminal"
          break;
        case 'Extropian':
          updateOrigin = "extropian"
          break;
        case 'Hypercorps':
          updateOrigin = "hypercorps"
          break;
        case 'Jovian':
          updateOrigin = "jovian"
          break;
        case 'Lunar/Orbital':
          updateOrigin = "lunar"
          break;
        case 'Mercurial':
          updateOrigin = "mercurial"
          break;
        case 'Reclaimer':
          updateOrigin = "reclaimer"
          break;
        case 'Scum':
          updateOrigin = "scum"
          break;
        case 'Socialite':
          updateOrigin = "socialite"
          break;
        case 'Titanian':
          updateOrigin = "titanian"
          break;
        case 'Venusian':
          updateOrigin = "venusian"
          break;
        case 'Regional':
          updateOrigin = "regional"
          break;
        default:
          break;
      }
  
      switch (genderSelection) {
        case 'Cisgender':
          updateGender = "cis"
          break;
        case 'Transgender':
          updateGender = "trans"
          break;
        case 'Non-Binary':
          updateGender = "nonBi"
          break;
        case 'Genderfluid':
          updateGender = "fluid"
          break;
        case 'Agender':
          updateGender = "aGen"
          break;
        case 'Bigender':
          updateGender = "biGen"
          break;
        case 'Polygender':
          updateGender = "polGen"
          break;
        case 'Neutrois':
          updateGender = "neu"
          break;
        case 'Gender Apathetic':
          updateGender = "genAp"
          break;
        case 'Intergender':
          updateGender = "inter"
          break;
        case 'Demigender':
          updateGender = "demi"
          break;
        case 'Greygender':
          updateGender = "grey"
          break;
        case 'Aporgender':
          updateGender = "apora"
          break;
        case 'Maverique':
          updateGender = "mav"
          break;
        case 'Novigender':
          updateGender = "novi"
          break;
        default:
          break;
      }
  
      switch (sexSelection) {
        case 'Male':
          updateSex = "male"
          break;
        case 'Female':
          updateSex = "female"
          break;
        case 'Intersex':
          updateSex = "inter"
          break;
        case 'Dyadic':
          updateSex = "dyadic"
          break;
        default:
          break;
      }

      if (updateGender || updateOrigin || updateSex){
        actor.update({"system.ego.gender" : updateGender,"system.ego.origin" : updateOrigin,"system.ego.sex" : updateSex});
      }
    }
    
    //Update aptitude Names 
      
      actor.update({"system.aptitudes.cog.name" : "ep2e.actorSheet.aptitudes.cog", "system.aptitudes.int.name" : "ep2e.actorSheet.aptitudes.int","system.aptitudes.ref.name" : "ep2e.actorSheet.aptitudes.ref","system.aptitudes.sav.name" : "ep2e.actorSheet.aptitudes.sav","system.aptitudes.som.name" : "ep2e.actorSheet.aptitudes.som","system.aptitudes.wil.name" : "ep2e.actorSheet.aptitudes.wil", "system.aptitudes.cog.label" : "ep2e.actorSheet.aptitudes.cognition", "system.aptitudes.int.label" : "ep2e.actorSheet.aptitudes.intuition", "system.aptitudes.ref.label" : "ep2e.actorSheet.aptitudes.reflexes", "system.aptitudes.sav.label" : "ep2e.actorSheet.aptitudes.savvy", "system.aptitudes.som.label" : "ep2e.actorSheet.aptitudes.somatics", "system.aptitudes.wil.label" : "ep2e.actorSheet.aptitudes.willpower"});
    
  }

  game.settings.set("eclipsephase", "migrationVersion", game.system.version);

  endMigration = true
  await migrationEnd(endMigration)
}

  async function migrationStart(endMigration) {
    const template = "systems/eclipsephase/templates/chat/migration-dialog.html";
    const html = await renderTemplate(template, {endMigration});

    return new Promise(resolve => {
        const data = {
            title: "Migration Needed",
            content: html,
            buttons: {
                cancel: {
                    label: "Cancel",
                    callback: html => resolve ({cancelled: true})
                },
                normal: {
                    label: "Start Migration",
                    callback: html => resolve ({start: true})
                }
            },
            default: "normal",
            close: () => resolve ({cancelled: true})
        };
        let options = {width:600}
        new Dialog(data, options).render(true);
    });
}

async function migrationEnd(endMigration) {
  const template = "systems/eclipsephase/templates/chat/migration-dialog.html";
  const html = await renderTemplate(template, {endMigration});

  return new Promise(resolve => {
      const data = {
          title: "Migration Needed",
          content: html,
          buttons: {
              normal: {
                  label: "Thank you!",
                  callback: html => resolve ({start: true})
              }
          },
          default: "normal",
          close: () => resolve ({cancelled: true})
      };
      let options = {width:250}
      new Dialog(data, options).render(true);
  });
}

  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => createEclipsePhaseMacro(data, slot));
});

//Hooks.on('getSceneControlButtons', EPmenu.getButtons)
Hooks.on('renderSceneControls', EPmenu.renderControls)

/**
 Async function to open a dialog
 */


/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createEclipsePhaseMacro(data, slot) {
  if (data.type !== "Item") return;
  if (!("data" in data)) return ui.notifications.warn("You can only create macro buttons for owned Items");
  const item = data.data;

  // Create the macro command
  const command = `game.eclipsephase.rollItemMacro("${item.name}");`;
  let macro = game.macros.entities.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "eclipsephase.itemMacro": true }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemName
 * @return {Promise}
 */
function rollItemMacro(itemName) {
  const speaker = ChatMessage.getSpeaker();
  let actor;
  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  const item = actor ? actor.items.find(i => i.name === itemName) : null;
  if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

  // Trigger the item roll
  return item.roll();
}
