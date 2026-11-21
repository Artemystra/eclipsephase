import { registerSocketActions, relayToActiveGM, runOrRelay, isActiveGM, SYSTEM_SOCKET } from "../../module/common/general-helper-functions.js";
import { resetWorld } from "../setup/factories.js";

let listeners;
let emitted;
const realSocket = { ...game.socket };

beforeEach(() => {
  resetWorld();
  listeners = [];
  emitted = [];
  game.socket.on = (name, fn) => listeners.push([name, fn]);
  game.socket.emit = (name, payload) => emitted.push([name, payload]);
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => {
  Object.assign(game.socket, realSocket);
  game.user.isGM = true;
  jest.restoreAllMocks();
});

/**
 * Feeds a payload to every listener on the system's socket.
 * @param {Object} payload - The payload
 * @returns {Promise<void>} Resolves once every listener ran
 */
async function deliver(payload) {
  for (const [name, fn] of listeners) if (name === SYSTEM_SOCKET) await fn(payload);
}

describe("listening for socket actions", () => {
  test("only the active GM's client answers, and only the action asked for", async () => {
    const ran = [];
    registerSocketActions({ doThing: payload => ran.push(payload.value), other: () => ran.push("other") });

    game.users.activeGM = { id: "someone-else" };
    await deliver({ action: "doThing", value: 1 });
    game.users.activeGM = { id: game.user.id };
    await deliver({ action: "doThing", value: 2 });

    expect(isActiveGM()).toBe(true);
    expect(ran).toEqual([2]);
  });

  test("actions every client answers run without a GM check", async () => {
    const ran = [];
    game.user.isGM = false;
    registerSocketActions({ reply: () => ran.push("reply") }, { gmOnly: false });

    await deliver({ action: "reply" });

    expect(ran).toEqual(["reply"]);
  });
});

describe("asking the active GM", () => {
  test("a request goes out on the system's socket with its action", () => {
    game.users.activeGM = { id: "gm-1" };

    expect(relayToActiveGM("doThing", { messageId: "m1" })).toBe(true);
    expect(emitted).toEqual([[SYSTEM_SOCKET, { action: "doThing", messageId: "m1" }]]);
  });

  test("without a GM online nothing is sent, and the player is told unless asked not to", () => {
    game.users.activeGM = null;

    expect(relayToActiveGM("doThing")).toBe(false);
    relayToActiveGM("quiet", {}, { warn: false });

    expect(emitted).toEqual([]);
    expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
  });

  test("a card is changed where that is allowed, and asked for everywhere else", async () => {
    game.users.activeGM = { id: "gm-1" };
    const ran = [];
    game.user.isGM = false;

    await runOrRelay({ id: "own", isOwner: true }, "mark", () => ran.push("own"));
    await runOrRelay({ id: "theirs", isOwner: false }, "mark", () => ran.push("theirs"));

    expect(ran).toEqual(["own"]);
    expect(emitted).toEqual([[SYSTEM_SOCKET, { action: "mark", messageId: "theirs" }]]);
  });
});

describe("one acting tab per user", () => {
  /**
   * A fresh copy of the socket module, with the browser's Web Locks replaced: another tab holds the
   * lock until release() hands it to the tab waiting here.
   * @param {Boolean} free - Whether no other tab holds the lock
   * @returns {Object} the module and release()
   */
  function tabWith(free) {
    const waiting = [];
    global.navigator = { locks: { request: (name, options, grant) => {
      if (typeof options === "function") { waiting.push(options); return new Promise(() => {}); }
      return grant(free ? { name } : null);
    } } };
    let socket;
    jest.isolateModules(() => { socket = require("../../module/common/socket.js"); });
    return { socket, release: () => waiting.splice(0).forEach(grant => grant({})) };
  }

  afterEach(() => { delete global.navigator; game.users.activeGM = { id: "connected-gm" }; });

  test("a GM's second tab acts on nothing until the first closes, then takes over", async () => {
    game.users.activeGM = { id: game.user.id };
    const { socket, release } = tabWith(false);
    await socket.electActingTab();

    expect([socket.isActingTab(), socket.isActiveGM()]).toEqual([false, false]);
    release();
    expect([socket.isActingTab(), socket.isActiveGM()]).toEqual([true, true]);
  });

  test("the first tab acts at once", async () => {
    game.users.activeGM = { id: game.user.id };
    const { socket } = tabWith(true);
    await socket.electActingTab();

    expect(socket.isActiveGM()).toBe(true);
  });

  test("a change is this tab's when it carries this tab's mark; one without a mark is the acting tab's", async () => {
    const { socket } = tabWith(false);
    await socket.electActingTab();
    const handlers = {};
    const realOn = Hooks.on;
    Hooks.on = (name, fn) => { handlers[name] = fn; };
    socket.registerTabMarks();
    Hooks.on = realOn;
    const own = {};
    handlers.preUpdateActor({}, {}, own);

    expect(socket.madeHere(game.user.id, own)).toBe(true);
    expect(socket.madeHere(game.user.id, { [socket.TAB_OPTION]: "another-tab" })).toBe(false);
    expect(socket.madeHere(game.user.id, {})).toBe(false);
    expect(socket.madeHere("someone-else", own)).toBe(false);
  });

  test("no module asks Foundry directly whether this is the active GM, so every such check knows about tabs", () => {
    const fs = require("fs");
    const path = require("path");
    const root = path.join(global.__ep.SYSTEM_ROOT, "module");
    const files = [];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "tests") walk(full); }
      else if (entry.name.endsWith(".js") && entry.name !== "socket.js") files.push(full);
    });
    walk(root);
    const direct = files.filter(file => /game\.user\.isActiveGM|activeGM\??\.isSelf/.test(fs.readFileSync(file, "utf8")));

    expect(direct.map(file => path.relative(root, file))).toEqual([]);
  });
});
