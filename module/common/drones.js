import EPactor from "../actor/EPactor.js";
import { CONDITION_KEY } from "./conditions.js";
import { CARRIED_TYPES, storedBodyDamage, keepBodyDamage, bodyIsDestroyed } from "./morp-functions.js";
import { SYSTEM_SOCKET, isActingTab, madeHere, registerSocketActions, relayToActiveGM } from "./socket.js";
import { confirmation } from "./general-sheet-functions.js";

// A deployed drone is a vehicle a character owns, out on its own as an NPC: its body is a copy of
// the vehicle with all that is bound to it, and it has a token where the character has one. The
// vehicle stays with the character, marked as out, and takes back what happened to the drone when
// it is recalled. Jamming works through the same NPC: the ego's aptitudes and skills are laid over
// it while the character's sheet stays its own body. A body jammed from home - a vehicle, or a morph
// with a puppet sock - goes out for the length of the jam and is collected when the jam ends.

// On the vehicle: the id of the NPC it is out as.
export const DEPLOYED_FLAG = "deployed";
// On the NPC: owner (the character's uuid), vehicle (the item's id), body (its copy's id), items
// (the id of each copied item's original, by the copy's id) and temporary (out only for a jam).
export const DRONE_FLAG = "drone";

// On the character: the id of the deployed drone its ego jams.
export const JAMMED_DRONE_FLAG = "jammedDrone";
// On the drone while jammed, what is left of three kinds of Flex: droneFlex of the drone's own body,
// ownFlex of the ego's own body, and egoFlex of the ego itself - one pool both bodies draw on.
export const DRONE_JAM_FLAG = "droneJam";
// The option the two sheets' Flex is kept in step with, so that keeping step sets nothing off again.
const FLEX_SYNC = "eclipsephaseFlexSync";
// What a trait may do for its ego but not for a drone the ego jams.
const NOT_CARRIED = ["system.additionalSystems.hasPsi"];
const SKILL_LISTS = ["skillsIns", "skillsMox", "skillsVig"];

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
 * @param {Item} vehicle - Its vehicle, or a morph of its that is jammed
 * @param {String|null} [folderId] - The folder the NPC goes into
 * @param {Boolean} [temporary] - True when it goes out only for the length of a jam
 * @returns {Object} Actor data
 */
export function droneActorData(actor, vehicle, folderId = null, temporary = false) {
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
        [DRONE_FLAG]: { owner: actor.uuid, vehicle: vehicle.id, body: body._id, items: copies, temporary },
        defaultMorphAdded: true,
        defaultIdAdded: true
      }
    },
    prototypeToken: {
      name: vehicle.name,
      actorLink: true,
      texture: { src: vehicle.system.customToken || vehicle.img },
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
 * Sends a body out as a drone: makes its NPC, puts its token beside the character's on the active
 * scene when there is one, and marks the body as out. A vehicle goes out to act on its own; for the
 * length of a jam any body but the sleeved morph does. Run by a GM.
 * @param {Actor} actor - The character
 * @param {String} bodyId - Its vehicle or morph
 * @param {Object} [options] - temporary: out only for a jam, and not announced
 * @returns {Promise<{drone: Actor, placed: Boolean}|null>} The drone and whether it got a token, or null when it cannot go out
 */
export async function createDrone(actor, bodyId, { temporary = false } = {}) {
  const body = actor?.items.get(bodyId);
  const goesOut = body?.type === "vehicle" || (temporary && body?.type === "morph" && actor.system.activeMorph !== bodyId);
  if (!goesOut || deployedDrone(body) || bodyIsDestroyed(body)) return null;

  const folder = await droneFolder();
  const drone = await Actor.create(droneActorData(actor, body, folder?.id ?? null, temporary));
  // Its pools start full, which only an actor that exists can be told.
  await drone.update({ "flags.eclipsephase.resleeving": true });
  await body.setFlag("eclipsephase", DEPLOYED_FLAG, drone.id);

  const scene = game.scenes?.active;
  const anchor = scene?.tokens?.find(token => token.actorId === actor.id);
  if (anchor) {
    const spot = freeSquareBeside(anchor, Array.from(scene.tokens), scene.grid.size);
    const token = await drone.getTokenDocument({ ...spot, elevation: anchor.elevation ?? 0 });
    await scene.createEmbeddedDocuments("Token", [token.toObject()]);
  }

  if (!temporary) await announce(actor, "ep2e.morph.drone.announce.deployed", { drone: body.name });
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
  // A drone that comes home is jammed no longer.
  if (owner && jammedDrone(owner)?.id === drone.id) await endDroneJam(owner);

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
  // A body that was out only for a jam comes home without a word, unless it is broken.
  if (owner && destroyed) await announce(owner, "ep2e.morph.drone.announce.writtenOff", { drone: name });
  else if (owner && !link.temporary) await announce(owner, "ep2e.morph.drone.announce.recalled", { drone: name });
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
 * The deployed drone a character's ego jams.
 * @param {Actor} actor - The character
 * @returns {Actor|null} The drone
 */
export function jammedDrone(actor) {
  const id = actor?.flags?.eclipsephase?.[JAMMED_DRONE_FLAG];
  return id ? game.actors.get(id) ?? null : null;
}

/**
 * The character whose ego jams a deployed drone.
 * @param {Actor} drone - The drone
 * @returns {Actor|null} The character, or null while nobody jams it
 */
export function jammingEgo(drone) {
  const flags = drone?.flags?.eclipsephase;
  if (!flags?.[DRONE_JAM_FLAG] || !flags[DRONE_FLAG]) return null;
  return fromUuidSync(flags[DRONE_FLAG].owner) ?? null;
}

/**
 * Lays the jamming ego over a drone's prepared data: its aptitudes, skills and Ego Flex take the
 * place of the drone's AI, while the body stays the drone's. Nothing of it is stored on the drone.
 * @param {Object} actorModel - The drone's system data being prepared
 * @param {Actor} ego - The character jamming it
 * @returns {void}
 */
export function applyEgoOverlay(actorModel, ego) {
  const source = ego._source?.system ?? ego.system;
  for (const [key, aptitude] of Object.entries(actorModel.aptitudes ?? {})) aptitude.value = Number(source.aptitudes?.[key]?.value) || 0;
  for (const list of SKILL_LISTS) {
    for (const [key, skill] of Object.entries(actorModel[list] ?? {})) {
      const own = source[list]?.[key] ?? {};
      skill.value = Number(own.value) || 0;
      skill.specname = own.specname ?? "";
      skill.spec = !!own.spec;
    }
  }
  actorModel.ego.egoFlex = Number(source.ego?.egoFlex) || 0;
  actorModel.additionalSystems.droneJam = true;
}

/**
 * Takes what the ego overlay shows out of the data a jammed drone's sheet is about to save.
 * @param {Object} data - The sheet's submit data
 * @returns {Object} The same data without aptitudes, skills and Ego Flex
 */
export function stripEgoOverlay(data) {
  if (!data?.system) return data;
  delete data.system.aptitudes;
  for (const list of SKILL_LISTS) delete data.system[list];
  if (data.system.ego) delete data.system.ego.egoFlex;
  return data;
}

/**
 * The effects of the jamming ego a drone feels too: those of its ego traits, the lasting result of
 * its Integration Test, and whatever changes how it jams, such as a Drone Rig.
 * @param {Actor} ego - The character jamming the drone
 * @returns {Generator<ActiveEffect>} The effects
 */
export function* egoEffects(ego) {
  const keysOf = effect => (effect.changes ?? effect.system?.changes ?? []).map(change => change.key ?? "");
  for (const effect of ego.effects ?? []) {
    if (effect.flags?.eclipsephase?.effectKey === "integrationIssues") yield effect;
  }
  for (const item of ego.items ?? []) {
    const egoTrait = item.type === "traits" && !item.system?.boundTo;
    for (const effect of item.effects ?? []) {
      if (effect.transfer === false) continue;
      const keys = keysOf(effect);
      const forJamming = keys.some(key => key.startsWith("system.additionalSystems.jamming."));
      if (forJamming || (egoTrait && !keys.some(key => NOT_CARRIED.includes(key)))) yield effect;
    }
  }
}

/**
 * The jamming ego's Field and Know skills as the drone's sheet lists them, rolled with the
 * aptitudes laid over the drone.
 * @param {Actor} ego - The character jamming the drone
 * @param {Object} aptitudes - The drone's prepared aptitudes
 * @returns {{special: Object[], know: Object[]}} The rows
 */
export function egoSkillRows(ego, aptitudes) {
  const rows = type => ego.items.filter(item => item.type === type).map(item => {
    const aptitude = Number(aptitudes?.[item.system.aptitude]?.value) || 0;
    return { _id: item.id, id: item.id, name: item.name, img: item.img, type, system: item.system, roll: Math.min(100, (Number(item.system.value) || 0) + aptitude) };
  });
  return { special: rows("specialSkill"), know: rows("knowSkill") };
}

/**
 * How much Flex of the ego's own is left, and how much of its real body's, read off the character.
 * Flex is spent body first, as jamming a body at hand counts it.
 * @param {Actor} actor - The character
 * @returns {{ego: Number, body: Number}} What is left of each
 */
function flexLeft(actor) {
  const egoFlex = Number(actor.system.ego?.egoFlex) || 0;
  const total = Number(actor.system.pools.flex.totalFlex) || 0;
  const bodyMax = total - egoFlex;
  const spent = total - (Number(actor.system.pools.flex.value) || 0);
  return { ego: Math.max(0, egoFlex - Math.max(0, spent - bodyMax)), body: Math.max(0, bodyMax - spent) };
}

/**
 * What a change of a body's Flex pool does to the Flex of that body and to the ego's: a body spends
 * its own Flex first and the ego's after, and what comes back fills the ego's first.
 * @param {Number} bodyFlex - What is left of the body's own Flex
 * @param {Number} egoFlex - What is left of the Ego Flex
 * @param {Number} change - By how much the pool changed: negative when spent
 * @param {Number} egoMax - The ego's Flex when full
 * @returns {{body: Number, ego: Number}} What is left of each afterwards
 */
export function flexAfter(bodyFlex, egoFlex, change, egoMax) {
  if (change < 0) {
    const fromBody = Math.min(-change, bodyFlex);
    return { body: bodyFlex - fromBody, ego: Math.max(0, egoFlex + change + fromBody) };
  }
  const toEgo = Math.min(change, Math.max(0, egoMax - egoFlex));
  return { body: bodyFlex + change - toEgo, ego: egoFlex + toEgo };
}

/**
 * Keeps the Flex shown on a jammed drone and on the character jamming it in step: Ego Flex is one
 * pool, so what either body spends of it is gone for the other too.
 * @param {Actor} actor - The drone or the character, whose Flex pool just changed
 * @returns {Promise<void>}
 */
export async function shareEgoFlex(actor) {
  const drone = jammingEgo(actor) ? actor : jammedDrone(actor);
  const ego = drone ? jammingEgo(drone) : null;
  const jam = drone?.flags?.eclipsephase?.[DRONE_JAM_FLAG];
  if (!ego || !jam) return;

  const egoMax = Number(ego.system.ego?.egoFlex) || 0;
  const onDrone = actor === drone;
  const before = (onDrone ? jam.droneFlex : jam.ownFlex) + jam.egoFlex;
  const change = (Number(actor.system.pools.flex.value) || 0) - before;
  if (!change) return;

  const after = flexAfter(onDrone ? jam.droneFlex : jam.ownFlex, jam.egoFlex, change, egoMax);
  const next = { droneFlex: onDrone ? after.body : jam.droneFlex, ownFlex: onDrone ? jam.ownFlex : after.body, egoFlex: after.ego };
  await drone.update({
    [`flags.eclipsephase.${DRONE_JAM_FLAG}`]: next,
    "system.pools.flex.value": next.droneFlex + next.egoFlex
  }, { [FLEX_SYNC]: true });
  await ego.update({ "system.pools.flex.value": next.ownFlex + next.egoFlex }, { [FLEX_SYNC]: true });
}

/**
 * Lets the ego act through a drone from now on: with the drone's pools and its own Ego Flex, which
 * both bodies share, while its real body stays where it is. Says so in the chat, with the
 * Integration Test to roll.
 * @param {Actor} actor - The character
 * @param {Actor} drone - The drone
 * @returns {Promise<void>}
 */
export async function startDroneJam(actor, drone) {
  const left = flexLeft(actor);
  const droneFlex = Number(drone.system.pools.flex.value) || 0;
  await drone.update({
    [`flags.eclipsephase.${DRONE_JAM_FLAG}`]: { droneFlex, ownFlex: left.body, egoFlex: left.ego },
    "system.pools.flex.value": droneFlex + left.ego
  }, { [FLEX_SYNC]: true });
  await actor.update({ [`flags.eclipsephase.${JAMMED_DRONE_FLAG}`]: drone.id });

  const body = actor.items.get(drone.flags.eclipsephase[DRONE_FLAG].vehicle);
  const content = await foundry.applications.handlebars.renderTemplate(NOTE_CARD, {
    type: "jamming",
    actor,
    morphtype: body?.type === "morph" ? body.system.type : body?.system.chassisType,
    morphname: body?.name ?? drone.name
  });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}

/**
 * Jams a body: a drone that is out already at once, a body at home - a vehicle, or a morph with a
 * puppet sock - by sending it out for the length of the jam first. A player's request for a body
 * at home is carried out by the active GM, as players may not make actors.
 * @param {Actor} actor - The character
 * @param {String} bodyId - Its vehicle or morph
 * @returns {Promise<Boolean>} True once jammed, or once the GM was asked
 */
export async function jamDrone(actor, bodyId) {
  const body = actor?.items.get(bodyId);
  if (!body || jammedDrone(actor)) return false;

  const popUp = await confirmation(
    game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded"),
    `${game.i18n.localize("ep2e.actorSheet.button.jamVehicle")}: ${body.name}`,
    "ep2e.actorSheet.popUp.jamCopyGeneral", "ep2e.actorSheet.popUp.jamAdditionalInfo", "", "ep2e.actorSheet.button.jamVehicle");
  if (popUp.confirm !== true) return false;

  const out = deployedDrone(body);
  if (out) {
    await startDroneJam(actor, out);
    return true;
  }
  if (!game.user.isGM) return relayToActiveGM("jamBody", { actorUuid: actor.uuid, bodyId, userId: game.user.id });
  const made = await jamFromHome(actor, bodyId);
  if (made && !made.placed) made.drone.sheet?.render(true);
  return !!made;
}

/**
 * Sends a body at home out for the length of a jam and starts the jam. Run by a GM.
 * @param {Actor} actor - The character
 * @param {String} bodyId - Its vehicle or morph
 * @returns {Promise<{drone: Actor, placed: Boolean}|null>} The drone and whether it got a token, or null when it cannot go out
 */
async function jamFromHome(actor, bodyId) {
  const made = await createDrone(actor, bodyId, { temporary: true });
  if (made) await startDroneJam(actor, made.drone);
  return made;
}

/**
 * Ends the jam of a deployed drone: the drone is its own AI again, with what is left of its own
 * Flex, and the character keeps what is left of its own and of the ego's.
 * @param {Actor} actor - The character
 * @returns {Promise<void>}
 */
export async function endDroneJam(actor) {
  const drone = jammedDrone(actor);
  if (drone?.flags?.eclipsephase?.[DRONE_JAM_FLAG]) {
    // Whatever either sheet's pool changed by without the other following is settled first.
    await shareEgoFlex(drone);
    await shareEgoFlex(actor);
    await drone.update({
      "system.pools.flex.value": drone.flags.eclipsephase[DRONE_JAM_FLAG].droneFlex,
      [`flags.eclipsephase.${DRONE_JAM_FLAG}`]: new foundry.data.operators.ForcedDeletion()
    }, { [FLEX_SYNC]: true });
  }
  await actor.update({ [`flags.eclipsephase.${JAMMED_DRONE_FLAG}`]: new foundry.data.operators.ForcedDeletion() });
}

/**
 * Ends the jam of a deployed drone on the player's word.
 * @param {Actor} actor - The character
 * @returns {Promise<void>}
 */
export async function unjamDrone(actor) {
  if (!jammedDrone(actor)) return;
  const popUp = await confirmation(
    game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded"),
    game.i18n.localize("ep2e.actorSheet.button.unjamVehicle"),
    "ep2e.actorSheet.popUp.unjamCopyGeneral", "", "", "ep2e.actorSheet.button.unjamVehicle");
  if (popUp.confirm !== true) return;
  // The jam ends as it began: a body that went out for it is collected, a drone out before stays out.
  const drone = jammedDrone(actor);
  if (drone.flags.eclipsephase[DRONE_FLAG].temporary) await recallDrone(drone);
  else await endDroneJam(actor);
}

/**
 * Why a deployed drone cannot be jammed now: it is broken or knocked out, it has no puppet sock, or
 * the ego is down or busy jamming.
 * @param {Actor} actor - The character
 * @param {Item} vehicle - Its deployed vehicle
 * @param {String|null} egoBlock - Why the ego cannot start any jam, or null
 * @returns {String|null} The refusal for the Jam button's tooltip, or null when it can be jammed
 */
export function droneJamBlock(actor, vehicle, egoBlock) {
  const drone = deployedDrone(vehicle);
  const down = ["dead", "unconscious"].find(id => drone?.statuses?.has(id));
  if (down === "dead") return game.i18n.localize("ep2e.morph.drone.destroyed");
  if (down) return game.i18n.format("ep2e.morph.jamming.blocked", { condition: game.i18n.localize(`ep2e.conditions.${down}.name`) });
  if (!vehicle.hasPuppetSock) return game.i18n.localize("ep2e.actorSheet.popUp.needPuppetSockToJam");
  return egoBlock;
}

/**
 * Breaks off the jam of a deployed drone because one of the two bodies went down, and says so.
 * @param {Actor} actor - The character
 * @param {Actor|Item} downed - The drone, or the character's own morph
 * @param {String} condition - "unconscious" or "dead"
 * @returns {Promise<void>}
 */
async function breakDroneJam(actor, downed, condition) {
  const drone = jammedDrone(actor);
  await endDroneJam(actor);
  // A body out only for the jam stays where it fell, to be collected like any drone.
  if (drone?.flags?.eclipsephase?.[DRONE_FLAG]?.temporary) await drone.update({ [`flags.eclipsephase.${DRONE_FLAG}.temporary`]: false });
  await announce(actor, "ep2e.morph.jamming.broken", {
    body: downed.name,
    condition: game.i18n.localize(`ep2e.conditions.${condition}.name`),
    morph: actor.items.get(actor.system.activeMorph)?.name ?? ""
  });
}

/**
 * Lets the active GM send out and bring home drones for players, opens a drone's sheet for the
 * player who sent it out without a token, keeps the owner's open sheet in step with its drone and a
 * jammed drone in step with its ego, breaks a jam off when a body goes down, and frees a vehicle
 * whose drone was deleted by hand.
 * @returns {void}
 */
export function registerDrones() {
  registerSocketActions({
    deployDrone: async ({ actorUuid, vehicleId, userId }) => {
      const actor = await fromUuid(actorUuid);
      const out = actor ? await createDrone(actor, vehicleId) : null;
      if (out && !out.placed) game.socket.emit(SYSTEM_SOCKET, { action: "droneOut", userId, droneId: out.drone.id });
    },
    recallDrone: async ({ droneId }) => bringDroneHome(game.actors.get(droneId)),
    jamBody: async ({ actorUuid, bodyId, userId }) => {
      const actor = await fromUuid(actorUuid);
      const made = actor ? await jamFromHome(actor, bodyId) : null;
      if (made && !made.placed) game.socket.emit(SYSTEM_SOCKET, { action: "droneOut", userId, droneId: made.drone.id });
    }
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
    if (owner?.getFlag("eclipsephase", JAMMED_DRONE_FLAG) === actor.id) await endDroneJam(owner);
  });

  // Ego Flex spent on one of the two sheets is gone on the other.
  Hooks.on("updateActor", (actor, changed, options, userId) => {
    if (options?.[FLEX_SYNC] || !madeHere(userId, options) || !foundry.utils.hasProperty(changed, "system.pools.flex.value")) return;
    shareEgoFlex(actor);
  });

  // A jammed drone follows the ego jamming it: what changes on the character shows on the drone.
  const followEgo = actor => {
    const drone = jammedDrone(actor);
    if (!drone) return;
    drone.reset();
    if (drone.sheet?.rendered) drone.sheet.render(false);
  };
  Hooks.on("updateActor", actor => followEgo(actor));
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, item => followEgo(item.parent));
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, effect => followEgo(effect.parent instanceof Item ? effect.parent.parent : effect.parent));
  }
  // At world start a drone may have been prepared before the ego it reads.
  Hooks.once("ready", () => {
    for (const actor of game.actors) if (jammingEgo(actor)) actor.reset();
  });

  // The jam breaks off the moment the drone is knocked out or broken, or the ego's own body is
  // knocked out or dies.
  Hooks.on("createActiveEffect", async (effect, options, userId) => {
    const actor = effect.parent;
    const condition = ["dead", "unconscious"].find(id => Array.from(effect.statuses ?? []).includes(id));
    if (!condition || !(actor instanceof Actor) || !madeHere(userId, options)) return;
    const ego = jammingEgo(actor);
    if (ego) await breakDroneJam(ego, actor, condition);
    else if (jammedDrone(actor)) await breakDroneJam(actor, actor.items.get(actor.system.activeMorph) ?? actor, condition);
  });
}
