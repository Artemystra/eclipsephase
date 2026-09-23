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
 * The system's own "ready" hook that walks the migration ladder.
 * @returns {Function} The hook callback
 */
function findMigrationReadyHook() {
  return global.__ep.hookHandlers.get("ready").find(fn => fn.toString().includes("migrationVersion"));
}

/**
 * Runs the migration ladder against a world last migrated at the given version, recording which
 * migration dialogs it renders and what copy each was given.
 * @param {String} from - The world's stored migrationVersion
 * @returns {Promise<Object[]>} One entry per dialog, with its copy key and any extra block
 */
async function runLadderFrom(from) {
  global.__ep.setSetting("eclipsephase", "migrationVersion", from);

  const rendered = [];
  const realRender = foundry.applications.handlebars.renderTemplate;
  foundry.applications.handlebars.renderTemplate = async (template, data = {}) => {
    if (String(template).includes("migration-dialog")) rendered.push({ copy: data.messageCopy, extra: data.messageCopyExtra });
    return realRender(template, data);
  };

  const realWait = foundry.applications.api.DialogV2.wait;
  foundry.applications.api.DialogV2.wait = async () => ({ start: true });
  try {
    await findMigrationReadyHook()();
  } finally {
    foundry.applications.handlebars.renderTemplate = realRender;
    foundry.applications.api.DialogV2.wait = realWait;
  }
  return rendered;
}

beforeAll(async () => {
  await import("../../module/eclipsephase.js");
});

describe("the migration ladder's closing dialog", () => {
  test("a world coming from the last released version is told it is done exactly once", async () => {
    const rendered = await runLadderFrom("2.1.5");
    const done = rendered.filter(entry => entry.copy === "ep2e.migration.done");

    expect(done).toHaveLength(1);
  });

  test("it still ends up stamped at the current version", async () => {
    await runLadderFrom("2.1.5");
    expect(game.settings.get("eclipsephase", "migrationVersion")).toEqual("2.5");
  });

  test("a world with nothing to migrate is not told anything at all", async () => {
    const rendered = await runLadderFrom("2.5");
    expect(rendered).toEqual([]);
  });
});

describe("2.2 and 2.3 arrive as part of 2.5", () => {
  /**
   * The copy keys of the dialogs a run offered, ignoring the closing "all set" one.
   * @param {Object[]} rendered - What runLadderFrom reported
   * @returns {Object[]} The offer dialogs
   */
  function offers(rendered) {
    return rendered.filter(entry => entry.copy !== "ep2e.migration.done");
  }

  test("a world from the last released version is offered exactly one migration", async () => {
    const rendered = await runLadderFrom("2.1.5");

    expect(offers(rendered).map(entry => entry.copy)).toEqual(["ep2e.migration.25"]);
  });

  test("that one migration is not the retired 2.3 notice", async () => {
    const rendered = await runLadderFrom("2.1.5");

    expect(rendered.some(entry => entry.copy === "ep2e.migration.23")).toBe(false);
  });

  test("a world off the released line is never silently stamped, whatever the Ki gate says", async () => {
    const rendered = await runLadderFrom("2.1.5");

    expect(offers(rendered)).toHaveLength(1);
    expect(game.settings.get("eclipsephase", "migrationVersion")).toEqual("2.5");
  });

  test("a world with no Ki data is offered the notice without the Ki block", async () => {
    const rendered = await runLadderFrom("2.1.5");

    expect(offers(rendered)[0].extra).toBeUndefined();
  });

  test("a world already on 2.3 with nothing to move is told nothing at all", async () => {
    const rendered = await runLadderFrom("2.3");

    expect(rendered).toEqual([]);
    expect(game.settings.get("eclipsephase", "migrationVersion")).toEqual("2.5");
  });
});
