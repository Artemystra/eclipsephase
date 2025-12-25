import * as Dice from "../rolls/dice.js"

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

    if (btndata.type === "resleeve" || btndata.type === "integration"){

        dataset = {
            name : "Integrationtest",
            rolltype : "skill",
            aptvalue : actorModel.aptitudes.som.value,
            apttype : "som",
            rollvalue : actorModel.aptitudes.som.roll,
            dialogTitle : game.i18n.localize('ep2e.morph.sleeving.title.resleevingIntegration'),
            specialRollResult : true
        }

        if (btndata.type !== "resleeve") chatData.taskType = "ep2e.morph.sleeving.result.taskIntegration"

        integrationTest = await Dice.RollCheck(dataset, actorModel, actorWhole, systemOptions, false, false)
    }

    if (btndata.type === "resleeve" || btndata.type === "stress"){

        dataset = {
            name : "Stress Test",
            rolltype : "skill",
            aptvalue : actorModel.aptitudes.wil.value,
            apttype : "wil",
            rollvalue : actorModel.aptitudes.wil.roll,
            dialogTitle : game.i18n.localize('ep2e.morph.sleeving.title.resleevingStress'),
            specialRollResult : true
        }

        if (btndata.type !== "resleeve") chatData.taskType = "ep2e.morph.sleeving.result.taskStress"

        stressTest = await Dice.RollCheck(dataset, actorModel, actorWhole, systemOptions, false, false)
    }
    
    chatData.stressTest = stressTest;
    chatData.integrationTest = integrationTest;
    let html = await renderTemplate(SLEEVE_RESULT, chatData)

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: this.actor}),
        flavor: html
    })
    console.log("the chatData:", chatData)
}

async function result () {

}