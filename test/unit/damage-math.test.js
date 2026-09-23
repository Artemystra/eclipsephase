import { damageValueCalc } from "../../module/common/general-sheet-functions.js";
import { applySuccessTierBonus, takeDamage } from "../../module/rolls/damage.js";
import { resetWorld } from "../setup/factories.js";

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
