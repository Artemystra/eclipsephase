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
 * migration dialogs it renders.
 * @param {String} from - The world's stored migrationVersion
 * @returns {Promise<String[]>} The copy key of every migration dialog rendered, in order
 */
async function runLadderFrom(from) {
  global.__ep.setSetting("eclipsephase", "migrationVersion", from);

  const rendered = [];
  const realRender = foundry.applications.handlebars.renderTemplate;
  foundry.applications.handlebars.renderTemplate = async (template, data = {}) => {
    if (String(template).includes("migration-dialog")) rendered.push(data.messageCopy);
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
    const done = rendered.filter(key => key === "ep2e.migration.done");

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
