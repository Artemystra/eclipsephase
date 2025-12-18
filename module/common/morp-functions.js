import * as sheetFunction from "../common/common-sheet-functions.js"

export async function resleeveMorph(actor, currentTarget){
    const dataset = currentTarget[0].dataset;
    const itemID = dataset.itemId;
    const itemName = dataset.name;
    const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.button.sleeveMorph"))+ ": " +(itemName?itemName:"");
    const popUpCopy = "ep2e.actorSheet.popUp.sleeveCopyGeneral";
    const popUpInfo = "ep2e.actorSheet.popUp.sleeveAdditionalInfo";
    const popUpPrimary = "ep2e.actorSheet.button.sleeveMorph";

    let popUp = await sheetFunction.confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, "", popUpPrimary);

    if(popUp.confirm === true){
        await actor.update({"system.activeMorph": itemID})
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

export async function deleteMorph(actor, activeMorph){
    const deletionList = [];
    const morphCollection = actor.type === "character" ? actor.bodies[activeMorph] : actor.bodies["activeMorph"];
    const consolidatedItemList = [...morphCollection.morphdetails, ...morphCollection.morphtraits, ...morphCollection.morphflaws, ...morphCollection.morphgear];
    for (let item of consolidatedItemList){
        deletionList.push(item.id);
    }
    await actor.deleteEmbeddedDocuments("Item", deletionList)
}