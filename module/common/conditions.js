import { registerRollBlock } from "../api/registry.js";
import { rollScope, GLOBAL_MOD_KEY, PHYSICAL_MOD_KEY, MENTAL_MOD_KEY } from "../rolls/modifiers.js";
import { timedEffectData } from "./general-sheet-functions.js";

// The conditions of Core p.226 as the token HUD's status effects, plus Dead and Invisible, which
// Foundry itself acts on. A condition set from the HUD is a temporary effect: it shows in the Time
// Panel and ends on the clock once given a duration. Its modifiers are the effect's changes, so they
// reach the rolls the way any effect's do; a modifier to one skill only is applied to its rolls. A
// condition with a note does something only some tests feel, which the sheet shows beside the sums.

const ICONS = "systems/eclipsephase/resources/icons/conditions";

export const CONDITION_KEY = "condition";

const INITIATIVE_MOD_KEY = "system.mods.iniMod";

export const CONDITIONS = [
  { id: "blinded", img: "icons/svg/blind.svg", changes: { [PHYSICAL_MOD_KEY]: -30 }, note: true },
  { id: "confused", img: "icons/svg/daze.svg" },
  { id: "dazed", img: "icons/svg/stoned.svg" },
  { id: "deafened", img: "icons/svg/deaf.svg", changes: { [INITIATIVE_MOD_KEY]: -3 }, skills: { perceive: -30 }, note: true },
  { id: "grappled", img: `${ICONS}/grappled.svg`, note: true },
  { id: "immobilized", img: "icons/svg/net.svg" },
  { id: "impaired10", img: `${ICONS}/impaired-10.svg`, group: "impaired", changes: { [GLOBAL_MOD_KEY]: -10 } },
  { id: "impaired20", img: `${ICONS}/impaired-20.svg`, group: "impaired", changes: { [GLOBAL_MOD_KEY]: -20 } },
  { id: "impaired30", img: `${ICONS}/impaired-30.svg`, group: "impaired", changes: { [GLOBAL_MOD_KEY]: -30 } },
  { id: "incapacitated", img: "icons/svg/paralysis.svg" },
  { id: "prone", img: "icons/svg/falling.svg", note: true },
  { id: "stunned", img: `${ICONS}/stunned.svg`, changes: { [PHYSICAL_MOD_KEY]: -30, [MENTAL_MOD_KEY]: -10 } },
  { id: "unconscious", img: "icons/svg/unconscious.svg" },
  { id: "dead", img: "icons/svg/skull.svg" },
  { id: "invisible", img: "icons/svg/invisible.svg" }
];

// Status ids drug conditions carried before the catalogue, read as the condition they stood for.
const LEGACY_STATUSES = { paralysis: "incapacitated", restrain: "immobilized" };

// The conditions under which no test can be made, the one under which only defence can, and the one
// under which no physical action can.
const NO_ACTIONS = ["incapacitated", "unconscious"];
const DEFENCE_ONLY = ["dazed"];
const NO_PHYSICAL = ["immobilized"];

/**
 * The catalogue entry of a condition.
 * @param {String} id - The condition id
 * @returns {Object|null} The entry
 */
export function conditionEntry(id) {
  return CONDITIONS.find(entry => entry.id === id) ?? null;
}

/**
 * The catalogue as Foundry's status effects, with the names and descriptions as lang keys.
 * @returns {Object[]} The status effects
 */
export function conditionStatusEffects() {
  return CONDITIONS.map(({ id, img, changes = {} }) => ({
    id,
    name: `ep2e.conditions.${id}.name`,
    img,
    description: `ep2e.conditions.${id}.description`,
    changes: Object.entries(changes).map(([key, value]) => ({ key, value: String(value), priority: null, type: "add" })),
    flags: { eclipsephase: { effectKey: CONDITION_KEY } }
  }));
}

/**
 * The conditions an actor is under, read from its active effects' statuses.
 * @param {Actor} actor - The actor
 * @returns {Set<String>} The condition ids
 */
export function activeConditions(actor) {
  const found = new Set();
  for (const status of actor?.statuses ?? []) {
    const id = LEGACY_STATUSES[status] ?? status;
    if (conditionEntry(id)) found.add(id);
  }
  return found;
}

/**
 * The other conditions of a condition's group, which it replaces - one Impaired level at a time.
 * @param {String} id - The condition id
 * @returns {String[]} The ids it replaces
 */
export function replacedConditions(id) {
  const group = conditionEntry(id)?.group;
  if (!group) return [];
  return CONDITIONS.filter(entry => entry.group === group && entry.id !== id).map(entry => entry.id);
}

/**
 * Why an actor's condition keeps it from a test. Incapacitated and Unconscious allow none, Dazed
 * only defence, Immobilized no physical action, Fray included (Core p.226). A check a card asks for,
 * such as a drug's, is no action and stays open.
 * @param {Actor} actor - The actor
 * @param {String} key - The roll key, lower case
 * @param {Object} [context] - defence: the roll answers an attack; check: a card asked for it;
 *   scope: "body" for a physical action
 * @returns {String|null} The reason, or null when the test is free
 */
export function conditionBlockReason(actor, key, { defence = false, check = false, scope = null } = {}) {
  if (check) return null;
  const conditions = activeConditions(actor);
  const stopping = NO_ACTIONS.find(id => conditions.has(id));
  if (stopping) return blockText(stopping, "ep2e.conditions.blocked");
  const defending = defence || key === "fray";
  const limiting = DEFENCE_ONLY.find(id => conditions.has(id));
  if (limiting && !defending) return blockText(limiting, "ep2e.conditions.blockedDefenceOnly");
  const holding = NO_PHYSICAL.find(id => conditions.has(id));
  if (holding && (scope === "body" || key === "fray")) return blockText(holding, "ep2e.conditions.blockedPhysical");
  return null;
}

/**
 * A refusal naming the condition.
 * @param {String} id - The condition id
 * @param {String} key - The refusal's lang key
 * @returns {String} The text
 */
function blockText(id, key) {
  return game.i18n.format(key, { condition: game.i18n.localize(`ep2e.conditions.${id}.name`) });
}

/**
 * What a roll's dataset says about where it comes from, for the roll blocks.
 * @param {Object} dataset - The roll's dataset
 * @param {String} [rolledFrom] - Where the roll comes from
 * @returns {Object} defence, check and scope
 */
export function rollBlockContext(dataset, rolledFrom) {
  const flags = dataset?.contextFlags ?? {};
  return { defence: !!flags.attackDefence, check: !!(flags.doseCheck || flags.strikeCheck), scope: rollScope(dataset, rolledFrom) };
}

/**
 * The conditions whose modifiers reach only some tests, for the sheet to show beside the sums: each
 * one's icon, whether the actor is under it, and what it does, e.g. "Deafened: -3 Initiative and -30
 * Perceive" - marked as not applied while the actor is not under it.
 * @param {Actor} actor - The actor
 * @returns {Object[]} id, img, active and text per condition
 */
export function conditionNotes(actor) {
  const active = activeConditions(actor);
  return CONDITIONS
    .filter(entry => entry.note)
    .map(({ id, img }) => {
      const name = game.i18n.localize(`ep2e.conditions.${id}.name`);
      return {
        id,
        img,
        active: active.has(id),
        text: game.i18n.format("ep2e.conditions.noteText", {
          name: active.has(id) ? name : game.i18n.format("ep2e.conditions.notApplied", { name }),
          note: game.i18n.localize(`ep2e.conditions.notes.${id}`)
        })
      };
    });
}

/**
 * Whether an actor is under a condition.
 * @param {Actor} actor - The actor
 * @param {String} id - The condition id
 * @returns {Boolean} True while it is
 */
export function isUnder(actor, id) {
  return activeConditions(actor).has(id);
}

/**
 * Whether every target an attack dialog picked is under a condition. The dialog names its targets
 * as actor uuids joined by commas; no target means no.
 * @param {Object} options - The dialog's values
 * @param {String} id - The condition id
 * @returns {Boolean} True when there are targets and all of them are under it
 */
export function targetsUnder(options, id) {
  const uuids = typeof options?.preTargets === "string" ? options.preTargets.split(",").filter(Boolean) : [];
  return uuids.length > 0 && uuids.every(uuid => isUnder(fromUuidSync(uuid), id));
}

/**
 * The modifiers an actor's conditions put on the tests of one skill - Deafened on Perceive.
 * @param {Actor} actor - The actor
 * @param {String} key - The roll key, lower case
 * @returns {Object[]} label and modifier per condition
 */
export function conditionSkillModifiers(actor, key) {
  const found = [];
  for (const id of activeConditions(actor)) {
    const modifier = conditionEntry(id)?.skills?.[key];
    if (modifier) found.push({ label: game.i18n.localize(`ep2e.conditions.${id}.name`), modifier });
  }
  return found;
}

/**
 * Removes the conditions a newly set one replaces.
 * @param {Actor} actor - The actor
 * @param {String} id - The condition just set
 * @returns {Promise<void>} Resolves once they are gone
 */
export async function removeReplacedConditions(actor, id) {
  const replaced = replacedConditions(id);
  if (!replaced.length) return;
  const effects = Array.from(actor.effects ?? []).filter(effect => Array.from(effect.statuses ?? []).some(status => replaced.includes(status)));
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
}

/**
 * A condition as an effect of its own, with the catalogue's modifiers: running for a span, or until
 * removed without one. Its icon always shows.
 * @param {String} id - The condition id
 * @param {Object} [options] - span ({value, units}) and flags kept on the effect
 * @returns {Object} The ActiveEffect data
 */
export function conditionEffectData(id, { span = null, flags = {} } = {}) {
  const entry = conditionEntry(id);
  const [status] = conditionStatusEffects().filter(effect => effect.id === id);
  return timedEffectData({
    name: game.i18n.localize(`ep2e.conditions.${id}.name`),
    img: entry.img,
    description: game.i18n.localize(`ep2e.conditions.${id}.description`),
    statuses: [id],
    changes: status.changes,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    span,
    flags: { effectKey: CONDITION_KEY, ...flags }
  });
}

/**
 * Puts a condition on an actor, in place of the others of its group.
 * @param {Actor} actor - The actor
 * @param {String} id - The condition id
 * @param {Object} [options] - span and flags, as conditionEffectData takes them
 * @returns {Promise<ActiveEffect[]>} The effect created
 */
export async function inflictCondition(actor, id, options = {}) {
  await removeReplacedConditions(actor, id);
  return actor.createEmbeddedDocuments("ActiveEffect", [conditionEffectData(id, options)]);
}

/**
 * Puts the catalogue into the token HUD, translates its descriptions once the languages are loaded
 * and registers the roll block. Blinded is Foundry's blind status: the token's own sight goes dark,
 * and what it perceives through meshed sensors is the sight shared with it (Core p.226).
 * @returns {void}
 */
export function registerConditions() {
  // Emptied and refilled rather than replaced: Foundry's list also finds an entry by its id.
  CONFIG.statusEffects.length = 0;
  for (const status of conditionStatusEffects()) CONFIG.statusEffects.push(status);
  CONFIG.specialStatusEffects.BLIND = "blinded";
  Hooks.once("i18nInit", () => {
    for (const status of CONFIG.statusEffects) status.description = game.i18n.localize(status.description);
  });
  registerRollBlock(conditionBlockReason);
}
