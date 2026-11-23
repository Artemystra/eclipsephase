import { transferItemBetweenActors } from "../../module/common/general-sheet-functions.js";
import { registerItemTransferSocket } from "../../module/common/general-helper-functions.js";
import { SYSTEM_SOCKET } from "../../module/common/socket.js";
import { makeActor, resetWorld } from "../setup/factories.js";

let listeners;
let replies;
const keepSocket = { ...game.socket };
const keepUsers = { ...game.users };

beforeAll(() => {
  listeners = [];
  game.socket.on = (name, fn) => listeners.push([name, fn]);
  registerItemTransferSocket();
});

beforeEach(() => {
  resetWorld();
  replies = [];
  game.socket.emit = (name, payload) => replies.push(payload);
  game.users.activeGM = { id: game.user.id };
  game.users.get = id => (id === "player" ? { id: "player", isGM: false } : null);
});

afterAll(() => {
  Object.assign(game.socket, keepSocket);
  Object.assign(game.users, keepUsers);
});

/**
 * Hands a transfer request to the GM's socket listener, as a player's client sends it.
 * @param {Object} payload - The request's fields
 * @returns {Promise<void>} Resolves once the GM's handler ran
 */
async function requestTransfer(payload) {
  for (const [name, fn] of listeners) {
    if (name === SYSTEM_SOCKET) await fn({ action: "transferItem", requestId: "r1", userId: "player", quantity: 1, ...payload });
  }
}

/**
 * A player character carrying the given items, owned by the player.
 * @param {String} name - The character's name
 * @param {Object[]} [items] - Its items
 * @returns {Actor} The character
 */
function character(name, items = []) {
  return makeActor({
    type: "character",
    name,
    ownership: { player: 3 },
    system: { activeMorph: `${name}Morph` },
    items: [{ _id: `${name}Morph`, name: "Splicer", type: "morph", system: { type: "bio" } }, ...items]
  });
}

describe("handing an item to another character directly", () => {
  test("a whole stack moves and leaves the giver", async () => {
    const giver = character("Giver", [{ _id: "medkit", name: "Medkit", type: "gear", system: { quantity: 1, slotType: "accessory" } }]);
    const taker = character("Taker");

    await transferItemBetweenActors({ sourceActor: giver, targetActor: taker, item: giver.items.get("medkit"), quantity: 1 });

    expect(giver.items.get("medkit")).toBeUndefined();
    expect(taker.items.filter(item => item.name === "Medkit").map(item => item.system.quantity)).toEqual([1]);
  });

  test("part of a stack moves and the rest stays with the giver", async () => {
    const giver = character("Giver", [{ _id: "flares", name: "Flare", type: "gear", system: { quantity: 3, slotType: "consumable" } }]);
    const taker = character("Taker");

    await transferItemBetweenActors({ sourceActor: giver, targetActor: taker, item: giver.items.get("flares"), quantity: 1 });

    expect(giver.items.get("flares").system.quantity).toBe(2);
    expect(taker.items.find(item => item.name === "Flare").system.quantity).toBe(1);
  });

  test("a stack of the same name on the taker grows instead of getting a second row", async () => {
    const giver = character("Giver", [{ _id: "flares", name: "Flare", type: "gear", system: { quantity: 2, slotType: "consumable" } }]);
    const taker = character("Taker", [{ _id: "ownFlares", name: "Flare", type: "gear", system: { quantity: 1, slotType: "consumable" } }]);

    await transferItemBetweenActors({ sourceActor: giver, targetActor: taker, item: giver.items.get("flares"), quantity: 2 });

    expect(taker.items.filter(item => item.name === "Flare").map(item => item.system.quantity)).toEqual([3]);
  });
});

describe("a transfer the active GM carries out for a player", () => {
  test("armour handed to a character lands in the Stash", async () => {
    const giver = character("Giver", [{ _id: "vest", name: "Vest", type: "armor", system: { boundTo: "GiverMorph" } }]);
    const taker = character("Taker");

    await requestTransfer({ sourceActorUuid: giver.uuid, targetActorUuid: taker.uuid, itemId: "vest" });

    expect(taker.items.find(item => item.name === "Vest").system.boundTo).toBe("stash");
    expect(replies.at(-1)).toMatchObject({ action: "transferItemResult", ok: true });
  });

  test("a morph does not change hands between characters", async () => {
    const giver = character("Giver", [{ _id: "spare", name: "Fury", type: "morph", system: { type: "bio" } }]);
    const taker = character("Taker");

    await requestTransfer({ sourceActorUuid: giver.uuid, targetActorUuid: taker.uuid, itemId: "spare" });

    expect(taker.items.find(item => item.name === "Fury")).toBeUndefined();
    expect(replies.at(-1)).toMatchObject({ ok: false });
  });

  test("a player who owns neither character is refused", async () => {
    const giver = character("Giver", [{ _id: "medkit", name: "Medkit", type: "gear", system: { quantity: 1 } }]);
    const taker = character("Taker");
    giver.ownership = { default: 0 };
    taker.ownership = { default: 0 };

    await requestTransfer({ sourceActorUuid: giver.uuid, targetActorUuid: taker.uuid, itemId: "medkit" });

    expect(giver.items.get("medkit")).toBeDefined();
    expect(replies.at(-1)).toMatchObject({ ok: false });
  });

  test("a client that is not the active GM leaves the request alone", async () => {
    const giver = character("Giver", [{ _id: "medkit", name: "Medkit", type: "gear", system: { quantity: 1 } }]);
    const taker = character("Taker");
    game.users.activeGM = { id: "someone-else" };

    await requestTransfer({ sourceActorUuid: giver.uuid, targetActorUuid: taker.uuid, itemId: "medkit" });

    expect(giver.items.get("medkit")).toBeDefined();
    expect(replies).toEqual([]);
  });
});

describe("a GM with two tabs open", () => {
  afterEach(() => { delete global.navigator; });

  test("only the acting tab carries a transfer out, so the item does not arrive twice", async () => {
    global.navigator = { locks: { request: (name, options, grant) => (typeof options === "function" ? new Promise(() => {}) : grant(null)) } };
    const tabListeners = [];
    game.socket.on = (name, fn) => tabListeners.push([name, fn]);
    let socket;
    let helper;
    jest.isolateModules(() => {
      socket = require("../../module/common/socket.js");
      helper = require("../../module/common/general-helper-functions.js");
    });
    await socket.electActingTab();
    helper.registerItemTransferSocket();
    const giver = character("Giver", [{ _id: "medkit", name: "Medkit", type: "gear", system: { quantity: 1 } }]);
    const taker = character("Taker");

    for (const [name, fn] of tabListeners) {
      if (name === SYSTEM_SOCKET) await fn({ action: "transferItem", requestId: "r1", userId: "player", quantity: 1, sourceActorUuid: giver.uuid, targetActorUuid: taker.uuid, itemId: "medkit" });
    }

    expect(socket.isActingTab()).toBe(false);
    expect(giver.items.get("medkit")).toBeDefined();
    expect(taker.items.find(item => item.name === "Medkit")).toBeUndefined();
  });
});
