import { registerSocketActions, relayToActiveGM } from "./socket.js";

// A chat card that changes after it was posted - a check rolled, a dose claimed, a defence noted, a
// pool point spent - keeps what it shows in its flags under one key and is drawn again from that.
// Each kind of card registers how it is drawn and which changes it knows; every change goes
// through updateCard, which writes the new content and the new state together, one change per
// card at a time, and hands the change to the active GM when the user may not edit the card.

const CARD_TYPES = new Map();
const QUEUES = new Map();

/**
 * Runs work for one key after the work queued for that key before it, so changes to the same
 * card never overlap. Work that fails does not hold up what comes after it.
 * @param {String} key - What the work is about, e.g. a message id
 * @param {Function} work - async () => result
 * @returns {Promise<*>} What the work returned
 */
export function inOrder(key, work) {
  const done = (QUEUES.get(key) ?? Promise.resolve()).then(work, work);
  QUEUES.set(key, done);
  done.finally(() => { if (QUEUES.get(key) === done) QUEUES.delete(key); }).catch(() => {});
  return done;
}

/**
 * Merges a change into a card's state.
 * @param {Object} state - The card's state
 * @param {Object} change - The fields to merge in
 * @returns {Object} The new state
 */
function merge(state, change) {
  return foundry.utils.mergeObject(state, change ?? {}, { inplace: false });
}

/**
 * A copy of a value that can be kept in a card's flags: documents become their id, uuid, name and
 * type, functions are dropped.
 * @param {*} value - The value
 * @param {Number} [depth] - How deep the copy has gone
 * @returns {*} The plain copy
 */
export function storable(value, depth = 0) {
  if (value === null || typeof value !== "object") return typeof value === "function" ? undefined : value;
  if (depth > 8) return undefined;
  if (value.documentName && typeof value.toObject === "function") return { id: value.id, uuid: value.uuid, name: value.name, type: value.type };
  if (Array.isArray(value)) return value.map(entry => storable(entry, depth + 1));
  const copy = {};
  for (const [key, entry] of Object.entries(value)) {
    const kept = storable(entry, depth + 1);
    if (kept !== undefined) copy[key] = kept;
  }
  return copy;
}

/**
 * Registers a kind of card.
 * @param {String} key - The flag the card keeps its state under
 * @param {Object} definition - render(state) returns the card's HTML; mutations maps a change's name
 *   to change(state, payload), which returns the new state ("merge" is always there)
 * @returns {void}
 */
export function registerCard(key, { render, mutations = {} }) {
  CARD_TYPES.set(key, { render, mutations: { merge, ...mutations } });
}

/**
 * Draws a card from a state, as it is posted or redrawn.
 * @param {String} key - The kind of card
 * @param {Object} state - Its state
 * @returns {Promise<String>} The card's HTML
 */
export function renderCard(key, state) {
  return CARD_TYPES.get(key).render(state);
}

/**
 * Changes a card: its state is changed as the named change describes, then the card is drawn
 * again from it. Changes to one card run one after another, each on the state the last one left,
 * so changes arriving together never overwrite each other. A user who may not edit the card sends
 * the change to the active GM instead.
 * @param {ChatMessage} message - The card
 * @param {String} key - The kind of card, the flag its state sits under
 * @param {String} [mutation] - The change's name, "merge" by default
 * @param {Object} [payload] - What the change needs
 * @param {Object} [options] - extra: further fields for the same message update, e.g. other flags
 * @returns {Promise<Boolean>} True once changed here, false when there was nothing to change or the
 *   change was sent on
 */
export function updateCard(message, key, mutation = "merge", payload = {}, { extra = {} } = {}) {
  const type = CARD_TYPES.get(key);
  if (!message || !type || message.getFlag?.("eclipsephase", key) === undefined) return Promise.resolve(false);
  if (!message.isOwner && !game.user.isGM) {
    relayToActiveGM("updateCard", { messageId: message.id, key, mutation, payload, extra }, { warn: false });
    return Promise.resolve(false);
  }

  const write = async () => {
    const state = foundry.utils.deepClone(message.getFlag("eclipsephase", key));
    const change = type.mutations[mutation] ?? merge;
    const next = change(state, payload);
    await message.update({ content: await type.render(next), [`flags.eclipsephase.${key}`]: next, ...extra });
    return true;
  };
  return inOrder(`write:${message.id}`, write);
}

/**
 * Registers the socket action the active GM changes cards under for users who may not.
 * @returns {void}
 */
export function registerCardSocket() {
  registerSocketActions({
    updateCard: payload => updateCard(game.messages.get(payload.messageId), payload.key, payload.mutation, payload.payload, { extra: payload.extra })
  });
}
