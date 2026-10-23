import { RollCheck, TASK_RESULT } from "../../module/rolls/dice.js";
import { usePoolFromChat } from "../../module/rolls/pools.js";
import { spentOrOriginalResult } from "../../module/rolls/cards.js";
import { makeActor, resetWorld, seedRolls } from "../setup/factories.js";

const { createdMessages } = global.__ep;
const SKIP_DIALOG = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } };

/**
 * A character with two points of Vigor who rolls Infiltrate against 55.
 * @returns {Actor} The roller
 */
function roller() {
  return makeActor({
    type: "character",
    name: "Roller",
    system: { aptitudes: { ref: { value: 15 } }, skillsVig: { infiltrate: { value: 40 } }, pools: { vigor: { value: 2 } } }
  });
}

/**
 * Rolls Infiltrate with the d100 showing the given value.
 * @param {Actor} actor - The roller
 * @param {Number} die - The d100 result
 * @returns {Promise<Object>} The roll card
 */
async function rolled(actor, die) {
  seedRolls([die]);
  await RollCheck({ name: "Infiltrate", key: "infiltrate", type: "skill", rollvalue: 55, pooltype: "Vigor" }, actor.system, actor, SKIP_DIALOG, null, "skill");
  return createdMessages.at(-1);
}

/**
 * Clicks a roll card's pool button.
 * @param {Object} card - The roll card
 * @returns {Promise<void>} Resolves once the point is spent
 */
function spendPool(card) {
  return usePoolFromChat({ currentTarget: { dataset: { usepool: "pool" }, closest: selector => (selector === "[data-message-id]" ? { dataset: { messageId: card.id } } : null) } });
}

beforeEach(() => resetWorld());

describe("spending a pool point from a roll card", () => {
  test("a swap redraws the same card: the controls give way to who spent what, and the die shows the swapped value", async () => {
    const actor = roller();
    const card = await rolled(actor, 91);
    const posted = createdMessages.length;

    await spendPool(card);

    expect(createdMessages).toHaveLength(posted);
    expect(card.content).toContain("ep2e.chat.poolSpent.swapped");
    expect(card.content).toContain("Roller");
    expect(card.getFlag("eclipsephase", "taskCard").data).toMatchObject({ total: 19, rollResult: 19, resultClass: "success" });
    expect(card.content).not.toContain("data-usepool");
    expect(actor.system.pools.vigor.value).toBe(1);
  });

  test("an upgrade raises the result and leaves the die as rolled", async () => {
    const actor = roller();
    const card = await rolled(actor, 10);

    await spendPool(card);

    expect(card.content).toContain("ep2e.chat.poolSpent.upgraded");
    expect(card.getFlag("eclipsephase", "taskCard").data.total).toBe(10);
  });

  test("a card a point was spent on spends nothing more", async () => {
    const actor = roller();
    const card = await rolled(actor, 91);
    await spendPool(card);

    await spendPool(card);

    expect(actor.system.pools.vigor.value).toBe(1);
  });

  test("modules still hear of the spend, with the new result", async () => {
    const card = await rolled(roller(), 91);
    const heard = [];
    Hooks.on("eclipsephase.poolResult", ({ newResult }) => heard.push(newResult));

    await spendPool(card);

    expect(heard).toEqual([TASK_RESULT.SUCCESS]);
  });

  test("the card's buttons go by the result the point turned the roll into", () => {
    expect(spentOrOriginalResult({ alternatives: { spent: true, result: 4, originalResult: 1 } })).toBe(4);
    expect(spentOrOriginalResult({ alternatives: { result: 4, originalResult: 1 } })).toBe(1);
  });
});
