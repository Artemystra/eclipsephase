// Conditional modifiers - a drug's Juice +30 against fear, a ware's Grip Pads +30 when climbing. The
// system cannot tell whether the situation applies, so they are offered in the roll dialog and the
// player ticks the ones that do. Each option is authored as { id, label, value, appliesTo,
// replacesGlobal?, replacesFlat?, random?, automatic?, specialSkill? }: on a drug it travels on the
// dose's flag while the dose runs, on ware it is read off the ware while it sits in the active body.

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
 * Whether a ware item works in the body the actor acts through: bound to the sleeved morph - or to
 * the jammed body, unless the ware keeps working while jamming. An NPC's or goon's ware always
 * works, the way its effects do.
 * @param {Actor} actor - The actor
 * @param {Item} item - The ware
 * @returns {Boolean} True while it works
 */
export function wareWorks(actor, item) {
  if (actor?.type !== "character") return true;
  const boundTo = item.system?.boundTo;
  if (!boundTo) return true;
  const activeJam = actor.system?.activeJam;
  const keepsJamming = !!item.system?.additionalSystems?.staysActiveWhileJamming;
  return boundTo === (activeJam && !keepsJamming ? activeJam : actor.system?.activeMorph);
}

/**
 * Whether an option fits this check. A special-skill option - Hardware, Exotic Skill: Disguise -
 * fits the special skills the player picked for it on the ware, whatever they are called.
 * @param {Object} option - The option
 * @param {Set<String>} keys - What the check answers to
 * @param {Object} dataset - The roll's dataset
 * @returns {Boolean} True when it is offered
 */
function optionFits(option, keys, dataset) {
  const picked = (option.specialSkills ?? []).map(name => String(name).toLowerCase());
  if (option.specialSkill && picked.includes(String(dataset?.key ?? "").toLowerCase())) return true;
  if (option.specialSkill && !option.appliesTo?.length) return false;
  return !option.appliesTo?.length || option.appliesTo.some(key => keys.has(String(key).toLowerCase()));
}

/**
 * The conditional modifiers the ware working in the actor's body offers for this check.
 * @param {Actor} actor - The rolling actor
 * @param {Object} dataset - The roll's dataset
 * @returns {Object[]} One entry per option, as doseRollOptions gives them, with source "ware"
 */
export function wareRollOptions(actor, dataset) {
  const keys = checkKeys(actor, dataset);
  const offered = [];
  for (const item of actor?.items ?? []) {
    if (item.type !== "ware" || !Array.isArray(item.system?.rollOptions) || !wareWorks(actor, item)) continue;
    for (const option of item.system.rollOptions) {
      if (!optionFits(option, keys, dataset)) continue;
      offered.push({ field: `wareOption-${item.id}-${option.id}`, drug: item.name, option, shown: shownValue(option), source: "ware" });
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
 * sign: a d2 of 1 is a penalty, a 2 a bonus. One that replaces a flat bonus the roll already holds -
 * Mimicry's +30 instead of its +10 - adds only the difference.
 * @param {Object} option - The option
 * @returns {Promise<Number>} The modifier
 */
export async function optionValue(option) {
  if (!option.random) return (Number(option.value) || 0) - (Number(option.replacesFlat) || 0);
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
