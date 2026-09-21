const SOCKET_NAME = "system.eclipsephase";

/**
 * The system's public API. Read lazily, since this feature is imported before init builds it.
 * @returns {Object} game.eclipsephase.api
 */
function api() {
  return game.eclipsephase.api;
}

// Weekly/story-arc Favor-Limit-Tracking on the ID item (Item.id.rep.<network>.<slot>), per network -
// trivial has no RAW limit so it's absent here (hasFreeFavorSlot/consumeFavorSlot treat it as always free).
const FAVOR_LIMIT_SLOTS = { minor: ["small1", "small2", "small3"], moderate: ["med1"], major: ["large"] };

// Loyalty gained per item, scaled by this shop's effective cost tier (Item Valuation) - a "free"
// tier isn't a key here, so it contributes nothing (see getLoyaltyGain()'s guard below). Only
// completeShopPurchase() grants this (Buy/Cash in Favor); plain Sell never does.
export const LOYALTY_PER_TIER = { minor: 10, moderate: 25, major: 40, rare: 80 };

// Takes cost tiers (not items) so the GM-side socket handler can recompute this from data the
// buyer sent, even though the purchased items are already gone from the shop's collection by the
// time that message arrives (they were just transferred to the buyer).
function getLoyaltyGain(shop, costTiers) {
  const overrides = shop.system.loyaltyPerTier ?? {};
  return costTiers.reduce((sum, tier) => {
    if (!(tier in LOYALTY_PER_TIER)) return sum;
    return sum + (overrides[tier] ?? LOYALTY_PER_TIER[tier]);
  }, 0);
}

// Loyalty Bar segment boundaries as raw point values - segments are % of loyaltyBarMax (capped to
// sum <=100 in the settings UI, see EPshopSheet.js's _onRender), so each boundary is just its
// cumulative percentage of max.
function getLoyaltyLevelBoundaries(shop) {
  const max = Number(shop.system.loyaltyBarMax) || 100;
  const segments = shop.system.loyaltyBarSegments ?? {};
  const order = ["red", "orange", "yellow", "green"];
  const percents = order.map(color => Number(segments[color]) || 0);
  const boundaries = [0];
  let cumulative = 0;
  for (let i = 0; i < order.length - 1; i++) {
    cumulative += percents[i];
    boundaries.push((cumulative / 100) * max);
  }
  return boundaries;
}

/**
 * Which of the shop's 4 Loyalty Bar segments (level 1=Red..4=Green) a raw loyalty point value
 * currently falls into.
 * @param {Actor} shop
 * @param {number} value
 * @returns {1|2|3|4}
 */
export function getLoyaltyLevel(shop, value) {
  const boundaries = getLoyaltyLevelBoundaries(shop);
  let level = 1;
  for (let i = 1; i < boundaries.length; i++) {
    if (value >= boundaries[i]) level = i + 1;
  }
  return level;
}

// Drops a loyalty value down by exactly N levels from whichever level it currently occupies,
// landing at that lower level's own starting boundary - never below level 1 (value 0).
function redeemLoyaltyLevels(shop, currentValue, levelsToRedeem) {
  if (levelsToRedeem <= 0) return currentValue;
  const boundaries = getLoyaltyLevelBoundaries(shop);
  const currentLevel = getLoyaltyLevel(shop, currentValue);
  const targetLevel = Math.max(1, currentLevel - levelsToRedeem);
  return boundaries[targetLevel - 1];
}

// Applies EITHER a Loyalty grant (redeemLevels 0) OR a level redemption (Buy's discount, or
// Cash-in-Favor's ease used at roll time - see completeShopPurchase()), never both - spending
// Loyalty always lands exactly on the target level's floor, no gain added in the same
// transaction. Resolved as ONE read-modify-write so a GM-relayed client can't race itself.
// Redemption is resolved against the pre-transaction value.
export async function applyLoyaltyTransaction(shop, characterId, costTiers, redeemLevels = 0) {
  if (!shop.system.loyaltyEnabled) return;
  const current = shop.getFlag("eclipsephase", "characterState")?.[characterId]?.loyalty?.value ?? 0;
  const value = redeemLevels > 0 ? redeemLoyaltyLevels(shop, current, redeemLevels) : current + getLoyaltyGain(shop, costTiers);
  if (value === current) return;
  await shop.setFlag("eclipsephase", `characterState.${characterId}.loyalty`, { value, updated: Date.now() });
}

/**
 * Whether the character has an unused Favor-Limit slot left for this tier/network (read-only check).
 * @param {Actor} character
 * @param {string} network
 * @param {string} tier
 * @returns {boolean}
 */
export function hasFreeFavorSlot(character, network, tier) {
  const slots = FAVOR_LIMIT_SLOTS[tier];
  if (!slots) return true;
  const idItem = character.items.get(character.system.activeID);
  const rep = idItem?.system?.rep?.[network];
  if (!rep) return false;
  return slots.some(slot => !rep[slot]);
}

/**
 * Marks the first unused Favor-Limit slot for this tier/network as used.
 * @param {Actor} character
 * @param {string} network
 * @param {string} tier
 * @returns {Promise<boolean>} false if no free slot was found (limit exhausted)
 */
export async function consumeFavorSlot(character, network, tier) {
  const slots = FAVOR_LIMIT_SLOTS[tier];
  if (!slots) return true;
  const idItem = character.items.get(character.system.activeID);
  const rep = idItem?.system?.rep?.[network];
  if (!rep) return false;
  const freeSlot = slots.find(slot => !rep[slot]);
  if (!freeSlot) return false;
  await idItem.update({ [`system.rep.${network}.${freeSlot}`]: true });
  return true;
}

/**
 * Transfers shop items to a buyer's character (direct if both owned, else GM-relay), applying
 * morph Enhancements/Frame and binding Ware to a body as needed. Called right after a successful
 * purchase roll, and again later if a Pool swap/upgrade turns a failed roll into one.
 * @param {{shopUuid: string, buyerActorId: string, itemIds: string|string[], network?: string, favorTier?: string, bodyBindings?: Record<string,string>, redeemLevels?: number}} params
 *   shopUuid (not a bare id) so a shop placed as an (unlinked) scene token resolves to the exact
 *   same instance/item-collection the buyer's sheet was showing.
 *   network/favorTier are only passed for the "Cash in Favor" roll flow, to consume a Favor-Limit
 *   slot on completion - the flat "Buy" house rule never passes them, so never touches the limit.
 *   bodyBindings (shop item id -> boundTo) is pre-resolved before the purchase was paid for; falls
 *   back to prompting here if a Ware item has no entry (e.g. the Pool-rescue path).
 *   redeemLevels - how many Loyalty levels this purchase spends: for Buy, the player-chosen
 *   discount redemption; for Cash-in-Favor, the ease actually used to roll at this difficulty
 *   (see _getFinalFavorTier()) - both land on the target level's floor and skip the normal
 *   purchase gain. 0 means no ease/redemption was used, so the normal gain applies.
 * @returns {Promise<Item[]>} the items actually transferred (empty if none were)
 */
export async function completeShopPurchase({ shopUuid, buyerActorId, itemIds, network, favorTier, bodyBindings = {}, redeemLevels = 0 } = {}) {
  const shop = await fromUuid(shopUuid);
  const character = game.actors.get(buyerActorId);
  if (!shop || !character) return [];

  const ids = Array.isArray(itemIds) ? itemIds : String(itemIds ?? "").split(",").filter(Boolean);
  const items = ids.map(id => shop.items.get(id)).filter(Boolean);
  if (!items.length) {
    if (ids.length) ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.purchaseItemsGone"));
    return [];
  }
  if (items.length < ids.length) {
    ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.purchaseItemsGone"));
  }

  const boughtItems = [];
  for (const item of items) {
    let created;
    if (character.isOwner && shop.isOwner) {
      created = await api().actors.transferItemBetweenActors({ sourceActor: shop, targetActor: character, item, quantity: 1 });
      if (item.type === "morph" && created) {
        const { boundToFor } = api().actors.getBodyBindingInfo(character);
        const boundTo = boundToFor(created);
        await api().actors.applyStandardEnhancements(character, created, boundTo);
        await api().actors.applyFrame(character, created, boundTo);
      }
    } else {
      const transferResult = await api().actors.requestGMItemTransfer({
        sourceActorUuid: shop.uuid,
        targetActorUuid: character.uuid,
        itemId: item.id,
        quantity: 1
      });
      if (!transferResult?.ok) {
        ui.notifications.warn(transferResult?.error ?? game.i18n.localize("ep2e.shop.warnings.purchaseFailed"));
        continue;
      }
      created = character.items.get(transferResult.createdItemId);
    }

    if (item.type === "ware" && created) {
      const preResolved = bodyBindings[item.id];
      if (preResolved) {
        await created.update({ "system.boundTo": preResolved });
      } else {
        const resolved = await api().actors.resolveBodyForItem(character, "ep2e.systemMessage.itemAttachment.noBodyWare");
        if (!resolved.cancelled) await created.update({ "system.boundTo": resolved.boundTo });
      }
    }

    boughtItems.push(item);
  }

  if (boughtItems.length) {
    // This shop's effective cost tier (Item Valuation), not the item's own raw tier - a Minor
    // item remapped to Free grants no Loyalty, matching how it's priced.
    const costTiers = boughtItems.map(item => shop.system.valuation?.[item.system.cost] ?? "free");
    if (shop.isOwner) {
      await applyLoyaltyTransaction(shop, character.id, costTiers, redeemLevels);
    } else {
      // Shop actors are usually GM-owned - ask a GM to apply this instead (see the "grantLoyalty"
      // branch in registerItemTransferSocket()). The GM recomputes the grant/redemption from its
      // own live shop reference so a stale client-side setting can't under- or over-grant loyalty.
      // Sent as ONE message, applied as one atomic read-modify-write, so it can't race itself.
      game.socket.emit(SOCKET_NAME, {
        action: "grantLoyalty",
        shopUuid: shop.uuid,
        characterId: character.id,
        costTiers,
        redeemLevels
      });
    }
  }

  // Only consume a Favor-Limit slot if something was actually bought - otherwise a fully-failed
  // purchase (all items already gone) would still burn a limited slot for nothing.
  if (boughtItems.length && network && favorTier) {
    const consumed = await consumeFavorSlot(character, network, favorTier);
    if (!consumed) ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.favorLimitExhausted"));
  }

  return boughtItems;
}

const GENERAL_CHAT_MESSAGE = "systems/eclipsephase/templates/chat/general-chat-message.html";

/**
 * <img> markup for a Rep network's icon, sized 48x48 inline (not via CSS class - .shop-rep-icon
 * is shared with small 14px usages elsewhere, e.g. Settings checkboxes).
 * @param {string} network
 * @returns {string}
 */
export function shopRepIconHtml(network) {
  return `<img src="${CONFIG.eclipsephase.repIcons[network]}" class="shop-rep-icon" title="${game.i18n.localize(CONFIG.eclipsephase.repTypes[network])}" style="width: 48px; height: 48px; margin-right: 0;"/>`;
}

/**
 * Posts a shop chat message: a copy line plus an optional box, reusing general-chat-message.html
 * (also used for Rez-spend notices) - the box only renders if boxContent is supplied. Callers
 * build their own box content via shopRepIconHtml() plus whatever belongs next to it - the shape
 * differs per action: Buy/Sell show an amount, Trade prefixes Received/Spent, Cash-in-Favor shows
 * a favor tier (a roll has no fixed Rep cost unless Rep was burned).
 * @param {Actor} character - speaker
 * @param {string} copyKey - loc key for the message's top line, formatted with copyData
 * @param {Object} copyData - game.i18n.format() placeholders for copyKey
 * @param {string|null} [boxContent] - pre-built HTML for the box; null/omitted skips the box
 */
export async function postShopChatMessage(character, copyKey, copyData, boxContent = null) {
  const content = await foundry.applications.handlebars.renderTemplate(GENERAL_CHAT_MESSAGE, {
    type: "general",
    headline: game.i18n.format(copyKey, copyData),
    boxHeadline: boxContent ? `<span style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 24px;">${boxContent}</span>` : null
  });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: character }), content });
}
