// Import Modules
// const util = require('util');
import  EPactor from "./actor/EPactor.js";
import  EPitem  from "./item/EPitem.js";
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
    "systems/eclipsephase/templates/actor/partials/tabs/vehicles.html",
    "systems/eclipsephase/templates/actor/partials/tabs/skills.html",
    "systems/eclipsephase/templates/actor/partials/tabs/npcgear.html",
    "systems/eclipsephase/templates/actor/partials/tabs/psi.html",
    "systems/eclipsephase/templates/actor/partials/tabs/health-tab.html",
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
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => createEclipsePhaseMacro(data, slot));
});

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
