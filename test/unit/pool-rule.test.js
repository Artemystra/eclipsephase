import { registerPoolRule, settlePools, owningActor } from "../../module/common/pool-rule.js";
import { registerCoreStrainFamilies, resetStrainFamilies } from "../../module/rolls/strain-families.js";
import { makeActor, resetWorld } from "../setup/factories.js";

const VIGOR_UP = [{ key: "system.pools.vigor.mod", value: "+1", type: "add" }];

/**
 * A character sleeved in a biomorph, with a second morph in reserve, whose Vigor pool starts full.
 * @param {Object} [options] - Extra actor system fields and extra items
 * @returns {Actor} The prepared actor
 */
function character({ system = {}, items = [] } = {}) {
  const actor = makeActor({
    type: "character",
    system: { activeMorph: "morph1", ...system },
    items: [
      { _id: "morph1", name: "Sleeved", type: "morph", system: { type: "bio" } },
      { _id: "morph2", name: "Spare", type: "morph", system: { type: "bio" } },
      ...items
    ]
  });
  const full = actor.system.pools.vigor.totalVigor;
  actor._source.system.pools.vigor.value = full;
  actor.prepareData();
  return actor;
}

/**
 * A temporary effect raising a pool, the shape a dose or a push has.
 * @param {Object[]} changes - The effect's changes
 * @param {Object} extra - Further effect fields
 * @returns {Object} The effect data
 */
function temporary(changes, extra = {}) {
  return { name: "Boost", changes, duration: { value: 8, units: "hours", expiry: null }, ...extra };
}

/**
 * The actor's current Vigor and its total, side by side.
 * @param {Actor} actor - The actor
 * @returns {Object} value and total
 */
function vigor(actor) {
  return { value: actor.system.pools.vigor.value ?? 0, total: actor.system.pools.vigor.totalVigor };
}

beforeEach(() => {
  resetWorld();
  resetStrainFamilies();
  registerCoreStrainFamilies();
  registerPoolRule();
});

describe("a temporary effect that raises a pool", () => {
  test("hands the point over: the current value rises with the total", async () => {
    const actor = character();
    const before = vigor(actor);

    await actor.createEmbeddedDocuments("ActiveEffect", [temporary(VIGOR_UP)]);

    expect(vigor(actor)).toEqual({ value: before.value + 1, total: before.total + 1 });
  });

  test("takes the point back when it ends", async () => {
    const actor = character();
    const before = vigor(actor);
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [temporary(VIGOR_UP)]);

    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);

    expect(vigor(actor)).toEqual(before);
  });

  test("takes it back when the effect is switched off, too", async () => {
    const actor = character();
    const before = vigor(actor);
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [temporary(VIGOR_UP)]);

    await effect.update({ disabled: true });

    expect(vigor(actor)).toEqual(before);
  });

  test("a point already spent is not taken back below zero", async () => {
    const actor = character();
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [temporary(VIGOR_UP)]);
    await actor.update({ "system.pools.vigor.value": 0 });

    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);

    expect(vigor(actor).value).toEqual(0);
  });

  test("the value never climbs past what the pool holds", async () => {
    const actor = character();
    await actor.update({ "system.pools.vigor.value": 999 });

    await actor.createEmbeddedDocuments("ActiveEffect", [temporary(VIGOR_UP)]);

    expect(vigor(actor).value).toEqual(vigor(actor).total);
  });

  test("several effects landing at once settle once, for their combined total", async () => {
    const actor = character();
    const before = vigor(actor);

    await actor.createEmbeddedDocuments("ActiveEffect", [temporary(VIGOR_UP), temporary(VIGOR_UP)]);

    expect(vigor(actor)).toEqual({ value: before.value + 2, total: before.total + 2 });
  });

  test("an effect on one of the actor's items is the actor's effect too, as a chi push is", async () => {
    const actor = character({
      items: [{ _id: "sleight1", name: "Instinct", type: "aspect", system: { psiType: "chi", strainFamily: "psi", active: true } }]
    });
    const before = actor.system.pools.insight.value ?? 0;

    await actor.items.get("sleight1").createEmbeddedDocuments("ActiveEffect", [
      temporary([{ key: "system.pools.insight.mod", value: "+1", type: "add" }], { flags: { eclipsephase: { chiPushBoost: true } } })
    ]);

    expect(actor.system.pools.insight.value).toEqual(before + 1);
  });

  test("a chi boost on an infected async moves the value by what it moved the total, doubling included", async () => {
    const actor = character({ system: { psiStrain: { infection: 33, minimumInfection: 0 } } });
    const before = vigor(actor);

    await actor.createEmbeddedDocuments("ActiveEffect", [temporary([{ key: "system.pools.vigor.chiMod", value: "+1", type: "add" }])]);

    expect(vigor(actor)).toEqual({ value: before.value + 2, total: before.total + 2 });
  });

  test("an effect that touches no pool moves nothing", async () => {
    const actor = character();
    const before = vigor(actor);

    await actor.createEmbeddedDocuments("ActiveEffect", [temporary([{ key: "system.mods.durmod", value: "+5", type: "add" }])]);

    expect(vigor(actor)).toEqual(before);
  });
});

describe("things that can be taken off", () => {
  test("armour worn on the sleeved body counts, and stashing it takes the point back", async () => {
    const actor = character({
      items: [{ _id: "vest1", name: "Vest", type: "armor", system: { boundTo: "morph1" }, effects: [{ name: "Vest", changes: VIGOR_UP }] }]
    });
    const worn = vigor(actor);

    await actor.items.get("vest1").update({ "system.boundTo": "stash" });

    expect(vigor(actor)).toEqual({ value: worn.value - 1, total: worn.total - 1 });
  });

  test("gear toggled at hand hands its point over, and toggled away takes it back", async () => {
    const actor = character({
      items: [{ _id: "rig1", name: "Rig", type: "gear", system: { active: false }, effects: [{ name: "Rig", changes: VIGOR_UP }] }]
    });
    const off = vigor(actor);

    await actor.items.get("rig1").update({ "system.active": true });
    expect(vigor(actor)).toEqual({ value: off.value + 1, total: off.total + 1 });

    await actor.items.get("rig1").update({ "system.active": false });
    expect(vigor(actor)).toEqual(off);
  });

  test("ware newly installed hands its point over the same way", async () => {
    const actor = character();
    const before = vigor(actor);

    await actor.createEmbeddedDocuments("Item", [
      { name: "Neurachem", type: "ware", system: { boundTo: "morph1" }, effects: [{ name: "Neurachem", changes: VIGOR_UP }] }
    ]);

    expect(vigor(actor)).toEqual({ value: before.value + 1, total: before.total + 1 });
  });

  test("resleeving away from the body carrying the ware takes its point with it, and back again", async () => {
    const actor = character({
      items: [{ _id: "ware1", name: "Neurachem", type: "ware", system: { boundTo: "morph1" }, effects: [{ name: "Neurachem", changes: VIGOR_UP }] }]
    });
    const sleeved = vigor(actor);

    await actor.update({ "system.activeMorph": "morph2" });
    expect(vigor(actor)).toEqual({ value: sleeved.value - 1, total: sleeved.total - 1 });

    await actor.update({ "system.activeMorph": "morph1" });
    expect(vigor(actor)).toEqual(sleeved);
  });
});

describe("what the rule leaves to the change itself", () => {
  test("an update that writes the pool's value says what it means, even while the total moves", async () => {
    const actor = character({
      items: [{ _id: "ware1", name: "Neurachem", type: "ware", system: { boundTo: "morph1" }, effects: [{ name: "Neurachem", changes: VIGOR_UP }] }]
    });

    await actor.update({ "system.activeMorph": "morph2", "system.pools.vigor.value": 7 });

    expect(vigor(actor).value).toEqual(7);
  });

  test("spending a point is just spending a point", async () => {
    const actor = character();
    const before = vigor(actor);

    await actor.update({ "system.pools.vigor.value": before.value - 1 });

    expect(vigor(actor)).toEqual({ value: before.value - 1, total: before.total });
  });

  test("a change made by somebody else, which their own client already settled", async () => {
    const actor = character();
    const before = vigor(actor);
    const effect = new ActiveEffect(temporary(VIGOR_UP), { parent: actor });

    Hooks.callAll("preCreateActiveEffect", effect, {}, {}, "somebody-else");
    Hooks.callAll("createActiveEffect", effect, {}, "somebody-else");

    expect(vigor(actor)).toEqual(before);
  });

  test("a change with nothing remembered before it settles nothing", async () => {
    const actor = character();
    const before = vigor(actor);

    await settlePools(actor, {});

    expect(vigor(actor)).toEqual(before);
  });

  test("an effect belonging to no actor at all", async () => {
    expect(owningActor(new ActiveEffect(temporary(VIGOR_UP)))).toBeNull();
    await expect(settlePools(null)).resolves.toBeUndefined();
  });
});
