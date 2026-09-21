import {
  registerStrainFamily,
  getStrainFamily,
  listStrainFamilies,
  hasStrainFamily,
  resetStrainFamilies,
  registerCoreStrainFamilies
} from "../../module/rolls/strain-families.js";

beforeEach(() => {
  resetStrainFamilies();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("registering a strain family", () => {
  test("a registered family can be read back under its id", () => {
    expect(registerStrainFamily("test", { label: "a.label" })).toBe(true);
    expect(getStrainFamily("test").label).toEqual("a.label");
    expect(hasStrainFamily("test")).toBe(true);
  });

  test("an id must be a non-empty string", () => {
    expect(registerStrainFamily("")).toBe(false);
    expect(registerStrainFamily(7)).toBe(false);
  });

  test("the same id is not taken twice", () => {
    registerStrainFamily("test", {});
    expect(registerStrainFamily("test", {})).toBe(false);
  });

  test("a substrate that is not a function is refused", () => {
    expect(registerStrainFamily("test", { substrate: "blocked" })).toBe(false);
    expect(hasStrainFamily("test")).toBe(false);
  });

  test("a rejected registration reports itself instead of throwing", () => {
    registerStrainFamily("test", {});
    registerStrainFamily("test", {});
    expect(console.error).toHaveBeenCalled();
  });
});

describe("the fields a definition leaves out", () => {
  test("they are filled with defaults rather than left undefined", () => {
    registerStrainFamily("bare", {});
    const family = getStrainFamily("bare");

    expect(family.id).toEqual("bare");
    expect(family.label).toEqual("");
    expect(family.tabLabel).toEqual("");
    expect(family.subStrains).toEqual({});
    expect(family.influence).toBeNull();
    expect(family.tierTraits).toEqual({});
    expect(family.feedback).toEqual({ target: "physical", copyKey: "" });
    expect(family.mismatchKey).toEqual("");
    expect(family.dataPath).toEqual("system.subStrain.byArchetype");
    expect(family.detailsPartial).toEqual("");
  });

  test("an influence that is not a function is refused rather than stored", () => {
    registerStrainFamily("table", { influence: { 1: { label: "x" } } });
    expect(getStrainFamily("table").influence).toBeNull();
  });

  test("a family without its own substrate rule permits everything", () => {
    registerStrainFamily("bare", {});
    expect(getStrainFamily("bare").substrate({})).toMatchObject({ blocked: false, penalised: false });
  });
});

describe("a family nobody registered", () => {
  test("it answers with a missing marker instead of undefined", () => {
    const family = getStrainFamily("nonesuch");
    expect(family.missing).toBe(true);
    expect(family.id).toEqual("nonesuch");
  });

  test("its substrate blocks, so an unknown family is never quietly treated as Psi", () => {
    const substrate = getStrainFamily("nonesuch").substrate({});
    expect(substrate.blocked).toBe(true);
    expect(substrate.reasonKey).toEqual("ep2e.roll.announce.strainFamilyMissing");
  });

  test("hasStrainFamily still says no", () => {
    expect(hasStrainFamily("nonesuch")).toBe(false);
  });
});

describe("the family the core registers", () => {
  beforeEach(() => {
    registerCoreStrainFamilies();
  });

  test("psi is there without a module doing anything", () => {
    expect(hasStrainFamily("psi")).toBe(true);
    expect(getStrainFamily("psi").missing).toBeUndefined();
  });

  test("ki is not, since it belongs to its own module now", () => {
    expect(hasStrainFamily("ki")).toBe(false);
    expect(getStrainFamily("ki").missing).toBe(true);
  });

  test("listing reports psi alone", () => {
    expect(listStrainFamilies().map(family => family.id)).toEqual(["psi"]);
  });

  test("psi carries its own sub-strain table and details partial", () => {
    expect(getStrainFamily("psi").subStrains).toBe(CONFIG.eclipsephase.strains);
    expect(getStrainFamily("psi").detailsPartial).toContain("strain-details-psi.html");
  });

  test("psi resolves its own influence", () => {
    expect(typeof getStrainFamily("psi").influence).toEqual("function");
    expect(getStrainFamily("psi").influence(1, { strainLabel: "architect", archetypeData: {}, actorModel: {} }).copy)
      .toEqual("ep2e.psi.effect.takeDamage");
  });

  test("a resolver returns null rather than throwing when the actor has no data for that result", () => {
    expect(getStrainFamily("psi").influence(3, { strainLabel: "architect", archetypeData: undefined, actorModel: {} })).toBeNull();
  });

  test("psi's feedback goes to the physical track", () => {
    expect(getStrainFamily("psi").feedback).toEqual({ target: "physical", copyKey: "ep2e.psi.effect.takeDamage" });
  });

  test("tier traits carry their pack, not just their name", () => {
    expect(getStrainFamily("psi").tierTraits[1]).toEqual({ name: "Psi I", pack: "eclipsephase.traits" });
  });
});

describe("what the strain tab is called", () => {
  /**
   * The label the sheet would put on the strain tab for a given family.
   * @param {Object} strainFamily - A registry entry, registered or missing
   * @returns {String} The label key, or the family's own id
   */
  function tabLabelFor(strainFamily) {
    if (strainFamily.tabLabel) return strainFamily.tabLabel;
    if (!strainFamily.missing || !strainFamily.id) return "ep2e.actorSheet.rightTabs.psiTab";
    return strainFamily.id.charAt(0).toUpperCase() + strainFamily.id.slice(1);
  }

  test("a registered family uses its own localised label", () => {
    registerCoreStrainFamilies();
    expect(tabLabelFor(getStrainFamily("psi"))).toEqual("ep2e.actorSheet.rightTabs.psiTab");
  });

  test("a family whose module is missing is named after itself, not after Psi", () => {
    expect(tabLabelFor(getStrainFamily("ki"))).toEqual("Ki");
    expect(tabLabelFor(getStrainFamily("gamma-wave"))).toEqual("Gamma-wave");
  });
});
