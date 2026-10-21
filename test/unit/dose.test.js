import { takeDose, doseSubstrate, doseEffectData, activeDoseFor, endRunOutDoses, registerDoseHooks, offerDose, claimDose, requestDoseClaim, registerDoseSocket, rollWearOffStress, requestWearOffRoll } from "../../module/common/doses.js";
import { registerExpiryCleanup, cleanUpExpired } from "../../module/common/expiry.js";
import { selectDoseRecipient } from "../../module/common/drugs.js";
import { registerPoolRule } from "../../module/common/pool-rule.js";
import { makeActor, resetWorld, seedDialogs, seedRolls } from "../setup/factories.js";

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
      itemId: "kick1", name: "Kick", drugType: "biochem", category: "drug",
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

  test("Foundry marking the dose expired removes it, on the client that marked it", async () => {
    registerExpiryCleanup();
    const actor = carrying();
    await takeDose(actor, actor.items.get("kick1"));

    await doseOn(actor).update({ "duration.expired": true });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(doseOn(actor)).toBeUndefined();
  });

  test("a mark made on somebody else's client is theirs to clean up", async () => {
    registerExpiryCleanup();
    const actor = carrying();
    await takeDose(actor, actor.items.get("kick1"));
    const dose = doseOn(actor);
    dose.duration.expired = true;

    Hooks.callAll("updateActiveEffect", dose, { duration: { expired: true } }, {}, "somebody-else");
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(doseOn(actor)).toBeDefined();
  });

  test("a world actor's expired dose leaves no inactive copy behind on its unlinked tokens", async () => {
    const world = carrying();
    await takeDose(world, world.items.get("kick1"));
    const dose = doseOn(world);
    const copy = makeActor({ type: "character", effects: [{ _id: dose.id, name: "Kick", duration: { value: 8, units: "hours", expired: true }, flags: { eclipsephase: { dose: { name: "Kick" } } } }] });
    world.getDependentTokens = () => [{ actor: copy }];
    dose.duration.expired = true;

    await cleanUpExpired(dose);

    expect(doseOn(world)).toBeUndefined();
    expect(copy.effects).toHaveLength(0);
  });

  test("a token copy still running is left alone", async () => {
    const world = carrying();
    await takeDose(world, world.items.get("kick1"));
    const dose = doseOn(world);
    const copy = makeActor({ type: "character", effects: [{ _id: dose.id, name: "Kick", duration: { value: 8, units: "hours" }, flags: { eclipsephase: { dose: { name: "Kick" } } } }] });
    world.getDependentTokens = () => [{ actor: copy }];
    dose.duration.expired = true;

    await cleanUpExpired(dose);

    expect(copy.effects).toHaveLength(1);
  });

  test("the duration hook itself no longer deletes, so it cannot race Foundry's own expiry update", async () => {
    const actor = carrying();
    await takeDose(actor, actor.items.get("kick1"));
    const dose = doseOn(actor);
    dose.duration.remaining = 0;
    game.users.activeGM = { isSelf: true };

    await actor.onUpdateEffectDurations([dose], "updateWorldTime", {});

    expect(doseOn(actor)).toBeDefined();
  });
});

describe("a second dose of a drug already running", () => {
  test("brings the data of the pack it comes from, not the first dose's", async () => {
    const actor = carrying();
    await takeDose(actor, actor.items.get("kick1"));
    const option = { id: "new", label: "x", value: 10, automatic: true };
    await actor.items.get("kick1").update({ "system.rollOptions": [option] });

    await takeDose(actor, actor.items.get("kick1"));

    const doses = actor.effects.filter(effect => effect.getFlag("eclipsephase", "dose"));
    expect(doses).toHaveLength(1);
    expect(doses[0].getFlag("eclipsephase", "dose").rollOptions).toEqual([option]);
  });
});

describe("an ammunition pack", () => {
  test("cannot be taken: nothing is spent, no effect starts, the player is told why", async () => {
    const actor = carrying({ isAmmo: true });

    const outcome = await takeDose(actor, actor.items.get("kick1"));

    expect(outcome).toMatchObject({ taken: false, refused: true });
    expect(actor.items.get("kick1").system.usagesUsed).toEqual(0);
    expect(doseOn(actor)).toBeUndefined();
    expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("ep2e.actorSheet.warnings.ammoPackNotTaken"));
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

describe("giving a dose to someone else", () => {
  /**
   * A character sleeved in a body of the given type, ready to claim an offered dose.
   * @param {String} name - The character's name
   * @param {String} morphType - The sleeved morph's type
   * @returns {Actor} The prepared actor
   */
  function claimant(name = "Dinah", morphType = "bio") {
    return makeActor({
      type: "character", name,
      system: { activeMorph: "morph1" },
      items: [{ _id: "morph1", name: "Morph", type: "morph", system: { type: morphType } }]
    });
  }

  /**
   * The giver's offer card, posted from a fresh pack of Kick.
   * @returns {Promise<Object>} giver and the offer message
   */
  async function offered() {
    const giver = carrying();
    const { message } = await offerDose(giver, giver.items.get("kick1"));
    return { giver, message };
  }

  test("offering takes nothing from the pack yet; the dose is spent when somebody gets it", async () => {
    const { giver, message } = await offered();

    expect(giver.items.get("kick1").system.usagesUsed).toEqual(0);
    expect(doseOn(giver)).toBeUndefined();
    expect(message.getFlag("eclipsephase", "doseOffer")).toMatchObject({ name: "Kick", usedBy: null });

    await claimDose(message, claimant());

    expect(giver.items.get("kick1").system.usagesUsed).toEqual(1);
  });

  test("a claim refused for the body costs the giver nothing", async () => {
    const { giver, message } = await offered();

    await claimDose(message, claimant("Synthie", "synth"));

    expect(giver.items.get("kick1").system.usagesUsed).toEqual(0);
  });

  test("two offers for the last dose: the second claim finds the pack empty and is refused", async () => {
    const giver = carrying({ usagesUsed: 4 });
    const first = (await offerDose(giver, giver.items.get("kick1"))).message;
    const second = (await offerDose(giver, giver.items.get("kick1"))).message;

    await claimDose(first, claimant("Dinah"));
    const late = claimant("Velkora");
    const result = await claimDose(second, late);

    expect(result).toEqual({ claimed: false, reasonKey: "ep2e.actorSheet.warnings.offerPackEmpty" });
    expect(doseOn(late)).toBeUndefined();
    expect(second.getFlag("eclipsephase", "doseOffer").usedBy).toBeNull();
  });

  test("the offer is public, even from an NPC, so the person it is for can click it", async () => {
    const npc = makeActor({
      type: "npc", system: { activeMorph: "morph1" },
      items: [
        { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio" } },
        { _id: "kick1", name: "Kick", type: "drug", system: { active: true, drugType: "biochem", injection: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 8, units: "hours" } } }
      ]
    });

    const { message } = await offerDose(npc, npc.items.get("kick1"));

    expect(message.whisper).toBeUndefined();
    expect(message.content).toContain("useDose");
  });

  test("claiming puts the dose on the claimant and turns the card into a record without a button", async () => {
    const { message } = await offered();
    const dinah = claimant();

    const result = await claimDose(message, dinah);

    expect(result.claimed).toBe(true);
    expect(doseOn(dinah)).toBeDefined();
    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toEqual("Dinah");
    expect(message.content).toContain("ep2e.chat.dose.usedBy");
    expect(message.content).not.toContain("useDose");
  });

  test("the clock starts when the dose is claimed, not when it was offered", async () => {
    const { message } = await offered();
    game.time.worldTime = 9000;
    const dinah = claimant();

    await claimDose(message, dinah);

    expect(doseOn(dinah).start.time).toEqual(9000);
  });

  test("two claims racing for the same card: only the first one gets the dose", async () => {
    const { message } = await offered();
    await claimDose(message, claimant("Dinah"));

    const second = claimant("Velkora");
    const result = await claimDose(message, second);

    expect(result).toEqual({ claimed: false, reasonKey: "ep2e.actorSheet.warnings.doseAlreadyUsed" });
    expect(doseOn(second)).toBeUndefined();
  });

  test("a body the drug cannot act on is refused, and the card stays open for someone else", async () => {
    const { message } = await offered();

    const result = await claimDose(message, claimant("Synthie", "synth"));

    expect(result.claimed).toBe(false);
    expect(result.reasonKey).toEqual("ep2e.actorSheet.warnings.doseNeedsBiomorph");
    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toBeNull();
  });

  test("claiming a drug already running on the claimant restarts it instead of stacking", async () => {
    const dinah = carrying();
    await takeDose(dinah, dinah.items.get("kick1"));
    const { message } = await offered();

    await claimDose(message, dinah);

    expect(dinah.effects.filter(effect => effect.getFlag("eclipsephase", "dose"))).toHaveLength(1);
  });

  test("an ammunition pack cannot be offered", async () => {
    const giver = carrying({ isAmmo: true });

    expect((await offerDose(giver, giver.items.get("kick1"))).offered).toBe(false);
    expect(createdMessages).toHaveLength(0);
  });
});

describe("clicking use on me", () => {
  let emitted;
  let socketHandler;

  beforeEach(() => {
    emitted = [];
    const listeners = [];
    socketHandler = async payload => { for (const listener of listeners) await listener(payload); };
    game.socket.emit = (name, payload) => emitted.push(payload);
    game.socket.on = (name, fn) => { listeners.push(fn); };
    registerDoseSocket();
  });

  const realSocket = { ...game.socket };

  afterEach(() => {
    Object.assign(game.socket, realSocket);
    game.user.isGM = true;
    game.user.character = null;
  });

  test("a player's click is sent to the GM rather than made on the player's own client", async () => {
    const { message } = await (async () => { const giver = carrying(); return offerDose(giver, giver.items.get("kick1")); })();
    game.user.isGM = false;
    game.user.character = makeActor({ type: "character", name: "Dinah" });
    game.users.activeGM = { id: "gm-1" };

    await requestDoseClaim(message.id);

    expect(emitted).toEqual([expect.objectContaining({ action: "claimDose", messageId: message.id, actorUuid: game.user.character.uuid })]);
    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toBeNull();
  });

  test("the active GM makes the claim it receives", async () => {
    const giver = carrying();
    const { message } = await offerDose(giver, giver.items.get("kick1"));
    const dinah = makeActor({ type: "character", name: "Dinah", system: { activeMorph: "morph1" }, items: [{ _id: "morph1", name: "Morph", type: "morph", system: { type: "bio" } }] });
    game.users.activeGM = { id: game.user.id, isSelf: true };

    await socketHandler({ action: "claimDose", messageId: message.id, actorUuid: dinah.uuid, userId: "player-1" });

    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toEqual("Dinah");
  });

  test("a refused claim is answered to the player who asked, and only to them", async () => {
    const giver = carrying();
    const { message } = await offerDose(giver, giver.items.get("kick1"));
    const synth = makeActor({ type: "character", name: "Synthie", system: { activeMorph: "morph1" }, items: [{ _id: "morph1", name: "Shell", type: "morph", system: { type: "synth" } }] });
    game.users.activeGM = { id: game.user.id, isSelf: true };

    await socketHandler({ action: "claimDose", messageId: message.id, actorUuid: synth.uuid, userId: "player-1" });

    expect(emitted).toEqual([{ action: "claimDoseRefused", userId: "player-1", reasonKey: "ep2e.actorSheet.warnings.doseNeedsBiomorph" }]);
  });

  test("a GM who is not the active one leaves the claim alone", async () => {
    const giver = carrying();
    const { message } = await offerDose(giver, giver.items.get("kick1"));
    game.users.activeGM = { id: "other-gm" };

    await socketHandler({ action: "claimDose", messageId: message.id, actorUuid: giver.uuid, userId: "player-1" });

    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toBeNull();
  });

  test("a player with no character is told to get one", async () => {
    const giver = carrying();
    const { message } = await offerDose(giver, giver.items.get("kick1"));
    game.user.isGM = false;
    game.user.character = null;
    game.users.activeGM = { id: "gm-1" };

    await requestDoseClaim(message.id);

    expect(emitted).toEqual([]);
    expect(ui.notifications.warn).toHaveBeenCalledWith("ep2e.actorSheet.warnings.doseNeedsClaimant");
  });

  test("without a GM connected a player cannot claim", async () => {
    const giver = carrying();
    const { message } = await offerDose(giver, giver.items.get("kick1"));
    game.user.isGM = false;
    game.user.character = makeActor({ type: "character", name: "Dinah" });
    game.users.activeGM = null;

    await requestDoseClaim(message.id);

    expect(emitted).toEqual([]);
    expect(ui.notifications.warn).toHaveBeenCalledWith("ep2e.actorSheet.warnings.doseNeedsGM");
  });
});

describe("who a dose is for", () => {
  test.each([[{ selection: "self" }, "self"], [{ selection: "other" }, "other"], [{ selection: "unwilling" }, "unwilling"], [{ cancelled: true }, null]])(
    "the dialog answering %p means %p", async (answer, expected) => {
      seedDialogs(answer);
      expect(await selectDoseRecipient("Kick")).toEqual(expected);
    });
});

describe("the stress a drug leaves behind as it wears off", () => {
  /**
   * A character dosed with Kick that leaves 1d6 stress behind, its wear-off card already posted.
   * @returns {Promise<Object>} The actor and the wear-off card
   */
  async function woreOff() {
    registerDoseHooks();
    const actor = carrying({ wearOff: { d10: 0, d6: 1, bonus: 0 } });
    actor._source.system.aptitudes.wil.value = 15;
    actor.prepareData();
    await takeDose(actor, actor.items.get("kick1"));
    createdMessages.length = 0;
    await actor.deleteEmbeddedDocuments("ActiveEffect", [doseOn(actor).id]);
    await new Promise(resolve => setTimeout(resolve, 0));
    return { actor, card: createdMessages[0] };
  }

  test("the wear-off card offers the roll and remembers what to roll", async () => {
    const { actor, card } = await woreOff();

    expect(card.content).toContain("rollWearOff");
    expect(card.getFlag("eclipsephase", "wearOff")).toMatchObject({ actorUuid: actor.uuid, sv: "1d6", rolled: false });
  });

  test("a drug with no wear-off stress offers no roll", async () => {
    registerDoseHooks();
    const actor = carrying();
    await takeDose(actor, actor.items.get("kick1"));
    createdMessages.length = 0;
    await actor.deleteEmbeddedDocuments("ActiveEffect", [doseOn(actor).id]);

    expect(createdMessages[0].content).not.toContain("rollWearOff");
    expect(createdMessages[0].getFlag("eclipsephase", "wearOff")).toBeUndefined();
  });

  test("rolling applies the stress to the actor, posts the roll and leaves the card as a record", async () => {
    const { actor, card } = await woreOff();
    const before = actor.system.health.mental.value ?? 0;
    seedRolls([4]);

    const taken = await rollWearOffStress(card);

    expect(taken).toEqual(4);
    expect(actor.system.health.mental.value).toEqual(before + 4);
    expect(createdMessages.some(message => message.content?.includes("ep2e.chat.dose.wearOffFlavor"))).toBe(true);
    expect(card.content).not.toContain("rollWearOff");
  });

  test("the stress is rolled once, however often the button is pressed", async () => {
    const { card } = await woreOff();
    seedRolls([4, 6]);

    await rollWearOffStress(card);

    expect(await rollWearOffStress(card)).toBeNull();
  });

  test("a player who cannot change the card sends the roll to the GM", async () => {
    const { card } = await woreOff();
    const emitted = [];
    const realEmit = game.socket.emit;
    game.socket.emit = (name, payload) => emitted.push(payload);
    card.author = "someone-else";
    game.user.isGM = false;
    game.users.activeGM = { id: "gm-1" };

    try {
      await requestWearOffRoll(card.id);
    } finally {
      game.socket.emit = realEmit;
      game.user.isGM = true;
    }

    expect(emitted).toEqual([{ action: "rollWearOff", messageId: card.id }]);
    expect(card.getFlag("eclipsephase", "wearOff").rolled).toBe(false);
  });
});
