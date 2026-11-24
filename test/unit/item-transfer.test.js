import { transferItemBetweenActors, registerItemReceivedSocket } from "../../module/common/general-sheet-functions.js";
import { registerItemTransferSocket } from "../../module/common/general-helper-functions.js";
import { SYSTEM_SOCKET } from "../../module/common/socket.js";
import { locationOf } from "../../module/common/morp-functions.js";
import { makeActor, resetWorld, seedDialogs } from "../setup/factories.js";
import EPactorSheet from "../../module/actor/EPactorSheet.js";

let listeners;
let replies;
const keepSocket = { ...game.socket };
const keepUsers = { ...game.users };
const keepUserId = game.user.id;

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

  test("a stack of the same name on the taker's sleeved morph grows instead of getting a second row", async () => {
    const giver = character("Giver", [{ _id: "flares", name: "Flare", type: "gear", system: { quantity: 2, slotType: "consumable" } }]);
    const taker = character("Taker", [{ _id: "ownFlares", name: "Flare", type: "gear", system: { quantity: 1, slotType: "consumable", boundTo: "TakerMorph" } }]);

    await transferItemBetweenActors({ sourceActor: giver, targetActor: taker, item: giver.items.get("flares"), quantity: 2 });

    expect(taker.items.filter(item => item.name === "Flare").map(item => item.system.quantity)).toEqual([3]);
  });
});

describe("where a handed-over item lands, and who is told", () => {
  /**
   * A shop-like actor the system does not prepare.
   * @param {Object[]} items - Its stock
   * @returns {Actor} The actor
   */
  function shop(items) {
    return makeActor({ type: "shop", name: "Shop", items });
  }
  const notices = () => replies.filter(payload => payload.action === "itemReceived");

  test("what a character carries lands on the taker's sleeved morph, a program in the Stash", async () => {
    const giver = character("Giver", [
      { _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "GiverMorph" } },
      { _id: "app", name: "App", type: "program", system: {} }
    ]);
    const taker = character("Taker");

    await transferItemBetweenActors({ sourceActor: giver, targetActor: taker, item: giver.items.get("gun") });
    await transferItemBetweenActors({ sourceActor: giver, targetActor: taker, item: giver.items.get("app") });

    expect(taker.items.find(item => item.name === "Pistol").system.boundTo).toBe("TakerMorph");
    expect(locationOf(taker, taker.items.find(item => item.name === "App"))).toBe("stash");
  });

  test("loot from an NPC lands on the sleeved morph too", async () => {
    const npc = makeActor({ type: "npc", name: "Guard", items: [{ _id: "gun", name: "Pistol", type: "rangedWeapon", system: {} }] });
    const taker = character("Taker");

    await transferItemBetweenActors({ sourceActor: npc, targetActor: taker, item: npc.items.get("gun") });

    expect(taker.items.find(item => item.name === "Pistol").system.boundTo).toBe("TakerMorph");
  });

  test("a shop's goods land as before: in the Stash, and nobody is told", async () => {
    const store = shop([{ _id: "gun", name: "Pistol", type: "rangedWeapon", system: {} }]);
    const taker = character("Taker");
    game.users.filter = fn => [{ id: "player", isGM: false }].filter(fn);

    await transferItemBetweenActors({ sourceActor: store, targetActor: taker, item: store.items.get("gun") });

    expect(locationOf(taker, taker.items.find(item => item.name === "Pistol"))).toBe("stash");
    expect(notices()).toEqual([]);
  });

  test("the taker's players are told, not the GM and not who handed it over", async () => {
    const giver = character("Giver", [{ _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "GiverMorph" } }]);
    const taker = character("Taker");
    taker.ownership = { player: 3, other: 3, gm: 3 };
    game.users.filter = fn => [{ id: "player", isGM: false }, { id: "other", isGM: false }, { id: "gm", isGM: true }].filter(fn);

    await transferItemBetweenActors({ sourceActor: giver, targetActor: taker, item: giver.items.get("gun"), giverId: "other" });

    expect(notices()).toEqual([{ action: "itemReceived", userIds: ["player"], name: "Pistol", from: "Giver" }]);
  });

  test("the notice shows on the screen of a player it is meant for, and nowhere else", async () => {
    const shown = [];
    const keepWait = foundry.applications.api.DialogV2;
    const tabListeners = [];
    game.socket.on = (name, fn) => tabListeners.push(fn);
    registerItemReceivedSocket();
    foundry.applications.api.DialogV2 = class { constructor(options) { shown.push(options.content); } render() { return this; } close() {} };
    try {
      game.user.id = "player";
      for (const listen of tabListeners) await listen({ action: "itemReceived", userIds: ["player"], name: "Pistol", from: "Giver" });
      game.user.id = "someoneElse";
      for (const listen of tabListeners) await listen({ action: "itemReceived", userIds: ["player"], name: "Pistol", from: "Giver" });
    } finally {
      foundry.applications.api.DialogV2 = keepWait;
      game.user.id = keepUserId;
    }

    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain("ep2e.systemMessage.itemAttachment.itemReceived");
  });
});

describe("handing over part of a stack from the sheet", () => {
  /**
   * Drops an item from one character's sheet onto another's, as the player who owns both does.
   * @param {Actor} taker - The character it is dropped on
   * @param {Item} item - The item dragged over
   * @returns {Promise<*>} What the drop returned
   */
  function dropOn(taker, item) {
    return EPactorSheet.prototype._onDropItem.call({ actor: taker }, {}, item);
  }

  test("the giver is asked how many packs of a stack go, and that many go", async () => {
    const giver = character("Giver", [{ _id: "flares", name: "Flare", type: "gear", system: { quantity: 4, slotType: "consumable", boundTo: "GiverMorph" } }]);
    const taker = character("Taker");
    seedDialogs(3);

    await dropOn(taker, giver.items.get("flares"));

    expect(giver.items.get("flares").system.quantity).toBe(1);
    expect(taker.items.find(item => item.name === "Flare").system.quantity).toBe(3);
  });

  test("backing out of the question hands nothing over; a single item goes without one", async () => {
    const giver = character("Giver", [
      { _id: "flares", name: "Flare", type: "gear", system: { quantity: 4, slotType: "consumable", boundTo: "GiverMorph" } },
      { _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "GiverMorph" } }
    ]);
    const taker = character("Taker");
    seedDialogs(false);

    await dropOn(taker, giver.items.get("flares"));
    await dropOn(taker, giver.items.get("gun"));

    expect(giver.items.get("flares").system.quantity).toBe(4);
    expect(taker.items.find(item => item.name === "Pistol")).toBeDefined();
  });

  test("of a drug the open pack goes first, and the packs the giver keeps are whole", async () => {
    const giver = character("Giver", [{ _id: "pills", name: "Pills", type: "drug", system: { quantity: 3, usagesMax: 5, usagesUsed: 2, slotType: "consumable", boundTo: "GiverMorph" } }]);
    const taker = character("Taker");
    seedDialogs(1);

    await dropOn(taker, giver.items.get("pills"));

    const given = taker.items.find(item => item.name === "Pills");
    expect([given.system.quantity, given.system.usagesUsed]).toEqual([1, 2]);
    expect([giver.items.get("pills").system.quantity, giver.items.get("pills").system.usagesUsed]).toEqual([2, 0]);
  });
});

describe("a transfer the active GM carries out for a player", () => {
  test("armour handed to a character lands on its sleeved morph", async () => {
    const giver = character("Giver", [{ _id: "vest", name: "Vest", type: "armor", system: { boundTo: "GiverMorph" } }]);
    const taker = character("Taker");

    await requestTransfer({ sourceActorUuid: giver.uuid, targetActorUuid: taker.uuid, itemId: "vest" });

    expect(taker.items.find(item => item.name === "Vest").system.boundTo).toBe("TakerMorph");
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
