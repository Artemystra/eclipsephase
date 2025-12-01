// Import Modules
// const util = require('util');
import * as EPchat from "./rolls/chat.js";
import  EPactor from "./actor/EPactor.js";
import  EPitem  from "./item/EPitem.js";
import { EPmenu } from './menu.js';
import  EPactorSheet from "./actor/EPactorSheet.js";
import  EPnpcSheet from "./actor/EPnpcSheet.js";
import  EPgoonSheet from "./actor/EPgoonSheet.js";
import  EPgearSheet from "./item/EPgearSheet.js";
import  EPtraitSheet  from "./item/EPtraitSheet.js";
import  EPaspectSheet  from "./item/EPaspectSheet.js";
import  EPprogramSheet  from "./item/EPprogramSheet.js";
import  EPspecialSkillSheet  from "./item/EPspecialSkillSheet.js";
import  EPknowSkillSheet  from "./item/EPknowSkillSheet.js";
import  EPmorphTraitSheet  from "./item/EPmorphTraitSheet.js";
import  EPvehicleSheet  from "./item/EPvehicleSheet.js";
import  { eclipsephase } from "./config.js";
import  * as update from "./common/migration.js";

async function registerSystemSettings() {
  game.settings.register("eclipsephase", "showTaskOptions", {
    config: true,
    scope: "client",
    name: "SETTINGS.showTaskOptions.name",
    hint: "SETTINGS.showTaskOptions.hint",
    type: Boolean,
    default: true
  });

  game.settings.register("eclipsephase", "showDamageOptions", {
    config: true,
    scope: "client",
    name: "SETTINGS.showDamageOptions.name",
    hint: "SETTINGS.showDamageOptions.hint",
    type: Boolean,
    default: true
  });

  game.settings.register("eclipsephase", "showEverything", {
    config: true,
    scope: "world",
    name: "SETTINGS.showEverything.name",
    hint: 'SETTINGS.showEverything.hint',
    type: Boolean,
    default: false
  });

  game.settings.register("eclipsephase", "restReset", {
    config: true,
    scope: "world",
    name: "SETTINGS.restReset.name",
    hint: 'SETTINGS.restReset.hint',
    type: Boolean,
    default: false
  });

   // Register initiative rule
   game.settings.register("eclipsephase", "ammoRules", {
    config: true,
    scope: "world",
    name: "SETTINGS.ammoRules.name",
    hint: "SETTINGS.ammoRules.hint",
    type: String,
    default: "default",
    choices: {
      "default": "SETTINGS.ammoRules.default",
      "survival": "SETTINGS.ammoRules.survival",
      "grenadesOnly": "SETTINGS.ammoRules.grenadesOnly"
    },
  });

  game.settings.register("eclipsephase", "hideNPCs", {
    config: true,
    scope: "world",
    name: "SETTINGS.hideNPCs.name",
    hint: 'SETTINGS.hideNPCs.hint',
    type: Boolean,
    default: true
  });

  game.settings.register("eclipsephase", "effectPanel", {
    config: true,
    scope: "world",
    name: "SETTINGS.effectPanel.name",
    hint: 'SETTINGS.effectPanel.hint',
    type: Boolean,
    default: false
  });

  game.settings.register("eclipsephase", "editAll", {
    config: true,
    scope: "world",
    name: "SETTINGS.editAll.name",
    hint: 'SETTINGS.editAll.hint',
    type: Boolean,
    default: false
  });

  game.settings.register("eclipsephase", "GMmenu", {
    config: true,
    scope: "world",
    name: "SETTINGS.gmMenu.name",
    hint: 'SETTINGS.gmMenu.hint',
    type: Boolean,
    default: true
  });

  game.settings.register("eclipsephase", "migrationVersion", {
    config: true,
    scope: "world",
    name: "SETTINGS.migrationVersion.name",
    hint: "SETTINGS.migrationVersion.hint",
    type: String,
    default: "newInstall"
  });

  game.settings.register("eclipsephase", "superBrew", {
    config: true,
    scope: "world",
    name: "SETTINGS.superBrew.name",
    hint: "SETTINGS.superBrew.hint",
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
  Items.registerSheet("eclipsephase", EPgearSheet, {types: ["gear","ccWeapon","grenade","armor","ware","drug","rangedWeapon","ammo", "id", "morph"], makeDefault: true });
  Items.registerSheet("eclipsephase", EPmorphTraitSheet, {types: ["morphTrait","trait","flaw","morphFlaw"], makeDefault: true });
  Items.registerSheet("eclipsephase", EPtraitSheet, {types: ["traits"], makeDefault: true });
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
    "systems/eclipsephase/templates/actor/partials/tabs/psi-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/psi-details.html",
    "systems/eclipsephase/templates/actor/partials/tabs/id-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/id-details.html",
    "systems/eclipsephase/templates/actor/partials/tabs/effects-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/ego-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/muse-tab.html",
    "systems/eclipsephase/templates/actor/partials/tabs/gear-tab.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/sideCar.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/armorSummary.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/weaponSummary.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/gearSummary.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/statusSummary.html",
    "systems/eclipsephase/templates/actor/partials/currentStatus/consumableSummary.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/consumable.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/gear.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/weapons.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/gamma-sleight.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/chi-sleight.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/traitsAndFlaws.html",
    "systems/eclipsephase/templates/actor/partials/item-partials/vehicles.html",
    "systems/eclipsephase/templates/chat/partials/general-modifiers.html",
    "systems/eclipsephase/templates/chat/partials/roll-results.html",
    "systems/eclipsephase/templates/item/partials/weapon-mode.html",
    "systems/eclipsephase/templates/item/partials/grenade-details.html",
    "systems/eclipsephase/templates/item/partials/item-traits.html"
  ];
  await loadTemplates(templates);
  Handlebars.registerHelper('toLowerCase', function(str) {
    return str.toLowerCase();
  });

  // Helper to dump content from within the handlebars system
  Handlebars.registerHelper('inspect', function(obj) {
    return '> ' + JSON.stringify(obj)
  })

  // Helper to set checked attribute on checkboxes within template
  Handlebars.registerHelper("checkedIf", function (condition) {
    return (condition) ? "checked" : "";
  });

  registerSystemSettings();
});

Hooks.once("ready", async function() {

//Migration script if actorSheets are changing
const gameVersion = game.settings.get("eclipsephase", "migrationVersion");
const currentVersion = game.system.version
gameVersion === "newInstall" ? game.settings.set("eclipsephase", "migrationVersion", currentVersion) : console.log("Last Migration:", gameVersion, "\n" + "System Version:", game.system.version)
let startMigration = false
let endMigration = false
const messageHeadline = "ep2e.migration.headlineStart"
let isLegacy = foundry.utils.isNewerVersion("0.8.1", gameVersion)
let before0861 = foundry.utils.isNewerVersion("0.8.6.1", gameVersion)
let before09 = foundry.utils.isNewerVersion("0.9", gameVersion)
let before093 = foundry.utils.isNewerVersion("0.9.3", gameVersion)
let before095 = foundry.utils.isNewerVersion("0.9.4", gameVersion)
let before098 = foundry.utils.isNewerVersion("0.9.8", gameVersion)
let before0985 = foundry.utils.isNewerVersion("0.9.8.5", gameVersion)
let before099 = foundry.utils.isNewerVersion("0.9.9", gameVersion)
let before0992 = foundry.utils.isNewerVersion("0.9.9.2", gameVersion)
let before110 = foundry.utils.isNewerVersion("1.1.0", gameVersion)
//For testing against the latest version: game.system.version


//pre 0.8.1 Migration
if (isLegacy){
  const messageCopy = "ep2e.migration.legacy"
  let migration = await migrationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

  await update.migrationLegacy(startMigration)
  let Migration0861 = await update.migrationPre0861(startMigration)

  endMigration = Migration0861["endMigration"]
}
//0.8.6.1 Migration
if (before0861) {
  endMigration = false
  const messageCopy = "ep2e.migration.0861"
  let migration = await migrationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

  let Migration0861 = await update.migrationPre0861(startMigration)

  endMigration = Migration0861["endMigration"]
}
//0.9 Migration
if (before09) {
  endMigration = false
  const messageCopy = "ep2e.migration.09"
  let migration = await migrationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

  let Migration09 = await update.migrationPre09(startMigration)

  endMigration = Migration09["endMigration"]
}

//0.9.3 Migration
if (before093) {
  endMigration = false
  const messageCopy = "ep2e.migration.093"
  let migration = await migrationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

  let Migration093 = await update.migrationPre093(startMigration)

  endMigration = Migration093["endMigration"]
}

//0.9.4 Migration
if (before095) {
  endMigration = false
  const messageCopy = "ep2e.migration.095"
  let migration = await migrationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

  let Migration095 = update.migrationPre095(startMigration)

  endMigration = Migration095["endMigration"]
}

//0.9.8 Migration
if (before098) {
  endMigration = false
  const messageCopy = "ep2e.migration.098"
  let migration = await migrationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

  let Migration098 = update.migrationPre098(startMigration)

  endMigration = Migration098["endMigration"]
}

//0.9.8.5 Migration
if (before0985) {
  endMigration = false
  const messageCopy = "ep2e.migration.0985"
  let migration = await migrationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

  let Migration0985 = update.migrationPre0985(startMigration)

  endMigration = Migration0985["endMigration"]
}

//0.9.9 Migration
if (before099) {
  endMigration = false
  const messageCopy = "ep2e.migration.099"
  let migration = await informationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    game.settings.set("eclipsephase", "migrationVersion", "0.9.9");
  }

  endMigration = false
}

//0.9.9.2 Migration
if (before0992) {
  endMigration = false
  const messageCopy = "ep2e.migration.0992"
  let migration = await migrationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

  let Migration0992 = update.migrationPre0992(startMigration)

  endMigration = Migration0992["endMigration"]
}

if(endMigration){
  await migrationEnd(endMigration)
}

//1.1.0 Migration
if (before110) {
  endMigration = false
  const messageCopy = "ep2e.migration.110"
  let migration = await migrationStart(endMigration, messageHeadline, messageCopy);
  
  if (migration.cancelled) {
  }
  else if (migration.start){
    startMigration = migration.start
  }

  let Migration0992 = update.migrationPre110(startMigration)

  endMigration = Migration0992["endMigration"]
}

if(endMigration){
  await migrationEnd(endMigration)
}

console.log("\n" + "%c Eclipse Phase System migrated to the latest version ", "background-color: #2bb42b; color: #000000; font-weight: bold;")

async function migrationStart(endMigration, messageHeadline, messageCopy) {
  const template = "systems/eclipsephase/templates/chat/migration-dialog.html";
  const html = await renderTemplate(template, {endMigration, messageHeadline, messageCopy});

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

async function informationStart(endMigration, messageHeadline, messageCopy) {
  const template = "systems/eclipsephase/templates/chat/migration-dialog.html";
  const html = await renderTemplate(template, {endMigration, messageHeadline, messageCopy});

  return new Promise(resolve => {
      const data = {
          title: "Migration Needed",
          content: html,
          buttons: {
              normal: {
                  label: "Close",
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
  const messageHeadline = "ep2e.migration.headlineEnd"
  const messageCopy = "ep2e.migration.done"
  const template = "systems/eclipsephase/templates/chat/migration-dialog.html";
  const html = await renderTemplate(template, {endMigration, messageHeadline, messageCopy});

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

//Sets parts of the chat invisible to players or the GM & adds special functions to chat messages
Hooks.on("renderChatMessageHTML", (message, html, data) => {
  EPchat.addChatListeners(html, data);
  EPchat.GMvision(html, data);
  EPchat.ownerVision(html, data);
  EPchat.playerVision(html, data);
});

//Renders the ChatLog according to given visibility options
Hooks.on("renderChatLog", (app,html,data) => {
  EPchat.GMvision(html, data);
  EPchat.ownerVision(html, data);
  EPchat.playerVision(html, data);
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
