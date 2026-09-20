import { usePoolFromChat } from "../../module/rolls/pools.js";
import { buildRollContext } from "../../module/common/general-sheet-functions.js";
import { makeActor, resetWorld } from "../setup/factories.js";

/**
 * A stand-in for a clicked chat button.
 * @param {Object} dataset - The button's data attributes
 * @param {String} [messageId] - The id of the message the button sits in
 * @returns {Object} An object shaped like the click data the handler receives
 */
function clickOn(dataset, messageId) {
  return {
    currentTarget: {
      dataset,
      closest: selector => (selector === "[data-message-id]" && messageId ? { dataset: { messageId } } : null)
    }
  };
}

/**
 * Builds an actor with a usable Vigor pool and the roll context of a failed skill roll.
 * @param {Object} [overrides] - Fields merged into the stored context
 * @returns {Object} The actor, the stored context and the origin message
 */
function setUpRescue(overrides = {}) {
  const actor = makeActor({
    type: "character",
    name: "Pool User",
    system: { aptitudes: { ref: { value: 15 } }, pools: { vigor: { value: 4 } }, skillsVig: { guns: { value: 40 } } }
  });

  const context = {
    ...buildRollContext({
      rolledFrom: "skill",
      skillKey: "guns",
      rollMode: "blindroll",
      pools: { skillPoolValue: 4, flexPoolValue: 0, updatePoolPath: "system.pools.vigor.value", updateFlexPath: "", poolType: "ep2e.skills.pool.vigor" },
      alternatives: { options: { swap: true }, result: 4, value: 71, originalResult: 2, resultClass: "success", resultText: "ep2e.roll.successType.superiorSuccess" }
    }, actor, {}, undefined),
    ...overrides
  };

  const message = { id: "origin1", blind: true, whisper: ["gm1"], flags: { eclipsephase: { roll: context } } };
  game.messages.set(message.id, message);
  return { actor, context, message };
}

describe("usePoolFromChat", () => {
  beforeEach(() => resetWorld());

  test("spends a pool point and announces it", async () => {
    const { actor } = setUpRescue();

    await usePoolFromChat(clickOn({ usepool: "pool" }, "origin1"));

    expect(actor.system.pools.vigor.value).toEqual(3);
    expect(global.__ep.createdMessages).toHaveLength(1);
  });

  test("the announcement inherits blind and whisper from the originating card", async () => {
    setUpRescue();

    await usePoolFromChat(clickOn({ usepool: "pool" }, "origin1"));

    const announcement = global.__ep.createdMessages[0];
    expect(announcement.blind).toBe(true);
    expect(announcement.whisper).toEqual(["gm1"]);
  });

  test("renders the swap wording of the stored alternative", async () => {
    setUpRescue();

    await usePoolFromChat(clickOn({ usepool: "pool" }, "origin1"));

    const announcement = global.__ep.createdMessages[0];
    expect(announcement.flavor).toContain("ep2e.roll.announce.poolUsage.swappedTo");
    expect(announcement.flavor).toContain("71");
  });

  test("spends the flex pool when the flex button is the one clicked", async () => {
    const actor = makeActor({
      type: "character",
      name: "Flex User",
      system: { aptitudes: { ref: { value: 15 } }, pools: { flex: { value: 2 } } }
    });
    const context = buildRollContext({
      rolledFrom: "skill",
      pools: { skillPoolValue: 0, flexPoolValue: 2, updatePoolPath: "", updateFlexPath: "system.pools.flex.value", poolType: "" },
      alternatives: { options: { swap: true }, result: 4, value: 71, originalResult: 2, resultClass: "success", resultText: "x" }
    }, actor, {}, undefined);
    game.messages.set("origin2", { id: "origin2", blind: false, whisper: [], flags: { eclipsephase: { roll: context } } });

    await usePoolFromChat(clickOn({ usepool: "flex" }, "origin2"));

    expect(actor.system.pools.flex.value).toEqual(1);
  });

  test("refuses to spend a pool that is already empty", async () => {
    const actor = makeActor({
      type: "character",
      name: "Empty",
      system: { aptitudes: { ref: { value: 15 } }, pools: { vigor: { value: 0 } } }
    });
    const context = buildRollContext({
      rolledFrom: "skill",
      pools: { skillPoolValue: 0, flexPoolValue: 0, updatePoolPath: "system.pools.vigor.value", updateFlexPath: "", poolType: "ep2e.skills.pool.vigor" },
      alternatives: { options: { swap: true }, result: 4, value: 71, originalResult: 2, resultClass: "success", resultText: "x" }
    }, actor, {}, undefined);
    game.messages.set("origin3", { id: "origin3", blind: false, whisper: [], flags: { eclipsephase: { roll: context } } });

    await usePoolFromChat(clickOn({ usepool: "pool" }, "origin3"));

    expect(actor.system.pools.vigor.value).toEqual(0);
    expect(global.__ep.createdMessages[0].content).toContain("ep2e.roll.announce.poolUsage.notEnoughPool");
  });

  test("works from a card that predates the stored context", async () => {
    const actor = makeActor({
      type: "character",
      name: "Legacy Card",
      system: { aptitudes: { ref: { value: 15 } }, pools: { vigor: { value: 4 } } }
    });
    game.messages.set("origin4", { id: "origin4", blind: false, whisper: [], flags: {} });

    await usePoolFromChat(clickOn({
      usepool: "pool",
      actorid: actor.uuid,
      rolledfrom: "skill",
      usagetype: "swapped",
      pooltype: "ep2e.skills.pool.vigor",
      updatepoolpath: "system.pools.vigor.value",
      skillpoolvalue: "4",
      newresult: "4",
      newvalue: "71",
      resulttext: "ep2e.roll.successType.superiorSuccess",
      rollmode: "publicroll"
    }, "origin4"));

    expect(actor.system.pools.vigor.value).toEqual(3);
    expect(global.__ep.createdMessages[0].flavor).toContain("71");
  });
});
