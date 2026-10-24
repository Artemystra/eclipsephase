import { listSelection } from "./general-sheet-functions.js";

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

// The forms a drug is sold in, and how soon a dose taken that way takes hold (Core p.330). Listed
// in the order the item sheet shows them. Labels are the sheet's own, already translated.
export const VECTORS = [
  { key: "dermal", label: "ep2e.item.drug.table.applicationVectors.dermalLabel", onset: "ep2e.item.drug.onset.turn" },
  { key: "inhalation", label: "ep2e.item.drug.table.applicationVectors.inhalationLabel", onset: "ep2e.item.drug.onset.immediate" },
  { key: "injection", label: "ep2e.item.drug.table.applicationVectors.injectionLabel", onset: "ep2e.item.drug.onset.turn" },
  { key: "oral", label: "ep2e.item.drug.table.applicationVectors.oralLabel", onset: "ep2e.item.drug.onset.minutes15" }
];

export const VECTOR_KEYS = VECTORS.map(vector => vector.key);

// An electronic drug is an app rather than a substance: it has no application vector at all and
// runs for as long as it is left running.
const APP_ONSET = "ep2e.item.drug.onset.app";

/**
 * The forms a drug is sold in, as its own data records them. The compendium ships what the book
 * prints, which for most drugs is several forms; a pack somebody owns should carry exactly one.
 * @param {Object} system - The drug's system data
 * @returns {Object[]} The matching VECTORS entries, in sheet order
 */
export function drugVectors(system) {
  return VECTORS.filter(vector => system?.[vector.key] === true);
}

/**
 * The one form a dose of this drug is taken in, or null where its data does not pin a single one
 * down - an electronic drug, or a pack that predates the choice being asked for.
 * @param {Object} system - The drug's system data
 * @returns {Object|null} The VECTORS entry, or null
 */
export function drugVector(system) {
  const offered = drugVectors(system);
  return offered.length === 1 ? offered[0] : null;
}

/**
 * Whether a drug still offers more than one form, which is what has to be settled when somebody
 * acquires it: a pack you own is one physical thing, not every form at once.
 * @param {Object} system - The drug's system data
 * @returns {Boolean} True when a form still has to be picked
 */
export function needsVectorChoice(system) {
  return drugVectors(system).length > 1;
}

/**
 * How soon a dose of this drug takes hold, by the form it is taken in.
 * @param {Object} system - The drug's system data
 * @returns {String|null} The localization key, or null where no single form is recorded
 */
export function doseOnset(system) {
  if (system?.drugType === "electronic") return APP_ONSET;
  return drugVector(system)?.onset ?? null;
}

// The forms a drug can be loaded into a weapon in (Core p.219, p.330): a dermal or inhaled
// substance fills a sprayer or a splash or gas round, an injected one a capsule round or a coated
// blade. Pills and apps are never ammunition.
export const AMMO_VECTOR_KEYS = ["dermal", "inhalation", "injection"];

/**
 * Whether a drug is offered in at least one form that could be ammunition, which is when the
 * acquisition dialog asks whether the pack is one.
 * @param {Object} system - The drug's system data
 * @returns {Boolean} True when some offered form can be loaded into a weapon
 */
export function offersAmmoChoice(system) {
  if (system?.drugType === "electronic") return false;
  return drugVectors(system).some(vector => AMMO_VECTOR_KEYS.includes(vector.key));
}

/**
 * Whether this pack, in the one form it was bought in, may be an ammunition pack.
 * @param {Object} system - The drug's system data
 * @returns {Boolean} True for a single dermal, inhaled or injected form of a substance
 */
export function canBeAmmo(system) {
  if (system?.drugType === "electronic") return false;
  return AMMO_VECTOR_KEYS.includes(drugVector(system)?.key);
}

/**
 * Whether a pack is an ammunition pack: it loads into a weapon and is never taken, and its doses
 * are not counted, as with any other ammunition.
 * @param {Object} system - The drug's system data
 * @returns {Boolean} True for an ammunition pack
 */
export function isAmmoPack(system) {
  return system?.isAmmo === true;
}

/**
 * Whether two drugs are the same substance bought in the same form, and both as ammunition or
 * both not. A second purchase only joins an existing stack when it matches, so an injected and an
 * oral pack of the same drug stay apart, and so do a pack to take and a pack to load.
 * @param {Object} a - One drug's system data
 * @param {Object} b - The other drug's system data
 * @returns {Boolean} True when both record the same forms and the same ammunition flag
 */
export function sameDrugForm(a, b) {
  return VECTOR_KEYS.every(key => (a?.[key] === true) === (b?.[key] === true)) && isAmmoPack(a) === isAmmoPack(b);
}

/**
 * How many doses a drug still holds across every pack it carries. A drug is a number of packs of
 * which one is open, so the count is every pack's worth less the doses already taken out of the
 * open one.
 * @param {Object} system - The drug's system data
 * @returns {Number} The doses left, never below zero
 */
export function dosesRemaining(system) {
  const max = packSize(system);
  const packs = Math.max(0, Math.floor(Number(system?.quantity) || 0));
  const used = Math.min(max, Math.max(0, Math.floor(Number(system?.usagesUsed) || 0)));
  return Math.max(0, packs * max - used);
}

/**
 * What a drug holds after one dose is taken out of it. Derived from the dose count rather than by
 * stepping the counters, so that a pack somebody has typed into an impossible state still lands
 * somewhere sensible: the open pack gives up a dose, an emptied pack hands over to the next one,
 * and the last dose leaves nothing behind.
 * @param {Object} system - The drug's system data
 * @returns {Object} taken says whether there was a dose to take at all; emptied says the drug is
 *   spent and should go; quantity and usagesUsed are what to write back when it is not
 */
export function afterDose(system) {
  const remaining = dosesRemaining(system);
  if (remaining < 1) return { taken: false, emptied: false };

  const left = remaining - 1;
  if (left < 1) return { taken: true, emptied: true };

  const max = packSize(system);
  const packs = Math.ceil(left / max);
  return {
    taken: true,
    emptied: false,
    quantity: packs,
    usagesUsed: max - (left - (packs - 1) * max)
  };
}

/**
 * How many doses one pack of a drug holds, falling back to what a purchase buys.
 * @param {Object} system - The drug's system data
 * @returns {Number} The pack size, at least one
 */
function packSize(system) {
  const max = Math.floor(Number(system?.usagesMax));
  return Number.isFinite(max) && max >= 1 ? max : DOSES_PER_PACK;
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

// A drug is either a drug or a toxin. The book's finer groupings - combat, social, petals - are
// chapters, kept as compendium folders; what a drug can act on is its type, not its category.
export const DRUG_CATEGORIES = ["drug", "toxin"];
const LEGACY_TOXIN_CATEGORIES = ["toxins", "nanotox"];

/**
 * The category a stored value stands for: one of the two current ones, with the old toxin and
 * nanotoxin groupings read as toxin and every other old grouping as drug.
 * @param {*} category - The stored category
 * @returns {String} "drug" or "toxin"
 */
export function drugCategory(category) {
  if (DRUG_CATEGORIES.includes(category)) return category;
  return LEGACY_TOXIN_CATEGORIES.includes(category) ? "toxin" : "drug";
}

/**
 * Reads a dice formula written as text - the wear-off stress drugs carried before it became three
 * number fields - into d10s, d6s and a flat bonus. Anything else in the text is ignored.
 * @param {String} text - e.g. "1d10 + 2"
 * @returns {Object} d10, d6 and bonus
 */
export function parseDiceValue(text) {
  const compact = String(text ?? "").replace(/\s+/g, "");
  const count = sides => Number(compact.match(new RegExp(`(\\d+)d${sides}(?!\\d)`))?.[1]) || 0;
  const bonus = compact.replace(/\d+d\d+/g, "").match(/[+-]\d+/g)?.reduce((sum, part) => sum + Number(part), 0) ?? 0;
  return { d10: count(10), d6: count(6), bonus };
}

/**
 * The repairs a drug's data needs to match the current schema: a duration held as free text
 * becomes a span, a missing or unusable dose counter is read as an untouched pack, a pack
 * recorded as more used up than it has room for is trimmed to its size, a category from the
 * old fine-grained list becomes drug or toxin, an ammunition flag on a form that cannot be
 * ammunition is cleared, and a wear-off stress written as text becomes dice values. Used both by
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

  if (isAmmoPack(system) && !canBeAmmo(system)) update.isAmmo = false;

  if (typeof system?.wearOff?.sv === "string") update.wearOff = parseDiceValue(system.wearOff.sv);

  const category = system?.category;
  if (typeof category === "string" && category && !DRUG_CATEGORIES.includes(category)) update.category = drugCategory(category);

  return Object.keys(update).length ? update : null;
}

/**
 * Takes one dose out of a drug the actor is carrying: the open pack gives one up, an emptied pack
 * hands over to the next, and the last dose takes the drug off the sheet. A drug with nothing left
 * is reported back untouched rather than being removed.
 * @param {Object} actor - The actor carrying the drug
 * @param {Object} item - The drug item
 * @returns {Promise<Object>} The outcome, per afterDose
 */
export async function consumeDose(actor, item) {
  const outcome = afterDose(item.system);
  if (!outcome.taken) return outcome;

  if (outcome.emptied) await actor.deleteEmbeddedDocuments("Item", [item.id]);
  else await item.update({ "system.quantity": outcome.quantity, "system.usagesUsed": outcome.usagesUsed });

  return outcome;
}

/**
 * Asks which form a drug was bought in and whether the pack is ammunition. The chosen form is the
 * only one kept on the pack and decides how a dose is taken and how soon it takes hold. The
 * ammunition box is only open while a form that can be loaded into a weapon is picked.
 * @param {String} itemName - The drug's name, shown above the choice
 * @param {Object[]} vectors - The VECTORS entries the drug offers
 * @returns {Promise<Object>} The chosen vector key and whether it is an ammunition pack, or cancelled
 */
export async function selectDrugVector(itemName, vectors) {
  const options = vectors.map(vector => ({
    id: vector.key,
    label: vector.label,
    description: vector.onset
  }));
  const ammoCapable = vectors.some(vector => AMMO_VECTOR_KEYS.includes(vector.key));

  const renderHook = (event, dialog) => {
    const root = dialog.element;
    const box = root.querySelector('input[name="ExtraOption"]');
    if (!box) return;
    const sync = () => {
      const picked = root.querySelector('input[name="ItemSelect"]:checked')?.value;
      box.disabled = !AMMO_VECTOR_KEYS.includes(picked);
      if (box.disabled) box.checked = false;
    };
    root.querySelectorAll('input[name="ItemSelect"]').forEach(radio => radio.addEventListener("change", sync));
    sync();
  };

  const result = await listSelection(
    options,
    "standardSelectionList",
    320,
    "ep2e.dialog.selectDrugVector.header",
    itemName,
    "ep2e.dialog.selectDrugVector.copy",
    ammoCapable ? renderHook : undefined,
    ammoCapable ? { checkbox: { label: "ep2e.dialog.selectDrugVector.asAmmo" } } : {}
  );

  if (result?.cancelled) return { cancelled: true };
  const vector = result?.selection ?? null;
  return { vector, isAmmo: result?.extraOption === true && AMMO_VECTOR_KEYS.includes(vector) };
}

/**
 * Settles the form a drug is acquired in, on its data before it is created: asks when the drug
 * still offers several forms or could be an ammunition pack, then keeps only the chosen form.
 * Anything that is not a drug, and a drug with nothing left to settle, passes through unasked.
 * @param {Object} itemData - The incoming item's source data, changed in place
 * @returns {Promise<Boolean>} False when the choice was cancelled
 */
export async function chooseDrugForm(itemData) {
  if (itemData?.type !== "drug") return true;
  const system = itemData.system ?? {};
  if (!needsVectorChoice(system) && !offersAmmoChoice(system)) return true;

  const chosen = await selectDrugVector(itemData.name, drugVectors(system));
  if (chosen.cancelled || !chosen.vector) return false;
  for (const key of VECTOR_KEYS) system[key] = key === chosen.vector;
  system.isAmmo = chosen.isAmmo === true;
  return true;
}

/**
 * Asks who a dose is for: the actor themselves, a willing target the dose is offered to through a
 * card in the chat, or an unwilling one it has to be forced on with a melee attack first. A
 * shift-click skips this and takes the dose at once.
 * @param {String} itemName - The drug's name, shown above the choice
 * @returns {Promise<String|null>} "self", "other", "unwilling", or null when cancelled
 */
export async function selectDoseRecipient(itemName) {
  const result = await listSelection(
    [
      { id: "self", label: "ep2e.dialog.doseRecipient.self" },
      { id: "other", label: "ep2e.dialog.doseRecipient.other", description: "ep2e.dialog.doseRecipient.otherHint" },
      { id: "unwilling", label: "ep2e.dialog.doseRecipient.unwilling", description: "ep2e.dialog.doseRecipient.unwillingHint" }
    ],
    "standardSelectionList",
    320,
    "ep2e.dialog.doseRecipient.header",
    itemName,
    "ep2e.dialog.doseRecipient.copy"
  );
  if (result?.cancelled) return null;
  return result?.selection ?? null;
}
