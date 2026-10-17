import { claimDose } from "./doses.js";
import { selectFromSearchableList } from "./general-sheet-functions.js";

// While the GM picks who receives an offered dose, the canvas shows a syringe cursor.
const TARGETING_CLASS = "ep-dose-targeting";

/**
 * The actors a GM may hand a dose to from the NPC list: the world's NPCs. Goons are left out -
 * they are unlinked tokens whose doses rarely matter beyond the scene, and they are reached on the
 * canvas instead.
 * @returns {Actor[]} The NPCs, sorted by name
 */
export function doseTargetCandidates() {
  return game.actors.filter(actor => actor.type === "npc").sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The token under a point on the canvas, the topmost one where several overlap. Tokens the GM
 * cannot see are skipped.
 * @param {Object} point - Canvas coordinates
 * @param {Object[]} tokens - The canvas tokens, in draw order
 * @returns {Object|null} The token, or null over empty canvas
 */
export function tokenAt(point, tokens) {
  const hits = tokens.filter(token => token.isVisible !== false && token.bounds?.contains(point.x, point.y));
  return hits.at(-1) ?? null;
}

/**
 * Lets the GM click a token on the canvas. The cursor turns into a syringe until the click; a click
 * on empty canvas, a right-click or Escape cancels. The click is kept from the canvas itself, so
 * picking a target does not also select or deselect tokens.
 * @returns {Promise<Object|null>} The token clicked, or null when cancelled
 */
export function pickTokenOnCanvas() {
  const board = document.getElementById("board");
  if (!globalThis.canvas?.ready || !board) return Promise.resolve(null);

  return new Promise(resolve => {
    const finish = token => {
      board.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      document.body.classList.remove(TARGETING_CLASS);
      resolve(token);
    };
    const onPointer = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.button !== 0) return finish(null);
      const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      finish(tokenAt(point, canvas.tokens.placeables));
    };
    const onKey = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finish(null);
    };

    document.body.classList.add(TARGETING_CLASS);
    board.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
  });
}

/**
 * Asks the GM which NPC receives a dose, from a list they can filter by typing.
 * @returns {Promise<Actor|null>} The NPC, or null when cancelled
 */
async function pickNpc() {
  const entries = doseTargetCandidates().map(actor => ({ id: actor.id, label: actor.name }));
  const id = await selectFromSearchableList(entries, "ep2e.dialog.selectDoseNpc.header", "ep2e.dialog.selectDoseNpc.copy");
  return id ? game.actors.get(id) ?? null : null;
}

/**
 * Hands an offered dose to a target the GM picks: a token on the canvas, or an NPC from the list.
 * Only a GM can do this, and the claim runs on their client, where the card may be changed.
 * @param {String} messageId - The offer card's id
 * @param {String} mode - "canvas" or "npc"
 * @param {Object} [pickers] - Replacements for the two pickers, for tests
 * @returns {Promise<Object>} What claimDose reported, or cancelled
 */
export async function chooseDoseTarget(messageId, mode, pickers = {}) {
  if (!game.user.isGM) return { claimed: false, cancelled: true };
  const message = game.messages.get(messageId);
  if (!message?.getFlag?.("eclipsephase", "doseOffer")) return { claimed: false, cancelled: true };

  let actor = null;
  if (mode === "canvas") {
    if (!globalThis.canvas?.ready) {
      ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.doseNoScene"));
      return { claimed: false, cancelled: true };
    }
    ui.notifications.info(game.i18n.localize("ep2e.actorSheet.warnings.doseTargetPrompt"));
    const token = await (pickers.canvas ?? pickTokenOnCanvas)();
    actor = token?.actor ?? null;
  }
  else if (mode === "npc") {
    actor = await (pickers.npc ?? pickNpc)();
  }
  if (!actor) return { claimed: false, cancelled: true };

  const result = await claimDose(message, actor);
  if (result.reasonKey) ui.notifications.warn(game.i18n.localize(result.reasonKey));
  return result;
}
