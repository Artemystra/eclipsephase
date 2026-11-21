import * as Dice from "../rolls/dice.js"
import { tempEffectCreation, listSelection, tempEffectDeletion, prepareRecipients, inheritChatVisibility } from "../common/general-sheet-functions.js"
import { registerSocketActions, runOrRelay } from "../common/socket.js"

/**
 * Function to automatically test for SOM and WIL when a body is changed by a player.
 * After the tests Damage & Active Effects are automatically generated.
 * @param {Object} data - uses the data.currentTarget.actorid to identify the actor to be asked for a SOM/WIL roll
 */
const INTEGRATION_PREFIX = "ep2e.morph.sleeving.announce.result.effectIntegrationIssues.";

/**
 * How long a failed Integration Test hampers the character. RAW: a day, plus a day per superior
 * failure, which the result code already distinguishes.
 * @param {Number} integrationResult - The result code of the Integration Test
 * @returns {Object} The label naming the span and the number of days it lasts
 */
export function integrationPenalty(integrationResult) {
  if (integrationResult === 2) return { label: INTEGRATION_PREFIX + "oneDay", days: 1 };
  if (integrationResult === 1) return { label: INTEGRATION_PREFIX + "twoDay", days: 2 };
  return { label: INTEGRATION_PREFIX + "threeDay", days: 3 };
}

// The two ways a failed Stress Test can hurt, chosen before the roll.
const STRESS_OPTIONS = [
    { id: "minorStress", label: "ep2e.dialog.selectStress.minorLabel", description: "ep2e.dialog.selectStress.minorDescription" },
    { id: "majorStress", label: "ep2e.dialog.selectStress.majorLabel", description: "ep2e.dialog.selectStress.majorDescription" }
];
const STRESS_CHOICE_TEMPLATE = "systems/eclipsephase/templates/chat/resleeve-stress.html";
const SLEEVE_RESULT = "systems/eclipsephase/templates/chat/sleeving-result.html";

/**
 * Asks for the tests a body change calls for in one dialog - the Integration Test (SOM) and the
 * Stress Test (WIL) side by side, what a failed Stress Test costs and who sees it - rolls them and
 * posts their result card, from which pools can still be spent before the results are accepted.
 * @param {Object} data - The click, its currentTarget's dataset naming the actor and the type:
 *   "resleeve" (both tests), "integration" or "stress"
 * @returns {Promise<ChatMessage|null>} The result card, or null when cancelled
 */
export async function sleevingTest (data) {
    const btndata = data.currentTarget.dataset
    const actorWhole = game.actors.get(btndata.actorid)
    const actorModel = actorWhole.system
    const withIntegration = btndata.type === "resleeve" || btndata.type === "integration"
    const withStress = btndata.type === "resleeve" || btndata.type === "stress"
    const taskType = btndata.type === "integration" ? "ep2e.morph.sleeving.result.taskIntegration" : btndata.type === "stress" ? "ep2e.morph.sleeving.result.taskStress" : "ep2e.morph.sleeving.result.taskResleeve"
    const check = (titleKey, aptitude, rolledFrom) => ({
        heading: game.i18n.localize(titleKey),
        rolledFrom,
        actorModel,
        actorWhole,
        dataset: {
            "name" : titleKey,
            "rolltype" : "skill",
            "aptvalue" : actorModel.aptitudes[aptitude].value,
            "apttype" : aptitude,
            "rollvalue" : actorModel.aptitudes[aptitude].roll,
            "dialogTitle" : game.i18n.localize(titleKey),
            "preventPrintToChat" : true
        }
    })
    const checks = [
        ...(withIntegration ? [check("ep2e.morph.sleeving.title.resleevingIntegration", "som", "integration")] : []),
        ...(withStress ? [check("ep2e.morph.sleeving.title.resleevingStress", "wil", "stressTest")] : [])
    ]
    const shared = withStress
        ? { content: await foundry.applications.handlebars.renderTemplate(STRESS_CHOICE_TEMPLATE, { options: STRESS_OPTIONS }), read: root => Dice.readDialogValues(root, ["stressSeverity"]) }
        : {}
    const title = game.i18n.format("ep2e.morph.sleeving.title.dialog", { task: game.i18n.localize(taskType), name: actorWhole.name })
    const rolled = await Dice.rollChecksSideBySide(checks, { title, shared })
    if (!rolled || rolled.results.some(result => !result)) return null

    const chatData = {
        taskType,
        integrationTest: withIntegration ? rolled.results[0] : undefined,
        stressTest: withStress ? rolled.results.at(-1) : undefined,
        stressSeverity: rolled.shared.stressSeverity || "",
        rollMode: { private: "gmroll", blind: "blindroll" }[rolled.rollMode] ?? "publicroll"
    }
    const html = await foundry.applications.handlebars.renderTemplate(SLEEVE_RESULT, chatData)
    const recipientList = prepareRecipients(rolled.rollMode)
    const announcement = game.messages.get(data.currentTarget.closest?.(".chat-message")?.dataset?.messageId)
    if (announcement) await runOrRelay(announcement, "markSleevingRolled", () => markSleevingRolled(announcement))
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({alias: actorWhole.name}),
        flavor: html,
        sound: chatData.integrationTest?.sound,
        ...(recipientList.length ? { whisper: recipientList } : {}),
        blind: rolled.rollMode === "blind"
    })
}

/**
 * Takes the roll buttons off a body change's announcement once its tests are rolled, and says so.
 * @param {ChatMessage} message - The announcement
 * @returns {Promise<ChatMessage|null>} The card, or null when it had no buttons left
 */
export async function markSleevingRolled(message) {
    const doc = new DOMParser().parseFromString(String(message?.content ?? ""), "text/html")
    const buttons = doc.querySelector(".privateChatButton")
    if (!buttons) return null
    const note = doc.createElement("p")
    note.className = "footnote"
    note.textContent = game.i18n.localize("ep2e.morph.sleeving.announce.rolled")
    buttons.replaceWith(note)
    return message.update({ content: doc.body.innerHTML })
}

/**
 * Lets the active GM take the buttons off an announcement this client may not change.
 * @returns {void}
 */
export function registerSleevingSocket() {
    registerSocketActions({
        markSleevingRolled: async ({ messageId }) => {
            const message = game.messages.get(messageId)
            if (message) await markSleevingRolled(message)
        }
    })
}

export async function result (data) {
    const dataset = data.currentTarget.dataset;
    const actorWhole = game.actors.get(dataset.actorid);
    const actorModel = actorWhole.system;
    // What follows is seen as the result card was.
    const messageId = data.currentTarget.closest?.(".chat-message")?.dataset?.messageId ?? null;
    const { blind, recipientList } = inheritChatVisibility(messageId, null);
    const visibility = { ...(recipientList?.length ? { whisper: recipientList } : {}), blind: !!blind };
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

        let html = await foundry.applications.handlebars.renderTemplate(SLEEVE_NEW_RESULT, chatData)
        
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({alias: actorWhole.name}),
            flavor: html,
            ...visibility
        })
    }
    const stressResult = (resultData[1].result === undefined || resultData[1].result === "") ? null : Number(resultData[1].result)
    await calcEffects (actorWhole, actorModel, Number(resultData[0].result), stressResult, { stressSeverity: dataset.stressseverity ?? "", ...visibility })
}

/**
 * What the accepted results of a body change do: a failed Integration Test hampers the character for
 * a day or more, a failed Stress Test costs stress - minor or major, as chosen before the roll, or
 * asked for here on a card from before that choice existed. Its cards are seen as given.
 * @param {Actor} actorWhole - The actor
 * @param {Object} actorModel - Its system data
 * @param {Number} integrationResult - The Integration Test's result tier
 * @param {Number|null} stressResult - The Stress Test's, null when none was rolled
 * @param {Object} [options] - stressSeverity ("minorStress" or "majorStress"), whisper and blind
 * @returns {Promise<void>} Resolves once done
 */
export async function calcEffects(actorWhole, actorModel, integrationResult, stressResult, { stressSeverity = "", whisper = null, blind = false } = {}) {
    const visibility = { ...(whisper?.length ? { whisper } : {}), blind: !!blind }
    //Message for the ChatMessage.create() function
    let message = {}

    const failed = result => result <= 2 || result === 6 || result === 8;
    if (!failed(integrationResult) && (stressResult === null || !failed(stressResult))){
        message = {
            "type": "defaultDamage",
            "copy": "ep2e.morph.sleeving.announce.result.cleanCopy"
        }
        let html = await foundry.applications.handlebars.renderTemplate(Dice.WEAPON_DAMAGE_OUTPUT, message);
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({alias: actorWhole.name}),
            content: html,
            ...visibility
        })
        return;
    }

    //Checks if the final integration test result is a failure
    if (failed(integrationResult)){

        const { label: effectMultiplier, days } = integrationPenalty(integrationResult);

        let effectName = game.i18n.localize("ep2e.morph.sleeving.announce.result.effectIntegrationIssues.title") + ": " + game.i18n.localize(effectMultiplier);
        let effectIcon = "systems/eclipsephase/resources/icons/substract.png";
        let changes = [
            {"key" : "system.additionalSystems.sleeving.integrationIssues.title", "mode" : 2, "value" : effectName}, 
            {"key" : "system.additionalSystems.sleeving.integrationIssues.value", "mode" : 2, "value" : -10}, 
            {"key" : "system.additionalSystems.sleeving.integrationIssues.identifier", "mode" : 2, "value" : "integrationIssues"}
        ]

        await tempEffectDeletion(actorWhole, "eclipsephase", "effectKey", ["integrationIssues"]);

        await tempEffectCreation(actorWhole, effectName, effectIcon, changes, "integrationIssues", days * 24);

        message = {
            "type": "defaultDamage",
            "copy": "ep2e.morph.sleeving.announce.result.integrationCopy"
        }
        let html = await foundry.applications.handlebars.renderTemplate(Dice.WEAPON_DAMAGE_OUTPUT, message);
        ChatMessage.create({    
            speaker: ChatMessage.getSpeaker({alias: actorWhole.name}),
            content: html,
            ...visibility
        })
    }
    
    //Checks if the final stress test result is a failure (no stress test happened, e.g. jamming, when stressResult is null)
    if (stressResult !== null && failed(stressResult)){const listOptions = [{"id" : "minorStress", "label" : "ep2e.dialog.selectStress.minorLabel", "description" : "ep2e.dialog.selectStress.minorDescription"}, {"id" : "majorStress", "label" : "ep2e.dialog.selectStress.majorLabel", "description" : "ep2e.dialog.selectStress.majorDescription"}]
        const dialog = stressSeverity ? { selection: stressSeverity } : await listSelection(listOptions, "standardSelectionList", 300, "ep2e.dialog.selectStress.dialogTitle", "", "ep2e.dialog.selectStress.copy");
        if (dialog.cancelled) return;
        let stressUpdate = actorModel.health.mental.value;
        let traumaUpdate = actorModel.mental.trauma;
        let insanity = actorModel.health.insanity.max + actorModel.health.mental.max
        let traumaThreshold = actorModel.mental.tt
        let mentalDamageRoll = "1d6"

        if (dialog.selection === "majorStress") mentalDamageRoll = "1d10";
        const mentalDamage = await new Roll(mentalDamageRoll).evaluate();
        
        
        message = {
            "type": "defaultDamage",
            "rollTitle": "ep2e.roll.announce.stressReceived",
            "copy": "ep2e.morph.sleeving.announce.result.stressCopy"
        }

        message.rollType = "rollOutput"

        await Dice.rollToChat(null, message, Dice.WEAPON_DAMAGE_OUTPUT, mentalDamage, actorWhole.name, whisper ?? null, !!blind, "rollOutput")

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