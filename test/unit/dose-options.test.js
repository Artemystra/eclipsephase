import { checkKeys, doseRollOptions, chosenRollOptions, tickableRollOptions, optionValue, replacedDrugs } from "../../module/common/dose-options.js";
import { globalModifiers } from "../../module/common/global-mod.js";
import { makeActor, resetWorld, seedRolls } from "../setup/factories.js";

const CR_GAS = {
  _id: "crgas1",
  name: "CR Gas",
  duration: { value: 1, units: "hours" },
  changes: [{ key: "system.mods.globalMod", value: "-20", type: "add" }],
  flags: { eclipsephase: { dose: { name: "CR Gas", rollOptions: [{ id: "sight", label: "ep2e.item.drug.rollOptions.crgasSight", value: -30, appliesTo: ["perceive"], replacesGlobal: true }] } } }
};
const JUICE = {
  _id: "juice1",
  name: "Juice",
  duration: { value: 1, units: "hours" },
  flags: { eclipsephase: { dose: { name: "Juice", rollOptions: [{ id: "fear", label: "ep2e.item.drug.rollOptions.juiceFear", value: 30, appliesTo: ["sav", "wil"] }] } } }
};

beforeEach(() => resetWorld());

describe("what a check answers to", () => {
  test("a skill check by its key, an aptitude check by its aptitude, a Know skill as know and its aptitude", () => {
    const actor = makeActor({ type: "character", items: [{ name: "Know: Chemistry", type: "knowSkill", system: { aptitude: "cog" } }] });

    expect([...checkKeys(actor, { key: "perceive" })]).toEqual(["perceive"]);
    expect([...checkKeys(actor, { key: "system.aptitudes.wil.value", apttype: "wil" })]).toContain("wil");
    expect([...checkKeys(actor, { key: "Know: Chemistry", apttype: "cog" })]).toEqual(expect.arrayContaining(["know", "cog"]));
  });
});

describe("the options a running dose offers", () => {
  test("only those that apply to the check, each with a field of its own and its value as shown", () => {
    const actor = makeActor({ type: "character", effects: [CR_GAS, JUICE] });

    const perceive = doseRollOptions(actor, { key: "perceive" });
    const willpower = doseRollOptions(actor, { apttype: "wil", key: "system.aptitudes.wil.value" });

    expect(perceive.map(entry => [entry.drug, entry.field, entry.shown])).toEqual([["CR Gas", "doseOption-crgas1-sight", "-30"]]);
    expect(willpower.map(entry => [entry.drug, entry.shown])).toEqual([["Juice", "+30"]]);
    expect(doseRollOptions(actor, { key: "guns" })).toEqual([]);
  });

  test("a dose switched off offers nothing", () => {
    const actor = makeActor({ type: "character", effects: [{ ...JUICE, disabled: true }] });

    expect(doseRollOptions(actor, { apttype: "wil" })).toEqual([]);
  });

  test("an option for every check is offered on any check, and a chance option shows ±", () => {
    const randomizer = { _id: "rnd1", name: "Randomizer", duration: { value: 1, units: "hours" }, flags: { eclipsephase: { dose: { name: "Randomizer", rollOptions: [{ id: "social", label: "x", value: 10, random: true }] } } } };
    const actor = makeActor({ type: "character", effects: [randomizer] });

    expect(doseRollOptions(actor, { key: "guns" }).map(entry => entry.shown)).toEqual(["±10"]);
  });

  test("only the ticked ones come back from the dialog", () => {
    const actor = makeActor({ type: "character", effects: [CR_GAS, JUICE] });
    const offered = [...doseRollOptions(actor, { key: "perceive" }), ...doseRollOptions(actor, { apttype: "wil" })];

    expect(chosenRollOptions(offered, { "doseOption-crgas1-sight": true, "doseOption-juice1-fear": false }).map(entry => entry.drug)).toEqual(["CR Gas"]);
  });
});

describe("what a ticked option is worth", () => {
  test("its own value, or for a chance option a penalty on a 1 and a bonus on a 2", async () => {
    expect(await optionValue({ value: -30 })).toEqual(-30);
    seedRolls([1, 2]);
    expect(await optionValue({ value: 10, random: true })).toEqual(-10);
    expect(await optionValue({ value: 10, random: true })).toEqual(10);
  });
});

describe("an option that replaces its drug's penalty to all actions", () => {
  test("leaves that drug out of the Intoxicated line, and only that drug", () => {
    const twitch = { name: "Twitch", duration: { value: 1, units: "hours" }, changes: [{ key: "system.mods.globalMod", value: "-20", type: "add" }], flags: { eclipsephase: { dose: { name: "Twitch" } } } };
    const actor = makeActor({ type: "character", effects: [CR_GAS, twitch] });
    const chosen = chosenRollOptions(doseRollOptions(actor, { key: "perceive" }), { "doseOption-crgas1-sight": true });

    const lines = globalModifiers(actor, { exclude: replacedDrugs(chosen) });

    expect(lines).toEqual([{ label: "ep2e.roll.announce.intoxicated", modifier: -20, comment: "Twitch (-20)" }]);
  });

  test("an option that does not replace anything leaves the line whole", () => {
    const actor = makeActor({ type: "character", effects: [CR_GAS, JUICE] });
    const chosen = chosenRollOptions(doseRollOptions(actor, { apttype: "wil" }), { "doseOption-juice1-fear": true });

    expect(replacedDrugs(chosen).size).toEqual(0);
    expect(globalModifiers(actor, { exclude: replacedDrugs(chosen) })[0].modifier).toEqual(-20);
  });
});

describe("an option that applies on its own", () => {
  const RANDOMIZER = { _id: "rnd1", name: "Randomizer", duration: { value: 1, units: "hours" }, flags: { eclipsephase: { dose: { name: "Randomizer", rollOptions: [{ id: "social", label: "x", value: 10, random: true, automatic: true, appliesTo: ["persuade"] }] } } } };

  test("is never shown as a checkbox, but always applies when it fits", () => {
    const actor = makeActor({ type: "character", effects: [RANDOMIZER] });
    const offered = doseRollOptions(actor, { key: "persuade" });

    expect(tickableRollOptions(offered)).toEqual([]);
    expect(chosenRollOptions(offered, {}).map(entry => entry.drug)).toEqual(["Randomizer"]);
    expect(doseRollOptions(actor, { key: "guns" })).toEqual([]);
  });
});
