import { hasBiomods, rechargeDurationKey, stampedDay, rechargeResetUpdate, resetRechargesForNewDay } from "../../module/common/recharge.js";
import { setSetting } from "../setup/factories.js";
import { makeActor, resetWorld } from "../setup/factories.js";

/**
 * A character with or without the biomods marker the healing code reads.
 * @param {Boolean} biomods - Whether the body carries biomods
 * @returns {Actor} The character
 */
function character(biomods) {
  return makeActor({ type: "character", system: { additionalSystems: { healing: { biomods } } } });
}

beforeEach(() => resetWorld());

describe("how long a recharge takes", () => {
  test("a body with biomods recharges faster, both short and long", () => {
    const actor = character(true);
    expect(hasBiomods(actor)).toBe(true);
    expect(rechargeDurationKey(actor, "short")).toEqual("ep2e.recharge.duration.shortBiomods");
    expect(rechargeDurationKey(actor, "long")).toEqual("ep2e.recharge.duration.longBiomods");
  });

  test("a body without them takes the longer timeframes", () => {
    const actor = character(false);
    expect(hasBiomods(actor)).toBe(false);
    expect(rechargeDurationKey(actor, "short")).toEqual("ep2e.recharge.duration.shortFlat");
    expect(rechargeDurationKey(actor, "long")).toEqual("ep2e.recharge.duration.longFlat");
  });
});

describe("the day-change reset", () => {
  test("an actor that has never been stamped is stamped, not reset", () => {
    const actor = makeActor({ type: "character", system: { rest: { short1: true, long: true } } });
    expect(stampedDay(actor)).toBeNull();
    expect(rechargeResetUpdate(actor, 5)).toEqual({ "flags.eclipsephase.rechargeDay": 5 });
  });

  test("nothing is due while the clock stays on the same day", () => {
    const actor = makeActor({ type: "character", flags: { eclipsephase: { rechargeDay: 5 } } });
    expect(rechargeResetUpdate(actor, 5)).toBeNull();
  });

  test("a new day clears every allowance and re-stamps", () => {
    const actor = makeActor({ type: "character", flags: { eclipsephase: { rechargeDay: 5 } } });
    expect(rechargeResetUpdate(actor, 6)).toEqual({
      "flags.eclipsephase.rechargeDay": 6,
      "system.rest.short1": false,
      "system.rest.short2": false,
      "system.rest.shortExtra": false,
      "system.rest.long": false
    });
  });

  test("a day crossed at one minute past midnight counts, the same as any other", () => {
    const actor = makeActor({ type: "character", flags: { eclipsephase: { rechargeDay: 1 } } });
    expect(rechargeResetUpdate(actor, 2)).toMatchObject({ "system.rest.long": false });
  });

  test("npcs and goons are included, anything else is left alone", () => {
    for (const type of ["character", "npc", "goon"]) {
      const actor = makeActor({ type, flags: { eclipsephase: { rechargeDay: 1 } } });
      expect(rechargeResetUpdate(actor, 2)).not.toBeNull();
    }
    const shop = makeActor({ type: "vehicle", flags: { eclipsephase: { rechargeDay: 1 } } });
    expect(rechargeResetUpdate(shop, 2)).toBeNull();
  });
});

describe("resetting the whole world on a day change", () => {
  /**
   * A character already stamped on an earlier day, with every allowance spent.
   * @param {String} name - The character's name
   * @returns {Actor} The character
   */
  function spentCharacter(name) {
    return makeActor({
      type: "character",
      name,
      system: { rest: { short1: true, short2: true, shortExtra: true, long: true } },
      flags: { eclipsephase: { rechargeDay: 1 } }
    });
  }

  beforeEach(() => {
    setSetting("eclipsephase", "rechargeAutoReset", true);
    game.users.activeGM = { isSelf: true };
    game.time.worldTime = 86400 * 5;
  });

  test("every spent allowance comes back", async () => {
    const actor = spentCharacter("Hex");
    await resetRechargesForNewDay();
    expect(actor.system.rest).toMatchObject({ short1: false, short2: false, shortExtra: false, long: false });
  });

  test("the actor is stamped with the new day, so it does not reset twice", async () => {
    const actor = spentCharacter("Hex");
    await resetRechargesForNewDay();
    expect(stampedDay(actor)).toEqual(6);

    await actor.update({ "system.rest.long": true });
    await resetRechargesForNewDay();
    expect(actor.system.rest.long).toBe(true);
  });

  test("nothing happens while the setting is off", async () => {
    setSetting("eclipsephase", "rechargeAutoReset", false);
    const actor = spentCharacter("Hex");
    await resetRechargesForNewDay();
    expect(actor.system.rest.long).toBe(true);
  });

  test("it runs only on the active GM's client, so it is not done once per player", async () => {
    game.users.activeGM = { isSelf: false };
    const actor = spentCharacter("Hex");
    await resetRechargesForNewDay();
    expect(actor.system.rest.long).toBe(true);
  });

  test("it runs with no GM connected at all without throwing", async () => {
    game.users.activeGM = null;
    spentCharacter("Hex");
    await expect(resetRechargesForNewDay()).resolves.toBeUndefined();
  });
});
