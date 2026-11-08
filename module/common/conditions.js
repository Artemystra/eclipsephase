import { registerRollBlock } from "../api/registry.js";

// The conditions of Core p.226 as the token HUD's status effects, plus Dead and Invisible, which
// Foundry itself acts on. A condition set from the HUD is a temporary effect: it shows in the Time
// Panel and ends on the clock once given a duration.

const ICONS = "systems/eclipsephase/resources/icons/conditions";

export const CONDITION_KEY = "condition";

export const CONDITIONS = [
  { id: "blinded", img: "icons/svg/blind.svg" },
  { id: "confused", img: "icons/svg/daze.svg" },
  { id: "dazed", img: "icons/svg/stoned.svg" },
  { id: "deafened", img: "icons/svg/deaf.svg" },
  { id: "grappled", img: `${ICONS}/grappled.svg` },
  { id: "immobilized", img: "icons/svg/net.svg" },
  { id: "impaired10", img: `${ICONS}/impaired-10.svg`, group: "impaired" },
  { id: "impaired20", img: `${ICONS}/impaired-20.svg`, group: "impaired" },
  { id: "impaired30", img: `${ICONS}/impaired-30.svg`, group: "impaired" },
  { id: "incapacitated", img: "icons/svg/paralysis.svg" },
  { id: "prone", img: "icons/svg/falling.svg" },
  { id: "stunned", img: `${ICONS}/stunned.svg` },
  { id: "unconscious", img: "icons/svg/unconscious.svg" },
  { id: "dead", img: "icons/svg/skull.svg" },
  { id: "invisible", img: "icons/svg/invisible.svg" }
];

// Status ids drug conditions carried before the catalogue, read as the condition they stood for.
const LEGACY_STATUSES = { paralysis: "incapacitated", restrain: "immobilized" };

// The conditions under which no test can be made, and the one under which only defence can.
const NO_ACTIONS = ["incapacitated", "unconscious"];
const DEFENCE_ONLY = ["dazed"];

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
  return CONDITIONS.map(({ id, img }) => ({
    id,
    name: `ep2e.conditions.${id}.name`,
    img,
    description: `ep2e.conditions.${id}.description`,
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
 * only defence (Core p.226). A check a card asks for, such as a drug's, is no action and stays open.
 * @param {Actor} actor - The actor
 * @param {String} key - The roll key, lower case
 * @param {Object} [context] - defence: the roll answers an attack; check: a card asked for it
 * @returns {String|null} The reason, or null when the test is free
 */
export function conditionBlockReason(actor, key, { defence = false, check = false } = {}) {
  if (check) return null;
  const conditions = activeConditions(actor);
  const stopping = NO_ACTIONS.find(id => conditions.has(id));
  if (stopping) return blockText(stopping, "ep2e.conditions.blocked");
  const defending = defence || key === "fray";
  const limiting = DEFENCE_ONLY.find(id => conditions.has(id));
  if (limiting && !defending) return blockText(limiting, "ep2e.conditions.blockedDefenceOnly");
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
 * @returns {Object} defence and check
 */
export function rollBlockContext(dataset) {
  const flags = dataset?.contextFlags ?? {};
  return { defence: !!flags.attackDefence, check: !!flags.doseCheck };
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
