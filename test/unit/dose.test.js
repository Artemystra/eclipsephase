import { takeDose, doseSubstrate, doseEffectData, activeDoseFor, endRunOutDoses, registerDoseHooks } from "../../module/common/doses.js";
import { registerPoolRule } from "../../module/common/pool-rule.js";
import { makeActor, resetWorld } from "../setup/factories.js";

const { createdMessages } = global.__ep;

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

describe("the card a dose posts", () => {
  test("taking a dose posts exactly one card, naming the drug", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));

    expect(createdMessages).toHaveLength(1);
    expect(createdMessages[0].content).toContain("ep2e.chat.dose.taken");
    expect(createdMessages[0].content).toContain("Kick");
  });

  test("it states the form, the onset, the duration and what is left of the pack", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));

    const card = createdMessages[0].content;
    expect(card).toContain("ep2e.item.drug.table.applicationVectors.injectionLabel");
    expect(card).toContain("ep2e.item.drug.onset.turn");
    expect(card).toContain("8 ep2e.item.drug.table.durationUnits.hours");
    expect(card).toContain("ep2e.item.drug.dosesLeft");
    expect(card).toContain("<b>4</b>");
  });

  test("taking the same drug again says the clock started over", async () => {
    const actor = carrying();

    await takeDose(actor, actor.items.get("kick1"));
    await takeDose(actor, actor.items.get("kick1"));

    expect(createdMessages).toHaveLength(2);
    expect(createdMessages[1].content).toContain("ep2e.chat.dose.renewed");
  });

  test("the last dose says so instead of counting what is left", async () => {
    const actor = carrying({ usagesUsed: 4 });

    await takeDose(actor, actor.items.get("kick1"));

    expect(createdMessages[0].content).toContain("ep2e.chat.dose.lastDose");
    expect(createdMessages[0].content).not.toContain("ep2e.item.drug.dosesLeft");
  });

  test("a drug with no duration recorded runs until ended, and the card says that", async () => {
    const actor = carrying({ duration: { value: null, units: "" } });

    await takeDose(actor, actor.items.get("kick1"));

    expect(createdMessages[0].content).toContain("ep2e.chat.dose.untilEnded");
  });

  test("an electronic drug is an app, with no form to name", async () => {
    const actor = carrying({ drugType: "electronic", injection: false }, "info");

    await takeDose(actor, actor.items.get("kick1"));

    expect(createdMessages[0].content).toContain("ep2e.chat.dose.app");
    expect(createdMessages[0].content).toContain("ep2e.item.drug.onset.app");
  });

  test("a refused dose and an empty pack post nothing", async () => {
    const synth = carrying({}, "synth");
    await takeDose(synth, synth.items.get("kick1"));

    const empty = carrying({ usagesUsed: 5 });
    await takeDose(empty, empty.items.get("kick1"));

    expect(createdMessages).toHaveLength(0);
  });

  test("a character's card is public, anyone else's goes to the GMs", async () => {
    const character = carrying();
    await takeDose(character, character.items.get("kick1"));
    expect(createdMessages[0].whisper).toBeUndefined();

    const npc = makeActor({
      type: "npc",
      system: { activeMorph: "morph1" },
      items: [
        { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio" } },
        { _id: "kick1", name: "Kick", type: "drug", system: { active: true, drugType: "biochem", injection: true, duration: { value: 8, units: "hours" } } }
      ]
    });
    await takeDose(npc, npc.items.get("kick1"));
    expect(Array.isArray(createdMessages[1].whisper)).toBe(true);
  });
});

describe("the card when a dose stops acting", () => {
  /**
   * A character who has taken one dose of Kick, with the taking card already cleared away.
   * @param {Object} [drug] - Drug system fields to override
   * @returns {Promise<Actor>} The actor
   */
  async function dosed(drug = {}) {
    registerDoseHooks();
    const actor = carrying(drug);
    await takeDose(actor, actor.items.get("kick1"));
    createdMessages.length = 0;
    return actor;
  }

  test("a dose that ran out on the clock posts exactly one card saying it wore off", async () => {
    const actor = await dosed();
    const dose = doseOn(actor);
    dose.duration.expired = true;

    await endRunOutDoses(actor, [dose]);

    expect(createdMessages).toHaveLength(1);
    expect(createdMessages[0].content).toContain("ep2e.chat.dose.woreOff");
    expect(createdMessages[0].content).toContain("Kick");
  });

  test("a dose ended by hand while it still had time to run says it was ended early", async () => {
    const actor = await dosed();

    await actor.deleteEmbeddedDocuments("ActiveEffect", [doseOn(actor).id]);

    expect(createdMessages).toHaveLength(1);
    expect(createdMessages[0].content).toContain("ep2e.chat.dose.endedEarly");
  });

  test("a dose with no duration, ended by hand, simply wore off", async () => {
    const actor = await dosed({ duration: { value: null, units: "" } });

    await actor.deleteEmbeddedDocuments("ActiveEffect", [doseOn(actor).id]);

    expect(createdMessages[0].content).toContain("ep2e.chat.dose.woreOff");
  });

  test("it names the wear-off stress when the drug records one, and nothing when it does not", async () => {
    const stressed = await dosed({ wearOff: { sv: "1d6" } });
    await stressed.deleteEmbeddedDocuments("ActiveEffect", [doseOn(stressed).id]);
    expect(createdMessages[0].content).toContain("ep2e.chat.dose.wearOffSv");
    expect(createdMessages[0].content).toContain("<b>1d6</b>");

    createdMessages.length = 0;
    const calm = await dosed();
    await calm.deleteEmbeddedDocuments("ActiveEffect", [doseOn(calm).id]);
    expect(createdMessages[0].content).not.toContain("ep2e.chat.dose.wearOffSv");
  });

  test("it is rendered from the same template as the card for taking a dose", async () => {
    const actor = await dosed();
    const realRender = foundry.applications.handlebars.renderTemplate;
    const templates = [];
    foundry.applications.handlebars.renderTemplate = async (template, data) => {
      templates.push(template);
      return realRender(template, data);
    };

    try {
      await takeDose(actor, actor.items.get("kick1"));
      await actor.deleteEmbeddedDocuments("ActiveEffect", [doseOn(actor).id]);
    } finally {
      foundry.applications.handlebars.renderTemplate = realRender;
    }

    expect(new Set(templates)).toEqual(new Set(["systems/eclipsephase/templates/chat/dose.html"]));
  });

  test("a removal made on somebody else's client is theirs to announce", async () => {
    const actor = await dosed();
    const dose = doseOn(actor);

    Hooks.callAll("deleteActiveEffect", dose, {}, "somebody-else");
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(createdMessages).toHaveLength(0);
  });

  test("removing an effect that is not a dose posts nothing", async () => {
    registerDoseHooks();
    const actor = makeActor({ type: "character", effects: [{ _id: "fx1", name: "Neurachem" }] });

    await actor.deleteEmbeddedDocuments("ActiveEffect", ["fx1"]);

    expect(createdMessages).toHaveLength(0);
  });

  test("a non-character's card goes to the GMs only", async () => {
    registerDoseHooks();
    const npc = makeActor({
      type: "npc",
      effects: [{ _id: "fx1", name: "Kick", flags: { eclipsephase: { dose: { name: "Kick", wearOff: "" } } } }]
    });

    await npc.deleteEmbeddedDocuments("ActiveEffect", ["fx1"]);

    expect(Array.isArray(createdMessages[0].whisper)).toBe(true);
  });
});
