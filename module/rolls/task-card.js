import { registerCard } from "../common/chat-cards.js";

// The card a task roll leaves in the chat. It keeps what it shows in its taskCard flag, so a pool
// spend and a target pick can redraw this one card instead of posting another: the pool controls
// give way to a note saying who spent what, and the result - on a swap the die as well - shows the
// new values.

export const TASK_RESULT_TEMPLATE = "systems/eclipsephase/templates/chat/task-result.html";

registerCard("taskCard", {
  render: state => foundry.applications.handlebars.renderTemplate(TASK_RESULT_TEMPLATE, taskCardView(state)),
  mutations: { poolSpent, targets: (state, { names }) => ({ ...state, targetNames: names }) }
});

/**
 * A copy of the card's data that can be stored in a flag: documents become their id, uuid, name
 * and type, functions are dropped.
 * @param {*} value - The value
 * @param {Number} [depth] - How deep the copy has gone
 * @returns {*} The plain copy
 */
function plain(value, depth = 0) {
  if (value === null || typeof value !== "object") return typeof value === "function" ? undefined : value;
  if (depth > 8) return undefined;
  if (value.documentName && typeof value.toObject === "function") return { id: value.id, uuid: value.uuid, name: value.name, type: value.type };
  if (Array.isArray(value)) return value.map(entry => plain(entry, depth + 1));
  const copy = {};
  for (const [key, entry] of Object.entries(value)) {
    const kept = plain(entry, depth + 1);
    if (kept !== undefined) copy[key] = kept;
  }
  return copy;
}

/**
 * The state a task card starts with: what it showed when it was rolled, nothing spent, no targets.
 * @param {Object} message - The data the card was drawn from
 * @returns {Object} The taskCard flag
 */
export function taskCardState(message) {
  const { chatMessage, sound, ...data } = message;
  return { data: plain(data), spent: null, targetNames: null };
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
  if (state.targetNames?.length) view.targetNames = game.i18n.format("ep2e.chat.attack.targets", { names: state.targetNames.join(", ") });
  return view;
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
