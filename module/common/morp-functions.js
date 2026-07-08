import * as sheetFunction from "./general-sheet-functions.js"
import * as resleeving from "../rolls/resleeving.js"

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
        await deleteMorph(actor, activeMorph);
        return;
    }
    else{
        return;
    }
}

export async function jammVehicle(actor, currentTarget, sheet) {
    const dataset = currentTarget.dataset;
    const itemID = dataset.itemId;
    const vehicle = actor.items.get(itemID);
    const itemName = dataset.name;
    const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.button.jamVehicle")) + ": " + (itemName ? itemName : "");
    const popUpCopy = "ep2e.actorSheet.popUp.jamCopyGeneral";
    const popUpInfo = "ep2e.actorSheet.popUp.jamAdditionalInfo";
    const popUpPrimary = "ep2e.actorSheet.button.jamVehicle";
    const JAM_MESSAGE = 'systems/eclipsephase/templates/chat/change.html';

    let popUp = await sheetFunction.confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, "", popUpPrimary);

    if (popUp.confirm === true) {
        sheet.tabGroups.morph = itemID;

        // Flex is spent Body-Flex first, Ego Flex only once that's gone. So work out how much of the
        // current value is already eating into Ego Flex - that part carries into the drone, the body's
        // own share does not (the drone gets its own, separate Body-Flex share instead).
        const egoFlex = Number(actor.system.ego.egoFlex) || 0;
        const originalTotalFlex = Number(actor.system.pools.flex.totalFlex) || 0;
        const originalBodyFlexMax = originalTotalFlex - egoFlex;
        const originalFlexSpent = originalTotalFlex - (Number(actor.system.pools.flex.value) || 0);
        const egoFlexSpent = Math.max(0, originalFlexSpent - originalBodyFlexMax);
        const bodyFlexRemaining = Math.max(0, originalBodyFlexMax - originalFlexSpent);
        const droneBodyFlexMax = Number(vehicle.system.pools?.flex?.max) || 0;
        const droneFlexValue = Math.max(0, egoFlex + droneBodyFlexMax - egoFlexSpent);

        // Stash the real body's damage and pools so they're untouched while jamming, then start the drone fresh
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
            "system.pools.flex.value": droneFlexValue
        });
        await actor.update({ "flags.eclipsephase.resleeving": true });

        let message = {
            type: "jamming",
            actor: actor,
            morphtype: vehicle.system.type,
            morphname: vehicle.name
        };

        let html = await foundry.applications.handlebars.renderTemplate(JAM_MESSAGE, message);
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: html
        });
    }
}

export async function unjamVehicle(actor, currentTarget, sheet) {
    const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const popUpHeadline = game.i18n.localize("ep2e.actorSheet.button.unjamVehicle");
    const popUpCopy = "ep2e.actorSheet.popUp.unjamCopyGeneral";
    const popUpInfo = "";
    const popUpPrimary = "ep2e.actorSheet.button.unjamVehicle";

    let popUp = await sheetFunction.confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, "", popUpPrimary);

    if (popUp.confirm === true) {
        sheet.tabGroups.morph = "sleeved";

        // Same Body-Flex-first logic as jamming, in reverse: work out how much Ego Flex was spent
        // while jamming (anything beyond the drone's own Body-Flex share), and carry only that back.
        const backup = actor.getFlag("eclipsephase", "jamHealthBackup");
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
}

export async function deleteMorph(actor, activeMorph){
    const deletionList = [];
    const morphCollection = actor.type === "character" ? actor.bodies[activeMorph] : actor.bodies["activeMorph"];
    const consolidatedItemList = [...morphCollection.morphdetails, ...morphCollection.morphtraits, ...morphCollection.morphflaws, ...morphCollection.morphgear];
    for (let item of consolidatedItemList){
        deletionList.push(item.id);
    }
    await actor.deleteEmbeddedDocuments("Item", deletionList)
}