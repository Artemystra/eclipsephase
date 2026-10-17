// Conditional drug modifiers - Juice's +30 against fear, CR Gas's -30 on sight-based Perceive. The
// system cannot tell whether the situation applies, so they are offered in the roll dialog while
// a dose runs and the player ticks the ones that do. Each option is authored on the drug as
// { id, label, value, appliesTo, replacesGlobal?, random? } and travels on the dose's flag.

/**
 * What a check is, for matching options against it: the skill key, the aptitude it is made with,
 * and "know" for a Know skill.
 * @param {Actor} actor - The rolling actor
 * @param {Object} dataset - The roll's dataset as the sheet hands it to RollCheck
 * @returns {Set<String>} Lower-case keys the check answers to
 */
export function checkKeys(actor, dataset = {}) {
  const keys = new Set();
  if (dataset.apttype) keys.add(String(dataset.apttype).toLowerCase());
  if (dataset.key) keys.add(String(dataset.key).toLowerCase());
  const isKnow = actor?.items?.some?.(item => item.type === "knowSkill" && item.name === dataset.key);
  if (isKnow) keys.add("know");
  return keys;
}

/**
 * An option's value as the dialog shows it: signed, or "±" for one decided by chance.
 * @param {Object} option - The option
 * @returns {String} e.g. "+30", "-30" or "±10"
 */
function shownValue(option) {
  const value = Number(option.value) || 0;
  if (option.random) return `±${Math.abs(value)}`;
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * The conditional modifiers the actor's running doses offer for this check. An option without an
 * appliesTo list is offered on every check.
 * @param {Actor} actor - The rolling actor
 * @param {Object} dataset - The roll's dataset
 * @returns {Object[]} One entry per option: field (the dialog's checkbox name), drug, the option
 *   itself and its value as shown
 */
export function doseRollOptions(actor, dataset) {
  const keys = checkKeys(actor, dataset);
  const offered = [];
  for (const effect of actor?.effects ?? []) {
    const dose = effect.getFlag?.("eclipsephase", "dose");
    if (!dose || !effect.active) continue;
    for (const option of dose.rollOptions ?? []) {
      const applies = !option.appliesTo?.length || option.appliesTo.some(key => keys.has(String(key).toLowerCase()));
      if (!applies) continue;
      offered.push({ field: `doseOption-${effect.id}-${option.id}`, drug: dose.name ?? effect.name, option, shown: shownValue(option) });
    }
  }
  return offered;
}

/**
 * The options the dialog came back with ticked, plus those that apply on their own whenever they
 * fit - Randomizer's coin flip on every social test - which the dialog never offers.
 * @param {Object[]} offered - What doseRollOptions offered
 * @param {Object} values - The dialog's answer, by field name
 * @returns {Object[]} The entries that apply to this roll
 */
export function chosenRollOptions(offered, values = {}) {
  return offered.filter(entry => entry.option.automatic || values[entry.field] === true || values[entry.field] === "true");
}

/**
 * The options the roll dialog shows as checkboxes: every offered one that does not apply on its own.
 * @param {Object[]} offered - What doseRollOptions offered
 * @returns {Object[]} The entries to show
 */
export function tickableRollOptions(offered) {
  return offered.filter(entry => !entry.option.automatic);
}

/**
 * The value a ticked option adds to the roll. A random option - Randomizer's coin flip - rolls its
 * sign: a d2 of 1 is a penalty, a 2 a bonus.
 * @param {Object} option - The option
 * @returns {Promise<Number>} The modifier
 */
export async function optionValue(option) {
  if (!option.random) return Number(option.value) || 0;
  const flip = await new Roll("1d2").evaluate();
  const size = Math.abs(Number(option.value) || 0);
  return flip.total === 1 ? -size : size;
}

/**
 * The drugs whose penalty to all actions a set of ticked options replaces for this roll.
 * @param {Object[]} chosen - The ticked entries
 * @returns {Set<String>} Drug names
 */
export function replacedDrugs(chosen) {
  return new Set(chosen.filter(entry => entry.option.replacesGlobal).map(entry => entry.drug));
}
