import * as dice from '../module/dice.js'
import * as help from './helpers'

describe('Task Rolls', () => {
  test('constructor', () => {
    let name = 'some task name'
    let value = 56
    let tr = new dice.TaskRoll(name, value)

    expect(tr.taskName).toEqual(name)
    expect(tr.baseValue).toEqual(value)
  })

  describe('totalTargetNumber', () => {
    test('with no mods', () => {
      const targetNumber = help.randomSkillValue()
      let roll = new dice.TaskRoll('some task name', targetNumber)

      expect(roll.totalTargetNumber).toEqual(targetNumber)
    })

    test('with mods', () => {
      const targetNumber = help.randomSkillValue()
      let roll = new dice.TaskRoll('some task name', targetNumber)
      let mods = [
        help.randomRollMod(),
        help.randomRollMod(),
        help.randomRollMod()
      ]
      let totalMods = mods[0] + mods[1] + mods[2]

      for(let mod of mods)
        roll.addModifier(new dice.TaskRollModifier('modifier', mod))

      expect(roll.totalTargetNumber).toEqual(targetNumber + totalMods)
    })
  })

  describe('_calculateResult', () => {
    describe('success results', () => {
      let roll

      beforeEach(() => {
        roll = new dice.TaskRoll('some task name', 70)
      })

      test('critical success', () => {
        roll._rollValue = 33
        roll._calculateResult()
        expect(roll.result).toEqual(dice.TASK_RESULT.CRITICAL_SUCCESS)
      })

      test('two degrees of success', () => {
        roll._rollValue = 67
        roll._calculateResult()
        expect(roll.result).toEqual(dice.TASK_RESULT.SUCCESS_TWO)
      })

      test('one degree of success', () => {
        roll._rollValue = 41
        roll._calculateResult()
        expect(roll.result).toEqual(dice.TASK_RESULT.SUCCESS_ONE)
      })

      test('regular  success', () => {
        roll._rollValue = 29 
        roll._calculateResult()
        expect(roll.result).toEqual(dice.TASK_RESULT.SUCCESS)
      })
    })

    describe('falure results', () => {
      let roll

      beforeEach(() => {
        roll = new dice.TaskRoll('some task name', 15)
      })

      test('critical falure', () => {
        roll._rollValue = 55
        roll._calculateResult()
        expect(roll.result).toEqual(dice.TASK_RESULT.CRITICAL_FAILURE)
      })

      test('two degrees of falure', () => {
        roll._rollValue = 29
        roll._calculateResult()
        expect(roll.result).toEqual(dice.TASK_RESULT.FAILURE_TWO)
      })

      test('one degree of falure', () => {
        roll._rollValue = 41
        roll._calculateResult()
        expect(roll.result).toEqual(dice.TASK_RESULT.FAILURE_ONE)
      })

      test('regular  falure', () => {
        roll._rollValue = 29
        roll._calculateResult()
        expect(roll.result).toEqual(dice.TASK_RESULT.FAILURE_TWO)
      })
    })
  })
})


describe('Task roll modifiers', () => {
  test('constructor', () => {
    let text = 'some descriptive text'
    let value = 2

    let mod = new dice.TaskRollModifier(text, value)

    expect(mod.text).toEqual(text)
    expect(mod.value).toEqual(value)

  })

  describe('Helpers', () => {
    describe('formattedValue', () => {
      test('positive value', () => {
        let trm = new dice.TaskRollModifier('some modifier', 10)
        expect(trm.formattedValue).toEqual('+10')
      })

      test('negative value', () => {
        let trm = new dice.TaskRollModifier('some modifier', -10)
        expect(trm.formattedValue).toEqual('-10')
      })

      test('zero value', () => {
        let trm = new dice.TaskRollModifier('some modifier', 0)
        expect(trm.formattedValue).toEqual('0')
      })
    })
  })
})


