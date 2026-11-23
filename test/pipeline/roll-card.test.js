import { RollCheck, TASK_RESULT } from "../../module/rolls/dice.js";
import { usePoolFromChat } from "../../module/rolls/pools.js";
import { spentOrOriginalResult } from "../../module/rolls/cards.js";
import { moreInfo } from "../../module/common/general-sheet-functions.js";
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
 * Clicks a roll card's pool button, with the suggested option or the one offered instead shown.
 * @param {Object} card - The roll card
 * @param {String} [choice] - "suggested" or "alternative"
 * @returns {Promise<void>} Resolves once the point is spent
 */
function spendPool(card, choice = "suggested") {
  const found = { "[data-message-id]": { dataset: { messageId: card.id } }, ".ep-modify-result": { dataset: { choice } } };
  return usePoolFromChat({ currentTarget: { dataset: { usepool: "pool" }, closest: selector => found[selector] ?? null } });
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

describe("Modify Result on a roll card", () => {
  test("an upgrade comes with a toggle to swap for the higher die instead, explained in a dialog", async () => {
    const card = await rolled(roller(), 13);

    expect(card.content).toContain("ep2e.chat.buttonLabel.modifyResult");
    expect(card.content).toMatch(/data-for-choice="suggested">ep2e\.chat\.modify\.upgrade</);
    expect(card.content).toMatch(/data-for-choice="alternative">ep2e\.chat\.modify\.swap</);
    expect(card.content).toContain('data-rolledfrom="modifyInfo"');
    expect(card.content).toContain('data-copy="ep2e.chat.modify.explain.choice"');
    expect(card.content).toMatch(/data-die="13" data-swap="31" data-threshold="34"/);
  });

  test("a flip-flop offered alone names it without a toggle, with an info icon and its invisible twin", async () => {
    const card = await rolled(roller(), 14);

    expect(card.content).toContain("ep-modify-only");
    expect(card.content).not.toContain("ep-modify-option");
    expect(card.content).toContain('data-copy="ep2e.chat.modify.explain.swapLevel"');
    expect(card.content).toContain("ep-modify-spacer");
  });

  test("an upgrade offered alone has an info icon that says why there is no flip-flop", async () => {
    const card = await rolled(roller(), 31);

    expect(card.content).toContain("ep-modify-only");
    expect(card.content).toContain('data-copy="ep2e.chat.modify.explain.upgradeSwapLower"');
    expect(card.content).toContain("ep-modify-spacer");
  });

  test("the info dialog fills its copy with the card's dice and lets nothing else through unescaped", async () => {
    const wait = jest.spyOn(foundry.applications.api.DialogV2, "wait").mockResolvedValue({ cancelled: true });
    const dataset = {
      rolledfrom: "modifyInfo", title: "ep2e.chat.modify.infoTitle", copy: "ep2e.chat.modify.explain.choice",
      die: "13", swap: "31", threshold: "<b>34</b>", rolled: "<img src=x onerror=alert(1)>",
      upgraded: "ep2e.roll.successType.superiorSuccess", swapped: "ep2e.roll.successType.success", recommended: "ep2e.chat.modify.upgrade"
    };

    await moreInfo({ currentTarget: { dataset } });

    const content = wait.mock.calls[0][0].content;
    wait.mockRestore();
    expect(content).toContain("ep2e.chat.modify.explain.choice {");
    expect(content).toMatch(/"rolled":"","threshold":"","swap":31,"die":13/);
    expect(content).not.toContain("onerror");
  });

  test("spending with the other option picked takes that one, and the card keeps it as the result", async () => {
    const actor = roller();
    const card = await rolled(actor, 13);

    await spendPool(card, "alternative");

    expect(card.content).toContain("ep2e.chat.poolSpent.swapped");
    expect(card.getFlag("eclipsephase", "taskCard").data.rollResult).toBe(31);
    expect(spentOrOriginalResult(card.getFlag("eclipsephase", "roll"))).toBe(TASK_RESULT.SUCCESS);
  });

  test("spending with the suggestion picked upgrades and leaves the die", async () => {
    const card = await rolled(roller(), 13);

    await spendPool(card);

    expect(card.content).toContain("ep2e.chat.poolSpent.upgraded");
    expect(card.getFlag("eclipsephase", "taskCard").data.rollResult).toBe(13);
  });
});
