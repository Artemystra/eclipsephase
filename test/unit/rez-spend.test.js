import EPactorSheet from "../../module/actor/EPactorSheet.js";
import { registerRezSpendOptions, getRezSpendOptions, resetRegistry } from "../../module/api/registry.js";
import { resetWorld } from "../setup/factories.js";

const SPIKE_TABLE = {
  options: { 0: { id: "spike", label: "ep2e.spike.label", description: "ep2e.spike.description", type: "input" } },
  costMatrix: { spike: 3 }
};

describe("the Rez spending table", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); });

  test("falls back to the core table while nothing is registered", () => {
    expect(getRezSpendOptions()).toBeNull();
    expect(EPactorSheet.rezSpendTable(false)).toBe(EPactorSheet.REZ_SPEND_RAW);
  });

  test("uses the house rule table when those rules are active", () => {
    expect(EPactorSheet.rezSpendTable(true)).toBe(EPactorSheet.REZ_SPEND_HOMEBREW);
  });

  test("the core tables carry the entries the dialog needs", () => {
    const raw = Object.values(EPactorSheet.REZ_SPEND_RAW.options).map(entry => entry.id);
    const homebrew = Object.values(EPactorSheet.REZ_SPEND_HOMEBREW.options).map(entry => entry.id);

    expect(raw).toEqual(["rep", "skill", "spec", "psi", "lang", "apt", "flex", "traits"]);
    expect(homebrew).toEqual(["repH", "skill33", "skill3366", "skill66", "specH", "psiH", "langH", "aptH", "flexH", "traitsH"]);
  });

  test("every entry of both core tables has a cost", () => {
    for (const table of [EPactorSheet.REZ_SPEND_RAW, EPactorSheet.REZ_SPEND_HOMEBREW]) {
      for (const entry of Object.values(table.options)) {
        expect(typeof table.costMatrix[entry.id]).toEqual("number");
      }
    }
  });

  test("a registered table replaces the core one completely, house rules included", () => {
    expect(registerRezSpendOptions(SPIKE_TABLE)).toBe(true);

    expect(EPactorSheet.rezSpendTable(false)).toBe(SPIKE_TABLE);
    expect(EPactorSheet.rezSpendTable(true)).toBe(SPIKE_TABLE);
    expect(EPactorSheet.rezSpendTable(false).costMatrix.spike).toEqual(3);
  });

  test("a table without options or costs is refused", () => {
    expect(registerRezSpendOptions({ costMatrix: {} })).toBe(false);
    expect(registerRezSpendOptions({ options: {} })).toBe(false);
    expect(getRezSpendOptions()).toBeNull();
  });

  test("a second table is refused and the first one stands", () => {
    registerRezSpendOptions(SPIKE_TABLE);
    expect(registerRezSpendOptions({ options: { 0: { id: "other" } }, costMatrix: { other: 1 } })).toBe(false);
    expect(getRezSpendOptions()).toBe(SPIKE_TABLE);
  });
});
