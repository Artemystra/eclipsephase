import { takeDose, offerDose, claimDose } from "../../module/common/doses.js";
import { doseDefense, halveUp, halvedDuration, defendedDoseData, defendedFormula, requestFilterCheck, filterOut, becomeImmune, immunities, learnedBy, registerDefenseHooks, WARE } from "../../module/common/dose-defense.js";
import { settleOverTime } from "../../module/common/dose-over-time.js";
import { _ep27_missingWareMarker } from "../../module/common/migration.js";
import { makeActor, resetWorld, seedRolls, seedDialogs } from "../setup/factories.js";
import { TASK_RESULT } from "../../module/rolls/dice.js";

const { createdMessages } = global.__ep;
const SKIP_DIALOG = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } };
const TWITCH = [{ key: "system.mods.globalMod", value: "-20", type: "add" }];

/**
 * A character in a biomorph with the given defensive ware, carrying one drug.
 * @param {Object} ware - additionalSystems flags, e.g. { toxinFilters: true }
 * @param {Object} [drug] - Drug system fields to override
 * @returns {Actor} The prepared actor
 */
function guarded(ware = {}, drug = {}) {
  const { medichines, immunizers, ...rest } = ware;
  const immunizerChanges = [{ key: "system.additionalSystems.immunizers", value: true, type: "override" }];
  const implants = immunizers ? [{ _id: "imm1", name: "Immunizers", type: "ware", system: { boundTo: "morph1" }, effects: [{ name: "Immunizers", transfer: true, changes: immunizerChanges }] }] : [];
  return makeActor({
    type: "character",
    system: { activeMorph: "morph1", additionalSystems: { ...rest, healing: { medichines: medichines === true } }, aptitudes: { som: { value: 15 } } },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio", dur: 30 } },
      { _id: "morph2", name: "Spare", type: "morph", system: { type: "bio", dur: 30 } },
      ...implants,
      {
        _id: "drug1", name: "Twitch", type: "drug",
        system: { active: true, drugType: "biochem", category: "toxin", inhalation: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 10, units: "minutes" }, ...drug },
        effects: [{ name: "Twitch", changes: TWITCH }]
      }
    ]
  });
}

/**
 * The actor's running dose.
 * @param {Actor} actor - The actor
 * @returns {ActiveEffect|undefined} The dose
 */
function doseOn(actor) {
  return actor.effects.find(effect => effect.getFlag("eclipsephase", "dose"));
}

/**
 * The first card whose content names the key.
 * @param {String} key - A localization key the card shows
 * @returns {Object|undefined} The card
 */
function cardWith(key) {
  return createdMessages.find(message => message.content?.includes(key));
}

beforeEach(() => {
  resetWorld();
  game.time.worldTime = 5000;
  game.users.activeGM = { isSelf: false };
  registerDefenseHooks();
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("what the ware does to a dose", () => {
  test.each([
    ["toxin filters halve a biochem dose and offer the SOM Check, +30 on its own check", { toxinFilters: true }, { drugType: "biochem" }, { halve: true, nullify: false, filterCheck: true, checkBonus: true }],
    ["medichines alone halve it", { medichines: true }, { drugType: "biochem" }, { halve: true, nullify: false, filterCheck: false }],
    ["filters and medichines together nullify it", { toxinFilters: true, medichines: true }, { drugType: "biochem" }, { halve: false, nullify: true }],
    ["digestive symbiotes work on an oral dose", { digestiveSymbiotes: true }, { drugType: "biochem", vector: "oral" }, { halve: true, filterCheck: true }],
    ["digestive symbiotes do nothing against an injected one", { digestiveSymbiotes: true }, { drugType: "biochem", vector: "injection" }, { halve: false, filterCheck: false }],
    ["nanophages halve a nano dose and offer the SOM Check", { nanophages: true }, { drugType: "nano" }, { halve: true, filterCheck: true, checkBonus: false }],
    ["toxin filters do nothing against nano", { toxinFilters: true }, { drugType: "nano" }, { halve: false, filterCheck: false }]
  ])("%s", (rule, ware, dose, expected) => {
    expect(doseDefense(guarded(ware), dose)).toMatchObject(expected);
  });

  test("nanophages take on one nano dose per 8 hours", async () => {
    const actor = guarded({ nanophages: true });
    await actor.setFlag("eclipsephase", "nanophagesUsedAt", 5000 - 3600);

    expect(doseDefense(actor, { drugType: "nano" }).halve).toBe(false);
    game.time.worldTime = 5000 + 8 * 3600;
    expect(doseDefense(actor, { drugType: "nano" }).halve).toBe(true);
  });

  test("a drug the immunizers beat before does nothing at all", async () => {
    const actor = guarded({ immunizers: true });
    await actor.items.get("imm1").setFlag("eclipsephase", "immunities", ["Twitch"]);

    expect(doseDefense(actor, { drugType: "biochem", name: "Twitch" })).toMatchObject({ nullify: true, immune: true });
  });
});

describe("halving, rounded up", () => {
  test("nothing vanishes by being halved", () => {
    expect([halveUp(1), halveUp(-20), halveUp(17), halveUp(5), halveUp(0)]).toEqual([1, -10, 9, 3, 0]);
  });

  test.each([
    [{ value: 1, units: "hours" }, { value: 30, units: "minutes" }],
    [{ value: 1, units: "days" }, { value: 12, units: "hours" }],
    [{ value: 1, units: "minutes" }, { value: 30, units: "seconds" }],
    [{ value: 8, units: "hours" }, { value: 4, units: "hours" }],
    [{ value: 3, units: "rounds" }, { value: 2, units: "rounds" }]
  ])("a duration of %p lasts %p", (duration, expected) => {
    expect(halvedDuration(duration)).toMatchObject(expected);
  });

  test("a dose's modifiers, options and growing penalty are halved, and its rolls marked so", () => {
    const data = {
      duration: { value: 1, units: "hours" },
      changes: [{ key: "system.mods.globalMod", value: "-20" }, { key: "system.pools.vigor.mod", value: "+1" }],
      system: { changes: [{ key: "system.mods.globalMod", value: "-20" }, { key: "system.pools.vigor.mod", value: "+1" }] },
      flags: { eclipsephase: { dose: { rollOptions: [{ id: "a", value: 30 }], overTime: { modifier: -5 } } } }
    };

    const defended = defendedDoseData(data, { halve: true, by: [WARE.medichines] });

    expect(defended.system.changes.map(change => change.value)).toEqual(["-10", "+1"]);
    expect(defended.duration).toMatchObject({ value: 30, units: "minutes" });
    expect(defended.flags.eclipsephase.dose.rollOptions[0].value).toBe(15);
    expect(defended.flags.eclipsephase.dose.overTime.modifier).toBe(-3);
    expect(defendedFormula("1d10", defended.flags.eclipsephase.dose)).toBe("ceil((1d10) / 2)");
  });
});

describe("a toxin meets the ware", () => {
  test("the filters' SOM Check comes first, and nothing takes hold until it fails", async () => {
    const actor = guarded({ toxinFilters: true });

    await takeDose(actor, actor.items.get("drug1"));
    const pendingDose = doseOn(actor);
    seedRolls([95]);
    await requestFilterCheck(cardWith("ep2e.chat.dose.filterCheckNeeded").id, SKIP_DIALOG);
    for (let wait = 0; wait < 50 && !doseOn(actor); wait++) await new Promise(resolve => setTimeout(resolve, 0));

    expect(pendingDose).toBeUndefined();
    expect(doseOn(actor).changes[0].value).toBe("-10");
  });

  test("a passed SOM Check keeps it out, with no wear-off stress", async () => {
    const actor = guarded({ toxinFilters: true }, { wearOff: { d10: 1, d6: 0, bonus: 0 } });
    await takeDose(actor, actor.items.get("drug1"));

    seedRolls([5]);
    await requestFilterCheck(cardWith("ep2e.chat.dose.filterCheckNeeded").id, SKIP_DIALOG);
    for (let wait = 0; wait < 50 && !cardWith("ep2e.chat.dose.filteredOut"); wait++) await new Promise(resolve => setTimeout(resolve, 0));

    expect(doseOn(actor)).toBeUndefined();
    expect(cardWith("ep2e.chat.dose.filteredOut")).toBeDefined();
    expect(createdMessages.some(message => message.getFlag?.("eclipsephase", "wearOff"))).toBe(false);
  });

  test("a pool spend that turns a failed SOM Check around takes the dose and its own check card off again", async () => {
    const check = { aptitude: "som", modifier: 0, failure: "incapacitated", duration: { value: 10, units: "minutes" }, stress: { d10: 0, d6: 0, bonus: 0 }, successPsiPenalty: 0 };
    const actor = guarded({ toxinFilters: true }, { useCheck: check });
    await takeDose(actor, actor.items.get("drug1"));
    const filterCard = cardWith("ep2e.chat.dose.filterCheckNeeded");
    seedRolls([95]);
    await requestFilterCheck(filterCard.id, SKIP_DIALOG);
    for (let wait = 0; wait < 50 && !createdMessages.some(message => message.getFlag?.("eclipsephase", "doseCheck")); wait++) await new Promise(resolve => setTimeout(resolve, 0));

    const filter = { actorUuid: actor.uuid, cardId: filterCard.id, name: "Twitch", ware: "Toxin Filters" };
    Hooks.callAll("eclipsephase.poolResult", { context: { doseFilter: filter }, newResult: TASK_RESULT.SUCCESS });
    for (let wait = 0; wait < 50 && doseOn(actor); wait++) await new Promise(resolve => setTimeout(resolve, 0));

    expect(doseOn(actor)).toBeUndefined();
    expect(createdMessages.some(message => message.getFlag?.("eclipsephase", "doseCheck"))).toBe(false);
  });

  test("the immunizers test a substance that got past the filters before it takes hold", async () => {
    const check = { aptitude: "som", modifier: 0, failure: "incapacitated", duration: { value: 10, units: "minutes" }, stress: { d10: 0, d6: 0, bonus: 0 }, successPsiPenalty: 0 };
    const actor = guarded({ toxinFilters: true, immunizers: true }, { useCheck: check });
    await takeDose(actor, actor.items.get("drug1"));
    seedRolls([95, 80]);

    await requestFilterCheck(cardWith("ep2e.chat.dose.filterCheckNeeded").id, SKIP_DIALOG);
    for (let wait = 0; wait < 50 && !createdMessages.some(message => message.getFlag?.("eclipsephase", "doseCheck")); wait++) await new Promise(resolve => setTimeout(resolve, 0));

    const immunizer = createdMessages.findIndex(message => message.content?.includes("ep2e.chat.dose.immunizerTest"));
    const checkCard = createdMessages.findIndex(message => message.getFlag?.("eclipsephase", "doseCheck"));
    expect(immunizer).toBeGreaterThanOrEqual(0);
    expect(immunizer).toBeLessThan(checkCard);
  });

  test("filters and medichines together keep it out entirely, though the dose is spent", async () => {
    const actor = guarded({ toxinFilters: true, medichines: true });

    const result = await takeDose(actor, actor.items.get("drug1"));

    expect(result.nullified).toBe(true);
    expect(doseOn(actor)).toBeUndefined();
    expect(actor.items.get("drug1").system.usagesUsed).toBe(1);
    expect(cardWith("ep2e.chat.dose.nullified")).toBeDefined();
  });

  test("each tick of its damage is halved, rounded up", async () => {
    const actor = guarded({ medichines: true }, { overTime: { damage: { d10: 0, d6: 1, bonus: 0 }, interval: "turn", ticks: 1, modifier: 0, incapacitates: false } });
    await takeDose(actor, actor.items.get("drug1"));
    seedRolls([5]);

    await settleOverTime(actor, doseOn(actor), 5000);

    expect(actor.system.health.physical.value).toBe(3);
  });
});

describe("a drug taken willingly", () => {
  test("works fully unless its taker lets the ware work", async () => {
    const actor = guarded({ toxinFilters: true }, { category: "drug" });
    seedDialogs({ filter: false });

    await takeDose(actor, actor.items.get("drug1"));

    expect(doseOn(actor).changes[0].value).toBe("-20");
    expect(cardWith("ep2e.chat.dose.filterCheckNeeded")).toBeUndefined();
  });

  test("is halved when its taker asks for it", async () => {
    const actor = guarded({ medichines: true }, { category: "drug" });
    seedDialogs({ filter: true });

    await takeDose(actor, actor.items.get("drug1"));

    expect(doseOn(actor).changes[0].value).toBe("-10");
  });

  test("forced on an unwilling target, it meets the ware without anyone being asked", async () => {
    const attacker = guarded({}, { category: "drug" });
    const target = guarded({ medichines: true });
    game.user.isGM = true;
    const { message } = await offerDose(attacker, attacker.items.get("drug1"), { forced: true });

    await claimDose(message, target);

    expect(doseOn(target).changes[0].value).toBe("-10");
  });
});

describe("immunizers", () => {
  test("what they learned is kept on the ware, and protects only while it sits in the active body", async () => {
    const actor = guarded({ immunizers: true });
    await becomeImmune({ actorUuid: actor.uuid, name: "Twitch" });

    const learned = learnedBy(actor.items.get("imm1"));
    const whileSleeved = immunities(actor);
    await actor.items.get("imm1").update({ "system.boundTo": "morph2" });

    expect(learned).toEqual(["Twitch"]);
    expect(whileSleeved).toEqual(["Twitch"]);
    expect(immunities(actor)).toEqual([]);
  });

  test("beating a drug once makes the actor immune to it, and the next dose does nothing", async () => {
    const actor = guarded({ immunizers: true });

    await becomeImmune({ actorUuid: actor.uuid, name: "Twitch" });
    const result = await takeDose(actor, actor.items.get("drug1"));

    expect(immunities(actor)).toEqual(["Twitch"]);
    expect(result.nullified).toBe(true);
    expect(cardWith("ep2e.chat.dose.immune")).toBeDefined();
  });

  test("a toxin that takes hold calls for their Medicine: Pharmacology 60 Test, and a success immunizes", async () => {
    const actor = guarded({ immunizers: true });
    seedRolls([10]);

    await takeDose(actor, actor.items.get("drug1"));
    for (let wait = 0; wait < 50 && !immunities(actor).length; wait++) await new Promise(resolve => setTimeout(resolve, 0));

    expect(immunities(actor)).toEqual(["Twitch"]);
  });
});

describe("defensive ware placed before 2.7", () => {
  test("gets the effect it reports itself through, once", async () => {
    const actor = makeActor({ type: "character", items: [{ _id: "tf1", name: "Toxin Filters", type: "ware", system: {} }, { _id: "x1", name: "Grip Pads", type: "ware", system: {} }] });

    const marker = _ep27_missingWareMarker(actor.items.get("tf1"));
    await actor.items.get("tf1").createEmbeddedDocuments("ActiveEffect", [marker]);

    expect(marker.system.changes[0]).toMatchObject({ key: "system.additionalSystems.toxinFilters", value: true });
    expect(_ep27_missingWareMarker(actor.items.get("tf1"))).toBeNull();
    expect(_ep27_missingWareMarker(actor.items.get("x1"))).toBeNull();
  });
});
