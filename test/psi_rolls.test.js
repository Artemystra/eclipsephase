import * as psi from '../module/rolls/psi.js'

describe('resolvePhysicalDamageFormula', () => {
  test('manually pushed and virus result of 1 -> 2d6', () => {
    expect(psi.resolvePhysicalDamageFormula(true, false, true)).toEqual('2d6')
  })

  test('not pushed and virus result of 1 -> 1d6', () => {
    expect(psi.resolvePhysicalDamageFormula(false, false, true)).toEqual('1d6')
  })

  test('manually pushed and virus result not 1 -> 1d6', () => {
    expect(psi.resolvePhysicalDamageFormula(true, false, false)).toEqual('1d6')
  })

  test('not pushed and virus result not 1 -> no damage', () => {
    expect(psi.resolvePhysicalDamageFormula(false, false, false)).toBeNull()
  })

  test('gamma auto-pushed and virus result of 1 -> 2d6', () => {
    expect(psi.resolvePhysicalDamageFormula(false, true, true)).toEqual('2d6')
  })

  test('gamma auto-pushed and virus result not 1 -> no damage', () => {
    expect(psi.resolvePhysicalDamageFormula(false, true, false)).toBeNull()
  })

  test('manually pushed and gamma auto-pushed and virus result of 1 -> 2d6', () => {
    expect(psi.resolvePhysicalDamageFormula(true, true, true)).toEqual('2d6')
  })
})
