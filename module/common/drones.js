import EPactor from "../actor/EPactor.js";
import { CONDITION_KEY } from "./conditions.js";
import { CARRIED_TYPES, storedBodyDamage, keepBodyDamage, bodyIsDestroyed } from "./morp-functions.js";
import { SYSTEM_SOCKET, isActingTab, madeHere, registerSocketActions, relayToActiveGM } from "./socket.js";

// A deployed drone is a vehicle a character owns, out on its own as an NPC: its body is a copy of
// the vehicle with all that is bound to it, and it has a token where the character has one. The
// vehicle stays with the character, marked as out, and takes back what happened to the drone when
// it is recalled.

// On the vehicle: the id of the NPC it is out as.
export const DEPLOYED_FLAG = "deployed";
// On the NPC: owner (the character's uuid), vehicle (the item's id), body (its copy's id) and
// items (the id of each copied item's original, by the copy's id).
export const DRONE_FLAG = "drone";

// The conditions a drone does not bring home.
const LEFT_BEHIND = ["unconscious", "prone"];

const NOTE_CARD = "systems/eclipsephase/templates/chat/change.html";
const SKILL_GROUPS = { insight: "skillsIns", moxie: "skillsMox", vigor: "skillsVig" };

/**
 * The NPC a vehicle is out as.
 * @param {Item} vehicle - The vehicle
 * @returns {Actor|null} The drone, or null when the vehicle is not deployed or its NPC is gone
 */
export function deployedDrone(vehicle) {
  const id = vehicle?.flags?.eclipsephase?.[DEPLOYED_FLAG];
  return id ? game.actors.get(id) ?? null : null;
}

/**
 * Whether an actor is a deployed drone.
 * @param {Actor} actor - The actor
 * @returns {Boolean} True for the NPC of a deployed vehicle
 */
export function isDrone(actor) {
  return !!actor?.flags?.eclipsephase?.[DRONE_FLAG];
}

/**
 * Sorts a vehicle's AI skill rows: a row named like one of the system's skills fills that skill, any
 * other becomes a skill of its own, a Know skill when its name says so.
 * @param {Object} rows - The vehicle's system.skills
 * @param {Object} [aptitudes] - The drone's aptitude values by key, taken off a row's total
 * @returns {{skills: Object, items: Object[]}} System data for the named skills, and item data for the rest
 */
export function aiSkillSetup(rows = {}, aptitudes = {}) {
  const skills = {};
  const items = [];
  for (const row of Object.values(rows)) {
    const name = String(row?.name ?? "").trim();
    if (!name) continue;
    const known = EPactor.SKILL_DATA.find(entry => entry.skill === name.toLowerCase());
    if (known) {
      const fromAptitude = (Number(aptitudes[known.aptitude]) || 0) * known.multiplier;
      skills[SKILL_GROUPS[known.category]] ??= {};
      skills[SKILL_GROUPS[known.category]][known.skill] = {
        value: (Number(row.value) || 0) - fromAptitude,
        specname: row.specname ?? "",
        spec: !!row.spec
      };
      continue;
    }
    const know = /^know\s*:/i.test(name);
    items.push({
      _id: foundry.utils.randomID(),
      name: know ? name.replace(/^know\s*:\s*/i, "") : name,
      type: know ? "knowSkill" : "specialSkill",
      system: { value: Number(row.value) || 0, specname: row.specname ?? "" }
    });
  }
  return { skills, items };
}

/**
 * The data of the NPC a vehicle goes out as: a copy of the vehicle as its body, copies of all that
 * is bound to it, its AI skills, and the damage and conditions the vehicle kept.
 * @param {Actor} actor - The character
 * @param {Item} vehicle - Its vehicle
 * @param {String|null} [folderId] - The folder the NPC goes into
 * @returns {Object} Actor data
 */
export function droneActorData(actor, vehicle, folderId = null) {
  const body = vehicle.toObject();
  body._id = foundry.utils.randomID();
  for (const flag of [DEPLOYED_FLAG, "bodyDamage", "bodyConditions"]) delete body.flags?.eclipsephase?.[flag];

  const copies = {};
  const bound = actor.items.filter(item => item.system?.boundTo === vehicle.id).map(item => {
    const data = item.toObject();
    data._id = foundry.utils.randomID();
    data.system.boundTo = "activeMorph";
    copies[data._id] = item.id;
    return data;
  });

  const aptitudes = Object.fromEntries(Object.entries(vehicle.system.aptitudes ?? {}).map(([key, aptitude]) => [key, Number(aptitude?.value) || 0]));
  const ai = aiSkillSetup(vehicle.system.skills, aptitudes);
  const damage = storedBodyDamage(vehicle);

  return {
    name: `${vehicle.name} (${actor.name})`,
    type: "npc",
    img: vehicle.img,
    folder: folderId,
    ownership: foundry.utils.deepClone(actor.ownership ?? {}),
    system: {
      activeMorph: body._id,
      aptitudes: Object.fromEntries(Object.entries(aptitudes).map(([key, value]) => [key, { value }])),
      health: { physical: { value: damage.value } },
      physical: { wounds: damage.wounds },
      pools: { flex: { value: Number(vehicle.system.flex) || 0 } },
      ...ai.skills
    },
    items: [body, ...bound, ...ai.items],
    effects: foundry.utils.deepClone(vehicle.flags?.eclipsephase?.bodyConditions ?? []),
    flags: {
      eclipsephase: {
        [DRONE_FLAG]: { owner: actor.uuid, vehicle: vehicle.id, body: body._id, items: copies },
        defaultMorphAdded: true,
        defaultIdAdded: true,
        resleeving: true
      }
    },
    prototypeToken: {
      name: vehicle.name,
      actorLink: true,
      texture: { src: vehicle.img },
      disposition: actor.prototypeToken?.disposition
    }
  };
}

/**
 * The free square nearest to a token, searched in rings around it.
 * @param {Object} anchor - The token: x, y, width and height in squares
 * @param {Object[]} tokens - The tokens on the scene
 * @param {Number} size - The grid size in pixels
 * @param {Number} [rings] - How far out to look
 * @returns {{x: Number, y: Number}} The square's top left corner; the one to the right when all are taken
 */
export function freeSquareBeside(anchor, tokens, size, rings = 3) {
  const taken = (x, y) => tokens.some(token => {
    const width = (Number(token.width) || 1) * size;
    const height = (Number(token.height) || 1) * size;
    return x < token.x + width && x + size > token.x && y < token.y + height && y + size > token.y;
  });
  const wide = Number(anchor.width) || 1;
  const high = Number(anchor.height) || 1;
  for (let ring = 1; ring <= rings; ring++) {
    const squares = [];
    for (let column = -ring; column < wide + ring; column++) {
      for (let row = -ring; row < high + ring; row++) {
        const onRing = column === -ring || column === wide + ring - 1 || row === -ring || row === high + ring - 1;
        if (onRing) squares.push({ x: anchor.x + column * size, y: anchor.y + row * size });
      }
    }
    // The squares straight beside the token come before its corners, the one to its right first.
    const centre = { x: anchor.x + (wide - 1) * size / 2, y: anchor.y + (high - 1) * size / 2 };
    const far = square => Math.hypot(square.x - centre.x, square.y - centre.y);
    squares.sort((a, b) => far(a) - far(b) || b.x - a.x || a.y - b.y);
    const free = squares.find(square => square.x >= 0 && square.y >= 0 && !taken(square.x, square.y));
    if (free) return free;
  }
  return { x: anchor.x + wide * size, y: anchor.y };
}

/**
 * The folder deployed drones are kept in, made when there is none yet.
 * @returns {Promise<Folder>} The folder
 */
async function droneFolder() {
  const folder = game.folders?.find(entry => entry.type === "Actor" && entry.flags?.eclipsephase?.droneFolder);
  return folder ?? Folder.create({ name: game.i18n.localize("ep2e.morph.drone.folder"), type: "Actor", flags: { eclipsephase: { droneFolder: true } } });
}

/**
 * Posts a short note in the chat as an actor.
 * @param {Actor} actor - Who says it
 * @param {String} key - The lang key
 * @param {Object} data - Its values
 * @returns {Promise<ChatMessage>} The message
 */
async function announce(actor, key, data) {
  const content = await foundry.applications.handlebars.renderTemplate(NOTE_CARD, { type: "note", copy: game.i18n.format(key, data) });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}

/**
 * Sends a vehicle out as a drone: makes its NPC, puts its token beside the character's on the active
 * scene when there is one, and marks the vehicle as out. Run by a GM.
 * @param {Actor} actor - The character
 * @param {String} vehicleId - Its vehicle
 * @returns {Promise<{drone: Actor, placed: Boolean}|null>} The drone and whether it got a token, or null when it cannot go out
 */
export async function createDrone(actor, vehicleId) {
  const vehicle = actor?.items.get(vehicleId);
  if (vehicle?.type !== "vehicle" || deployedDrone(vehicle) || actor.system.activeJam === vehicleId || bodyIsDestroyed(vehicle)) return null;

  const folder = await droneFolder();
  const drone = await Actor.create(droneActorData(actor, vehicle, folder?.id ?? null));
  await vehicle.setFlag("eclipsephase", DEPLOYED_FLAG, drone.id);

  const scene = game.scenes?.active;
  const anchor = scene?.tokens?.find(token => token.actorId === actor.id);
  if (anchor) {
    const spot = freeSquareBeside(anchor, Array.from(scene.tokens), scene.grid.size);
    const token = await drone.getTokenDocument({ ...spot, elevation: anchor.elevation ?? 0 });
    await scene.createEmbeddedDocuments("Token", [token.toObject()]);
  }

  await announce(actor, "ep2e.morph.drone.announce.deployed", { drone: vehicle.name });
  return { drone, placed: !!anchor };
}

/**
 * Sends a vehicle out as a drone. A player's request is carried out by the active GM, as players
 * may not make actors; a drone without a token opens its sheet for whoever sent it out.
 * @param {Actor} actor - The character
 * @param {String} vehicleId - Its vehicle
 * @returns {Promise<void>}
 */
export async function deployDrone(actor, vehicleId) {
  if (!game.user.isGM) {
    relayToActiveGM("deployDrone", { actorUuid: actor.uuid, vehicleId, userId: game.user.id });
    return;
  }
  const out = await createDrone(actor, vehicleId);
  if (out && !out.placed) out.drone.sheet?.render(true);
}

/**
 * What a recall changes on the character: the copies' state written onto their originals, the
 * originals whose copy is gone, and what the drone picked up.
 * @param {Actor} drone - The drone
 * @param {Actor} owner - The character
 * @param {Item} vehicle - The vehicle it is
 * @returns {{updates: Object[], deletions: String[], creations: Object[]}} The changes
 */
export function recallChanges(drone, owner, vehicle) {
  const link = drone.flags.eclipsephase[DRONE_FLAG];
  const updates = [];
  const deletions = [];
  for (const [copyId, originalId] of Object.entries(link.items ?? {})) {
    if (!owner.items.get(originalId)) continue;
    const copy = drone.items.get(copyId);
    if (!copy) {
      deletions.push(originalId);
      continue;
    }
    const data = copy.toObject();
    updates.push({ _id: originalId, name: data.name, system: { ...data.system, boundTo: vehicle.id } });
  }

  // Its AI skills are the vehicle's own rows and stay behind with its body.
  const returning = [...CARRIED_TYPES, "ware", "traits"];
  const creations = drone.items
    .filter(item => returning.includes(item.type) && !(item.id in (link.items ?? {})))
    .map(item => {
      const data = item.toObject();
      delete data._id;
      data.system.boundTo = vehicle.id;
      return data;
    });
  return { updates, deletions, creations };
}

/**
 * Brings a drone home: its damage, conditions and what it carries go back onto the character's
 * vehicle, its tokens and its NPC are removed, and the vehicle is no longer out. A destroyed drone
 * comes back the same way, written off. Run by a GM.
 * @param {Actor} drone - The drone
 * @returns {Promise<void>}
 */
export async function bringDroneHome(drone) {
  const link = drone?.flags?.eclipsephase?.[DRONE_FLAG];
  if (!link) return;
  const owner = await fromUuid(link.owner);
  const vehicle = owner?.items.get(link.vehicle);
  const destroyed = drone.statuses?.has("dead") === true;

  if (vehicle) {
    await keepBodyDamage(vehicle, drone.system.health.physical.value, drone.system.physical.wounds);
    // Collected, a drone is picked up and switched back on: lying prone or knocked out does not come home with it.
    const kept = effect => effect.flags?.eclipsephase?.effectKey === CONDITION_KEY && !Array.from(effect.statuses ?? []).some(status => LEFT_BEHIND.includes(status));
    const conditions = Array.from(drone.effects ?? []).filter(kept).map(effect => {
      const data = effect.toObject();
      delete data._id;
      return data;
    });
    if (conditions.length) await vehicle.setFlag("eclipsephase", "bodyConditions", conditions);
    else if (vehicle.getFlag("eclipsephase", "bodyConditions")) await vehicle.unsetFlag("eclipsephase", "bodyConditions");

    const { updates, deletions, creations } = recallChanges(drone, owner, vehicle);
    if (updates.length) await owner.updateEmbeddedDocuments("Item", updates);
    if (deletions.length) await owner.deleteEmbeddedDocuments("Item", deletions);
    if (creations.length) await owner.createEmbeddedDocuments("Item", creations);
    await vehicle.unsetFlag("eclipsephase", DEPLOYED_FLAG);
  }

  for (const scene of game.scenes ?? []) {
    const tokens = scene.tokens.filter(token => token.actorId === drone.id).map(token => token.id);
    if (tokens.length) await scene.deleteEmbeddedDocuments("Token", tokens);
  }
  const name = vehicle?.name ?? drone.name;
  await drone.delete();
  if (owner) await announce(owner, destroyed ? "ep2e.morph.drone.announce.writtenOff" : "ep2e.morph.drone.announce.recalled", { drone: name });
}

/**
 * Recalls a drone, or writes off a destroyed one. A player's request is carried out by the active GM.
 * @param {Actor} drone - The drone
 * @returns {Promise<void>}
 */
export async function recallDrone(drone) {
  if (!drone) return;
  if (!game.user.isGM) {
    relayToActiveGM("recallDrone", { droneId: drone.id });
    return;
  }
  await bringDroneHome(drone);
}

/**
 * Lets the active GM send out and bring home drones for players, opens a drone's sheet for the
 * player who sent it out without a token, keeps the owner's open sheet in step with its drone, and
 * frees a vehicle whose drone was deleted by hand.
 * @returns {void}
 */
export function registerDrones() {
  registerSocketActions({
    deployDrone: async ({ actorUuid, vehicleId, userId }) => {
      const actor = await fromUuid(actorUuid);
      const out = actor ? await createDrone(actor, vehicleId) : null;
      if (out && !out.placed) game.socket.emit(SYSTEM_SOCKET, { action: "droneOut", userId, droneId: out.drone.id });
    },
    recallDrone: async ({ droneId }) => bringDroneHome(game.actors.get(droneId))
  });
  registerSocketActions({
    droneOut: async ({ userId, droneId }) => {
      if (userId === game.user.id && isActingTab()) game.actors.get(droneId)?.sheet?.render(true);
    }
  }, { gmOnly: false });

  // The owner's open sheet shows its drone's health and state, so it follows what happens to the drone.
  const refreshOwner = async actor => {
    const link = actor?.flags?.eclipsephase?.[DRONE_FLAG];
    if (!link) return;
    const owner = await fromUuid(link.owner);
    if (owner?.sheet?.rendered) owner.sheet.render(false);
  };
  Hooks.on("updateActor", actor => refreshOwner(actor));
  Hooks.on("createActiveEffect", effect => refreshOwner(effect.parent));
  Hooks.on("deleteActiveEffect", effect => refreshOwner(effect.parent));

  Hooks.on("deleteActor", async (actor, options, userId) => {
    const link = actor.flags?.eclipsephase?.[DRONE_FLAG];
    // After a recall the vehicle is free already, and nothing is left to do here.
    if (!link || !madeHere(userId, options)) return;
    const owner = await fromUuid(link.owner);
    const vehicle = owner?.items.get(link.vehicle);
    if (vehicle?.getFlag("eclipsephase", DEPLOYED_FLAG) === actor.id) await vehicle.unsetFlag("eclipsephase", DEPLOYED_FLAG);
  });
}
