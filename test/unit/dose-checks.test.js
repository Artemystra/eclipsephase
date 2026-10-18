import { postUseCheckCard, requestUseCheck, settleUseCheck, registerUseCheckHooks, rollDoseHarm } from "../../module/common/dose-checks.js";
import { takeDose } from "../../module/common/doses.js";
import { drugBlockingPsi, drugPsiPenalties } from "../../module/common/dose-state.js";
import { strainSubstrate } from "../../module/common/body-markers.js";
import { registerCoreStrainFamilies, resetStrainFamilies } from "../../module/rolls/strain-families.js";
import { TASK_RESULT } from "../../module/rolls/dice.js";
import { makeActor, resetWorld, seedRolls } from "../setup/factories.js";

const { createdMessages } = global.__ep;
const SKIP_DIALOG = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } };
const BASE_CHECK = { aptitude: "", modifier: 0, failure: "", duration: { value: null, units: "" }, stress: { d10: 0, d6: 0, bonus: 0 }, successPsiPenalty: 0 };

/**
 * A character in a biomorph carrying one pack of a drug that calls for a check.
 * @param {String} name - The drug's name
 * @param {Object} useCheck - The drug's check, merged over an empty one
 * @returns {Actor} The prepared actor
 */
function carrying(name, useCheck) {
  return makeActor({
    type: "character",
    system: { activeMorph: "morph1", aptitudes: { som: { value: 15 }, wil: { value: 15 } } },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio", dur: 30 } },
      { _id: "drug1", name, type: "drug", system: { active: true, drugType: "biochem", inhalation: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 1, units: "hours" }, useCheck: { ...BASE_CHECK, ...useCheck } } }
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
 * The check card a dose posted.
 * @returns {Object|undefined} The card
 */
function checkCard() {
  return createdMessages.find(message => message.getFlag?.("eclipsephase", "doseCheck"));
}

/**
 * Takes the drug, then rolls its check with the d100 showing the given value.
 * @param {Actor} actor - The actor
 * @param {Number} die - The d100 result
 * @returns {Promise<void>} Resolves once the outcome has settled
 */
async function takeAndRoll(actor, die) {
  await takeDose(actor, actor.items.get("drug1"));
  seedRolls([die]);
  await requestUseCheck(checkCard().id, SKIP_DIALOG);
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Waits until a condition holds, for work a hook starts without awaiting. Gives up after a second.
 * @param {Function} predicate - Checked after every tick
 * @returns {Promise<void>} Resolves once the predicate holds
 */
async function until(predicate) {
  for (let tick = 0; tick < 200 && !predicate(); tick++) await new Promise(resolve => setTimeout(resolve, 5));
}

const TWITCH = { aptitude: "som", failure: "incapacitated", duration: { value: 10, units: "minutes" } };
const INHIBITOR = { aptitude: "wil", modifier: -20, failure: "blocksPsi", successPsiPenalty: -30 };
const FLIGHT = { aptitude: "wil", failure: "stress", stress: { d10: 1, d6: 0, bonus: 0 } };

beforeEach(() => {
  resetWorld();
  resetStrainFamilies();
  registerCoreStrainFamilies();
  registerUseCheckHooks();
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("the check card", () => {
  test("a drug that calls for a check posts it with the roll button for the actor's owners", async () => {
    const actor = carrying("Inhibitor", INHIBITOR);

    await takeDose(actor, actor.items.get("drug1"));

    expect(checkCard().content).toContain("rollDoseCheck");
    expect(checkCard().content).toContain("ownerOnlyControl");
    expect(checkCard().getFlag("eclipsephase", "doseCheck")).toMatchObject({ actorUuid: actor.uuid, effectId: doseOn(actor).id });
  });

  test("it is whispered to the actor's owners and the GMs, and comes after the dose card", async () => {
    const realFilter = game.users.filter;
    game.users.filter = predicate => [{ id: "gm-1", isGM: true }, { id: "owner-1", isGM: false }, { id: "stranger", isGM: false }].filter(predicate);
    const actor = carrying("Inhibitor", INHIBITOR);
    actor.testUserPermission = user => user.id === "owner-1";

    try {
      await takeDose(actor, actor.items.get("drug1"));
    } finally {
      game.users.filter = realFilter;
    }

    expect(checkCard().whisper).toEqual(["gm-1", "owner-1"]);
    const doseCardIndex = createdMessages.findIndex(message => message.content?.includes("ep2e.chat.dose.taken"));
    expect(createdMessages.indexOf(checkCard())).toBeGreaterThan(doseCardIndex);
  });

  test("once rolled, the button gives way to a note", async () => {
    const actor = carrying("Twitch", TWITCH);

    await takeAndRoll(actor, 5);

    expect(checkCard().content).toContain("ep2e.chat.dose.checkRolled");
    expect(checkCard().content).not.toContain("rollDoseCheck");
  });

  test("a drug without a check posts none", async () => {
    const actor = carrying("Kick", {});

    await takeDose(actor, actor.items.get("drug1"));

    expect(checkCard()).toBeUndefined();
  });

  test("the drug's own modifier lands on the check", async () => {
    const actor = carrying("Inhibitor", INHIBITOR);

    await takeAndRoll(actor, 95);

    const roll = createdMessages.find(message => message.flags?.eclipsephase?.roll?.doseCheck);
    expect(roll.content).toContain("Inhibitor");
    expect(roll.content).toContain("-20");
  });

  test("a check already rolled is not rolled again", async () => {
    const actor = carrying("Twitch", TWITCH);
    await takeAndRoll(actor, 95);
    const before = createdMessages.length;

    await requestUseCheck(checkCard().id, SKIP_DIALOG);

    expect(createdMessages).toHaveLength(before);
    expect(ui.notifications.warn).toHaveBeenCalledWith("ep2e.actorSheet.warnings.doseCheckRolled");
  });
});

describe("what a failed check costs", () => {
  test("Twitch: incapacitated for its own ten minutes, shown as Paralyzed", async () => {
    const actor = carrying("Twitch", TWITCH);

    await takeAndRoll(actor, 95);

    const incapacitated = actor.effects.find(effect => effect.getFlag("eclipsephase", "incapacitatedBy"));
    expect(incapacitated.statuses).toEqual(["paralysis"]);
    expect(incapacitated.duration).toMatchObject({ value: 10, units: "minutes" });
    expect(incapacitated.getFlag("eclipsephase", "effectKey")).toEqual("incapacitated");
    await until(() => createdMessages.some(message => message.content?.includes("ep2e.chat.dose.outcomeIncapacitated")));
    expect(createdMessages.some(message => message.content?.includes("ep2e.chat.dose.outcomeIncapacitated"))).toBe(true);
  });

  test("an incapacitation without a span of its own lasts as long as the dose, and goes with it", async () => {
    const actor = carrying("Nervex", { aptitude: "som", failure: "incapacitated" });
    await takeAndRoll(actor, 95);
    const incapacitated = actor.effects.find(effect => effect.getFlag("eclipsephase", "incapacitatedBy"));
    expect(incapacitated.duration.value).toBeNull();

    await actor.deleteEmbeddedDocuments("ActiveEffect", [doseOn(actor).id]);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(actor.effects.find(effect => effect.getFlag("eclipsephase", "incapacitatedBy"))).toBeUndefined();
  });

  test("Inhibitor: psi is blocked while the dose runs, with its own reason", async () => {
    const actor = carrying("Inhibitor", INHIBITOR);

    await takeAndRoll(actor, 95);

    expect(drugBlockingPsi(actor)).toEqual("Inhibitor");
    expect(strainSubstrate(actor, "psi")).toMatchObject({ blocked: true, reasonKey: "ep2e.roll.announce.psi.blockedByDrug" });
  });

  test("Flight: with no pool to spend, the panic's stress is rolled at once, on the mind", async () => {
    const actor = carrying("Flight", FLIGHT);
    await takeDose(actor, actor.items.get("drug1"));

    seedRolls([95, 6]);
    await requestUseCheck(checkCard().id, SKIP_DIALOG);
    await until(() => (actor.system.health.mental.value ?? 0) > 0);

    expect(actor.system.health.mental.value).toEqual(6);
    expect(createdMessages.some(message => message.getFlag?.("eclipsephase", "wearOff"))).toBe(false);
  });
});

describe("a check whose failure harms the body", () => {
  const CAUSTIC = { aptitude: "som", failure: "damage", stress: { d10: 1, d6: 0, bonus: 2 } };
  const FAILED = { originalResult: TASK_RESULT.FAILURE_ONE };

  /**
   * A check's roll card for the actor's running dose, as RollCheck leaves it.
   * @param {Actor} actor - The dosed actor
   * @returns {Promise<Object>} The card
   */
  async function rollCard(actor) {
    const doseCheck = { actorUuid: actor.uuid, effectId: doseOn(actor).id, name: "Caustic", modifier: 0, harm: "damage", formula: "1d10+2" };
    return ChatMessage.create({ flags: { eclipsephase: { roll: { doseCheck } } } });
  }

  test("with no pool to spend, the damage is rolled at once and lands on the body", async () => {
    const actor = carrying("Caustic", CAUSTIC);
    await takeDose(actor, actor.items.get("drug1"));

    seedRolls([95, 7]);
    await requestUseCheck(checkCard().id, SKIP_DIALOG);
    await until(() => actor.system.health.physical.value > 0);

    expect(actor.system.health.physical.value).toEqual(7);
    expect(actor.system.health.mental.value ?? 0).toEqual(0);
  });

  test("with pool left, nothing is rolled until the card's button is pressed", async () => {
    const actor = carrying("Caustic", CAUSTIC);
    await takeDose(actor, actor.items.get("drug1"));
    const card = await rollCard(actor);

    Hooks.callAll("eclipsephase.postRoll", { flags: card.getFlag("eclipsephase", "roll"), outputData: { alternatives: { ...FAILED, options: { available: true } } }, message: card });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(actor.system.health.physical.value).toEqual(0);
    expect(card.getFlag("eclipsephase", "doseHarm")).toBeUndefined();
  });

  test("the card offers the button only for a failed check that does harm", async () => {
    const render = data => foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/chat/task-result.html", data);
    const doseCheck = { harm: "damage" };

    expect(await render({ resultClass: "fail", rollContext: { doseCheck }, actor: { id: "a1" } })).toContain("doseHarm");
    expect(await render({ resultClass: "success", rollContext: { doseCheck }, actor: { id: "a1" } })).not.toContain("doseHarm");
    expect(await render({ resultClass: "fail", rollContext: { doseCheck: { harm: null } }, actor: { id: "a1" } })).not.toContain("doseHarm");
  });

  test("the harm is rolled once, however often the button is pressed", async () => {
    const actor = carrying("Caustic", CAUSTIC);
    await takeDose(actor, actor.items.get("drug1"));
    const card = await rollCard(actor);
    seedRolls([7, 9]);

    await rollDoseHarm(card);

    expect(await rollDoseHarm(card)).toBeNull();
    expect(actor.system.health.physical.value).toEqual(7);
  });

  test("a pool spend that turns the check into a pass closes the button without harm", async () => {
    const actor = carrying("Caustic", CAUSTIC);
    await takeDose(actor, actor.items.get("drug1"));
    const card = await rollCard(actor);

    Hooks.callAll("eclipsephase.poolResult", { context: { ...card.getFlag("eclipsephase", "roll"), messageId: card.id }, newResult: TASK_RESULT.SUCCESS });
    await until(() => card.getFlag("eclipsephase", "doseHarm")?.rolled);

    expect(card.getFlag("eclipsephase", "doseHarm")).toEqual({ rolled: true });
    expect(actor.system.health.physical.value).toEqual(0);
  });
});

describe("BTX2", () => {
  test("a failed SOM Check leaves the target immobilized for an hour, shown as Restrained", async () => {
    const actor = carrying("BTX2", { aptitude: "som", failure: "immobilized", duration: { value: 1, units: "hours" } });

    await takeAndRoll(actor, 95);

    const immobilized = actor.effects.find(effect => effect.getFlag("eclipsephase", "incapacitatedBy"));
    expect(immobilized.statuses).toEqual(["restrain"]);
    expect(immobilized.duration).toMatchObject({ value: 1, units: "hours" });
    await until(() => createdMessages.some(message => message.content?.includes("ep2e.chat.dose.outcomeImmobilized")));
    expect(createdMessages.some(message => message.content?.includes("ep2e.chat.dose.outcomeImmobilized"))).toBe(true);
  });
});

describe("what a passed check still costs", () => {
  test("Inhibitor: -30 to Psi Tests instead of a block", async () => {
    const actor = carrying("Inhibitor", INHIBITOR);

    await takeAndRoll(actor, 5);

    expect(drugBlockingPsi(actor)).toBeNull();
    expect(drugPsiPenalties(actor)).toEqual([{ name: "Inhibitor", modifier: -30 }]);
  });

  test("Twitch: nothing at all", async () => {
    const actor = carrying("Twitch", TWITCH);

    await takeAndRoll(actor, 5);

    expect(actor.effects.find(effect => effect.getFlag("eclipsephase", "incapacitatedBy"))).toBeUndefined();
    expect(doseOn(actor).getFlag("eclipsephase", "dose").checkOutcome).toEqual("passed");
  });
});

describe("a pool spend that turns the check around", () => {
  test("takes the failure back and applies the pass, once", async () => {
    const actor = carrying("Inhibitor", INHIBITOR);
    await takeAndRoll(actor, 95);
    const roll = createdMessages.find(message => message.flags?.eclipsephase?.roll?.doseCheck);
    const context = { ...roll.flags.eclipsephase.roll, messageId: roll.id };

    Hooks.callAll("eclipsephase.poolResult", { context, newResult: TASK_RESULT.SUCCESS });
    await until(() => doseOn(actor).getFlag("eclipsephase", "dose").psiPenalty === -30);

    expect(drugBlockingPsi(actor)).toBeNull();
    expect(drugPsiPenalties(actor)).toEqual([{ name: "Inhibitor", modifier: -30 }]);
    expect(await settleUseCheck(context.doseCheck, true)).toBeNull();
  });

  test("an incapacitation goes when the check is turned into a pass", async () => {
    const actor = carrying("Twitch", TWITCH);
    await takeAndRoll(actor, 95);
    const check = createdMessages.find(message => message.flags?.eclipsephase?.roll?.doseCheck).flags.eclipsephase.roll.doseCheck;

    await settleUseCheck(check, true);

    expect(actor.effects.find(effect => effect.getFlag("eclipsephase", "incapacitatedBy"))).toBeUndefined();
  });
});

describe("a second dose of the same drug", () => {
  test("asks for the check again", async () => {
    const actor = carrying("Twitch", TWITCH);
    actor._source.items[1].system.quantity = 2;
    await takeAndRoll(actor, 5);
    createdMessages.length = 0;

    await takeDose(actor, actor.items.get("drug1"));

    expect(checkCard()).toBeDefined();
    expect(doseOn(actor).getFlag("eclipsephase", "dose").checkOutcome).toBeNull();
  });
});

describe("a dose card for a drug with no check", () => {
  test("postUseCheckCard posts nothing", async () => {
    const actor = carrying("Kick", {});
    await takeDose(actor, actor.items.get("drug1"));

    expect(await postUseCheckCard(actor, doseOn(actor))).toBeNull();
  });
});
