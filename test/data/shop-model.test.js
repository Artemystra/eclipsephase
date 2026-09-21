import fs from "fs";
import path from "path";
import ShopModel from "../../module/features/shop/shop-model.js";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");
const frozen = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "test", "fixtures", "schema", "shop-template-2.3.json"), "utf8"));
const template = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "template.json"), "utf8"));

describe("the shop data model", () => {
  test("its defaults match the schema template.json carried before the model existed", () => {
    expect(ShopModel.cleanData()).toEqual(frozen);
  });

  test("a freshly constructed shop starts on those defaults", () => {
    expect({ ...new ShopModel() }).toMatchObject(frozen);
  });

  test("supplied data wins over the defaults", () => {
    const shop = new ShopModel({ loyaltyEnabled: false, sellLimitMaxItems: 5 });
    expect(shop.loyaltyEnabled).toBe(false);
    expect(shop.sellLimitMaxItems).toEqual(5);
    expect(shop.loyaltyBarMax).toEqual(100);
  });

  test("every rep network carries its own per-tier rate overrides", () => {
    const defaults = ShopModel.cleanData();
    const networks = Object.keys(defaults.rateOverrides);
    expect(networks).toEqual(["@-rep", "c-rep", "f-rep", "g-rep", "i-rep", "r-rep", "x-rep"]);
    for (const network of networks) {
      expect(Object.keys(defaults.rateOverrides[network])).toEqual(["minor", "moderate", "major"]);
      expect(defaults.rateOverrides[network].minor).toEqual({ flatBuyCost: null, sellBonus: null, sellRepGain: null });
    }
  });

  test("an override left blank stays null, so the system default still applies", () => {
    const defaults = ShopModel.cleanData();
    expect(defaults.morphPointOverrides).toEqual({ moderateMin: null, majorMin: null, rareMin: null });
    expect(defaults.loyaltyPerTier).toEqual({ minor: null, moderate: null, major: null, rare: null });
  });

  test("template.json keeps only an empty stub for the shop type", () => {
    expect(template.Actor.shop).toEqual({});
    expect(template.Actor.types).toContain("shop");
  });
});
