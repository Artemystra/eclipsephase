import { eclipsephase } from "../config.js";
import { TaskRollModifier, TaskRoll, rollCalc, TASK_RESULT_TEXT } from "./dice.js";
import { inheritChatVisibility, readRollContext } from "../common/general-sheet-functions.js";
import { getTaskResultText } from "../api/registry.js";
import { prepareWeapon, dealPsiDamage } from "./damage.js";
import { completeShopPurchase, postShopChatMessage, shopRepIconHtml } from "../common/general-helper-functions.js";

const POOL_USAGE_OUTPUT = "systems/eclipsephase/templates/chat/pool-usage.html"

/**
 * Prepares the pool usage based on the button clicked in the chat message. If the message also 
 * provides a velue for {rolledFrom} it will also prepare the weapon for the consequtive roll
 * @param {Object} data - Pulls all necessary data from the button clicked on the chat message
 */
export async function usePoolFromChat(data){
    const context = readRollContext(data.currentTarget)
    const pool = {...context.pool}
    const options = data.currentTarget.dataset.usepool
    const actor = await fromUuid(context.actorUuid)
    const rolledFrom = context.rolledFrom
    const {blind, recipientList} = inheritChatVisibility(context.messageId, context.options.rollMode)

    let updateResult = await update(options, pool, null, actor)

    if(updateResult){

        let message = {}

        message.resultText = context.alternatives.resultText;

        message.type = context.alternatives.usageType;
        message.newResult = context.alternatives.result ?? false;
        message.newValue = context.alternatives.value ?? false;
        message.poolName = pool.poolType ? pool.poolType : game.i18n.localize("ep2e.skills.flex.poolHeadline");

        let html = await foundry.applications.handlebars.renderTemplate(POOL_USAGE_OUTPUT, message)
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actor}),
            flavor: html,
            whisper: recipientList,
            blind: blind
        })

        Hooks.callAll("eclipsephase.poolResult", {context, actor, rolledFrom, newResult: context.alternatives.result, blind, recipientList})

        if(rolledFrom === "ccWeapon" || rolledFrom === "rangedWeapon"){
            await prepareWeapon(false, context.alternatives.result, context)
        }
        else if(rolledFrom === "psiSleight" && context.item.sleightId){
            const sleightItem = actor.items.get(context.item.sleightId);
            if(sleightItem?.system.damage?.d10 || sleightItem?.system.damage?.d6 || sleightItem?.system.damage?.bonus){
                await dealPsiDamage(actor, sleightItem, context.alternatives.result, blind, recipientList, context.options.push);
            }
        }
        else if(rolledFrom === "shopPurchase" && context.alternatives.resultClass === "success"){
            const bodyBindings = {};
            (context.shop.bodyBindings || "").split(",").filter(Boolean).forEach(pair => {
                const [id, boundTo] = pair.split(":");
                bodyBindings[id] = boundTo;
            });
            const boughtItems = await completeShopPurchase({
                shopUuid: context.shop.shopUuid,
                buyerActorId: context.shop.buyerActorId,
                itemIds: context.shop.itemIds,
                network: context.shop.network,
                favorTier: context.shop.requiredTier,
                bodyBindings
            })
            if (boughtItems.length) {
                // Only fires for shopPurchase rolls (Cash in Favor, Buy has no roll to rescue) -
                // the favor-tier box is right here too, mirroring _useGefallen()'s success path.
                const burnAmount = context.shop.burnAmount;
                const tierLabel = `<span style="font-size: 16px;">${game.i18n.localize(eclipsephase.favorTiers[context.shop.requiredTier])}</span>`;
                const boxContent = burnAmount > 0
                    ? `${tierLabel} + ${shopRepIconHtml(context.shop.network)} ${burnAmount}`
                    : `${shopRepIconHtml(context.shop.network)} ${tierLabel}`;
                await postShopChatMessage(actor, burnAmount > 0 ? "ep2e.shop.purchase.favorBurnMessage" : "ep2e.shop.purchase.favorMessage",
                    { character: actor.name, items: boughtItems.map(item => item.name).join(", "), network: context.shop.network.replace("-rep", "") },
                    boxContent);
            }
        }
    }

}

/** 
 * Updates the pool value of the actor based on the options selected in the dialog
 * @param {Object} options - The options selected in the dialog
 * @param {Object} task - The task object that will be rolled
 * @param {Object} actorWhole - The actor object data is being pulled from
*/
export async function update(options, pool, task, actorWhole){
    let poolValue
    let poolPath
    let poolType
    let updatedPool = pool.skillPoolValue
    let updatedFlex = pool.flexPoolValue

    if (options === "flex" || options === "flexIgnore"){
        poolPath = pool.updateFlexPath
        poolValue = eval("actorWhole." + poolPath)
        poolType = "ep2e.skills.flex.poolHeadline"
        updatedFlex = pool.flexPoolValue - 1
    }
    else {
        poolPath = pool.updatePoolPath
        poolValue = eval("actorWhole." + poolPath)
        poolType = pool.poolType
        updatedPool = pool.skillPoolValue - 1
    }
    
    //Checks if pool used
    if (poolValue > 0){
        let poolMod = 20;
        let poolUpdate = poolValue - 1;
        let message = game.i18n.localize('ep2e.roll.announce.poolUsage.poolUsed') + ": " + game.i18n.localize(poolType);
        //Determine pool to be updated

        actorWhole.update({[poolPath] : poolUpdate});
        
        if(options === "pool" && task || options === "flex" && task)
            task.addModifier(new TaskRollModifier(message, poolMod))

        let poolReturn = updatedFlex ? {"skillPoolValue": updatedPool, "flexPoolValue": updatedFlex} : {"skillPoolValue": updatedPool}

        return poolReturn
    }
    else if (poolValue <= 0){
        let message = {}
        
        message.type = "notEnoughPool";
        message.poolName = poolType;

        let html = await foundry.applications.handlebars.renderTemplate(POOL_USAGE_OUTPUT, message)
        
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actorWhole}),
            content: html,
            whisper: [game.user._id]
        })

        return false
    }
}

/**
 * Analyses the outcome of the roll and determines whether swapping, upgrading or mitigating is the best course of action
 * @param {Object} outputData - The data from the roll
 * @param {Object} pool - The pool object bound to the roll
 * @returns - An object containing the outcome of the analysis
 */
export async function outcomeAlternatives(outputData, pool, systemOptions){
    let resultText = getTaskResultText() ?? TASK_RESULT_TEXT;
    let obj = {options: {swap: false, upgrade: false, mitigate: false}} 
    obj.value = await swapDice(outputData.rollResult);
    obj.result =  rollCalc(obj.value, outputData.targetNumber)
    obj.originalResult = rollCalc(outputData.rollResult, outputData.targetNumber)
    obj.resultClass = resultText[obj.result].class
    obj.resultText = resultText[obj.result].text
    obj.pools = pool
    obj.pools.available = Boolean(obj.pools.skillPoolValue + obj.pools.flexPoolValue > 0) 

    if(outputData.resultClass === "success"){
        if(obj.resultClass === "success" && (obj.result > obj.originalResult) && obj.pools.available)
            obj.options["swap"] = true
        
        else if(((obj.originalResult + 1) < 6)  && obj.pools.available){
            obj.options["upgrade"] = true
            obj.result = obj.originalResult + 1
            obj["resultText"] = resultText[(obj.originalResult+1)].text
         }
        
        else if(obj.resultClass === "success" && obj.originalResult === 5 && (obj.value > outputData.rollResult) && obj.pools.available)
            obj.options["swap"] = true
    }
    else if(outputData.resultClass === "fail"){
        
        if((obj.result > obj.originalResult) && obj.pools.available)
            obj.options["swap"] = true
        
        else if(((obj.originalResult + 1) < 3)  && obj.pools.available){
            obj.options["mitigate"] = true
            obj["resultText"] = resultText[(obj.originalResult+1)].text
        }

        else if(outputData.rollResult % 11 === 0 && obj.pools.available){
            obj["resultText"] = resultText[0].text
            obj.options["mitigate"] = true
        }

        /*else if(obj.originalResult === 0 && (obj.value > obj.rollResult) && obj.pools.available)
            obj.options["swap"] = true*/

    }

    obj.options.available = obj.options.swap || obj.options.upgrade || obj.options.mitigate ? true : false

    return obj
}

//SwipSwap Dice
async function swapDice(str){
    if (str<10){
        return eval(str + "0")
    }
    let string = str.toString()
    return parseInt(string[1] + string[0]);
}