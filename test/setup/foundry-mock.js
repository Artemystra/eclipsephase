const fs = require("fs");
const path = require("path");

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Foundry's utils.getType: distinguishes null, Array, Set and plain objects.
 * @param {*} value - Any value
 * @returns {String} One of "null", "undefined", "Array", "Set", "Object", "number", "string", "boolean", "function" or a class name
 */
function getType(value) {
  const typeOf = typeof value;
  if (typeOf !== "object") return typeOf;
  if (value === null) return "null";
  if (Array.isArray(value)) return "Array";
  if (value instanceof Set) return "Set";
  if (value instanceof Map) return "Map";
  const ctor = Object.getPrototypeOf(value)?.constructor;
  if (!ctor || ctor === Object) return "Object";
  return ctor.name;
}

/**
 * Whether a value is a plain data object that merging should descend into.
 * @param {*} value - Any value
 * @returns {Boolean} True for plain objects only
 */
function isPlainObject(value) {
  return getType(value) === "Object";
}

/**
 * Deep clone of plain data, mirroring foundry.utils.deepClone for JSON-shaped values.
 * @param {*} value - Any value
 * @returns {*} A structural copy
 */
function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = deepClone(value[key]);
    return out;
  }
  return value;
}

/**
 * Recursive merge of source into target, matching foundry.utils.mergeObject with default options.
 * @param {Object} target - The object mutated in place
 * @param {Object} source - The object read from
 * @param {Object} [options] - Supports insertKeys, insertValues, overwrite and recursive
 * @returns {Object} The mutated target
 */
function mergeObject(target, source = {}, options = {}) {
  const { insertKeys = true, insertValues = true, overwrite = true, recursive = true } = options;
  for (const [key, value] of Object.entries(source)) {
    const exists = Object.prototype.hasOwnProperty.call(target, key);
    if (!exists && !insertKeys) continue;
    if (recursive && isPlainObject(value) && isPlainObject(target[key])) {
      mergeObject(target[key], value, options);
      continue;
    }
    if (exists && !overwrite) continue;
    if (!exists && isPlainObject(value) && !insertValues) continue;
    target[key] = deepClone(value);
  }
  return target;
}

/**
 * Reads a dot-path off an object.
 * @param {Object} object - The object to read from
 * @param {String} key - A dot-separated path
 * @returns {*} The value, or undefined when any segment is missing
 */
function getProperty(object, key) {
  if (!key || !object) return undefined;
  let target = object;
  for (const part of key.split(".")) {
    if (target === null || target === undefined) return undefined;
    target = target[part];
  }
  return target;
}

/**
 * Writes a dot-path on an object, creating intermediate plain objects.
 * @param {Object} object - The object to write to
 * @param {String} key - A dot-separated path
 * @param {*} value - The value to set
 * @returns {Boolean} True when the value changed
 */
function setProperty(object, key, value) {
  if (!key || !object) return false;
  const parts = key.split(".");
  let target = object;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(target[part])) target[part] = {};
    target = target[part];
  }
  const last = parts[parts.length - 1];
  if (target[last] === value) return false;
  target[last] = value;
  return true;
}

/**
 * Turns a flattened dot-path object into a nested one.
 * @param {Object} flat - An object whose keys may be dot-paths
 * @returns {Object} The expanded object
 */
function expandObject(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) setProperty(out, key, value);
  return out;
}

/**
 * Semantic version comparison used for migration gating.
 * @param {String} version - The candidate version
 * @param {String} other - The version compared against
 * @returns {Boolean} True when version is strictly newer than other
 */
function isNewerVersion(version, other) {
  const parse = v => String(v ?? "").split(".").map(p => Number.parseInt(p, 10) || 0);
  const a = parse(version);
  const b = parse(other);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

let idCounter = 0;

/**
 * Deterministic stand-in for foundry.utils.randomID so snapshots stay stable.
 * @param {Number} [length] - Ignored, kept for signature parity
 * @returns {String} A unique id within this test run
 */
function randomID(length = 16) {
  idCounter += 1;
  return `testid${String(idCounter).padStart(length - 6, "0")}`;
}

/**
 * Resets the id counter so each test file starts from the same sequence.
 * @returns {void}
 */
function resetIds() {
  idCounter = 0;
}

/**
 * Builds game.model the way Foundry's server does: only type-level templates arrays are resolved,
 * nested templates keys stay untouched data.
 * @returns {Object} A model keyed by document name and sub-type
 */
function buildModel() {
  const template = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "template.json"), "utf8"));
  const model = {};
  for (const documentName of Object.keys(template)) {
    const definition = deepClone(template[documentName]);
    const templates = definition.templates || {};
    const built = {};
    for (const type of definition.types || []) {
      const typeDefinition = definition[type] || {};
      const merged = {};
      for (const name of typeDefinition.templates || []) {
        if (name in templates) mergeObject(merged, templates[name]);
      }
      delete typeDefinition.templates;
      mergeObject(merged, typeDefinition);
      built[type] = merged;
    }
    model[documentName] = built;
  }
  return model;
}

/**
 * An array-flavoured Map, standing in for Foundry's EmbeddedCollection.
 */
class MockCollection extends Map {
  [Symbol.iterator]() {
    return this.values();
  }
  get contents() {
    return Array.from(this.values());
  }
  filter(fn) {
    return this.contents.filter(fn);
  }
  find(fn) {
    return this.contents.find(fn);
  }
  some(fn) {
    return this.contents.some(fn);
  }
  every(fn) {
    return this.contents.every(fn);
  }
  map(fn) {
    return this.contents.map(fn);
  }
  reduce(fn, initial) {
    return this.contents.reduce(fn, initial);
  }
}

const uuidRegistry = new Map();

/**
 * Shared document behaviour: source data, flags and in-memory updates.
 */
class MockDocument {
  constructor(data = {}, context = {}) {
    this._source = deepClone(data);
    this.parent = context.parent ?? null;
    this.id = data._id ?? randomID();
    this.name = data.name ?? "";
    this.img = data.img ?? "";
    this.type = data.type ?? "base";
    this.flags = deepClone(data.flags ?? {});
    this.system = deepClone(data.system ?? {});
    this.sort = data.sort ?? 0;
    this.ownership = deepClone(data.ownership ?? {});
  }

  get uuid() {
    const parentPart = this.parent ? `${this.parent.uuid}.` : "";
    return `${parentPart}${this.documentName}.${this.id}`;
  }

  getFlag(scope, key) {
    return getProperty(this.flags, `${scope}.${key}`);
  }

  async setFlag(scope, key, value) {
    setProperty(this.flags, `${scope}.${key}`, value);
    setProperty(this._source, `flags.${scope}.${key}`, value);
    return this;
  }

  async unsetFlag(scope, key) {
    setProperty(this.flags, `${scope}.${key}`, undefined);
    return this;
  }

  async update(changes = {}) {
    for (const [key, value] of Object.entries(changes)) {
      setProperty(this._source, key, value);
      setProperty(this, key, value);
    }
    this.prepareData();
    return this;
  }

  toObject() {
    return deepClone(this._source);
  }

  prepareData() {}
}

let effectDataModel;

/**
 * Lazily loads the system's own ActiveEffect data model so suppression is judged by system code
 * rather than by a copy of its rules. Loaded on first use, after the globals exist.
 * @returns {Function} The EP2eActiveEffectData class
 */
function getEffectDataModel() {
  if (!effectDataModel) {
    effectDataModel = require(path.join(SYSTEM_ROOT, "module", "effects.js")).EP2eActiveEffectData;
  }
  return effectDataModel;
}

/**
 * An ActiveEffect stand-in. Foundry v14 stores changes under system.changes and exposes a changes
 * shim on the document, so both are provided here.
 */
class MockActiveEffect {
  constructor(data = {}, context = {}) {
    this.parent = context.parent ?? null;
    this.id = data._id ?? randomID();
    this.name = data.name ?? "";
    this.disabled = data.disabled ?? false;
    this.transfer = data.transfer ?? true;
    this.statuses = data.statuses ?? [];
    const changes = data.system?.changes ?? data.changes ?? [];
    const Model = getEffectDataModel();
    this.system = new Model({ changes: deepClone(changes) }, { parent: this });
  }

  get changes() {
    return this.system.changes;
  }

  get isSuppressed() {
    return this.system.isSuppressed === true;
  }

  get active() {
    return !this.disabled && !this.isSuppressed;
  }
}

/**
 * Applies one effect change, mirroring v14's _applyChangeUnguided for the add and override types
 * this system uses. Numeric-looking string values stay strings when the target default is null,
 * exactly as Foundry casts them.
 * @param {Object} target - The document being changed
 * @param {Object} change - A change with key, type and value
 * @param {Object} model - The template defaults for this document type
 * @returns {void}
 */
function applyChange(target, change, model) {
  if (!change.key) return;
  const current = getProperty(target, change.key) ?? null;
  const targetData = current === null ? (getProperty(model, change.key) ?? null) : current;
  const targetType = getType(targetData);
  let delta = change.value;
  if (targetType === "number") delta = Number(change.value) || 0;
  else if (targetType === "string") delta = String(change.value);
  else if (targetType === "boolean") delta = !!change.value;

  if (change.type === "override") {
    if (delta !== current) setProperty(target, change.key, delta);
    return;
  }
  if (change.type !== "add") return;

  let update;
  switch (getType(current)) {
    case "boolean": update = current || delta; break;
    case "null": update = delta; break;
    case "Array": update = current.concat(delta); break;
    default: update = current + delta; break;
  }
  if (update !== current) setProperty(target, change.key, update);
}

class MockItem extends MockDocument {
  constructor(data = {}, context = {}) {
    super(data, context);
    this.effects = (data.effects ?? []).map(effect => new MockActiveEffect(effect, { parent: this }));
    this.actor = this.parent instanceof MockActor ? this.parent : null;
  }

  get documentName() {
    return "Item";
  }

  prepareData() {
    this.system = deepClone(this._source.system ?? {});
  }
}

class MockActor extends MockDocument {
  constructor(data = {}, context = {}) {
    super(data, context);
    this.items = new MockCollection();
    for (const itemData of data.items ?? []) {
      const item = new global.CONFIG.Item.documentClass(itemData, { parent: this });
      this.items.set(item.id, item);
      uuidRegistry.set(item.uuid, item);
    }
    this.effects = (data.effects ?? []).map(effect => new MockActiveEffect(effect, { parent: this }));
    this.statuses = new Set();
    uuidRegistry.set(this.uuid, this);
  }

  get documentName() {
    return "Actor";
  }

  get isOwner() {
    return true;
  }

  *allApplicableEffects() {
    for (const effect of this.effects) yield effect;
    for (const item of this.items.values()) {
      for (const effect of item.effects) {
        if (effect.transfer !== false) yield effect;
      }
    }
  }

  applyActiveEffects() {
    const model = global.game.model?.Actor?.[this.type] ?? {};
    const changes = [];
    for (const effect of this.allApplicableEffects()) {
      if (!effect.active) continue;
      for (const change of effect.changes ?? []) {
        changes.push({ ...change, priority: change.priority ?? 0 });
      }
    }
    changes.sort((a, b) => a.priority - b.priority);
    for (const change of changes) applyChange(this, change, model);
  }

  prepareData() {
    this.system = deepClone(this._source.system ?? {});
    for (const item of this.items.values()) item.prepareData();
    this.applyActiveEffects();
  }
}

const settingValues = new Map();

/**
 * Sets a world setting for the current test.
 * @param {String} namespace - The setting namespace, normally "eclipsephase"
 * @param {String} key - The setting key
 * @param {*} value - The value returned by game.settings.get
 * @returns {void}
 */
function setSetting(namespace, key, value) {
  settingValues.set(`${namespace}.${key}`, value);
}

const SETTING_DEFAULTS = {
  showTaskOptions: false,
  showDamageOptions: false,
  showEverything: false,
  restReset: false,
  ammoRules: false,
  hideNPCs: false,
  enableShopSystem: true,
  effectPanel: false,
  editAll: false,
  GMmenu: true,
  migrationVersion: "newInstall",
  superBrew: false
};

/**
 * Restores every setting to its registered default.
 * @returns {void}
 */
function resetSettings() {
  settingValues.clear();
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    settingValues.set(`eclipsephase.${key}`, value);
  }
}

const rollQueue = [];

/**
 * Queues the totals the next Roll evaluations will return.
 * @param {Number[]} totals - One total per upcoming roll, consumed in order
 * @returns {void}
 */
function seedRolls(totals) {
  rollQueue.length = 0;
  rollQueue.push(...totals);
}

class MockRoll {
  constructor(formula) {
    this.formula = formula;
    this.total = null;
    this.terms = [];
    this.dice = [];
  }
  async evaluate() {
    this.total = rollQueue.length ? rollQueue.shift() : 0;
    return this;
  }
  evaluateSync() {
    this.total = rollQueue.length ? rollQueue.shift() : 0;
    return this;
  }
  async render() {
    return "";
  }
  toJSON() {
    return { formula: this.formula, total: this.total };
  }
}

const createdMessages = [];
const notifications = { warn: [], error: [], info: [] };
const hookCalls = [];
const hookHandlers = new Map();

class MockChatMessage {
  static async create(data = {}) {
    const message = { ...data, id: randomID() };
    createdMessages.push(message);
    global.game.messages.set(message.id, message);
    return message;
  }
  static getSpeaker({ actor } = {}) {
    return { actor: actor?.id ?? null, alias: actor?.name ?? "" };
  }
}

/**
 * Runs one hook listener the way Foundry does: a listener that throws is logged and swallowed, so
 * a broken listener cannot break the caller.
 * @param {String} event - The hook name
 * @param {Function} fn - The listener
 * @param {Array} args - The hook arguments
 * @returns {*} Whatever the listener returned, or undefined when it threw
 */
function safeCall(event, fn, args) {
  try {
    return fn(...args);
  } catch (error) {
    notifications.error.push(`Hook ${event}: ${error?.message ?? error}`);
    return undefined;
  }
}

const Hooks = {
  on(event, fn) {
    if (!hookHandlers.has(event)) hookHandlers.set(event, []);
    hookHandlers.get(event).push(fn);
    return fn;
  },
  once(event, fn) {
    return Hooks.on(event, fn);
  },
  off(event, fn) {
    const handlers = hookHandlers.get(event) ?? [];
    const index = handlers.indexOf(fn);
    if (index >= 0) handlers.splice(index, 1);
  },
  call(event, ...args) {
    hookCalls.push({ event, args });
    for (const fn of hookHandlers.get(event) ?? []) {
      if (safeCall(event, fn, args) === false) return false;
    }
    return true;
  },
  callAll(event, ...args) {
    hookCalls.push({ event, args });
    for (const fn of hookHandlers.get(event) ?? []) safeCall(event, fn, args);
    return true;
  },
  onError(source, error) {
    notifications.error.push(`${source}: ${error?.message ?? error}`);
  }
};

let handlebarsReady = false;

/**
 * Registers the comparison and localization helpers Foundry provides to every template, plus the
 * ones this system adds in its init hook, so real templates can be rendered outside Foundry.
 * @returns {Object} The prepared Handlebars instance
 */
function getHandlebars() {
  const handlebars = require("handlebars");
  if (handlebarsReady) return handlebars;
  handlebars.registerHelper({
    localize: value => (typeof value === "string" ? global.game.i18n.localize(value) : value),
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    lt: (a, b) => a < b,
    gt: (a, b) => a > b,
    lte: (a, b) => a <= b,
    gte: (a, b) => a >= b,
    and: (...args) => args.slice(0, -1).every(Boolean),
    or: (...args) => args.slice(0, -1).some(Boolean),
    not: value => !value,
    concat: (...args) => args.slice(0, -1).join(""),
    toLowerCase: value => String(value ?? "").toLowerCase(),
    checkedIf: condition => (condition ? "checked" : ""),
    numberFormat: value => String(value ?? "")
  });
  handlebarsReady = true;
  global.Handlebars = handlebars;
  return handlebars;
}

/**
 * Resolves a template path as Foundry would and reads it, returning null when it does not exist.
 * @param {String} templatePath - A path of the form systems/eclipsephase/templates/...
 * @returns {String|null} The template source
 */
function readTemplate(templatePath) {
  const relative = String(templatePath).replace(/^systems\/eclipsephase\//, "");
  const full = path.join(SYSTEM_ROOT, relative);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
}

/**
 * Registers every partial a template refers to, recursively, so real templates render outside
 * Foundry without the system's own preload step.
 * @param {String} source - The template source to scan
 * @returns {void}
 */
function registerReferencedPartials(source) {
  const handlebars = getHandlebars();
  for (const match of source.matchAll(/\{\{>\s*([^\s}]+)/g)) {
    const name = match[1];
    if (handlebars.partials[name]) continue;
    const partialSource = readTemplate(name);
    if (partialSource === null) continue;
    handlebars.registerPartial(name, partialSource);
    registerReferencedPartials(partialSource);
  }
}

/**
 * Renders a system template with real Handlebars, so template changes surface in tests.
 * @param {String} templatePath - A path of the form systems/eclipsephase/templates/...
 * @param {Object} data - The render context
 * @returns {Promise<String>} The rendered HTML
 */
async function renderTemplate(templatePath, data) {
  const source = readTemplate(templatePath);
  if (source === null) return "";
  registerReferencedPartials(source);
  return getHandlebars().compile(source)(data);
}

const dialogQueue = [];

/**
 * Queues the values the next roll dialogs return, so a roll can be driven without a browser.
 * @param {...Object} results - One result object per upcoming dialog, consumed in order
 * @returns {void}
 */
function seedDialogs(...results) {
  dialogQueue.length = 0;
  dialogQueue.push(...results);
}

/**
 * Clears everything a test may have written: settings, rolls, messages, notifications and hooks.
 * @returns {void}
 */
function resetMock() {
  resetSettings();
  resetIds();
  rollQueue.length = 0;
  dialogQueue.length = 0;
  createdMessages.length = 0;
  notifications.warn.length = 0;
  notifications.error.length = 0;
  notifications.info.length = 0;
  hookCalls.length = 0;
  hookHandlers.clear();
  uuidRegistry.clear();
  global.game.messages.clear();
  global.game.actors.clear();
}

global.foundry = {
  utils: {
    mergeObject,
    deepClone,
    duplicate: deepClone,
    getProperty,
    setProperty,
    expandObject,
    getType,
    isNewerVersion,
    randomID,
    isEmpty: value => !value || Object.keys(value).length === 0,
    logCompatibilityWarning: () => {}
  },
  abstract: {
    TypeDataModel: class TypeDataModel {
      constructor(data = {}, options = {}) {
        Object.assign(this, data);
        this.parent = options.parent ?? null;
      }
      static defineSchema() {
        return {};
      }
    },
    DataModel: class DataModel {}
  },
  applications: {
    handlebars: { renderTemplate, loadTemplates: async () => {} },
    api: {
      DialogV2: class DialogV2 {
        static async wait() {
          return dialogQueue.length ? dialogQueue.shift() : { cancelled: true };
        }
      },
      ApplicationV2: class ApplicationV2 {
        static DEFAULT_OPTIONS = {};
        static PARTS = {};
        constructor(options = {}) { this.options = options; }
        async _prepareContext() { return {}; }
        render() { return this; }
      },
      HandlebarsApplicationMixin: Base => class extends Base {}
    },
    sheets: {
      ActorSheetV2: class ActorSheetV2 {
        static DEFAULT_OPTIONS = {};
        static PARTS = {};
        constructor(options = {}) { this.options = options; }
        async _prepareContext() { return {}; }
        render() { return this; }
      },
      ItemSheetV2: class ItemSheetV2 {}
    },
    ux: { TextEditor: { implementation: { enrichHTML: async html => html ?? "" } } }
  },
  documents: {}
};

global.Hooks = Hooks;
global.Handlebars = getHandlebars();
global.ChatMessage = MockChatMessage;
global.Roll = MockRoll;
global.Collection = MockCollection;
global.Actor = MockActor;
global.Item = MockItem;
global.ActiveEffect = MockActiveEffect;

global.CONST = {
  TOKEN_DISPLAY_MODES: { HOVER: 20, NONE: 0 },
  TOKEN_DISPOSITIONS: { NEUTRAL: 0, FRIENDLY: 1, HOSTILE: -1 },
  ACTIVE_EFFECT_MODES: { ADD: 2, OVERRIDE: 5 },
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 }
};

global.CONFIG = {
  Actor: { documentClass: MockActor, dataModels: {} },
  Item: { documentClass: MockItem, dataModels: {} },
  ActiveEffect: { dataModels: {}, phases: {} },
  Dice: { randomUniform: Math.random },
  ChatMessage: {},
  sounds: { dice: "sounds/dice.wav" }
};

global.ui = {
  notifications: {
    warn: message => notifications.warn.push(message),
    error: message => notifications.error.push(message),
    info: message => notifications.info.push(message)
  }
};

global.game = {
  system: { id: "eclipsephase", version: "2.5" },
  model: buildModel(),
  settings: {
    get: (namespace, key) => settingValues.get(`${namespace}.${key}`),
    set: async (namespace, key, value) => setSetting(namespace, key, value),
    register: () => {}
  },
  i18n: {
    localize: key => key,
    format: (key, data = {}) => `${key}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ""}`,
    lang: "en"
  },
  user: { id: "testuser", _id: "testuser", isGM: true, name: "Tester" },
  users: { activeGM: null, filter: () => [], find: () => null, get: () => null },
  messages: new Map(),
  actors: new Map(),
  items: new Map(),
  packs: new Map(),
  macros: new Map(),
  modules: new Map(),
  socket: { on: () => {}, emit: () => {} },
  eclipsephase: {}
};

global.fromUuid = async uuid => uuidRegistry.get(uuid) ?? null;
global.getDocumentClass = name => (name === "Actor" ? MockActor : MockItem);

global.__ep = {
  SYSTEM_ROOT,
  MockCollection,
  createdMessages,
  notifications,
  hookCalls,
  hookHandlers,
  uuidRegistry,
  setSetting,
  seedRolls,
  seedDialogs,
  resetMock,
  buildModel,
  applyChange
};

resetSettings();
