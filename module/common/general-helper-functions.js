import * as SHEET from "./general-sheet-functions.js"

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

    const requestingUser = game.users.get(userId);
    const ownsSource = requestingUser
      ? sourceActor.testUserPermission(requestingUser, "OWNER")
      : false;

    if (!requestingUser || !ownsSource) {
      return _replyToUser(userId, {
        requestId,
        ok: false,
        error: "Transfer failed: you do not own the source actor."
      });
    }

    const blockedTypes = new Set(["morph"]);
    if (blockedTypes.has(item.type)) {
      return _replyToUser(userId, {
        requestId,
        ok: false,
        error: "This item type cannot be transferred."
      });
    }

    try {
      await SHEET.transferItemBetweenActors({
        sourceActor,
        targetActor,
        item,
        quantity
      });

      _replyToUser(userId, {
        requestId,
        ok: true
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