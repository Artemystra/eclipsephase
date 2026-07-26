import * as SHEET from "./general-sheet-functions.js"
import * as MORPHFUNCTION from "./morp-functions.js"

/**
 * Sorts an object list alphabetically
 * Uses the value (label of a dropdown) to do so
 * @param {*} obj 
 * @returns 
 */
export function sortObjectByValue(obj) {
  return Object.fromEntries(
    Object.entries(obj).sort(([, a], [, b]) =>
      a.localeCompare(b, game.i18n.lang)
    )
  );
}

/**
 * Helper to simulate the former jQuery slideUp function (for deletions)
 * @param {*} element The HTML wrapper for the element to slide
 * @param {*} duration Timeframe to slide in ms (best practice 200)
 * @param {*} callback 
 * @returns 
 */
export function slideUp(element, duration, callback = null) {
  if (!element) return;

  const height = element.offsetHeight;
  element.style.height = `${height}px`;
  element.style.transitionProperty = "height, margin, padding, opacity";
  element.style.transitionDuration = `${duration}ms`;
  element.style.transitionTimingFunction = "ease";
  element.style.overflow = "hidden";
  element.style.opacity = "1";

  element.offsetHeight; // force reflow

  element.style.height = "0";
  element.style.paddingTop = "0";
  element.style.paddingBottom = "0";
  element.style.marginTop = "0";
  element.style.marginBottom = "0";
  element.style.opacity = "0";

  window.setTimeout(() => {
    element.remove();

    if (typeof callback === "function") {
      callback();
    }
  }, duration);
}

/**
 * Helper to simulate the former toggleVisibility function in jQuery (for opening/closing items)
 * @param {*} element 
 * @param {*} duration 
 * @returns 
 */

function getSlideDisplayMode(element, fallback = "block") {
  if (!element) return fallback;

  if (element.classList.contains("showFlex")) return "flex";

  if (element.classList.contains("showGrid")) return "grid";

  if (element.dataset.display) return element.dataset.display;

  const currentDisplay = getComputedStyle(element).display;
  if (currentDisplay && currentDisplay !== "none") return currentDisplay;
  return fallback;
}

export function slideToggleVisibility(element, duration, display = null) {
  if (!element) return;

  const computedDisplay = getComputedStyle(element).display;
  const isHidden = getComputedStyle(element).display === "none";
  const resolvedDisplay = display ?? getSlideDisplayMode(element);

  if (isHidden) {
    slideDownVisibility(element, duration, resolvedDisplay);
  } else {
    slideUpVisibility(element, duration, resolvedDisplay);
  }
}

export function slideUpVisibility(element, duration = 200, display = null) {
  if (!element) return;

  const resolvedDisplay = display ?? getSlideDisplayMode(element);
  const startHeight = element.scrollHeight;

  element.style.display = resolvedDisplay;
  element.style.overflow = "hidden";
  element.style.height = `${startHeight}px`;
  element.style.opacity = "1";
  element.style.transitionProperty = "none";

  element.offsetHeight; // force reflow

  element.style.transitionProperty = "height, opacity";
  element.style.transitionDuration = `${duration}ms`;
  element.style.transitionTimingFunction = "ease";

  requestAnimationFrame(() => {
    element.style.height = "0px";
    element.style.opacity = "0";
  });

  window.setTimeout(() => {
    element.style.display = "none";
    element.style.removeProperty("height");
    element.style.removeProperty("overflow");
    element.style.removeProperty("transition-property");
    element.style.removeProperty("transition-duration");
    element.style.removeProperty("transition-timing-function");
    element.style.removeProperty("opacity");
  }, duration);
}

export function slideDownVisibility(element, duration = 200, display = null) {
  if (!element) return;

  const resolvedDisplay = display ?? getSlideDisplayMode(element);

  const previousDisplay = element.style.display;
  const previousPosition = element.style.position;
  const previousVisibility = element.style.visibility;
  const previousHeight = element.style.height;
  const previousOverflow = element.style.overflow;
  const previousOpacity = element.style.opacity;

  // Measure off-flow
  element.style.display = resolvedDisplay;
  element.style.position = "absolute";
  element.style.visibility = "hidden";
  element.style.height = "auto";
  element.style.overflow = "visible";
  element.style.opacity = "1";

  const targetHeight = element.scrollHeight;

  // Reset into start state
  element.style.display = resolvedDisplay;
  element.style.position = previousPosition;
  element.style.visibility = previousVisibility;
  element.style.height = "0px";
  element.style.overflow = "hidden";
  element.style.opacity = "0";
  element.style.transitionProperty = "height, opacity";
  element.style.transitionDuration = `${duration}ms`;
  element.style.transitionTimingFunction = "ease";

  element.offsetHeight; // force reflow

  requestAnimationFrame(() => {
    element.style.height = `${targetHeight}px`;
    element.style.opacity = "1";
  });

  window.setTimeout(() => {
    element.style.removeProperty("height");
    element.style.removeProperty("overflow");
    element.style.removeProperty("transition-property");
    element.style.removeProperty("transition-duration");
    element.style.removeProperty("transition-timing-function");
    element.style.removeProperty("opacity");

    if (!previousDisplay) element.style.removeProperty("display");
    if (!previousPosition) element.style.removeProperty("position");
    if (!previousVisibility) element.style.removeProperty("visibility");
    if (!previousHeight) element.style.removeProperty("height");
    if (!previousOverflow) element.style.removeProperty("overflow");
    if (!previousOpacity) element.style.removeProperty("opacity");
  }, duration);
}

/**
 * Makes sure that old enriched HTML will not be broken by the newer prose mirrors
 * @param {*} content 
 * @returns 
 */
export function _normalizeRichTextForProseMirror(content) {
  if (!content || typeof content !== "string") return "";

  const wrapper = document.createElement("div");
  wrapper.innerHTML = content;

  // Remove obviously problematic wrappers/scripts/styles
  wrapper.querySelectorAll("script, style").forEach(el => el.remove());

  // Convert bare text nodes at root into paragraphs
  const nodes = [...wrapper.childNodes];
  if (!wrapper.children.length && wrapper.textContent?.trim()) {
    wrapper.innerHTML = `<p>${wrapper.innerHTML}</p>`;
  }

  // Optional: convert stray <br><br> style blocks into paragraphs more cleanly later if needed
  return wrapper.innerHTML.trim();
}

// Helper to handle GM requests if items are traded
const SOCKET_NAME = "system.eclipsephase";

let transferSocketRegistered = false;

export function registerItemTransferSocket() {
  if (transferSocketRegistered) return;
  transferSocketRegistered = true;
  game.socket.on(SOCKET_NAME, async payload => {
    if (!game.user.isGM) return;
    if (!payload) return;
    if (payload.action !== "transferItem") return;

    const {
      requestId,
      sourceActorId,
      targetActorId,
      itemId,
      quantity,
      userId
    } = payload;

    const primaryGM = game.users.activeGM;
    if (primaryGM && primaryGM.id !== game.user.id) return;

    const sourceActor = game.actors.get(sourceActorId);
    const targetActor = game.actors.get(targetActorId);
    const item = sourceActor?.items.get(itemId);

    if (!sourceActor || !targetActor || !item) {
      return _replyToUser(userId, {
        requestId,
        ok: false,
        error: "Transfer failed: source, target, or item was not found."
      });
    }

    // Selling owns the source; buying from a shop owns only the target - both are valid.
    const requestingUser = game.users.get(userId);
    const ownsSource = requestingUser ? sourceActor.testUserPermission(requestingUser, "OWNER") : false;
    const ownsTarget = requestingUser ? targetActor.testUserPermission(requestingUser, "OWNER") : false;

    if (!requestingUser || (!ownsSource && !ownsTarget)) {
      return _replyToUser(userId, {
        requestId,
        ok: false,
        error: "Transfer failed: you must own either the source or the target actor."
      });
    }

    // Morph trades between characters are blocked (active/sleeved morph has state that a plain
    // item transfer can't handle safely) - a shop's morphs are never active, so exempt those.
    const blockedTypes = new Set(["morph"]);
    if (sourceActor.type !== "shop" && blockedTypes.has(item.type)) {
      return _replyToUser(userId, {
        requestId,
        ok: false,
        error: "This item type cannot be transferred."
      });
    }

    // Armor is always body-bound - this path previously carried the source actor's boundTo over
    // verbatim, leaving it dangling on the target (invisible on a character, wrongly active on an
    // npc/goon). Same resolution as the direct (non-GM) transfer path in EPactorSheet.js: incoming
    // armor on a character always lands in the Stash; on npc/goon, silently bind to their one body
    // (no dialog possible here - this runs unattended on the GM's client, not the requesting
    // player's) - if they have none, leave boundTo as-is rather than guessing.
    let boundToOverride;
    if (item.type === "armor") {
      if (targetActor.type === "character") {
        boundToOverride = "stash";
      } else {
        const { bodies, boundToFor } = MORPHFUNCTION.getBodyBindingInfo(targetActor);
        if (bodies.length > 0) {
          boundToOverride = boundToFor(bodies[0]);
        }
      }
    }

    try {
      const created = await SHEET.transferItemBetweenActors({
        sourceActor,
        targetActor,
        item,
        quantity,
        boundToOverride
      });

      // Shop morphs come with unfilled Enhancement slots - auto-apply them on purchase (no
      // Standard/Flat choice dialog possible here, runs unattended on the GM's client).
      if (item.type === "morph" && sourceActor.type === "shop" && created) {
        const { boundToFor } = MORPHFUNCTION.getBodyBindingInfo(targetActor);
        const boundTo = boundToFor(created);
        await MORPHFUNCTION.applyStandardEnhancements(targetActor, created, boundTo);
        await MORPHFUNCTION.applyFrame(targetActor, created, boundTo);
      }

      _replyToUser(userId, {
        requestId,
        ok: true,
        createdItemId: created?.id
      });
    } catch (err) {
      console.error("EP item transfer failed", err);
      _replyToUser(userId, {
        requestId,
        ok: false,
        error: err?.message ?? "Unknown transfer error."
      });
    }
  });
}

function _replyToUser(userId, payload) {
  game.socket.emit(SOCKET_NAME, {
    action: "transferItemResult",
    userId,
    ...payload
  });
}

export function requestGMItemTransfer({
  sourceActorId,
  targetActorId,
  itemId,
  quantity = 1
} = {}) {
  return new Promise((resolve) => {
    const requestId = foundry.utils.randomID();
    let settled = false;

    const finish = payload => {
      if (settled) return;
      settled = true;
      game.socket.off(SOCKET_NAME, resultHandler);
      resolve(payload);
    };

    const resultHandler = payload => {
      if (!payload) return;
      if (payload.action !== "transferItemResult") return;
      if (payload.userId !== game.user.id) return;
      if (payload.requestId !== requestId) return;

      finish(payload);
    };

    game.socket.on(SOCKET_NAME, resultHandler);

    game.socket.emit(SOCKET_NAME, {
      action: "transferItem",
      requestId,
      userId: game.user.id,
      sourceActorId,
      targetActorId,
      itemId,
      quantity
    });

    window.setTimeout(() => {
      finish({
        requestId,
        ok: false,
        error: "No GM responded to the transfer request."
      });
    }, 5000);
  });
}

// Weekly/story-arc Favor-Limit-Tracking on the ID item (Item.id.rep.<network>.<slot>), per network -
// trivial has no RAW limit so it's absent here (hasFreeFavorSlot/consumeFavorSlot treat it as always free).
const FAVOR_LIMIT_SLOTS = { minor: ["small1", "small2", "small3"], moderate: ["med1"], major: ["large"] };

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
 * @param {{shopId: string, buyerActorId: string, itemIds: string|string[], network?: string, favorTier?: string, bodyBindings?: Record<string,string>}} params
 *   network/favorTier are only passed for the "Gefallen einlösen" roll flow, to consume a Favor-Limit
 *   slot on completion - the flat "Kaufen" house rule never passes them, so never touches the limit.
 *   bodyBindings (shop item id -> boundTo) is pre-resolved before the purchase was paid for; falls
 *   back to prompting here if a Ware item has no entry (e.g. the Pool-rescue path).
 * @returns {Promise<void>}
 */
export async function completeShopPurchase({ shopId, buyerActorId, itemIds, network, favorTier, bodyBindings = {} } = {}) {
  const shop = game.actors.get(shopId);
  const character = game.actors.get(buyerActorId);
  if (!shop || !character) return;

  const ids = Array.isArray(itemIds) ? itemIds : String(itemIds ?? "").split(",").filter(Boolean);
  const items = ids.map(id => shop.items.get(id)).filter(Boolean);
  if (!items.length) {
    if (ids.length) ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.purchaseItemsGone"));
    return;
  }
  if (items.length < ids.length) {
    ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.purchaseItemsGone"));
  }

  const boughtNames = [];
  for (const item of items) {
    let created;
    if (character.isOwner && shop.isOwner) {
      created = await SHEET.transferItemBetweenActors({ sourceActor: shop, targetActor: character, item, quantity: 1 });
      if (item.type === "morph" && created) {
        const { boundToFor } = MORPHFUNCTION.getBodyBindingInfo(character);
        const boundTo = boundToFor(created);
        await MORPHFUNCTION.applyStandardEnhancements(character, created, boundTo);
        await MORPHFUNCTION.applyFrame(character, created, boundTo);
      }
    } else {
      const transferResult = await requestGMItemTransfer({
        sourceActorId: shop.id,
        targetActorId: character.id,
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
        const resolved = await MORPHFUNCTION.resolveBodyForItem(character, "ep2e.systemMessage.itemAttachment.noBodyWare");
        if (!resolved.cancelled) await created.update({ "system.boundTo": resolved.boundTo });
      }
    }

    boughtNames.push(item.name);
  }

  if (network && favorTier) {
    const consumed = await consumeFavorSlot(character, network, favorTier);
    if (!consumed) ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.favorLimitExhausted"));
  }

  if (boughtNames.length) {
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: character }),
      content: `<p>${game.i18n.format("ep2e.shop.purchase.successMessage", {
        character: character.name,
        shop: shop.name,
        items: boughtNames.join(", ")
      })}</p>`
    });
  }
}