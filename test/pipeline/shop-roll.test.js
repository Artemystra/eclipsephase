import { RollCheck } from "../../module/rolls/dice.js";
import { resetRegistry } from "../../module/api/registry.js";
import { makeActor, resetWorld, seedRolls, seedDialogs } from "../setup/factories.js";

/**
 * Re-runs the shop feature's own registration. resetWorld() clears every hook handler, so the
 * feature has to attach again for each test, exactly as it does on a fresh world load.
 * @returns {void}
 */
function loadShopFeature() {
  jest.isolateModules(() => {
    require("../../module/features/shop/index.js");
  });
}

const SYSTEM_OPTIONS = { askForOptions: false, optionsSettings: false };

/**
 * The dataset the shop sheet hands RollCheck for a Cash-in-Favor purchase.
 * @param {Object} [overrides] - Fields merged into the dataset
 * @returns {Object} The dataset
 */
function shopDataset(overrides = {}) {
  return {
    name: "i-rep",
    key: "rep",
    rollvalue: 50,
    shopUuid: "Actor.shop000000000001",
    buyerActorId: "buyer00000000001",
    itemIds: "item00000000001",
    requiredTier: "moderate",
    bodyBindings: "",
    sellBonus: 0,
    maxBurn: 15,
    ...overrides
  };
}

/**
 * A buyer with enough Moxie to attempt a favor.
 * @returns {Object} The prepared character actor
 */
function makeBuyer() {
  return makeActor({
    type: "character",
    name: "Buyer",
    system: {
      aptitudes: { sav: { value: 20 }, wil: { value: 15 }, cog: { value: 15 }, int: { value: 15 }, ref: { value: 15 }, som: { value: 15 } },
      pools: { moxie: { value: 2 } }
    }
  });
}

/**
 * The dialog answer for a shop roll, which carries the Rep-burn field.
 * @param {Object} [overrides] - Fields merged into the answer
 * @returns {Object} The values the dialog would return
 */
function shopDialogAnswer(overrides = {}) {
  return { rollMode: "public", usePool: "", globalMod: 0, burnMod: 0, favorMod: "0", ...overrides };
}

describe("the shop's own roll modifiers", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); loadShopFeature(); });

  test("a Sell Bonus reaches the roll as a modifier", async () => {
    const actor = makeBuyer();
    seedDialogs(shopDialogAnswer());
    seedRolls([42]);

    await RollCheck(shopDataset({ sellBonus: 20 }), actor.system, actor, SYSTEM_OPTIONS, null, "shopPurchase");

    expect(global.__ep.createdMessages[0].content).toContain("ep2e.shop.purchase.sellBonusModifier");
  });

  test("burned Rep counts double and is clamped to maxBurn", async () => {
    const actor = makeBuyer();
    seedDialogs(shopDialogAnswer({ burnMod: 99 }));
    seedRolls([42]);

    await RollCheck(shopDataset({ maxBurn: 15 }), actor.system, actor, SYSTEM_OPTIONS, null, "shopPurchase");

    const card = global.__ep.createdMessages[0];
    expect(card.content).toContain("ep2e.shop.purchase.burnBonusModifier");
    expect(card.flags.eclipsephase.roll.shop.burnAmount).toEqual(15);
  });

  test("no Sell Bonus and no burn adds neither modifier", async () => {
    const actor = makeBuyer();
    seedDialogs(shopDialogAnswer());
    seedRolls([42]);

    await RollCheck(shopDataset(), actor.system, actor, SYSTEM_OPTIONS, null, "shopPurchase");

    const card = global.__ep.createdMessages[0];
    expect(card.content).not.toContain("ep2e.shop.purchase.sellBonusModifier");
    expect(card.content).not.toContain("ep2e.shop.purchase.burnBonusModifier");
  });

  test("the purchase payload lands in the chat card's flags", async () => {
    const actor = makeBuyer();
    seedDialogs(shopDialogAnswer());
    seedRolls([42]);

    await RollCheck(shopDataset({ bodyBindings: "item1:morph1" }), actor.system, actor, SYSTEM_OPTIONS, null, "shopPurchase");

    expect(global.__ep.createdMessages[0].flags.eclipsephase.roll.shop).toMatchObject({
      shopUuid: "Actor.shop000000000001",
      buyerActorId: "buyer00000000001",
      itemIds: "item00000000001",
      network: "i-rep",
      requiredTier: "moderate",
      bodyBindings: "item1:morph1",
      burnAmount: 0
    });
  });

  test("a roll from another source is left alone by the shop", async () => {
    const actor = makeBuyer();
    seedDialogs(shopDialogAnswer());
    seedRolls([42]);

    await RollCheck(
      { name: "Kinesics", key: "kinesics", type: "skill", rollvalue: 55, pooltype: "Moxie", sellBonus: 20 },
      actor.system, actor, SYSTEM_OPTIONS, null, "skill"
    );

    const card = global.__ep.createdMessages[0];
    expect(card.content).not.toContain("ep2e.shop.purchase.sellBonusModifier");
    expect(card.flags.eclipsephase.roll.shop.shopUuid).toEqual("");
  });
});

describe("the shop's morph pricing hook", () => {
  beforeEach(() => { resetWorld(); resetRegistry(); loadShopFeature(); });

  test("a shop's thresholds override the default tier for its own stock", async () => {
    const shop = makeActor({
      type: "shop",
      system: { morphPointOverrides: { moderateMin: 10, majorMin: 20, rareMin: 30 } },
      items: [{ _id: "shopmorphtier01", name: "Flat", type: "morph", system: { morphPoints: 8 } }]
    });

    const morph = shop.items.get("shopmorphtier01");
    await morph.prepareData();

    expect(morph.system.cost).toEqual("minor");
  });

  test("the same morph outside a shop keeps the default tier", async () => {
    const actor = makeActor({
      type: "character",
      items: [{ _id: "ownmorphtier001", name: "Flat", type: "morph", system: { morphPoints: 8 } }]
    });

    const morph = actor.items.get("ownmorphtier001");
    await morph.prepareData();

    expect(morph.system.cost).toEqual("rare");
  });
});
