// Import Modules
import { EclipsePhaseActor } from "./actor/actor.js";
import { EclipsePhaseActorSheet } from "./actor/actor-sheet.js";
import { NpcSheet } from "./actor/npcSheet.js";
import { GoonSheet } from "./actor/goonSheet.js";
import { EclipsePhaseItem } from "./item/item.js";
import { EclipsePhaseItemSheet } from "./item/item-sheet.js";
import { EclipsePhaseTraitSheet } from "./item/trait-sheet.js";
import { EclipsePhaseFlawSheet } from "./item/flaw-sheet.js";
import { eclipsephase } from "./config.js";

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
    formula: "1d6 + @initiative.value",
    decimals: 0
  };

  // Define custom Entity classes
  CONFIG.Actor.entityClass = EclipsePhaseActor;
  CONFIG.Item.entityClass = EclipsePhaseItem;
  CONFIG.eclipsephase = eclipsephase;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("eclipsephase", EclipsePhaseActorSheet, {types: ["character"], makeDefault: true });
  Actors.registerSheet("eclipsephase", NpcSheet, {types: ["npc"], makeDefault: true });
  Actors.registerSheet("eclipsephase", GoonSheet, {types: ["goon"], makeDefault: true });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("eclipsephase", EclipsePhaseItemSheet, {types: ["item"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseTraitSheet, {types: ["trait"], makeDefault: true });
  Items.registerSheet("eclipsephase", EclipsePhaseFlawSheet, {types: ["flaw"], makeDefault: true });



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

  Handlebars.registerHelper('toLowerCase', function(str) {
    return str.toLowerCase();
  });
});

Hooks.once("ready", async function() {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => createEclipsePhaseMacro(data, slot));
});

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