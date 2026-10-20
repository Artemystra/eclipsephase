import { RollCheck, TaskRollModifier, TASK_RESULT } from "../rolls/dice.js";
import { postDrugCard, DOSE_CARD } from "./doses.js";
import { parseAddictionMod } from "./drugs.js";
import { getBodyBindingInfo } from "./morp-functions.js";

// Addiction (Core p.330, trait p.76). Whether a character over-uses a drug is the GM's call, so the
// system only keeps count and puts the WIL Check one click away on every dose card, for the GM.
// A failed check acquires the Addiction (Level 1) trait for that drug - on the ego for a mental
// addiction, on the morph for a physical one. Withdrawal is left to the table.

const HITS = [TASK_RESULT.SUCCESS, TASK_RESULT.SUCCESS_ONE, TASK_RESULT.SUCCESS_TWO, TASK_RESULT.CRITICAL_SUCCESS, TASK_RESULT.AUTOSUCCESS];
const DAY = 86400;
const WEEK = 7 * DAY;
const TRAITS = "eclipsephase.traits";
const ADDICTION_I = "Addiction I";

/**
 * A drug's addiction as its sheet records it: the type and the modifier for the WIL Check.
 * @param {Object} system - The drug's system data
 * @returns {Object|null} type ("physical", "mental" or "both") and modifier, or null for a drug that is not addictive
 */
export function drugAddiction(system) {
  const type = system?.addictionType;
  if (!["physical", "mental", "both"].includes(type)) return null;
  const raw = system.addictionMod;
  const modifier = typeof raw === "number" ? raw : parseAddictionMod(raw) ?? 0;
  return { type, modifier };
}

/**
 * The times an actor took each drug in the last week, by drug name.
 * @param {Actor} actor - The actor
 * @returns {Object} Drug name to world times
 */
function doseLog(actor) {
  const log = actor?.getFlag?.("eclipsephase", "doseLog");
  return log && typeof log === "object" ? log : {};
}

/**
 * Notes that the actor took a dose of a drug now, forgetting what is older than a week.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {Number} [now] - The world time
 * @returns {Promise<void>} Resolves once noted
 */
export async function logDose(actor, name, now = game.time.worldTime) {
  if (!actor || !name) return;
  const log = Object.fromEntries(Object.entries(doseLog(actor))
    .map(([drug, times]) => [drug, (times ?? []).filter(time => now - time < WEEK)])
    .filter(([, times]) => times.length));
  log[name] = [...(log[name] ?? []), now];
  await actor.setFlag("eclipsephase", "doseLog", log);
}

/**
 * How often the actor took a drug in the last 24 hours and the last 7 days.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {Number} [now] - The world time
 * @returns {Object} day and week counts
 */
export function doseCounts(actor, name, now = game.time.worldTime) {
  const times = doseLog(actor)[name] ?? [];
  return { day: times.filter(time => now - time < DAY).length, week: times.filter(time => now - time < WEEK).length };
}

/**
 * The GM's controls a dose card carries for an addictive drug: the actor and the drug they took.
 * @param {Actor} actor - Who took it
 * @param {Object} dose - The dose flag
 * @returns {Object|null} What the card template needs, or null for a drug that is not addictive
 */
export function addictionControls(actor, dose) {
  return dose?.addiction ? { actorUuid: actor.uuid, name: dose.name } : null;
}

/**
 * Shows the GM how often the actor took the drug recently.
 * @param {String} actorUuid - The actor
 * @param {String} name - The drug's name
 * @returns {Promise<void>} Resolves once the dialog is closed
 */
export async function showDoseHistory(actorUuid, name) {
  const actor = await fromUuid(actorUuid);
  if (!actor) return;
  const { day, week } = doseCounts(actor, name);
  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("ep2e.dialog.doseHistory.header") },
    classes: ["ep2e-primary-right"],
    content: `<p>${game.i18n.format("ep2e.dialog.doseHistory.copy", { actor: actor.name, name, day, week })}</p>`,
    buttons: [{ action: "ok", label: game.i18n.localize("ep2e.actorSheet.button.confirm"), default: true, callback: () => ({ ok: true }) }],
    position: { width: 340 },
    modal: true,
    rejectClose: false
  });
}

/**
 * The drug's addiction, read from the dose the actor last took of it or from a pack they carry.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {Object} [fallback] - The addiction a card already knows
 * @returns {Object|null} type and modifier
 */
function knownAddiction(actor, name, fallback = null) {
  if (fallback) return fallback;
  const dose = Array.from(actor?.effects ?? []).map(effect => effect.getFlag?.("eclipsephase", "dose")).find(entry => entry?.name === name);
  if (dose?.addiction) return dose.addiction;
  const pack = Array.from(actor?.items ?? []).find(item => item.type === "drug" && item.name === name);
  return pack ? drugAddiction(pack.system) : null;
}

/**
 * The GM demands the WIL Check: a card for the actor's owners to roll it from.
 * @param {String} actorUuid - The actor
 * @param {String} name - The drug's name
 * @param {Object} [addiction] - type and modifier, when the caller knows them
 * @returns {Promise<ChatMessage|null>} The card, or null when the drug is not addictive
 */
export async function demandWillpower(actorUuid, name, addiction = null) {
  const actor = await fromUuid(actorUuid);
  const known = knownAddiction(actor, name, addiction);
  if (!actor || !known) return null;
  const card = {
    icon: "fa-brain",
    color: "--negative",
    headline: game.i18n.format("ep2e.chat.dose.addictionCheckNeeded", { name, modifier: signed(known.modifier) })
  };
  const whisper = game.users.filter(user => user.isGM || actor.testUserPermission?.(user, "OWNER")).map(user => user.id);
  return postDrugCard(actor, {
    ...card,
    button: { action: "rollAddictionCheck", label: game.i18n.format("ep2e.chat.dose.rollAddictionCheck", { modifier: signed(known.modifier) }) },
    actorUuid: actor.uuid
  }, { eclipsephase: { addictionCheck: { actorUuid: actor.uuid, name, ...known, card } } }, whisper);
}

/**
 * A modifier with its sign.
 * @param {Number} value - The modifier
 * @returns {String} e.g. "-20" or "+0"
 */
function signed(value) {
  const number = Number(value) || 0;
  return number < 0 ? String(number) : `+${number}`;
}

/**
 * Turns an addiction check card into a record once it is rolled. Done where the card may be
 * changed; a player rolling from the GM's card asks the active GM.
 * @param {ChatMessage} message - The card
 * @returns {Promise<void>} Resolves once marked or asked
 */
export async function markAddictionCardRolled(message) {
  const request = message?.getFlag?.("eclipsephase", "addictionCheck");
  if (!request) return;
  if (!message.isOwner && !game.user.isGM) {
    if (game.users.activeGM) game.socket.emit("system.eclipsephase", { action: "markAddictionRolled", messageId: message.id });
    return;
  }
  const content = await foundry.applications.handlebars.renderTemplate(DOSE_CARD, { ...request.card, footnote: game.i18n.localize("ep2e.chat.dose.checkRolled") });
  await message.update({ content, "flags.eclipsephase.addictionCheck.rolled": true });
}

/**
 * Rolls the WIL Check from its card, once; the card keeps a note instead of its button.
 * @param {String} messageId - The card
 * @param {Object} [systemOptions] - Passed on to RollCheck; tests answer the dialog through it
 * @returns {Promise<*>} Whatever the roll returned, or null when nothing was rolled
 */
export async function requestAddictionCheck(messageId, systemOptions = {}) {
  const message = game.messages.get(messageId);
  const request = message?.getFlag?.("eclipsephase", "addictionCheck");
  if (!request || request.rolled) return null;
  const actor = await fromUuid(request.actorUuid);
  if (!actor) return null;

  await markAddictionCardRolled(message);
  const dataset = {
    type: "skill",
    name: game.i18n.localize(actor.system.aptitudes?.wil?.name ?? "WIL"),
    key: "system.aptitudes.wil.value",
    apttype: "wil",
    rollvalue: actor.system.aptitudes?.wil?.roll ?? 0,
    contextFlags: { addictionCheck: { actorUuid: actor.uuid, name: request.name, type: request.type, modifier: request.modifier, checkId: messageId } }
  };
  return RollCheck(dataset, actor.system, actor, systemOptions, null, "skill");
}

/**
 * The addiction trait the actor has to this drug on the ego (mental) or on a body (physical), and
 * its level.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {String} kind - "mental" or "physical"
 * @returns {Object|null} item and level (1-3), or null when there is none
 */
export function addictionOf(actor, name, kind) {
  for (const item of actor?.items ?? []) {
    const match = item.type === "traits" && item.name.match(/^Addiction (I{1,3}) \((.+)\)$/);
    if (!match || match[2] !== name) continue;
    if ((kind === "mental") !== (item.system?.ego === true)) continue;
    return { item, level: match[1].length };
  }
  return null;
}

/**
 * Whether the actor already has an addiction to this drug, at any level.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @returns {Boolean} True when one is on the sheet
 */
export function addictedTo(actor, name) {
  return !!(addictionOf(actor, name, "mental") || addictionOf(actor, name, "physical"));
}

/**
 * The Addiction trait of one level for one drug, from the compendium: titled with the drug, on the
 * ego for a mental addiction, on the sleeved biomorph for a physical one.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {String} kind - "mental" or "physical"
 * @param {Number} level - 1 to 3
 * @param {String} checkId - The check that caused it
 * @returns {Promise<Object|null>} The trait data, or null when it cannot be placed
 */
async function addictionTrait(actor, name, kind, level, checkId) {
  const traitName = `Addiction ${"I".repeat(level)}`;
  const pack = game.packs.get(TRAITS);
  const entry = pack ? (await pack.getIndex()).find(item => item.name === traitName) : null;
  const document = entry ? await pack.getDocument(entry._id) : null;
  if (!document) return null;
  const data = document.toObject();
  delete data._id;
  delete data.folder;
  data.name = `${traitName} (${name})`;
  foundry.utils.setProperty(data, "flags.eclipsephase.addictionFrom", checkId);
  if (kind === "mental") {
    data.system.ego = true;
    data.system.morph = false;
    return data;
  }
  const { bodies, boundToFor } = getBodyBindingInfo(actor);
  const body = bodies.find(item => item.id === actor.system?.activeMorph);
  if (actor.type === "character" && body?.system?.type !== "bio") return null;
  data.system.ego = false;
  data.system.morph = true;
  data.system.boundTo = body ? boundToFor(body) : "activeMorph";
  return data;
}

/**
 * Gives the actor the addiction a failed check earned: Addiction I to start with, and one level
 * more each time after - the new level replacing the old - up to Addiction III. A drug that is
 * both mental and physical hooks ego and body each on its own.
 * @param {Object} check - The addictionCheck the roll carried
 * @returns {Promise<Item[]>} The traits added
 */
export async function becomeAddicted(check) {
  const actor = check ? await fromUuid(check.actorUuid) : null;
  if (!actor) return [];
  const kinds = check.type === "both" ? ["mental", "physical"] : [check.type];
  const incoming = [];
  const replaced = [];
  let level = 0;
  for (const kind of kinds) {
    const current = addictionOf(actor, check.name, kind);
    const next = (current?.level ?? 0) + 1;
    if (next > 3) continue;
    const data = await addictionTrait(actor, check.name, kind, next, check.checkId);
    if (!data) continue;
    if (current) {
      foundry.utils.setProperty(data, "flags.eclipsephase.addictionReplaced", current.item.toObject());
      replaced.push(current.item.id);
    }
    incoming.push(data);
    level = Math.max(level, next);
  }
  if (!incoming.length) return [];

  if (replaced.length) await actor.deleteEmbeddedDocuments("Item", replaced);
  const created = await actor.createEmbeddedDocuments("Item", incoming);
  const where = incoming.length > 1 ? "Both" : incoming[0].system.ego ? "Ego" : "Body";
  const key = level > 1 ? `ep2e.chat.dose.addictionRaised${where}` : `ep2e.chat.dose.addicted${where}`;
  await postDrugCard(actor, { icon: "fa-brain", color: "--negative", headline: game.i18n.format(key, { name: check.name, level: "I".repeat(level) }) });
  return created;
}

/**
 * Takes back an addiction a pool spend turned into a pass, bringing back the level it replaced.
 * @param {Object} check - The addictionCheck the roll carried
 * @returns {Promise<void>} Resolves once undone
 */
async function undoAddiction(check) {
  const actor = check ? await fromUuid(check.actorUuid) : null;
  const traits = Array.from(actor?.items ?? []).filter(item => item.getFlag?.("eclipsephase", "addictionFrom") === check.checkId);
  if (!traits.length) return;
  const restore = traits.map(item => item.getFlag("eclipsephase", "addictionReplaced")).filter(Boolean);
  await actor.deleteEmbeddedDocuments("Item", traits.map(item => item.id));
  if (restore.length) await actor.createEmbeddedDocuments("Item", restore.map(({ _id, ...data }) => data));
}

/**
 * Hangs the addiction check on the roll pipeline: the drug's addiction modifier lands on it, a
 * failure adds the trait, and a pool spend that turns it into a pass takes the trait back.
 * @returns {void}
 */
export function registerAddictionHooks() {
  Hooks.on("eclipsephase.preRoll", context => {
    const check = context?.flags?.addictionCheck;
    if (check?.modifier) context.modifiers.push(new TaskRollModifier(game.i18n.format("ep2e.chat.dose.addictionModifier", { name: check.name }), check.modifier));
  });
  Hooks.on("eclipsephase.postRoll", async context => {
    const check = context?.flags?.addictionCheck;
    if (check && !HITS.includes(context.outputData?.alternatives?.originalResult)) await becomeAddicted(check);
  });
  Hooks.on("eclipsephase.poolResult", async ({ context, newResult }) => {
    if (context?.addictionCheck && HITS.includes(newResult)) await undoAddiction(context.addictionCheck);
  });
}
