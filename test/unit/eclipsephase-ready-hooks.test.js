import { makeActor, makeItem } from "../setup/factories.js";

// module/eclipsephase.js pulls in the canvas/token classes at import time, which need a little more
// of Foundry's canvas API stubbed than the rest of the suite needs.
foundry.canvas = {
  layers: { PlaceablesLayer: class PlaceablesLayer {} },
  placeables: { Token: class Token {} }
};
CONFIG.Canvas = { layers: {} };
CONFIG.SceneNavigation = {};
CONFIG.Token = { rulerClass: class TokenRulerBase {} };

/**
 * The system's own "ready" hook that reacts to the superBrew setting. Loading module/eclipsephase.js
 * registers several "ready" hooks; this finds the one this test cares about instead of running all
 * of them, since the others need far more of Foundry mocked than this test is about.
 * @returns {Function} The hook callback
 */
function findTaskResultTextReadyHook() {
  return global.__ep.hookHandlers.get("ready").find(fn => fn.toString().includes("registerTaskResultText"));
}

test("the entry point resolves every name its ready hooks reference", async () => {
  await import("../../module/eclipsephase.js");
  expect(findTaskResultTextReadyHook()).toBeInstanceOf(Function);
});

test("superBrew off leaves the RAW result text table in place", async () => {
  const { getTaskResultText, resetRegistry } = await import("../../module/api/registry.js");
  resetRegistry();
  global.__ep.setSetting("eclipsephase", "superBrew", false);

  findTaskResultTextReadyHook()();

  expect(getTaskResultText()).toBeNull();
});

test("superBrew on registers the homebrew result text table", async () => {
  const { getTaskResultText, resetRegistry } = await import("../../module/api/registry.js");
  const { HOMEBREW_TASK_RESULT_TEXT } = await import("../../module/rolls/dice.js");
  resetRegistry();
  global.__ep.setSetting("eclipsephase", "superBrew", true);

  findTaskResultTextReadyHook()();

  expect(getTaskResultText()).toBe(HOMEBREW_TASK_RESULT_TEXT);
});

describe("hooks that run on every client", () => {
  /**
   * One of the entry point's listeners for a hook, found by a word in its body.
   * @param {String} event - The hook
   * @param {String} marker - A word only that listener contains
   * @returns {Function} The listener
   */
  const listener = (event, marker) => global.__ep.hookHandlers.get(event).find(fn => fn.toString().includes(marker));

  afterEach(() => { game.user.isGM = true; });

  test("an actor another user created gets its default morph and ID from them, not from this client", async () => {
    await import("../../module/eclipsephase.js");
    const npc = makeActor({ type: "npc", name: "Fresh", ownership: { default: 0 } });
    const flat = makeItem({ type: "morph", name: "Flat" });
    game.packs.set("eclipsephase.morphs", { getDocument: async () => flat });
    game.user.isGM = false;

    await listener("createActor", "defaultMorphAdded")(npc, {}, "gm-user");

    expect(npc.items.size).toBe(0);
    expect(npc.getFlag("eclipsephase", "defaultMorphAdded")).toBeUndefined();
  });

  test("a world morph another user created keeps its image on this client", async () => {
    await import("../../module/eclipsephase.js");
    const morph = makeItem({ type: "morph", name: "Splicer", img: "own.webp", ownership: { default: 0 } });
    game.user.isGM = false;

    await listener("createItem", "anObjectification")(morph, {}, "gm-user");

    expect(morph.img).toBe("own.webp");
  });
});
