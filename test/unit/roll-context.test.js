import { buildRollContext, legacyRollContext, readRollContext } from "../../module/common/general-sheet-functions.js";
import { resetWorld } from "../setup/factories.js";

/**
 * A stand-in for a clicked chat button.
 * @param {Object} dataset - The button's data attributes
 * @param {String} [messageId] - The id of the message the button sits in
 * @returns {Object} An element-like object exposing dataset and closest
 */
function fakeButton(dataset, messageId) {
  return {
    dataset,
    closest: selector => (selector === "[data-message-id]" && messageId ? { dataset: { messageId } } : null)
  };
}

const OUTPUT_DATA = {
  rolledFrom: "rangedWeapon",
  skillKey: "guns",
  rollMode: "blindroll",
  pools: { skillPoolValue: 3, flexPoolValue: 1, updatePoolPath: "system.pools.vigor.value", updateFlexPath: "system.pools.flex.value", poolType: "ep2e.skills.pool.vigor" },
  alternatives: { options: { swap: true, upgrade: false, mitigate: false }, result: 4, value: 71, originalResult: 3, resultClass: "success", resultText: "ep2e.roll.successType.superiorSuccess" }
};

const OPTIONS = { push: false, attackMode: "burst", biomorphTarget: true, touchOnly: false };

const ITEM_DATA = { weaponID: "weapon123", weaponMode: "burst", sleightID: "", damageTarget: "" };

describe("buildRollContext", () => {
  beforeEach(() => resetWorld());

  test("carries the fields the follow-up buttons need", () => {
    const context = buildRollContext(OUTPUT_DATA, { uuid: "Actor.abc" }, OPTIONS, ITEM_DATA);
    expect(context.version).toEqual(1);
    expect(context.actorUuid).toEqual("Actor.abc");
    expect(context.rolledFrom).toEqual("rangedWeapon");
    expect(context.rollType).toEqual("guns");
    expect(context.pool.skillPoolValue).toEqual(3);
    expect(context.alternatives.result).toEqual(4);
    expect(context.options.rollMode).toEqual("blindroll");
    expect(context.item.weaponId).toEqual("weapon123");
  });

  test("derives the usage type from the alternative the roll offers", () => {
    const swap = buildRollContext(OUTPUT_DATA, {}, OPTIONS, ITEM_DATA);
    expect(swap.alternatives.usageType).toEqual("swapped");

    const upgrade = { ...OUTPUT_DATA, alternatives: { ...OUTPUT_DATA.alternatives, options: { swap: false, upgrade: true, mitigate: false } } };
    expect(buildRollContext(upgrade, {}, OPTIONS, ITEM_DATA).alternatives.usageType).toEqual("upgraded");

    const mitigate = { ...OUTPUT_DATA, alternatives: { ...OUTPUT_DATA.alternatives, options: { swap: false, upgrade: false, mitigate: true } } };
    expect(buildRollContext(mitigate, {}, OPTIONS, ITEM_DATA).alternatives.usageType).toEqual("mitigated");
  });

  test("normalises the option flags to real booleans", () => {
    const context = buildRollContext(OUTPUT_DATA, {}, { biomorphTarget: "true", touchOnly: "false" }, ITEM_DATA);
    expect(context.options.biomorphTarget).toBe(true);
    expect(context.options.touchOnly).toBe(false);
  });

  test("survives a roll without alternatives, item or shop payload", () => {
    const context = buildRollContext({ rolledFrom: "skill" }, {}, {}, undefined);
    expect(context.alternatives.usageType).toEqual("");
    expect(context.alternatives.result).toBeNull();
    expect(context.item.weaponId).toEqual("");
    expect(context.shop.burnAmount).toEqual(0);
  });
});

describe("legacyRollContext", () => {
  test("maps a weapon button's data attributes onto the stored shape", () => {
    const context = legacyRollContext({
      actorid: "Actor.abc", userid: "user1", rolledfrom: "rangedWeapon",
      skillpoolvalue: "3", flexpoolvalue: "1", updatepoolpath: "system.pools.vigor.value",
      updateflexpath: "system.pools.flex.value", pooltype: "ep2e.skills.pool.vigor",
      usagetype: "swapped", newresult: "4", newvalue: "71", rollresult: "3",
      resultclass: "success", resulttext: "ep2e.roll.successType.superiorSuccess",
      attackmode: "burst", biomorphtarget: "true", touchonly: "false", rollmode: "blindroll",
      weaponid: "weapon123", weaponmode: "burst"
    });

    const stored = buildRollContext(OUTPUT_DATA, { uuid: "Actor.abc" }, OPTIONS, ITEM_DATA);
    stored.userId = "user1";
    stored.version = 0;
    stored.rollType = "";
    expect(context).toEqual(stored);
  });

  test("reads the sleight id from either attribute the psi buttons use", () => {
    expect(legacyRollContext({ sleightid: "sleight1" }).item.sleightId).toEqual("sleight1");
    expect(legacyRollContext({ itemid: "sleight2" }).item.sleightId).toEqual("sleight2");
  });

  test("treats an empty or literally false push as no push", () => {
    expect(legacyRollContext({ psipush: "" }).options.push).toBe(false);
    expect(legacyRollContext({ psipush: "false" }).options.push).toBe(false);
    expect(legacyRollContext({ psipush: "increasedEffect" }).options.push).toEqual("increasedEffect");
  });

  test("turns missing numbers into null rather than NaN", () => {
    const context = legacyRollContext({});
    expect(context.alternatives.result).toBeNull();
    expect(context.alternatives.originalResult).toBeNull();
    expect(context.pool.skillPoolValue).toEqual(0);
  });
});

describe("readRollContext", () => {
  beforeEach(() => resetWorld());

  test("prefers the context stored on the message", () => {
    const stored = buildRollContext(OUTPUT_DATA, { uuid: "Actor.stored" }, OPTIONS, ITEM_DATA);
    game.messages.set("msg1", { id: "msg1", flags: { eclipsephase: { roll: stored } } });

    const context = readRollContext(fakeButton({ usepool: "pool" }, "msg1"));
    expect(context.actorUuid).toEqual("Actor.stored");
    expect(context.messageId).toEqual("msg1");
  });

  test("falls back to the button's attributes when the message has no context", () => {
    game.messages.set("msg2", { id: "msg2", flags: {} });

    const context = readRollContext(fakeButton({ actorid: "Actor.legacy", rolledfrom: "ccWeapon" }, "msg2"));
    expect(context.actorUuid).toEqual("Actor.legacy");
    expect(context.rolledFrom).toEqual("ccWeapon");
    expect(context.version).toEqual(0);
  });

  test("falls back when the message no longer exists at all", () => {
    const context = readRollContext(fakeButton({ actorid: "Actor.gone" }, "missing"));
    expect(context.actorUuid).toEqual("Actor.gone");
    expect(context.messageId).toEqual("missing");
  });
});
