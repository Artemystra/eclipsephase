const rollSources = new Map();
const poolOptions = [];
const slots = new Map();

/**
 * Reports a rejected registration without throwing, so one broken module cannot stop the system
 * from loading.
 * @param {String} what - The registration that was rejected
 * @param {String} reason - Why it was rejected
 * @returns {Boolean} Always false, so callers can return it directly
 */
function reject(what, reason) {
  console.error(`Eclipse Phase | ${what} was not registered: ${reason}`);
  return false;
}

/**
 * Registers a source of task rolls, so a feature can supply its own skill lookup, roll data and
 * template fragments instead of being branched on by id inside the roll pipeline.
 * @param {String} id - The rolledFrom value this source answers to
 * @param {Object} definition - May hold skillRoll, prepareRollData, dialogSection, chatHeader and chatButtons
 * @returns {Boolean} Whether the source was registered
 */
export function registerRollSource(id, definition = {}) {
  if (typeof id !== "string" || !id) return reject("A roll source", "its id must be a non-empty string");
  if (rollSources.has(id)) return reject(`Roll source "${id}"`, "that id is already taken");
  for (const key of ["skillRoll", "prepareRollData"]) {
    if (definition[key] !== undefined && typeof definition[key] !== "function") {
      return reject(`Roll source "${id}"`, `${key} must be a function`);
    }
  }
  rollSources.set(id, definition);
  return true;
}

/**
 * The definition registered for one roll source.
 * @param {String} id - The rolledFrom value
 * @returns {Object|undefined} The definition, or undefined when nothing is registered
 */
export function getRollSource(id) {
  return rollSources.get(id);
}

/**
 * Registers an extra entry for the pool selects of the roll dialog.
 * @param {Object} definition - Needs value and label, may hold when(context) deciding visibility
 * @returns {Boolean} Whether the option was registered
 */
export function registerPoolOption(definition = {}) {
  if (!definition.value || !definition.label) return reject("A pool option", "it needs both a value and a label");
  if (poolOptions.some(option => option.value === definition.value)) {
    return reject(`Pool option "${definition.value}"`, "that value is already taken");
  }
  if (definition.when !== undefined && typeof definition.when !== "function") {
    return reject(`Pool option "${definition.value}"`, "when must be a function");
  }
  poolOptions.push(definition);
  return true;
}

/**
 * The pool options that apply to one roll.
 * @param {Object} context - Holds rollType, rolledFrom and actor
 * @returns {Object[]} The matching options in registration order
 */
export function applicablePoolOptions(context = {}) {
  return poolOptions.filter(option => {
    if (typeof option.when !== "function") return true;
    try {
      return option.when(context) === true;
    } catch (error) {
      console.error(`Eclipse Phase | Pool option "${option.value}" failed its visibility check`, error);
      return false;
    }
  });
}

/**
 * Registers a template fragment to be rendered at a named place in a core template.
 * @param {String} name - The slot name, e.g. "chatCard.buttons"
 * @param {Object} definition - Needs template, may hold order and when(context)
 * @returns {Boolean} Whether the fragment was registered
 */
export function registerSlot(name, definition = {}) {
  if (typeof name !== "string" || !name) return reject("A slot entry", "the slot name must be a non-empty string");
  if (!definition.template) return reject(`Slot entry for "${name}"`, "it needs a template path");
  if (definition.when !== undefined && typeof definition.when !== "function") {
    return reject(`Slot entry for "${name}"`, "when must be a function");
  }
  if (!slots.has(name)) slots.set(name, []);
  slots.get(name).push({ order: 0, ...definition });
  slots.get(name).sort((a, b) => a.order - b.order);
  return true;
}

/**
 * The entries registered for one slot, in ascending order, filtered by their own visibility check.
 * @param {String} name - The slot name
 * @param {Object} context - The render context handed to the slot
 * @returns {Object[]} The matching entries
 */
export function slotEntries(name, context = {}) {
  return (slots.get(name) ?? []).filter(entry => {
    if (typeof entry.when !== "function") return true;
    try {
      return entry.when(context) === true;
    } catch (error) {
      console.error(`Eclipse Phase | Slot entry for "${name}" failed its visibility check`, error);
      return false;
    }
  });
}

/**
 * Renders every fragment registered for a slot. Templates must be preloaded, since Handlebars
 * partials render synchronously.
 * @param {String} name - The slot name
 * @param {Object} context - The render context handed to each fragment
 * @returns {String} The concatenated markup, empty when nothing is registered
 */
export function renderSlot(name, context = {}) {
  let markup = "";
  for (const entry of slotEntries(name, context)) {
    const partial = Handlebars.partials[entry.template];
    if (!partial) {
      console.error(`Eclipse Phase | Slot template "${entry.template}" is not loaded`);
      continue;
    }
    const compiled = typeof partial === "function" ? partial : Handlebars.compile(partial);
    markup += compiled(context);
  }
  return markup;
}

/**
 * Builds the option markup a pool select needs for the registered pool options.
 * @param {Object[]} options - The options that already passed their visibility check
 * @param {String} poolType - The localization key of the pool the select spends from
 * @returns {String} The option markup
 */
export function renderPoolOptions(options, poolType) {
  let markup = "";
  for (const option of options ?? []) {
    const label = game.i18n.localize(option.label);
    const suffix = poolType ? ` (${game.i18n.localize(poolType)})` : "";
    markup += `<option value="${option.value}">${label}${suffix}</option>`;
  }
  return markup;
}

let taskResultText = null;

/**
 * Replaces the success-tier text table a finished roll and its pool-swap alternatives are labelled
 * with, for a feature that changes those labels.
 * @param {Object} table - A result-index-to-{class, text} table, in the shape of dice.js's own tables
 * @returns {Boolean} Whether the table was registered
 */
export function registerTaskResultText(table) {
  if (!table || typeof table !== "object") return reject("A task result text table", "it needs a result-to-label object");
  if (taskResultText) return reject("A task result text table", "another one is already registered");
  taskResultText = table;
  return true;
}

/**
 * The registered success-tier text table, if any.
 * @returns {Object|null} The table, or null while the core one applies
 */
export function getTaskResultText() {
  return taskResultText;
}

let rezSpendOptions = null;

/**
 * Replaces the table the Rez spending dialog offers, for a feature that changes what Rez buys.
 * @param {Object} definition - Needs options, the entries of the dialog, and costMatrix, their Rez cost by id
 * @returns {Boolean} Whether the table was registered
 */
export function registerRezSpendOptions(definition = {}) {
  if (!definition.options || typeof definition.options !== "object") {
    return reject("A Rez spending table", "it needs an options object");
  }
  if (!definition.costMatrix || typeof definition.costMatrix !== "object") {
    return reject("A Rez spending table", "it needs a costMatrix object");
  }
  if (rezSpendOptions) return reject("A Rez spending table", "another one is already registered");
  rezSpendOptions = definition;
  return true;
}

/**
 * The registered Rez spending table, if any.
 * @returns {Object|null} The table, or null while the core one applies
 */
export function getRezSpendOptions() {
  return rezSpendOptions;
}

/**
 * Registers the Handlebars helpers the core templates use to reach the registry.
 * @returns {void}
 */
export function registerRegistryHelpers() {
  Handlebars.registerHelper("epSlot", (name, context) =>
    new Handlebars.SafeString(renderSlot(name, context ?? {})));
  Handlebars.registerHelper("epPoolOptions", (options, poolType) =>
    new Handlebars.SafeString(renderPoolOptions(options, poolType)));
}

/**
 * Empties every registry. Only meant for tests.
 * @returns {void}
 */
export function resetRegistry() {
  rollSources.clear();
  poolOptions.length = 0;
  slots.clear();
  taskResultText = null;
  rezSpendOptions = null;
}

export const registry = { rollSources, poolOptions, slots };
