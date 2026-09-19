const fs = require("fs");
const path = require("path");

const { SYSTEM_ROOT, setSetting, seedRolls, resetMock } = global.__ep;

const EPactor = require(path.join(SYSTEM_ROOT, "module", "actor", "EPactor.js")).default;
const EPitem = require(path.join(SYSTEM_ROOT, "module", "item", "EPitem.js")).default;
const { eclipsephase } = require(path.join(SYSTEM_ROOT, "module", "config.js"));

global.CONFIG.Actor.documentClass = EPactor;
global.CONFIG.Item.documentClass = EPitem;
global.CONFIG.eclipsephase = eclipsephase;

/**
 * The template.json defaults for one document sub-type.
 * @param {String} documentName - Either "Actor" or "Item"
 * @param {String} type - The sub-type, e.g. "character"
 * @returns {Object} A fresh copy of the defaults
 */
function modelFor(documentName, type) {
  return foundry.utils.deepClone(global.game.model[documentName]?.[type] ?? {});
}

/**
 * Loads a compendium source file so tests exercise real content instead of hand-written copies.
 * @param {String} relativePath - A path under src/packs, e.g. "traits/Psi_II_TY0Nu1Aat61Vz1qK.json"
 * @returns {Object} The raw document data
 */
function loadPackItem(relativePath) {
  const full = path.join(SYSTEM_ROOT, "src", "packs", relativePath);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

/**
 * Builds an Item of the system's own class with template defaults filled in.
 * @param {Object} data - Partial item data; system is merged over the type defaults
 * @param {Object} [context] - Document context, normally {parent}
 * @returns {EPitem} The prepared item
 */
function makeItem(data = {}, context = {}) {
  const type = data.type ?? "gear";
  const system = foundry.utils.mergeObject(modelFor("Item", type), data.system ?? {});
  const item = new EPitem({ ...data, type, system }, context);
  item.prepareData();
  return item;
}

/**
 * Builds an Actor of the system's own class with template defaults filled in and prepareData run.
 * Item data is merged against its own type defaults first, so fixtures only carry what matters.
 * @param {Object} data - Partial actor data with optional items and packItems arrays
 * @returns {EPactor} The prepared actor
 */
function makeActor(data = {}) {
  const type = data.type ?? "character";
  const system = foundry.utils.mergeObject(modelFor("Actor", type), data.system ?? {});

  const items = [];
  for (const relativePath of data.packItems ?? []) items.push(loadPackItem(relativePath));
  for (const itemData of data.items ?? []) items.push(itemData);

  const resolvedItems = items.map(itemData => {
    const itemType = itemData.type ?? "gear";
    return {
      ...itemData,
      type: itemType,
      system: foundry.utils.mergeObject(modelFor("Item", itemType), itemData.system ?? {})
    };
  });

  const actor = new EPactor({
    _id: data._id,
    name: data.name ?? "Test Actor",
    type,
    system,
    flags: data.flags ?? {},
    items: resolvedItems,
    effects: data.effects ?? []
  });

  for (const [key, value] of Object.entries(data.settings ?? {})) setSetting("eclipsephase", key, value);

  actor.prepareData();
  global.game.actors.set(actor.id, actor);
  return actor;
}

/**
 * Loads a fixture by name and builds the actor it describes.
 * @param {String} name - A file name under test/fixtures without the extension
 * @returns {EPactor} The prepared actor
 */
function makeActorFromFixture(name) {
  const full = path.join(SYSTEM_ROOT, "test", "fixtures", `${name}.json`);
  return makeActor(JSON.parse(fs.readFileSync(full, "utf8")));
}

/**
 * Lists every fixture file name, so snapshot suites cover new fixtures automatically.
 * @returns {String[]} Fixture names without the extension, sorted
 */
function fixtureNames() {
  const dir = path.join(SYSTEM_ROOT, "test", "fixtures");
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, "")).sort();
}

/**
 * Restores settings, ids, rolls, messages and hooks between tests.
 * @returns {void}
 */
function resetWorld() {
  resetMock();
}

module.exports = {
  makeActor,
  makeItem,
  makeActorFromFixture,
  fixtureNames,
  loadPackItem,
  modelFor,
  resetWorld,
  setSetting,
  seedRolls
};
