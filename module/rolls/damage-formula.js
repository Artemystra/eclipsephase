// The one place a damage or stress formula is put together. Weapons, psi sleights and drugs differ
// only in the parts they bring - their base dice, extra dice from a firing mode or a melee bonus, a
// push that multiplies, a trait that halves - not in how those parts combine with the attack's
// result. Free of imports, so anything can use it.

/**
 * Success-tier bonus and critical-success doubling as formula fragments: +1d6 or +2d6 for one or
 * two superior successes, the whole formula doubled on a critical.
 * @param {Number} rollResult - The task result tier
 * @returns {Object} successModifier and criticalModifier roll formula fragments
 */
export function applySuccessTierBonus(rollResult) {
  let successModifier = "";
  let criticalModifier = "";

  if (rollResult === 4) {
    successModifier = "+1d6";
  }
  else if (rollResult === 5) {
    successModifier = "+2d6";
  }
  else if (rollResult === 7 || rollResult === 9) {
    criticalModifier = "2*(";
    successModifier = ")";
  }

  return { successModifier, criticalModifier };
}

/**
 * A damage formula from its parts and the result of the attack that dealt it: the base dice and
 * any extras, the success tier's bonus, a critical doubling it all, a multiplier such as a push,
 * and a halving such as dvHalved or defensive ware - in that order.
 * @param {Object} spec - base (e.g. "1d10+1d6+2"), extras (fragments appended to it, e.g.
 *   ["+1d10"]), multiplier (1 for none), halved
 * @param {Number} [rollResult] - The attack's result tier; none for damage that follows no attack
 * @returns {String} The formula
 */
export function damageFormula({ base, extras = [], multiplier = 1, halved = false }, rollResult) {
  const { successModifier, criticalModifier } = applySuccessTierBonus(rollResult);
  let formula = `${criticalModifier}${base}${extras.join("")}${successModifier}`;
  if (multiplier > 1) formula = `${multiplier}*(${formula})`;
  if (halved) formula = `ceil((${formula})/2)`;
  return formula;
}
