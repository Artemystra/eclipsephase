import { TaskRoll, TASK_RESULT_TEXT, HOMEBREW_TASK_RESULT_TEXT, TASK_RESULT, rollCalc } from "../../module/rolls/dice.js";
import { outcomeAlternatives } from "../../module/rolls/pools.js";
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

describe("mitigating a failure with a pool point", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); });

  const pool = () => ({ skillPoolValue: 3, flexPoolValue: 0 });

  test("stores the result one tier better than rolled, the one its text names", async () => {
    const rolled = rollCalc(60, 5);
    const result = await outcomeAlternatives({ rollResult: 60, targetNumber: 5, resultClass: "fail" }, pool(), {});

    expect(result.options.mitigate).toBe(true);
    expect(result.result).toBe(rolled + 1);
    expect(result.resultText).toEqual(TASK_RESULT_TEXT[result.result].text);
  });

  test("stores a critical failure it softens as the worst ordinary failure", async () => {
    const result = await outcomeAlternatives({ rollResult: 77, targetNumber: 50, resultClass: "fail" }, pool(), {});

    expect(result.options.mitigate).toBe(true);
    expect(result.result).toBe(TASK_RESULT.FAILURE_TWO);
    expect(result.resultText).toEqual(TASK_RESULT_TEXT[TASK_RESULT.FAILURE_TWO].text);
  });
});
