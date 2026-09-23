import { getStrainFamily, resetStrainFamilies, registerCoreStrainFamilies } from "../../module/rolls/strain-families.js";
import { strainSubstrate } from "../../module/common/body-markers.js";
import { tierTraitNames } from "../../module/common/sleight-prerequisite.js";

const CYBERBRAIN = "flags.eclipsephase.grantsCyberbrain";

/**
 * A character sleeved in one body, optionally carrying a Cyberbrain and optionally jamming.
 * @param {Object} options - nervousSystem is "bio", "synth" or "info"; cyberbrain and jamming are flags
 * @returns {Object} A stand-in actor carrying only what the substrate rules read
 */
function sleeved({ nervousSystem = "bio", cyberbrain = false, jamming = false, jamSuppressed = false } = {}) {
  const morph = { id: "morph1", type: "morph", system: { type: nervousSystem } };
  const ware = {
    type: "ware",
    system: { boundTo: "morph1" },
    effects: [{ changes: [{ key: CYBERBRAIN }] }]
  };
  const items = cyberbrain ? [morph, ware] : [morph];
  return {
    type: "character",
    system: { activeMorph: "morph1", activeJam: jamming ? "morph1" : "" },
    flags: jamSuppressed ? { eclipsephase: { psiJamSuppression: true } } : {},
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
    ["psi", "bio", false, true, true, false],
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

  test("psi is blocked while jamming is suppressed through the flag as well", () => {
    expect(strainSubstrate(sleeved({ jamSuppressed: true }), "psi").blocked).toBe(true);
  });

  test("jamming blocks psi wherever it is sleeved", () => {
    expect(strainSubstrate(sleeved({ nervousSystem: "synth", jamming: true }), "psi").jamBlocked).toBe(true);
  });
});

describe("the key each family explains itself with", () => {
  test("a blocked roll names the family's own reason", () => {
    expect(strainSubstrate(sleeved({ cyberbrain: true }), "psi").reasonKey).toEqual("ep2e.roll.announce.psi.noBioBrain");
  });

  test("jamming has a reason of its own", () => {
    expect(strainSubstrate(sleeved({ jamming: true }), "psi").reasonKey).toEqual("ep2e.roll.announce.jamming.noPsi");
  });

  test("the sheet tooltip is a separate, shorter key", () => {
    expect(strainSubstrate(sleeved({ cyberbrain: true }), "psi").tooltipKey).toEqual("ep2e.roll.announce.psi.substrateBlockedTooltip");
    expect(strainSubstrate(sleeved({ jamming: true }), "psi").tooltipKey).toEqual("ep2e.roll.announce.jamming.noPsiTooltip");
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
