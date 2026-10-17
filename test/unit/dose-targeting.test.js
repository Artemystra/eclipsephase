import { doseTargetCandidates, tokenAt, chooseDoseTarget } from "../../module/common/dose-targeting.js";
import { offerDose, requestDoseClaim } from "../../module/common/doses.js";
import { selectFromSearchableList } from "../../module/common/general-sheet-functions.js";
import { GMvision } from "../../module/rolls/chat.js";
import { makeActor, resetWorld, seedDialogs } from "../setup/factories.js";

/**
 * An actor sleeved in a body of the given type.
 * @param {String} type - The actor type
 * @param {String} name - The actor's name
 * @param {String} [morphType] - The sleeved morph's type
 * @returns {Actor} The prepared actor
 */
function body(type, name, morphType = "bio") {
  return makeActor({
    type, name,
    system: { activeMorph: "morph1" },
    items: [{ _id: "morph1", name: "Morph", type: "morph", system: { type: morphType } }]
  });
}

/**
 * A fresh offer card for a dose of Kick, offered by a character.
 * @returns {Promise<Object>} The offer message
 */
async function offerCard() {
  const giver = makeActor({
    type: "character", name: "Giver", system: { activeMorph: "morph1" },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio" } },
      { _id: "kick1", name: "Kick", type: "drug", system: { active: true, drugType: "biochem", injection: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 8, units: "hours" } } }
    ]
  });
  return (await offerDose(giver, giver.items.get("kick1"))).message;
}

/**
 * A rectangle stand-in for a token's bounds.
 * @param {Number} x - Left edge
 * @param {Number} y - Top edge
 * @returns {Object} An object answering contains()
 */
function box(x, y) {
  return { contains: (px, py) => px >= x && px < x + 100 && py >= y && py < y + 100 };
}

beforeEach(() => {
  resetWorld();
  game.user.isGM = true;
  globalThis.canvas = { ready: true };
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
  jest.spyOn(ui.notifications, "info").mockImplementation(() => {});
});

afterEach(() => {
  delete globalThis.canvas;
  jest.restoreAllMocks();
});

describe("who the NPC list offers", () => {
  test("the world's NPCs, by name, and neither goons nor characters", () => {
    body("npc", "Zed");
    body("npc", "Anna");
    body("goon", "Thug");
    body("character", "Dinah");

    expect(doseTargetCandidates().map(actor => actor.name)).toEqual(["Anna", "Zed"]);
  });
});

describe("the token under the cursor", () => {
  test("is the topmost one where tokens overlap", () => {
    const below = { name: "below", bounds: box(0, 0) };
    const above = { name: "above", bounds: box(50, 50) };

    expect(tokenAt({ x: 60, y: 60 }, [below, above])).toBe(above);
  });

  test("skips tokens the GM cannot see, and is nothing over empty canvas", () => {
    const hidden = { name: "hidden", bounds: box(0, 0), isVisible: false };

    expect(tokenAt({ x: 10, y: 10 }, [hidden])).toBeNull();
    expect(tokenAt({ x: 500, y: 500 }, [{ bounds: box(0, 0) }])).toBeNull();
  });
});

describe("the GM choosing who receives an offered dose", () => {
  test("a token clicked on the canvas receives it, and the card is used up", async () => {
    const message = await offerCard();
    const goon = body("goon", "Thug");

    const result = await chooseDoseTarget(message.id, "canvas", { canvas: async () => ({ actor: goon }) });

    expect(result.claimed).toBe(true);
    expect(goon.effects.some(effect => effect.getFlag("eclipsephase", "dose"))).toBe(true);
    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toEqual("Thug");
  });

  test("an NPC picked from the list receives it", async () => {
    const message = await offerCard();
    const npc = body("npc", "Anna");

    await chooseDoseTarget(message.id, "npc", { npc: async () => npc });

    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toEqual("Anna");
  });

  test("cancelling the pick leaves the card open", async () => {
    const message = await offerCard();

    const result = await chooseDoseTarget(message.id, "canvas", { canvas: async () => null });

    expect(result.cancelled).toBe(true);
    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toBeNull();
  });

  test("without a scene open there is nothing to click, and the GM is told", async () => {
    const message = await offerCard();
    globalThis.canvas = { ready: false };

    const result = await chooseDoseTarget(message.id, "canvas", { canvas: async () => { throw new Error("not reached"); } });

    expect(result.cancelled).toBe(true);
    expect(ui.notifications.warn).toHaveBeenCalledWith("ep2e.actorSheet.warnings.doseNoScene");
  });

  test("a target in a body the drug cannot act on is refused, with the reason", async () => {
    const message = await offerCard();
    const synth = body("npc", "Shell", "synth");

    await chooseDoseTarget(message.id, "npc", { npc: async () => synth });

    expect(ui.notifications.warn).toHaveBeenCalledWith("ep2e.actorSheet.warnings.doseNeedsBiomorph");
    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toBeNull();
  });

  test("a player cannot choose a target", async () => {
    const message = await offerCard();
    game.user.isGM = false;

    const result = await chooseDoseTarget(message.id, "npc", { npc: async () => body("npc", "Anna") });

    expect(result.claimed).toBe(false);
    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toBeNull();
  });
});

describe("the GM's use on selection", () => {
  test("gives the dose to the selected token", async () => {
    const message = await offerCard();
    const goon = body("goon", "Thug");
    globalThis.canvas = { ready: true, tokens: { controlled: [{ actor: goon }] } };

    await requestDoseClaim(message.id, { selection: true });

    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toEqual("Thug");
  });

  test("with nothing selected the GM is told to select a token, and the card stays open", async () => {
    const message = await offerCard();
    globalThis.canvas = { ready: true, tokens: { controlled: [] } };

    await requestDoseClaim(message.id, { selection: true });

    expect(ui.notifications.warn).toHaveBeenCalledWith("ep2e.actorSheet.warnings.doseNoSelection");
    expect(message.getFlag("eclipsephase", "doseOffer").usedBy).toBeNull();
  });
});

describe("the searchable list", () => {
  test.each([[{ selection: "a1" }, "a1"], [{ selection: "" }, null], [{ cancelled: true }, null]])(
    "the dialog answering %p gives %p", async (answer, expected) => {
      seedDialogs(answer);
      expect(await selectFromSearchableList([{ id: "a1", label: "Anna" }], "h", "c")).toEqual(expected);
    });
});

describe("the GM-only card controls", () => {
  /**
   * A rendered card stand-in holding two GM-only controls.
   * @returns {Object} The stand-in and its controls
   */
  function card() {
    const controls = [0, 1].map(() => ({ classList: new Set() }));
    const playerControl = { classList: new Set() };
    const html = {
      querySelector: () => null,
      querySelectorAll: selector => ({ ".gmOnlyControl": controls, ".playerOnlyControl": [playerControl] })[selector] ?? []
    };
    return { controls, playerControl, html };
  }

  test("are hidden from players, every one of them", async () => {
    const { controls, html } = card();
    game.user.isGM = false;

    await GMvision(html);

    expect(controls.every(control => control.classList.has("noShow"))).toBe(true);
  });

  test("stay visible for the GM, who in turn does not see the player's own button", async () => {
    const { controls, playerControl, html } = card();

    await GMvision(html);

    expect(controls.some(control => control.classList.has("noShow"))).toBe(false);
    expect(playerControl.classList.has("noShow")).toBe(true);
  });
});
