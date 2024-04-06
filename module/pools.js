import { eclipsephase } from "./config.js";
import { TaskRollModifier, TaskRoll, rollCalc, TASK_RESULT, TASK_RESULT_TEXT } from "./dice.js";

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

    if (options.usePool === "pool" || options.usePool === "poolIgnore"){
        poolValue = pool.skillPoolValue
        poolPath = pool.updatePoolPath
        poolType = pool.poolType
    }
    else if (options.usePool === "flex" || options.usePool === "flexIgnore"){
        poolValue = pool.flexPoolValue
        poolPath = pool.updateFlexPath
        poolType = "ep2e.skills.flex.poolHeadline"
    }

    //Checks if pool used
    if (poolValue > 0){
        let poolMod = 20;
        let updateTarget = poolPath;
        let poolUpdate = poolValue - 1;
        let message = game.i18n.localize('ep2e.roll.announce.poolUsage.poolUsed') + ": " + poolType;
        //Determine pool to be updated
        actorWhole.update({[updateTarget] : poolUpdate});

        if(options.usePool === "pool" || options.usePool === "flex")
            task.addModifier(new TaskRollModifier(message, poolMod))
    }
    else if (poolValue <= 0){
        let message = {}
        
        message.type = "cantAddModifier";
        message.poolName = poolType;

        let html = await renderTemplate(POOL_USAGE_OUTPUT, message)
        
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            content: html,
            whisper: [game.user._id]
        })
    }
}

export async function outcomeAlternatives(outputData, pool){
    let swap = {options: {possible: false, upgrade: false, mitigate: false}} 
    swap.value = eval(await swapDice(outputData.rollResult));
    swap.result =  rollCalc(swap.value, outputData.targetNumber)
    swap.originalResult = rollCalc(outputData.rollResult, outputData.targetNumber)
    swap.resultClass = TASK_RESULT_TEXT[swap.result].class
    swap.resultText = TASK_RESULT_TEXT[swap.result].text
    swap.pools = pool
    swap.pools.available = Boolean(swap.pools.skillPoolValue + swap.pools.flexPoolValue > 0) 

    if(outputData.resultClass === "success"){
        console.log("swap-result > original-result: ", (swap.result > swap.originalResult), "swap.result + 1 < 6: ", ((swap.originalResult + 1) < 6), "swap.pools.available: ", swap.pools.available)
        if(swap.resultClass === "success" && (swap.result > swap.originalResult) && swap.pools.available)
            swap.options["possible"] = true
        
        if(((swap.originalResult + 1) < 6)  && swap.pools.available)
            swap.options["upgrade"] = true
        
    }
    else if(outputData.class === "fail"){

    }

    return swap
}

//SwipSwap Dice
async function swapDice(str){
    if (str<10){
        return str + "0"
    }
    let string = str.toString()
    let first = string[0];
    let last = string[1];
    return last+first;
}