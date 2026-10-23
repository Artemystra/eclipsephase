import { RollCheck, isHit } from "./dice.js";
import { postCard, ownersAndGMs, CARD_TEMPLATE } from "../common/general-sheet-functions.js";
import { registerCard, updateCard, storable } from "../common/chat-cards.js";

// The cards a roll leaves in the chat and redraws as it goes on: the task card, check cards, and
// the state a damage card starts from.

// The card a task roll leaves in the chat. It keeps what it shows in its taskCard flag, so a pool
// spend and a target pick can redraw this one card instead of posting another: the pool controls
// give way to a note saying who spent what, and the result - on a swap the die as well - shows the
// new values. An attack also keeps its targets and how each one's defence went, and offers its
// damage once every defence is in.

export const TASK_RESULT_TEMPLATE = "systems/eclipsephase/templates/chat/task-result.html";

registerCard("taskCard", {
  render: state => foundry.applications.handlebars.renderTemplate(TASK_RESULT_TEMPLATE, taskCardView(state)),
  mutations: {
    poolSpent,
    targets: (state, { names, uuids = [] }) => ({ ...state, targets: uuids.map((uuid, index) => ({ uuid, name: names[index] ?? "", outcome: null })) }),
    defence: (state, { uuid, outcome, kind = "dodge" }) => ({ ...state, targets: (state.targets ?? []).map(target => target.uuid === uuid ? { ...target, outcome, kind } : target) }),
    damageOffered: state => ({ ...state, damageOffered: true })
  }
});

/**
 * The state a task card starts with: what it showed when it was rolled, nothing spent, no targets.
 * @param {Object} message - The data the card was drawn from
 * @returns {Object} The taskCard flag
 */
export function taskCardState(message) {
  const { chatMessage, sound, ...data } = message;
  return { data: storable(data), spent: null, targets: [] };
}

/**
 * The state a damage card starts with: what it showed when it was rolled, and no lines yet on what
 * the damage did.
 * @param {Object} message - The data the card was drawn from
 * @returns {Object} The damageCard flag
 */
export function damageCardState(message) {
  const { chatMessage, sound, ...data } = message;
  return { data: storable(data), lines: [] };
}

/**
 * The data a task card is drawn from: what it was rolled with, plus the note on a spent pool point
 * and the targets an attack was applied to.
 * @param {Object} state - The taskCard flag
 * @returns {Object} The template data
 */
export function taskCardView(state) {
  const view = { ...state.data };
  if (state.spent) view.poolSpent = game.i18n.format(`ep2e.chat.poolSpent.${state.spent.usageType}`, { name: state.spent.spender, pool: game.i18n.localize(state.spent.poolName) });
  if (state.targets?.length) view.targetNames = game.i18n.format("ep2e.chat.attack.targets", { names: state.targets.map(target => target.name).join(", ") });
  view.defended = (state.targets ?? []).some(target => target.outcome);
  return view;
}

/**
 * Whether an attack's damage is due: every target has defended, at least one was struck, and no
 * damage card was posted yet.
 * @param {Object} state - The taskCard flag
 * @returns {Boolean} True when the damage card is due
 */
export function damageReady(state) {
  const targets = state.targets ?? [];
  if (state.damageOffered || !targets.length || targets.some(target => !target.outcome)) return false;
  return targets.some(target => target.outcome !== "none");
}

/**
 * A pool point spent on the roll: the result becomes the new one, and a swap turns the die too.
 * @param {Object} state - The taskCard flag
 * @param {Object} spent - usageType ("swapped", "upgraded" or "mitigated"), poolName, spender, and
 *   the new value, result class and result text
 * @returns {Object} The new state
 */
function poolSpent(state, spent) {
  const data = { ...state.data, resultClass: spent.resultClass, resultText: spent.resultText };
  if (spent.usageType === "swapped" && Number.isFinite(spent.newValue)) {
    data.rollResult = spent.newValue;
    data.total = spent.newValue;
    const hundreds = { ...(data.diceBreakdown?.hundreds ?? {}) };
    const first = Object.keys(hundreds)[0];
    if (first !== undefined) hundreds[first] = { ...hundreds[first], result: spent.newValue };
    data.diceBreakdown = { ...(data.diceBreakdown ?? {}), hundreds };
  }
  return { ...state, data, spent };
}

/**
 * The result a roll card's buttons go by: the one a pool point turned it into, or the rolled one.
 * @param {Object} context - The roll context
 * @returns {Number} The result
 */
export function spentOrOriginalResult(context) {
  return context.alternatives?.spent && Number.isFinite(context.alternatives.result) ? context.alternatives.result : context.alternatives?.originalResult;
}

// A check asked for on a chat card: the card carries a button, the owner rolls from it - spending
// pool if they like - and once the roll lands the outcome is settled, then settled again should a
// pool spend turn it around. Drugs' checks on taking, toxin filters and addiction all run this way;
// each brings only what the check is for and what its outcome does. Modelled on pools.js, where a
// chat button likewise carries the roll on.

/**
 * Draws a check card: its button while the check waits, a note once it is rolled.
 * @param {Object} state - The card's state: card, button, actorUuid, rolled
 * @returns {Promise<String>} The card's HTML
 */
function renderCheckCard(state) {
  const data = state.rolled
    ? { ...state.card, footnote: game.i18n.localize("ep2e.chat.dose.checkRolled") }
    : { ...state.card, button: state.button, actorUuid: state.actorUuid };
  return foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, data);
}

/**
 * Registers a kind of check card, so it can be redrawn once rolled - on this client and on the GM's.
 * @param {String} key - The flag the card keeps its request under
 * @returns {void}
 */
export function registerCheckCard(key) {
  registerCard(key, { render: renderCheckCard });
}

/**
 * Posts a check card for the owners of an actor and every GM.
 * @param {Actor} actor - Who makes the check
 * @param {String} key - The flag the card keeps its request under
 * @param {Object} options - card ({icon, color, headline, rows}), button ({action, label}) and
 *   payload, what the check needs once rolled
 * @returns {Promise<ChatMessage>} The card
 */
export function postCheckCard(actor, key, { card, button, payload = {} }) {
  registerCheckCard(key);
  return postCard(actor, { ...card, button, actorUuid: actor.uuid },
    { eclipsephase: { [key]: { actorUuid: actor.uuid, card, button, rolled: false, ...payload } } }, ownersAndGMs(actor));
}

/**
 * Turns a check card into a record once it is rolled: the button gives way to a note.
 * @param {ChatMessage} message - The card
 * @param {String} key - The flag the card keeps its request under
 * @returns {Promise<Boolean>} What updateCard reported
 */
export function markCardRolled(message, key) {
  return updateCard(message, key, "merge", { rolled: true });
}

/**
 * Rolls an aptitude check through the roll pipeline, carrying what it is for on the roll.
 * @param {Actor} actor - Who rolls
 * @param {String} aptitude - The aptitude key, e.g. "wil"
 * @param {Object} contextFlags - What the roll carries to postRoll and to a later pool spend
 * @param {Object} [systemOptions] - Passed on to RollCheck; tests answer the dialog through it
 * @returns {Promise<*>} Whatever the roll returned
 */
export function rollAptitudeCheck(actor, aptitude, contextFlags, systemOptions = {}) {
  const dataset = {
    type: "skill",
    name: game.i18n.localize(actor.system.aptitudes?.[aptitude]?.name ?? aptitude.toUpperCase()),
    key: `system.aptitudes.${aptitude}.value`,
    apttype: aptitude,
    rollvalue: actor.system.aptitudes?.[aptitude]?.roll ?? 0,
    contextFlags
  };
  return RollCheck(dataset, actor.system, actor, systemOptions, null, "skill");
}

/**
 * Settles a check's outcome from the roll pipeline: once when the roll lands, and again when a
 * pool spend changes its result.
 * @param {String} key - The roll flag the check travels under
 * @param {Function} settle - settle(payload, passed, { byPool, message, context, result, value });
 *   message is the roll's chat card, result its result tier and value its die as it now stands
 * @returns {void}
 */
export function settleOnRoll(key, settle) {
  Hooks.on("eclipsephase.postRoll", async context => {
    const payload = context?.flags?.[key];
    if (!payload) return;
    const result = context.outputData?.alternatives?.originalResult;
    await settle(payload, isHit(result), { byPool: false, message: context.message, context, result, value: rolledValue(context.message, context.outputData?.rollResult) });
  });
  Hooks.on("eclipsephase.poolResult", async ({ context, newResult }) => {
    const payload = context?.[key];
    if (!payload) return;
    const message = game.messages.get(context.messageId);
    await settle(payload, isHit(newResult), { byPool: true, message, context, result: newResult, value: rolledValue(message, null) });
  });
}

/**
 * A roll card's die as it now stands - swapped, when a pool point swapped it.
 * @param {ChatMessage} message - The roll card
 * @param {Number|null} fallback - The die to use when the card keeps no state
 * @returns {Number|null} The die
 */
function rolledValue(message, fallback) {
  const value = Number(message?.getFlag?.("eclipsephase", "taskCard")?.data?.rollResult);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Adds a check's own modifiers to its roll.
 * @param {String} key - The roll flag the check travels under
 * @param {Function} modifiersOf - modifiersOf(payload) returning modifiers for RollCheck
 * @returns {void}
 */
export function modifiersOnRoll(key, modifiersOf) {
  Hooks.on("eclipsephase.preRoll", context => {
    const payload = context?.flags?.[key];
    if (payload) context.modifiers.push(...(modifiersOf(payload) ?? []).filter(Boolean));
  });
}
