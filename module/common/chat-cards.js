import { registerSocketActions, relayToActiveGM } from "./socket.js";

// A chat card that changes after it was posted - a check rolled, a dose claimed, a defence noted, a
// pool point spent - keeps what it shows in its flags under one key and is drawn again from that.
// Each kind of card registers how it is drawn and which changes it knows; every change goes
// through updateCard, which writes the new content and the new state together, one change per
// card at a time, and hands the change to the active GM when the user may not edit the card.

const CARD_TYPES = new Map();
const WRITES = new Map();

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
  const done = (WRITES.get(message.id) ?? Promise.resolve()).then(write, write);
  WRITES.set(message.id, done);
  done.finally(() => { if (WRITES.get(message.id) === done) WRITES.delete(message.id); }).catch(() => {});
  return done;
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
