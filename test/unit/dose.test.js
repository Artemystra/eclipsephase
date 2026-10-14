import { takeDose, doseSubstrate, doseEffectData, activeDoseFor, endRunOutDoses } from "../../module/common/doses.js";
import { registerPoolRule } from "../../module/common/pool-rule.js";
import { makeActor, resetWorld } from "../setup/factories.js";

const KICK_BOOST = [{ key: "system.pools.vigor.mod", value: "+1", type: "add" }];

/**
 * A character sleeved in a body of the given type, carrying one injectable drug whose blueprint
 * raises Vigor by one.
 * @param {Object} drug - Drug system fields to override
 * @param {String} morphType - The sleeved morph's type
 * @returns {Actor} The prepared actor
 */
function carrying(drug = {}, morphType = "bio") {
  return makeActor({
    type: "character",
    system: { activeMorph: "morph1" },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: morphType } },
      {
        _id: "kick1", name: "Kick", type: "drug",
        system: {
          active: true, drugType: "biochem", category: "combat",
          quantity: 1, usagesUsed: 0, usagesMax: 5,
          duration: { value: 8, units: "hours" }, injection: true,
          description: "Boosts your reflexes.",
          ...drug
        },
        effects: [{ name: "Kick", changes: KICK_BOOST }]
      }
    ]
  });
}

/**
 * The dose effect a drug of that name put on the actor.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @returns {ActiveEffect|undefined} The effect
 */
function doseOn(actor, name = "Kick") {
  return actor.effects.find(effect => effect.getFlag("eclipsephase", "dose")?.name === name);
}

beforeEach(() => {
  resetWorld();
  game.time.worldTime = 5000;
  game.users.activeGM = { isSelf: true };
  registerPoolRule();
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("taking a dose", () => {
  test("it puts an effect on the actor carrying the drug's duration, ending on the clock", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));

    const dose = doseOn(actor);
    expect(dose).toBeDefined();
    expect(dose.duration).toMatchObject({ value: 8, units: "hours", expiry: null });
  });

  test("it stamps a complete start, so Foundry tracks it from the moment it was taken", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));

    expect(doseOn(actor).start?.time).toEqual(5000);
  });

  test("it puts no icon on the token", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));

    expect(doseOn(actor).showIcon).toEqual(CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER);
  });

  test("it copies the drug's blueprint changes and its description, and points back at the drug", async () => {
    const actor = carrying();
    const item = actor.items.get("kick1");

    await takeDose(actor, item);

    const dose = doseOn(actor);
    expect(dose.changes).toEqual(KICK_BOOST);
    expect(dose.description).toEqual("Boosts your reflexes.");
    expect(dose.origin).toEqual(item.uuid);
  });

  test("it records what was taken, in the form it was taken, with its onset", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));

    expect(doseOn(actor).getFlag("eclipsephase", "dose")).toMatchObject({
      itemId: "kick1", name: "Kick", drugType: "biochem", category: "combat",
      vector: "injection", onset: "ep2e.item.drug.onset.turn", blocksPsi: false
    });
  });

  test("it spends one dose from the pack", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));

    expect(actor.items.get("kick1").system.usagesUsed).toEqual(1);
  });

  test("the dose applies to the actor exactly once: the blueprint on the item still does not", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));
    actor.prepareData();

    expect(Number(actor.system.pools.vigor.mod)).toEqual(1);
  });

  test("the dose hands over the pool point it adds, and takes it back when it runs out", async () => {
    const actor = carrying();
    const before = actor.system.pools.vigor.value ?? 0;

    await takeDose(actor, actor.items.get("kick1"));
    expect(actor.system.pools.vigor.value).toEqual(before + 1);

    const dose = doseOn(actor);
    dose.duration.remaining = 0;
    await endRunOutDoses(actor, [dose]);
    expect(actor.system.pools.vigor.value).toEqual(before);
  });

  test("the last dose takes the drug off the sheet, and the effect outlives it", async () => {
    const actor = carrying({ usagesUsed: 4 });

    const outcome = await takeDose(actor, actor.items.get("kick1"));

    expect(outcome).toMatchObject({ taken: true, emptied: true });
    expect(actor.items.get("kick1")).toBeUndefined();
    expect(doseOn(actor)).toBeDefined();
  });

  test("a drug with no duration recorded runs until somebody ends it", async () => {
    const actor = carrying({ duration: { value: null, units: "" } });

    await takeDose(actor, actor.items.get("kick1"));

    const dose = doseOn(actor);
    expect(dose.duration.value).toBeNull();
    expect(dose.getFlag("eclipsephase", "dose")).toBeDefined();
  });

  test("a drug with nothing left is refused with a warning and puts no effect on", async () => {
    const actor = carrying({ usagesUsed: 5 });

    const outcome = await takeDose(actor, actor.items.get("kick1"));

    expect(outcome).toMatchObject({ taken: false, refused: false, effect: null });
    expect(doseOn(actor)).toBeUndefined();
    expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
  });
});

describe("taking the same drug again", () => {
  test("it restarts the running dose's clock instead of stacking a second effect", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));
    game.time.worldTime = 9000;
    await takeDose(actor, actor.items.get("kick1"));

    const doses = actor.effects.filter(effect => effect.getFlag("eclipsephase", "dose")?.name === "Kick");
    expect(doses).toHaveLength(1);
    expect(doses[0].start.time).toEqual(9000);
    expect(doses[0].duration.expired).toBe(false);
  });

  test("the second dose is still spent from the pack", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));
    await takeDose(actor, actor.items.get("kick1"));

    expect(actor.items.get("kick1").system.usagesUsed).toEqual(2);
  });

  test("a dose that has run out is not the running one, so a fresh effect is created", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));
    doseOn(actor).duration.expired = true;
    await takeDose(actor, actor.items.get("kick1"));

    expect(activeDoseFor(actor, "Kick").duration.expired).toBe(false);
    expect(actor.effects.filter(effect => effect.getFlag("eclipsephase", "dose"))).toHaveLength(2);
  });
});

describe("which bodies a drug can act on", () => {
  test("a biochem drug is refused in a synthmorph, spending nothing", async () => {
    const actor = carrying({}, "synth");

    const outcome = await takeDose(actor, actor.items.get("kick1"));

    expect(outcome).toMatchObject({ taken: false, refused: true, effect: null });
    expect(actor.items.get("kick1").system.usagesUsed).toEqual(0);
    expect(doseOn(actor)).toBeUndefined();
    expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
  });

  test("a nano drug needs a biological body too", () => {
    const actor = carrying({ drugType: "nano" }, "info");

    expect(doseSubstrate(actor, actor.items.get("kick1"))).toEqual({
      allowed: false, reasonKey: "ep2e.actorSheet.warnings.doseNeedsBiomorph"
    });
  });

  test("an electronic drug runs on an infomorph but not in a plain biomorph", () => {
    const info = carrying({ drugType: "electronic" }, "info");
    const bio = carrying({ drugType: "electronic" }, "bio");

    expect(doseSubstrate(info, info.items.get("kick1")).allowed).toBe(true);
    expect(doseSubstrate(bio, bio.items.get("kick1"))).toEqual({
      allowed: false, reasonKey: "ep2e.actorSheet.warnings.doseNeedsCyberbrain"
    });
  });

  test("a drug with no type recorded is not gated, so a homebrew one keeps working", () => {
    const actor = carrying({ drugType: "" }, "synth");

    expect(doseSubstrate(actor, actor.items.get("kick1")).allowed).toBe(true);
  });
});

describe("the effect data on its own", () => {
  test("an untimed drug gets no duration value rather than a zero one", () => {
    const actor = carrying({ duration: { value: 0, units: "hours" } });

    expect(doseEffectData(actor.items.get("kick1")).duration.value).toBeNull();
  });

  test("a drug with no blueprint still makes a dose, with nothing to change", () => {
    const actor = makeActor({
      type: "character",
      system: { activeMorph: "morph1" },
      items: [
        { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio" } },
        { _id: "retcon1", name: "Retcon", type: "drug", system: { active: true, drugType: "nano", oral: true } }
      ]
    });

    const data = doseEffectData(actor.items.get("retcon1"));

    expect(data.changes).toEqual([]);
    expect(data.flags.eclipsephase.dose.name).toEqual("Retcon");
  });
});

describe("a dose running out", () => {
  test("it is taken off the actor once its time is up", async () => {
    const actor = carrying();
    await takeDose(actor, actor.items.get("kick1"));
    const dose = doseOn(actor);
    dose.duration.remaining = 0;

    await endRunOutDoses(actor, [dose]);

    expect(doseOn(actor)).toBeUndefined();
  });

  test("one already flagged expired goes the same way", async () => {
    const actor = carrying();
    await takeDose(actor, actor.items.get("kick1"));
    const dose = doseOn(actor);
    dose.duration.expired = true;

    await endRunOutDoses(actor, [dose]);

    expect(doseOn(actor)).toBeUndefined();
  });

  test("one still counting down is left alone", async () => {
    const actor = carrying();
    await takeDose(actor, actor.items.get("kick1"));
    const dose = doseOn(actor);
    dose.duration.remaining = 3600;

    await endRunOutDoses(actor, [dose]);

    expect(doseOn(actor)).toBeDefined();
  });

  test("an unrelated expired effect is not mistaken for a dose", async () => {
    const actor = carrying();
    const [other] = await actor.createEmbeddedDocuments("ActiveEffect", [
      { name: "Something else", duration: { expired: true } }
    ]);

    await endRunOutDoses(actor, [other]);

    expect(actor.effects.find(effect => effect.id === other.id)).toBeDefined();
  });

  test("the actor's own duration hook removes it, but only on the active GM's client", async () => {
    const actor = carrying();
    await takeDose(actor, actor.items.get("kick1"));
    const dose = doseOn(actor);
    dose.duration.remaining = 0;

    game.users.activeGM = { isSelf: false };
    await actor.onUpdateEffectDurations([dose], "updateWorldTime", {});
    expect(doseOn(actor)).toBeDefined();

    game.users.activeGM = { isSelf: true };
    await actor.onUpdateEffectDurations([dose], "updateWorldTime", {});
    expect(doseOn(actor)).toBeUndefined();
  });
});
