// The system's socket: one channel, and the active GM's client acting on what the others may not do
// themselves. Kept free of imports, so any module can use it without pulling in the sheet code.

export const SYSTEM_SOCKET = "system.eclipsephase";
const NO_GM_KEY = "ep2e.actorSheet.warnings.needsGM";

// One page of a user acts for all their tabs: a second tab in the same browser shares the login and
// would otherwise do everything a second time. The browser's Web Locks pick the page; when it
// closes, the next tab waiting takes over. Without Web Locks every tab acts, as before.
const ACTING_LOCK = "eclipsephase.acting";
// Sent along with this page's own changes, so the user's other tabs can tell them apart.
export const TAB_OPTION = "eclipsephaseTab";
const TAB_ID = Math.random().toString(36).slice(2);
let actingHere = null;
let elected = Promise.resolve();

/**
 * Asks the browser which of the user's tabs acts. Called once when the page starts.
 * @returns {Promise<void>} Resolves once this tab knows whether it acts
 */
export function electActingTab() {
  const locks = globalThis.navigator?.locks;
  if (!locks) return elected;
  const name = `${ACTING_LOCK}.${game.world?.id ?? ""}.${game.userId ?? game.user?.id ?? ""}`;
  const hold = () => new Promise(() => {});
  elected = new Promise(resolve => {
    locks.request(name, { ifAvailable: true }, lock => {
      actingHere = !!lock;
      resolve();
      if (lock) return hold();
      locks.request(name, () => {
        actingHere = true;
        return hold();
      });
      return null;
    });
  });
  return elected;
}

/**
 * Resolves once this tab knows whether it acts for its user.
 * @returns {Promise<void>} Resolves once the browser has answered
 */
export function whenTabElected() {
  return elected;
}

/**
 * Whether this tab acts for its user: the only one of the user's tabs in this browser that does.
 * @returns {Boolean} True unless another tab acts
 */
export function isActingTab() {
  return actingHere !== false;
}

/**
 * Whether this client is the active GM - the one client that acts on what the others ask for. Of
 * the GM's tabs, only the one that acts counts.
 * @returns {Boolean} True on the active GM's acting tab
 */
export function isActiveGM() {
  return userIsActiveGM() && isActingTab();
}

/**
 * Whether this user is the active GM, as Foundry tells it.
 * @returns {Boolean} True when the user is the active GM
 */
function userIsActiveGM() {
  if (typeof game.user?.isActiveGM === "boolean") return game.user.isActiveGM;
  const active = game.users?.activeGM;
  if (typeof active?.isSelf === "boolean") return active.isSelf;
  return !!game.user?.isGM && !!active && active.id === game.user?.id;
}

/**
 * Whether a change came from this tab: made by this user and, of their tabs, this one. A change sent
 * without a tab mark is taken as the acting tab's.
 * @param {String} userId - The user who made the change, as a document hook names them
 * @param {Object} [options] - The change's options
 * @returns {Boolean} True on the tab that made the change
 */
export function madeHere(userId, options) {
  if (userId !== game.user?.id) return false;
  const tab = options?.[TAB_OPTION];
  return tab ? tab === TAB_ID : isActingTab();
}

/**
 * Marks this tab's own changes to actors, items, effects and chat messages, so that madeHere tells
 * them apart in the user's other tabs.
 * @returns {void}
 */
export function registerTabMarks() {
  const mark = options => {
    if (options && typeof options === "object" && !(TAB_OPTION in options)) options[TAB_OPTION] = TAB_ID;
  };
  for (const name of ["Actor", "Item", "ActiveEffect", "ChatMessage"]) {
    Hooks.on(`preCreate${name}`, (document, data, options) => mark(options));
    Hooks.on(`preUpdate${name}`, (document, changes, options) => mark(options));
    Hooks.on(`preDelete${name}`, (document, options) => mark(options));
  }
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
