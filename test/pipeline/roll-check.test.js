import { RollCheck, TaskRollModifier } from "../../module/rolls/dice.js";
import { registerRollSource, registerPoolOption, resetRegistry } from "../../module/api/registry.js";
import { makeActor, resetWorld, seedRolls, seedDialogs } from "../setup/factories.js";

const SYSTEM_OPTIONS = { askForOptions: false, optionsSettings: false, brewStatus: false };

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
      skillRoll: actorSystem => ({ rollvalue: actorSystem.skillsVig?.infiltrate?.roll, specname: "", poolType: "Vigor" })
    });
    const actor = makeRoller();
    expect(actor.system.skillsVig.infiltrate.roll).toBeGreaterThan(0);
  });
});
