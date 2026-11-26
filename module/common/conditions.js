import { registerRollBlock } from "../api/registry.js";
import { rollScope, GLOBAL_MOD_KEY, PHYSICAL_MOD_KEY, MENTAL_MOD_KEY } from "../rolls/modifiers.js";
import { timedEffectData } from "./general-sheet-functions.js";
import { madeHere, registerSocketActions, relayToActiveGM } from "./socket.js";

// The conditions of Core p.226 as the token HUD's status effects, plus Dead and Invisible, which
// Foundry itself acts on. A condition set from the HUD is a temporary effect: it shows in the Time
// Panel and ends on the clock once given a duration. Its modifiers are the effect's changes, so they
// reach the rolls the way any effect's do; a modifier to one skill only is applied to its rolls. The
// sheet's condition bar shows the main ones beside the sums, with what each does.

const ICONS = "systems/eclipsephase/resources/icons/conditions";

export const CONDITION_KEY = "condition";

const INITIATIVE_MOD_KEY = "system.mods.iniMod";

export const CONDITIONS = [
  { id: "blinded", img: "icons/svg/blind.svg", changes: { [PHYSICAL_MOD_KEY]: -30 } },
  { id: "confused", img: "icons/svg/daze.svg" },
  { id: "dazed", img: "icons/svg/stoned.svg" },
  { id: "deafened", img: "icons/svg/deaf.svg", changes: { [INITIATIVE_MOD_KEY]: -3 }, skills: { perceive: -30 } },
  { id: "grappled", img: `${ICONS}/grappled.svg` },
  { id: "immobilized", img: "icons/svg/net.svg" },
  { id: "impaired10", img: `${ICONS}/impaired-10.svg`, group: "impaired", changes: { [GLOBAL_MOD_KEY]: -10 } },
  { id: "impaired20", img: `${ICONS}/impaired-20.svg`, group: "impaired", changes: { [GLOBAL_MOD_KEY]: -20 } },
  { id: "impaired30", img: `${ICONS}/impaired-30.svg`, group: "impaired", changes: { [GLOBAL_MOD_KEY]: -30 } },
  { id: "incapacitated", img: "icons/svg/paralysis.svg" },
  { id: "prone", img: "icons/svg/falling.svg" },
  { id: "stunned", img: "icons/svg/lightning.svg", changes: { [PHYSICAL_MOD_KEY]: -30, [MENTAL_MOD_KEY]: -10 } },
  { id: "unconscious", img: "icons/svg/unconscious.svg" },
  { id: "dead", img: "icons/svg/skull.svg", replaces: ["unconscious"] },
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
 * The conditions a condition replaces: the others of its group - one Impaired level at a time - and
 * those it names, as Dead does Unconscious.
 * @param {String} id - The condition id
 * @returns {String[]} The ids it replaces
 */
export function replacedConditions(id) {
  const entry = conditionEntry(id);
  const group = entry?.group;
  const others = group ? CONDITIONS.filter(other => other.group === group && other.id !== id).map(other => other.id) : [];
  return [...others, ...(entry?.replaces ?? [])];
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

// The sheet's condition bar, in order. A slot of several shows the one the actor is under, the
// first named first, and its idle image and text while under none.
const CONDITION_BAR = [
  { id: "blinded" }, { id: "deafened" }, { id: "grappled" }, { id: "prone" },
  { id: "unconsciousDead", members: ["dead", "unconscious"], idle: "unconscious" },
  { id: "incapacitated" }, { id: "immobilized" },
  { id: "impaired", members: ["impaired30", "impaired20", "impaired10"], idle: "impaired10" },
  { id: "dazed" }, { id: "stunned" }
];

/**
 * The sheet's condition bar: per slot its icon, whether the actor is under it, and what it does, e.g.
 * "Deafened: -3 Initiative and -30 Perceive" - marked as not applied while the actor is not under it.
 * @param {Actor} actor - The actor
 * @returns {Object[]} id, img, active and text per slot
 */
export function conditionNotes(actor) {
  const active = activeConditions(actor);
  return CONDITION_BAR.map(({ id, members = [id], idle = id }) => {
    const on = members.find(member => active.has(member));
    const name = game.i18n.localize(on || members.length === 1 ? `ep2e.conditions.${on ?? id}.name` : `ep2e.conditions.slotNames.${id}`);
    return {
      id,
      img: conditionEntry(on ?? idle).img,
      active: !!on,
      text: game.i18n.format("ep2e.conditions.noteText", {
        name: on ? name : game.i18n.format("ep2e.conditions.notApplied", { name }),
        note: game.i18n.localize(`ep2e.conditions.notes.${on ?? id}`)
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
 * Removes the conditions a newly set one replaces: the others of its group, and the same condition
 * set before, so each is on only once. A sleight's or drug's own effect bringing it stays.
 * @param {Actor} actor - The actor
 * @param {String} id - The condition just set
 * @param {String} [keepId] - The effect just created for it, when it is already on
 * @returns {Promise<void>} Resolves once they are gone
 */
export async function removeReplacedConditions(actor, id, keepId = null) {
  const replaced = replacedConditions(id);
  const effects = Array.from(actor.effects ?? []).filter(effect => {
    if (effect.id === keepId) return false;
    const statuses = Array.from(effect.statuses ?? []);
    if (statuses.some(status => replaced.includes(status))) return true;
    return statuses.includes(id) && effect.flags?.eclipsephase?.effectKey === CONDITION_KEY;
  });
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
 * Puts a condition on an actor, in place of the others of its group and of the same condition set
 * before. On an actor this client may not change, the active GM puts it on.
 * @param {Actor} actor - The actor
 * @param {String} id - The condition id
 * @param {Object} [options] - span and flags, as conditionEffectData takes them
 * @returns {Promise<ActiveEffect[]>} The effect created, none when the GM was asked
 */
export async function inflictCondition(actor, id, options = {}) {
  if (!actor.isOwner) return inflictConditions(actor, [{ id, options }]);
  await removeReplacedConditions(actor, id);
  return actor.createEmbeddedDocuments("ActiveEffect", [conditionEffectData(id, options)]);
}

/**
 * Puts several conditions on an actor, one after the other. On an actor this client may not change,
 * the active GM puts them all on, in the same order, from one request.
 * @param {Actor} actor - The actor
 * @param {Object[]} conditions - id and options per condition, as inflictCondition takes them
 * @returns {Promise<ActiveEffect[]>} The effects created, none when the GM was asked
 */
export async function inflictConditions(actor, conditions) {
  if (!actor.isOwner) {
    relayToActiveGM("inflictConditions", { actorUuid: actor.uuid, conditions });
    return [];
  }
  const created = [];
  for (const { id, options } of conditions) created.push(...await inflictCondition(actor, id, options));
  return created;
}

/**
 * Lets the active GM put on conditions for a client that may not change the actor.
 * @returns {void}
 */
export function registerConditionSocket() {
  registerSocketActions({
    inflictConditions: async ({ actorUuid, conditions }) => {
      const actor = await fromUuid(actorUuid);
      if (actor) await inflictConditions(actor, conditions ?? []);
    }
  });
}

// The conditions of the body rather than the ego: they stay with a body the ego leaves and are back
// when it returns, like its damage. Confused and Dazed are the ego's and go along.
export const BODY_CONDITIONS = ["blinded", "deafened", "grappled", "immobilized", "incapacitated", "prone", "stunned",
  "unconscious", "dead", "impaired10", "impaired20", "impaired30", "invisible"];

// Marks the effects of a change of body, which the hooks reacting to new conditions leave alone.
export const BODY_SWAP = "eclipsephaseBodySwap";

/**
 * Takes the body's conditions off the actor and keeps them on the body the ego leaves.
 * @param {Actor} actor - The actor
 * @param {Item} body - The morph or vehicle left
 * @returns {Promise<void>} Resolves once they are kept
 */
export async function setAsideBodyConditions(actor, body) {
  if (!body) return;
  const effects = Array.from(actor.effects ?? []).filter(effect => effect.flags?.eclipsephase?.effectKey === CONDITION_KEY
    && Array.from(effect.statuses ?? []).some(status => BODY_CONDITIONS.includes(status)));
  if (!effects.length) return;
  await body.setFlag("eclipsephase", "bodyConditions", effects.map(effect => {
    const data = effect.toObject();
    delete data._id;
    return data;
  }));
  await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
}

/**
 * Puts the conditions a body kept back on the actor, as the ego enters it.
 * @param {Actor} actor - The actor
 * @param {Item} body - The morph or vehicle entered
 * @returns {Promise<void>} Resolves once they are on
 */
export async function bringBackBodyConditions(actor, body) {
  const kept = body?.getFlag("eclipsephase", "bodyConditions");
  if (!kept) return;
  await body.unsetFlag("eclipsephase", "bodyConditions");
  if (kept.length) await actor.createEmbeddedDocuments("ActiveEffect", kept, { [BODY_SWAP]: true });
}

// Marks the conditions the damage itself put on.
const FROM_DAMAGE = "fromDamage";

/**
 * Puts on the conditions the damage brings: Incapacitated once it reaches Durability, gone again
 * once healed below unless it came from elsewhere, and Dead once it reaches the Death Rating, which
 * only the GM takes off.
 * @param {Actor} actor - The actor
 * @returns {Promise<void>} Resolves once they are set
 */
export async function syncDamageConditions(actor) {
  const durability = Number(actor?.system?.health?.physical?.max) || 0;
  if (durability <= 0) return;
  const damage = Number(actor.system.health.physical.value) || 0;
  const deathRating = Number(actor.system.physical?.dr) || 0;
  const conditions = activeConditions(actor);

  if (damage >= durability) {
    if (!conditions.has("incapacitated")) await inflictCondition(actor, "incapacitated", { flags: { [FROM_DAMAGE]: true } });
  }
  else {
    const healed = Array.from(actor.effects ?? []).filter(effect =>
      effect.flags?.eclipsephase?.[FROM_DAMAGE] && Array.from(effect.statuses ?? []).includes("incapacitated"));
    if (healed.length) await actor.deleteEmbeddedDocuments("ActiveEffect", healed.map(effect => effect.id));
  }

  if (deathRating > 0 && damage >= deathRating && !conditions.has("dead")) {
    await inflictCondition(actor, "dead", { flags: { [FROM_DAMAGE]: true } });
  }
}

/**
 * Lets the client that changed an actor's damage, or the body it acts in, set the conditions it brings.
 * @returns {void}
 */
export function registerDamageConditions() {
  Hooks.on("updateActor", (actor, changed, options, userId) => {
    if (!madeHere(userId, options)) return;
    const touched = ["system.health.physical.value", "system.activeMorph", "system.activeJam"].some(path => foundry.utils.hasProperty(changed, path));
    if (touched) syncDamageConditions(actor);
  });
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
