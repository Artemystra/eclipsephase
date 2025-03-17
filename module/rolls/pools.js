import { eclipsephase } from "../config.js";
import { TaskRollModifier, TaskRoll, rollCalc, HOMEBREW_TASK_RESULT_TEXT, TASK_RESULT_TEXT } from "./dice.js";
import { prepareRecipients } from "../common/common-sheet-functions.js";
import { prepareWeapon } from "./damage.js";

const POOL_USAGE_OUTPUT = "systems/eclipsephase/templates/chat/pool-usage.html"

/**
 * Prepares the pool usage based on the button clicked in the chat message. If the message also 
 * provides a velue for {rolledFrom} it will also prepare the weapon for the consequtive roll
 * @param {Object} data - Pulls all necessary data from the button clicked on the chat message
 */
export async function usePoolFromChat(data){
    const dataset = data.currentTarget.dataset;
    const pool = {skillPoolValue: dataset.skillpoolvalue ? parseInt(dataset.skillpoolvalue) : 0, flexPoolValue: dataset.flexpoolvalue ? parseInt(dataset.flexpoolvalue) : 0, updatePoolPath : dataset.updatepoolpath ? dataset.updatepoolpath : "", updateFlexPath : dataset.updateflexpath ? dataset.updateflexpath : "", poolType: dataset.pooltype ? dataset.pooltype : ""}
    const options = dataset.usepool
    const actor = await fromUuid(dataset.actorid)
    const rolledFrom = dataset.rolledfrom
    console.log("This is my data", dataset)
    const recipientList = prepareRecipients(dataset.rollmode)

    let updateResult = await update(options, pool, null, actor)

    if(updateResult){

        let message = {}
            
        message.resultText = dataset.resulttext;
        
        message.type = dataset.usagetype;
        message.newResult = dataset.newresult ? parseInt(dataset.newresult) : false;
        message.newValue = dataset.newvalue ? parseInt(dataset.newvalue) : false;
        message.poolName = pool.poolType ? pool.poolType : game.i18n.localize("ep2e.skills.flex.poolHeadline");
        
        let html = await renderTemplate(POOL_USAGE_OUTPUT, message)
        let attr = dataset.rollmode != "publicroll" ? {speaker: ChatMessage.getSpeaker({actor: actor}),flavor: html,whisper: recipientList} : {speaker: ChatMessage.getSpeaker({actor: actor}),flavor: html}

        ChatMessage.create(attr)

        if(rolledFrom === "ccWeapon" || rolledFrom === "rangedWeapon"){
            let data = {}
            const result = parseInt(dataset.newresult)

            data.actorid = dataset.actorid
            data.weaponid = dataset.weaponid
            data.weaponmode = dataset.weaponmode
            data.rolledfrom = dataset.rolledfrom
            data.biomorphtarget = dataset.biomorphtarget
            data.touchonly = dataset.touchonly
            data.attackmode = dataset.attackmode
            data.rollmode = dataset.rollmode

            await prepareWeapon(false, result, data)
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

        let html = await renderTemplate(POOL_USAGE_OUTPUT, message)
        
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
    let resultText = systemOptions.brewStatus ? HOMEBREW_TASK_RESULT_TEXT : TASK_RESULT_TEXT;
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