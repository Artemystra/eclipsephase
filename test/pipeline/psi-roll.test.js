import { RollCheck } from "../../module/rolls/dice.js";
import { rollPsiEffect, confirmChiPush } from "../../module/rolls/psi.js";
import { resetStrainFamilies, registerCoreStrainFamilies, registerStrainFamily } from "../../module/rolls/strain-families.js";
import { resetRegistry } from "../../module/api/registry.js";
import { makeActor, resetWorld, seedRolls, seedDialogs } from "../setup/factories.js";

const SYSTEM_OPTIONS = { askForOptions: false, optionsSettings: false };
const CYBERBRAIN = "flags.eclipsephase.grantsCyberbrain";

/**
 * A psi-capable character sleeved in one body, optionally carrying a Cyberbrain.
 * @param {Object} options - nervousSystem is "bio", "synth" or "info"; family is what the sleight names
 * @returns {Object} The prepared actor
 */
function makeSleightUser({ nervousSystem = "bio", cyberbrain = false, family = "psi" } = {}) {
  const items = [
    { _id: "morph1", name: "Body", type: "morph", system: { type: nervousSystem } },
    {
      _id: "sleight1", name: "Test Sleight", type: "aspect",
      system: { strainFamily: family, psiType: "chi", infection: 0, description: "", actionName: "", durationName: "" }
    }
  ];
  if (cyberbrain) {
    items.push({
      _id: "brain", name: "Cyberbrain", type: "ware",
      system: { boundTo: "morph1" },
      effects: [{ name: "Cyberbrain", system: { changes: [{ key: CYBERBRAIN, value: "true", type: "override" }] } }]
    });
  }
  const archetype = family === "ki" ? "crucible" : "architect";
  const influence = Object.fromEntries([2, 3, 4, 5, 6].map(n => [`influence${n}`, { label: "motivation", description: "none" }]));

  return makeActor({
    type: "character",
    name: "Sleight User",
    system: {
      subStrain: { label: archetype, byArchetype: { [archetype]: influence } },
      activeMorph: "morph1",
      aptitudes: { wil: { value: 15 }, cog: { value: 15 }, int: { value: 15 }, sav: { value: 15 }, som: { value: 15 }, ref: { value: 15 } },
      psiStrain: { infection: 10 },
      pools: { insight: { value: 2 }, flex: { value: 0 } }
    },
    items
  });
}

/**
 * The dataset the psi tab hands to RollCheck for a sleight.
 * @returns {Object} The dataset
 */
function sleightDataset() {
  return { name: "Test Sleight", key: "psi", type: "psi", rollvalue: 50, itemid: "sleight1", pooltype: "Insight" };
}

beforeEach(() => {
  resetWorld();
  resetRegistry();
  resetStrainFamilies();
  registerCoreStrainFamilies();
  seedDialogs([{ rollMode: "public", usePool: "", globalMod: 0 }]);
  seedRolls([40]);
});

describe("a sleight the body cannot carry is refused before it rolls", () => {
  test("Ki without a Cyberbrain does not roll", async () => {
    const actor = makeSleightUser({ nervousSystem: "synth", cyberbrain: false, family: "ki" });
    await RollCheck(sleightDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "psi");

    expect(global.__ep.createdMessages.length).toEqual(0);
    expect(global.__ep.notifications.warn).toContain("ep2e.roll.announce.ki.noCyberbrain");
  });

  test("Psi from inside a Cyberbrain does not roll", async () => {
    const actor = makeSleightUser({ nervousSystem: "synth", cyberbrain: true, family: "psi" });
    await RollCheck(sleightDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "psi");

    expect(global.__ep.createdMessages.length).toEqual(0);
    expect(global.__ep.notifications.warn).toContain("ep2e.roll.announce.psi.noBioBrain");
  });

  test("a family no module registered does not roll either", async () => {
    const actor = makeSleightUser({ nervousSystem: "bio", family: "gamma-wave" });
    await RollCheck(sleightDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "psi");

    expect(global.__ep.createdMessages.length).toEqual(0);
    expect(global.__ep.notifications.warn).toContain("ep2e.roll.announce.strainFamilyMissing");
  });

  test("the same sleight rolls once the body suits it", async () => {
    const actor = makeSleightUser({ nervousSystem: "bio", family: "psi" });
    await RollCheck(sleightDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "psi");

    expect(global.__ep.createdMessages.length).toEqual(1);
    expect(global.__ep.notifications.warn).toEqual([]);
  });
});

describe("the substrate mismatch penalty", () => {
  /**
   * The breakdown a finished roll rendered into its card. Modifiers live in the rendered card, not
   * in the stored context, so this is where a penalty has to be looked for.
   * @returns {String} The card's content
   */
  function lastBreakdown() {
    return global.__ep.createdMessages.at(-1)?.content ?? "";
  }

  test("Psi in a synthetic body takes -30 under its own label", async () => {
    const actor = makeSleightUser({ nervousSystem: "synth", family: "psi" });
    await RollCheck(sleightDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "psi");

    expect(lastBreakdown()).toContain("ep2e.roll.announce.psi.substrateMismatch");
    expect(lastBreakdown()).toContain("-30");
  });

  test("Ki in a biological body takes -30 under its own label", async () => {
    const actor = makeSleightUser({ nervousSystem: "bio", cyberbrain: true, family: "ki" });
    await RollCheck(sleightDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "psi");

    expect(lastBreakdown()).toContain("ep2e.roll.announce.ki.substrateMismatch");
    expect(lastBreakdown()).toContain("-30");
  });

  test("a body that suits the family takes no penalty", async () => {
    const actor = makeSleightUser({ nervousSystem: "bio", family: "psi" });
    await RollCheck(sleightDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "psi");

    expect(lastBreakdown()).not.toContain("substrateMismatch");
  });
});

describe("a family registered by something other than the core", () => {
  test("its own substrate rule decides, not Psi's", async () => {
    registerStrainFamily("static", {
      label: "x.label",
      tabLabel: "x.tab",
      substrate: () => ({ blocked: true, jamBlocked: false, penalised: false, reasonKey: "x.blocked", tooltipKey: "x.tip" }),
      mismatchKey: "x.mismatch"
    });
    const actor = makeSleightUser({ nervousSystem: "bio", family: "static" });
    await RollCheck(sleightDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "psi");

    expect(global.__ep.createdMessages.length).toEqual(0);
    expect(global.__ep.notifications.warn).toContain("x.blocked");
  });
});

describe("where feedback damage lands", () => {
  /**
   * Records every update a sleight user is asked to apply, so the tracks the feedback wrote to
   * can be read back without a real document.
   * @param {Object} options - Passed through to makeSleightUser
   * @returns {Object} The actor, carrying its updates in appliedUpdates
   */
  function recordingUser(options) {
    const actor = makeSleightUser(options);
    actor.appliedUpdates = [];
    const realUpdate = actor.update.bind(actor);
    actor.update = async changes => {
      actor.appliedUpdates.push(changes);
      return realUpdate(changes);
    };
    return actor;
  }

  /**
   * The keys of every update applied to an actor.
   * @param {Object} actor - The recording actor
   * @returns {String[]} The keys
   */
  function updatedKeys(actor) {
    return actor.appliedUpdates.flatMap(update => Object.keys(update));
  }

  test("Psi feedback hits Durability and wounds", async () => {
    const actor = recordingUser({ nervousSystem: "bio", family: "psi" });
    seedRolls([3, 3]);
    await rollPsiEffect(actor, game.user._id, true, {}, null, "public");

    expect(updatedKeys(actor)).toEqual(expect.arrayContaining(["system.health.physical.value", "system.physical.wounds"]));
    expect(updatedKeys(actor)).not.toContain("system.health.mental.value");
  });

  test("Ki feedback hits Stress and trauma instead", async () => {
    const actor = recordingUser({ nervousSystem: "synth", cyberbrain: true, family: "ki" });
    seedRolls([3, 3]);
    await rollPsiEffect(actor, game.user._id, true, {}, null, "public");

    expect(updatedKeys(actor)).toEqual(expect.arrayContaining(["system.health.mental.value", "system.mental.trauma"]));
    expect(updatedKeys(actor)).not.toContain("system.health.physical.value");
  });
});

describe("a Chi push asks about the body for itself", () => {
  test("it is refused when the family cannot work in this body", async () => {
    const actor = makeSleightUser({ nervousSystem: "synth", cyberbrain: false, family: "ki" });
    const before = actor.system.psiStrain.infection;
    await confirmChiPush(actor, "sleight1", "public");

    expect(actor.system.psiStrain.infection).toEqual(before);
    expect(global.__ep.notifications.warn).toContain("ep2e.roll.announce.ki.noCyberbrain");
  });

  test("a family no module registered is refused too", async () => {
    const actor = makeSleightUser({ nervousSystem: "bio", family: "gamma-wave" });
    await confirmChiPush(actor, "sleight1", "public");

    expect(global.__ep.notifications.warn).toContain("ep2e.roll.announce.strainFamilyMissing");
  });

  test("it goes ahead when the body suits the family", async () => {
    const actor = makeSleightUser({ nervousSystem: "bio", family: "psi" });
    const before = actor.system.psiStrain.infection;
    seedRolls([3, 3]);
    await confirmChiPush(actor, "sleight1", "public");

    expect(actor.system.psiStrain.infection).toBeGreaterThan(before);
  });
});
