import { getBodyBindingInfo } from "./morp-functions.js";
import { postDrugCard } from "./doses.js";
import { neededTierTrait, ownsOtherFamily, findTrait } from "./sleight-prerequisite.js";

// Traits, sleights and the like a dose lends for as long as it runs - Fokus's Enhanced Behavior:
// Obsessive, Schizo's Schizophrenia, Psi-Opener's chi sleight. Authored on the drug as rows of
// { pack, folder, item, title, description, or }: a row names a compendium, optionally a folder in
// it, and an item or "random". Rows are granted together unless an "or" row starts a new package;
// one package is then picked at even odds.

export const RANDOM = "random";

/**
 * The id of the folder a folder sits in, whether Foundry hands the parent as a document or an id.
 * @param {Object} folder - A compendium folder
 * @returns {String|null} The parent's id
 */
function parentId(folder) {
  if (!folder?.folder) return null;
  return typeof folder.folder === "string" ? folder.folder : folder.folder.id ?? null;
}

/**
 * A compendium's folders as a flat list in tree order, each with its depth.
 * @param {Object[]} folders - The pack's folders
 * @returns {Object[]} id, name and depth per folder
 */
export function folderTree(folders = []) {
  const list = Array.from(folders);
  const out = [];
  const walk = (parent, depth) => {
    list.filter(folder => parentId(folder) === parent)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(folder => {
        out.push({ id: folder.id, name: folder.name, depth });
        walk(folder.id, depth + 1);
      });
  };
  walk(null, 0);
  return out;
}

/**
 * A folder and every folder below it.
 * @param {Object[]} folders - The pack's folders
 * @param {String} folderId - The folder
 * @returns {Set<String>} Its id and the ids beneath it
 */
export function folderSubtree(folders = [], folderId) {
  const list = Array.from(folders);
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of list) {
      if (!ids.has(folder.id) && ids.has(parentId(folder))) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * The items a row can draw from: everything in its folder and the folders beneath, or the whole
 * compendium when no folder is set.
 * @param {Object[]} index - The pack's index entries
 * @param {Object[]} folders - The pack's folders
 * @param {String} folderId - The row's folder, or "" for the whole pack
 * @returns {Object[]} The index entries, by name
 */
export function rowCandidates(index = [], folders = [], folderId = "") {
  const entries = Array.from(index);
  const inScope = folderId ? folderSubtree(folders, folderId) : null;
  return entries
    .filter(entry => !inScope || inScope.has(typeof entry.folder === "string" ? entry.folder : entry.folder?.id ?? null))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The rows split into the packages one of which a dose grants: a row marked "or" starts a new
 * package, every other row joins the one before it. Rows without a compendium are ignored.
 * @param {Object[]} grants - The drug's rows
 * @returns {Object[][]} The packages
 */
export function grantPackages(grants = []) {
  const packages = [];
  for (const row of grants) {
    if (!row?.pack) continue;
    if (!packages.length || row.or === true) packages.push([]);
    packages.at(-1).push(row);
  }
  return packages;
}

/**
 * Picks one entry at even odds.
 * @param {Array} list - What to pick from
 * @param {Function} random - Returns a number in [0, 1)
 * @returns {*} The entry, or undefined for an empty list
 */
function pick(list, random) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/**
 * The item a row stands for, as source data ready to be put on a sheet: the GM's additional title
 * in brackets after its name, their additional description above its own. A random row draws only
 * from what the actor does not have yet.
 * @param {Object} row - The row
 * @param {Function} [random] - Returns a number in [0, 1)
 * @param {Actor} [actor] - The actor it is for
 * @returns {Promise<Object|null>} The item data, or null when the row finds nothing
 */
export async function resolveGrant(row, random = Math.random, actor = null) {
  const pack = game.packs.get(row.pack);
  if (!pack) return null;
  let id = row.item && row.item !== RANDOM ? row.item : null;
  if (!id) {
    const owned = entry => Array.from(actor?.items ?? []).some(item => item.type === entry.type && item.name === entry.name);
    const candidates = rowCandidates(await pack.getIndex({ fields: ["folder"] }), pack.folders, row.folder).filter(entry => !owned(entry));
    id = pick(candidates, random)?._id ?? null;
  }
  const document = id ? await pack.getDocument(id) : null;
  if (!document) return null;

  const data = document.toObject();
  delete data._id;
  delete data.folder;
  const title = String(row.title ?? "").trim();
  if (title) data.name = `${data.name} (${title})`;
  const prepared = String(row.description ?? "").trim();
  if (prepared) data.system.description = `<p>${prepared}</p>${data.system.description ?? ""}`;
  return data;
}

/**
 * Whether the actor already has exactly this item: the same name and type and, word for word, the
 * same description. One that differs at all is granted as well.
 * @param {Actor} actor - The actor
 * @param {Object} data - The item data
 * @returns {Boolean} True for an exact match
 */
export function alreadyHas(actor, data) {
  return Array.from(actor.items ?? []).some(item =>
    item.type === data.type && item.name === data.name && (item.system?.description ?? "") === (data.system?.description ?? ""));
}

/**
 * Settles where a granted item sits: a trait goes to the body the ego is sleeved in, unless it can
 * only be an ego trait. Anything else is put on as it comes.
 * @param {Actor} actor - The actor
 * @param {Object} data - The item data, changed in place
 * @returns {Object} The data
 */
export function placeGrant(actor, data) {
  if (data.type !== "traits") return data;
  const system = data.system;
  const { bodies, boundToFor } = getBodyBindingInfo(actor);
  const body = bodies.find(entry => entry.id === actor.system?.activeMorph) ?? bodies[0];
  if (system.morph === true && (body || actor.type !== "character")) {
    system.ego = false;
    system.boundTo = body ? boundToFor(body) : "activeMorph";
  }
  else if (system.ego === true) {
    system.morph = false;
  }
  return data;
}

/**
 * The Psi or Ki trait a granted sleight needs and the actor lacks, as the drop of a sleight would
 * offer it: Psi I for a chi sleight, Psi II for a gamma one. Nothing when the actor already has
 * the tier or a higher one, when the same grant brings it, or when the actor follows another
 * strain family.
 * @param {Actor} actor - The actor
 * @param {Object} data - The granted item's data
 * @param {Object[]} incoming - What the grant brings so far
 * @returns {Promise<Object|null>} The trait's data, or null when none is needed
 */
async function missingTierTrait(actor, data, incoming) {
  if (data.type !== "aspect") return null;
  const family = data.system?.strainFamily ?? "psi";
  if (ownsOtherFamily(actor, family)) return null;
  const needed = neededTierTrait(actor, data);
  if (!needed || incoming.some(entry => entry.type === "traits" && entry.name === needed.trait.name)) return null;
  const trait = await findTrait(needed.trait);
  if (!trait) return null;
  const traitData = trait.toObject();
  delete traitData._id;
  delete traitData.folder;
  return traitData;
}

/**
 * Puts what a dose grants on the actor: one package of its rows, each row's item placed and marked
 * as lent by the dose, so it goes again with it. Posts a card naming what was granted.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The running dose
 * @param {Function} [random] - Returns a number in [0, 1)
 * @returns {Promise<Item[]>} The items granted
 */
export async function grantTemporaryItems(actor, effect, random = Math.random) {
  const dose = effect?.getFlag?.("eclipsephase", "dose");
  const packages = grantPackages(dose?.grants);
  if (!packages.length) return [];

  const rows = pick(packages, random);
  const incoming = [];
  const lend = data => {
    foundry.utils.setProperty(data, "flags.eclipsephase.grantedBy", effect.id);
    incoming.push(placeGrant(actor, data));
  };
  for (const row of rows) {
    const data = await resolveGrant(row, random, actor);
    if (!data || alreadyHas(actor, data)) continue;
    lend(data);
    const tierTrait = await missingTierTrait(actor, data, incoming);
    if (tierTrait) lend(tierTrait);
  }
  if (!incoming.length) return [];

  const created = await actor.createEmbeddedDocuments("Item", incoming);
  await postDrugCard(actor, {
    icon: "fa-syringe",
    color: "--negative",
    headline: game.i18n.format("ep2e.chat.dose.granted", { name: dose.name, items: created.map(item => item.name).join(", ") })
  });
  return created;
}

/**
 * Hangs the grants on the dose: granted on the active GM's client when a dose takes hold - a
 * renewal keeps what was granted - and taken off again, by whoever removed it, when the dose ends.
 * @returns {void}
 */
export function registerGrantHooks() {
  Hooks.on("createActiveEffect", effect => {
    if (!game.users.activeGM?.isSelf) return;
    const dose = effect.getFlag?.("eclipsephase", "dose");
    const actor = effect.parent;
    if (dose?.grants?.length && actor instanceof Actor) grantTemporaryItems(actor, effect);
  });
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user.id || effect.getFlag?.("eclipsephase", "dose") === undefined) return;
    const actor = effect.parent;
    const granted = Array.from(actor?.items ?? []).filter(item => item.getFlag?.("eclipsephase", "grantedBy") === effect.id);
    if (granted.length) actor.deleteEmbeddedDocuments("Item", granted.map(item => item.id));
  });
}
