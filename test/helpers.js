
import * as faker  from 'faker'

export function randomSkillValue(min = 0) {
  return faker.datatype.number({min: min, max: 100})
}


export function randomRollMod() {
  return faker.datatype.number({min: -30, max: 30})
}

