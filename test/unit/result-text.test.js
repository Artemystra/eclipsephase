import { TaskRoll, TASK_RESULT_TEXT, HOMEBREW_TASK_RESULT_TEXT, TASK_RESULT, rollCalc } from "../../module/rolls/dice.js";
import { outcomeAlternatives, nextResultAt } from "../../module/rolls/pools.js";
import { registerTaskResultText, resetRegistry } from "../../module/api/registry.js";
import { resetWorld } from "../setup/factories.js";

/**
 * A TaskRoll whose die value is fixed, so its result and text can be checked deterministically.
 * @param {Number} dieValue - The value the roll should have landed on
 * @param {Number} target - The target number to compare it against
 * @returns {TaskRoll} A rolled task
 */
function rolledTask(dieValue, target) {
  const task = new TaskRoll("Spike", target);
  task._rollValue = dieValue;
  task._calculateResult();
  return task;
}

describe("outputData's result text", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); });

  test("uses the RAW table while nothing is registered", () => {
    const task = rolledTask(50, 60);
    const data = task.outputData({}, {}, {}, {}, "skill", {});
    expect(data.resultText).toEqual(TASK_RESULT_TEXT[task.result].text);
  });

  test("uses a registered table once one is registered", () => {
    registerTaskResultText(HOMEBREW_TASK_RESULT_TEXT);
    const task = rolledTask(50, 60);
    const data = task.outputData({}, {}, {}, {}, "skill", {});
    expect(data.resultText).toEqual(HOMEBREW_TASK_RESULT_TEXT[task.result].text);
    expect(data.resultText).not.toEqual(TASK_RESULT_TEXT[task.result].text);
  });

  test("no longer reads brewStatus off systemOptions at all", () => {
    const task = rolledTask(50, 60);
    const withoutBrewStatus = task.outputData({}, {}, {}, {}, "skill", {});
    const withBrewStatusTrue = task.outputData({}, {}, {}, {}, "skill", { brewStatus: true });
    expect(withoutBrewStatus.resultText).toEqual(withBrewStatusTrue.resultText);
  });
});

describe("outcomeAlternatives' result text", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); });

  const pool = () => ({ skillPoolValue: 3, flexPoolValue: 0 });
  const outputData = () => ({ rollResult: 71, targetNumber: 55, resultClass: "success" });

  test("uses the RAW table while nothing is registered", async () => {
    const result = await outcomeAlternatives(outputData(), pool(), {});
    expect(TASK_RESULT_TEXT[result.result].text).toEqual(result.resultText);
  });

  test("uses a registered table once one is registered", async () => {
    registerTaskResultText(HOMEBREW_TASK_RESULT_TEXT);
    const result = await outcomeAlternatives(outputData(), pool(), {});
    expect(HOMEBREW_TASK_RESULT_TEXT[result.result].text).toEqual(result.resultText);
  });
});

describe("what a pool point can make of a roll afterwards (Core p.34)", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); });

  const pool = () => ({ skillPoolValue: 3, flexPoolValue: 0 });
  const after = (die, target, resultClass, actor = null) => outcomeAlternatives({ rollResult: die, targetNumber: target, resultClass }, pool(), {}, actor);

  test("a superior failure is not improved: there is nothing to offer when a flip-flop does not help", async () => {
    const result = await after(60, 5, "fail");

    expect(result.options.available).toBe(false);
    expect(result.alternative).toBeNull();
  });

  test("a critical failure is downgraded to the failure its die gives by the 33/66 rule", async () => {
    const tiers = [];
    for (const die of [22, 44, 77]) tiers.push((await after(die, 10, "fail")).result);

    expect(tiers).toEqual([TASK_RESULT.FAILURE_TWO, TASK_RESULT.FAILURE_ONE, TASK_RESULT.FAILURE]);
    expect((await after(77, 10, "fail")).usageType).toBe("mitigated");
  });

  test("a flip-flop that improves the result is suggested alone: an upgrade never beats it", async () => {
    const result = await after(14, 60, "success");

    expect([result.usageType, result.value, result.label]).toEqual(["swapped", 41, "ep2e.chat.modify.swap"]);
    expect(result.alternative).toBeNull();
  });

  test("an upgrade is suggested where a flip-flop gives the same result, with the higher die offered instead", async () => {
    const result = await after(12, 60, "success");

    expect([result.usageType, result.result]).toEqual(["upgraded", TASK_RESULT.SUCCESS_ONE]);
    expect(result.alternative).toMatchObject({ usageType: "swapped", value: 21, label: "ep2e.chat.modify.swap" });
  });

  test("a critical success is never upgraded", async () => {
    const result = await after(33, 60, "success");

    expect(result.options.upgrade).toBe(false);
    expect(result.alternative).toBeNull();
  });

  test("the choice between an upgrade and a higher die is explained with the card's dice", async () => {
    const result = await after(13, 60, "success");

    expect(result.explain).toEqual({
      title: "ep2e.chat.modify.infoTitle", copy: "ep2e.chat.modify.explain.choice", die: 13, swap: 31, threshold: 34,
      rolled: TASK_RESULT_TEXT[TASK_RESULT.SUCCESS].text, upgraded: TASK_RESULT_TEXT[TASK_RESULT.SUCCESS_ONE].text,
      swapped: TASK_RESULT_TEXT[TASK_RESULT.SUCCESS].text, recommended: "ep2e.chat.modify.upgrade"
    });
  });

  test("a flip-flop offered alone says why: a better result and a higher roll, a failure turned, or the higher roll only", async () => {
    const copy = async (die, target, resultClass) => (await after(die, target, resultClass)).explain?.copy;

    expect(await copy(14, 60, "success")).toBe("ep2e.chat.modify.explain.swapLevel");
    expect(await copy(71, 60, "fail")).toBe("ep2e.chat.modify.explain.swapFailure");
    expect(await copy(78, 90, "success")).toBe("ep2e.chat.modify.explain.swapHigher");
    expect((await after(78, 90, "success")).options.upgrade).toBe(false);
  });

  test("an upgrade offered alone says why there is no flip-flop: a lower roll, a failure, or Bad Luck", async () => {
    const unlucky = { system: { additionalSystems: { noFlipFlop: true } } };
    const lower = await after(31, 60, "success");

    expect(lower.explain).toMatchObject({
      title: "ep2e.chat.modify.infoTitleUpgrade", copy: "ep2e.chat.modify.explain.upgradeSwapLower", die: 31, swap: 13,
      rolled: TASK_RESULT_TEXT[TASK_RESULT.SUCCESS].text, upgraded: TASK_RESULT_TEXT[TASK_RESULT.SUCCESS_ONE].text
    });
    expect((await after(19, 41, "success")).explain.copy).toBe("ep2e.chat.modify.explain.upgradeSwapFails");
    expect((await after(14, 60, "success", unlucky)).explain.copy).toBe("ep2e.chat.modify.explain.upgradeBadLuck");
  });

  test("a downgrade offered alone needs no explanation", async () => {
    expect((await after(77, 10, "fail")).explain).toBeNull();
  });

  test("the next better success starts at the first die above that reaches it, criticals left out", () => {
    expect(nextResultAt(13, 60)).toBe(34);
    expect(nextResultAt(30, 60)).toBe(34);
    expect(nextResultAt(40, 80)).toBe(67);
    expect(nextResultAt(40, 50)).toBeNull();
  });

  test("Bad Luck rules out every flip-flop", async () => {
    const unlucky = { system: { additionalSystems: { noFlipFlop: true } } };

    expect((await after(14, 60, "success", unlucky)).usageType).toBe("upgraded");
    expect((await after(14, 60, "success", unlucky)).alternative).toBeNull();
    expect((await after(71, 60, "fail", unlucky)).options.available).toBe(false);
  });
});
