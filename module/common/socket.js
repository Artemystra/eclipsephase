// The system's socket: one channel, and the active GM's client acting on what the others may not do
// themselves. Kept free of imports, so any module can use it without pulling in the sheet code.

export const SYSTEM_SOCKET = "system.eclipsephase";
const NO_GM_KEY = "ep2e.actorSheet.warnings.doseNeedsGM";

/**
 * Whether this client is the active GM - the one client that acts on what the others ask for.
 * @returns {Boolean} True on the active GM's client
 */
export function isActiveGM() {
  return !!game.user.isGM && game.users.activeGM?.id === game.user.id;
}

/**
 * Listens on the system's socket for a set of actions. Each payload names its action; the handler
 * of that name runs - by default only on the active GM's client, so one client answers.
 * @param {Object} handlers - Action name to handler(payload)
 * @param {Object} [options] - gmOnly: false to run the handlers on every client
 * @returns {void}
 */
export function registerSocketActions(handlers, { gmOnly = true } = {}) {
  game.socket.on(SYSTEM_SOCKET, async payload => {
    const handler = handlers[payload?.action];
    if (!handler || (gmOnly && !isActiveGM())) return;
    await handler(payload);
  });
}

/**
 * Asks the active GM's client to do something this client may not.
 * @param {String} action - The action its handler is registered under
 * @param {Object} [payload] - What the handler needs
 * @param {Object} [options] - warn: false to stay quiet when no GM is online
 * @returns {Boolean} True when the request was sent
 */
export function relayToActiveGM(action, payload = {}, { warn = true } = {}) {
  if (!game.users.activeGM) {
    if (warn) ui.notifications.warn(game.i18n.localize(NO_GM_KEY));
    return false;
  }
  game.socket.emit(SYSTEM_SOCKET, { action, ...payload });
  return true;
}

/**
 * Does something to a chat card where the card may be changed - its author or a GM - and asks the
 * active GM otherwise.
 * @param {ChatMessage} message - The card
 * @param {String} action - The action the GM's handler is registered under
 * @param {Function} run - What to do when this client may
 * @param {Object} [options] - payload for the GM (the card's id by default), warn as relayToActiveGM
 * @returns {Promise<*>} What run returned, or null when it was relayed
 */
export async function runOrRelay(message, action, run, { payload = { messageId: message?.id }, warn = true } = {}) {
  if (message?.isOwner || game.user.isGM) return run();
  relayToActiveGM(action, payload, { warn });
  return null;
}
