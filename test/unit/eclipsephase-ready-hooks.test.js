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
