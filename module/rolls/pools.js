import { eclipsephase } from "../config.js";
import { TaskRollModifier, TaskRoll, rollCalc, TASK_RESULT, TASK_RESULT_TEXT } from "./dice.js";
import { inheritChatVisibility, readRollContext } from "../common/general-sheet-functions.js";
import { getTaskResultText } from "../api/registry.js";
import { updateCard } from "../common/chat-cards.js";
import { madeHere } from "../common/socket.js";

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
        // The option the card shows when the button is pressed: the suggested one, or the one
        // offered instead once the player switched to it.
        const switched = data.currentTarget.closest?.(".ep-modify-result")?.dataset?.choice === "alternative"
        const chosen = switched && context.alternatives.alternative ? context.alternatives.alternative : context.alternatives
        const usageType = chosen.usageType
        const newResult = chosen.result
        const poolName = options === "flex" || !pool.poolType ? "ep2e.skills.flex.poolHeadline" : pool.poolType
        const resultClass = usageType === "mitigated" ? "fail" : ((getTaskResultText() ?? TASK_RESULT_TEXT)[newResult]?.class ?? chosen.resultClass)
        const stored = chosen === context.alternatives ? {} : {
            "flags.eclipsephase.roll.alternatives.usageType": usageType,
            "flags.eclipsephase.roll.alternatives.result": newResult,
            "flags.eclipsephase.roll.alternatives.value": chosen.value,
            "flags.eclipsephase.roll.alternatives.resultClass": chosen.resultClass,
            "flags.eclipsephase.roll.alternatives.resultText": chosen.resultText
        }

        if (card?.getFlag?.("eclipsephase", "taskCard")) {
            await updateCard(card, "taskCard", "poolSpent", {
                usageType, poolName, spender: actor?.name ?? "", newValue: chosen.value, newResult, resultClass, resultText: chosen.resultText
            }, { extra: { "flags.eclipsephase.roll.alternatives.spent": true, ...stored } })
        }
        else {
            const html = await foundry.applications.handlebars.renderTemplate(POOL_USAGE_OUTPUT, {
                resultText: chosen.resultText, type: usageType, newResult: newResult ?? false,
                newValue: chosen.value ?? false, poolName: game.i18n.localize(poolName)
            })
            ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: actor}), flavor: html, whisper: recipientList, blind: blind })
        }

        Hooks.callAll("eclipsephase.poolResult", {context: { ...context, alternatives: { ...context.alternatives, ...chosen } }, actor, rolledFrom, newResult, blind, recipientList})
    }

}

/**
 * Picks an option on a roll card's Modify Result toggle: the one the system suggests or the other.
 * Only the card on this screen changes; a pool button then spends the option picked.
 * @param {HTMLElement} element - The toggle segment that was clicked, naming its choice
 * @returns {void}
 */
export function switchModifyChoice(element) {
    const box = element?.closest?.(".ep-modify-result")
    if (box && element.dataset.forChoice) box.dataset.choice = element.dataset.forChoice
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
 * How good a result is, to compare a roll with its flip-flopped die: criticals beyond the superior
 * results of their side. Read at call time, as dice.js and this module import each other.
 * @param {Number} result - The result tier
 * @returns {Number} Its rank, -1 for a critical failure up to 6 for a critical success
 */
function resultRank(result) {
    return {
        [TASK_RESULT.CRITICAL_FAILURE]: -1, [TASK_RESULT.AUTOFAIL]: -1,
        [TASK_RESULT.FAILURE_TWO]: 0, [TASK_RESULT.FAILURE_ONE]: 1, [TASK_RESULT.FAILURE]: 2,
        [TASK_RESULT.SUCCESS]: 3, [TASK_RESULT.SUCCESS_ONE]: 4, [TASK_RESULT.SUCCESS_TWO]: 5,
        [TASK_RESULT.CRITICAL_SUCCESS]: 6, [TASK_RESULT.AUTOSUCCESS]: 6
    }[result] ?? 0;
}

// What each way of modifying a result is called on the card.
const MODIFY_TEXT = {
    swapped: { label: "ep2e.chat.modify.swap" },
    upgraded: { label: "ep2e.chat.modify.upgrade" },
    mitigated: { label: "ep2e.chat.modify.downgrade" }
};

/**
 * The lowest die above this one that a success would need for the next better result, short of a
 * critical: where a flip-flop would have to land to beat an upgrade.
 * @param {Number} die - The die rolled
 * @param {Number} target - The target number
 * @returns {Number|null} That die, or null when no better success is in reach
 */
export function nextResultAt(die, target) {
    const rank = resultRank(rollCalc(die, target));
    for (let value = die + 1; value <= target && value < 99; value++) {
        if (value % 11 === 0) continue;
        if (resultRank(rollCalc(value, target)) > rank) return value;
    }
    return null;
}

/**
 * Why a roll card offers what it offers, for its info dialog: the choice between an upgrade and a
 * higher die, or why a flip-flop or an upgrade is offered alone. Null for a downgrade.
 * @param {Object} suggested - The option the system suggests, in the shape outcomeAlternatives builds
 * @param {Object|null} alternative - The other option, or null
 * @param {Object} roll - die, swappedDie, original and swapped result tiers, the targetNumber and
 *   whether flip-flops are allowed
 * @param {Object} resultText - The result texts by tier
 * @returns {Object|null} title and copy keys, the dice, the threshold and the result text keys
 */
function modifyExplanation(suggested, alternative, roll, resultText) {
    const { die, swappedDie, original, swapped, targetNumber, flipFlops } = roll;
    const base = {
        title: "ep2e.chat.modify.infoTitleSwap", die, swap: swappedDie, threshold: null,
        rolled: resultText[original].text, swapped: resultText[swapped].text, upgraded: "", recommended: suggested.label
    };
    if (alternative) return {
        ...base, title: "ep2e.chat.modify.infoTitle", copy: "ep2e.chat.modify.explain.choice",
        threshold: nextResultAt(die, targetNumber), upgraded: resultText[suggested.result].text
    };
    if (suggested.usageType === "upgraded") {
        const upgradedBase = { ...base, title: "ep2e.chat.modify.infoTitleUpgrade", upgraded: resultText[suggested.result].text };
        if (!flipFlops) return { ...upgradedBase, copy: "ep2e.chat.modify.explain.upgradeBadLuck" };
        if (resultRank(swapped) < 3) return { ...upgradedBase, copy: "ep2e.chat.modify.explain.upgradeSwapFails" };
        return { ...upgradedBase, copy: "ep2e.chat.modify.explain.upgradeSwapLower" };
    }
    if (suggested.usageType !== "swapped") return null;
    const rank = resultRank(original);
    if (rank < 3) return { ...base, copy: "ep2e.chat.modify.explain.swapFailure" };
    if (resultRank(swapped) > rank) return { ...base, copy: "ep2e.chat.modify.explain.swapLevel" };
    return { ...base, copy: "ep2e.chat.modify.explain.swapHigher" };
}

/**
 * The failure a critical failure becomes when a pool point downgrades it (Core p.34): the one its die
 * gives by the 33/66 rule (Core p.31), as if it were no double.
 * @param {Number} value - The die
 * @returns {Number} The result tier
 */
export function downgradedFailure(value) {
    if (value < 33) return TASK_RESULT.FAILURE_TWO;
    if (value < 66) return TASK_RESULT.FAILURE_ONE;
    return TASK_RESULT.FAILURE;
}

/**
 * What a pool point can make of a roll afterwards (Core p.34): flip-flop the dice, upgrade a success
 * by one superior result up to two, or downgrade a critical failure. The system picks the option it
 * suggests - a flip-flop that improves the result, else an upgrade, else a downgrade, else a
 * flip-flop to a higher die of the same result, which only counts against an opponent. An upgrade
 * comes with that higher die as its alternative: the better result, or the higher roll. A flip-flop
 * that improves the result always beats an upgrade, so it has none. Bad Luck rules out flip-flops.
 * A critical success is never upgraded, a superior failure never improved.
 * @param {Object} outputData - The roll's data: rollResult, targetNumber, resultClass
 * @param {Object} pool - The pools the roll may draw on
 * @param {Object} [systemOptions] - Unused, kept for callers
 * @param {Actor} [actor] - Who rolled, for traits that limit pools
 * @returns {Promise<Object>} options (swap, upgrade, mitigate, available), the suggested option's
 *   usageType, result, value, resultClass, resultText and label, its alternative
 *   in the same shape or null, explain for the info dialog or null, originalResult and pools
 */
export async function outcomeAlternatives(outputData, pool, systemOptions, actor = null){
    const resultText = getTaskResultText() ?? TASK_RESULT_TEXT;
    const die = Number(outputData.rollResult);
    const swappedDie = await swapDice(outputData.rollResult);
    const original = rollCalc(die, outputData.targetNumber);
    const swapped = rollCalc(swappedDie, outputData.targetNumber);
    pool.available = Boolean(pool.skillPoolValue + pool.flexPoolValue > 0);
    const entry = (usageType, result, value) => ({
        usageType, result, value,
        resultClass: resultText[result].class,
        resultText: resultText[result].text,
        ...MODIFY_TEXT[usageType]
    });

    let suggested = null;
    let alternative = null;
    if (pool.available) {
        const flipFlops = actor?.system?.additionalSystems?.noFlipFlop !== true;
        const rank = resultRank(original);
        const betterSwap = flipFlops && resultRank(swapped) > rank ? entry("swapped", swapped, swappedDie) : null;
        const higherSwap = flipFlops && !betterSwap && rank >= 3 && rank <= 5 && resultRank(swapped) === rank && swappedDie > die ? entry("swapped", swapped, swappedDie) : null;
        const upgrade = rank === 3 || rank === 4 ? entry("upgraded", original + 1, die) : null;
        const downgrade = rank === -1 ? entry("mitigated", downgradedFailure(die), die) : null;
        suggested = betterSwap ?? upgrade ?? downgrade ?? higherSwap;
        alternative = suggested === upgrade ? higherSwap : null;
    }
    const explain = suggested ? modifyExplanation(suggested, alternative,
        { die, swappedDie, original, swapped, targetNumber: Number(outputData.targetNumber),
          flipFlops: actor?.system?.additionalSystems?.noFlipFlop !== true }, resultText) : null;

    const shown = suggested ?? entry("swapped", swapped, swappedDie);
    return {
        options: {
            swap: suggested?.usageType === "swapped",
            upgrade: suggested?.usageType === "upgraded",
            mitigate: suggested?.usageType === "mitigated",
            available: !!suggested
        },
        ...shown,
        alternative,
        explain,
        originalResult: original,
        pools: pool
    };
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
        if (madeHere(userId, rest[rest.length - 2])) settlePools(owningActor(document), changes);
      });
    }
  }
}
