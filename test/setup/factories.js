const fs = require("fs");
const path = require("path");

const { SYSTEM_ROOT, setSetting, seedRolls, seedDialogs, resetMock } = global.__ep;

const EPactor = require(path.join(SYSTEM_ROOT, "module", "actor", "EPactor.js")).default;
const EPitem = require(path.join(SYSTEM_ROOT, "module", "item", "EPitem.js")).default;
const { eclipsephase } = require(path.join(SYSTEM_ROOT, "module", "config.js"));
const { registerRegistryHelpers } = require(path.join(SYSTEM_ROOT, "module", "api", "registry.js"));

global.CONFIG.Actor.documentClass = EPactor;
global.CONFIG.Item.documentClass = EPitem;
global.CONFIG.eclipsephase = eclipsephase;
registerRegistryHelpers();

/**
 * The defaults for one document sub-type: a registered data model if the type has one, otherwise
 * template.json, matching how Foundry resolves a sub-type's schema.
 * @param {String} documentName - Either "Actor" or "Item"
 * @param {String} type - The sub-type, e.g. "character"
 * @returns {Object} A fresh copy of the defaults
 */
function modelFor(documentName, type) {
  const dataModel = global.CONFIG[documentName]?.dataModels?.[type];
  if (dataModel) return dataModel.cleanData();
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

/**
 * Builds an unlinked token on a scene: the token's own copy of an actor, parented to the token and
 * kept out of the world's actor list, the way Foundry holds it. Build the copy before the world
 * actor it shares an id with, so the world actor keeps the plain actor uuid.
 * @param {Object} scene - A scene stand-in with a uuid and a tokens array
 * @param {Object} data - Actor data, as makeActor takes it
 * @param {Object} [tokenData] - The token's id and name
 * @returns {Actor} The token's actor copy
 */
function makeUnlinkedToken(scene, data, { id = `token-${scene.tokens.length + 1}`, name } = {}) {
  const actor = makeActor(data);
  global.game.actors.delete(actor.id);
  const token = { documentName: "Token", id, name: name ?? actor.name, actorLink: false, actor, uuid: `${scene.uuid}.Token.${id}` };
  actor.parent = token;
  global.__ep.uuidRegistry.set(actor.uuid, actor);
  scene.tokens.push(token);
  return actor;
}

/**
 * Registers every system compendium as a pack read straight from its source files under
 * src/packs, so code that reads a compendium - an old migration fetching a replacement item, the
 * drug backfill - meets the real content. Documents are built fresh on every read.
 * @returns {void}
 */
function registerSystemPacks() {
  const root = path.join(SYSTEM_ROOT, "src", "packs");
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const sources = () => fs.readdirSync(dir)
      .filter(file => file.endsWith(".json"))
      .map(file => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")))
      .filter(doc => doc._key?.startsWith("!items!") || doc._key?.startsWith("!actors!"));
    const build = doc => doc._key.startsWith("!actors!")
      ? new global.CONFIG.Actor.documentClass(doc)
      : new global.CONFIG.Item.documentClass(doc);
    const type = sources()[0]?._key?.startsWith("!actors!") ? "Actor" : "Item";
    global.game.packs.set(`eclipsephase.${name}`, {
      collection: `eclipsephase.${name}`,
      metadata: { package: "eclipsephase", name, type },
      getDocument: async id => {
        const doc = sources().find(entry => entry._id === id);
        return doc ? build(doc) : null;
      },
      getDocuments: async () => sources().map(build)
    });
  }
}

module.exports = {
  makeActor,
  makeItem,
  makeUnlinkedToken,
  registerSystemPacks,
  makeActorFromFixture,
  fixtureNames,
  loadPackItem,
  modelFor,
  resetWorld,
  setSetting,
  seedRolls,
  seedDialogs
};

