import * as sheetFunction from "./general-sheet-functions.js"
import * as resleeving from "../rolls/resleeving.js"

export async function resleeveMorph(actor, currentTarget, sheet){
    // Can't resleeve while jamming - your ego is off piloting a remote body. Also backs up the
    // sheet's own Sleeve-button-hidden-while-jamming rule (see morph-tab.html).
    if (actor.system.activeJam) return;

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

        await actor.update({
            "system.activeMorph": itemID,
            "system.pools.flex.value": egoFlex + newBodyFlexMax
        });
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

export async function replaceMorph(actor, activeMorph, newMorph){
    const oldMorph = actor.items.get(activeMorph)
    const oldName = oldMorph ? oldMorph.name : "no Morph"
    const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.popUp.sleeveReplaceHeadline"))
    const popUpCopy = (game.i18n.localize("ep2e.actorSheet.popUp.sleeveReplaceCopyOld"))+oldName+(game.i18n.localize("ep2e.actorSheet.popUp.sleeveReplaceCopyNew"))+newMorph.name;
    const popUpInfo = "ep2e.actorSheet.popUp.sleeveReplaceInfo";
    const popUpPrimary = "ep2e.actorSheet.button.sleeveMorph";

    let popUp = await sheetFunction.confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, "", popUpPrimary);

    if(popUp.confirm === true){
        if (!oldMorph) return;
        await deleteBody(actor, activeMorph);
        return;
    }
    else{
        return;
    }
}

// Jams a body (Vehicle or, since Puppet Sock support, a Morph) - identical rules for either type.
// Jamming a DIFFERENT body while already jamming is allowed (switches: implicitly restores the old
// body first, then jams the new one) - only jamming the SAME already-jammed body again is a no-op.
export async function jamBody(actor, currentTarget, sheet) {
    const dataset = currentTarget.dataset;
    const itemID = dataset.itemId;
    if (actor.system.activeJam === itemID) return;

    const body = actor.items.get(itemID);
    if (!body) return;

    // Defense in depth: the Jam button is already disabled in the sheet for bodies without a
    // Puppet Sock, but don't rely on that alone (e.g. a stale render, a direct API call).
    if (!actor.system.additionalSystems?.puppetSocked?.includes(itemID)) return;

    const itemName = dataset.name;
    const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.button.jamVehicle")) + ": " + (itemName ? itemName : "");
    const popUpCopy = "ep2e.actorSheet.popUp.jamCopyGeneral";
    const popUpInfo = "ep2e.actorSheet.popUp.jamAdditionalInfo";
    const popUpPrimary = "ep2e.actorSheet.button.jamVehicle";
    const JAM_MESSAGE = 'systems/eclipsephase/templates/chat/change.html';

    let popUp = await sheetFunction.confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, "", popUpPrimary);

    if (popUp.confirm === true) {
        // Switching from another jammed body: restore it first (silently, no separate dialog) so
        // its stashed health/pools aren't just overwritten by the new jam's stash.
        if (actor.system.activeJam) {
            await restoreFromJam(actor);
        }

        sheet.tabGroups.morph = itemID;

        // Flex is spent Body-Flex first, Ego Flex only once that's gone. So work out how much of the
        // current value is already eating into Ego Flex - that part carries into the jammed body, the
        // real body's own share does not (the jammed body gets its own, separate Body-Flex share instead).
        const egoFlex = Number(actor.system.ego.egoFlex) || 0;
        const originalTotalFlex = Number(actor.system.pools.flex.totalFlex) || 0;
        const originalBodyFlexMax = originalTotalFlex - egoFlex;
        const originalFlexSpent = originalTotalFlex - (Number(actor.system.pools.flex.value) || 0);
        const egoFlexSpent = Math.max(0, originalFlexSpent - originalBodyFlexMax);
        const bodyFlexRemaining = Math.max(0, originalBodyFlexMax - originalFlexSpent);
        const jammedBodyFlexMax = Number(body.system.flex) || 0;
        const jammedFlexValue = Math.max(0, egoFlex + jammedBodyFlexMax - egoFlexSpent);

        // Stash the real body's damage and pools so they're untouched while jamming, then start the jammed body fresh
        await actor.update({
            "system.activeJam": itemID,
            "flags.eclipsephase.jamHealthBackup": {
                value: actor.system.health.physical.value,
                wounds: actor.system.physical.wounds,
                vigor: actor.system.pools.vigor.value,
                insight: actor.system.pools.insight.value,
                moxie: actor.system.pools.moxie.value,
                bodyFlexValue: bodyFlexRemaining
            },
            "system.health.physical.value": 0,
            "system.physical.wounds": 0,
            "system.pools.flex.value": jammedFlexValue
        });
        await actor.update({ "flags.eclipsephase.resleeving": true });

        let message = {
            type: "jamming",
            actor: actor,
            morphtype: body.type === "morph" ? body.system.type : body.system.chassisType,
            morphname: body.name
        };

        let html = await foundry.applications.handlebars.renderTemplate(JAM_MESSAGE, message);
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: html
        });
    }
}

// Shared restore math for ending a jam - used both by unjamBody's own confirm dialog and by
// jamBody's silent implicit-unjam when switching straight from one jammed body to another.
async function restoreFromJam(actor) {
    const backup = actor.getFlag("eclipsephase", "jamHealthBackup");
    if (!backup) {
        // No stashed state to restore (e.g. an already-consumed/orphaned backup) - just end the
        // jam without zeroing out health/pools via the "?? 0" fallbacks below.
        console.warn(`[EP2e] ${actor.name}: unjammed with no jamHealthBackup present - health/pools left as-is.`);
        await actor.update({ "system.activeJam": null });
        return;
    }

    // Same Body-Flex-first logic as jamming, in reverse: work out how much Ego Flex was spent
    // while jamming (anything beyond the drone's own Body-Flex share), and carry only that back.
    const egoFlex = Number(actor.system.ego.egoFlex) || 0;
    const droneTotalFlex = Number(actor.system.pools.flex.totalFlex) || 0;
    const droneBodyFlexMax = droneTotalFlex - egoFlex;
    const droneFlexSpent = droneTotalFlex - (Number(actor.system.pools.flex.value) || 0);
    const egoFlexSpent = Math.max(0, droneFlexSpent - droneBodyFlexMax);
    const restoredBodyFlexValue = Number(backup?.bodyFlexValue ?? 0);
    const restoredFlexValue = Math.max(0, egoFlex + restoredBodyFlexValue - egoFlexSpent);

    // Restore the real body's damage and pools from before jamming; the drone's are not kept.
    // Restored directly (not via the resleeving flag) so pools return to their exact prior values instead of refilling to full.
    await actor.update({
        "system.activeJam": null,
        "system.health.physical.value": backup?.value ?? 0,
        "system.physical.wounds": backup?.wounds ?? 0,
        "system.pools.vigor.value": backup?.vigor ?? 0,
        "system.pools.insight.value": backup?.insight ?? 0,
        "system.pools.moxie.value": backup?.moxie ?? 0,
        "system.pools.flex.value": restoredFlexValue,
        "flags.eclipsephase.-=jamHealthBackup": null
    });
}

export async function unjamBody(actor, currentTarget, sheet) {
    // Guards against a second unjam (e.g. a double click) - jamHealthBackup would already be gone
    // after the first pass, and restoring with the "?? 0" fallbacks in restoreFromJam would zero
    // everything out.
    if (!actor.system.activeJam) return;

    const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const popUpHeadline = game.i18n.localize("ep2e.actorSheet.button.unjamVehicle");
    const popUpCopy = "ep2e.actorSheet.popUp.unjamCopyGeneral";
    const popUpInfo = "";
    const popUpPrimary = "ep2e.actorSheet.button.unjamVehicle";

    let popUp = await sheetFunction.confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, "", popUpPrimary);

    if (popUp.confirm === true) {
        sheet.tabGroups.morph = "sleeved";
        await restoreFromJam(actor);
    }
}

// Deletes a body (Morph or Vehicle) and everything bound to it (Ware, Traits, Flaws).
export async function deleteBody(actor, bodyId){
    const deletionList = [];
    let bucketKey = bodyId;
    if (actor.type !== "character") {
        // npc/goon share one fixed key per body type, not per item, so the type of the item
        // actually being deleted decides which bucket to consolidate - otherwise deleting a
        // Vehicle could sweep up an unrelated leftover Morph bound to the same "activeMorph" key.
        const bodyItem = actor.items.get(bodyId);
        bucketKey = bodyItem?.type === "vehicle" ? "activeVehicle" : "activeMorph";
    }
    const bodyCollection = actor.bodies[bucketKey];
    const consolidatedItemList = [...bodyCollection.morphdetails, ...bodyCollection.morphtraits, ...bodyCollection.morphflaws, ...bodyCollection.morphgear];
    for (let item of consolidatedItemList){
        deletionList.push(item.id);
    }
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