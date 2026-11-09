import { chiPushMinutes, pushChiSleight, endExpiredChiPushes } from "../../module/rolls/psi.js";
import { registerCoreStrainFamilies, resetStrainFamilies } from "../../module/rolls/strain-families.js";
import { registerPoolRule } from "../../module/rolls/pools.js";
import { makeActor, resetWorld } from "../setup/factories.js";

const BOOST = [{ key: "system.pools.insight.mod", value: "+1", type: "add" }];

/**
 * An async sleeved in a biomorph, carrying one chi sleight whose own effect can be duplicated.
 * @param {Number} wil - The actor's Willpower
 * @returns {Actor} The prepared actor
 */
function asyncWithChiSleight(wil) {
  return makeActor({
    type: "character",
    system: { activeMorph: "morph1", aptitudes: { wil: { value: wil } } },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio" } },
      {
        _id: "chi1", name: "Instinct", type: "aspect",
        system: { psiType: "chi", strainFamily: "psi", pushed: false, active: true },
        effects: [{ name: "Instinct", changes: BOOST }]
      }
    ]
  });
}

beforeEach(() => {
  resetWorld();
  resetStrainFamilies();
  registerCoreStrainFamilies();
  registerPoolRule();
  game.time.worldTime = 5000;
});

describe("how long a chi push lasts", () => {
  test.each([[10, 2], [25, 5], [60, 12]])("WIL %i gives %i minutes", (wil, minutes) => {
    expect(chiPushMinutes({ system: { aptitudes: { wil: { value: wil } } } })).toEqual(minutes);
  });

  test("it never falls below a minute, however low Willpower is", () => {
    expect(chiPushMinutes({ system: { aptitudes: { wil: { value: 2 } } } })).toEqual(1);
    expect(chiPushMinutes({})).toEqual(1);
  });
});

describe("pushing a chi sleight", () => {
  test("the boost carries the duration the announcement promises", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");

    const boost = actor.items.get("chi1").effects.find(effect => effect.getFlag("eclipsephase", "chiPushBoost"));
    expect(boost).toBeDefined();
    expect(boost.duration).toMatchObject({ value: 5, units: "minutes" });
  });

  test("it stamps a complete start, which Foundry does not do for an effect on an item", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");

    const boost = actor.items.get("chi1").effects.find(effect => effect.getFlag("eclipsephase", "chiPushBoost"));
    expect(boost.start?.time).toEqual(5000);
    for (const field of ["combat", "combatant", "initiative", "round", "turn"]) {
      expect(boost.start).toHaveProperty(field);
    }
  });

  test("it ends on the clock rather than on a combat turn", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");

    const boost = actor.items.get("chi1").effects.find(effect => effect.getFlag("eclipsephase", "chiPushBoost"));
    expect(boost.duration.expiry).toBeNull();
  });

  test("the boost puts no icon on the token", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");
    const boost = actor.items.get("chi1").effects.find(effect => effect.getFlag("eclipsephase", "chiPushBoost"));
    expect(boost.showIcon).toEqual(CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER);
  });

  test("the pool point the push adds is handed over, and taken back when the push ends", async () => {
    const actor = asyncWithChiSleight(25);
    const before = actor.system.pools.insight.value ?? 0;

    await pushChiSleight(actor, "chi1");
    expect(actor.system.pools.insight.value).toEqual(before + 1);

    await endExpiredChiPushes(actor, actor.items.get("chi1").effects.map(effect => {
      effect.duration.expired = true;
      return effect;
    }));
    expect(actor.system.pools.insight.value).toEqual(before);
  });

  test("the sleight is marked pushed", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");
    expect(actor.items.get("chi1").system.pushed).toBe(true);
  });
});

describe("a push running out", () => {
  test("an expired boost is cleaned up, clearing the pushed mark", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");

    const boost = actor.items.get("chi1").effects.find(effect => effect.getFlag("eclipsephase", "chiPushBoost"));
    boost.duration.expired = true;
    await endExpiredChiPushes(actor, [boost]);

    expect(actor.items.get("chi1").system.pushed).toBe(false);
    expect(actor.items.get("chi1").effects.some(e => e.getFlag("eclipsephase", "chiPushBoost"))).toBe(false);
  });

  test("a boost whose time has run out is cleaned up before Foundry writes the expired flag", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");

    const boost = actor.items.get("chi1").effects.find(effect => effect.getFlag("eclipsephase", "chiPushBoost"));
    boost.duration.remaining = 0;
    await endExpiredChiPushes(actor, [boost]);

    expect(actor.items.get("chi1").system.pushed).toBe(false);
  });

  test("a boost still counting down is left alone", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");

    const boost = actor.items.get("chi1").effects.find(effect => effect.getFlag("eclipsephase", "chiPushBoost"));
    boost.duration.remaining = 3;
    await endExpiredChiPushes(actor, [boost]);

    expect(actor.items.get("chi1").system.pushed).toBe(true);
  });

  test("a boost that has not expired is left running", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");

    const boost = actor.items.get("chi1").effects.find(effect => effect.getFlag("eclipsephase", "chiPushBoost"));
    await endExpiredChiPushes(actor, [boost]);

    expect(actor.items.get("chi1").system.pushed).toBe(true);
  });

  test("an unrelated expired effect is not mistaken for a push", async () => {
    const actor = asyncWithChiSleight(25);
    await pushChiSleight(actor, "chi1");

    const other = new ActiveEffect({ name: "Kick", duration: { expired: true } });
    await endExpiredChiPushes(actor, [other]);

    expect(actor.items.get("chi1").system.pushed).toBe(true);
  });
});
