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

describe("the families the core registers", () => {
  beforeEach(() => {
    registerCoreStrainFamilies();
  });

  test("psi is there without a module doing anything", () => {
    expect(hasStrainFamily("psi")).toBe(true);
    expect(getStrainFamily("psi").missing).toBeUndefined();
  });

  test("ki is there too, until its module takes it over", () => {
    expect(hasStrainFamily("ki")).toBe(true);
  });

  test("listing reports both, psi first", () => {
    expect(listStrainFamilies().map(family => family.id)).toEqual(["psi", "ki"]);
  });

  test("each family carries its own sub-strain table and details partial", () => {
    expect(getStrainFamily("psi").subStrains).toBe(CONFIG.eclipsephase.strains);
    expect(getStrainFamily("ki").subStrains).toBe(CONFIG.eclipsephase.kiStrains);
    expect(getStrainFamily("psi").detailsPartial).toContain("strain-details-psi.html");
    expect(getStrainFamily("ki").detailsPartial).toContain("strain-details-ki.html");
  });

  test("only ki is table-driven; psi's influence branch is bespoke", () => {
    expect(getStrainFamily("ki").influence).toBe(CONFIG.eclipsephase.kiInfluence);
    expect(getStrainFamily("psi").influence).toBeNull();
  });

  test("feedback damage goes to a different track per family", () => {
    expect(getStrainFamily("psi").feedback).toEqual({ target: "physical", copyKey: "ep2e.psi.effect.takeDamage" });
    expect(getStrainFamily("ki").feedback).toEqual({ target: "mental", copyKey: "ep2e.ki.effect.takeStrain" });
  });

  test("tier traits carry their pack, not just their name", () => {
    expect(getStrainFamily("psi").tierTraits[1]).toEqual({ name: "Psi I", pack: "eclipsephase.traits" });
    expect(getStrainFamily("ki").tierTraits[2]).toEqual({ name: "Ki II", pack: "eclipsephase.traits" });
  });
});
