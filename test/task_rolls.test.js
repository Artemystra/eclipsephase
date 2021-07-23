import { TaskRoll, TaskRollModifier } from '../module/dice.js'

const faker = require('faker')

describe('Task Rolls', () => {
  test('constructor', () => {
    let name = 'some task name'
    let value = 56
    let tr = new TaskRoll(name, value)

    expect(tr.taskName).toEqual(name)
    expect(tr.baseValue).toEqual(value)
  })
})


describe('Task roll modifiers', () => {
  test('constructor', () => {
    let text = 'some descriptive text'
    let value = 2
    let type = 'mult'

    let mod = new TaskRollModifier(text, value, type)

    expect(mod.text).toEqual(text)
    expect(mod.value).toEqual(value)
    expect(mod.type).toEqual(type)

  })

  test('constructor default values', () => {
    let text = 'some descriptive text'
    let value = 20

    let mod = new TaskRollModifier(text, value)

    expect(mod.type).toEqual('add')
  })
})
