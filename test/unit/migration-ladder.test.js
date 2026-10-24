import { makeActor, makeActorFromFixture, fixtureNames, registerSystemPacks } from "../setup/factories.js";


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
 * @param {Object} [answer] - What every dialog answers; by default the offer to migrate is accepted
 * @returns {Promise<Object[]>} One entry per dialog, with its copy key and any extra block
 */
async function runLadderFrom(from, answer = { start: true }) {
  global.__ep.setSetting("eclipsephase", "migrationVersion", from);

  const rendered = [];
  const realRender = foundry.applications.handlebars.renderTemplate;
  foundry.applications.handlebars.renderTemplate = async (template, data = {}) => {
    if (String(template).includes("migration-dialog")) rendered.push({ copy: data.messageCopy, extra: data.messageCopyExtra });
    if (String(template).includes("migration-notice")) rendered.push({ copy: `notice:${data.version}`, extra: data.extra || undefined });
    return realRender(template, data);
  };

  const realWait = foundry.applications.api.DialogV2.wait;
  foundry.applications.api.DialogV2.wait = async () => ({ ...answer });
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
    expect(game.settings.get("eclipsephase", "migrationVersion")).toEqual(game.system.version);
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
    expect(game.settings.get("eclipsephase", "migrationVersion")).toEqual(game.system.version);
  });

  test("a world with no Ki data is offered the notice without the Ki block", async () => {
    const rendered = await runLadderFrom("2.1.5");

    expect(offers(rendered)[0].extra).toBeUndefined();
  });

  test("a world already on 2.3 with nothing to move is told nothing at all", async () => {
    const rendered = await runLadderFrom("2.3");

    expect(rendered).toEqual([]);
    expect(game.settings.get("eclipsephase", "migrationVersion")).toEqual(game.system.version);
  });
});

describe("the 2.7 drug schema", () => {
  /**
   * Puts a world item into the world for the length of one test.
   * @param {Object} data - The item source data
   * @returns {Item} The item, already registered
   */
  function worldItem(data) {
    const item = new CONFIG.Item.documentClass(data);
    game.items.set(item.id, item);
    return item;
  }

  test("a world holding a drug from before the schema is offered the notice", async () => {
    const drug = worldItem({ name: "Grin", type: "drug", system: { duration: "3 hours" } });

    try {
      const rendered = await runLadderFrom("2.5");
      expect(rendered.map(entry => entry.copy)).toContain("notice:2.7");
    } finally {
      game.items.delete(drug.id);
    }
  });

  test("running it rewrites that drug's duration into a span and gives it an untouched pack", async () => {
    const drug = worldItem({ name: "Grin", type: "drug", system: { duration: "3 hours" } });

    try {
      await runLadderFrom("2.5");
      expect(drug.system.duration).toEqual({ value: 3, units: "hours" });
      expect(drug.system.usagesUsed).toEqual(0);
      expect(drug.system.usagesMax).toEqual(5);
    } finally {
      game.items.delete(drug.id);
    }
  });

  test("a drug from the old fine-grained categories becomes a drug or a toxin", async () => {
    const toxin = worldItem({ name: "BTX2", type: "drug", system: { duration: "1 hour", category: "toxins" } });
    const drug = worldItem({ name: "Grin", type: "drug", system: { duration: "3 hours", category: "combat" } });

    try {
      await runLadderFrom("2.5");
      expect(toxin._source.system.category).toEqual("toxin");
      expect(drug._source.system.category).toEqual("drug");
    } finally {
      game.items.delete(toxin.id);
      game.items.delete(drug.id);
    }
  });

  test("a drug whose duration never ended on its own is left open-ended rather than refused", async () => {
    const drug = worldItem({ name: "Retcon", type: "drug", system: { duration: "Permanent" } });

    try {
      await runLadderFrom("2.5");
      expect(drug.system.duration).toEqual({ value: null, units: "" });
    } finally {
      game.items.delete(drug.id);
    }
  });

  test("a world whose drugs are already current is stamped without being asked", async () => {
    const drug = worldItem({
      name: "Grin",
      type: "drug",
      system: { duration: { value: 3, units: "hours" }, usagesUsed: 0, usagesMax: 5 }
    });

    try {
      const rendered = await runLadderFrom("2.5");
      expect(rendered).toEqual([]);
      expect(game.settings.get("eclipsephase", "migrationVersion")).toEqual(game.system.version);
    } finally {
      game.items.delete(drug.id);
    }
  });
});

describe("the 2.7 blueprint backfill", () => {
  const GRIN_BLUEPRINT = {
    _id: "Bxx64DyBJ7XYb89n",
    name: "Grin",
    transfer: true,
    system: { changes: [{ key: "system.mods.woundMod", value: -1, type: "add" }] },
    _stats: { coreVersion: "14.356" }
  };
  const CURRENT = { duration: { value: 3, units: "hours" }, usagesUsed: 0, usagesMax: 5 };

  /**
   * Registers the system's drug compendium for the length of one test.
   * @param {Object[]} drugs - The compendium's drug source data
   * @returns {void}
   */
  function drugPack(drugs) {
    game.packs.set("eclipsephase.drugs-and-toxins", {
      metadata: { type: "Item", package: "eclipsephase" },
      getDocuments: async () => drugs.map(data => new CONFIG.Item.documentClass(data))
    });
  }

  /**
   * Puts a world item into the world for the length of one test.
   * @param {Object} data - The item source data
   * @returns {Item} The item, already registered
   */
  function worldItem(data) {
    const item = new CONFIG.Item.documentClass(data);
    game.items.set(item.id, item);
    return item;
  }

  beforeEach(() => {
    drugPack([
      { name: "Grin", type: "drug", system: CURRENT, effects: [GRIN_BLUEPRINT] },
      { name: "Retcon", type: "drug", system: CURRENT, effects: [] }
    ]);
  });

  afterEach(() => {
    game.packs.delete("eclipsephase.drugs-and-toxins");
    game.items.clear();
    game.actors.clear();
  });

  test("a world whose drugs are current but lack their blueprints is still offered the notice", async () => {
    worldItem({ name: "Grin", type: "drug", system: CURRENT });

    const rendered = await runLadderFrom("2.5");

    expect(rendered.map(entry => entry.copy)).toContain("notice:2.7");
  });

  test("running it gives a drug on a sheet the effects of its compendium namesake", async () => {
    const actor = makeActor({ type: "character", items: [{ _id: "grin1", name: "Grin", type: "drug", system: CURRENT }] });

    await runLadderFrom("2.5");

    const effects = Array.from(actor.items.get("grin1").effects);
    expect(effects).toHaveLength(1);
    expect(effects[0].changes).toEqual([expect.objectContaining({ key: "system.mods.woundMod", type: "add" })]);
  });

  test("a world item gets them too, and the copy is a fresh effect rather than the compendium's own", async () => {
    const drug = worldItem({ name: "Grin", type: "drug", system: { duration: "3 hours" } });

    await runLadderFrom("2.5");

    const effects = Array.from(drug.effects);
    expect(effects).toHaveLength(1);
    expect(effects[0].id).not.toEqual(GRIN_BLUEPRINT._id);
  });

  test("a drug that already carries effects of its own is left as it is", async () => {
    const homebrew = { name: "House Grin", system: { changes: [{ key: "system.mods.lucmod", value: 5, type: "add" }] } };
    const drug = worldItem({ name: "Grin", type: "drug", system: CURRENT, effects: [homebrew] });

    const rendered = await runLadderFrom("2.5");

    expect(rendered).toEqual([]);
    expect(Array.from(drug.effects).map(effect => effect.name)).toEqual(["House Grin"]);
  });

  test("a drug whose namesake has no blueprint, or which has no namesake, asks nothing", async () => {
    worldItem({ name: "Retcon", type: "drug", system: CURRENT });
    worldItem({ name: "Garage Brew", type: "drug", system: CURRENT });

    const rendered = await runLadderFrom("2.5");

    expect(rendered).toEqual([]);
    expect(game.settings.get("eclipsephase", "migrationVersion")).toEqual(game.system.version);
  });

  test("a world without the drug compendium still migrates its schema", async () => {
    game.packs.delete("eclipsephase.drugs-and-toxins");
    const drug = worldItem({ name: "Grin", type: "drug", system: { duration: "3 hours" } });

    await runLadderFrom("2.5");

    expect(drug.system.duration).toEqual({ value: 3, units: "hours" });
    expect(Array.from(drug.effects)).toEqual([]);
  });
});

describe("the whole ladder on an old world", () => {
  afterEach(() => {
    game.actors.clear();
    game.packs.clear();
    jest.restoreAllMocks();
  });

  test.each(["1.5", "2.0"])("a world last migrated at %s with every sample actor climbs to the current version without an error", async from => {
    registerSystemPacks();
    for (const name of fixtureNames()) makeActorFromFixture(name);
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});

    await runLadderFrom(from, { start: true, weaponUpdateList: [] });

    expect(errors.mock.calls).toEqual([]);
    expect(game.settings.get("eclipsephase", "migrationVersion")).toEqual(game.system.version);
  });
});

describe("the 2.7 backfill of what C added", () => {
  const CURRENT = { duration: { value: 1, units: "hours" }, usagesUsed: 0, usagesMax: 5, category: "toxin" };
  const JUICE_OPTION = { id: "fear", label: "ep2e.item.drug.rollOptions.juiceFear", value: 30, appliesTo: ["sav", "wil"] };
  const TWITCH_CHECK = { aptitude: "som", modifier: 0, failure: "incapacitated", duration: { value: 10, units: "minutes" }, stress: { d10: 0, d6: 0, bonus: 0 }, successPsiPenalty: 0 };
  const KICK_STRESS = { d10: 1, d6: 0, bonus: 2 };
  const NECROSIS_TICKS = { damage: { d10: 0, d6: 1, bonus: 0 }, interval: "turn", ticks: null, modifier: 0, incapacitates: false };

  /**
   * Registers a compendium carrying a drug with options, one with a check and one with stress.
   * @returns {void}
   */
  function catalogue() {
    game.packs.set("eclipsephase.drugs-and-toxins", {
      metadata: { type: "Item", package: "eclipsephase" },
      getDocuments: async () => [
        { name: "Juice", type: "drug", system: { ...CURRENT, rollOptions: [JUICE_OPTION] } },
        { name: "Twitch", type: "drug", system: { ...CURRENT, useCheck: TWITCH_CHECK } },
        { name: "Psi-Kick", type: "drug", system: { ...CURRENT, wearOff: KICK_STRESS } },
        { name: "Necrosis", type: "drug", system: { ...CURRENT, overTime: NECROSIS_TICKS } },
        { name: "Meds", type: "drug", system: { ...CURRENT, healingAddition: "meds" } },
        { name: "Kick", type: "drug", system: { ...CURRENT, addictionType: "physical", addictionMod: "-10" } }
      ].map(data => new CONFIG.Item.documentClass(data))
    });
  }

  /**
   * Puts a world item into the world for the length of one test.
   * @param {Object} data - The item source data
   * @returns {Item} The item, already registered
   */
  function worldItem(data) {
    const item = new CONFIG.Item.documentClass(data);
    game.items.set(item.id, item);
    return item;
  }

  beforeEach(() => catalogue());
  afterEach(() => {
    game.packs.delete("eclipsephase.drugs-and-toxins");
    game.items.clear();
    game.actors.clear();
  });

  test("a world whose drugs only lack the new data is still offered the notice", async () => {
    worldItem({ name: "Juice", type: "drug", system: CURRENT });

    const rendered = await runLadderFrom("2.5");

    expect(rendered.map(entry => entry.copy)).toContain("notice:2.7");
  });

  test("drugs on a sheet get their namesake's options, check and stress", async () => {
    const actor = makeActor({
      type: "character",
      items: [
        { _id: "juice1", name: "Juice", type: "drug", system: CURRENT },
        { _id: "twitch1", name: "Twitch", type: "drug", system: CURRENT },
        { _id: "kick1", name: "Psi-Kick", type: "drug", system: { ...CURRENT, wearOff: { sv: "" } } }
      ]
    });

    await runLadderFrom("2.5");

    expect(actor.items.get("juice1").system.rollOptions).toEqual([JUICE_OPTION]);
    expect(actor.items.get("twitch1").system.useCheck).toEqual(TWITCH_CHECK);
    expect(actor.items.get("kick1").system.wearOff).toEqual(KICK_STRESS);
  });

  test("drugs on a sheet get their namesake's effects over time and healing addition", async () => {
    const actor = makeActor({
      type: "character",
      items: [
        { _id: "necro1", name: "Necrosis", type: "drug", system: CURRENT },
        { _id: "meds1", name: "Meds", type: "drug", system: CURRENT }
      ]
    });

    await runLadderFrom("2.5");

    expect(actor.items.get("necro1").system.overTime).toEqual(NECROSIS_TICKS);
    expect(actor.items.get("meds1").system.healingAddition).toEqual("meds");
  });

  test("ware on a sheet gets its namesake's situational bonuses, unless it has its own", async () => {
    const climb = [{ id: "climb", label: "ep2e.item.ware.rollOptions.climbing", value: 30, appliesTo: ["athletics"] }];
    game.packs.set("eclipsephase.ware", { metadata: { type: "Item", package: "eclipsephase" }, getDocuments: async () => [new CONFIG.Item.documentClass({ name: "Grip Pads", type: "ware", system: { rollOptions: climb } })] });
    const own = [{ id: "mine", label: "Homebrew", value: 5, appliesTo: [] }];
    const actor = makeActor({ type: "character", items: [
      { _id: "gp1", name: "Grip Pads", type: "ware", system: { rollOptions: [] } },
      { _id: "gp2", name: "Grip Pads", type: "ware", system: { rollOptions: own } }
    ] });

    try {
      await runLadderFrom("2.5");
    } finally {
      game.packs.delete("eclipsephase.ware");
    }

    expect(actor.items.get("gp1").system.rollOptions).toEqual(climb);
    expect(actor.items.get("gp2").system.rollOptions).toEqual(own);
  });

  test("drugs on a sheet get the book's corrections, but only where they still hold the old value", async () => {
    const inhibitorBlueprint = { name: "Inhibitor", changes: [{ key: "system.skillsMox.psi.mod", value: "-30", type: "add" }] };
    const actor = makeActor({
      type: "character",
      items: [
        { _id: "ban1", name: "Bananas Furiosas", type: "drug", system: { ...CURRENT, category: "drug", duration: { value: 1, units: "days" } } },
        { _id: "ban2", name: "Bananas Furiosas", type: "drug", system: { ...CURRENT, category: "drug", duration: { value: 2, units: "days" } } },
        { _id: "nerv1", name: "Nervex", type: "drug", system: { ...CURRENT, duration: { value: null, units: "" } } },
        { _id: "xs1", name: "Xsense", type: "drug", img: "systems/eclipsephase/resources/icons/toxic-512.png", system: { ...CURRENT, category: "toxin" } },
        { _id: "po1", name: "Psi-Opener", type: "drug", system: { ...CURRENT, cost: "minor" } },
        { _id: "bru1", name: "Brutalitea", type: "drug", system: { ...CURRENT, description: "+5 DUR, +1 WT, +3 DR." } },
        { _id: "inh1", name: "Inhibitor", type: "drug", system: CURRENT, effects: [inhibitorBlueprint] }
      ]
    });

    await runLadderFrom("2.5");

    expect(actor.items.get("ban1").system.duration).toMatchObject({ value: 8, units: "hours" });
    expect(actor.items.get("ban2").system.duration).toMatchObject({ value: 2, units: "days" });
    expect(actor.items.get("nerv1").system.duration).toMatchObject({ value: 10, units: "minutes" });
    expect(actor.items.get("xs1").system.category).toBe("drug");
    expect(actor.items.get("xs1").img).toBe("systems/eclipsephase/resources/icons/drug.png");
    expect(actor.items.get("po1").system.cost).toBe("rare");
    expect(actor.items.get("bru1").system.description).toBe("+5 DUR, +1 WT, +8 DR.");
    expect(Array.from(actor.items.get("inh1").effects)).toHaveLength(0);
  });

  test("a drug on a sheet that records no addiction gets its namesake's type and modifier", async () => {
    const actor = makeActor({ type: "character", items: [{ _id: "kick1", name: "Kick", type: "drug", system: { ...CURRENT, addictionType: "none", addictionMod: "-" } }] });

    await runLadderFrom("2.5");

    expect(actor.items.get("kick1").system).toMatchObject({ addictionType: "physical", addictionMod: "-10" });
  });

  test("a drug that already carries values of its own keeps them", async () => {
    const own = { id: "mine", label: "Homebrew", value: 5, appliesTo: [] };
    const drug = worldItem({ name: "Juice", type: "drug", system: { ...CURRENT, rollOptions: [own], wearOff: { d10: 0, d6: 2, bonus: 0 } } });

    await runLadderFrom("2.5");

    expect(drug.system.rollOptions).toEqual([own]);
    expect(drug.system.wearOff).toEqual({ d10: 0, d6: 2, bonus: 0 });
  });
});
