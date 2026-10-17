import { makeActor, makeActorFromFixture, resetWorld, seedDialogs } from "../setup/factories.js";
import { mergeOrCreateItem, emptiesStack, stackDeletion, selectDrugVector, chooseDrugForm, consumeDose, STACKABLE_TYPES } from "../../module/common/general-sheet-functions.js";
import { DOSES_PER_PACK, VECTORS, dosesRemaining } from "../../module/common/drugs.js";

/**
 * A drug item as the compendium authors one: one pack, a full set of doses, at hand.
 * @param {Object} overrides - Item fields to override
 * @returns {Object} The item source data
 */
function pack(overrides = {}) {
  const { system, ...rest } = overrides;
  return {
    name: "Grin",
    type: "drug",
    system: { active: true, quantity: 1, usagesUsed: 0, usagesMax: DOSES_PER_PACK, ...system },
    ...rest
  };
}

beforeEach(() => resetWorld());

describe("what stacks", () => {
  test("the three types carried as a stack are the ones that hold a quantity and a consumable slot", () => {
    expect(STACKABLE_TYPES).toEqual(["drug", "ammo", "grenade"]);
  });

  test("gear is not among them, since each piece is bound and equipped on its own", () => {
    expect(STACKABLE_TYPES).not.toContain("gear");
  });
});

describe("mergeOrCreateItem", () => {
  test("a second pack of the same drug grows the stack instead of adding a row", async () => {
    const actor = makeActor({ items: [pack({ _id: "grin1" })] });

    const result = await mergeOrCreateItem(actor, pack());

    expect(actor.items.filter(i => i.type === "drug")).toHaveLength(1);
    expect(result.id).toEqual("grin1");
    expect(actor.items.get("grin1").system.quantity).toEqual(2);
  });

  test("dragging the same drug in five times leaves one row of five packs", async () => {
    const actor = makeActor({ items: [pack({ _id: "grin1" })] });

    for (let i = 0; i < 4; i++) await mergeOrCreateItem(actor, pack());

    expect(actor.items.filter(i => i.type === "drug")).toHaveLength(1);
    expect(actor.items.get("grin1").system.quantity).toEqual(5);
  });

  test("a stack carrying more than one pack is added in full, not as a single pack", async () => {
    const actor = makeActor({ items: [pack({ _id: "grin1" })] });

    await mergeOrCreateItem(actor, pack({ system: { quantity: 3 } }));

    expect(actor.items.get("grin1").system.quantity).toEqual(4);
  });

  test("a different drug lands as its own item", async () => {
    const actor = makeActor({ items: [pack({ _id: "grin1" })] });

    await mergeOrCreateItem(actor, pack({ name: "Kick" }));

    expect(actor.items.filter(i => i.type === "drug").map(i => i.name).sort()).toEqual(["Grin", "Kick"]);
  });

  test("an actor carrying none of it gets the item created", async () => {
    const actor = makeActor({ items: [] });

    const created = await mergeOrCreateItem(actor, pack());

    expect(created.name).toEqual("Grin");
    expect(actor.items.filter(i => i.type === "drug")).toHaveLength(1);
  });

  test("an item of the same name but another type does not merge into it", async () => {
    const actor = makeActor({ items: [pack({ _id: "grin1" })] });

    await mergeOrCreateItem(actor, { name: "Grin", type: "gear", system: { active: true, quantity: 1 } });

    expect(actor.items.get("grin1").system.quantity).toEqual(1);
    expect(actor.items.filter(i => i.name === "Grin")).toHaveLength(2);
  });
});

describe("how much room a consumable takes at hand", () => {
  test("how many doses a pack holds never adds to what is carried", () => {
    const small = makeActor({
      settings: { superBrew: true },
      items: [pack({ system: { quantity: 1, usagesMax: 1 } })]
    });
    const large = makeActor({
      settings: { superBrew: true },
      items: [pack({ system: { quantity: 1, usagesMax: 20 } })]
    });

    expect(large.system.currentStatus.consumableModifier)
      .toEqual(small.system.currentStatus.consumableModifier);
  });

  test("three packs at hand are still within what a character can carry freely", () => {
    const actor = makeActor({
      settings: { superBrew: true },
      items: [pack({ system: { quantity: 3 } })]
    });

    expect(actor.system.currentStatus.consumableModifier).toEqual(0);
  });

  test("a fourth pack starts costing, since each pack is its own object at hand", () => {
    const actor = makeActor({
      settings: { superBrew: true },
      items: [pack({ system: { quantity: 4 } })]
    });

    expect(actor.system.currentStatus.consumableModifier).toEqual(10);
  });

  test("fourteen packs cost accordingly", () => {
    const actor = makeActor({
      settings: { superBrew: true },
      items: [pack({ system: { quantity: 14 } })]
    });

    expect(actor.system.currentStatus.consumableModifier).toEqual(40);
  });

  test("a realistic load counts packs and rounds alike", () => {
    const actor = makeActorFromFixture("character-drugs");

    expect(actor.system.currentStatus.consumableModifier).toEqual(50);
  });

  test("a drug that is not at hand is not carried at all", () => {
    const actor = makeActor({
      settings: { superBrew: true },
      items: [pack({ system: { active: false, quantity: 6 } })]
    });

    expect(actor.system.currentStatus.consumableModifier).toEqual(0);
  });
});

describe("a drug arriving with data from before the schema change", () => {
  test("created on an actor, its written duration is stored as a span", async () => {
    const actor = makeActor({ items: [] });

    const [created] = await actor.createEmbeddedDocuments("Item", [
      { name: "Grin", type: "drug", system: { active: true, duration: "3 hours" } }
    ]);

    expect(created.system.duration).toEqual({ value: 3, units: "hours" });
    expect(created._source.system.duration).toEqual({ value: 3, units: "hours" });
  });

  test("created without a dose counter, it arrives untouched", async () => {
    const actor = makeActor({ items: [] });

    const [created] = await actor.createEmbeddedDocuments("Item", [
      { name: "Grin", type: "drug", system: { active: true, duration: "3 hours", usagesUsed: null, usagesMax: null } }
    ]);

    expect(created.system.usagesUsed).toEqual(0);
    expect(created.system.usagesMax).toEqual(DOSES_PER_PACK);
  });

  test("a drug that was never migrated still reads as a span once prepared", () => {
    const actor = makeActor({
      items: [{ _id: "legacy1", name: "Comfurt", type: "drug", system: { active: true, duration: "8 hours" } }]
    });

    expect(actor.items.get("legacy1").system.duration).toEqual({ value: 8, units: "hours" });
  });

  test("a drug with no duration at all reads as open-ended rather than as text", () => {
    const actor = makeActor({
      items: [{ _id: "legacy2", name: "Retcon", type: "drug", system: { active: true, duration: "Permanent" } }]
    });

    expect(actor.items.get("legacy2").system.duration).toEqual({ value: null, units: "" });
  });
});

describe("emptying a stack by hand", () => {
  test.each(["drug", "ammo", "grenade"])("setting a %s's quantity to nothing takes it off the sheet", type => {
    expect(emptiesStack({ type }, "system.quantity", "0")).toBe(true);
  });

  test("a negative quantity counts as empty too", () => {
    expect(emptiesStack({ type: "drug" }, "system.quantity", "-2")).toBe(true);
  });

  test("a stack that still holds something stays", () => {
    expect(emptiesStack({ type: "drug" }, "system.quantity", "1")).toBe(false);
  });

  test("gear is left alone, since it is not carried as a stack", () => {
    expect(emptiesStack({ type: "gear" }, "system.quantity", "0")).toBe(false);
  });

  test("editing any other field never removes anything", () => {
    expect(emptiesStack({ type: "drug" }, "system.usagesUsed", "0")).toBe(false);
    expect(emptiesStack({ type: "drug" }, "system.usagesMax", "0")).toBe(false);
  });

  test("clearing the field empties the stack, the same as typing a nought", () => {
    expect(emptiesStack({ type: "drug" }, "system.quantity", "")).toBe(true);
  });

  test("an unreadable quantity is not treated as empty", () => {
    expect(emptiesStack({ type: "drug" }, "system.quantity", "lots")).toBe(false);
    expect(emptiesStack({ type: "drug" }, "system.quantity", null)).toBe(false);
  });

  test("it never throws on junk", () => {
    expect(() => emptiesStack(null, "system.quantity", "0")).not.toThrow();
  });
});

describe("deleting from a stack", () => {
  test("the count the user picks is what comes off", async () => {
    seedDialogs(2);
    expect(await stackDeletion("Grin", 5)).toEqual({ confirm: true, count: 2 });
  });

  test("a count above the stack is capped at the stack", async () => {
    seedDialogs(99);
    expect(await stackDeletion("Grin", 5)).toEqual({ confirm: true, count: 5 });
  });

  test("a count below one is raised to one, so the dialog always removes something", async () => {
    seedDialogs(0);
    expect(await stackDeletion("Grin", 5)).toEqual({ confirm: true, count: 1 });
  });

  test("cancelling removes nothing", async () => {
    seedDialogs(false);
    expect(await stackDeletion("Grin", 5)).toEqual({ confirm: false, count: 0 });
  });

  test("closing the dialog removes nothing either", async () => {
    expect(await stackDeletion("Grin", 5)).toEqual({ confirm: false, count: 0 });
  });
});

describe("stacking a drug by the form it was bought in", () => {
  /**
   * A drug pack narrowed to a single application form, the way one lands after acquisition.
   * @param {String} vector - The form key
   * @param {Object} overrides - Item fields to override
   * @returns {Object} The item source data
   */
  function bought(vector, overrides = {}) {
    const forms = Object.fromEntries(["dermal", "inhalation", "injection", "oral"].map(k => [k, k === vector]));
    const { system, ...rest } = overrides;
    return pack({ system: { ...forms, ...system }, ...rest });
  }

  test("a second pack of the same form joins the stack", async () => {
    const actor = makeActor({ items: [bought("injection", { _id: "grin1" })] });

    await mergeOrCreateItem(actor, bought("injection"));

    expect(actor.items.filter(i => i.type === "drug")).toHaveLength(1);
    expect(actor.items.get("grin1").system.quantity).toEqual(2);
  });

  test("the same drug bought in another form sits beside it instead of merging", async () => {
    const actor = makeActor({ items: [bought("injection", { _id: "grin1" })] });

    await mergeOrCreateItem(actor, bought("oral"));

    expect(actor.items.filter(i => i.type === "drug")).toHaveLength(2);
    expect(actor.items.get("grin1").system.quantity).toEqual(1);
  });

  test("all four forms of one drug can be carried side by side", async () => {
    const actor = makeActor({ items: [] });

    for (const vector of ["dermal", "inhalation", "injection", "oral"]) {
      await mergeOrCreateItem(actor, bought(vector));
    }

    expect(actor.items.filter(i => i.type === "drug")).toHaveLength(4);
  });

  test("a pack still offering every form does not absorb one narrowed to a single form", async () => {
    const actor = makeActor({
      items: [pack({ _id: "grin1", system: { dermal: true, inhalation: true, injection: true, oral: true } })]
    });

    await mergeOrCreateItem(actor, bought("injection"));

    expect(actor.items.filter(i => i.type === "drug")).toHaveLength(2);
  });

  test("ammunition still stacks on name alone, since it has no form to match", async () => {
    const actor = makeActor({
      items: [{ _id: "ammo1", name: "Regular", type: "ammo", system: { active: true, quantity: 10 } }]
    });

    await mergeOrCreateItem(actor, { name: "Regular", type: "ammo", system: { active: true, quantity: 5 } });

    expect(actor.items.filter(i => i.type === "ammo")).toHaveLength(1);
    expect(actor.items.get("ammo1").system.quantity).toEqual(15);
  });
});

describe("settling the form on the incoming data", () => {
  const grin = () => ({ name: "Grin", type: "drug", system: { injection: true, oral: true, isAmmo: false } });

  test("the chosen form is the only one left, and the ammunition answer is kept", async () => {
    const data = grin();
    seedDialogs({ selection: "injection", extraOption: true });

    expect(await chooseDrugForm(data)).toBe(true);
    expect(data.system).toMatchObject({ injection: true, oral: false, isAmmo: true });
  });

  test("cancelling leaves the data alone and says so", async () => {
    const data = grin();
    seedDialogs({ cancelled: true });

    expect(await chooseDrugForm(data)).toBe(false);
    expect(data.system).toMatchObject({ injection: true, oral: true });
  });

  test("a pill with one form, and anything that is not a drug, pass through unasked", async () => {
    const pill = { name: "Grin", type: "drug", system: { oral: true } };
    const gear = { name: "Rope", type: "gear", system: {} };

    expect(await chooseDrugForm(pill)).toBe(true);
    expect(await chooseDrugForm(gear)).toBe(true);
    expect(pill.system.oral).toBe(true);
  });
});

describe("choosing the form on acquisition", () => {
  test("the form the user picks is what comes back", async () => {
    seedDialogs({ selection: "oral" });
    expect(await selectDrugVector("Grin", VECTORS)).toEqual({ vector: "oral", isAmmo: false });
  });

  test("cancelling reports that, so the drop can be abandoned", async () => {
    seedDialogs({ cancelled: true });
    expect(await selectDrugVector("Grin", VECTORS)).toEqual({ cancelled: true });
  });

  test("closing the dialog counts as cancelling", async () => {
    expect(await selectDrugVector("Grin", VECTORS)).toEqual({ cancelled: true });
  });

  test("ticking the ammunition box on a form that can be loaded makes the pack ammunition", async () => {
    seedDialogs({ selection: "inhalation", extraOption: true });
    expect(await selectDrugVector("Grin", VECTORS)).toEqual({ vector: "inhalation", isAmmo: true });
  });

  test("a pill is never ammunition, whatever the box says", async () => {
    seedDialogs({ selection: "oral", extraOption: true });
    expect(await selectDrugVector("Grin", VECTORS)).toEqual({ vector: "oral", isAmmo: false });
  });

  test("the ammunition box is only offered when some form could be loaded", async () => {
    const offeredBox = [];
    const realRender = foundry.applications.handlebars.renderTemplate;
    foundry.applications.handlebars.renderTemplate = async (template, data) => {
      offeredBox.push(!!data?.checkbox);
      return realRender(template, data);
    };
    try {
      seedDialogs({ selection: "oral" });
      await selectDrugVector("Grin", VECTORS.filter(v => v.key === "oral"));
      seedDialogs({ selection: "dermal" });
      await selectDrugVector("Grin", VECTORS);
    } finally {
      foundry.applications.handlebars.renderTemplate = realRender;
    }
    expect(offeredBox).toEqual([false, true]);
  });

  test("it offers one choice per form the drug is sold in, each with its onset", async () => {
    const offered = VECTORS.filter(v => ["injection", "oral"].includes(v.key));
    seedDialogs({ selection: "injection" });

    expect(await selectDrugVector("Grin", offered)).toEqual({ vector: "injection", isAmmo: false });
    expect(offered.map(v => v.onset)).toEqual([
      "ep2e.item.drug.onset.turn",
      "ep2e.item.drug.onset.minutes15"
    ]);
  });
});

describe("taking a dose off a carried drug", () => {
  test("one dose comes out of the open pack", async () => {
    const actor = makeActor({ items: [pack({ _id: "grin1" })] });

    const outcome = await consumeDose(actor, actor.items.get("grin1"));

    expect(outcome).toMatchObject({ taken: true, emptied: false });
    expect(actor.items.get("grin1").system.usagesUsed).toEqual(1);
    expect(actor.items.get("grin1").system.quantity).toEqual(1);
  });

  test("emptying the open pack opens the next one", async () => {
    const actor = makeActor({ items: [pack({ _id: "grin1", system: { quantity: 2, usagesUsed: 4 } })] });

    await consumeDose(actor, actor.items.get("grin1"));

    expect(actor.items.get("grin1").system.quantity).toEqual(1);
    expect(actor.items.get("grin1").system.usagesUsed).toEqual(0);
  });

  test("the last dose takes the drug off the sheet", async () => {
    const actor = makeActor({ items: [pack({ _id: "grin1", system: { quantity: 1, usagesUsed: 4 } })] });

    const outcome = await consumeDose(actor, actor.items.get("grin1"));

    expect(outcome).toMatchObject({ taken: true, emptied: true });
    expect(actor.items.get("grin1")).toBeUndefined();
  });

  test("a single pack is spent dose by dose and then goes", async () => {
    const actor = makeActor({ items: [pack({ _id: "grin1" })] });
    const seen = [];

    for (let i = 0; i < DOSES_PER_PACK; i++) {
      await consumeDose(actor, actor.items.get("grin1"));
      const still = actor.items.get("grin1");
      seen.push(still ? dosesRemaining(still.system) : "gone");
    }

    expect(seen).toEqual([4, 3, 2, 1, "gone"]);
  });

  test("a drug with nothing left is reported untouched rather than removed", async () => {
    const actor = makeActor({
      items: [pack({ _id: "grin1", system: { quantity: 1, usagesUsed: DOSES_PER_PACK } })]
    });

    const outcome = await consumeDose(actor, actor.items.get("grin1"));

    expect(outcome).toEqual({ taken: false, emptied: false });
    expect(actor.items.get("grin1")).toBeDefined();
  });

  test("taking a dose leaves the drug's own form alone", async () => {
    const actor = makeActor({
      items: [pack({ _id: "grin1", system: { injection: true, oral: false } })]
    });

    await consumeDose(actor, actor.items.get("grin1"));

    expect(actor.items.get("grin1").system.injection).toBe(true);
    expect(actor.items.get("grin1").system.oral).toBe(false);
  });
});
