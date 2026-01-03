import * as Dice from "../rolls/dice.js"
import { _tempEffectCreation, listSelection } from "../common/common-sheet-functions.js"

/**
 * Function to automatically test for SOM and WIL when a body is changed by a player.
 * After the tests Damage & Active Effects are automatically generated.
 * @param {Object} data - uses the data.currentTarget.actorid to identify the actor to be asked for a SOM/WIL roll
 */
export async function sleevingTest (data) {
    const btndata = data.currentTarget.dataset
    const actorWhole = game.actors.get(btndata.actorid)
    const actorModel = actorWhole.system
    const systemOptions = {"askForOptions" : event.shiftKey, "optionsSettings" : game.settings.get("eclipsephase", "showTaskOptions"), "brewStatus" : game.settings.get("eclipsephase", "superBrew")}
    let integrationTest
    let stressTest
    let dataset = {}
    let chatData = {"taskType" : "ep2e.morph.sleeving.result.taskResleeve"}
    const SLEEVE_RESULT = 'systems/eclipsephase/templates/chat/sleeving-result.html';
    console.log("btndata here", btndata)
    if (btndata.type === "resleeve" || btndata.type === "integration"){
        console.log("DING")
        dataset = {
            "name" : "ep2e.morph.sleeving.title.resleevingIntegration",
            "rolltype" : "skill",
            "aptvalue" : actorModel.aptitudes.som.value,
            "apttype" : "som",
            "rollvalue" : actorModel.aptitudes.som.roll,
            "dialogTitle" : game.i18n.localize('ep2e.morph.sleeving.title.resleevingIntegration'),
            "preventPrintToChat" : true
        }

        if (btndata.type !== "resleeve") chatData.taskType = "ep2e.morph.sleeving.result.taskIntegration"

        integrationTest = await Dice.RollCheck(dataset, actorModel, actorWhole, systemOptions, false, "integration")
    }

    if (btndata.type === "resleeve" || btndata.type === "stress"){

        dataset = {
            "name" : "ep2e.morph.sleeving.title.resleevingStress",
            "rolltype" : "skill",
            "aptvalue" : actorModel.aptitudes.wil.value,
            "apttype" : "wil",
            "rollvalue" : actorModel.aptitudes.wil.roll,
            "dialogTitle" : game.i18n.localize('ep2e.morph.sleeving.title.resleevingStress'),
            "preventPrintToChat" : true
        }

        if (btndata.type !== "resleeve") chatData.taskType = "ep2e.morph.sleeving.result.taskStress"

        stressTest = await Dice.RollCheck(dataset, actorModel, actorWhole, systemOptions, false, "stressTest")
    }
    
    chatData.stressTest = stressTest;
    chatData.integrationTest = integrationTest;
    let html = await renderTemplate(SLEEVE_RESULT, chatData)

    console.log("the chatData:", chatData)

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({alias: actorWhole.name}),
        flavor: html,
        sound: chatData.integrationTest.sound
    })
}

export async function result (data) {
    const dataset = data.currentTarget.dataset;
    const actorWhole = game.actors.get(dataset.actorid);
    const actorModel = actorWhole.system;
    const SLEEVE_NEW_RESULT = 'systems/eclipsephase/templates/chat/sleeving-result.html';
    let resultData = [{
        "result":dataset.oldintegrationtestresult, 
        "taskName":dataset.integrationtesttaskname, 
        "resultText":dataset.oldintegrationtestresulttext, 
        "resultClass":dataset.oldintegrationtestresultclass
    },{
        "result":dataset.oldstresstestresult, 
        "taskName":dataset.stresstesttaskname, 
        "resultText":dataset.oldstresstestresulttext, 
        "resultClass":dataset.oldstresstestresultclass
    }];   
    let poolUpdate = [];
    let chatData = {};

    if (dataset.poolused){
        const root = data.currentTarget.closest(".chat-message") ?? html[0];
        const select = root.querySelector('select[name="poolUsage"]');
        const selectValue = select.value;
        resultData[0].type = selectValue.slice(0,4);
        resultData[1].type = selectValue.slice(4);

        if(resultData[0].type === "pool"){
            resultData[0].poolValue = actorModel.pools.vigor.value -1
            resultData[0].updatePath = "system.pools.vigor.value"
            resultData[0].resultClass = dataset.integrationtestresultclass
            resultData[0].resultText = dataset.integrationtestresulttext
            resultData[0].result = dataset.integrationtestresult
        }
        else if (resultData[0].type === "flex"){
            resultData[0].poolValue = actorModel.pools.flex.value - 1
            resultData[0].updatePath = "system.pools.flex.value"
            resultData[0].resultClass = dataset.integrationtestresultclass
            resultData[0].resultText = dataset.integrationtestresulttext
            resultData[0].result = dataset.integrationtestresult
        }

        if(resultData[1].type === "pool"){
            resultData[1].poolValue = actorModel.pools.moxie.value - 1
            resultData[1].updatePath = "system.pools.moxie.value"
            resultData[1].resultClass = dataset.stresstestresultclass
            resultData[1].resultText = dataset.stresstestresulttext
            resultData[1].result = dataset.stresstestresult
        }
        else if (resultData[1].type === "flex"){
            resultData[1].poolValue = actorModel.pools.flex.value - 1
            resultData[1].updatePath = "system.pools.flex.value"
            resultData[1].resultClass = dataset.stresstestresultclass
            resultData[1].resultText = dataset.stresstestresulttext
            resultData[1].result = dataset.stresstestresult
        }

        poolUpdate = {
            [resultData[0].updatePath] : [resultData[0].poolValue], 
            [resultData[1].updatePath] : [resultData[1].poolValue]
        }
        actorWhole.update(poolUpdate)

        chatData.integrationTest = resultData[0]
        chatData.stressTest = resultData[1]

        let html = await renderTemplate(SLEEVE_NEW_RESULT, chatData)
        
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({alias: actorWhole.name}),
            flavor: html
        })
    }

    await calcEffects (actorWhole, actorModel, resultData[0].result, resultData[1].result)
}

async function calcEffects(actorWhole, actorModel, integrationResult, stressResult) {
    //Message for the ChatMessage.create() function
    let message = {}

    //Checks if the final integration test result is a failure
    if (integrationResult <= 2 || integrationResult === 6 || integrationResult === 8){

        let effectMultiplier

        if(integrationResult <= 2 || integrationResult === 6 || integrationResult === 8) effectMultiplier = "ep2e.morph.sleeving.announce.result.effectIntegrationIssues.threeDay";
        if(integrationResult === 1) effectMultiplier = "ep2e.morph.sleeving.announce.result.effectIntegrationIssues.twoDay";
        if (integrationResult === 2) effectMultiplier = "ep2e.morph.sleeving.announce.result.effectIntegrationIssues.oneDay";

        console.log("effectMultiplier", effectMultiplier)
        let effectName = game.i18n.localize("ep2e.morph.sleeving.announce.result.effectIntegrationIssues.title") + ": " + game.i18n.localize(effectMultiplier);
        let effectIcon = "systems/eclipsephase/resources/icons/substract.png";
        let changes = [{"key" : "system.additionalSystems.sleeving.integrationIssues.title", "mode" : 2, "value" : effectName}, {"key" : "system.additionalSystems.sleeving.integrationIssues.value", "mode" : 2, "value" : -10}]

        if(!actorModel.additionalSystems.sleeving.integrationIssues){
            await _tempEffectCreation(actorWhole, effectName, effectIcon, changes);
        }
        else {
            for (let effect of actorWhole.effects){
                if (effect.name === actorModel.additionalSystems.sleeving.integrationIssues.title){
                    let effectID = effect._id;
                    await actorWhole.deleteEmbeddedDocuments('ActiveEffect', [effectID]);
                    console.log("deleted:", effect)
                }
            }
            let newEffect = await _tempEffectCreation(actorWhole, effectName, effectIcon, changes);
            console.log("created:",newEffect)
        }

        message = {
            "type": "defaultDamage",
            "copy": "ep2e.morph.sleeving.announce.result.integrationCopy"
        }
        let html = await renderTemplate(Dice.WEAPON_DAMAGE_OUTPUT, message);
        ChatMessage.create({    
            speaker: ChatMessage.getSpeaker({alias: actorWhole.name}),
            content: html
        })
    }
    
    //Checks if the final stress test result is a failure
    if (stressResult <= 2 || stressResult === 6 || stressResult === 8){const listOptions = [{"id" : "minorStress", "label" : "ep2e.dialog.selectStress.minorLabel", "description" : "ep2e.dialog.selectStress.minorDescription"}, {"id" : "majorStress", "label" : "ep2e.dialog.selectStress.majorLabel", "description" : "ep2e.dialog.selectStress.majorDescription"}]
        const dialog = await listSelection(listOptions, "standardSelectionList", 300, "ep2e.dialog.selectStress.dialogTitle", "", "ep2e.dialog.selectStress.copy");
        let stressUpdate = actorModel.health.mental.value;
        let traumaUpdate = actorModel.mental.trauma;
        let insanity = actorModel.health.insanity.max + actorModel.health.mental.max
        let traumaThreshold = actorModel.mental.tt
        let mentalDamageRoll = "1d6"

        if (dialog.selection === "majorStress") mentalDamageRoll = "1d10"; console.log("PONG", mentalDamageRoll, "mentalDamage is = majorStress is:", dialog.selection === "majorStress")
        const mentalDamage = await new Roll(mentalDamageRoll).evaluate();
        
        
        message = {
            "type": "defaultDamage",
            "rollTitle": "ep2e.roll.announce.stressReceived",
            "copy": "ep2e.morph.sleeving.announce.result.stressCopy"
        }

        message.rollType = "rollOutput"

        await Dice.rollToChat(null, message, Dice.WEAPON_DAMAGE_OUTPUT, mentalDamage, actorWhole.name, null, false, "rollOutput")

        stressUpdate += mentalDamage.total;

        if (mentalDamage.total >= traumaThreshold){
            traumaUpdate += Math.floor(mentalDamage.total/traumaThreshold);
        }

        if (stressUpdate > insanity){
            stressUpdate = insanity
        }

        await actorWhole.update({"system.health.mental.value" : stressUpdate, "system.mental.trauma" : traumaUpdate})
    }

}