import { takeDose, settleOverTime, damageTicksDue, combinedDamage, tickBreakdowns, registerOverTimeHooks, endRunOutDoses } from "../../module/common/doses.js";
import { drugHealingAddition } from "../../module/rolls/modifiers.js";
import { globalModifiers } from "../../module/rolls/modifiers.js";
import { flatBonus } from "../../module/rolls/dice.js";
import { JSDOM } from "jsdom";
import { makeActor, makeUnlinkedToken, resetWorld, seedRolls } from "../setup/factories.js";

const START = 5000;
const NO_DAMAGE = { d10: 0, d6: 0, bonus: 0 };

/**
 * A character in a biomorph of Durability 30, carrying one toxin with the given effects over time.
 * @param {Object} overTime - The toxin's overTime
 * @param {Object} [duration] - The toxin's duration
 * @returns {Actor} The prepared actor
 */
function exposed(overTime, duration = { value: 1, units: "minutes" }) {
  return makeActor(exposedData(overTime, duration));
}

/**
 * The data of a character carrying one toxin with the given effects over time, as exposed() builds it.
 * @param {Object} overTime - The toxin's overTime
 * @param {Object} duration - The toxin's duration
 * @returns {Object} The actor data
 */
function exposedData(overTime, duration) {
  return {
    type: "character",
    system: { activeMorph: "morph1" },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio", dur: 30 } },
      {
        _id: "tox1", name: "Necrosis", type: "drug",
        system: {
          active: true, drugType: "nano", category: "toxin", quantity: 1, usagesUsed: 0, usagesMax: 5,
          duration, injection: true,
          overTime: { damage: NO_DAMAGE, interval: "turn", ticks: null, modifier: 0, incapacitates: false, ...overTime }
        }
      }
    ]
  };
}

/**
 * Takes the toxin and returns its dose.
 * @param {Actor} actor - The exposed actor
 * @returns {Promise<ActiveEffect>} The running dose
 */
async function dosed(actor) {
  await takeDose(actor, actor.items.get("tox1"));
  return actor.effects.find(effect => effect.getFlag("eclipsephase", "dose"));
}

/**
 * The formulas of every roll made while the callback ran.
 * @param {Function} callback - What to run
 * @returns {Promise<String[]>} The formulas
 */
async function formulasRolledBy(callback) {
  const RealRoll = global.Roll;
  const formulas = [];
  global.Roll = class extends RealRoll {
    constructor(formula, ...rest) {
      super(formula, ...rest);
      formulas.push(formula);
    }
  };
  try {
    await callback();
  } finally {
    global.Roll = RealRoll;
  }
  return formulas;
}

beforeEach(() => {
  resetWorld();
  game.time.worldTime = START;
  game.users.activeGM = { isSelf: false };
  CONFIG.time = { ...(CONFIG.time ?? {}), roundTime: 3 };
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("damage every tick", () => {
  test("the first tick lands as the dose takes hold, then one per action turn", async () => {
    const actor = exposed({ damage: { d10: 0, d6: 1, bonus: 0 } });
    const dose = await dosed(actor);
    seedRolls([4, 9]);

    await settleOverTime(actor, dose, START);
    game.time.worldTime = START + 6;
    const later = await settleOverTime(actor, dose, START + 6);

    expect(later.ticks).toBe(2);
    expect(actor.system.health.physical.value).toBe(13);
  });

  test("a jump of the clock rolls every skipped tick in one roll, never past the dose's span", async () => {
    const actor = exposed({ damage: { d10: 0, d6: 1, bonus: 0 } });
    const dose = await dosed(actor);
    await settleOverTime(actor, dose, START);

    const formulas = await formulasRolledBy(() => settleOverTime(actor, dose, START + 600));

    expect(formulas).toEqual(["19d6"]);
    expect(dose.getFlag("eclipsephase", "dose").overTimeState.ticks).toBe(20);
  });

  test("a fixed count stops there: BTX2's three turns, CR Gas's single tick", () => {
    const dose = { start: { time: START }, duration: { value: 1, units: "hours" } };

    expect(damageTicksDue({ damage: { d10: 2, d6: 0, bonus: 10 }, interval: "turn", ticks: 3 }, dose, START + 3600)).toBe(3);
    expect(damageTicksDue({ damage: { d10: 0, d6: 1, bonus: 0 }, interval: "turn", ticks: 1 }, dose, START + 3600)).toBe(1);
  });

  test("ticks taken together multiply every part of the damage", () => {
    expect(combinedDamage({ d10: 2, d6: 0, bonus: 10 }, 3)).toBe("6d10+30");
  });

  test("one roll for several ticks splits back into each tick's own dice and bonus", () => {
    const roll = { total: 48, dice: [{ faces: 10, results: [{ result: 3 }, { result: 4 }, { result: 5 }, { result: 6 }] }] };

    const ticks = tickBreakdowns(roll, { d10: 2, d6: 0, bonus: 10 }, 2);

    expect(ticks.map(tick => [tick.total, tick.bonus, tick.tens.map(die => die.result)])).toEqual([[17, "+10", [3, 4]], [21, "+10", [5, 6]]]);
  });

  test("each tick goes against the Wound Threshold on its own, not as one sum", async () => {
    const actor = exposed({ damage: { d10: 2, d6: 0, bonus: 10 }, ticks: 3 }, { value: 1, units: "hours" });
    const dose = await dosed(actor);
    const dealt = [];
    actor.modifyTokenAttribute = async (attribute, value) => dealt.push([attribute, value]);
    const RealRoll = global.Roll;
    global.Roll = class extends RealRoll {
      async evaluate() {
        this.dice = [{ faces: 10, results: [1, 2, 3, 4, 5, 6].map(result => ({ result })) }];
        this.total = 51;
        return this;
      }
    };

    try {
      await settleOverTime(actor, dose, START + 3600);
    } finally {
      global.Roll = RealRoll;
    }

    expect(dealt).toEqual([["health.physical", 13], ["health.physical", 17], ["health.physical", 21]]);
  });

  test("a tick is dealt once, however often the dose is settled", async () => {
    const actor = exposed({ damage: { d10: 0, d6: 1, bonus: 0 } });
    const dose = await dosed(actor);
    seedRolls([5, 5]);

    await settleOverTime(actor, dose, START);

    expect(await settleOverTime(actor, dose, START)).toBeNull();
    expect(actor.system.health.physical.value).toBe(5);
  });

  test("a world actor's dose shown on its unlinked token deals nothing a second time", async () => {
    const actor = exposed({ damage: { d10: 0, d6: 1, bonus: 0 } });
    const dose = await dosed(actor);
    const copy = { isToken: true, token: { baseActor: actor }, effects: actor.effects };

    expect(await settleOverTime(copy, dose, START)).toBeNull();
  });

  test("the active GM deals the ticks a new combat round or the clock brings", async () => {
    const actor = exposed({ damage: { d10: 0, d6: 1, bonus: 0 } }, { value: 1, units: "hours" });
    const dose = await dosed(actor);
    seedRolls([2]);
    await settleOverTime(actor, dose, START);
    game.users.activeGM = { isSelf: true };
    registerOverTimeHooks();
    seedRolls([4]);

    game.time.worldTime = START + 3;
    Hooks.callAll("updateWorldTime", START + 3, 3);
    for (let wait = 0; wait < 50 && actor.system.health.physical.value < 6; wait++) await new Promise(resolve => setTimeout(resolve, 0));

    expect(dose.getFlag("eclipsephase", "dose").overTimeState.ticks).toBe(2);
    expect(actor.system.health.physical.value).toBe(6);
  });

  test("a clock jump past a token's dose deals the ticks still due before the dose goes", async () => {
    const scene = { uuid: "Scene.s1", tokens: [] };
    const actor = makeUnlinkedToken(scene, exposedData({ damage: { d10: 0, d6: 1, bonus: 0 } }, { value: 1, units: "minutes" }));
    const dose = await dosed(actor);
    seedRolls([2]);
    await settleOverTime(actor, dose, START);
    seedRolls([40]);

    game.time.worldTime = START + 120;
    await dose.update({ "duration.expired": true });
    await endRunOutDoses(actor, [dose]);

    expect(dose.getFlag("eclipsephase", "dose").overTimeState.ticks).toBe(20);
    expect(actor.system.health.physical.value).toBe(42);
    expect(actor.effects.find(effect => effect.getFlag("eclipsephase", "dose"))).toBeUndefined();
  });

  test("the active GM settles a dose the moment it takes hold", async () => {
    game.users.activeGM = { isSelf: true };
    registerOverTimeHooks();
    const actor = exposed({ damage: { d10: 0, d6: 1, bonus: 0 } });
    seedRolls([3]);

    await dosed(actor);
    for (let wait = 0; wait < 50 && !actor.system.health.physical.value; wait++) await new Promise(resolve => setTimeout(resolve, 0));

    expect(actor.system.health.physical.value).toBe(3);
  });
});

describe("a modifier that grows", () => {
  const disruptor = { interval: "hour", modifier: -5, incapacitates: true };

  test("takes its first step after the first full hour, then one every hour, up to the end of the dose, on the intoxicated line", async () => {
    const actor = exposed(disruptor, { value: 8, units: "hours" });
    const dose = await dosed(actor);

    await settleOverTime(actor, dose, START);
    const atOnce = globalModifiers(actor);
    await settleOverTime(actor, dose, START + 2 * 3600 + 60);
    const afterTwoHours = globalModifiers(actor);
    await settleOverTime(actor, dose, START + 8 * 3600);

    expect(atOnce).toEqual([]);
    expect(afterTwoHours).toEqual([expect.objectContaining({ label: "ep2e.roll.announce.intoxicated", modifier: -10 })]);
    expect(globalModifiers(actor)).toEqual([expect.objectContaining({ label: "ep2e.roll.announce.intoxicated", modifier: -40 })]);
  });

  test("incapacitates once it reaches the Durability, and only once", async () => {
    const actor = exposed(disruptor, { value: 8, units: "hours" });
    const dose = await dosed(actor);

    await settleOverTime(actor, dose, START + 4 * 3600);
    const notYet = actor.effects.filter(effect => effect.getFlag("eclipsephase", "incapacitatedBy") === dose.id).length;
    await settleOverTime(actor, dose, START + 5 * 3600);
    await settleOverTime(actor, dose, START + 6 * 3600);

    const conditions = actor.effects.filter(effect => effect.getFlag("eclipsephase", "incapacitatedBy") === dose.id);
    expect(notYet).toBe(0);
    expect(conditions).toHaveLength(1);
    expect(conditions[0].statuses).toContain("paralysis");
    expect(conditions[0].showIcon).toBe(CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS);
  });
});

describe("the flat part of a damage roll", () => {
  test("is shown beside the dice, signed", () => {
    expect(flatBonus({ terms: [{ number: 2, faces: 10 }, { operator: "+" }, { number: 10 }] })).toBe("+10");
    expect(flatBonus({ terms: [{ number: 1, faces: 6 }, { operator: "-" }, { number: 2 }] })).toBe("-2");
    expect(flatBonus({ terms: [{ number: 1, faces: 100 }] })).toBe("");
  });
});

describe("Meds and the healing dialog", () => {
  test("a running dose that stands for a healing addition is what the dialog starts on", async () => {
    const actor = exposed({});
    await actor.items.get("tox1").update({ "system.healingAddition": "meds" });

    expect(drugHealingAddition(actor)).toBe("");
    await dosed(actor);
    expect(drugHealingAddition(actor)).toBe("meds");
  });

  test("the dialog preselects the addition it is handed", async () => {
    const html = await foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/chat/pop-up.html", { dialogType: "healDamage", type: "physical", presetAddition: "meds" });
    const select = new JSDOM(html).window.document.querySelector('select[name="addition"]');

    expect(select.value).toBe("meds");
  });
});
