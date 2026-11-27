import * as sheetFunction from "./general-sheet-functions.js"
import * as resleeving from "../rolls/resleeving.js"
import { getStrainFamily } from "../rolls/strain-families.js";
import { madeHere, registerSocketActions, relayToActiveGM } from "./socket.js";
import { setAsideBodyConditions, bringBackBodyConditions, activeConditions } from "./conditions.js";
import { eclipsephase } from "../config.js";

// A change of body brings wounds the body has had all along, not new ones: no checks for them.
const BODY_CHANGE = { eclipsephase: { woundCheck: false } };

export async function resleeveMorph(actor, currentTarget, sheet){
    const dataset = currentTarget.dataset;
    const itemID = dataset.itemId;
    const newMorph = actor.items.get(itemID);
    const itemName = dataset.name;
    const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.button.sleeveMorph"))+ ": " +(itemName?itemName:"");
    const popUpCopy = "ep2e.actorSheet.popUp.sleeveCopyGeneral";
    const popUpInfo = "ep2e.actorSheet.popUp.sleeveAdditionalInfo";
    const popUpPrimary = "ep2e.actorSheet.button.sleeveMorph";
    const RESLEEVING_MESSAGE = 'systems/eclipsephase/templates/chat/change.html';
    let popUp = await sheetFunction.confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, "", popUpPrimary);

    if(popUp.confirm === true){
        sheet.tabGroups.morph = "sleeved";

        // Real resleeving takes long enough for a full recovery, so unlike jamming, Flex is simply
        // refilled to full here too (Ego Flex + the new morph's own Flex).
        const egoFlex = Number(actor.system.ego.egoFlex) || 0;
        const newBodyFlexMax = Number(newMorph.system.flex) || 0;

        // Damage and wounds stay with the body left behind, the new one brings its own; stress and trauma go with the ego.
        const oldMorph = actor.items.get(actor.system.activeMorph);
        await setAsideBodyConditions(actor, oldMorph);
        await bringBackBodyConditions(actor, newMorph);
        if (oldMorph) await keepBodyDamage(oldMorph, actor.system.health.physical.value, actor.system.physical.wounds);
        const kept = storedBodyDamage(newMorph);
        await actor.update({
            "system.activeMorph": itemID,
            "system.pools.flex.value": egoFlex + newBodyFlexMax,
            "system.health.physical.value": kept.value,
            "system.physical.wounds": kept.wounds
        }, BODY_CHANGE);
        if (newMorph.getFlag("eclipsephase", "bodyDamage")) await newMorph.unsetFlag("eclipsephase", "bodyDamage");
        await actor.update({ "flags.eclipsephase.resleeving": true });
        
        let message = {
        type : "resleeve",
        actor : actor,
        morphtype : newMorph.system.type,
        morphname : newMorph.name
        };
        
        let html = await foundry.applications.handlebars.renderTemplate(RESLEEVING_MESSAGE, message)

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actor}),
            content: html
        })
    }
    else{
        return
    }
}

/**
 * Asks before an NPC's or goon's one body is replaced, and deletes the old one with all bound to it.
 * @param {Actor} actor - The NPC or goon
 * @param {String} activeMorph - The body it has now
 * @param {Object} newMorph - The morph or vehicle taking its place
 * @returns {Promise<Boolean>} True once confirmed, false when backed out of
 */
export async function replaceMorph(actor, activeMorph, newMorph){
    const oldMorph = actor.items.get(activeMorph)
    const oldName = oldMorph ? oldMorph.name : "no Morph"
    const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.popUp.sleeveReplaceHeadline"))
    const popUpCopy = (game.i18n.localize("ep2e.actorSheet.popUp.sleeveReplaceCopyOld"))+oldName+(game.i18n.localize("ep2e.actorSheet.popUp.sleeveReplaceCopyNew"))+newMorph.name;
    const popUpInfo = "ep2e.actorSheet.popUp.sleeveReplaceInfo";
    const popUpPrimary = "ep2e.actorSheet.button.sleeveMorph";

    let popUp = await sheetFunction.confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, "", popUpPrimary);
    if (popUp.confirm !== true) return false;
    if (oldMorph) await deleteBody(actor, activeMorph);
    return true;
}

/**
 * The damage a body kept while nobody acts in it.
 * @param {Item} body - A morph or vehicle
 * @returns {{value: Number, wounds: Number}} Its damage and wounds
 */
export function storedBodyDamage(body) {
    const kept = body?.flags?.eclipsephase?.bodyDamage;
    return { value: Number(kept?.value) || 0, wounds: Number(kept?.wounds) || 0 };
}

/**
 * Stores a body's damage on it, or clears it when there is none.
 * @param {Item} body - A morph or vehicle
 * @param {Number} value - Its damage
 * @param {Number} wounds - Its wounds
 * @returns {Promise<*>}
 */
export async function keepBodyDamage(body, value, wounds) {
    value = Number(value) || 0;
    wounds = Number(wounds) || 0;
    if (value || wounds) return body.setFlag("eclipsephase", "bodyDamage", { value, wounds });
    if (body.getFlag("eclipsephase", "bodyDamage")) return body.unsetFlag("eclipsephase", "bodyDamage");
}

/**
 * Where a character's body has its damage now: in the actor's health for the morph the ego is
 * sleeved in, on the body itself otherwise.
 * @param {Actor} actor - The character
 * @param {String} bodyId - The body
 * @returns {String} "live" or "body"
 */
export function bodyDamagePlace(actor, bodyId) {
    return bodyId === actor.system.activeMorph ? "live" : "body";
}

/**
 * A body's damage and wounds, wherever they are kept.
 * @param {Actor} actor - The character
 * @param {String} bodyId - The body
 * @returns {{value: Number, wounds: Number}} Its damage and wounds
 */
export function bodyDamage(actor, bodyId) {
    if (bodyDamagePlace(actor, bodyId) === "live") {
        return { value: Number(actor.system.health.physical.value) || 0, wounds: Number(actor.system.physical.wounds) || 0 };
    }
    return storedBodyDamage(actor.items.get(bodyId));
}

/**
 * Sets a body's damage, its wounds or both, wherever they are kept.
 * @param {Actor} actor - The character
 * @param {String} bodyId - The body
 * @param {Object} change - value and/or wounds
 * @returns {Promise<*>}
 */
export async function setBodyDamage(actor, bodyId, change) {
    const next = { ...bodyDamage(actor, bodyId), ...change };
    if (bodyDamagePlace(actor, bodyId) === "live") {
        return actor.update({ "system.health.physical.value": next.value, "system.physical.wounds": next.wounds });
    }
    const body = actor.items.get(bodyId);
    if (!body) return;
    await keepBodyDamage(body, next.value, next.wounds);
    return liftHealedConditions(body, next.value);
}

/**
 * A body's Death Rating as its item gives it, without what the actor's effects add.
 * @param {Item} body - A morph or vehicle
 * @returns {Number} Durability times the factor of what it is made of
 */
function bodyDeathRating(body) {
    return (Number(body?.system?.dur) || 0) * (Number(eclipsephase.damageRatingMultiplier[bodyKind(body)]) || 1.5);
}

/**
 * Whether a body nobody acts in is destroyed: it kept Dead.
 * @param {Item} body - A morph or vehicle
 * @returns {Boolean} True while Dead is among the conditions it kept
 */
export function bodyIsDestroyed(body) {
    return (body?.flags?.eclipsephase?.bodyConditions ?? []).some(condition => (condition.statuses ?? []).includes("dead"));
}

/**
 * Takes the conditions its damage no longer bears off a body nobody acts in, as nobody could take
 * them off there by hand: Dead once repaired below the Death Rating, the Incapacitated the damage
 * brought once below Durability.
 * @param {Item} body - A morph or vehicle
 * @param {Number} damage - Its damage now
 * @returns {Promise<*>}
 */
async function liftHealedConditions(body, damage) {
    const kept = body.getFlag("eclipsephase", "bodyConditions");
    if (!kept?.length) return;
    const stays = kept.filter(condition => {
        const statuses = condition.statuses ?? [];
        if (statuses.includes("dead")) return damage >= bodyDeathRating(body);
        if (statuses.includes("incapacitated") && condition.flags?.eclipsephase?.fromDamage) return damage >= (Number(body.system.dur) || 0);
        return true;
    });
    if (stays.length === kept.length) return;
    return stays.length ? body.setFlag("eclipsephase", "bodyConditions", stays) : body.unsetFlag("eclipsephase", "bodyConditions");
}

/**
 * What a body is made of, for health and healing: a morph's own type, an animal bio, any other vehicle synth.
 * @param {Item} body - A morph or vehicle
 * @returns {String} "bio", "synth" or "info" (a morph's type as given)
 */
export function bodyKind(body) {
    if (body?.type === "morph") return body.system?.type;
    return body?.system?.chassisType === "animal" ? "bio" : "synth";
}

/**
 * Why the ego cannot start a jam now: the body it acts in is incapacitated, unconscious or dead, or
 * it jams a deployed drone already.
 * @param {Actor} actor - The character
 * @returns {String|null} The refusal for the jam button's tooltip, or null when it can jam
 */
export function jamBlockReason(actor) {
    const conditions = activeConditions(actor);
    const condition = ["dead", "unconscious", "incapacitated"].find(id => conditions.has(id));
    if (condition) return game.i18n.format("ep2e.morph.jamming.blocked", { condition: game.i18n.localize(`ep2e.conditions.${condition}.name`) });
    // One body at a time: an ego out in a deployed drone jams nothing else.
    return actor.flags?.eclipsephase?.jammedDrone ? game.i18n.localize("ep2e.morph.jamming.busy") : null;
}

// Shared helper for anything that needs an actor's candidate bodies (Morphs + Vehicles) and how
// to resolve a boundTo value for one - drop-time binding (Ware/Traits/Armor), rebinding, and
// delete-reassignment all share this instead of re-deriving it separately and drifting apart.
export function getBodyBindingInfo(actor) {
    // A body out as a drone takes nothing on until it is back.
    const morphItems = actor.items.filter(i => i.type === "morph" && !i.flags?.eclipsephase?.deployed);
    const vehicleItems = actor.items.filter(i => i.type === "vehicle" && !i.flags?.eclipsephase?.deployed);
    const bodies = [...morphItems, ...vehicleItems];

    const boundToFor = (body) => {
        if (actor.type === "character") return body.id;
        return npcBodyKey(actor, body);
    };

    // excludeBoundTo lets a caller (e.g. rebindItem) drop the currently-bound body from the list,
    // since re-picking it would be a no-op - unused by drop-time binding, which has no "current" yet.
    const buildBodyGroups = (excludeBoundTo) => {
        const groups = [];
        const morphOptions = morphItems.filter(m => boundToFor(m) !== excludeBoundTo).map(m => ({ id: m.id, name: m.name }));
        const vehicleOptions = vehicleItems.filter(v => boundToFor(v) !== excludeBoundTo).map(v => ({ id: v.id, name: v.name }));
        if (morphOptions.length) groups.push({ label: game.i18n.localize("ep2e.morph.morphsHeadline"), options: morphOptions });
        if (vehicleOptions.length) groups.push({ label: game.i18n.localize("ep2e.morph.jamming.headline"), options: vehicleOptions });
        return groups;
    };

    return { morphItems, vehicleItems, bodies, boundToFor, buildBodyGroups };
}

// Resolves which body a body-bound item (Ware/Traits/Armor) should attach to on `actor`: refuses if
// there are none, silently picks the only one if there's exactly one, otherwise prompts via
// selectBody(). Used both at drop-time and for cross-actor transfers, so the two stay consistent.
// With allowStash a character's Stash is offered first and preselected, and taken at once when the
// character has no body.
export async function resolveBodyForItem(actor, noBodyMessageKey, { allowStash = false } = {}) {
    const { bodies, boundToFor, buildBodyGroups } = getBodyBindingInfo(actor);
    const offerStash = allowStash && actor.type === "character";

    if (bodies.length === 0) {
        if (offerStash) return { boundTo: STASH, chosenBody: null };
        await sheetFunction.systemMessage("error", noBodyMessageKey);
        return { cancelled: true };
    }

    let chosenBody;
    if (actor.type === "character" && (bodies.length > 1 || offerStash)) {
        const groups = buildBodyGroups();
        if (offerStash) groups.unshift({ label: game.i18n.localize("ep2e.inventory.stash.label"), options: [{ id: STASH, name: game.i18n.localize("ep2e.inventory.stash.option") }] });
        // Default to the sleeved Morph even while jamming (never the jammed body) - it's the more
        // likely target, saving a click for the common case of equipping your own real body.
        const bodyChoice = await sheetFunction.selectBody(
            groups,
            "ep2e.dialog.selectBody.header",
            "",
            offerStash ? "ep2e.dialog.selectBody.copyStash" : "ep2e.dialog.selectBody.copy",
            offerStash ? STASH : actor.system?.activeMorph
        );

        if (bodyChoice.cancelled) return { cancelled: true };
        if (offerStash && bodyChoice.selection === STASH) return { boundTo: STASH, chosenBody: null };
        chosenBody = bodies.find(b => b.id === bodyChoice.selection);
        if (!chosenBody) return { cancelled: true };
    } else {
        chosenBody = bodies[0];
    }

    return { chosenBody, boundTo: boundToFor(chosenBody) };
}

/**
 * How much of a carried item to move. A stack asks how many packs, a single item only for a
 * confirmation - or not at all where the move was already picked; skip moves all of it at once.
 * @param {Item} item - The item
 * @param {String} actionKey - The button label of the move
 * @param {String|null} copyKey - The question for a single item, formatted with its name; null to
 *   move a single item without asking
 * @param {Boolean} skip - Whether to move all of it without asking
 * @returns {Promise<Object>} confirm, and quantity when part of a stack is to move
 */
async function moveAmount(item, actionKey, copyKey, skip) {
  if (skip) return { confirm: true };
  const held = Math.floor(Number(item.system?.quantity) || 0);
  if (held > 1) {
    const answer = await sheetFunction.askStackCount(item.name, held, {
      actionKey,
      copyKey: "ep2e.actorSheet.popUp.moveStackCopy",
      labelKey: "ep2e.actorSheet.popUp.moveStackLabel",
      start: held
    });
    return answer.confirm ? { confirm: true, quantity: answer.count } : { confirm: false };
  }
  if (!copyKey) return { confirm: true };
  const popUp = await sheetFunction.confirmation(
    game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded"),
    `${game.i18n.localize(actionKey)} ${item.name}`,
    game.i18n.format(copyKey, { name: item.name }),
    "",
    "",
    actionKey
  );
  return { confirm: popUp.confirm === true };
}

/**
 * Moves a carried item from its body to another of the character's bodies, after a pick of which.
 * @param {Actor} actor - The character
 * @param {String} itemId - The item
 * @returns {Promise<void>}
 */
export async function rebindItem(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) return;

  const { bodies, boundToFor, buildBodyGroups } = getBodyBindingInfo(actor);
  const currentBoundTo = item.system.boundTo;
  const otherBodies = bodies.filter(b => boundToFor(b) !== currentBoundTo);

  if (otherBodies.length === 0) {
    await sheetFunction.systemMessage("error", "ep2e.systemMessage.itemAttachment.noOtherBody");
    return;
  }

  // The sleeved morph is offered first, unless the item is on it already.
  const bodyChoice = await sheetFunction.selectBody(
    buildBodyGroups(currentBoundTo),
    "ep2e.dialog.selectBody.header",
    "",
    "ep2e.dialog.selectBody.copy",
    actor.system?.activeMorph
  );
  if (bodyChoice.cancelled) return;

  const chosenBody = otherBodies.find(b => b.id === bodyChoice.selection);
  if (!chosenBody) return;

  const amount = await moveAmount(item, "ep2e.actorSheet.button.rebindItem", null, false);
  if (!amount.confirm) return;
  if (actor.type === "character") await moveItem(actor, itemId, boundToFor(chosenBody), { quantity: amount.quantity });
  else await item.update({ "system.boundTo": boundToFor(chosenBody) });
  await sheetFunction.systemMessage("success", "ep2e.systemMessage.itemAttachment.itemRebound", { name: item.name, body: chosenBody.name });
}

/**
 * Puts a character's carried item, or part of its stack, into the Stash. A shift-click puts all of
 * it there without asking, like a shift-click on delete.
 * @param {Actor} actor - The character
 * @param {String} itemId - The item
 * @param {Boolean} skipConfirm - Whether to skip the question
 * @returns {Promise<void>}
 */
export async function stashItem(actor, itemId, skipConfirm) {
  if (actor.type !== "character") return;

  const item = actor.items.get(itemId);
  if (!item || !isCarried(item)) return;

  const amount = await moveAmount(item, "ep2e.actorSheet.button.stashItem", "ep2e.actorSheet.popUp.stashItemCopy", skipConfirm);
  if (!amount.confirm) return;
  await moveItem(actor, itemId, STASH, { quantity: amount.quantity });
}

/**
 * Takes a carried item, or part of its stack, out of the Stash onto a body: the only body at once,
 * a pick of one when there are several. The kinds the world setting names are announced in the chat.
 * @param {Actor} actor - The character
 * @param {String} itemId - The item
 * @returns {Promise<void>}
 */
export async function equipItemFromStash(actor, itemId) {
  if (actor.type !== "character") return;

  const item = actor.items.get(itemId);
  if (!item || !isCarried(item) || stashOnly(item)) return;

  const resolved = await resolveBodyForItem(actor, "ep2e.systemMessage.itemAttachment.noBody");
  if (resolved.cancelled) return;

  // Equipping is the deliberate act already: only a stack asks how many packs.
  const amount = await moveAmount(item, "ep2e.actorSheet.button.equipItem", null, false);
  if (!amount.confirm) return;
  await moveItem(actor, itemId, resolved.boundTo, { quantity: amount.quantity });

  // The world setting names the kinds of item whose equipping is announced.
  const kind = announceKind(item.type);
  if (!new Set(game.settings.get("eclipsephase", "equipAnnouncements") ?? []).has(kind)) return;
  const morph = resolved.chosenBody.name;
  const message = kind === "armor" ? {
    type: "equipArmor",
    copy: game.i18n.format("ep2e.roll.announce.armor.equipped", { morph, armor: item.name }),
    armorName: item.name,
    armorEnergy: item.system.energy,
    armorKinetic: item.system.kinetic
  } : {
    type: "equipItem",
    copy: game.i18n.format(kind === "weapons" ? "ep2e.roll.announce.weapon.equipped" : `ep2e.roll.announce.item.${kind}`, { morph }),
    itemName: item.name
  };
  const renderedHtml = await foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/chat/damage-result.html", message);

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: renderedHtml
  });
}

/**
 * Asks what becomes of what a body carries before the body is deleted. A character puts it into the
 * Stash or lets it go with the body; an NPC or goon only confirms that its armour goes too. This is
 * the delete confirmation itself, so no second one follows.
 * @param {Actor} actor - The actor
 * @param {String} bucketKey - The body's key: its id on a character, activeMorph or activeVehicle otherwise
 * @param {String} bodyName - The body's name
 * @returns {Promise<Object>} proceed: whether the body may be deleted
 */
export async function resolveItemsOnBodyDelete(actor, bucketKey, bodyName) {
    const carried = actor.type === "character"
        ? actor.items.filter(i => isCarried(i) && locationOf(actor, i) === bucketKey)
        : actor.items.filter(i => i.type === "armor" && i.system.boundTo === bucketKey);
    if (carried.length === 0) return { proceed: true };

    if (actor.type !== "character") {
        const popUp = await sheetFunction.confirmation(
            game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded"),
            game.i18n.localize("ep2e.actorSheet.button.delete") + " " + (bodyName ?? ""),
            game.i18n.format("ep2e.actorSheet.popUp.deleteArmorWithBodyCopy", { body: bodyName ?? "" }),
            "",
            "",
            "ep2e.actorSheet.button.delete"
        );
        return { proceed: popUp.confirm === true };
    }

    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize("ep2e.dialog.bodyItems.header") },
        classes: ["ep2e-primary-right"],
        content: `<div style="padding: 10px 0;">${game.i18n.format("ep2e.dialog.bodyItems.copy", { body: bodyName ?? "" })}</div>`,
        buttons: [
            {
                action: "stash",
                label: game.i18n.localize("ep2e.actorSheet.button.stashItem"),
                default: true,
                callback: () => ({ stash: true })
            },
            {
                action: "deleteWithBody",
                label: game.i18n.localize("ep2e.actorSheet.button.deleteItemsWithBody"),
                callback: () => ({ stash: false })
            },
            {
                action: "cancel",
                label: game.i18n.localize("ep2e.roll.dialog.button.cancel"),
                callback: () => ({ cancelled: true })
            }
        ],
        position: { width: 340 },
        modal: true,
        rejectClose: false
    });

    if (!result || result.cancelled) return { proceed: false };
    if (result.stash) await actor.updateEmbeddedDocuments("Item", carried.map(i => ({ _id: i.id, "system.boundTo": STASH })));
    return { proceed: true };
}

/**
 * Deletes a body (Morph or Vehicle) and everything still bound to it: ware, traits and what it
 * carries. Read from the actor's items as they are now, so what resolveItemsOnBodyDelete just put
 * into the Stash stays. No further confirmation.
 * @param {Actor} actor - The actor
 * @param {String} bodyId - The body's item id
 * @returns {Promise<void>}
 */
export async function deleteBody(actor, bodyId){
    let bucketKey = bodyId;
    if (actor.type !== "character") {
        // npc/goon bind to fixed keys, not to the item, so the body being deleted decides which
        // key's items go with it - otherwise deleting a Vehicle beside the body could sweep up
        // what is bound to the body itself.
        const bodyItem = actor.items.get(bodyId);
        bucketKey = bodyItem ? npcBodyKey(actor, bodyItem) : "activeMorph";
    }

    const deletionList = actor.items.filter(i => i.id === bodyId || i.system?.boundTo === bucketKey).map(i => i.id);
    await actor.deleteEmbeddedDocuments("Item", deletionList)
}

// Pulls every filled Enhancement slot (Ware/Traits/Flaws) on a body directly from the compendium
// and creates them bound to that body - one created item per filled slot, so a slot referencing
// the same compendium item twice (e.g. two identical minor Ware pieces) still yields two items.
export async function applyStandardEnhancements(actor, body, boundTo) {
    const slotGroups = [body.system.ware, body.system.traits, body.system.flaws];
    const itemsToCreate = [];

    for (const slots of slotGroups) {
        for (const slot of Object.values(slots ?? {})) {
            const uuid = slot?.value;
            if (!uuid || uuid === "none") continue;

            const source = await fromUuid(uuid);
            if (!source) {
                console.warn(`[EP2e] ${actor.name}: Enhancement slot on "${body.name}" points at a missing compendium item (${uuid}) - skipped.`);
                continue;
            }

            const itemData = source.toObject();
            itemData.system.boundTo = boundTo;
            itemData.system.updated = game.system.version;
            // A Trait/Flaw that can be either ego or morph (ego: true, morph: true) still gets
            // bucketed as an ego trait purely by its ego flag, boundTo notwithstanding (see the
            // trait/flaw classification in EPactorSheet.js). Clear it here, same as the interactive
            // drop dialog does when the user picks "Morph" for a dual-capable trait.
            if (itemData.type === "traits") {
                itemData.system.ego = false;
            }
            itemsToCreate.push(itemData);
        }
    }

    if (!itemsToCreate.length) return [];
    return actor.createEmbeddedDocuments("Item", itemsToCreate);
}

// Pulls a Synthmorph's chosen Frame (Light/Medium/Heavy, system.frame - a compendium Armor item
// UUID, same reference pattern as the Enhancement slots above) straight from the compendium and
// binds a fresh copy to the body, unconditionally - Frame isn't an optional "Enhancement" like
// Ware/Traits, it's the mandatory intrinsic Armor every synthmorph has per the rules, so this
// doesn't go through the Standard/Flat Enhancement choice at all. Runs only for body.type ===
// "morph" with system.type === "synth" - a Bio/Info morph, or a Synth with no frame chosen, is
// left untouched. Checking body.system.type AT DROP TIME (rather than trying to keep a live body
// in sync) is what prevents a stale Frame from lingering if the source Morph's type is later
// edited back and forth - the check simply never fires for a non-Synth body.
export async function applyFrame(actor, body, boundTo) {
    if (body.type !== "morph" || body.system.type !== "synth") return null;

    const uuid = body.system.frame;
    if (!uuid || uuid === "none") return null;

    const source = await fromUuid(uuid);
    if (!source) {
        console.warn(`[EP2e] ${actor.name}: "${body.name}"'s Frame points at a missing compendium item (${uuid}) - skipped.`);
        return null;
    }

    const itemData = source.toObject();
    itemData.system.boundTo = boundTo;
    itemData.system.updated = game.system.version;

    const created = await actor.createEmbeddedDocuments("Item", [itemData]);
    if (created[0]) {
        sheetFunction.systemMessage("success", "ep2e.systemMessage.itemAttachment.itemAddedToBody", { name: created[0].name, body: body.name });
    }
    return created[0] ?? null;
}

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

  return npcBodyKey(actor, body);
}

/**
 * The fixed key an NPC's or goon's body binds its items under: the body it acts in is "activeMorph",
 * a morph or a vehicle alike, a vehicle beside it "activeVehicle".
 * @param {Actor} actor - The NPC or goon
 * @param {Item} body - A morph or vehicle it owns
 * @returns {String} "activeMorph" or "activeVehicle"
 */
export function npcBodyKey(actor, body) {
  return body?.type === "vehicle" && body.id !== actor?.system?.activeMorph ? "activeVehicle" : "activeMorph";
}

/**
 * Whether a body-bound item - ware, a trait - works in the body the actor acts through: bound to
 * the sleeved morph. An NPC's or goon's items always work, and so does an item bound to no body at all.
 * @param {Actor} actor - The actor
 * @param {Item} item - The item
 * @returns {Boolean} True while it works
 */
export function boundToActiveBody(actor, item) {
  if (actor?.type !== "character") return true;
  const boundTo = item.system?.boundTo;
  const activeMorph = actor.system?.activeMorph;
  if (!boundTo || !activeMorph) return true;
  return boundTo === activeMorph;
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
 * Whether the body the actor acts in carries a marker.
 * @param {Actor} actor - The actor to check
 * @param {String} markerKey - The change key identifying the marker
 * @returns {Boolean} True when its active morph carries the marker
 */
export function chainHasWareMarker(actor, markerKey){
  return bodyHasWareMarker(actor, actor?.system?.activeMorph, markerKey);
}

/**
 * The nervous system of one body: "bio", "synth" or "info". A Morph reports its own type, a
 * Vehicle counts as bio only for an animal chassis, as in EPactor's health calculation. Falls back to "bio" for a missing body, matching the standard
 * morph the actor falls back to elsewhere.
 * @param {Actor} actor - The actor the body belongs to
 * @param {String} bodyId - The id of the Morph or Vehicle item
 * @returns - One of "bio", "synth" or "info"
 */
export function bodyNervousSystem(actor, bodyId){
  const body = bodyId ? actor?.items?.get(bodyId) : null;
  if(!body) return "bio";

  if(body.type === "morph") return body.system?.type ?? "bio";

  return body.system?.chassisType === "animal" ? "bio" : "synth";
}

/**
 * The nervous system the actor acts through: that of the body it is in.
 * @param {Actor} actor - The actor to check
 * @returns - One of "bio", "synth" or "info"
 */
export function sleevedNervousSystem(actor){
  return bodyNervousSystem(actor, actor?.system?.activeMorph);
}

// The vectors a sealed suit or a mask keeps out, by the flag an item's effect sets on the actor.
// The vision mode a token seen through a tacnet is drawn in, and the key an effect joins one with.
export const TACNET_VISION = "tacnet";
export const TACNET_KEY = "system.additionalSystems.tacnet";
export const PLAIN_TACNET_VISION = "tacnetPlain";

/**
 * The vision mode a tacnet's shared sight is drawn in: with its picture effects, or without them
 * when the user turned sight effects off.
 * @param {Boolean} effects - Whether the user wants sight effects
 * @returns {String} The vision mode's id
 */
export function sharedSightMode(effects) {
  return effects ? TACNET_VISION : PLAIN_TACNET_VISION;
}

/**
 * The tacnet channel an actor shares its sight on (Core p.327): the one its effect names, or for a
 * plain "true" the channel of everyone on its side.
 * @param {Actor} actor - The actor
 * @returns {String|null} The channel, null when it is on no tacnet
 */
export function tacnetChannel(actor) {
  const value = actor?.system?.additionalSystems?.tacnet;
  if (!value || value === "false") return null;
  if (value === true || value === "true") return actor.hasPlayerOwner ? "player" : "nonPlayer";
  return String(value);
}

/**
 * Whether a token's sight reaches a user through a tacnet: it shares a channel with a token they are
 * looking through, the ones they control or else, for a player, the ones they observe. The GM looks
 * through controlled tokens only.
 * @param {Object} token - The token that may share its sight
 * @param {Object[]} tokens - The scene's tokens
 * @param {User} user - The user
 * @returns {Boolean} True when the user sees through it
 */
export function seesThroughTacnet(token, tokens, user) {
  const channel = tacnetChannel(token.actor);
  if (!channel) return false;
  const controlled = tokens.filter(other => other.controlled);
  const viewers = controlled.length || user.isGM ? controlled : tokens.filter(other => other.actor?.testUserPermission?.(user, "OBSERVER"));
  return viewers.some(viewer => viewer !== token && tacnetChannel(viewer.actor) === channel);
}

const SEALS = { inhalation: "airSealed", dermal: "skinSealed" };

/**
 * Whether what the actor wears keeps a substance out that comes by this vector: a breather or a
 * sealed suit against what is breathed in, a sealed suit against what touches the skin.
 * @param {Actor} actor - The actor
 * @param {String|null} vector - "oral", "injection", "inhalation" or "dermal"
 * @returns {Boolean} True when it cannot reach them that way
 */
export function sealedAgainst(actor, vector) {
  const flag = SEALS[vector];
  return !!flag && actor?.system?.additionalSystems?.[flag] === true;
}

// The kind each body counts as when something picks it as a target.
const MORPH_KINDS = { bio: "biomorph", synth: "synthmorph", info: "infomorph" };
const CHASSIS_KINDS = { robot: "bot", vehicle: "vehicle", animal: "animal" };

/**
 * What an actor counts as when it is picked as a target: the kind of the body it is in - a bot,
 * vehicle or animal for an NPC that is one, otherwise its morph - and "cyberbrain" when that body runs one.
 * An attack names the kinds it cannot strike against these.
 * @param {Actor} actor - The target
 * @returns {String[]} e.g. ["synthmorph"] or ["biomorph", "cyberbrain"]
 */
export function targetKinds(actor) {
  const acting = actor?.system?.activeMorph;
  const body = acting ? actor?.items?.get?.(acting) : null;
  const kinds = [body?.type === "vehicle"
    ? CHASSIS_KINDS[body.system?.chassisType] ?? "vehicle"
    : MORPH_KINDS[actor?.system?.physical?.activeMorphType] ?? "biomorph"];
  if (chainHasWareMarker(actor, CYBERBRAIN_MARKER)) kinds.push("cyberbrain");
  return kinds;
}

/**
 * Whether a strain family works in the body the ego currently acts through. Each family brings its
 * own rule; a family nobody registered is refused outright rather than treated as Psi.
 * @param {Actor} actor - The actor to check
 * @param {String} strainFamily - The family a sleight names
 * @returns - An object holding whether the family is blocked, whether jamming is what blocks it, whether it is penalised, and the keys explaining why
 */
export function strainSubstrate(actor, strainFamily){
  return getStrainFamily(strainFamily).substrate(actor);
}

// Actor types whose token follows the body they are sleeved in.
const BODY_TOKEN_TYPES = ["character", "npc", "goon"];

/**
 * The prototype token image an actor should show in its sleeved morph, and the flag that remembers
 * its own image: a morph's custom token image while it is sleeved, the actor's base image otherwise.
 * An image the system did not set is the base, so a token image picked by hand is kept.
 * @param {Actor} actor - The actor
 * @returns {Object|null} The update for the actor, or null when nothing changes
 */
export function bodyTokenUpdate(actor) {
  if (!BODY_TOKEN_TYPES.includes(actor?.type)) return null;
  const state = actor.getFlag?.("eclipsephase", "bodyToken") ?? {};
  const src = actor.prototypeToken?.texture?.src ?? "";
  const custom = actor.items?.get(actor.system?.activeMorph)?.system?.customToken || null;
  if (!custom && !state.shown) return null;
  const base = state.shown && src === state.shown ? state.base : src;
  const next = custom || base;
  if (next === src && state.base === base && (state.shown ?? null) === custom) return null;
  return { "prototypeToken.texture.src": next, "flags.eclipsephase.bodyToken": { base, shown: custom } };
}

/**
 * Swaps an actor's token image to the morph it is sleeved in: its prototype and its linked tokens
 * on the active scene. Tokens this user may not change are left to the active GM.
 * @param {Actor} actor - The actor
 * @returns {Promise<void>}
 */
export async function applyBodyToken(actor) {
  const update = bodyTokenUpdate(actor);
  if (!update) return;
  await actor.update(update);
  if (actor.type === "goon") return;
  await syncSceneTokens(game.scenes?.active, actor.id, update["prototypeToken.texture.src"]);
}

/**
 * Gives an actor's linked tokens on a scene the image its prototype shows.
 * @param {Scene} scene - The scene
 * @param {String} actorId - The actor
 * @param {String} src - The image
 * @returns {Promise<void>}
 */
async function syncSceneTokens(scene, actorId, src) {
  const tokens = (scene?.tokens ?? []).filter(token => token.actorLink && token.actorId === actorId && token.texture?.src !== src);
  if (!tokens.length) return;
  if (game.user.isGM || tokens.every(token => token.canUserModify?.(game.user, "update"))) {
    await scene.updateEmbeddedDocuments("Token", tokens.map(token => ({ _id: token.id, "texture.src": src })));
    return;
  }
  relayToActiveGM("syncBodyToken", { sceneId: scene.id, actorId });
}

/**
 * Lets a body change swap the token image: when an actor is sleeved in another morph, and when the
 * sleeved morph gets another token image. Runs on the client that made the change.
 * @returns {void}
 */
export function registerBodyTokens() {
  Hooks.on("updateActor", async (actor, changed, options, userId) => {
    if (!madeHere(userId, options)) return;
    if (!foundry.utils.hasProperty(changed, "system.activeMorph")) return;
    await applyBodyToken(actor);
  });
  Hooks.on("updateItem", async (item, changed, options, userId) => {
    if (!madeHere(userId, options)) return;
    if (item.type !== "morph" || !foundry.utils.hasProperty(changed, "system.customToken")) return;
    if (item.parent?.system?.activeMorph !== item.id) return;
    await applyBodyToken(item.parent);
  });
  registerSocketActions({
    // The GM takes the image from the actor's prototype, not from the request.
    syncBodyToken: async ({ sceneId, actorId }) => {
      const src = game.actors.get(actorId)?.prototypeToken?.texture?.src;
      if (src) await syncSceneTokens(game.scenes.get(sceneId), actorId, src);
    }
  });
}

// Where a character's carried items are: on one of its bodies, or in the Stash, which has no place
// of its own and may be far away. NPCs and goons carry everything they own on their one body.
export const STASH = "stash";
export const CARRIED_TYPES = ["armor", "rangedWeapon", "ccWeapon", "gear", "drug", "ammo", "grenade"];

/**
 * The kind a carried item's equipping is announced under: both weapon types as one, every other type by itself.
 * @param {String} type - The item type
 * @returns {String} "weapons" for ranged and melee weapons, else the type
 */
export function announceKind(type) {
  return type === "rangedWeapon" || type === "ccWeapon" ? "weapons" : type;
}

// The kinds the world setting offers, in the order of the carried types.
export const ANNOUNCE_KINDS = [...new Set(CARRIED_TYPES.map(announceKind))];

/**
 * Whether an item only ever lies in the Stash: programs and digital gear.
 * @param {Object} item - The item, or its data
 * @returns {Boolean} True for programs and digital gear
 */
export function stashOnly(item) {
  return item?.type === "program" || item?.system?.slotType === "digital";
}

/**
 * Whether an item is one a character carries on a body or keeps in the Stash.
 * @param {Object} item - The item, or its data
 * @returns {Boolean} True for armour, weapons, gear and consumables
 */
export function isCarried(item) {
  return CARRIED_TYPES.includes(item?.type);
}

/**
 * The ids of the bodies among a list of items.
 * @param {Iterable<Object>} items - Items, or their data
 * @returns {Set<String>} The ids of the morphs and vehicles
 */
function bodyIdsAmong(items) {
  const ids = new Set();
  for (const item of items) if (item.type === "morph" || item.type === "vehicle") ids.add(item.id ?? item._id);
  return ids;
}

/**
 * Where a character's carried item lies: the id of the body it is on, or the Stash. An item whose
 * body is gone, or that was never placed, lies in the Stash.
 * @param {Actor} actor - The actor carrying it
 * @param {Object} item - The item, or its data
 * @returns {String|null} A body id or STASH; null for an NPC or goon, or an item that is not carried
 */
export function locationOf(actor, item) {
  if (actor?.type !== "character" || !(isCarried(item) || stashOnly(item))) return null;
  if (stashOnly(item)) return STASH;
  const boundTo = item.system?.boundTo;
  if (!boundTo || boundTo === STASH) return STASH;
  // The sleeved morph is a body even where its item went missing.
  if (boundTo === actor.system?.activeMorph) return boundTo;
  const body = actor.items.get(boundTo);
  return body && (body.type === "morph" || body.type === "vehicle") ? boundTo : STASH;
}

/**
 * The bodies a character can use items on: the morph it is sleeved in.
 * @param {Actor} actor - The character
 * @returns {String[]} Their ids
 */
export function usableBodies(actor) {
  return [actor?.system?.activeMorph].filter(Boolean);
}

/**
 * Whether a character can use a carried item: only on the sleeved morph or the jammed body. NPCs and
 * goons can use everything they own.
 * @param {Actor} actor - The actor
 * @param {Object} item - The item
 * @returns {Boolean} True when it can be used
 */
export function isUsable(actor, item) {
  if (actor?.type !== "character" || !isCarried(item)) return true;
  return usableBodies(actor).includes(locationOf(actor, item));
}

/**
 * A character's carried items in one place.
 * @param {Actor} actor - The character
 * @param {String} location - A body id or STASH
 * @returns {Item[]} The items lying there
 */
export function itemsOn(actor, location) {
  return actor.items.filter(item => locationOf(actor, item) === location);
}

/**
 * Where a character's carried item belongs when it has not been placed with the inventory yet, or
 * its body is gone: what was at hand goes onto the sleeved morph, everything else into the Stash.
 * @param {Object} item - The item, or its data
 * @param {Set<String>} bodyIds - The ids of the character's bodies
 * @param {String} [activeMorph] - The sleeved morph's id
 * @returns {String|undefined} The new boundTo, or undefined to leave it as it is
 */
export function carriedItemHome(item, bodyIds, activeMorph) {
  if (!isCarried(item)) return undefined;
  const boundTo = item.system?.boundTo;
  if (boundTo === STASH) return undefined;
  if (boundTo) return bodyIds.has(boundTo) ? undefined : STASH;
  if (item.type === "armor" || stashOnly(item)) return STASH;
  // The stored toggle, not the at-hand state prepareData now derives from the place; data without
  // one has the template's default, at hand.
  const atHand = (item._source?.system ?? item.system)?.active !== false;
  return atHand && activeMorph && bodyIds.has(activeMorph) ? activeMorph : STASH;
}

/**
 * The changes that give a character's carried items their place, for the inventory migration and
 * for characters brought in from elsewhere.
 * @param {Object[]} items - The character's items, or their data
 * @param {String} [activeMorph] - The sleeved morph's id
 * @returns {Object[]} One {_id, "system.boundTo"} per item that moves
 */
export function carriedItemPlacements(items, activeMorph) {
  const list = Array.from(items ?? []);
  const bodyIds = bodyIdsAmong(list);
  if (activeMorph) bodyIds.add(activeMorph);
  const updates = [];
  for (const item of list) {
    const home = carriedItemHome(item, bodyIds, activeMorph);
    if (home !== undefined) updates.push({ _id: item.id ?? item._id, "system.boundTo": home });
  }
  return updates;
}

/**
 * Where an item handed over to a character lands: what it carries on the sleeved morph, programs in
 * the Stash. Only items from another character, an NPC or a goon - a shop's goods and the like land
 * as before.
 * @param {Actor} sourceActor - Who hands it over
 * @param {Actor} targetActor - Who gets it
 * @param {Object} item - The item, or its data
 * @returns {String|undefined} The boundTo it gets, or undefined to leave it to the usual rules
 */
export function receivedItemHome(sourceActor, targetActor, item) {
  const managed = CONFIG.Actor.documentClass?.MANAGED_TYPES ?? [];
  if (targetActor?.type !== "character" || !managed.includes(sourceActor?.type)) return undefined;
  if (stashOnly(item)) return STASH;
  if (!isCarried(item)) return undefined;
  return targetActor.system?.activeMorph || STASH;
}

/**
 * Moves a character's carried item, or part of its stack, to a body or into the Stash. A stack of
 * the same item already there takes it in. Of a drug, the open pack goes first.
 * @param {Actor} actor - The character
 * @param {String} itemId - The item
 * @param {String} destination - A body id or STASH
 * @param {Object} [options] - quantity: how many of the stack move, all of it by default
 * @returns {Promise<Item|null>} The item as it lies at the destination
 */
export async function moveItem(actor, itemId, destination, { quantity } = {}) {
  const item = actor.items.get(itemId);
  if (!item || !isCarried(item)) return null;
  const held = Number(item.system.quantity);
  const stacked = foundry.utils.hasProperty(item.system, "quantity") && Number.isFinite(held) && held > 0;
  const count = stacked ? Math.min(held, Math.max(1, Math.floor(Number(quantity ?? held)) || 1)) : null;

  const moved = item.toObject();
  delete moved._id;
  moved.system.boundTo = destination;

  if (!stacked || count >= held) {
    const twin = actor.items.find(other => other.id !== item.id && sheetFunction.sameStack(actor, other, moved));
    if (!twin) {
      await item.update({ "system.boundTo": destination });
      return item;
    }
    await actor.deleteEmbeddedDocuments("Item", [item.id]);
    return sheetFunction.mergeOrCreateItem(actor, moved);
  }

  moved.system.quantity = count;
  const rest = { "system.quantity": held - count };
  if (item.type === "drug") rest["system.usagesUsed"] = 0;
  await item.update(rest);
  return sheetFunction.mergeOrCreateItem(actor, moved);
}
