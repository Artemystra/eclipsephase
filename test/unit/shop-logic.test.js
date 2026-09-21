import { getLoyaltyLevel, hasFreeFavorSlot, consumeFavorSlot, LOYALTY_PER_TIER } from "../../module/features/shop/shop-logic.js";
import { makeActor, resetWorld } from "../setup/factories.js";

/**
 * A shop whose loyalty bar is split into four coloured segments.
 * @param {Object} [segments] - Percentages per colour, in bar order
 * @param {Number} [max] - The bar's maximum value
 * @returns {Object} The prepared shop actor
 */
function makeShop(segments = { red: 25, orange: 25, yellow: 25, green: 25 }, max = 100) {
  return makeActor({ type: "shop", system: { loyaltyBarMax: max, loyaltyBarSegments: segments } });
}

/**
 * A character carrying an active ID with per-network favor slots.
 * @param {Object} [rep] - The rep object stored on the ID item
 * @returns {Object} The prepared character actor
 */
function makeCustomer(rep = {}) {
  return makeActor({
    type: "character",
    system: { activeID: "shopcustomerid1" },
    items: [{ _id: "shopcustomerid1", name: "Legit ID", type: "id", system: { rep } }]
  });
}

describe("loyalty levels", () => {
  beforeEach(() => resetWorld());

  test("an empty bar is level 1 and a full bar is the top level", () => {
    const shop = makeShop();
    expect(getLoyaltyLevel(shop, 0)).toEqual(1);
    expect(getLoyaltyLevel(shop, 100)).toEqual(4);
  });

  test("each segment boundary raises the level by one", () => {
    const shop = makeShop();
    expect(getLoyaltyLevel(shop, 24)).toEqual(1);
    expect(getLoyaltyLevel(shop, 25)).toEqual(2);
    expect(getLoyaltyLevel(shop, 50)).toEqual(3);
    expect(getLoyaltyLevel(shop, 75)).toEqual(4);
  });

  test("uneven segments move the boundaries with them", () => {
    const shop = makeShop({ red: 10, orange: 10, yellow: 10, green: 70 });
    expect(getLoyaltyLevel(shop, 9)).toEqual(1);
    expect(getLoyaltyLevel(shop, 10)).toEqual(2);
    expect(getLoyaltyLevel(shop, 20)).toEqual(3);
    expect(getLoyaltyLevel(shop, 30)).toEqual(4);
  });

  test("a bar maximum other than 100 scales the boundaries", () => {
    const shop = makeShop({ red: 25, orange: 25, yellow: 25, green: 25 }, 200);
    expect(getLoyaltyLevel(shop, 49)).toEqual(1);
    expect(getLoyaltyLevel(shop, 50)).toEqual(2);
    expect(getLoyaltyLevel(shop, 150)).toEqual(4);
  });

  test("every cost tier that grants loyalty has a value, and free is absent", () => {
    expect(LOYALTY_PER_TIER).toEqual({ minor: 10, moderate: 25, major: 40, rare: 80 });
    expect(LOYALTY_PER_TIER.free).toBeUndefined();
  });
});

describe("favor slots", () => {
  beforeEach(() => resetWorld());

  test("trivial favors have no limit, so a slot is always free", () => {
    const character = makeCustomer();
    expect(hasFreeFavorSlot(character, "i-rep", "trivial")).toBe(true);
  });

  test("a minor favor has three slots and reports free until all are used", () => {
    const character = makeCustomer({ "i-rep": { small1: true, small2: true } });
    expect(hasFreeFavorSlot(character, "i-rep", "minor")).toBe(true);

    const exhausted = makeCustomer({ "i-rep": { small1: true, small2: true, small3: true } });
    expect(hasFreeFavorSlot(exhausted, "i-rep", "minor")).toBe(false);
  });

  test("a major favor has a single slot", () => {
    const free = makeCustomer({ "i-rep": {} });
    expect(hasFreeFavorSlot(free, "i-rep", "major")).toBe(true);

    const used = makeCustomer({ "i-rep": { large: true } });
    expect(hasFreeFavorSlot(used, "i-rep", "major")).toBe(false);
  });

  test("slots are tracked per network, so one network's use leaves another free", () => {
    const character = makeCustomer({ "i-rep": { large: true }, "g-rep": {} });
    expect(hasFreeFavorSlot(character, "i-rep", "major")).toBe(false);
    expect(hasFreeFavorSlot(character, "g-rep", "major")).toBe(true);
  });

  test("a character carrying no active ID has no slot to spend", () => {
    const character = makeActor({ type: "character", system: { activeID: "" } });
    expect(hasFreeFavorSlot(character, "i-rep", "major")).toBe(false);
  });

  test("consuming a slot fills the first free one and then refuses", async () => {
    const character = makeCustomer({ "i-rep": {} });

    expect(await consumeFavorSlot(character, "i-rep", "major")).toBe(true);
    const idItem = character.items.get("shopcustomerid1");
    expect(idItem.system.rep["i-rep"].large).toBe(true);

    expect(await consumeFavorSlot(character, "i-rep", "major")).toBe(false);
  });

  test("consuming a trivial favor never touches the ID", async () => {
    const character = makeCustomer({ "i-rep": {} });
    expect(await consumeFavorSlot(character, "i-rep", "trivial")).toBe(true);
    const rep = character.items.get("shopcustomerid1").system.rep["i-rep"];
    expect([rep.small1, rep.small2, rep.small3, rep.med1, rep.large]).toEqual([false, false, false, false, false]);
  });
});
