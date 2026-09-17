export const CYBERBRAIN_MARKER = "flags.eclipsephase.grantsCyberbrain";

/**
 * Resolves the value a body-bound item's boundTo holds for one particular body. Characters bind to
 * the body item's own id, every other actor type binds to a fixed sentinel string, mirroring
 * boundToFor in morp-functions.js - comparing a raw id would never match on an NPC or Goon.
 * @param {Actor} actor - The actor the body belongs to
 * @param {String} bodyId - The id of the Morph or Vehicle item
 * @returns - The boundTo value used for this body, or null if the body does not exist
 */
export function bodyBindingKey(actor, bodyId){
  if(!bodyId) return null;
  if(actor?.type === "character") return bodyId;

  const body = actor?.items?.get(bodyId);
  if(!body) return null;

  return body.type === "vehicle" ? "activeVehicle" : "activeMorph";
}

/**
 * Whether any Ware bound to one body carries a marker ActiveEffect. Markers are read raw off the
 * effect's changes and are never applied, so they stay disabled on the Ware item.
 * @param {Actor} actor - The actor owning both the body and the Ware
 * @param {String} bodyId - The id of the Morph or Vehicle item the Ware must be bound to
 * @param {String} markerKey - The change key identifying the marker
 * @returns - True when at least one bound Ware item carries the marker
 */
export function bodyHasWareMarker(actor, bodyId, markerKey){
  const bindingKey = bodyBindingKey(actor, bodyId);
  if(!bindingKey) return false;

  return !!actor.items?.some(wareCheck =>
    wareCheck.type === "ware" &&
    wareCheck.system?.boundTo === bindingKey &&
    wareCheck.effects?.some(e => e.changes?.some(c => c.key === markerKey)));
}

/**
 * Whether every body the ego currently inhabits carries a marker - the active morph and, while
 * jamming, the jammed body as well.
 * @param {Actor} actor - The actor to check
 * @param {String} markerKey - The change key identifying the marker
 * @returns - True when the whole chain carries the marker
 */
export function chainHasWareMarker(actor, markerKey){
  const activeJam = actor?.system?.activeJam;

  return bodyHasWareMarker(actor, actor?.system?.activeMorph, markerKey) &&
    (!activeJam || bodyHasWareMarker(actor, activeJam, markerKey));
}
