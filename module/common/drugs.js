// RAW sells drugs by the pack: one Complexity buys five doses. A drug item is therefore a number
// of packs (quantity) each holding this many doses, of which `usages` are left in the open one.
export const DOSES_PER_PACK = 5;

// The units a parsed duration is ever expressed in - the closed set the item sheet offers and
// Foundry tracks. An EP action turn is a Foundry round.
export const DURATION_UNITS = ["rounds", "seconds", "minutes", "hours", "days"];

// How a written span maps onto those units. Spans longer than a day are folded into days, since
// Foundry has no weeks at all and its months and years follow the world calendar, which a drug
// duration has no business depending on.
const UNIT_WORDS = [
  ["seconds", ["seconds", "second", "secs", "sec"], 1],
  ["minutes", ["minutes", "minute", "mins", "min"], 1],
  ["hours", ["hours", "hour", "hrs", "hr", "h"], 1],
  ["days", ["days", "day"], 1],
  ["days", ["weeks", "week"], 7],
  ["days", ["months", "month"], 30],
  ["days", ["years", "year"], 365],
  ["rounds", ["rounds", "round", "turns", "turn"], 1]
];

// Only used to decide which of two spans in one string is the longer, never to convert a duration.
// Rounds are ranked at the three seconds CONFIG.time.roundTime gives an action turn.
const UNIT_RANK = {
  seconds: 1,
  rounds: 3,
  minutes: 60,
  hours: 3600,
  days: 86400
};

const SPAN_PATTERN = new RegExp(
  `(\\d+)\\s*(${UNIT_WORDS.flatMap(([, words]) => words).join("|")})\\b`,
  "gi"
);

const NO_DURATION = { value: null, units: "" };

/**
 * The canonical span a written one amounts to, with anything longer than a day folded into days.
 * @param {Number} value - The number of units written
 * @param {String} word - The unit as it was written
 * @returns {Object|null} A {value, units} span, or null when it cannot be used as a duration
 */
function normaliseSpan(value, word) {
  const entry = UNIT_WORDS.find(([, words]) => words.includes(word));
  if (!entry || !(value > 0)) return null;
  return { value: value * entry[2], units: entry[0] };
}

/**
 * Reads a drug's written duration into the {value, units} shape the schema holds. Where a string
 * names two spans - BTX2's "3 turns/1 hour" - the longer one wins, since that is how long the
 * drug is still doing something. Anything unreadable is treated as open-ended rather than an error.
 * @param {String} text - The duration as it was written
 * @returns {Object} A {value, units} span; value is null when the drug only ends by hand
 */
export function parseDurationText(text) {
  if (typeof text !== "string") return { ...NO_DURATION };

  let best = null;
  for (const [, digits, word] of text.matchAll(SPAN_PATTERN)) {
    const span = normaliseSpan(Number(digits), word.toLowerCase());
    if (!span) continue;
    if (!best || UNIT_RANK[span.units] * span.value > UNIT_RANK[best.units] * best.value) best = span;
  }

  return best ?? { ...NO_DURATION };
}

/**
 * Reads a drug's written addiction modifier as a number. The catalogue writes "-" for the drugs
 * that carry no addiction risk at all.
 * @param {String} text - The modifier as it was written
 * @returns {Number|null} The modifier, or null where there is none
 */
export function parseAddictionMod(text) {
  if (typeof text !== "string") return null;
  const match = text.match(/[+-]?\d+/);
  return match ? Number(match[0]) : null;
}

/**
 * Whether a drug's open pack is still sealed. Loading a sprayer empties a whole pack into its
 * reservoir, so a pack somebody has already taken doses out of cannot be loaded.
 * @param {Object} system - The drug's system data
 * @returns {Boolean} True when no dose has been taken out of the open pack
 */
export function packIsSealed(system) {
  return doseCount(system?.usagesUsed) === 0;
}

/**
 * A dose count as it is stored, or null where none is recorded. An empty pack is a real state and
 * must be told apart from a missing counter, which a plain numeric cast cannot do: both read zero.
 * @param {*} raw - The stored value
 * @returns {Number|null} The count, or null when there is none to use
 */
function doseCount(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Whether a duration still needs rewriting into the {value, units} shape.
 * @param {*} duration - Whatever the item currently holds
 * @returns {Boolean} True when it is not a usable span object
 */
function durationNeedsRewrite(duration) {
  if (duration === null || typeof duration !== "object" || Array.isArray(duration)) return true;
  return !("value" in duration) || !("units" in duration);
}

/**
 * The repairs a drug's data needs to match the current schema: a duration held as free text
 * becomes a span, a missing or unusable dose counter is read as an untouched pack, and a pack
 * recorded as more used up than it has room for is trimmed to its size. Used both by
 * the 2.7 migration and on item creation, so that a drug arriving from an un-migrated source -
 * a world item, a compendium that was not repacked - is fixed on the way in.
 * @param {Object} system - The drug's system data
 * @returns {Object|null} The system changes to apply, or null when nothing needs repairing
 */
export function normaliseDrugSystem(system) {
  const update = {};
  const duration = system?.duration;

  if (durationNeedsRewrite(duration)) update.duration = parseDurationText(duration);

  const storedMax = doseCount(system?.usagesMax);
  const repairedMax = storedMax !== null && storedMax >= 1 ? null : DOSES_PER_PACK;
  if (repairedMax !== null) update.usagesMax = repairedMax;

  const max = repairedMax ?? storedMax;
  const used = doseCount(system?.usagesUsed);
  if (used === null) update.usagesUsed = 0;
  else if (used > max) update.usagesUsed = max;

  return Object.keys(update).length ? update : null;
}
