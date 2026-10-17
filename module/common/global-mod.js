// A modifier "to all actions" - Twitch's -20, Neuropath's -30 - lands on system.mods.globalMod
// through an effect change. Both the status summary and the roll read it from here: the drugs
// summed into one intoxicated line that names them, so a player sees the total and its sources.
export const GLOBAL_MOD_KEY = "system.mods.globalMod";

const FALLBACK_LABEL = "ep2e.roll.announce.globalEffects";
const INTOXICATED_LABEL = "ep2e.roll.announce.intoxicated";

/**
 * The number a modifier value stands for. Foundry hands a change on a field without a default
 * through as written, so two string changes can arrive concatenated, "-20-20"; every signed number
 * in it counts.
 * @param {Number|String|null} value - The value as stored or as an effect change carries it
 * @returns {Number} The modifier, 0 when there is none
 */
export function modifierValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parts = String(value ?? "").match(/[+-]?\d+(?:\.\d+)?/g) ?? [];
  return parts.reduce((sum, part) => sum + Number(part), 0);
}

/**
 * A modifier as it reads in a breakdown, with its sign.
 * @param {String} name - What the modifier comes from
 * @param {Number} modifier - The modifier
 * @returns {String} e.g. "Twitch (-20)"
 */
function breakdownEntry(name, modifier) {
  return `${name} (${modifier > 0 ? "+" : ""}${modifier})`;
}

/**
 * Every modifier to all actions currently on the actor. The running doses of drugs and toxins are
 * summed into one line labelled intoxicated, with the drugs it is made of as its comment, one per
 * line; any other effect keeps a line of its own, so the label never claims a drug where there is
 * none.
 * Whatever part of the actor's total no active effect explains - a value a module wrote straight
 * into the field - is listed once more under a general label, so the sum always matches.
 * @param {Actor} actor - The actor
 * @returns {Object[]} label, modifier and, for the intoxicated line, comment; without zero entries
 */
export function globalModifiers(actor) {
  const doses = new Map();
  const others = new Map();
  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    if (!effect.active) continue;
    const bucket = effect.getFlag?.("eclipsephase", "dose") !== undefined ? doses : others;
    for (const change of effect.changes ?? []) {
      if (change.key !== GLOBAL_MOD_KEY) continue;
      bucket.set(effect.name, (bucket.get(effect.name) ?? 0) + modifierValue(change.value));
    }
  }

  const sources = [];
  const drugs = [...doses].filter(([, modifier]) => modifier);
  if (drugs.length) {
    sources.push({
      label: INTOXICATED_LABEL,
      modifier: drugs.reduce((sum, [, modifier]) => sum + modifier, 0),
      comment: drugs.map(([name, modifier]) => breakdownEntry(name, modifier)).join("\n")
    });
  }
  for (const [label, modifier] of others) if (modifier) sources.push({ label, modifier });

  const counted = sources.reduce((sum, entry) => sum + entry.modifier, 0);
  const total = modifierValue(actor?.system?.mods?.globalMod);
  if (total !== counted) sources.push({ label: FALLBACK_LABEL, modifier: total - counted });
  return sources;
}
