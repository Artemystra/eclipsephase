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
