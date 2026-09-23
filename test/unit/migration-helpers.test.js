import { forEachActor, forEachItem, postNotice } from "../../module/common/migration.js";
import { makeActor, resetWorld } from "../setup/factories.js";

/**
 * A world item that isn't embedded on any actor.
 * @param {String} name - The item's name
 * @param {String} [type] - The item's type
 * @returns {Object} A stand-in item
 */
function worldItem(name, type = "gear") {
  return { id: name, name, type };
}

describe("forEachActor", () => {
  beforeEach(() => resetWorld());

  test("runs fn once per actor and counts them", async () => {
    makeActor({ name: "One" });
    makeActor({ name: "Two" });
    const seen = [];

    const result = await forEachActor(async actor => { seen.push(actor.name); });

    expect(seen.sort()).toEqual(["One", "Two"]);
    expect(result).toEqual({ completed: 2, total: 2, cancelled: false, errors: [] });
  });

  test("an empty world completes with nothing to do", async () => {
    const result = await forEachActor(async () => {});
    expect(result).toEqual({ completed: 0, total: 0, cancelled: false, errors: [] });
  });

  test("a filter narrows which actors run", async () => {
    makeActor({ type: "character", name: "PC" });
    makeActor({ type: "npc", name: "NPC" });
    const seen = [];

    await forEachActor(async actor => { seen.push(actor.name); }, { filter: actor => actor.type === "npc" });

    expect(seen).toEqual(["NPC"]);
  });

  test("one actor's error is isolated and the rest still run", async () => {
    makeActor({ name: "Breaks" });
    makeActor({ name: "Fine" });
    const seen = [];

    const result = await forEachActor(async actor => {
      if (actor.name === "Breaks") throw new Error("boom");
      seen.push(actor.name);
    });

    expect(seen).toEqual(["Fine"]);
    expect(result.completed).toEqual(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error.message).toEqual("boom");
    expect(result.errors[0].document.name).toEqual("Breaks");
  });

  test("cancelling mid-run stops further actors and is reported", async () => {
    const a = makeActor({ name: "First" });
    const b = makeActor({ name: "Second" });
    const c = makeActor({ name: "Third" });
    const seen = [];

    let cancelAfterFirst = null;
    const originalDialog = global.foundry.applications.api.DialogV2;
    global.foundry.applications.api.DialogV2 = class extends originalDialog {
      constructor(...args) {
        super(...args);
        cancelAfterFirst = this;
      }
    };

    const promise = forEachActor(async actor => {
      seen.push(actor.name);
      if (actor.name === "First") cancelAfterFirst.options.buttons[0].callback();
    });

    const result = await promise;
    global.foundry.applications.api.DialogV2 = originalDialog;

    expect(seen).toEqual(["First"]);
    expect(result.cancelled).toBe(true);
    expect(result.completed).toEqual(1);
  });
});

describe("forEachItem", () => {
  beforeEach(() => resetWorld());

  test("covers world items and every actor's embedded items", async () => {
    game.items.set("loose", worldItem("Loose Gear"));
    makeActor({ name: "Holder", items: [{ name: "Embedded Gear", type: "gear" }] });
    const seen = [];

    const result = await forEachItem(async item => { seen.push(item.name); });

    expect(seen.sort()).toEqual(["Embedded Gear", "Loose Gear"]);
    expect(result.total).toEqual(2);
  });

  test("a filter applies to both world and embedded items", async () => {
    game.items.set("loose", worldItem("Loose Weapon", "rangedWeapon"));
    makeActor({ name: "Holder", items: [{ name: "Embedded Gear", type: "gear" }] });
    const seen = [];

    await forEachItem(async item => { seen.push(item.name); }, { filter: item => item.type === "gear" });

    expect(seen).toEqual(["Embedded Gear"]);
  });

  test("world item packs are skipped unless explicitly included", async () => {
    const packItem = worldItem("Pack Item");
    game.packs.set("world.stuff", {
      metadata: { type: "Item", package: "world" },
      getDocuments: async () => [packItem]
    });
    const seen = [];

    await forEachItem(async item => { seen.push(item.name); });
    expect(seen).toEqual([]);

    await forEachItem(async item => { seen.push(item.name); }, { includeCompendiums: true });
    expect(seen).toEqual(["Pack Item"]);
  });

  test("a broken item does not stop the remaining ones", async () => {
    game.items.set("a", worldItem("Breaks"));
    game.items.set("b", worldItem("Fine"));
    const seen = [];

    const result = await forEachItem(async item => {
      if (item.name === "Breaks") throw new Error("boom");
      seen.push(item.name);
    });

    expect(seen).toEqual(["Fine"]);
    expect(result.errors).toHaveLength(1);
  });
});

describe("postNotice", () => {
  beforeEach(() => resetWorld());

  test("whispers the localized text to the actor's non-GM owner", async () => {
    game.users.filter = () => [{ id: "player1", isGM: false }];
    const actor = makeActor({ name: "Notified" });
    actor.testUserPermission = () => true;

    const posted = await postNotice(actor, "ep2e.spike.notice", { count: 3 });

    expect(posted).toBe(true);
    const message = global.__ep.createdMessages[0];
    expect(message.whisper).toEqual(["player1"]);
    expect(message.content).toContain("ep2e.spike.notice");
  });

  test("does nothing when the actor has no non-GM owner", async () => {
    game.users.filter = () => [];
    const actor = makeActor({ name: "Unowned" });
    actor.testUserPermission = () => false;

    const posted = await postNotice(actor, "ep2e.spike.notice");

    expect(posted).toBe(false);
    expect(global.__ep.createdMessages).toHaveLength(0);
  });

  test("a GM owner alone does not trigger a whisper", async () => {
    game.users.filter = fn => [{ id: "gm1", isGM: true }].filter(fn);
    const actor = makeActor({ name: "GMOwned" });
    actor.testUserPermission = () => true;

    const posted = await postNotice(actor, "ep2e.spike.notice");

    expect(posted).toBe(false);
  });
});
