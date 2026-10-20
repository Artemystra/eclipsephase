import { RollCheck, TASK_RESULT, rollToChat, DEFAULT_ROLL } from "../rolls/dice.js";
import { gmList } from "./general-sheet-functions.js";
import { postDrugCard, DOSE_CARD, applyDose } from "./doses.js";

// Defensive ware against drugs and toxins (Core p.322-323, 330; Character Options p.130). Toxin
// filters - and digestive symbiotes, for oral doses - let a SOM Check ignore a biochem substance and
// add +30 to any check it calls for; they or medichines halve its effects and duration, both
// together nullify it. Nanophages do the same for one nano dose per 8 hours. Immunizers make the
// actor immune to a biochem substance once they beat it. A toxin is always filtered, a drug taken
// willingly only when its taker asks.

const HITS = [TASK_RESULT.SUCCESS, TASK_RESULT.SUCCESS_ONE, TASK_RESULT.SUCCESS_TWO, TASK_RESULT.CRITICAL_SUCCESS, TASK_RESULT.AUTOSUCCESS];
const SECONDS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
const UNITS_LARGEST_FIRST = ["days", "hours", "minutes", "seconds"];
const NANOPHAGE_PERIOD = 8 * 3600;
export const FILTER_CHECK_BONUS = 30;
export const IMMUNIZER_TARGET = 60;
const IMMUNIZER_KEY = "system.additionalSystems.immunizers";
export const WARE = {
  toxinFilters: "ep2e.chat.dose.ware.toxinFilters",
  medichines: "ep2e.chat.dose.ware.medichines",
  nanophages: "ep2e.chat.dose.ware.nanophages",
  digestiveSymbiotes: "ep2e.chat.dose.ware.digestiveSymbiotes",
  immunizers: "ep2e.chat.dose.ware.immunizers"
};

/**
 * The defensive ware working in the body the actor acts through, as their effects report it.
 * @param {Actor} actor - The actor
 * @returns {Object} toxinFilters, medichines, nanophages, digestiveSymbiotes and immunizers, each true or false
 */
export function defensiveWare(actor) {
  const systems = actor?.system?.additionalSystems ?? {};
  return {
    toxinFilters: systems.toxinFilters === true,
    medichines: systems.healing?.medichines === true,
    nanophages: systems.nanophages === true,
    digestiveSymbiotes: systems.digestiveSymbiotes === true,
    immunizers: systems.immunizers === true
  };
}

/**
 * The immunizers working in the body the actor acts through: ware whose immunizer effect applies
 * right now. Ware in another body, or taken out, does not count.
 * @param {Actor} actor - The actor
 * @returns {Item[]} The immunizer ware items
 */
export function workingImmunizers(actor) {
  return Array.from(actor?.items ?? []).filter(item => item.type === "ware" && Array.from(item.effects ?? []).some(effect =>
    !effect.disabled && effect.active !== false && (effect.changes ?? []).some(change => change.key === IMMUNIZER_KEY)));
}

/**
 * The drugs and toxins an immunizer has learned, kept on the ware itself.
 * @param {Item} item - The immunizer ware
 * @returns {String[]} Drug names
 */
export function learnedBy(item) {
  const list = item?.getFlag?.("eclipsephase", "immunities");
  return Array.isArray(list) ? list : [];
}

/**
 * The drugs and toxins the actor is immune to right now: what the immunizers working in their body
 * have learned. The immunity goes with the ware - out of the body, it protects no one.
 * @param {Actor} actor - The actor
 * @returns {String[]} Drug names
 */
export function immunities(actor) {
  return [...new Set(workingImmunizers(actor).flatMap(learnedBy))];
}

/**
 * Whether the actor's nanophages are still busy with a dose from the last 8 hours - they only
 * take on one nano dose per 8-hour period.
 * @param {Actor} actor - The actor
 * @param {Number} [now] - The world time
 * @returns {Boolean} True while they are busy
 */
export function nanophagesBusy(actor, now = game.time.worldTime) {
  const last = Number(actor?.getFlag?.("eclipsephase", "nanophagesUsedAt"));
  return Number.isFinite(last) && now - last < NANOPHAGE_PERIOD;
}

/**
 * What the actor's defensive ware does to one dose. A biochem substance meets toxin filters - or
 * digestive symbiotes, for one taken orally - and medichines; a nano one meets nanophages, unless
 * they took on another dose in the last 8 hours. A substance the immunizers made the actor immune
 * to does nothing at all.
 * @param {Actor} actor - The actor
 * @param {Object} dose - The dose flag: name, drugType and vector
 * @returns {Object} halve, nullify, filterCheck (the SOM Check that keeps it out), checkBonus
 *   (+30 on the dose's own check), immune, by (localization keys of the ware at work) and filterBy
 *   (the ware making the SOM Check)
 */
export function doseDefense(actor, dose = {}) {
  const ware = defensiveWare(actor);
  const none = { halve: false, nullify: false, filterCheck: false, checkBonus: false, immune: false, by: [], filterBy: [] };
  if (dose.drugType === "biochem") {
    if (immunities(actor).includes(dose.name)) return { ...none, nullify: true, immune: true, by: [WARE.immunizers] };
    const filter = ware.toxinFilters ? WARE.toxinFilters : (ware.digestiveSymbiotes && dose.vector === "oral" ? WARE.digestiveSymbiotes : null);
    const by = [filter, ware.medichines && WARE.medichines].filter(Boolean);
    const nullify = !!filter && ware.medichines;
    return { ...none, halve: by.length === 1, nullify, filterCheck: !!filter && !nullify, checkBonus: !!filter, by, filterBy: filter ? [filter] : [] };
  }
  if (dose.drugType === "nano" && ware.nanophages && !nanophagesBusy(actor)) {
    return { ...none, halve: true, filterCheck: true, by: [WARE.nanophages], filterBy: [WARE.nanophages] };
  }
  return none;
}

/**
 * Whether defensive ware does anything to this substance.
 * @param {Object} defense - What doseDefense reported
 * @returns {Boolean} True when it halves, nullifies or offers a check
 */
export function defenseApplies(defense) {
  return !!(defense?.halve || defense?.nullify || defense?.filterCheck);
}

/**
 * Half of a number, rounded up in size, so nothing vanishes by being halved: +1 stays +1, -20 is
 * -10, 17 is 9.
 * @param {Number} value - The number
 * @returns {Number} Its half
 */
export function halveUp(value) {
  const number = Number(value) || 0;
  return Math.sign(number) * Math.ceil(Math.abs(number) / 2);
}

/**
 * Half of a duration, in the largest unit that holds it exactly: an hour halves to 30 minutes, a
 * day to 12 hours. Rounds stay rounds, rounded up.
 * @param {Object} duration - {value, units}, as a dose carries it
 * @returns {Object} The halved duration; one without a value is left as it is
 */
export function halvedDuration(duration = {}) {
  const value = Number(duration.value);
  if (!Number.isFinite(value) || value <= 0) return { ...duration };
  if (!SECONDS[duration.units]) return { ...duration, value: Math.ceil(value / 2) };
  const seconds = Math.ceil((value * SECONDS[duration.units]) / 2);
  const units = UNITS_LARGEST_FIRST.find(unit => seconds % SECONDS[unit] === 0);
  return { ...duration, value: seconds / SECONDS[units], units };
}

/**
 * A change's value halved when it is a number; a switch or a key is left alone.
 * @param {*} value - The change's value
 * @returns {*} The halved value
 */
function halvedChangeValue(value) {
  if (typeof value === "number") return halveUp(value);
  if (typeof value !== "string" || !/^[+-]?\d+(\.\d+)?$/.test(value.trim())) return value;
  const half = halveUp(Number(value));
  return value.trim().startsWith("+") && half > 0 ? `+${half}` : String(half);
}

/**
 * A dose's effect data with defensive ware at work: duration, modifiers, roll options and a
 * growing modifier halved, and the dose marked halved so its damage and stress are too.
 * @param {Object} data - The dose's effect data
 * @param {Object} defense - What doseDefense reported
 * @returns {Object} The defended data, a copy
 */
export function defendedDoseData(data, defense) {
  const defended = foundry.utils.deepClone(data);
  if (!defense?.halve) return defended;
  const dose = defended.flags.eclipsephase.dose;
  defended.duration = { ...halvedDuration(defended.duration), expiry: defended.duration?.expiry ?? null };
  const changes = (defended.system?.changes ?? defended.changes ?? []).map(change => ({ ...change, value: halvedChangeValue(change.value) }));
  defended.changes = changes;
  defended.system = { ...(defended.system ?? {}), changes };
  dose.rollOptions = (dose.rollOptions ?? []).map(option => ({ ...option, value: halveUp(option.value) }));
  if (dose.overTime) dose.overTime = { ...dose.overTime, modifier: halveUp(dose.overTime.modifier) };
  dose.defense = { halved: true, by: defense.by, checkBonus: defense.checkBonus };
  return defended;
}

/**
 * A roll formula halved, rounded up, as the dice tray rolls it: the dice stay visible.
 * @param {String} formula - The formula
 * @param {Object} dose - The dose flag
 * @returns {String} The formula, halved when the dose is
 */
export function defendedFormula(formula, dose) {
  return dose?.defense?.halved && formula ? `ceil((${formula}) / 2)` : formula;
}

/**
 * The names of the ware at work, for a card.
 * @param {Object} defense - What doseDefense reported, or a dose's defense flag
 * @returns {String} e.g. "Toxin Filters and Medichines"
 */
export function wareNames(defense) {
  const names = (defense?.by ?? []).map(key => game.i18n.localize(key));
  return names.length > 1 ? game.i18n.format("ep2e.chat.dose.ware.both", { first: names[0], second: names[1] }) : names[0] ?? "";
}

/**
 * Posts the card offering the filters' SOM Check, for the actor's owners. The dose waits on the
 * card: it takes hold only if the check fails.
 * @param {Actor} actor - The actor
 * @param {Object} data - The dose's effect data, already halved
 * @param {Object} defense - What doseDefense reported
 * @param {Boolean} wanted - Whether the actor's defences act on it, immunizers included
 * @returns {Promise<ChatMessage>} The card
 */
export async function postFilterCheckCard(actor, data, defense, wanted = true) {
  const name = data.flags.eclipsephase.dose.name;
  const ware = wareNames({ by: defense?.filterBy ?? [] });
  const card = {
    icon: "fa-shield-virus",
    color: "--negative",
    headline: game.i18n.format("ep2e.chat.dose.filterCheckNeeded", { name, ware })
  };
  const whisper = game.users.filter(user => user.isGM || actor.testUserPermission?.(user, "OWNER")).map(user => user.id);
  return postDrugCard(actor, {
    ...card,
    button: { action: "rollFilterCheck", label: game.i18n.format("ep2e.chat.dose.rollFilterCheck", { ware }) },
    actorUuid: actor.uuid
  }, { eclipsephase: { doseFilter: { actorUuid: actor.uuid, name, card, ware, data, wanted } } }, whisper);
}

/**
 * Turns a filter card into a record once its check is rolled. Done where the card may be changed;
 * anyone else asks the active GM.
 * @param {ChatMessage} message - The filter card
 * @returns {Promise<void>} Resolves once marked or asked
 */
export async function markFilterCardRolled(message) {
  const request = message?.getFlag?.("eclipsephase", "doseFilter");
  if (!request) return;
  if (!message.isOwner && !game.user.isGM) {
    if (game.users.activeGM) game.socket.emit("system.eclipsephase", { action: "markFilterRolled", messageId: message.id });
    return;
  }
  const content = await foundry.applications.handlebars.renderTemplate(DOSE_CARD, { ...request.card, footnote: game.i18n.localize("ep2e.chat.dose.checkRolled") });
  await message.update({ content, "flags.eclipsephase.doseFilter.rolled": true });
}

/**
 * Rolls the filters' SOM Check from its card, once. The dose waiting on the card rides along with
 * the roll, so its outcome can let the dose in - or take it out again after a pool spend.
 * @param {String} messageId - The filter card
 * @param {Object} [systemOptions] - Passed on to RollCheck; tests answer the dialog through it
 * @returns {Promise<*>} Whatever the roll returned, or null when nothing was rolled
 */
export async function requestFilterCheck(messageId, systemOptions = {}) {
  const message = game.messages.get(messageId);
  const request = message?.getFlag?.("eclipsephase", "doseFilter");
  if (!request || request.rolled) return null;
  const actor = await fromUuid(request.actorUuid);
  if (!actor) return null;

  await markFilterCardRolled(message);
  const dataset = {
    type: "skill",
    name: game.i18n.localize(actor.system.aptitudes?.som?.name ?? "SOM"),
    key: "system.aptitudes.som.value",
    apttype: "som",
    rollvalue: actor.system.aptitudes?.som?.roll ?? 0,
    contextFlags: { doseFilter: { actorUuid: actor.uuid, cardId: messageId, name: request.name, ware: request.ware, data: request.data, wanted: request.wanted } }
  };
  return RollCheck(dataset, actor.system, actor, systemOptions, null, "skill");
}

/**
 * The dose a failed filter check let in, if it is still running.
 * @param {Actor} actor - The actor
 * @param {String} cardId - The filter card
 * @returns {ActiveEffect|null} The dose
 */
function doseLetInBy(actor, cardId) {
  return Array.from(actor?.effects ?? []).find(effect => effect.getFlag?.("eclipsephase", "dose")?.filterCard === cardId) ?? null;
}

/**
 * Lets the dose in after a failed filter check: halved, as the card prepared it.
 * @param {Object} filter - The doseFilter the roll carried
 * @returns {Promise<ActiveEffect|null>} The dose, or null when it was already let in
 */
export async function letInPastFilter(filter) {
  const actor = filter ? await fromUuid(filter.actorUuid) : null;
  if (!actor || doseLetInBy(actor, filter.cardId)) return null;
  const data = foundry.utils.deepClone(filter.data);
  data.flags.eclipsephase.dose.filterCard = filter.cardId;
  const { effect } = await applyDose(actor, data, filter.wanted);
  return effect;
}

/**
 * Keeps a dose out after a passed filter check. A dose a failed check already let in - a pool spend
 * turned it around - is taken off again, its own check card with it.
 * @param {Object} filter - The doseFilter the roll carried
 * @returns {Promise<Boolean>} True once the card saying so is posted
 */
export async function filterOut(filter) {
  const actor = filter ? await fromUuid(filter.actorUuid) : null;
  if (!actor) return false;
  const effect = doseLetInBy(actor, filter.cardId);
  if (effect) {
    const checkCards = game.messages.filter(message => message.getFlag?.("eclipsephase", "doseCheck")?.effectId === effect.id && message.isOwner);
    for (const card of checkCards) await card.delete();
    await effect.update({ "flags.eclipsephase.dose.filteredOut": true });
    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  }
  await postDrugCard(actor, { icon: "fa-shield-virus", color: "--positive", headline: game.i18n.format("ep2e.chat.dose.filteredOut", { name: filter.name, ware: filter.ware ?? "" }) });
  return true;
}

/**
 * Rolls the immunizers' Medicine: Pharmacology 60 Test against a biochem substance that took hold
 * - the nanobots' own test, so no pool and none of the actor's modifiers. A success makes the
 * actor immune to it from now on.
 * @param {Actor} actor - The actor
 * @param {Object} dose - The dose flag
 * @returns {Promise<Boolean|null>} Whether it succeeded, or null when nothing was rolled
 */
export async function rollImmunizers(actor, dose) {
  if (dose?.drugType !== "biochem" || !workingImmunizers(actor).length || immunities(actor).includes(dose.name)) return null;
  const roll = await new Roll("1d100").evaluate();
  const value = roll.total % 100;
  const success = value <= IMMUNIZER_TARGET;
  const message = {
    mainMessage: game.i18n.format("ep2e.chat.dose.immunizerTest", { name: dose.name, target: IMMUNIZER_TARGET }),
    focusMessage: game.i18n.localize(success ? "ep2e.chat.dose.immunizerSuccess" : "ep2e.chat.dose.immunizerFailure"),
    rollTitle: "ep2e.roll.announce.total"
  };
  await rollToChat(null, message, DEFAULT_ROLL, roll, actor.name, actor.type === "character" ? null : gmList(), false, "rollOutput");
  if (success) await becomeImmune({ actorUuid: actor.uuid, name: dose.name });
  return success;
}

/**
 * Writes a drug the immunizers beat into the immunizer ware working in the actor's body.
 * @param {Object} immunizer - actorUuid and the drug's name
 * @returns {Promise<Boolean>} True when the immunity is new
 */
export async function becomeImmune(immunizer) {
  const actor = immunizer ? await fromUuid(immunizer.actorUuid) : null;
  const ware = workingImmunizers(actor)[0];
  if (!ware || immunities(actor).includes(immunizer.name)) return false;
  await ware.setFlag("eclipsephase", "immunities", [...learnedBy(ware), immunizer.name]);
  await postDrugCard(actor, { icon: "fa-shield-virus", color: "--positive", headline: game.i18n.format("ep2e.chat.dose.becameImmune", { name: immunizer.name }) });
  return true;
}

/**
 * Hangs the toxin filters on the roll pipeline: a passed SOM Check ends the dose, so does a pool
 * spend that turns it into a pass; a check the dose itself calls for gets the filters' +30.
 * @returns {void}
 */
export function registerDefenseHooks() {
  Hooks.on("eclipsephase.preRoll", context => {
    if (!context?.flags?.doseCheck?.filterBonus) return;
    context.modifiers.push({ text: game.i18n.localize(WARE.toxinFilters), value: FILTER_CHECK_BONUS });
  });
  Hooks.on("eclipsephase.postRoll", async context => {
    const filter = context?.flags?.doseFilter;
    if (!filter) return;
    if (HITS.includes(context.outputData?.alternatives?.originalResult)) await filterOut(filter);
    else await letInPastFilter(filter);
  });
  Hooks.on("eclipsephase.poolResult", async ({ context, newResult }) => {
    if (context?.doseFilter && HITS.includes(newResult)) await filterOut(context.doseFilter);
  });
}
