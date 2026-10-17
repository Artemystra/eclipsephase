import { RollCheck, TaskRollModifier, resolveSkillRollValue } from "../../module/rolls/dice.js";
import { registerRollSource, registerPoolOption, resetRegistry } from "../../module/api/registry.js";
import { makeActor, resetWorld, seedRolls, seedDialogs } from "../setup/factories.js";

const SYSTEM_OPTIONS = { askForOptions: false, optionsSettings: false };

/**
 * A dialog answer that accepts the roll without choosing any option.
 * @param {Object} [overrides] - Fields merged into the answer
 * @returns {Object} The values the dialog would return
 */
function plainDialogAnswer(overrides = {}) {
  return { rollMode: "public", usePool: "", globalMod: 0, ...overrides };
}

/**
 * Builds a character able to make an Infiltrate check.
 * @returns {Object} The prepared actor
 */
function makeRoller() {
  return makeActor({
    type: "character",
    name: "Roller",
    system: {
      aptitudes: { ref: { value: 15 }, wil: { value: 15 }, cog: { value: 15 }, int: { value: 15 }, sav: { value: 15 }, som: { value: 15 } },
      skillsVig: { infiltrate: { value: 40 } },
      pools: { vigor: { value: 2 } }
    }
  });
}

/**
 * The dataset a sheet click would hand to RollCheck for a plain skill.
 * @param {Object} [overrides] - Fields merged into the dataset
 * @returns {Object} The dataset
 */
function skillDataset(overrides = {}) {
  return { name: "Infiltrate", key: "infiltrate", type: "skill", rollvalue: 55, pooltype: "Vigor", ...overrides };
}

describe("RollCheck hooks", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); });

  test("fires preRollDialog, preRoll and postRoll in that order", async () => {
    const actor = makeRoller();
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    const rollHooks = ["eclipsephase.preRollDialog", "eclipsephase.preRoll", "eclipsephase.postRoll"];
    const fired = global.__ep.hookCalls.map(call => call.event).filter(event => rollHooks.includes(event));
    expect(fired).toEqual(rollHooks);
  });

  test("a preRollDialog handler returning false cancels the roll", async () => {
    const actor = makeRoller();
    Hooks.on("eclipsephase.preRollDialog", context => {
      context.cancelReason = "ep2e.some.reason";
      return false;
    });
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    expect(global.__ep.createdMessages).toHaveLength(0);
    expect(global.__ep.notifications.warn).toContain("ep2e.some.reason");
    const fired = global.__ep.hookCalls.map(call => call.event);
    expect(fired).not.toContain("eclipsephase.preRoll");
  });

  test("preRollDialog receives the actor, the dataset and the roll source", async () => {
    const actor = makeRoller();
    let seen = null;
    Hooks.on("eclipsephase.preRollDialog", context => { seen = context; });
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    expect(seen.actor).toBe(actor);
    expect(seen.rolledFrom).toEqual("skill");
    expect(seen.dataset.key).toEqual("infiltrate");
  });

  test("a modifier added in preRoll reaches the result breakdown", async () => {
    const actor = makeRoller();
    Hooks.on("eclipsephase.preRoll", context => {
      context.modifiers.push(new TaskRollModifier("ep2e.spike.modifier", -15));
    });
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    const card = global.__ep.createdMessages[0];
    expect(card.content).toContain("ep2e.spike.modifier");
    expect(card.flags.eclipsephase.roll.rolledFrom).toEqual("skill");
  });

  test("a plain object modifier is accepted as well", async () => {
    const actor = makeRoller();
    Hooks.on("eclipsephase.preRoll", context => {
      context.modifiers.push({ text: "ep2e.spike.plain", value: 10 });
    });
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    expect(global.__ep.createdMessages[0].content).toContain("ep2e.spike.plain");
  });

  test("item data contributed in preRoll lands in the stored roll context", async () => {
    const actor = makeRoller();
    Hooks.on("eclipsephase.preRoll", context => {
      context.itemData = { weaponID: "fromHook" };
    });
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    expect(global.__ep.createdMessages[0].flags.eclipsephase.roll.item.weaponId).toEqual("fromHook");
  });

  test("postRoll sees the finished output and the created message", async () => {
    const actor = makeRoller();
    let seen = null;
    Hooks.on("eclipsephase.postRoll", context => { seen = context; });
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    expect(seen.outputData.rollResult).toEqual(42);
    expect(seen.message).not.toBeNull();
    expect(seen.blind).toBe(false);
  });
});

describe("RollCheck registry use", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); });

  test("a registered pool option appears in the dialog only for its own roll type", async () => {
    const actor = makeRoller();
    registerPoolOption({ value: "spikeOption", label: "ep2e.spike.option", when: context => context.rollType === "infiltrate" });
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    let renderedWith = null;
    const original = foundry.applications.handlebars.renderTemplate;
    foundry.applications.handlebars.renderTemplate = async (template, data) => {
      if (data?.poolOptions) renderedWith = data.poolOptions;
      return original(template, data);
    };

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");
    foundry.applications.handlebars.renderTemplate = original;

    expect(renderedWith.map(option => option.value)).toEqual(["spikeOption"]);
  });

  test("a registered pool option is filtered out for a different roll type", async () => {
    const actor = makeRoller();
    registerPoolOption({ value: "psiOnly", label: "ep2e.spike.psi", when: context => context.rollType === "psi" });
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    let renderedWith = null;
    const original = foundry.applications.handlebars.renderTemplate;
    foundry.applications.handlebars.renderTemplate = async (template, data) => {
      if (data?.poolOptions) renderedWith = data.poolOptions;
      return original(template, data);
    };

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");
    foundry.applications.handlebars.renderTemplate = original;

    expect(renderedWith).toEqual([]);
  });

  test("a registered roll source supplies the skill value used by the jamming comparison", () => {
    registerRollSource("spikeSource", {
      skillRoll: () => ({ rollvalue: 77, specname: "", poolType: "Vigor" })
    });
    const actor = makeRoller();

    expect(resolveSkillRollValue(actor.system, actor.items, { key: "infiltrate" }, "spikeSource")).toEqual(77);
    expect(resolveSkillRollValue(actor.system, actor.items, { key: "infiltrate" }, "unregistered")).not.toEqual(77);
  });
});

describe("RollCheck without brewStatus", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); });

  test("a roll completes normally when systemOptions carries no brewStatus at all", async () => {
    const actor = makeRoller();
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, { askForOptions: false, optionsSettings: false }, null, "skill");

    expect(global.__ep.createdMessages).toHaveLength(1);
    expect(global.__ep.createdMessages[0].flags.eclipsephase.roll.rolledFrom).toEqual("skill");
  });
});

describe("RollCheck skipDialog seam", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); });

  test("presetOptions answers the roll without opening a dialog", async () => {
    const actor = makeRoller();
    seedRolls([42]);

    await RollCheck(
      skillDataset(),
      actor.system,
      actor,
      { skipDialog: true, presetOptions: plainDialogAnswer() },
      null,
      "skill"
    );

    expect(global.__ep.createdMessages).toHaveLength(1);
    expect(global.__ep.createdMessages[0].flags.eclipsephase.roll.rolledFrom).toEqual("skill");
  });

  test("a preset globalMod reaches the roll the same way a dialog answer would", async () => {
    const actor = makeRoller();
    seedRolls([42]);

    await RollCheck(
      skillDataset(),
      actor.system,
      actor,
      { skipDialog: true, presetOptions: plainDialogAnswer({ globalMod: -10 }) },
      null,
      "skill"
    );

    const card = global.__ep.createdMessages[0];
    expect(card.content).toContain("-10");
  });
});

describe("a module's own chat-context block", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); });

  test("a preRoll handler's flags land whole in the stored roll context", async () => {
    const actor = makeRoller();
    Hooks.on("eclipsephase.preRoll", context => {
      context.flags.shop = { shopUuid: "Actor.shop0001", redeemLevels: 2 };
    });
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    const stored = global.__ep.createdMessages[0].flags.eclipsephase.roll;
    expect(stored.shop).toEqual({ shopUuid: "Actor.shop0001", redeemLevels: 2 });
    expect(stored.item.weaponId).toEqual("");
  });
});

describe("modifiers to all actions", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); });

  /**
   * The roller, under a running dose of a drug that costs every action something.
   * @param {String} name - The drug's name
   * @param {String} value - The modifier
   * @returns {Object} The prepared actor
   */
  function dosedRoller(name, value) {
    const actor = makeRoller();
    actor._source.effects = [];
    actor.effects.push(new ActiveEffect({
      name,
      duration: { value: 1, units: "hours" },
      changes: [{ key: "system.mods.globalMod", value, type: "add" }],
      flags: { eclipsephase: { dose: { name } } }
    }, { parent: actor }));
    actor.prepareData();
    return actor;
  }

  test("a running dose's penalty lands on every check as intoxicated, naming the drug beneath", async () => {
    const actor = dosedRoller("Twitch", "-20");
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    const card = global.__ep.createdMessages[0];
    expect(card.content).toContain("ep2e.roll.announce.intoxicated");
    expect(card.content).toContain("Twitch (-20)");
    expect(card.content).toContain("ep-mod-breakdown");
  });

  test("a check by a vehicle's own skill is not the ego acting, and is left alone", async () => {
    const actor = dosedRoller("Twitch", "-20");
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "vehicleSkill");

    expect(global.__ep.createdMessages[0].content).not.toContain("Twitch");
  });

  test("without a dose nothing is added", async () => {
    const actor = makeRoller();
    seedDialogs(plainDialogAnswer());
    seedRolls([42]);

    await RollCheck(skillDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    expect(global.__ep.createdMessages[0].content).not.toContain("ep2e.roll.announce.globalEffects");
  });
});

describe("the roll dialog", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); });

  /**
   * Runs a check while recording which dialog template it opened.
   * @param {Object} dataset - The dataset a sheet click hands RollCheck
   * @param {Object} answer - What the dialog answers
   * @returns {Promise<String[]>} The templates rendered, in order
   */
  async function checkRecordingTemplates(dataset, answer) {
    const actor = makeRoller();
    const rendered = [];
    const realRender = foundry.applications.handlebars.renderTemplate;
    foundry.applications.handlebars.renderTemplate = async (template, data) => {
      rendered.push(template);
      return realRender(template, data);
    };
    seedDialogs(answer);
    seedRolls([42]);
    try {
      await RollCheck(dataset, actor.system, actor, SYSTEM_OPTIONS, null, "skill");
    } finally {
      foundry.applications.handlebars.renderTemplate = realRender;
    }
    return rendered;
  }

  test.each([
    ["infiltrate", "systems/eclipsephase/templates/chat/skill-test-dialog.html"],
    ["fray", "systems/eclipsephase/templates/chat/skill-test-dialog.html"],
    ["guns", "systems/eclipsephase/templates/chat/gun-test-dialog.html"],
    ["melee", "systems/eclipsephase/templates/chat/melee-test-dialog.html"]
  ])("a %s check opens its own dialog", async (key, template) => {
    const rendered = await checkRecordingTemplates(skillDataset({ key }), { cancelled: true });

    expect(rendered[0]).toEqual(template);
  });

  test("cancelling the dialog rolls nothing and posts nothing", async () => {
    await checkRecordingTemplates(skillDataset(), { cancelled: true });

    expect(global.__ep.createdMessages).toHaveLength(0);
  });

  test("a specialization ticked in the dialog adds its +10", async () => {
    await checkRecordingTemplates(skillDataset(), plainDialogAnswer({ useSpec: true }));

    expect(global.__ep.createdMessages[0].content).toContain("ep2e.roll.announce.specialization");
  });

  test("a favor difficulty picked in the dialog lands on the roll", async () => {
    await checkRecordingTemplates(skillDataset(), plainDialogAnswer({ favorMod: "-20" }));

    expect(global.__ep.createdMessages[0].content).toContain("ep2e.roll.announce.favor");
  });

  test("a favor difficulty the sheet locked wins over the dialog, even when it is Moderate", async () => {
    const actor = makeRoller();
    seedDialogs(plainDialogAnswer({ favorMod: "-30" }));
    seedRolls([42]);
    let seen = null;
    Hooks.on("eclipsephase.preRoll", context => { seen = context.options.favorMod; });

    await RollCheck(skillDataset({ favorDifficultyLocked: true, favorDifficultyModifier: 0 }), actor.system, actor, SYSTEM_OPTIONS, null, "skill");

    expect(seen).toEqual(0);
  });
});

describe("drug options in the roll dialog", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); });

  /**
   * The roller under a dose of CR Gas: -20 to all actions, and -30 on sight-based Perceive that
   * replaces it when ticked.
   * @returns {Object} The prepared actor
   */
  function gassedRoller() {
    const actor = makeRoller();
    actor.effects.push(new ActiveEffect({
      _id: "crgas1", name: "CR Gas", duration: { value: 1, units: "hours" },
      changes: [{ key: "system.mods.globalMod", value: "-20", type: "add" }],
      flags: { eclipsephase: { dose: { name: "CR Gas", rollOptions: [{ id: "sight", label: "ep2e.item.drug.rollOptions.crgasSight", value: -30, appliesTo: ["perceive"], replacesGlobal: true }] } } }
    }, { parent: actor }));
    actor.prepareData();
    return actor;
  }

  /**
   * Rolls a check while recording what the dialog was rendered with.
   * @param {Object} actor - The roller
   * @param {Object} dataset - The check's dataset
   * @param {Object} answer - What the dialog answers
   * @returns {Promise<Object>} The dialog data and the posted card
   */
  async function rollRecording(actor, dataset, answer) {
    let dialogData = null;
    const realRender = foundry.applications.handlebars.renderTemplate;
    foundry.applications.handlebars.renderTemplate = async (template, data) => {
      if (String(template).includes("test-dialog")) dialogData = data;
      return realRender(template, data);
    };
    seedDialogs(answer);
    seedRolls([42]);
    try {
      await RollCheck(dataset, actor.system, actor, SYSTEM_OPTIONS, null, "skill");
    } finally {
      foundry.applications.handlebars.renderTemplate = realRender;
    }
    return { dialogData, card: global.__ep.createdMessages[0] };
  }

  test("a Perceive check offers the option, a Guns check does not", async () => {
    const actor = gassedRoller();

    const perceive = await rollRecording(actor, skillDataset({ key: "perceive", name: "Perceive" }), { cancelled: true });
    const guns = await rollRecording(actor, skillDataset({ key: "guns", name: "Guns" }), { cancelled: true });

    expect(perceive.dialogData.doseOptions.map(entry => entry.field)).toEqual(["doseOption-crgas1-sight"]);
    expect(guns.dialogData.doseOptions).toEqual([]);
  });

  test("ticked, it lands on the roll in place of the drug's own -20", async () => {
    const { card } = await rollRecording(gassedRoller(), skillDataset({ key: "perceive", name: "Perceive" }), plainDialogAnswer({ "doseOption-crgas1-sight": true }));

    expect(card.content).toContain("ep2e.item.drug.rollOptions.crgasSight");
    expect(card.content).toContain("-30");
    expect(card.content).not.toContain("ep2e.roll.announce.intoxicated");
  });

  test("left unticked, the drug's -20 stays and the option adds nothing", async () => {
    const { card } = await rollRecording(gassedRoller(), skillDataset({ key: "perceive", name: "Perceive" }), plainDialogAnswer());

    expect(card.content).toContain("ep2e.roll.announce.intoxicated");
    expect(card.content).not.toContain("ep2e.item.drug.rollOptions.crgasSight");
  });
});
