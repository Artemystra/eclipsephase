import fs from "fs";
import path from "path";
import {
  parseDurationText,
  parseAddictionMod,
  normaliseDrugSystem,
  packIsSealed,
  DOSES_PER_PACK,
  DURATION_UNITS
} from "../../module/common/drugs.js";

const PACK_DIR = path.resolve(__dirname, "../../src/packs/drugs-and-toxins");

/**
 * Every drug item shipped in the compendium, read from its source JSON.
 * @returns {Object[]} The item sources
 */
function packDrugs() {
  return fs.readdirSync(PACK_DIR)
    .filter(file => file.endsWith(".json"))
    .map(file => JSON.parse(fs.readFileSync(path.join(PACK_DIR, file), "utf8")))
    .filter(item => item.type === "drug");
}

describe("parseDurationText", () => {
  test.each([
    ["1 minutes", 1, "minutes"],
    ["10 minutes", 10, "minutes"],
    ["15 minutes", 15, "minutes"],
    ["20 minutes", 20, "minutes"],
    ["1 hour", 1, "hours"],
    ["2 hours", 2, "hours"],
    ["3 hours", 3, "hours"],
    ["6 hours", 6, "hours"],
    ["8 hours", 8, "hours"],
    ["12 hours", 12, "hours"],
    ["36 hours", 36, "hours"],
    ["1 day", 1, "days"]
  ])("%s reads as %i %s", (text, value, units) => {
    expect(parseDurationText(text)).toEqual({ value, units });
  });

  test("a string naming two spans keeps the longer one, so BTX2 lasts its hour", () => {
    expect(parseDurationText("3 turns/1 hour")).toEqual({ value: 1, units: "hours" });
  });

  test("a span given only in turns becomes rounds, which the clock ticks at three seconds", () => {
    expect(parseDurationText("3 turns")).toEqual({ value: 3, units: "rounds" });
    expect(parseDurationText("20 rounds")).toEqual({ value: 20, units: "rounds" });
  });

  test.each([
    ["2 weeks", 14],
    ["1 month", 30],
    ["1 year", 365]
  ])("%s folds into %i days, the longest unit a drug duration uses", (text, value) => {
    expect(parseDurationText(text)).toEqual({ value, units: "days" });
  });

  test("every unit it can produce is one the item sheet offers", () => {
    const produced = ["1 second", "1 minute", "1 hour", "1 day", "2 weeks", "1 month", "1 year", "3 turns"]
      .map(text => parseDurationText(text).units);
    expect(new Set(produced)).toEqual(new Set(["seconds", "minutes", "hours", "days", "rounds"]));
    for (const units of produced) expect(DURATION_UNITS).toContain(units);
  });

  test("a duration that never ends on its own has no value", () => {
    expect(parseDurationText("Permanent")).toEqual({ value: null, units: "" });
    expect(parseDurationText("-")).toEqual({ value: null, units: "" });
  });

  test("abbreviations and odd spacing still parse", () => {
    expect(parseDurationText("30min")).toEqual({ value: 30, units: "minutes" });
    expect(parseDurationText("  4   hrs  ")).toEqual({ value: 4, units: "hours" });
  });

  test("a zero or negative span counts as no duration rather than an instant one", () => {
    expect(parseDurationText("0 hours")).toEqual({ value: null, units: "" });
  });

  test("anything unusable reads as no duration instead of throwing", () => {
    for (const value of [null, undefined, "", "   ", 42, {}, [], "ask the GM"]) {
      expect(parseDurationText(value)).toEqual({ value: null, units: "" });
    }
  });

  test("the compendium is the 49 drugs the plan counted", () => {
    expect(packDrugs()).toHaveLength(49);
  });
});

describe("the shipped drug compendium", () => {
  test("every drug carries a duration span rather than the text it was authored with", () => {
    for (const drug of packDrugs()) {
      expect(Object.keys(drug.system.duration).sort()).toEqual(["units", "value"]);
    }
  });

  test("a timed drug names a real unit and a span above zero", () => {
    for (const drug of packDrugs()) {
      const { value, units } = drug.system.duration;
      if (value === null) continue;
      expect(value).toBeGreaterThan(0);
      expect(DURATION_UNITS).toContain(units);
    }
  });

  test("only the two drugs that never end on their own are open-ended", () => {
    const openEnded = packDrugs().filter(drug => drug.system.duration.value === null);

    expect(openEnded.map(drug => drug.name).sort()).toEqual(["Nervex", "Retcon"]);
    for (const drug of openEnded) expect(drug.system.duration.units).toEqual("");
  });

  test("every drug ships as one full pack in the consumable slot", () => {
    for (const drug of packDrugs()) {
      expect(drug.system.quantity).toEqual(1);
      expect(drug.system.usagesUsed).toEqual(0);
      expect(drug.system.usagesMax).toEqual(DOSES_PER_PACK);
      expect(drug.system.slotType).toEqual("consumable");
      expect(drug.system.displayCategory).toEqual("consumable");
    }
  });

  test("no drug carries effects of its own yet, so none can apply before a dose is taken", () => {
    for (const drug of packDrugs()) expect(drug.effects).toEqual([]);
  });
});

describe("parseAddictionMod", () => {
  test.each([["-", null], ["-10", -10], ["-20", -20], ["+10", 10], ["+20", 20]])(
    "%s reads as %s",
    (text, expected) => expect(parseAddictionMod(text)).toEqual(expected)
  );

  test("anything unusable reads as no modifier", () => {
    for (const value of [null, undefined, "", "none", {}]) expect(parseAddictionMod(value)).toBeNull();
  });

  test("every addiction modifier in the shipped compendium parses", () => {
    for (const drug of packDrugs()) {
      const parsed = parseAddictionMod(drug.system.addictionMod);
      expect(parsed === null || Number.isInteger(parsed)).toBe(true);
    }
  });
});

describe("packIsSealed", () => {
  test("an untouched pack is sealed, so it can go into a sprayer", () => {
    expect(packIsSealed({ usagesUsed: 0, usagesMax: 5 })).toBe(true);
  });

  test("a pack somebody has taken a dose out of is not", () => {
    expect(packIsSealed({ usagesUsed: 1, usagesMax: 5 })).toBe(false);
    expect(packIsSealed({ usagesUsed: 5, usagesMax: 5 })).toBe(false);
  });

  test("how many doses a pack holds does not decide whether it is sealed", () => {
    expect(packIsSealed({ usagesUsed: 0, usagesMax: 1 })).toBe(true);
    expect(packIsSealed({ usagesUsed: 0, usagesMax: 20 })).toBe(true);
  });

  test("every drug in the shipped compendium ships sealed", () => {
    for (const drug of packDrugs()) expect(packIsSealed(drug.system)).toBe(true);
  });

  test("anything unusable is not sealed, rather than throwing", () => {
    for (const system of [null, undefined, {}, { usagesUsed: "x" }]) {
      expect(packIsSealed(system)).toBe(false);
    }
  });
});

describe("normaliseDrugSystem", () => {
  test("a duration still held as text is rewritten into the shape the schema now has", () => {
    expect(normaliseDrugSystem({ duration: "8 hours" })).toMatchObject({
      duration: { value: 8, units: "hours" }
    });
  });

  test("a duration already in the right shape is left alone", () => {
    const update = normaliseDrugSystem({
      duration: { value: 8, units: "hours" },
      usagesUsed: 0,
      usagesMax: 5
    });
    expect(update).toBeNull();
  });

  test("a pack with no dose counter is read as untouched, holding the five a purchase buys", () => {
    expect(normaliseDrugSystem({ duration: { value: 1, units: "hours" } })).toMatchObject({
      usagesUsed: 0,
      usagesMax: DOSES_PER_PACK
    });
  });

  test("a part-used pack keeps the doses it has already given up", () => {
    const update = normaliseDrugSystem({ duration: { value: 1, units: "hours" }, usagesUsed: 2 });
    expect(update.usagesUsed).toBeUndefined();
    expect(update.usagesMax).toEqual(DOSES_PER_PACK);
  });

  test("an unusable dose counter is repaired rather than carried forward", () => {
    expect(normaliseDrugSystem({ duration: { value: 1, units: "hours" }, usagesUsed: -3, usagesMax: 0 }))
      .toMatchObject({ usagesUsed: 0, usagesMax: DOSES_PER_PACK });
  });

  test("a fully used pack stays fully used, not reset", () => {
    const update = normaliseDrugSystem({ duration: { value: 1, units: "hours" }, usagesUsed: 5, usagesMax: 5 });
    expect(update).toBeNull();
  });

  test("lowering how many doses a pack holds trims a pack recorded as more used than that", () => {
    const update = normaliseDrugSystem({ duration: { value: 1, units: "hours" }, usagesUsed: 5, usagesMax: 3 });
    expect(update).toEqual({ usagesUsed: 3 });
  });

  test("a pack used less than it holds is left as it is", () => {
    const update = normaliseDrugSystem({ duration: { value: 1, units: "hours" }, usagesUsed: 2, usagesMax: 3 });
    expect(update).toBeNull();
  });

  test("a drug authored with a single dose starts untouched", () => {
    const update = normaliseDrugSystem({ duration: { value: 1, units: "hours" }, usagesMax: 1 });
    expect(update).toEqual({ usagesUsed: 0 });
  });

  test("an empty duration becomes the open-ended shape, not a string", () => {
    expect(normaliseDrugSystem({ duration: null }).duration).toEqual({ value: null, units: "" });
  });

  test("it never throws on junk", () => {
    for (const system of [null, undefined, {}, { duration: [] }]) {
      expect(() => normaliseDrugSystem(system)).not.toThrow();
    }
  });
});
