import fs from "fs";
import { diceFormula } from "../../module/common/general-sheet-functions.js";
import path from "path";
import {
  parseDurationText,
  parseAddictionMod,
  normaliseDrugSystem,
  drugCategory,
  parseDiceValue,
  DRUG_CATEGORIES,
  canBeAmmo,
  offersAmmoChoice,
  isAmmoPack,
  dosesRemaining,
  afterDose,
  drugVectors,
  drugVector,
  needsVectorChoice,
  doseOnset,
  sameDrugForm,
  VECTOR_KEYS,
  DOSES_PER_PACK,
  DURATION_UNITS,
  payloadFits,
  choosePayload
} from "../../module/common/drugs.js";
import { registerPayloadSource, resetRegistry } from "../../module/api/registry.js";
import { registerSystemPacks, resetWorld } from "../setup/factories.js";

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

  test("no drug the book lists has gone missing, and no name appears twice", () => {
    const names = packDrugs().map(drug => drug.name);
    expect(names.length).toBeGreaterThanOrEqual(50);
    expect(new Set(names).size).toEqual(names.length);
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

  test("only Retcon, which never ends on its own, is open-ended", () => {
    const openEnded = packDrugs().filter(drug => drug.system.duration.value === null);

    expect(openEnded.map(drug => drug.name).sort()).toEqual(["Retcon"]);
    for (const drug of openEnded) expect(drug.system.duration.units).toEqual("");
  });

  test("a drug shows the drug icon and a toxin the toxin icon", () => {
    const icon = { drug: "systems/eclipsephase/resources/icons/drug.png", toxin: "systems/eclipsephase/resources/icons/toxic-512.png" };

    for (const drug of packDrugs()) expect({ name: drug.name, img: drug.img }).toEqual({ name: drug.name, img: icon[drug.system.category] });
  });

  test("the errata's durations and the book's cost tiers are the ones shipped", () => {
    const named = name => packDrugs().find(drug => drug.name === name).system;

    expect(named("Bananas Furiosas").duration).toMatchObject({ value: 8, units: "hours" });
    expect(named("Nervex").duration).toMatchObject({ value: 10, units: "minutes" });
    expect([named("Psi-Opener").cost, named("Psi-Kick").cost]).toEqual(["rare", "rare"]);
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

});

describe("the blueprint effects authored from the book", () => {
  const ACTOR_BASE = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../template.json"), "utf8")).Actor.templates.base;
  const RAW_INT_TARGETS = ["system.mods.woundMod", "system.mods.traumaMod"];
  const DEAD_OR_DERIVED = [
    "system.physical.wt", "system.physical.dr", "system.mental.tt", "system.mental.ir",
    "system.health.physical.max", "system.health.mental.max"
  ];

  /**
   * Every change on every drug's own effects, with the drug it belongs to.
   * @returns {Object[]} {drug, key, value}
   */
  function allChanges() {
    const out = [];
    for (const drug of packDrugs()) {
      for (const effect of drug.effects) {
        for (const change of effect.system?.changes ?? []) out.push({ drug: drug.name, key: change.key, value: change.value });
      }
    }
    return out;
  }

  /**
   * Whether a change key names a field that exists on the actor's base template.
   * @param {String} key - The dot path, starting with "system."
   * @returns {Boolean} True when every segment resolves
   */
  function resolvesOnActor(key) {
    let node = ACTOR_BASE;
    for (const step of key.replace(/^system\./, "").split(".")) {
      if (node === null || typeof node !== "object" || !(step in node)) return false;
      node = node[step];
    }
    return true;
  }

  test("exactly the flat, unconditional modifiers carry a blueprint effect", () => {
    const withEffects = packDrugs().filter(drug => drug.effects.length > 0).map(drug => drug.name).sort();
    expect(withEffects).toEqual([
      "Blab", "Brutalitea", "CR Gas", "Comfurt", "DDR", "Drive", "Grin", "Kick", "Klar",
      "MRDR", "Nervex", "Neuropath", "Nofux", "Orbital Hash", "Phlo", "Psike-Out", "TGS", "Tongzhi", "Twitch"
    ]);
  });

  test("the penalties to all actions sit on the global modifier, at the book's values", () => {
    const globalOf = name => allChanges().filter(c => c.drug === name).map(c => [c.key, c.value]);
    expect(globalOf("Twitch")).toEqual([["system.mods.globalMod", "-20"]]);
    expect(globalOf("Nervex")).toEqual([["system.mods.globalMod", "-20"]]);
    expect(globalOf("DDR")).toEqual([["system.mods.globalMod", "-20"]]);
    expect(globalOf("Neuropath")).toEqual([["system.mods.globalMod", "-30"]]);
    expect(globalOf("CR Gas")).toEqual([["system.mods.globalMod", "-20"]]);
  });

  test("every change targets a field that actually exists on an actor", () => {
    for (const { drug, key } of allChanges()) {
      expect({ drug, key, resolves: resolvesOnActor(key) }).toEqual({ drug, key, resolves: true });
    }
  });

  test("no change targets a dead key or a derived stat - those follow from DUR, LUC and the roll pipeline", () => {
    for (const { key } of allChanges()) expect(DEAD_OR_DERIVED).not.toContain(key);
  });

  test("the targets the actor reads raw carry ints, the ones it evals carry strings", () => {
    for (const { drug, key, value } of allChanges()) {
      const expectedType = RAW_INT_TARGETS.includes(key) ? "number" : "string";
      expect({ drug, key, type: typeof value }).toEqual({ drug, key, type: expectedType });
    }
  });

  test("ignoring a wound or a trauma is written as a negative count, the way the sheet reads it", () => {
    for (const { key, value } of allChanges()) {
      if (RAW_INT_TARGETS.includes(key)) expect(value).toBeLessThan(0);
    }
  });

  test("the derived-stat drugs move only the stat the others follow from", () => {
    const keysOf = name => allChanges().filter(c => c.drug === name).map(c => c.key);
    expect(keysOf("Brutalitea")).toEqual(["system.mods.durmod"]);
    expect(keysOf("Comfurt")).toEqual(["system.mods.lucmod"]);
  });

  test("a WIL Check bonus is a check modifier, never a change to WIL itself", () => {
    const tgs = allChanges().filter(c => c.drug === "TGS").map(c => c.key);
    expect(tgs).toContain("system.aptitudes.wil.mod");
    expect(tgs).not.toContain("system.aptitudes.wil.value");
  });

  test("every blueprint stays a blueprint: no duration and the drug's own name", () => {
    for (const drug of packDrugs()) {
      for (const effect of drug.effects) {
        expect(effect.duration.value).toBeNull();
        expect(effect.name).toEqual(drug.name);
        expect(effect._key).toEqual(`!items.effects!${drug._id}.${effect._id}`);
      }
    }
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

describe("the forms a drug comes in", () => {
  test("the four forms are the ones the item sheet lists", () => {
    expect(VECTOR_KEYS).toEqual(["dermal", "inhalation", "injection", "oral"]);
  });

  test("a drug sold in several forms reports them all, in sheet order", () => {
    const grin = { dermal: true, inhalation: true, injection: true, oral: true };
    expect(drugVectors(grin).map(v => v.key)).toEqual(["dermal", "inhalation", "injection", "oral"]);
  });

  test("a drug sold in several forms still needs one picked, and names none on its own", () => {
    const grin = { injection: true, oral: true };
    expect(needsVectorChoice(grin)).toBe(true);
    expect(drugVector(grin)).toBeNull();
  });

  test("once one form is kept, that is the form of the pack", () => {
    const injected = { dermal: false, inhalation: false, injection: true, oral: false };
    expect(needsVectorChoice(injected)).toBe(false);
    expect(drugVector(injected).key).toEqual("injection");
  });

  test("a drug with no form at all needs no choice", () => {
    expect(needsVectorChoice({})).toBe(false);
    expect(drugVector({})).toBeNull();
  });

  test("every shipped drug either needs a form picked, already has one, or is an app", () => {
    for (const drug of packDrugs()) {
      const kinds = [needsVectorChoice(drug.system), !!drugVector(drug.system), drug.system.drugType === "electronic"];
      expect({ name: drug.name, kinds: kinds.filter(Boolean).length }).toEqual({ name: drug.name, kinds: 1 });
    }
  });
});

describe("how soon a dose takes hold", () => {
  test.each([
    ["inhalation", "ep2e.item.drug.onset.immediate"],
    ["dermal", "ep2e.item.drug.onset.turn"],
    ["injection", "ep2e.item.drug.onset.turn"],
    ["oral", "ep2e.item.drug.onset.minutes15"]
  ])("a %s dose: %s", (vector, expected) => {
    expect(doseOnset({ [vector]: true })).toEqual(expected);
  });

  test("an electronic drug runs like software, whatever forms its data lists", () => {
    expect(doseOnset({ drugType: "electronic" })).toEqual("ep2e.item.drug.onset.app");
    expect(doseOnset({ drugType: "electronic", oral: true })).toEqual("ep2e.item.drug.onset.app");
  });

  test("a pack with no single form recorded states no onset rather than guessing one", () => {
    expect(doseOnset({ injection: true, oral: true })).toBeNull();
    expect(doseOnset({})).toBeNull();
  });

  test("every electronic drug in the compendium reads as an app", () => {
    const electronic = packDrugs().filter(drug => drug.system.drugType === "electronic");

    expect(electronic.map(drug => drug.name).sort()).toEqual(["DDR", "Linkstate", "Randomizer"]);
    for (const drug of electronic) expect(doseOnset(drug.system)).toEqual("ep2e.item.drug.onset.app");
  });
});

describe("sameDrugForm", () => {
  test("two packs bought in the same form match", () => {
    expect(sameDrugForm({ injection: true }, { injection: true })).toBe(true);
  });

  test("an injected and an oral pack of the same drug do not", () => {
    expect(sameDrugForm({ injection: true }, { oral: true })).toBe(false);
  });

  test("a pack that still lists every form does not match one narrowed to a single form", () => {
    const offered = { dermal: true, inhalation: true, injection: true, oral: true };
    expect(sameDrugForm(offered, { injection: true })).toBe(false);
  });

  test("two formless drugs match, which is what keeps electronic ones stacking", () => {
    expect(sameDrugForm({}, {})).toBe(true);
  });

  test("it never throws on junk", () => {
    expect(() => sameDrugForm(null, undefined)).not.toThrow();
  });
});

describe("dosesRemaining", () => {
  test.each([
    [{ quantity: 1, usagesUsed: 0, usagesMax: 5 }, 5],
    [{ quantity: 1, usagesUsed: 3, usagesMax: 5 }, 2],
    [{ quantity: 2, usagesUsed: 0, usagesMax: 5 }, 10],
    [{ quantity: 2, usagesUsed: 4, usagesMax: 5 }, 6],
    [{ quantity: 3, usagesUsed: 0, usagesMax: 1 }, 3],
    [{ quantity: 0, usagesUsed: 0, usagesMax: 5 }, 0],
    [{ quantity: 1, usagesUsed: 5, usagesMax: 5 }, 0]
  ])("%j holds %i doses", (system, expected) => {
    expect(dosesRemaining(system)).toEqual(expected);
  });

  test("a pack size that was never set falls back to what a purchase buys", () => {
    expect(dosesRemaining({ quantity: 1, usagesUsed: 0 })).toEqual(DOSES_PER_PACK);
  });

  test("it never reports a negative count, whatever has been typed in", () => {
    expect(dosesRemaining({ quantity: 1, usagesUsed: 99, usagesMax: 5 })).toEqual(0);
    expect(dosesRemaining({ quantity: -4, usagesUsed: -4, usagesMax: 5 })).toEqual(0);
  });

  test("it never throws on junk", () => {
    for (const system of [null, undefined, {}, { quantity: "x" }]) {
      expect(() => dosesRemaining(system)).not.toThrow();
    }
  });
});

describe("afterDose", () => {
  test("a dose comes out of the open pack while it still has some", () => {
    expect(afterDose({ quantity: 1, usagesUsed: 0, usagesMax: 5 }))
      .toEqual({ taken: true, emptied: false, quantity: 1, usagesUsed: 1 });
  });

  test("emptying the open pack hands over to the next one, unopened", () => {
    expect(afterDose({ quantity: 2, usagesUsed: 4, usagesMax: 5 }))
      .toEqual({ taken: true, emptied: false, quantity: 1, usagesUsed: 0 });
  });

  test("the last dose of the last pack leaves nothing behind", () => {
    expect(afterDose({ quantity: 1, usagesUsed: 4, usagesMax: 5 }))
      .toEqual({ taken: true, emptied: true });
  });

  test("a pack that holds a single dose is spent in one go", () => {
    expect(afterDose({ quantity: 1, usagesUsed: 0, usagesMax: 1 }))
      .toEqual({ taken: true, emptied: true });
  });

  test("a drug with nothing left reports that, and asks for no change", () => {
    expect(afterDose({ quantity: 1, usagesUsed: 5, usagesMax: 5 }))
      .toEqual({ taken: false, emptied: false });
    expect(afterDose({ quantity: 0, usagesUsed: 0, usagesMax: 5 }))
      .toEqual({ taken: false, emptied: false });
  });

  test("every dose taken removes exactly one from the count, across every pack arrangement", () => {
    for (const max of [1, 2, 5, 10]) {
      for (const packs of [1, 2, 4]) {
        for (let used = 0; used < max; used++) {
          const system = { quantity: packs, usagesUsed: used, usagesMax: max };
          const before = dosesRemaining(system);
          const next = afterDose(system);

          expect(next.taken).toBe(true);
          const after = next.emptied ? 0 : dosesRemaining({ ...next, usagesMax: max });
          expect(after).toEqual(before - 1);
        }
      }
    }
  });

  test("spending a two-pack drug down reports its doses one at a time and then goes", () => {
    let system = { quantity: 2, usagesUsed: 0, usagesMax: 3 };
    const seen = [];

    for (let i = 0; i < 6; i++) {
      const next = afterDose(system);
      expect(next.taken).toBe(true);
      if (next.emptied) { seen.push("gone"); break; }
      system = { ...next, usagesMax: 3 };
      seen.push(dosesRemaining(system));
    }

    expect(seen).toEqual([5, 4, 3, 2, 1, "gone"]);
  });

  test("it never throws on junk", () => {
    for (const system of [null, undefined, {}, { quantity: "x", usagesUsed: "y" }]) {
      expect(() => afterDose(system)).not.toThrow();
    }
  });
});

describe("ammunition packs", () => {
  test.each([
    [{ dermal: true }, true], [{ inhalation: true }, true], [{ injection: true }, true],
    [{ oral: true }, false], [{ drugType: "electronic", inhalation: true }, false], [{ dermal: true, oral: true }, false]
  ])("a pack in %p can be ammunition: %p", (system, expected) => expect(canBeAmmo(system)).toBe(expected));

  test("the acquisition dialog offers the choice when any offered form could be ammunition", () => {
    expect(offersAmmoChoice({ dermal: true, oral: true })).toBe(true);
    expect(offersAmmoChoice({ oral: true })).toBe(false);
    expect(offersAmmoChoice({ drugType: "electronic" })).toBe(false);
  });

  test("a pack to take and a pack to load never stack, even in the same form", () => {
    expect(sameDrugForm({ inhalation: true, isAmmo: true }, { inhalation: true, isAmmo: false })).toBe(false);
    expect(sameDrugForm({ inhalation: true, isAmmo: true }, { inhalation: true, isAmmo: true })).toBe(true);
  });

  test("an ammunition flag on a form that cannot be ammunition is cleared", () => {
    const current = { duration: { value: 1, units: "hours" }, usagesUsed: 0, usagesMax: 5 };
    expect(normaliseDrugSystem({ ...current, oral: true, isAmmo: true })).toEqual({ isAmmo: false });
    expect(normaliseDrugSystem({ ...current, inhalation: true, isAmmo: true })).toBeNull();
  });

  test("no shipped drug is an ammunition pack - that is decided when a pack is acquired", () => {
    for (const drug of packDrugs()) expect(isAmmoPack(drug.system)).toBe(false);
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

describe("drug or toxin", () => {
  test.each([
    ["drug", "drug"], ["toxin", "toxin"],
    ["toxins", "toxin"], ["nanotox", "toxin"],
    ["combat", "drug"], ["petals", "drug"], ["narco", "drug"], ["nano", "drug"],
    ["", "drug"], [undefined, "drug"]
  ])("a stored %p reads as %p", (stored, expected) => expect(drugCategory(stored)).toEqual(expected));

  test("an old fine-grained category is repaired into drug or toxin", () => {
    const current = { duration: { value: 1, units: "hours" }, usagesUsed: 0, usagesMax: 5 };
    expect(normaliseDrugSystem({ ...current, category: "nanotox" })).toEqual({ category: "toxin" });
    expect(normaliseDrugSystem({ ...current, category: "social" })).toEqual({ category: "drug" });
    expect(normaliseDrugSystem({ ...current, category: "toxin" })).toBeNull();
    expect(normaliseDrugSystem({ ...current, category: "" })).toBeNull();
  });

  test("every compendium drug is a drug or a toxin, in its book chapter's folder", () => {
    const folders = new Map(fs.readdirSync(PACK_DIR)
      .map(file => JSON.parse(fs.readFileSync(path.join(PACK_DIR, file), "utf8")))
      .filter(doc => doc._key?.startsWith("!folders!"))
      .map(folder => [folder._id, folder.name]));

    expect([...folders.values()].sort()).toEqual([
      "Cognitive Drugs", "Combat Drugs", "Health Drugs", "Nanodrugs", "Narcoalgorithms",
      "Petals", "Psi Drugs", "Recreational Drugs", "Social Drugs", "Toxins"
    ]);
    for (const drug of packDrugs()) {
      expect(DRUG_CATEGORIES).toContain(drug.system.category);
      expect(folders.has(drug.folder)).toBe(true);
      expect({ name: drug.name, toxin: drug.system.category === "toxin" })
        .toEqual({ name: drug.name, toxin: folders.get(drug.folder) === "Toxins" });
    }
  });
});

describe("the conditional options authored from the book", () => {
  const EN = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../lang/en.json"), "utf8"));
  const CHECK_KEYS = ["athletics", "deceive", "fray", "free fall", "guns", "infiltrate", "infosec", "interface", "kinesics", "melee",
    "perceive", "persuade", "program", "provoke", "psi", "research", "survival", "cog", "int", "ref", "sav", "som", "wil", "know"];

  test("exactly the drugs whose effect depends on the situation carry options", () => {
    const withOptions = packDrugs().filter(drug => drug.system.rollOptions?.length).map(drug => drug.name).sort();
    expect(withOptions).toEqual(["Aggro", "Blab", "Buzz", "CR Gas", "Flight", "Gravy", "Hither", "Juice", "Mono no Aware", "Neem", "Orbital Hash", "Oxytocin-A", "Randomizer", "Stiff", "Tongzhi"]);
  });

  test("Aggro's -20 reaches every other social test, Provoke used for anything but intimidation included", () => {
    const aggro = packDrugs().find(drug => drug.name === "Aggro");
    const other = aggro.system.rollOptions.find(option => option.id === "otherSocial");

    expect(other).toMatchObject({ value: -20 });
    expect(other.appliesTo).toEqual(expect.arrayContaining(["deceive", "kinesics", "persuade", "provoke"]));
  });

  test("every option has an id, a translated label, a number and checks that exist", () => {
    for (const drug of packDrugs()) {
      for (const option of drug.system.rollOptions ?? []) {
        const label = option.label.split(".").reduce((node, step) => node?.[step], EN);
        expect({ drug: drug.name, id: typeof option.id, label: typeof label, value: typeof option.value })
          .toEqual({ drug: drug.name, id: "string", label: "string", value: "number" });
        for (const key of option.appliesTo ?? []) expect({ drug: drug.name, key, known: CHECK_KEYS.includes(key) }).toEqual({ drug: drug.name, key, known: true });
      }
    }
  });

  test("CR Gas's sight-based Perceive replaces its -20 to all actions with the book's -30", () => {
    const crGas = packDrugs().find(drug => drug.name === "CR Gas");
    expect(crGas.system.rollOptions).toEqual([expect.objectContaining({ value: -30, appliesTo: ["perceive"], replacesGlobal: true })]);
  });
});

describe("the stress a drug leaves behind, authored from the book", () => {
  test("exactly Psi-Opener, Psi-Kick and Schizo carry it, at the book's values", () => {
    const withStress = packDrugs().filter(drug => diceFormula(drug.system.wearOff)).map(drug => [drug.name, diceFormula(drug.system.wearOff)]).sort();
    expect(withStress).toEqual([["Psi-Kick", "1d10+2"], ["Psi-Opener", "1d6"], ["Schizo", "1d10"]]);
  });
});

describe("a wear-off stress written as text", () => {
  test.each([
    ["1d10+2", { d10: 1, d6: 0, bonus: 2 }],
    ["1d6", { d10: 0, d6: 1, bonus: 0 }],
    ["1d10 + 2", { d10: 1, d6: 0, bonus: 2 }],
    ["", { d10: 0, d6: 0, bonus: 0 }]
  ])("%p becomes %p", (text, expected) => expect(parseDiceValue(text)).toEqual(expected));

  test("is repaired into dice values, the way the sheet now stores it", () => {
    const current = { duration: { value: 1, units: "hours" }, usagesUsed: 0, usagesMax: 5 };
    expect(normaliseDrugSystem({ ...current, wearOff: { sv: "1d10+2" } })).toEqual({ wearOff: { d10: 1, d6: 0, bonus: 2 } });
    expect(normaliseDrugSystem({ ...current, wearOff: { d10: 1, d6: 0, bonus: 0 } })).toBeNull();
  });
});

describe("the checks a drug calls for, authored from the book", () => {
  test("exactly the six drugs with a check carry one, at the book's aptitude, modifier and failure", () => {
    const checks = packDrugs().filter(drug => drug.system.useCheck?.aptitude)
      .map(drug => [drug.name, drug.system.useCheck.aptitude, drug.system.useCheck.modifier, drug.system.useCheck.failure]).sort();
    expect(checks).toEqual([
      ["BTX2", "som", 0, "immobilized"],
      ["Flight", "wil", 0, "stress"],
      ["Inhibitor", "wil", -20, "blocksPsi"],
      ["Nervex", "som", 0, "incapacitated"],
      ["Neuropath", "wil", 0, "incapacitated"],
      ["Twitch", "som", 0, "incapacitated"]
    ]);
  });
});

describe("the effects over time authored from the book", () => {
  test("exactly the four toxins that keep working carry them, with the errata's BTX2", () => {
    const authored = packDrugs()
      .filter(drug => ["d10", "d6", "bonus"].some(die => Number(drug.system.overTime?.damage?.[die])) || Number(drug.system.overTime?.modifier))
      .map(drug => [drug.name, drug.system.overTime.damage, drug.system.overTime.interval, drug.system.overTime.ticks, drug.system.overTime.modifier, drug.system.overTime.incapacitates])
      .sort();
    expect(authored).toEqual([
      ["BTX2", { d10: 2, d6: 0, bonus: 10 }, "turn", 3, 0, false],
      ["CR Gas", { d10: 0, d6: 1, bonus: 0 }, "turn", 1, 0, false],
      ["Disruptor", { d10: 0, d6: 0, bonus: 0 }, "hour", null, -5, true],
      ["Necrosis", { d10: 0, d6: 1, bonus: 0 }, "turn", null, 0, false]
    ]);
  });

  test("Meds is the drug that starts the healing dialog on its addition", () => {
    const presets = packDrugs().filter(drug => drug.system.healingAddition).map(drug => [drug.name, drug.system.healingAddition]);
    expect(presets).toEqual([["Meds", "meds"]]);
  });
});

describe("the temporary traits authored from the book", () => {
  test("the drugs that lend a trait or a sleight name ones their compendium really holds", () => {
    const packItems = name => new Set(fs.readdirSync(path.join(PACK_DIR, "..", name)).filter(file => file.endsWith(".json"))
      .map(file => JSON.parse(fs.readFileSync(path.join(PACK_DIR, "..", name, file), "utf8"))._id));
    const lent = packDrugs().filter(drug => drug.system.grants?.length);
    const unknown = lent.flatMap(drug => drug.system.grants
      .filter(row => !packItems(row.pack.replace("eclipsephase.", "")).has(row.item === "random" ? row.folder : row.item))
      .map(row => `${drug.name}: ${row.item}`));

    expect(lent.map(drug => drug.name).sort()).toEqual(["Blab", "Fokus", "Hither", "Juice", "MRDR", "Persona", "Psi-Kick", "Psi-Opener", "Schizo", "Stiff", "TGS", "Tongzhi"]);
    expect(unknown).toEqual([]);
  });
});

describe("the situational bonuses ware brings, authored from the book", () => {
  /**
   * Every ware item in the compendium, read from its source JSON.
   * @returns {Object[]} The item sources
   */
  function packWare() {
    const dir = path.join(PACK_DIR, "..", "ware");
    return fs.readdirSync(dir).filter(file => file.endsWith(".json"))
      .map(file => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))).filter(item => item.type === "ware");
  }

  test("every option names a label the language file has, and a value", () => {
    const en = JSON.parse(fs.readFileSync(path.join(PACK_DIR, "..", "..", "..", "lang", "en.json"), "utf8"));
    const missing = packWare().flatMap(ware => (ware.system.rollOptions ?? [])
      .filter(option => !option.label.split(".").reduce((node, key) => node?.[key], en) || !Number(option.value))
      .map(option => `${ware.name}: ${option.id}`));

    expect(packWare().filter(ware => ware.system.rollOptions?.length).length).toBeGreaterThanOrEqual(31);
    expect(missing).toEqual([]);
  });

  test("Mimicry's +30 replaces its flat +10, and the ware for special skills waits for the player's pick", () => {
    const byName = Object.fromEntries(packWare().map(ware => [ware.name, ware.system.rollOptions ?? []]));

    expect(byName["Mimicry Module"]).toEqual([expect.objectContaining({ value: 30, replacesFlat: 10 })]);
    expect(byName["Fractal Digits"]).toEqual([expect.objectContaining({ specialSkill: "hardware", specialSkills: [] })]);
  });
});

describe("the addictions authored from the book", () => {
  test("every drug the book's tables give an addiction type carries it, physical or mental", () => {
    const addictive = packDrugs().filter(drug => ["physical", "mental", "both"].includes(drug.system.addictionType));
    const byName = Object.fromEntries(addictive.map(drug => [drug.name, [drug.system.addictionType, drug.system.addictionMod]]));

    expect(addictive.length).toBeGreaterThanOrEqual(24);
    expect(byName.Kick).toEqual(["physical", "-10"]);
    expect(byName.Juice).toEqual(["mental", "-20"]);
    expect(byName.Fokus).toEqual(["mental", "-"]);
    expect(byName.Inhibitor).toEqual(["mental", "+20"]);
  });
});

describe("Randomizer", () => {
  test("applies on its own on every social test, as the book's 'at any given time' says", () => {
    const randomizer = packDrugs().find(drug => drug.name === "Randomizer");
    expect(randomizer.system.rollOptions).toEqual([expect.objectContaining({ random: true, automatic: true })]);
  });
});

describe("a munition's payload", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); game.packs.clear(); });

  test("a substance fits a payload when it comes in the payload's one vector - any of the four while none is set - and electronic ones never fit", () => {
    const pill = { oral: true };
    const patch = { dermal: true };
    const sprayable = { inhalation: true, injection: true };

    expect([payloadFits(patch, "dermal"), payloadFits(patch, "injection"), payloadFits(sprayable, "inhalation"), payloadFits(sprayable, "injection"), payloadFits(pill, "oral"), payloadFits(pill, "inhalation")]).toEqual([true, false, true, true, true, false]);
    expect([payloadFits(pill, undefined), payloadFits(patch, ""), payloadFits({ ...patch, drugType: "electronic" }, "dermal")]).toEqual([true, true, false]);
  });

  test("the choice lists only fitting drugs of the registered sources, and stores the chosen one's uuid and name", async () => {
    registerSystemPacks();
    registerPayloadSource("eclipsephase.drugs-and-toxins");
    const pack = game.packs.get("eclipsephase.drugs-and-toxins");
    const injectable = (await pack.getDocuments()).filter(entry => entry.type === "drug" && payloadFits(entry.system, "injection"));
    const offered = [];
    const realWait = foundry.applications.api.DialogV2.wait;
    foundry.applications.api.DialogV2.wait = async ({ content }) => {
      offered.push(...Array.from(String(content).matchAll(/<option[^>]*value="([^"]+)"/g), match => match[1]));
      return { selection: injectable[0].uuid };
    };
    try {
      expect(await choosePayload("injection")).toEqual({ uuid: injectable[0].uuid, name: injectable[0].name });
    } finally {
      foundry.applications.api.DialogV2.wait = realWait;
    }
    expect(new Set(offered)).toEqual(new Set(injectable.map(entry => entry.uuid)));
  });

  test("without a fitting substance the user is told so and nothing is chosen", async () => {
    const warn = jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});

    expect(await choosePayload("inside")).toBeNull();
    expect(warn).toHaveBeenCalledWith("ep2e.dialog.selectPayload.none");
    warn.mockRestore();
  });
});
