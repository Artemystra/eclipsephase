import { eclipsephase } from "../config.js";
import { TaskRollModifier, TaskRoll, rollCalc, TASK_RESULT_TEXT } from "./dice.js";
import { inheritChatVisibility, readRollContext } from "../common/general-sheet-functions.js";
import { getTaskResultText } from "../api/registry.js";
import { updateCard } from "../common/chat-cards.js";

const POOL_USAGE_OUTPUT = "systems/eclipsephase/templates/chat/pool-usage.html"

/**
 * Spends a pool point from a roll card's pool button. The roll card itself changes: its pool
 * controls give way to a note on who spent what, and it shows the new result - on a swap, the
 * swapped die. What the new result unlocks, like a damage button on a hit, appears on the same card.
 * A card from before the card kept its own state gets a separate pool card, as it always did.
 * @param {Object} data - Pulls all necessary data from the button clicked on the chat message
 * @returns {Promise<void>} Resolves once the point is spent and the card redrawn
 */
export async function usePoolFromChat(data){
    const context = readRollContext(data.currentTarget)
    if (context.alternatives?.spent) return
    const pool = {...context.pool}
    const options = data.currentTarget.dataset.usepool
    const actor = await fromUuid(context.actorUuid)
    const rolledFrom = context.rolledFrom
    const {blind, recipientList} = inheritChatVisibility(context.messageId, context.options.rollMode)

    let updateResult = await update(options, pool, null, actor)

    if(updateResult){
        const card = game.messages.get(context.messageId)
        const usageType = context.alternatives.usageType
        const newResult = context.alternatives.result
        const poolName = options === "flex" || !pool.poolType ? "ep2e.skills.flex.poolHeadline" : pool.poolType
        const resultClass = usageType === "mitigated" ? "fail" : ((getTaskResultText() ?? TASK_RESULT_TEXT)[newResult]?.class ?? context.alternatives.resultClass)

        if (card?.getFlag?.("eclipsephase", "taskCard")) {
            await updateCard(card, "taskCard", "poolSpent", {
                usageType, poolName, spender: actor?.name ?? "", newValue: context.alternatives.value, newResult, resultClass, resultText: context.alternatives.resultText
            }, { extra: { "flags.eclipsephase.roll.alternatives.spent": true } })
        }
        else {
            const html = await foundry.applications.handlebars.renderTemplate(POOL_USAGE_OUTPUT, {
                resultText: context.alternatives.resultText, type: usageType, newResult: newResult ?? false,
                newValue: context.alternatives.value ?? false, poolName: game.i18n.localize(poolName)
            })
            ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: actor}), flavor: html, whisper: recipientList, blind: blind })
        }

        Hooks.callAll("eclipsephase.poolResult", {context, actor, rolledFrom, newResult, blind, recipientList})
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

        await actorWhole.update({[poolPath] : poolUpdate});
        
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

/**
 * The actor a changed document belongs to: the actor itself, an item's actor, or the actor behind
 * an effect on the actor or on one of its items.
 * @param {Document} document - The document that changed
 * @returns {Actor|null} The actor, or null when none is involved
 */
export function owningActor(document) {
  if (document instanceof Actor) return document;
  const parent = document?.parent;
  if (parent instanceof Actor) return parent;
  return parent?.parent instanceof Actor ? parent.parent : null;
}

// The pool rule: an actor's current pool value tracks its total. Whatever starts or stops raising
// a total - a dose taken or run out, a chi push, armour worn or stashed, gear toggled, ware gained
// or lost by resleeving - moves the current value by the same amount, clamped into what the pool
// now holds. Only a change that sets a pool's value itself, as spending a point or a recharge does,
// is left to say what it meant.
const POOLS = ["insight", "moxie", "vigor", "flex"];
const TOTAL_KEY = { insight: "totalInsight", moxie: "totalMoxie", vigor: "totalVigor", flex: "totalFlex" };

// What each actor's totals were before the change in flight, consumed when the change lands.
const snapshots = new WeakMap();

/**
 * Every pool's total as the actor's prepared data has it right now.
 * @param {Actor} actor - The actor
 * @returns {Object} Pool name to total
 */
function poolTotals(actor) {
  const totals = {};
  for (const pool of POOLS) totals[pool] = Number(actor.system?.pools?.[pool]?.[TOTAL_KEY[pool]]) || 0;
  return totals;
}

/**
 * Whether a change sets a pool's value itself, in which case the rule stays out of its way.
 * @param {Object} changes - The change in flight, flat or expanded
 * @param {String} pool - The pool name
 * @returns {Boolean} True when the change writes that pool's value
 */
function setsPoolValue(changes, pool) {
  const path = `system.pools.${pool}.value`;
  return changes?.[path] !== undefined || foundry.utils.getProperty(changes ?? {}, path) !== undefined;
}

/**
 * Remembers an actor's pool totals before a change lands, so the change can be measured.
 * @param {Actor|null} actor - The actor about to change
 * @returns {void}
 */
export function rememberPoolTotals(actor) {
  if (actor) snapshots.set(actor, poolTotals(actor));
}

/**
 * Measures how a change moved the actor's pool totals and moves the current values along with
 * them. It waits one tick first: for an effect on one of the actor's items Foundry fires the hook
 * before it has re-prepared the actor, and reading then would show no change at all. Re-preparing
 * the actor here instead is not an option - EPactor.prepareData issues updates of its own, and run
 * inside a delete hook those reach the server for a document that is already gone. A change that
 * writes a pool's value itself is left as written. Consumes the snapshot, so a batch that lands
 * several documents at once settles exactly once.
 * @param {Actor|null} actor - The actor that changed
 * @param {Object} [changes] - The change that landed, when it was an update
 * @returns {Promise<void>} Resolves once the actor is updated
 */
export async function settlePools(actor, changes = {}) {
  const before = actor ? snapshots.get(actor) : null;
  if (!before) return;
  snapshots.delete(actor);

  await new Promise(resolve => setTimeout(resolve, 0));
  const after = poolTotals(actor);
  const updates = {};
  for (const pool of POOLS) {
    const delta = after[pool] - before[pool];
    if (!delta || setsPoolValue(changes, pool)) continue;
    const value = Number(actor.system.pools[pool]?.value) || 0;
    updates[`system.pools.${pool}.value`] = Math.clamp(value + delta, 0, after[pool]);
  }

  if (Object.keys(updates).length) await actor.update(updates);
}

/**
 * Hangs the rule on every document change that can move a pool total: the actor itself, its items
 * and their effects. Only the client that made the change settles it, so a dose taken by a player
 * moves their pool once rather than once per connected screen. Actors being created or deleted are
 * left alone; a fresh actor's pools are the recharge's business.
 * @returns {void}
 */
export function registerPoolRule() {
  const watched = [
    ["Actor", ["update"]],
    ["Item", ["create", "update", "delete"]],
    ["ActiveEffect", ["create", "update", "delete"]]
  ];

  for (const [documentName, operations] of watched) {
    for (const operation of operations) {
      const name = operation[0].toUpperCase() + operation.slice(1);
      Hooks.on(`pre${name}${documentName}`, document => rememberPoolTotals(owningActor(document)));
      Hooks.on(`${operation}${documentName}`, (document, ...rest) => {
        const changes = operation === "update" ? rest[0] : {};
        const userId = rest[rest.length - 1];
        if (userId === game.user.id) settlePools(owningActor(document), changes);
      });
    }
  }
}
