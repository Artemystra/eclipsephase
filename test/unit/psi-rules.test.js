import { getStrainFamily, resetStrainFamilies, registerCoreStrainFamilies } from "../../module/rolls/strain-families.js";
import { strainSubstrate } from "../../module/common/morp-functions.js";
import { tierTraitNames } from "../../module/common/sleight-prerequisite.js";
import { resolvePhysicalDamageFormula } from "../../module/rolls/psi.js";

const CYBERBRAIN = "flags.eclipsephase.grantsCyberbrain";

/**
 * A character sleeved in one body, optionally carrying a Cyberbrain, optionally out jamming a drone.
 * @param {Object} options - nervousSystem is "bio", "synth" or "info"; cyberbrain and jamming are flags
 * @returns {Object} A stand-in actor carrying only what the substrate rules read
 */
function sleeved({ nervousSystem = "bio", cyberbrain = false, jamming = false } = {}) {
  const morph = { id: "morph1", type: "morph", system: { type: nervousSystem } };
  const ware = {
    type: "ware",
    system: { boundTo: "morph1" },
    effects: [{ changes: [{ key: CYBERBRAIN }] }]
  };
  const items = cyberbrain ? [morph, ware] : [morph];
  return {
    type: "character",
    system: { activeMorph: "morph1" },
    flags: jamming ? { eclipsephase: { jammedDrone: "drone1" } } : {},
    items: {
      get: id => items.find(i => i.id === id) ?? null,
      some: fn => items.some(fn)
    }
  };
}

beforeEach(() => {
  resetStrainFamilies();
  registerCoreStrainFamilies();
});

describe("which bodies each strain family works in", () => {
  const cases = [
    // body, cyberbrain, jamming, blocked, penalised
    ["psi", "bio", false, false, false, false],
    ["psi", "synth", false, false, false, true],
    ["psi", "bio", true, false, true, false],
    ["psi", "synth", true, false, true, false],
    ["psi", "info", false, false, true, false],
    ["psi", "bio", false, true, false, false],
    ["psi", "synth", false, true, false, true],
  ];

  test.each(cases)("%s in a %s body, cyberbrain %p, jamming %p", (family, nervousSystem, cyberbrain, jamming, blocked, penalised) => {
    const substrate = strainSubstrate(sleeved({ nervousSystem, cyberbrain, jamming }), family);
    expect(substrate.blocked).toBe(blocked);
    expect(substrate.penalised).toBe(penalised);
  });

  test("a family nobody registered is blocked whatever the body", () => {
    const substrate = strainSubstrate(sleeved({ nervousSystem: "bio" }), "gamma-wave");
    expect(substrate.blocked).toBe(true);
    expect(substrate.reasonKey).toEqual("ep2e.roll.announce.strainFamilyMissing");
  });

  test("jamming a drone no longer blocks psi: the ego's own brain stays on its sheet", () => {
    const substrate = strainSubstrate(sleeved({ jamming: true }), "psi");
    expect([substrate.blocked, substrate.jamBlocked]).toEqual([false, false]);
  });
});

describe("the key each family explains itself with", () => {
  test("a blocked roll names the family's own reason", () => {
    expect(strainSubstrate(sleeved({ cyberbrain: true }), "psi").reasonKey).toEqual("ep2e.roll.announce.psi.noBioBrain");
  });

  test("the sheet tooltip is a separate, shorter key", () => {
    expect(strainSubstrate(sleeved({ cyberbrain: true }), "psi").tooltipKey).toEqual("ep2e.roll.announce.psi.substrateBlockedTooltip");
  });

  test("the mismatch penalty reads from the family, not from the id", () => {
    expect(getStrainFamily("psi").mismatchKey).toEqual("ep2e.roll.announce.psi.substrateMismatch");
  });
});

describe("the prerequisite traits a sleight asks for", () => {
  test("the core family offers its own two tiers", () => {
    expect(tierTraitNames("psi")).toEqual({ 1: "Psi I", 2: "Psi II" });
  });

  test("an unregistered family offers none", () => {
    expect(tierTraitNames("gamma-wave")).toEqual({});
  });
});

describe("the physical damage a sleight's Infection Test deals", () => {
  test.each([
    [true, true, "2d6"],
    [false, true, "1d6"],
    [true, false, "1d6"],
    [false, false, null]
  ])("pushed %p with the virus rolling a 1 %p deals %p", (pushed, virusRolledOne, expected) => {
    expect(resolvePhysicalDamageFormula(pushed, virusRolledOne)).toEqual(expected);
  });
});
