// Import Modules
import { EclipsePhaseActor } from "./actor/actor.js";
import { EclipsePhaseActorSheet } from "./actor/actor-sheet.js";
import { NpcSheet } from "./actor/npcSheet.js";
import { GoonSheet } from "./actor/goonSheet.js";
import { EclipsePhaseItem } from "./item/item.js";
import { EclipsePhaseGearSheet } from "./item/gear-sheet.js";
import { EclipsePhaseTraitSheet } from "./item/trait-sheet.js";
import { EclipsePhaseFlawSheet } from "./item/flaw-sheet.js";
import { EclipsePhaseRangedWeaponSheet } from "./item/rangedweapon-sheet.js";
import { EclipsePhaseCloseCombatWeaponSheet } from "./item/ccweapon-sheet.js";
import { EclipsePhaseGrenadeSheet } from "./item/grenade-sheet.js";
import { EclipsePhaseArmorSheet } from "./item/armor-sheet.js";
import { EclipsePhaseDrugSheet } from "./item/drug-sheet.js";
import { EclipsePhaseWareSheet } from "./item/ware-sheet.js";
import { EclipsePhaseAspectSheet } from "./item/aspect-sheet.js";
import { EclipsePhaseProgramSheet } from "./item/program-sheet.js";
import { EclipsePhaseSpecialSkillSheet } from "./item/specialskill-sheet.js";
import { EclipsePhaseKnowSkillSheet } from "./item/knowskill-sheet.js";
import { EclipsePhaseMorphTraitSheet } from "./item/morphtrait-sheet.js";
import { EclipsePhaseMorphFlawSheet } from "./item/morphflaw-sheet.js";
import { EclipsePhaseVehicleSheet } from "./item/vehicle-sheet.js";
import { eclipsephase } from "./config.js";

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
    name: "Always Reveal Stats",
    hint: 'Always show character details/stats to everyone with at least "limited" permissions. If deactivated, shows "limited"-sheet of an character for everyone who is not GM nor owner of given character',
    type: Boolean,
    default: false
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
    EclipsePhaseActor,
    EclipsePhaseItem,
    rollItemMacro
  };

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "1d6 + @initiative.value + @mods.iniMod",
    decimals: 0
  };

  // Define custom Entity classes
  CONFIG.Actor.documentClass = EclipsePhaseActor;
  CONFIG.Item.documentClass = EclipsePhaseItem;
  CONFIG.eclipsephase = eclipsephase;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("eclipsephase", EclipsePhaseActorSheet, {types: ["character"], makeDefault: true });
  Actors.registerSheet("eclipsephase", NpcSheet, {types: ["npc"], makeDefault: true });
  Actors.registerSheet("eclipsephase", GoonSheet, {types: ["goon"], makeDefault: true });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("eclipsephase", EclipsePhaseGearSheet, {types: ["gear"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseTraitSheet, {types: ["trait"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseFlawSheet, {types: ["flaw"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseMorphTraitSheet, {types: ["morphTrait"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseMorphFlawSheet, {types: ["morphFlaw"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseRangedWeaponSheet, {types: ["rangedWeapon"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseCloseCombatWeaponSheet, {types: ["ccWeapon"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseGrenadeSheet, {types: ["grenade"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseArmorSheet, {types: ["armor"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseWareSheet, {types: ["ware"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseAspectSheet, {types: ["aspect"], makeDefault: true});
  Items.registerSheet("eclipsephase", EclipsePhaseProgramSheet, {types: ["program"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseKnowSkillSheet, {types: ["knowSkill"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseSpecialSkillSheet, {types: ["specialSkill"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseVehicleSheet, {types: ["vehicle"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseDrugSheet, {types: ["drug"], makeDefault: true });
  
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
    "systems/eclipsephase/templates/actor/partials/npcskills.html",
    "systems/eclipsephase/templates/actor/partials/psi.html",
    "systems/eclipsephase/templates/actor/partials/headerblock.html",
    "systems/eclipsephase/templates/actor/partials/effectsTab.html"
  ];
  loadTemplates(templates);
  Handlebars.registerHelper('toLowerCase', function(str) {
    return str.toLowerCase();
  });

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