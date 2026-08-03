import * as psi from '../module/rolls/psi.js'

describe('resolvePhysicalDamageFormula', () => {
  test('pushed and virus result of 1 -> 2d6', () => {
    expect(psi.resolvePhysicalDamageFormula(true, true)).toEqual('2d6')
  })

  test('not pushed and virus result of 1 -> 1d6', () => {
    expect(psi.resolvePhysicalDamageFormula(false, true)).toEqual('1d6')
  })

  test('pushed and virus result not 1 -> 1d6', () => {
    expect(psi.resolvePhysicalDamageFormula(true, false)).toEqual('1d6')
  })

  test('not pushed and virus result not 1 -> no damage', () => {
    expect(psi.resolvePhysicalDamageFormula(false, false)).toBeNull()
  })
})
