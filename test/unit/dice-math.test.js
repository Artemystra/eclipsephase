import { rollCalc, TASK_RESULT, TaskRoll, TaskRollModifier, initiativeRollClass, combatantClass } from "../../module/rolls/dice.js";

describe("rollCalc", () => {
  describe("at or below the target number", () => {
    const target = 100;
    test.each([
      [11, TASK_RESULT.CRITICAL_SUCCESS],
      [22, TASK_RESULT.CRITICAL_SUCCESS],
      [33, TASK_RESULT.CRITICAL_SUCCESS],
      [66, TASK_RESULT.CRITICAL_SUCCESS],
      [88, TASK_RESULT.CRITICAL_SUCCESS],
      [99, TASK_RESULT.AUTOFAIL],
      [100, TASK_RESULT.AUTOSUCCESS],
      [67, TASK_RESULT.SUCCESS_TWO],
      [98, TASK_RESULT.SUCCESS_TWO],
      [34, TASK_RESULT.SUCCESS_ONE],
      [65, TASK_RESULT.SUCCESS_ONE],
      [1, TASK_RESULT.SUCCESS],
      [32, TASK_RESULT.SUCCESS]
    ])("a roll of %i is result %i", (value, expected) => {
      expect(rollCalc(value, target)).toEqual(expected);
    });
  });

  describe("above the target number", () => {
    const target = 10;
    test.each([
      [22, TASK_RESULT.CRITICAL_FAILURE],
      [44, TASK_RESULT.CRITICAL_FAILURE],
      [99, TASK_RESULT.AUTOFAIL],
      [100, TASK_RESULT.AUTOSUCCESS],
      [32, TASK_RESULT.FAILURE_TWO],
      [12, TASK_RESULT.FAILURE_TWO],
      [34, TASK_RESULT.FAILURE_ONE],
      [65, TASK_RESULT.FAILURE_ONE],
      [67, TASK_RESULT.FAILURE],
      [98, TASK_RESULT.FAILURE]
    ])("a roll of %i is result %i", (value, expected) => {
      expect(rollCalc(value, target)).toEqual(expected);
    });
  });

  test("a roll equal to the target still succeeds", () => {
    expect(rollCalc(50, 50)).toEqual(TASK_RESULT.SUCCESS_ONE);
  });

  test("a roll of 100 reports an auto success even against a target of 1", () => {
    expect(rollCalc(100, 1)).toEqual(TASK_RESULT.AUTOSUCCESS);
  });

  test("a roll of 99 reports an auto failure even against a target of 100", () => {
    expect(rollCalc(99, 100)).toEqual(TASK_RESULT.AUTOFAIL);
  });
});

describe("TaskRoll", () => {
  test("keeps its name and base value", () => {
    const task = new TaskRoll("Guns", 55);
    expect(task.taskName).toEqual("Guns");
    expect(task.baseValue).toEqual(55);
  });

  test("halves the base value for a ranged fray", () => {
    expect(new TaskRoll("Fray", 50, true).baseValue).toEqual(25);
  });

  test("treats a missing base value as zero", () => {
    expect(new TaskRoll("Nothing", null).baseValue).toEqual(0);
  });

  test("sums stacked modifiers into the target number", () => {
    const task = new TaskRoll("Guns", 50);
    task.addModifier(new TaskRollModifier("range", -10));
    task.addModifier(new TaskRollModifier("aim", 20));
    task.addModifier(new TaskRollModifier("wound", -30));
    expect(task.modifierValue).toEqual(-20);
    expect(task.totalTargetNumber).toEqual(30);
  });

  test("has no modifier value without modifiers", () => {
    const task = new TaskRoll("Guns", 50);
    expect(task.modifierValue).toEqual(0);
    expect(task.totalTargetNumber).toEqual(50);
  });
});

describe("TaskRollModifier", () => {
  test("keeps text, value and comment", () => {
    const modifier = new TaskRollModifier("ep2e.some.key", -10, "note");
    expect(modifier.text).toEqual("ep2e.some.key");
    expect(modifier.value).toEqual(-10);
    expect(modifier.comment).toEqual("note");
  });
});

describe("an initiative roll", () => {
  // Stands in for Foundry's Roll: a d6 showing 1 plus the flat part of the formula.
  class FoundryRoll {
    constructor(formula, data) {
      this.formula = formula;
      this.data = data;
      this._evaluated = false;
    }
    async evaluate() {
      // As Foundry parses "1d6 + -2": the die, a plus and a negative number.
      const flat = Number(this.formula.split("+").pop().trim());
      this.dice = [{ faces: 6, results: [{ result: 1 }] }];
      this.terms = [this.dice[0], { operator: "+" }, { number: flat }];
      this.total = 1 + flat;
      this._evaluated = true;
      return this;
    }
    async render() {
      return "foundry card";
    }
  }

  beforeEach(() => {
    foundry.dice = { Roll: FoundryRoll };
    foundry.documents.Combatant = class {};
  });

  test("its card says what is rolled and shows the result and the dice tray with the flat part", async () => {
    const InitiativeRoll = initiativeRollClass();
    const html = await new InitiativeRoll("1d6 + -2").render();
    expect(html).toContain("ep2e.roll.announce.initiative");
    expect(html).toContain("ep2e.roll.announce.total");
    expect(html).toContain("<strong>-1</strong>");
    expect(html).toContain("dicetray");
    expect(html).toContain('<strong class="eyes">1</strong>');
    expect(html).toMatch(/ep-dice-sign ep-dice-minus">-<\/span><strong class="eyes">2</);
    expect(html).not.toContain("foundry card");
  });

  test("a total of 0 still shows", async () => {
    const InitiativeRoll = initiativeRollClass();
    expect(await new InitiativeRoll("1d6 + -1").render()).toContain("<strong>0</strong>");
  });

  test("a private roll keeps Foundry's hidden card", async () => {
    const InitiativeRoll = initiativeRollClass();
    expect(await new InitiativeRoll("1d6 + 7").render({ isPrivate: true })).toEqual("foundry card");
  });

  test("a combatant rolls it with its actor's data", () => {
    const InitiativeRoll = initiativeRollClass();
    const Combatant = combatantClass(InitiativeRoll);
    const combatant = Object.assign(new Combatant(), {
      actor: { getRollData: () => ({ initiative: { value: 7 } }) },
      _getInitiativeFormula: () => "1d6 + @initiative.value"
    });
    const roll = combatant.getInitiativeRoll();
    expect(roll).toBeInstanceOf(InitiativeRoll);
    expect(roll.formula).toEqual("1d6 + @initiative.value");
    expect(roll.data).toEqual({ initiative: { value: 7 } });
    expect(combatant.getInitiativeRoll("1d6").formula).toEqual("1d6");
  });
});
