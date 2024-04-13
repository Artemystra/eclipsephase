import { eclipsephase } from "../config.js";
import { TaskRollModifier, TaskRoll, rollCalc, TASK_RESULT, TASK_RESULT_TEXT } from "./dice.js";
import { prepareWeapon } from "./damage.js";

const POOL_USAGE_OUTPUT = "systems/eclipsephase/templates/chat/pool-usage.html"

/**
 * 
 * @param {Object} data 
 */
export async function usePoolFromChat(data){
    const dataset = data.currentTarget.dataset;
    const pool = {skillPoolValue: dataset.skillpoolvalue ? parseInt(dataset.skillpoolvalue) : 0, flexPoolValue: dataset.flexpoolvalue ? parseInt(dataset.flexpoolvalue) : 0, updatePoolPath : dataset.updatepoolpath ? dataset.updatepoolpath : "", updateFlexPath : dataset.updateflexpath ? dataset.updateflexpath : "", poolType: dataset.pooltype ? dataset.pooltype : ""}
    const options = {usePool: dataset.usepool}
    const actor = game.actors.get(dataset.actorid)
    const rolledFrom = dataset.rolledfrom

    update(options, pool, null, actor)

    let message = {}
          
    message.resultText = dataset.resulttext;
    
    message.type = dataset.usagetype;
    message.newResult = dataset.newresult ? parseInt(dataset.newresult) : false;
    message.poolName = pool.poolType ? pool.poolType : game.i18n.localize("ep2e.skills.flex.poolHeadline");
    
    let html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    let attr = dataset.rollmode != "publicroll" ? {speaker: ChatMessage.getSpeaker({actor: actor}),flavor: html,whisper: [game.user._id]} : {speaker: ChatMessage.getSpeaker({actor: actor}),flavor: html}

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
    if (options.usePool === "flex" || options.usePool === "flexIgnore"){
        poolValue = pool.flexPoolValue
        poolPath = pool.updateFlexPath
        poolType = "ep2e.skills.flex.poolHeadline"
    }
    else {
        poolValue = pool.skillPoolValue
        poolPath = pool.updatePoolPath
        poolType = pool.poolType
    }

    //Checks if pool used
    if (poolValue > 0){
        let poolMod = 20;
        let poolUpdate = poolValue - 1;
        let message = game.i18n.localize('ep2e.roll.announce.poolUsage.poolUsed') + ": " + poolType;
        //Determine pool to be updated
        actorWhole.update({[poolPath] : poolUpdate});

        if(options.usePool === "pool" && task || options.usePool === "flex" && task)
            task.addModifier(new TaskRollModifier(message, poolMod))

        return true
    }
    else if (poolValue <= 0){
        let message = {}
        
        message.type = "cantAddModifier";
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
export async function outcomeAlternatives(outputData, pool){
    let obj = {options: {swap: false, upgrade: false, mitigate: false}} 
    obj.value = await swapDice(outputData.rollResult);
    obj.result =  rollCalc(obj.value, outputData.targetNumber)
    obj.originalResult = rollCalc(outputData.rollResult, outputData.targetNumber)
    obj.resultClass = TASK_RESULT_TEXT[obj.result].class
    obj.resultText = TASK_RESULT_TEXT[obj.result].text
    obj.pools = pool
    obj.pools.available = Boolean(obj.pools.skillPoolValue + obj.pools.flexPoolValue > 0) 

    if(outputData.resultClass === "success"){
        if(obj.resultClass === "success" && (obj.result > obj.originalResult) && obj.pools.available)
            obj.options["swap"] = true
        
        else if(((obj.originalResult + 1) < 6)  && obj.pools.available){
            obj.options["upgrade"] = true
            obj["resultText"] = TASK_RESULT_TEXT[(obj.originalResult+1)].text
         }   
    }
    else if(outputData.resultClass === "fail"){
        
        if((obj.result > obj.originalResult) && obj.pools.available)
            obj.options["swap"] = true
        
        else if(((obj.originalResult + 1) < 3)  && obj.pools.available){
            obj.options["mitigate"] = true
            obj["resultText"] = TASK_RESULT_TEXT[(obj.originalResult+1)].text
        }

        else if(outputData.rollResult % 11 === 0 && obj.pools.available){
            obj["resultText"] = TASK_RESULT_TEXT[0].text
            obj.options["mitigate"] = true
        }

        else if(obj.originalResult === 0 && (obj.value > obj.rollResult) && obj.pools.available)
            obj.options["swap"] = true

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