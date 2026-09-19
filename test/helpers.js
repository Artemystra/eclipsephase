/**
 * A random skill value within the range the system allows.
 * @param {Number} [min] - Lower bound, inclusive
 * @returns {Number} An integer between min and 100
 */
export function randomSkillValue(min = 0) {
  return min + Math.floor(Math.random() * (100 - min + 1));
}

/**
 * A random roll modifier within the range the dialogs offer.
 * @returns {Number} An integer between -30 and 30
 */
export function randomRollMod() {
  return -30 + Math.floor(Math.random() * 61);
}
