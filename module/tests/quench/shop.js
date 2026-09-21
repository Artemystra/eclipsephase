import { completeShopPurchase, getLoyaltyLevel, hasFreeFavorSlot, consumeFavorSlot } from "../../features/shop/shop-logic.js";
import { withTempActor, waitUntil } from "./helpers.js";

/**
 * A shop stocked with one gear item, valued so a purchase grants loyalty.
 * @param {Function} fn - Called with the shop actor and its stocked item
 * @returns {Promise<*>} Whatever fn returned
 */
async function withStockedShop(fn) {
  const wasEnabled = game.settings.get("eclipsephase", "enableShopSystem");
  if (!wasEnabled) await game.settings.set("eclipsephase", "enableShopSystem", true);
  try {
    return await withTempActor({
      type: "shop",
      name: "Quench Shop",
      system: { valuation: { minor: "minor" }, acceptedRepNetworks: { "i-rep": true } },
      items: [{ name: "Quench Stock", type: "gear", system: { cost: "minor" } }]
    }, actor => fn(actor, actor.items.contents[0]));
  } finally {
    if (!wasEnabled) await game.settings.set("eclipsephase", "enableShopSystem", false);
  }
}

/**
 * A buyer carrying an active ID, so favor slots and rep have somewhere to live.
 * @param {Function} fn - Called with the character actor
 * @returns {Promise<*>} Whatever fn returned
 */
async function withBuyer(fn) {
  return withTempActor({ type: "character", name: "Quench Buyer" }, async actor => {
    await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"));
    const [id] = await actor.createEmbeddedDocuments("Item", [{ name: "Quench ID", type: "id" }]);
    await actor.update({ "system.activeID": id.id });
    return fn(actor);
  });
}

Hooks.on("quenchReady", quench => {
  quench.registerBatch("eclipsephase.shop.purchase", context => {
    const { describe, it, assert } = context;

    describe("completing a purchase", function () {
      it("moves the bought item from the shop to the buyer", async function () {
        await withStockedShop(async (shop, stock) => {
          await withBuyer(async buyer => {
            const bought = await completeShopPurchase({
              shopUuid: shop.uuid,
              buyerActorId: buyer.id,
              itemIds: stock.id,
              network: "i-rep",
              favorTier: "moderate"
            });

            assert.lengthOf(bought, 1);
            assert.isOk(buyer.items.getName("Quench Stock"), "buyer should now hold the item");
            assert.notOk(shop.items.get(stock.id), "shop should no longer hold it");
          });
        });
      });

      it("grants loyalty for the purchase, scaled by the shop's own valuation", async function () {
        await withStockedShop(async (shop, stock) => {
          await withBuyer(async buyer => {
            const before = shop.getFlag("eclipsephase", "characterState")?.[buyer.id]?.loyalty?.value ?? 0;

            await completeShopPurchase({
              shopUuid: shop.uuid,
              buyerActorId: buyer.id,
              itemIds: stock.id,
              network: "i-rep",
              favorTier: "moderate"
            });

            const after = shop.getFlag("eclipsephase", "characterState")?.[buyer.id]?.loyalty?.value ?? 0;
            assert.isAbove(after, before, "a minor-valued purchase should raise loyalty");
            assert.isAtLeast(getLoyaltyLevel(shop, after), 1);
          });
        });
      });

      it("buys nothing when the item is already gone", async function () {
        await withStockedShop(async shop => {
          await withBuyer(async buyer => {
            const bought = await completeShopPurchase({
              shopUuid: shop.uuid,
              buyerActorId: buyer.id,
              itemIds: "doesnotexist01",
              network: "i-rep",
              favorTier: "moderate"
            });
            assert.lengthOf(bought, 0);
          });
        });
      });

      it("an unknown buyer or shop is refused instead of throwing", async function () {
        await withStockedShop(async (shop, stock) => {
          const bought = await completeShopPurchase({
            shopUuid: shop.uuid,
            buyerActorId: "nosuchactor0001",
            itemIds: stock.id,
            network: "i-rep",
            favorTier: "moderate"
          });
          assert.lengthOf(bought, 0);
          assert.isOk(shop.items.get(stock.id), "stock stays put when the buyer cannot be found");
        });
      });
    });

    describe("favor slots on a real ID", function () {
      it("consumes a major slot once and then reports none free", async function () {
        await withBuyer(async buyer => {
          assert.isTrue(hasFreeFavorSlot(buyer, "i-rep", "major"));

          assert.isTrue(await consumeFavorSlot(buyer, "i-rep", "major"));
          assert.isFalse(hasFreeFavorSlot(buyer, "i-rep", "major"));
          assert.isFalse(await consumeFavorSlot(buyer, "i-rep", "major"));
        });
      });

      it("leaves a different network untouched", async function () {
        await withBuyer(async buyer => {
          await consumeFavorSlot(buyer, "i-rep", "major");
          assert.isTrue(hasFreeFavorSlot(buyer, "g-rep", "major"));
        });
      });
    });
  }, { displayName: "Eclipse Phase: Shop purchases" });

  quench.registerBatch("eclipsephase.shop.sell", context => {
    const { describe, it, assert } = context;

    describe("shop stock and pricing", function () {
      it("a morph in a shop is priced by that shop's own thresholds", async function () {
        await withTempActor({
          type: "shop",
          name: "Quench Morph Shop",
          system: { morphPointOverrides: { moderateMin: 10, majorMin: 20, rareMin: 30 } },
          items: [{ name: "Quench Flat", type: "morph", system: { morphPoints: 8 } }]
        }, shop => {
          const morph = shop.items.getName("Quench Flat");
          morph.prepareData();
          assert.strictEqual(morph.system.cost, "minor", "8 MP is below this shop's moderate threshold");
        });
      });

      it("the same morph on a character keeps the default tier", async function () {
        await withTempActor({ type: "character", name: "Quench Morph Owner" }, async actor => {
          await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"));
          const [morph] = await actor.createEmbeddedDocuments("Item", [
            { name: "Quench Flat", type: "morph", system: { morphPoints: 8 } }
          ]);
          morph.prepareData();
          assert.strictEqual(morph.system.cost, "rare");
        });
      });

      it("a shop actor can be created while the system is enabled and is gone again afterwards", async function () {
        let seenId = null;
        await withStockedShop(shop => {
          seenId = shop.id;
          assert.isOk(game.actors.get(seenId));
        });
        assert.notOk(game.actors.get(seenId), "the temporary shop should be cleaned up");
      });
    });
  }, { displayName: "Eclipse Phase: Shop stock and pricing" });
});
