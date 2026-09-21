import EPshopSheet from "./shop-sheet.js";
import ShopModel from "./shop-model.js";
import { applyLoyaltyTransaction, completeShopPurchase, postShopChatMessage, shopRepIconHtml } from "./shop-logic.js";

const SOCKET_NAME = "system.eclipsephase";
const BURN_BONUS_PER_POINT = 2;
// Morph cost tier is derived from Morph Points; a shop may override where each tier starts.
// Same defaults the core item preparation uses, applied here only when an override is present.
const MORPH_TIER_THRESHOLDS = { moderate: 2, major: 5, rare: 8 };

const SHOP_TEMPLATES = [
  "systems/eclipsephase/templates/features/shop/shop-footer.html",
  "systems/eclipsephase/templates/features/shop/shop-inventory-panel.html",
  "systems/eclipsephase/templates/features/shop/shop-to-sell-list.html"
];

/**
 * Whether the shop system is switched on for this world.
 * @returns {Boolean} True while shops may be created and shown
 */
function shopSystemEnabled() {
  return game.settings.get("eclipsephase", "enableShopSystem");
}

Hooks.once("init", () => {
  game.settings.register("eclipsephase", "enableShopSystem", {
    config: true,
    scope: "world",
    name: "SETTINGS.enableShopSystem.name",
    hint: "SETTINGS.enableShopSystem.hint",
    type: Boolean,
    default: true
  });

  CONFIG.Actor.dataModels.shop = ShopModel;
  foundry.documents.collections.Actors.registerSheet("eclipsephase", EPshopSheet, { types: ["shop"], makeDefault: true });
  foundry.applications.handlebars.loadTemplates(SHOP_TEMPLATES);
});

Hooks.once("eclipsephase.ready", ({ api: systemApi }) => {
  systemApi.registry.registerRollSource("shopPurchase", {});
  systemApi.registry.registerSlot("rollDialog.sections", {
    template: "systems/eclipsephase/templates/features/shop/roll-dialog-section.html",
    when: context => context.rolledFrom === "shopPurchase"
  });
});

// Shops have no health bars, but still get their own token defaults, gated by their own setting
// instead of the character/npc/goon logic in the core hook.
Hooks.on("preCreateActor", (actor, data) => {
  if (data.type !== "shop") return;
  if (!shopSystemEnabled()) {
    ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.systemDisabled"));
    return false;
  }
  actor.updateSource({
    "img": "systems/eclipsephase/resources/icons/Currency/currency-c.svg",
    "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.HOVER,
    "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.NEUTRAL,
    "prototypeToken.actorLink": false
  });
});

// First-pass behavior for a disabled shop system: hide existing shops from the sidebar directory
// rather than making them read-only or deleting them.
Hooks.on("renderActorDirectory", (app, html) => {
  if (shopSystemEnabled()) return;
  html.querySelectorAll("li.directory-item[data-entry-id]").forEach(li => {
    if (game.actors.get(li.dataset.entryId)?.type === "shop") li.remove();
  });
});

// Sell Bonus and burned Rep are the shop's own modifiers, and the burned amount has to reach the
// chat card so a pool rescue can still charge it. burnMod clamp must match the sheet's own
// post-roll clamp against dataset.rollvalue/maxBurn.
Hooks.on("eclipsephase.preRoll", context => {
  if (context.rolledFrom !== "shopPurchase") return;
  const { dataset, options } = context;

  const sellBonus = Number(dataset.sellBonus) || 0;
  if (sellBonus) context.modifiers.push({ text: "ep2e.shop.purchase.sellBonusModifier", value: sellBonus });

  const burnAmount = Math.max(0, Math.min(
    Number(options.burnMod) || 0,
    Number(dataset.maxBurn) || 0,
    Number(dataset.rollvalue) || 0
  ));
  if (burnAmount) {
    context.modifiers.push({ text: "ep2e.shop.purchase.burnBonusModifier", value: burnAmount * BURN_BONUS_PER_POINT });
  }

  context.itemData = {
    shopUuid: dataset.shopUuid,
    buyerActorId: dataset.buyerActorId,
    itemIds: dataset.itemIds,
    network: dataset.name,
    requiredTier: dataset.requiredTier,
    bodyBindings: dataset.bodyBindings,
    burnAmount
  };
});

// A pool spend that turns a failed purchase into a success completes the purchase after the fact.
Hooks.on("eclipsephase.poolResult", async ({ context, actor }) => {
  if (context.rolledFrom !== "shopPurchase" || context.alternatives.resultClass !== "success") return;

  const bodyBindings = {};
  (context.shop.bodyBindings || "").split(",").filter(Boolean).forEach(pair => {
    const [id, boundTo] = pair.split(":");
    bodyBindings[id] = boundTo;
  });

  const boughtItems = await completeShopPurchase({
    shopUuid: context.shop.shopUuid,
    buyerActorId: context.shop.buyerActorId,
    itemIds: context.shop.itemIds,
    network: context.shop.network,
    favorTier: context.shop.requiredTier,
    bodyBindings
  });
  if (!boughtItems.length) return;

  const burnAmount = context.shop.burnAmount;
  const tierLabel = `<span style="font-size: 16px;">${game.i18n.localize(CONFIG.eclipsephase.favorTiers[context.shop.requiredTier])}</span>`;
  const boxContent = burnAmount > 0
    ? `${tierLabel} + ${shopRepIconHtml(context.shop.network)} ${burnAmount}`
    : `${shopRepIconHtml(context.shop.network)} ${tierLabel}`;
  await postShopChatMessage(actor, burnAmount > 0 ? "ep2e.shop.purchase.favorBurnMessage" : "ep2e.shop.purchase.favorMessage",
    { character: actor.name, items: boughtItems.map(item => item.name).join(", "), network: context.shop.network.replace("-rep", "") },
    boxContent);
});

// A shop prices its stock by its own Morph Point thresholds, so a morph sitting in one can be
// worth a different tier than the same morph elsewhere.
Hooks.on("eclipsephase.prepareItemData", (item, itemModel) => {
  if (item.type !== "morph" || item.parent?.type !== "shop") return;
  const overrides = item.parent.system.morphPointOverrides;
  if (!overrides) return;

  const mp = Number(itemModel.morphPoints) || 0;
  const moderateMin = overrides.moderateMin ?? MORPH_TIER_THRESHOLDS.moderate;
  const majorMin = overrides.majorMin ?? MORPH_TIER_THRESHOLDS.major;
  const rareMin = overrides.rareMin ?? MORPH_TIER_THRESHOLDS.rare;
  if (mp >= rareMin) itemModel.cost = "rare";
  else if (mp >= majorMin) itemModel.cost = "major";
  else if (mp >= moderateMin) itemModel.cost = "moderate";
  else itemModel.cost = "minor";
});

// Shop actors are usually GM-owned, so a buying player asks a GM to apply the loyalty change.
// The GM recomputes it from its own live shop reference rather than trusting client-sent numbers.
Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, async payload => {
    if (payload?.action !== "grantLoyalty") return;
    if (!game.user.isGM) return;
    const primaryGM = game.users.activeGM;
    if (primaryGM && primaryGM.id !== game.user.id) return;
    const shop = await fromUuid(payload.shopUuid);
    if (!shop) return;
    await applyLoyaltyTransaction(shop, payload.characterId, payload.costTiers ?? [], payload.redeemLevels ?? 0);
  });
});
