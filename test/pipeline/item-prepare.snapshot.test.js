import { makeActor, makeItem, resetWorld, setSetting } from "../setup/factories.js";

describe("EPitem.prepareData", () => {
  beforeEach(() => resetWorld());

  test("derives stable data for a morph", async () => {
    const item = makeItem({ type: "morph", name: "Splicer", system: { type: "bio", dur: 30, morphPoints: 2 } });
    await item.prepareData();
    expect(item.system).toMatchSnapshot();
  });

  test("derives stable data for armor", async () => {
    const item = makeItem({ type: "armor", name: "Vest", system: { energy: 6, kinetic: 8, cost: "minor" } });
    await item.prepareData();
    expect(item.system).toMatchSnapshot();
  });

  describe("morph cost tier from Morph Points", () => {
    const cases = [[0, "minor"], [1, "minor"], [2, "moderate"], [4, "moderate"], [5, "major"], [7, "major"], [8, "rare"], [20, "rare"]];
    for (const [points, tier] of cases) {
      test(`${points} points is ${tier}`, async () => {
        const item = makeItem({ type: "morph", system: { morphPoints: points } });
        await item.prepareData();
        expect(item.system.cost).toEqual(tier);
      });
    }
  });

  test("the default thresholds decide the tier when nothing overrides them", async () => {
    const actor = makeActor({
      type: "character",
      items: [{ _id: "coremorphtier01", name: "Flat", type: "morph", system: { morphPoints: 8 } }]
    });
    const morph = actor.items.get("coremorphtier01");
    await morph.prepareData();
    expect(morph.system.cost).toEqual("rare");
  });

  test("armor is active only while bound to the sleeved body", async () => {
    const actor = makeActor({
      type: "character",
      system: { activeMorph: "morphactive0001" },
      items: [
        { _id: "morphactive0001", name: "Worn", type: "morph", system: { type: "bio", dur: 30 } },
        { _id: "morphstored0001", name: "Spare", type: "morph", system: { type: "bio", dur: 30 } },
        { _id: "armorworn000001", name: "Worn Armor", type: "armor", system: { boundTo: "morphactive0001" } },
        { _id: "armorspare00001", name: "Spare Armor", type: "armor", system: { boundTo: "morphstored0001" } }
      ]
    });
    await actor.items.get("armorworn000001").prepareData();
    await actor.items.get("armorspare00001").prepareData();
    expect(actor.items.get("armorworn000001").system.active).toBe(true);
    expect(actor.items.get("armorspare00001").system.active).toBe(false);
  });

  test("the homebrew flag follows the superBrew setting", async () => {
    setSetting("eclipsephase", "superBrew", false);
    const plain = makeItem({ type: "gear" });
    await plain.prepareData();
    expect(plain.system.homebrew).toBe(false);

    setSetting("eclipsephase", "superBrew", true);
    const brewed = makeItem({ type: "gear" });
    await brewed.prepareData();
    expect(brewed.system.homebrew).toBe(true);
  });
});
