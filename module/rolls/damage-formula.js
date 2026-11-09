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

// An extra that takes dice away, such as "-1d10" beyond range: the DV loses that many dice.
const DROPPED_DICE = /^\s*-\s*(\d*)\s*d\s*(\d+)\s*$/i;

/**
 * Takes dice of one kind out of a formula, from its first terms of that kind on: "-1d10 DV" means
 * a die less (Core p.207), not a die rolled and subtracted. A formula keeps no fewer than none.
 * @param {String} formula - e.g. "2d10+6"
 * @param {Number} faces - The kind of die, e.g. 10
 * @param {Number} count - How many to take away
 * @returns {String} The formula without them, e.g. "1d10+6"
 */
export function dropDice(formula, faces, count) {
  let left = count;
  const dropped = String(formula).replace(new RegExp(`(^|[+])\\s*(\\d*)d${faces}(?!\\d)`, "gi"), (match, lead, number) => {
    if (left <= 0) return match;
    const dice = Number(number || 1);
    const taken = Math.min(dice, left);
    left -= taken;
    return dice - taken > 0 ? `${lead}${dice - taken}d${faces}` : lead;
  });
  return dropped.replace(/\+\s*\+/g, "+").replace(/^\s*\+\s*/, "").replace(/\+\s*$/, "") || "0";
}

/**
 * A damage formula from its parts and the result of the attack that dealt it: the base dice and
 * any extras, the success tier's bonus, a critical doubling it all, a multiplier such as a push,
 * and a halving such as dvHalved or defensive ware - in that order. An extra like "-1d10" takes a
 * die away instead of subtracting one.
 * @param {Object} spec - base (e.g. "1d10+1d6+2"), extras (fragments appended to it, e.g.
 *   ["+1d10"]), multiplier (1 for none), halved
 * @param {Number} [rollResult] - The attack's result tier; none for damage that follows no attack
 * @returns {String} The formula
 */
export function damageFormula({ base, extras = [], multiplier = 1, halved = false }, rollResult) {
  const { successModifier, criticalModifier } = applySuccessTierBonus(rollResult);
  const drops = extras.map(extra => String(extra ?? "").match(DROPPED_DICE)).filter(Boolean);
  let dice = `${base}${extras.filter(extra => !DROPPED_DICE.test(String(extra ?? ""))).join("")}`;
  for (const [, count, faces] of drops) dice = dropDice(dice, Number(faces), Number(count || 1));
  let formula = `${criticalModifier}${dice}${successModifier}`;
  if (multiplier > 1) formula = `${multiplier}*(${formula})`;
  if (halved) formula = `ceil((${formula})/2)`;
  return formula;
}
