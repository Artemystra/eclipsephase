import { weaponPreparation, damageValueCalc } from "../common/weapon-functions.js"
import { WEAPON_DAMAGE_OUTPUT, rollToChat } from "./dice.js"

export async function prepareWeapon(data, result, preparedData){

    /*const messageID = data.target.closest(`[data-message-id]`).dataset.messageId
    console.log("messageID: ", game.messages.get(messageID))*/
    const dataset = preparedData ? preparedData : data.currentTarget.dataset;
    const actor = game.actors.get(dataset.actorid);
    const weaponID = dataset.weaponid;
    const selectedWeaponMode = dataset.weaponmode;
    const rolledFrom = dataset.rolledfrom;
    const skillKey = rolledFrom === "ccWeapon" ? "melee" : "guns"
    const rollResult = dataset.rollresult ? parseInt(dataset.rollresult) : result;
    const biomorphTarget = dataset.biomorphtarget === "true" ? true : false
    const touchOnly = dataset.touchonly === "true" ? true : false
    const attackMode = dataset.attackmode
    let modeDamage
    if(attackMode === "burst" || attackMode === "aggressive" || attackMode === "aggressiveCharge")
        modeDamage = "+1d10"
    else if(attackMode === "charge")
        modeDamage = "+1d6"
    else if(attackMode === "fullAuto")
        modeDamage = "+2d10"
    else
        modeDamage = ""

    let weaponSelected = await weaponPreparation(actor, skillKey, rolledFrom, weaponID, selectedWeaponMode)
    console.log("Weapon Selected: ", selectedWeaponMode)
    if(rollResult > 2 && rollResult < 6 || rollResult === 7 || rollResult === 9)
        await dealWeaponDamage(actor, weaponSelected, rollResult, modeDamage, biomorphTarget, touchOnly)


    else if (weaponSelected.weaponTraits.automatedEffects.dvOnMiss){
        let damageCalc = await damageValueCalc({type: "kinetic"},  weaponSelected.weaponTraits.automatedEffects.dvOnMiss.dv, null, "ammo")
        let rollFormula = damageCalc.dv

        //The message is built
        let message = {}
                        
        message.type = "damage";
        message.weaponName = weaponSelected.weaponName;
        message.ammoLoadedName = rolledFrom === "rangedWeapon" ? weaponSelected.weapon.system.ammoSelected.name : null

        //Weapon traits are added
        message.weaponTraits = weaponSelected.weaponTraits.additionalEffects
        message.weaponTraits["dvOnMiss"] = weaponSelected.weaponTraits.automatedEffects["dvOnMiss"]
        message.weaponTraits.dvOnMiss["calculated"] = rollFormula

        let html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

        let roll = await new Roll(rollFormula).evaluate({async: true});
        let label = html;

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
        });
    }

}

async function dealWeaponDamage(actorWhole, weaponSelected, rollResult, modeDamage, biomorphTarget, touchOnly){
    let meleeDamageMod = actorWhole.system.mods.meleeDamageMod
    let successModifier = "";
    let criticalModifier = "";
    let weaponDamage = touchOnly ? "ep2e.item.weapon.table.noDamage" : weaponSelected.weaponDamage
    let blind = false
    let recipientList = []

    if(rollResult === 4)
        successModifier = "+1d6";

    else if(rollResult === 5)
        successModifier = "+2d6";

    else if(rollResult === 7 || rollResult === 9){
        criticalModifier = "2*(";
        successModifier = ")";
    }
    
    //Damage Chat Message Constructor
    let intermediateRollFormula =  weaponDamage + modeDamage + (meleeDamageMod ? meleeDamageMod : "") + (biomorphTarget ? " + 1d6" : "") + successModifier;
    let rollFormula = null

    if (criticalModifier && !weaponSelected.weaponTraits.automatedEffects.dvHalved) {
        rollFormula = criticalModifier + (intermediateRollFormula);
    }
    else if (!criticalModifier && !weaponSelected.weaponTraits.automatedEffects.dvHalved){
        rollFormula = intermediateRollFormula;
    }
    else if (!criticalModifier && weaponSelected.weaponTraits.automatedEffects.dvHalved){
        rollFormula = "ceil((" + intermediateRollFormula + ")/2)";
    }
    else {
        rollFormula = "ceil((" + criticalModifier + (intermediateRollFormula) + ")/2)";
    }
    
    //The message is built
    let message = {}
    
    message.type = "damage";
    message.weaponName = weaponSelected.weaponName;
    message.ammoLoadedName = weaponSelected.rolledFrom === "rangedWeapon" ? weaponSelected.weapon.system.ammoSelected.name : null

    //Weapon traits are added
    message.weaponTraits = weaponSelected.weaponTraits.additionalEffects;
    if (biomorphTarget){
        message.weaponTraits["bioMorphsOnly"] = weaponSelected.weaponTraits.confirmationEffects["bioMorphsOnly"]
    }

    //Weapon Traits object gets deleted, if it's empty
    if (!Object.keys(message.weaponTraits).length > 0){
        delete message.weaponTraits
    }

    let html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

    if (!weaponSelected.weaponTraits.automatedEffects.noDamage && weaponDamage != "ep2e.item.weapon.table.noDamage"){
        let roll = await new Roll(rollFormula).evaluate({async: true});

        await rollToChat(message, WEAPON_DAMAGE_OUTPUT, roll, actorWhole, recipientList, blind, "damageOutput")

    }
    else {
        html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actorWhole}),
            content: html
        })
    }
}
