import { damageValueCalc } from "../../module/common/general-sheet-functions.js";
import { applySuccessTierBonus, takeDamage, applyDamage } from "../../module/rolls/damage.js";
import { damageFormula, dropDice } from "../../module/rolls/damage-formula.js";
import { resetWorld, makeActor } from "../setup/factories.js";

const { createdMessages } = global.__ep;

describe("damageValueCalc", () => {
  beforeEach(() => resetWorld());

  test("ammo damage value with both dice and a bonus", async () => {
    const result = await damageValueCalc({ type: "ammo" }, { d10: 2, d6: 1, bonus: 3 }, null, "ammo");
    expect(result.dv).toEqual("2d10+1d6+3");
  });

  test("ammo damage value with only d10", async () => {
    const result = await damageValueCalc({ type: "ammo" }, { d10: 2, d6: 0, bonus: 0 }, null, "ammo");
    expect(result.dv).toEqual("2d10");
  });

  test("ammo damage value with only d6", async () => {
    const result = await damageValueCalc({ type: "ammo" }, { d10: 0, d6: 3, bonus: 0 }, null, "ammo");
    expect(result.dv).toEqual("3d6");
  });

  test("a drug's own dice never count toward ammo damage", async () => {
    const result = await damageValueCalc({ type: "drug" }, { d10: 5, d6: 5, bonus: 5 }, null, "ammo");
    expect(result.dv).toEqual("ep2e.item.weapon.table.noDamageValueModifier");
  });

  test("a weapon flagged noDamage skips the calculation entirely", async () => {
    const result = await damageValueCalc({ type: "ccWeapon" }, { d10: 5, d6: 5, bonus: 5 }, { noDamage: true }, "weapon");
    expect(result.dv).toEqual("ep2e.item.weapon.table.noDamageAmmo");
  });

  test("a melee weapon's damage value ignores ammo modifiers entirely", async () => {
    const result = await damageValueCalc({ type: "ccWeapon" }, { d10: 1, d6: 2, bonus: 1 }, {}, "weapon");
    expect(result.dv).toEqual("1d10+2d6+1");
  });

  test("a ranged weapon's damage value adds the loaded ammo's own modifier", async () => {
    const object = {
      type: "rangedWeapon",
      system: {
        ammoSelected: {
          traits: { bioMorphsOnly: { value: false }, dvOnMiss: { value: false } },
          dvModifier: { d10: 1, d6: 0, bonus: 1 }
        }
      }
    };
    const result = await damageValueCalc(object, { d10: 1, d6: 0, bonus: 0 }, {}, "weapon");
    expect(result.dv).toEqual("2d10+1");
  });

  test("ammo flagged bioMorphsOnly or dvOnMiss does not contribute its modifier", async () => {
    const object = {
      type: "rangedWeapon",
      system: {
        ammoSelected: {
          traits: { bioMorphsOnly: { value: true }, dvOnMiss: { value: false } },
          dvModifier: { d10: 9, d6: 9, bonus: 9 }
        }
      }
    };
    const result = await damageValueCalc(object, { d10: 1, d6: 0, bonus: 0 }, {}, "weapon");
    expect(result.dv).toEqual("1d10");
  });

  test("no dice and no bonus at all falls back to noDamage", async () => {
    const result = await damageValueCalc({ type: "ccWeapon" }, { d10: 0, d6: 0, bonus: 0 }, {}, "weapon");
    expect(result.dv).toEqual("ep2e.item.weapon.table.noDamage");
  });
});

describe("applySuccessTierBonus", () => {
  test("an ordinary success or a failure adds no bonus", () => {
    for (const rollResult of [0, 1, 2, 3, 6, 8]) {
      expect(applySuccessTierBonus(rollResult)).toEqual({ successModifier: "", criticalModifier: "" });
    }
  });

  test("a success with one spare degree adds a d6", () => {
    expect(applySuccessTierBonus(4)).toEqual({ successModifier: "+1d6", criticalModifier: "" });
  });

  test("a success with two spare degrees adds 2d6", () => {
    expect(applySuccessTierBonus(5)).toEqual({ successModifier: "+2d6", criticalModifier: "" });
  });

  test.each([7, 9])("a critical or supreme success (tier %i) doubles the whole roll", rollResult => {
    expect(applySuccessTierBonus(rollResult)).toEqual({ successModifier: ")", criticalModifier: "2*(" });
  });
});

/**
 * A minimal stand-in for the actor takeDamage() receives - it only ever reads .type and calls
 * .update(), so a full EPactor/MockActor (with its own derived-data pipeline) is unnecessary here.
 * @param {String} [type] - The actor type
 * @returns {Object} The stub actor, with every update() call recorded on .updates
 */
function stubActor(type = "character") {
  const updates = [];
  return {
    type,
    updates,
    update: async changes => {
      updates.push(changes);
      return changes;
    }
  };
}

describe("takeDamage", () => {
  beforeEach(() => resetWorld());

  test("physical damage below the ceiling updates the health value, wound modifier and bar snapshots", async () => {
    const actor = stubActor("character");

    await takeDamage({ value: 15 }, 0, 1, 0, 0, 10, "system.health.physical.value", "system.physical.wounds", actor, "physical", 30);

    expect(actor.updates).toHaveLength(1);
    expect(actor.updates[0]).toEqual({
      "system.health.physical.value": 15,
      "system.physical.wounds": 1,
      "system.physical.oldHealthBarValue": 1,
      "system.physical.oldDeathBarValue": 0,
      "system.health.barModifier": "physicalUp"
    });
  });

  test("mental damage writes to the mental bar snapshots and trauma modifier instead", async () => {
    const actor = stubActor("character");

    await takeDamage({ value: 8 }, 2, 1, 0, 1, 5, "system.health.mental.value", "system.mental.trauma", actor, "mental", 20);

    expect(actor.updates[0]).toEqual({
      "system.health.mental.value": 10,
      "system.mental.trauma": 2,
      "system.mental.oldStressBarValue": 1,
      "system.mental.oldInsanityBarValue": 0,
      "system.health.barModifier": "mentalUp"
    });
  });

  test("damage is clamped to the ceiling instead of overflowing it", async () => {
    const actor = stubActor("character");

    await takeDamage({ value: 999 }, 5, 1, 0, 0, 10, "system.health.physical.value", "system.physical.wounds", actor, "physical", 30);

    expect(actor.updates[0]["system.health.physical.value"]).toEqual(30);
  });

  test("a bar value of 0 is floored to 1 in the snapshot, never left at 0", async () => {
    const actor = stubActor("character");

    await takeDamage({ value: 5 }, 0, 0, 0, 0, 10, "system.health.physical.value", "system.physical.wounds", actor, "physical", 30);

    expect(actor.updates[0]["system.physical.oldHealthBarValue"]).toEqual(1);
  });

  test("zero incoming damage makes no update at all", async () => {
    const actor = stubActor("character");

    const result = await takeDamage({ value: 0 }, 5, 1, 0, 0, 10, "system.health.physical.value", "system.physical.wounds", actor, "physical", 30);

    expect(actor.updates).toHaveLength(0);
    expect(result).toBeUndefined();
  });

  test("a character posts a chat announcement with the damage and modifier gained", async () => {
    const actor = stubActor("character");

    await takeDamage({ value: 23 }, 0, 1, 0, 0, 10, "system.health.physical.value", "system.physical.wounds", actor, "physical", 30);

    expect(createdMessages).toHaveLength(1);
    expect(createdMessages[0].flavor).toEqual(expect.stringContaining(String(23)));
  });

  test("an NPC or goon takes the same damage without a chat announcement", async () => {
    const actor = stubActor("npc");

    await takeDamage({ value: 23 }, 0, 1, 0, 0, 10, "system.health.physical.value", "system.physical.wounds", actor, "physical", 30);

    expect(createdMessages).toHaveLength(0);
    expect(actor.updates).toHaveLength(1);
  });
});

describe("damageFormula", () => {
  test("parts join in order: the base, its extras, then the success tier's dice", () => {
    expect(damageFormula({ base: "1d10+2", extras: ["+1d10", "", " + 1d6"] }, 4)).toBe("1d10+2+1d10 + 1d6+1d6");
  });

  test("a critical doubles everything, a multiplier wraps that, a halving wraps it all", () => {
    expect(damageFormula({ base: "2d10" }, 7)).toBe("2*(2d10)");
    expect(damageFormula({ base: "2d10", multiplier: 2 }, 7)).toBe("2*(2*(2d10))");
    expect(damageFormula({ base: "2d10", multiplier: 2, halved: true }, 3)).toBe("ceil((2*(2d10))/2)");
  });

  test("damage that follows no attack takes only its own parts", () => {
    expect(damageFormula({ base: "1d10+2", halved: true })).toBe("ceil((1d10+2)/2)");
  });
});

describe("applyDamage", () => {
  beforeEach(() => resetWorld());

  /**
   * A character of WIL 15 in a biomorph of Durability 30.
   * @returns {Object} The prepared actor
   */
  function body() {
    return makeActor({ type: "character", system: { activeMorph: "morph1", aptitudes: { wil: { value: 15 } } }, items: [{ _id: "morph1", name: "Morph", type: "morph", system: { type: "bio", dur: 30 } }] });
  }

  test("damage lands on the sheet with its wounds, and says what was taken", async () => {
    const actor = body();
    const threshold = actor.system.physical.wt;

    const result = await applyDamage(actor, 14);

    expect(result).toEqual({ taken: 14, wounds: Math.floor(14 / threshold) });
    expect(actor.system.health.physical.value).toBe(14);
    expect(actor.system.physical.wounds).toBe(Math.floor(14 / threshold));
  });

  test("it posts no card of its own unless asked to", async () => {
    await applyDamage(body(), 8);
    const quiet = createdMessages.length;
    await applyDamage(body(), 8, { announce: true });

    expect(quiet).toBe(0);
    expect(createdMessages).toHaveLength(1);
  });

  test("damage beyond what the body can still take is held to it", async () => {
    const actor = body();
    const ceiling = actor.system.physical.dr;

    const result = await applyDamage(actor, ceiling + 50);

    expect(result.taken).toBe(ceiling);
    expect(actor.system.health.physical.value).toBe(ceiling);
  });

  test("stress goes on the mind with its traumas", async () => {
    const actor = body();

    const result = await applyDamage(actor, 5, { target: "mental" });

    expect(actor.system.health.mental.value).toBe(5);
    expect(result.taken).toBe(5);
  });

  test("the bars move from where they stood, not from empty", async () => {
    const actor = body();
    await applyDamage(actor, 10);
    const before = actor.system.physical.relativePhysicalDamage;

    await applyDamage(actor, 5);

    expect(before).toBeGreaterThan(1);
    expect(actor.system.physical.oldHealthBarValue).toBe(before);
    expect(actor.system.health.barModifier).toBe("physicalUp");
  });

  test("several amounts are each measured against the threshold, but written at once", async () => {
    const actor = body();
    const threshold = actor.system.physical.wt;
    const update = jest.spyOn(actor, "update");

    const result = await applyDamage(actor, [threshold, threshold - 1, threshold]);

    expect(result).toEqual({ taken: 3 * threshold - 1, wounds: 2 });
    expect(actor.system.physical.wounds).toBe(2);
    expect(actor.system.health.physical.value).toBe(3 * threshold - 1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});


describe("a die less", () => {
  test("-1d10 DV takes a die away (Core p.207) rather than rolling one to subtract, and never below none", () => {
    expect(["2d10+6", "2d10 + 6", "3d10+12", "1d10+1d6+2", "1d10", "1d6+2"].map(formula => dropDice(formula, 10, 1))).toEqual(["1d10+6", "1d10 + 6", "2d10+12", "1d6+2", "0", "1d6+2"]);
    expect(dropDice("1d10+1d10+6", 10, 2)).toBe("6");
  });

  test("a damage formula reads an extra like -1d10 as a die less, after the extras that add dice, and before a critical doubles it", () => {
    expect(damageFormula({ base: "2d10+6", extras: ["-1d10"] }, 3)).toBe("1d10+6");
    expect(damageFormula({ base: "2d10+6", extras: ["+1d10", "-1d10"] }, 3)).toBe("1d10+6+1d10");
    expect(damageFormula({ base: "2d10+6", extras: ["-1d10"] }, 7)).toBe("2*(1d10+6)");
  });
});
