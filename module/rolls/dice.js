import  * as pools  from "./pools.js";
import * as psi from "./psi.js";
import { prepareRecipients } from "../common/general-sheet-functions.js";

/*
 * Path constants for dialog templates
 */
export const TASK_CHECK_DIALOG_TEMPLATE = "systems/eclipsephase/templates/chat/skill-test-dialog.html"
export const GUNS_TASK_DIALOG = "systems/eclipsephase/templates/chat/gun-test-dialog.html"
export const MELEE_TASK_DIALOG = "systems/eclipsephase/templates/chat/melee-test-dialog.html"
export const TASK_RESULT_OUTPUT = 'systems/eclipsephase/templates/chat/task-result.html'
export const POOL_USAGE_OUTPUT = 'systems/eclipsephase/templates/chat/pool-usage.html'
export const WEAPON_DAMAGE_OUTPUT = 'systems/eclipsephase/templates/chat/damage-result.html'
export const PSI_INFLUENCE_OUTPUT = 'systems/eclipsephase/templates/chat/psi-influence.html'
export const DAMAGE_STATUS_OUTPUT = 'systems/eclipsephase/templates/chat/damage-status.html'
export const DEFAULT_ROLL = 'systems/eclipsephase/templates/chat/default-roll-to-chat.html'

/*
 * Task result constants
 */
export const TASK_RESULT = {
    FAILURE_TWO: 0,
    FAILURE_ONE: 1,
    FAILURE: 2,
    SUCCESS: 3,
    SUCCESS_ONE: 4,
    SUCCESS_TWO: 5,
    CRITICAL_FAILURE: 6,
    CRITICAL_SUCCESS: 7,
    AUTOFAIL : 8,
    AUTOSUCCESS : 9
}

export const HOMEBREW_TASK_RESULT_TEXT = {
    0: { class: 'fail', text: 'ep2e.roll.successType.majorFailure' },
    1: { class: 'fail', text: 'ep2e.roll.successType.standardFailure' },
    2: { class: 'fail', text: 'ep2e.roll.successType.minorFailure' },
    3: { class: 'success', text: 'ep2e.roll.successType.minorSuccess' },
    4: { class: 'success', text: 'ep2e.roll.successType.standardSuccess' },
    5: { class: 'success', text: 'ep2e.roll.successType.majorSuccess' },
    6: { class: 'fail', text: 'ep2e.roll.successType.criticalFailure' },
    7: { class: 'success', text: 'ep2e.roll.successType.criticalSuccess' },
    8: { class: 'fail', text: 'ep2e.roll.successType.supremeFailure' },
    9: { class: 'success', text: 'ep2e.roll.successType.supremeSuccess' }
} 

export const TASK_RESULT_TEXT = {
    0: { class: 'fail', text: 'ep2e.roll.successType.superiorTwoFailure' },
    1: { class: 'fail', text: 'ep2e.roll.successType.superiorFailure' },
    2: { class: 'fail', text: 'ep2e.roll.successType.failure' },
    3: { class: 'success', text: 'ep2e.roll.successType.success' },
    4: { class: 'success', text: 'ep2e.roll.successType.superiorSuccess' },
    5: { class: 'success', text: 'ep2e.roll.successType.superiorTwoSuccess' },
    6: { class: 'fail', text: 'ep2e.roll.successType.criticalFailure' },
    7: { class: 'success', text: 'ep2e.roll.successType.criticalSuccess' },
    8: { class: 'fail', text: 'ep2e.roll.successType.autoFailure' },
    9: { class: 'success', text: 'ep2e.roll.successType.autoSuccess' }
}    

const POOL_SUM = {
    INS: { poolType: "ep2e.skills.insightSkills.poolHeadline", useMessage: "ep2e.skills.pool.use.insight", skillPoolValue: "actorModel.pools.insight.value", updatePoolPath: "system.pools.insight.value", flexPoolValue: "actorModel.pools.flex.value", updateFlexPath: "system.pools.flex.value", poolUsageCount: 0 },
    VIG: { poolType: "ep2e.skills.vigorSkills.poolHeadline", useMessage: "ep2e.skills.pool.use.vigor", skillPoolValue: "actorModel.pools.vigor.value", updatePoolPath: "system.pools.vigor.value", flexPoolValue: "actorModel.pools.flex.value", updateFlexPath: "system.pools.flex.value", poolUsageCount: 0 },
    MOX: { poolType: "ep2e.skills.moxieSkills.poolHeadline", useMessage: "ep2e.skills.pool.use.moxie", skillPoolValue: "actorModel.pools.moxie.value", updatePoolPath: "system.pools.moxie.value", flexPoolValue: "actorModel.pools.flex.value", updateFlexPath: "system.pools.flex.value", poolUsageCount: 0 },
    THR: { poolType: "ep2e.healthbar.tooltip.threat", useMessage: "ep2e.skills.pool.use.threat", skillPoolValue: "actorModel.threatLevel.current", updatePoolPath: "system.threatLevel.current", flexPoolValue: 0, poolUsageCount: 0 },
    NON: { poolType: "ep2e.roll.dialog.ranged.attacker.visual.none", useMessage: "-", skillPoolValue: 0, updatePoolPath: "-", flexPoolValue: 0, poolUsageCount: 0 }
}

async function poolCalc(actorType, actorModel, aptType, poolType, rollType, rolledFrom){

    let pool
    if (rolledFrom === "vehicleSkill") {
        pool = POOL_SUM.NON
    }

    else if (actorType === "goon"){
        pool = POOL_SUM.THR
    }

    else if (aptType != null){
        switch (aptType) {
            case 'int':
                pool = POOL_SUM.INS
              break;
            case 'cog':
                pool = POOL_SUM.INS
              break;
            case 'ref':
                pool = POOL_SUM.VIG
              break;
            case 'som':
                pool = POOL_SUM.VIG
              break;
            case 'wil':
                pool = POOL_SUM.MOX
              break;
            case 'sav':
                pool = POOL_SUM.MOX
              break;
            default:
              break;
        }
    }

    else if (rollType === 'rep')
        pool = POOL_SUM.MOX
    

    else if (rollType === 'muse')
        pool = POOL_SUM.NON

    else {
        switch (poolType) {
            case 'Insight':
                pool = POOL_SUM.INS
              break;
            case 'Vigor':
                pool = POOL_SUM.VIG
              break;
            case 'Moxie':
                pool = POOL_SUM.MOX
              break;
            default:
              break;
        }
    }

    let calcPool = {poolType: pool.poolType, useMessage: pool.useMessage, skillPoolValue: eval(pool.skillPoolValue), updatePoolPath: pool.updatePoolPath, flexPoolValue: eval(pool.flexPoolValue), updateFlexPath: pool.updateFlexPath, poolUsageCount: pool.poolUsageCount}

    // While jamming, offer the real body's stashed pools as an "own body" variant that spends from the
    // backup flag. Integration Tests are the exception: they represent the real Ego struggling to
    // integrate, so they always draw from the real body's stashed pool directly (no Remote/Own choice -
    // the freshly-jammed body's own pool wouldn't make sense here).
    if (actorModel?.additionalSystems?.isJamming && rolledFrom !== "vehicleSkill" && actorType !== "goon") {
        const ownPools = actorModel.additionalSystems.jamming?.ownBodyPools ?? { vigor: 0, insight: 0, moxie: 0, flex: 0 };
        let ownSkillPoolValue = 0;
        let updateOwnPoolPath = "";
        switch (pool.poolType) {
            case "ep2e.skills.insightSkills.poolHeadline":
                ownSkillPoolValue = ownPools.insight;
                updateOwnPoolPath = "flags.eclipsephase.jamHealthBackup.insight";
              break;
            case "ep2e.skills.vigorSkills.poolHeadline":
                ownSkillPoolValue = ownPools.vigor;
                updateOwnPoolPath = "flags.eclipsephase.jamHealthBackup.vigor";
              break;
            case "ep2e.skills.moxieSkills.poolHeadline":
                ownSkillPoolValue = ownPools.moxie;
                updateOwnPoolPath = "flags.eclipsephase.jamHealthBackup.moxie";
              break;
            default:
              break;
        }
        if (updateOwnPoolPath) {
            // Flex spends draw the body's stashed share first; once that's gone they fall through to the
            // live shared Ego Flex on the drone's side, so both perspectives spend the same points.
            const bodyFlexRemaining = ownPools.bodyFlexRemaining ?? 0;
            const updateOwnFlexPath = bodyFlexRemaining > 0
                ? "flags.eclipsephase.jamHealthBackup.bodyFlexValue"
                : "system.pools.flex.value";
            const ownPool = {
                poolType: pool.poolType,
                useMessage: pool.useMessage,
                skillPoolValue: ownSkillPoolValue,
                updatePoolPath: updateOwnPoolPath,
                flexPoolValue: ownPools.flex,
                updateFlexPath: updateOwnFlexPath,
                poolUsageCount: 0
            };
            if (rolledFrom === "integration") {
                calcPool = ownPool;
            }
            else {
                calcPool.own = ownPool;
            }
        }
    }

    return calcPool
}

function defineRoll(dataset, actorWhole){
    
    let type = dataset.key ? dataset.key.toLowerCase() : null;
    let names = ['globalMod', 'usePool', 'useSpec', 'rangedFray', 'raiseInfection', 'push', 'favorMod', 'burnMod', 'attackMode', 'sizeDifference', 'calledShot', 'numberOfTargets', 'touchOnly', 'smartlink', 'running', 'superiorPosition', 'inMelee', 'coverAttacker', 'aim', 'size', 'range', 'prone', 'hiddenDefender', 'coverDefender', 'visualImpairment', 'attackMode', 'ammoEffect', 'biomorphTarget', 'weaponFixated', 'rollMode', "exoticMorphology", "jammingRollTarget", "jammingUsePoolRemote", "jammingUsePoolOwn"]
    let sleight = {}
    let template
    let templateSize = {width: 276}
    let title = dataset.dialogTitle ?? game.i18n.localize('ep2e.roll.dialog.title.check')

    switch (type) {
        case 'fray':
            template = TASK_CHECK_DIALOG_TEMPLATE
          break;
        case 'psi':
            template = TASK_CHECK_DIALOG_TEMPLATE
            if(dataset.itemid){
            let sleightItem = actorWhole.items.get(dataset.itemid)
            sleight.name = sleightItem.name
            sleight.description = sleightItem.system.description
            sleight.action = sleightItem.system.actionName
            sleight.duration = sleightItem.system.durationName
            sleight.infection = sleightItem.system.infection
            }
          break;
        case 'guns':
            template = GUNS_TASK_DIALOG
            templateSize = {width: 1086}
          break;
        case 'melee':
            template = MELEE_TASK_DIALOG
            templateSize = {width: 536}
          break;
        default:
            template = TASK_CHECK_DIALOG_TEMPLATE
          break;
    }

    return {type, title, template, templateSize, names, sleight}
}
  
/**
 * Interprets the roll visibility setting and returns the appropriate roll mode 
 */
function setRollVisibility(activeRollTarget){
    const rollModes = CONFIG.ChatMessage?.modes ?? CONST.DICE_ROLL_MODES;
    let rollModeSelection = null
    console.log(activeRollTarget)
    if (activeRollTarget === "" || activeRollTarget === "public") {
        rollModeSelection = rollModes.PUBLIC
    } else if (activeRollTarget === "private") {
        rollModeSelection = rollModes.GM ?? rollModes.PRIVATE
    } else if (activeRollTarget === "blind") {
        rollModeSelection = rollModes.BLIND
    }

    return rollModeSelection
}

/**
 * Checks the rolled value against the target number and returns the result
 * @param {Number} value - The rolled value
 * @param {Number} target - The target number
 * @param {Number} result - The result of the roll
 * @returns 
 */
export function rollCalc(value, target){
    
    let result

    if(value <= target) {   // success results
        if(value % 11 === 0 && value !== 99)
          result = TASK_RESULT.CRITICAL_SUCCESS
        else if (value === 99)
        result = TASK_RESULT.AUTOFAIL
        else if (value === 100)
        result = TASK_RESULT.AUTOSUCCESS
        else if(value > 66)
          result = TASK_RESULT.SUCCESS_TWO
        else if(value > 33)
          result = TASK_RESULT.SUCCESS_ONE
        else
          result = TASK_RESULT.SUCCESS
      }
      else {                  // failure results
        if(value % 11 === 0 && value !== 99)
          result = TASK_RESULT.CRITICAL_FAILURE
        else if (value === 99)
          result = TASK_RESULT.AUTOFAIL
        else if (value === 100)
          result = TASK_RESULT.AUTOSUCCESS
        else if(value < 33)
          result = TASK_RESULT.FAILURE_TWO
        else if(value < 66)
          result = TASK_RESULT.FAILURE_ONE
        else
          result = TASK_RESULT.FAILURE
      }

      return result
}

/**
 * Localize a title string
 */
export class Localizer{
    constructor (title){
        this._title = title
    }

    get title() { 
        return game.i18n.localize(this._title); }
}

/**
 * TaskRoll holds all of the intermediate and calculated values for a single roll.
 */
export class TaskRoll {
  constructor(taskName, baseValue, rangedFray) {
    this._taskName = taskName
    this._baseValue = rangedFray ? baseValue/2 : baseValue ? parseInt(baseValue) : 0
    this._modifierValue = null
    this._modifiers = []
    this._roll = null
    this._result = null
  }


  /**
   * The name of the task (usually the name of the skill, but could be psi
   * slight or reputation network.
   * @type {string}
   */
  get taskName() {
    return this._taskName
  }


  /**
   * The base value of the roll. This is unmodified value to roll again,
   * that will (potentially) have modifiers applied to it.
   * @type {Number}
   */
  get baseValue() {
    return parseInt(this._baseValue)
  }


  /**
   * The list of modifiers that potentially affect this roll.
   * @type TaskRollModifier[]
   */
  get modifiers() {
    return this._modifiers
  }

  /**
   * The Foundry Roll object that did the dice roll. Also needed to post
   * the dice results back to the chat log.
   * FIXME - Not sure that I like this. It might make more sense to have the 
   * roll object be external and passed in when the task is resolved.
   */
  get roll() {
    return this._roll
  }


  /**
   * Add a modifier to this roll.
   * @param {TaskRollModifier} modifer
   */
  addModifier(modifier) {
    this.modifiers.push(modifier)
  }

  /**
   * Calculates the total value of all modifiers.
   * @type {Number}
   */
  get modifierValue() {
    let mods = this.modifiers.map((mod) => mod.value)
      .reduce((sum, value) => { return sum + value }, 0)
    
    return mods
  }


  /**
   * Retrieves the combined target number, taking into account the
   * base value and all roll modifiers.
   * @type {Number}
   */
  get totalTargetNumber() {
    let totalTarget = this.baseValue + this.modifierValue

    return totalTarget
  }


  /**
   * The result of the die roll, unmodified.
   * @type {Number}
   */
  get diceRollValue() {
    return this._rollValue
  }


  /**
   * The numerical value of the dice roll. One of the TASK_RESULT constants.
   * @type {Number}
   */
  get result() {
    return this._result
  }


  /**
   * Do the actual die roll and compare to the base value and modifiers
   */
  async performRoll() {
    this._roll = new Roll('d100')
    let result = await this._roll.evaluate()

    this._rollValue = parseInt(this._roll.total)
    this._calculateResult()
  }


  /**
   * Figure out the result of the roll, compared to the target number
   */
  _calculateResult() {

    let target = this.totalTargetNumber
    let value = this.diceRollValue

    let result = rollCalc(value, target)

    this._result = result
  }


  /**
   * Format all of the output data so the output partial understands it.
   */
  outputData(options, actorWhole, pool, rollItem, rolledFrom, systemOptions) {
    let data = {}
    
    let resultText = systemOptions.brewStatus ? HOMEBREW_TASK_RESULT_TEXT[this._result] : TASK_RESULT_TEXT[this._result]

    data.userID = game.user._id
    data.actor = actorWhole
    data.rolledFrom = rolledFrom
    data.options = options

    data.pools = pool

    data.rollResult = this.diceRollValue
    data.rollMode = options ? setRollVisibility(options.rollMode) : false
    data.resultClass = resultText.class
    data.resultText = resultText.text

    data.taskName = this.taskName
    data.targetNumber = this.totalTargetNumber
    data.taskValue = this.baseValue
    data.modValue = this.modifierValue

    data.itemdata = rollItem

    data.modifiers = []
    if(this.modifiers.length > 0) {
      for(let mod of this.modifiers) {
        if(mod.value !== 0)
          data.modifiers.push({text: mod.text, value: mod.formattedValue, comment: mod.comment})
      }
    }

    return data
  }
}

/**
 * A single value that can modify the target number of a roll. This is used in both
 * calculating the final result, and displaying the results to the user.
 */
export class TaskRollModifier {
  constructor(text, value, comment) {
    this._text = text
    this._value = value
    this._comment = comment
  }

  /**
   * Text of the modifier. This is what will get displayed in the chat window.
   * @type {string}
   */
  get text() {
    return this._text
  }


  /**
   * The numerical value of the modifier.
   * @type {Number}
   */
  get value() {
    return this._value
  }

  /**
   * Any special comments like a modifier to another roll or increased damage
   * @type {String}
   */
  get comment() {
    return this._comment
  }

  /**
   * The value of the modifier, formatted to a string, with a + character
   * prepended if the value is positive.
   * @type {string}
   */
  get formattedValue() {
    let pre = (this.value > 0) ? '+' : ''
    return `${pre}${this.value}`
  }


  toString() {
    return `${this.text} = ${this.value}`
  }
}


// Reads the same base skill/aptitude value the sheet would set as data-rollvalue, but off an
// arbitrary actorSystem/items pair - lets getOwnBodyEffectDelta diff the real actor vs. a clone.
function resolveSkillRollValue(actorSystem, items, dataset, rolledFrom) {
    if (rolledFrom === "rangedWeapon") return actorSystem.skillsVig?.guns?.roll;
    if (rolledFrom === "ccWeapon") return actorSystem.skillsVig?.melee?.roll;
    if (rolledFrom === "psiSleight") return actorSystem.skillsMox?.psi?.roll;

    // Know-/Special-Skill items: data-key is the item's name. Checked before the aptitude branch
    // below, since these items also carry a data-apttype (skills-tab.html) that would otherwise
    // wrongly match there. Computed directly (EPactorSheet.js's getData formula) instead of trusting
    // item.roll, since that's only correct after a live sheet render - a clone never gets one.
    const skillItem = items.find(i =>
        (i.type === "knowSkill" || i.type === "specialSkill") && i.name === dataset.key);
    if (skillItem) {
        const aptValue = actorSystem.aptitudes?.[skillItem.system.aptitude]?.value ?? 0;
        const raw = Number(skillItem.system.value) + aptValue;
        return raw < 100 ? raw : 100;
    }

    // Aptitude checks (health-bar.html): data-apttype is the short key, e.g. "cog".
    if (dataset.apttype && actorSystem.aptitudes?.[dataset.apttype]) {
        return actorSystem.aptitudes[dataset.apttype].roll;
    }

    for (const group of ["skillsIns", "skillsVig", "skillsMox"]) {
        const skill = actorSystem[group]?.[dataset.key];
        if (skill?.roll !== undefined) return skill.roll;
    }

    return null;
}

// "Own body" jamming roll: skill values are baked from the persistent activeJam state, so a roll
// representing the real body would otherwise still carry the drone's (un)suppressed effects.
// Clones the actor with activeJam nulled (no DB write, prepareData runs sync) and diffs the value.
function getOwnBodyEffectDelta(actorWhole, dataset, rolledFrom) {
    let ownClone;
    try {
        // keepId: false is deliberate - EPactor.prepareData() has ungated update() calls (e.g.
        // _poolUpdate) that a same-_id clone would fire straight through to the live actor. Nothing
        // in the suppression/skill-calc chain reads the actor's own id, only its embedded items'
        // (unaffected by keepId), so a fresh id just makes any such write target nothing.
        ownClone = actorWhole.clone({
            "system.activeJam": null,
            "flags.eclipsephase.resleeving": false,
            // Psi never works while jamming (see effects.js Case C) - nulling activeJam above would
            // otherwise re-enable Psi effects on the clone, leaking Chi bonuses into this delta.
            "flags.eclipsephase.psiJamSuppression": true
        }, { keepId: false });
    } catch (err) {
        console.error("[EP2e] own-body effect delta: failed to clone actor for jamming roll", err);
        return 0;
    }

    const liveValue = resolveSkillRollValue(actorWhole.system, actorWhole.items.contents, dataset, rolledFrom);
    const ownValue = resolveSkillRollValue(ownClone.system, ownClone.items.contents, dataset, rolledFrom);

    if (liveValue == null || ownValue == null) return 0;
    return Number(ownValue) - Number(liveValue);
}

/**
 * Performs a roll against any given skill or aptitude. Prints it's result
 * into the chat for further usage.
 * @param {Object} dataset - The dataset object that contains all the necessary information for the roll. It is derived from the html element that was clicked to trigger the roll
 * @param {Object} actorModel - The actor's system object that the roll is being performed from
 * @param {Object} actorWhole - The actor object that the roll is being performed from
 * @param {Object} systemOptions - The system options selected mainly to determine whether homebrew rules are in effect
 * @param {Object} weaponSelected - The weapon object that is being used for the roll (This is important for attack rolls (melee/guns) only)
 * @param {string} rolledFrom - The source of the roll (rangedWeapon, ccWeapon, psi, etc.)
 * @returns 
 */

export async function RollCheck(dataset, actorModel, actorWhole, systemOptions, weaponSelected, rolledFrom) {
    let proceed
    let options = {}
    let specName = dataset.specname || "";
    let roll = defineRoll(dataset, actorWhole)

    // Psi never works over mesh/cyberbrain, which jamming requires - AE suppression (effects.js)
    // handles passive Chi bonuses, but an active Psi (Gamma) roll needs to be blocked outright.
    if (roll.type === "psi" && actorModel?.additionalSystems?.isJamming) {
        ui.notifications.warn(game.i18n.localize("ep2e.roll.announce.jamming.noPsi"));
        return;
    }

    let pool = await poolCalc(actorWhole.type, actorModel, dataset.apttype, dataset.pooltype, roll.type, rolledFrom)
    const isJammingRoll = actorModel?.additionalSystems?.isJamming && rolledFrom !== "integration" && rolledFrom !== "vehicleSkill";
    let values = await showOptionsDialog(roll, roll.type, specName, pool, actorWhole, weaponSelected ? weaponSelected.weaponTraits : null, rolledFrom)
    
    if(values.cancelled)
        return

    for (let entry in values){
        options[entry] = values[entry] || false
    }

    let numberOfTargets = 1
    if(options.numberOfTargets) numberOfTargets = parseInt(options.numberOfTargets);

    // Computed once (not per target) - see getOwnBodyEffectDelta for why this is needed at all.
    if (isJammingRoll && options.jammingRollTarget === "own") {
        options.ownBodyEffectDelta = getOwnBodyEffectDelta(actorWhole, dataset, rolledFrom);
    }

    for(let repitition = 1; repitition <= numberOfTargets; repitition++){

        let task = new TaskRoll(`${dataset.name}`, dataset.rollvalue, options.rangedFray)

        // While jamming, the pool choice comes from the jam-aware dropdowns and "own body" spends from the backup flag
        const activePoolChoice = isJammingRoll
            ? (options.jammingRollTarget === "own" ? options.jammingUsePoolOwn : options.jammingUsePoolRemote)
            : options.usePool;
        const activePool = (isJammingRoll && options.jammingRollTarget === "own" && pool.own) ? pool.own : pool;

        if (activePoolChoice) {

            let updatedPools = await pools.update(activePoolChoice, activePool, task, actorWhole)

            if (activePool.flexPoolValue) {
                activePool["skillPoolValue"] = updatedPools.skillPoolValue
                activePool["flexPoolValue"] = updatedPools.flexPoolValue
            }
            else {
                activePool["skillPoolValue"] = updatedPools.skillPoolValue
            }
        }

        if(roll.type === "psi" && actorWhole.type != "goon")
            options.totalInfection = await psi.infectionUpdate(actorWhole, options)
        
        if(activePoolChoice != "poolIgnore" && activePoolChoice != "flexIgnore")
            addTaskModifiers(actorWhole, actorModel, options, task, roll.type, rolledFrom, weaponSelected)

        // burnMod clamp must match _useGefallen()'s post-roll clamp (dataset.rollvalue/maxBurn).
        if(rolledFrom === "shopPurchase"){
            const sellBonus = Number(dataset.sellBonus) || 0;
            if(sellBonus) task.addModifier(new TaskRollModifier('ep2e.shop.purchase.sellBonusModifier', sellBonus))

            const actualBurn = Math.max(0, Math.min(Number(options.burnMod) || 0, Number(dataset.maxBurn) || 0, Number(dataset.rollvalue) || 0));
            if(actualBurn) task.addModifier(new TaskRollModifier('ep2e.shop.purchase.burnBonusModifier', actualBurn * 2))
        }

        await task.performRoll()

        let itemData = {}
        if(weaponSelected)
            itemData = weaponSelected
        // Must come before roll.sleight - defineRoll() always inits it to {}, a truthy empty object.
        else if(rolledFrom === "shopPurchase")
            itemData = { shopId: dataset.shopId, buyerActorId: dataset.buyerActorId, itemIds: dataset.itemIds, network: dataset.name, requiredTier: dataset.requiredTier, bodyBindings: dataset.bodyBindings }
        else if(roll.sleight)
            itemData = roll.sleight

        let outputData = task.outputData(options, actorWhole, activePool, itemData, rolledFrom, systemOptions)

        outputData.alternatives = await pools.outcomeAlternatives(outputData, activePool, systemOptions)
        let diceRoll = task.roll
        let actingPerson = actorWhole.name

        if(roll.type === "muse" && actorModel.muse.name)
            actingPerson = actorModel.muse.name + " " + game.i18n.localize("ep2e.muse.bracketsMuse")
        else if(roll.type === "muse" && !actorModel.muse.name)
            actingPerson = game.i18n.localize("ep2e.muse.museOf") + " " + actorWhole.name

        let blind = options.rollMode === "blind" ? true : false

        let recipientList = prepareRecipients(options.rollMode)

        if(rolledFrom === "rangedWeapon")
        proceed = await checkAmmo(actorWhole, weaponSelected, options.attackMode)

        if(proceed === "cancel")
            return
        console.log("My outputData", outputData)
        const rollResult = await rollToChat(dataset, outputData, TASK_RESULT_OUTPUT, diceRoll, actingPerson, recipientList, blind)
        
        if (!outputData.alternatives.options.available && outputData.taskName === "Psi" && actorWhole.type != "goon" && activePoolChoice != "ignoreInfection")
            psi.rollPsiEffect(actorWhole, game.user._id, options.push, systemOptions)

        return rollResult;
    }
}

/**
 * Generic dialog presenter
 * @param {string} template - Path to the html template for this dialog
 * @param {string} title - What to display in the title bar
 * @param {string[]} names - List of element ids to get values from
 * @param {string} specName - The name of the specialization (if any. Default: null)
 * @param {Object} pool - The pool object to display pool usage options in the dialog
 * @param {string} actorType - The type of actor this is (character, npc, goon)
 * @param {Object} traits - The traits object to display special effects in the dialog
 * @param {string} rolledFrom - The source of the roll (rangedWeapon, ccWeapon, psi, etc.)
 * @returns {Promise<Object>} - The values of the form when submitted
 */
async function showOptionsDialog(rollData, rollType, specName, pool, actorWhole, traits, rolledFrom) {
let specialEffects;
const actorType = actorWhole.type;

if (traits) {
    specialEffects = Object.keys(traits.confirmationEffects).length;
}

const content = await foundry.applications.handlebars.renderTemplate(rollData.template, {
    specName,
    pool,
    actorWhole,
    actorType,
    rollType,
    traits,
    specialEffects,
    rolledFrom,
    rollData
});

function extractFormValues(form) {
    const values = {};

    for (const name of rollData.names) {
    const field = form?.elements?.[name];

    if (field === undefined || field === null) {
        values[name] = null;
        continue;
    }

    if (field instanceof RadioNodeList) {
        values[name] = field.value ?? null;
        continue;
    }

    if (field.type === "checkbox") {
        values[name] = field.checked;
        continue;
    }

    values[name] = field.value;
    }

    return values;
}

const cancelButton = new Localizer("ep2e.roll.dialog.button.cancel");
const rollButton = new Localizer("ep2e.roll.dialog.button.roll");

const result = await foundry.applications.api.DialogV2.wait({
    window: { title: rollData.title },
    classes: ["ep2e-primary-right"],
    content,
    buttons: [
    {
        action: "roll",
        label: rollButton.title,
        default: true,
        callback: (event, button) => extractFormValues(button.form)
    },
    {
        action: "cancel",
        label: cancelButton.title,
        callback: () => ({ cancelled: true })
    }
    ],
    modal: true,
    rejectClose: false,
    render: (event, dialog) => {
        const root = dialog.element;
        if (!root) return;

        // Jamming: switch the pool dropdown between the remote body's live pools and the own body's stashed pools
        const jamTargetSelect = root.querySelector('select[name="jammingRollTarget"]');
        const remotePoolContainer = root.querySelector("#jamming-pool-remote");
        const ownPoolContainer = root.querySelector("#jamming-pool-own");

        if (jamTargetSelect && remotePoolContainer && ownPoolContainer) {
            jamTargetSelect.addEventListener("change", e => {
                const ownSelected = e.currentTarget.value === "own";
                remotePoolContainer.style.display = ownSelected ? "none" : "";
                ownPoolContainer.style.display = ownSelected ? "" : "none";
            });
        }
    },
    ...(rollData.templateSize?.width ? { position: { width: rollData.templateSize.width } } : {}),
    ...(rollData.templateSize && !rollData.templateSize.width ? rollData.templateSize : {})
});

return result ?? { cancelled: true };
}

/**
 * Creates all the modifiers for one roll based on the options selected
 * in the dialog before.
 * @param {Object} options - The options selected in the dialog
 */
function addTaskModifiers(actorWhole, actorModel, options, task, rollType, rolledFrom, weaponSelected){
    let modValue
    let addition
    let announce
    let weaponTraits = weaponSelected ? weaponSelected.weaponTraits : null
    let wounds = 10*(parseInt(actorModel.physical.wounds)+eval(actorModel.mods.woundMod) + (actorModel.mods.woundChiMod ? (eval(actorModel.mods.woundChiMod)*actorModel.mods.psiMultiplier) : 0))*eval(actorModel.mods.woundMultiplier)
    let trauma = 10*(parseInt(actorModel.mental.trauma)+eval(actorModel.mods.traumaMod) + (actorModel.mods.traumaChiMod ? (eval(actorModel.mods.traumaChiMod)*actorModel.mods.psiMultiplier) : 0))

    // isJammingRoll is needed by several unrelated suppression checks below (wounds, armor malus) -
    // computed once here so they all agree on the same definition.
    const isJammingRoll = actorModel?.additionalSystems?.isJamming && rolledFrom !== "integration" && rolledFrom !== "vehicleSkill";
    const isOwnBodyJammingRoll = isJammingRoll && options.jammingRollTarget === "own";

    if(options.rangedFray)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.combat.ranged.fray', eval(null), "Skill base value halved"))

    if(options.globalMod)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.global', Number(options.globalMod)))

    if(options.useSpec === true)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.specialization', 10))

    if(options.favorMod)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.favor', eval(options.favorMod)))

    // Wounds are suppressed for an "Own Body" jamming roll - "wounds" reflects the currently
    // jammed body (see EPactor.js's jammed _calculatePhysicalHealth branch), and the "Resleeving &
    // Jamming" block further down already applies the real body's own stashed ownBodyWoundMod
    // instead, so counting both here would double it up. Trauma is NOT suppressed - it's ego-level,
    // not body-level, so it applies regardless of which body is rolling.
    if(wounds > 0 && rolledFrom !== "vehicleSkill" && !isOwnBodyJammingRoll)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.woundModifier', -wounds))

    if(trauma > 0 && rolledFrom !== "vehicleSkill")
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.traumaModifier', -trauma))


    /* Encumberance (Armor) Malus */

    // Armor's share is suppressed for an "Own Body" jamming roll - that's the currently jammed
    // body's malus, and the branch below already applies the real body's own stashed armor malus
    // (ownBodyArmorMalus) instead, so counting both here would double it up.
    const suppressArmorMalusHere = isOwnBodyJammingRoll;
    const additionalArmorMalusHere = suppressArmorMalusHere ? 0 : actorModel.physical.additionalArmorMalus;
    const mainArmorMalusHere = suppressArmorMalusHere ? 0 : actorModel.physical.mainArmorMalus;
    const armorSomMalusHere = suppressArmorMalusHere ? 0 : actorModel.physical.armorSomMalus;

    // totalWeaponMalus/totalGearMalus are only ever set for characters (see EPactor.js's
    // _calculateHomebrewEncumberance, still character-only) - npc/goon leave them undefined,
    // so they need a fallback here to avoid poisoning the sum with NaN.
    const totalWeaponMalusHere = actorModel.physical.totalWeaponMalus || 0;
    const totalGearMalusHere = actorModel.physical.totalGearMalus || 0;

    if(rolledFrom !== "vehicleSkill" && (additionalArmorMalusHere || mainArmorMalusHere || totalWeaponMalusHere || totalGearMalusHere || armorSomMalusHere)){
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.encumberance', - additionalArmorMalusHere - mainArmorMalusHere - totalWeaponMalusHere - totalGearMalusHere - armorSomMalusHere))
    }

    /* Melee Roll */

    if (options.attackMode === "charge"){
        modValue = -10;
        addition = "ep2e.roll.announce.combat.melee.agressiveAddition";
        announce = "ep2e.roll.announce.combat.melee.charge";
        task.addModifier(new TaskRollModifier(announce, modValue, addition))
    }
    else if (options.attackMode === "aggressive"){
        modValue = 10;
        addition = "ep2e.roll.announce.combat.melee.agressiveAddition";
        announce = "ep2e.roll.announce.combat.melee.agressive";
        task.addModifier(new TaskRollModifier(announce, modValue, addition))
    }
    else if (options.attackMode === "aggressiveCharge"){
        modValue = 0
        addition = "ep2e.roll.announce.combat.melee.agressiveChargeAddition"
        announce = "ep2e.roll.announce.combat.melee.agressiveCharge";
        task.addModifier(new TaskRollModifier(announce, modValue, addition))
    }

    if (options.sizeDifference){
        let modCalc = 0
        if(rolledFrom === "ccWeapon"){
            modCalc += Number(options.sizeDifference != "none" ? options.sizeDifference : 0) + Number(weaponTraits.additionalEffects.reach ? weaponTraits.additionalEffects.reach.skillMod : 0);
        }
        else{
            modCalc += Number(options.sizeDifference != "none" ? options.sizeDifference : 0)
        }

        if(modCalc >30){
            modCalc = 30;
        }
        if(modCalc < -30){
            modCalc = -30;
        }

        
        if (modCalc != 0){
            modValue = modCalc;
            announce = "ep2e.roll.announce.combat.melee.sizeDifference";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
    }

    if (options.calledShot) {
        modValue = -10;
        addition = "ep2e.roll.announce.combat.calledShotAddition";
        announce = "ep2e.roll.announce.combat.calledShot";
        task.addModifier(new TaskRollModifier(announce, modValue, addition))
    }

    if (options.numberOfTargets>1) {
        modValue = 0 - (options.numberOfTargets-1)*20
        announce = "ep2e.roll.announce.combat.melee.multipleTargets";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    
    if (options.touchOnly) {
        modValue = +20;
        announce = "ep2e.roll.announce.combat.melee.touchOnly";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }

    /* Ranged Roll */

    if (rollType === "guns" && !options.smartlink) {
        modValue = -10
        announce = "ep2e.roll.announce.combat.ranged.smartLink";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    if (options.running) {
        modValue = -20
        announce = "ep2e.roll.announce.combat.ranged.running";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    if (options.superiorPosition) {
        modValue = 20
        announce = "ep2e.roll.announce.combat.ranged.superiorPosition";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    if (options.inMelee) {
        if (weaponTraits.automatedEffects.long){
            modValue = -30
        }
        else{
            modValue = -10
        }
        announce = "ep2e.roll.announce.combat.ranged.inMelee";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }

    if (options.coverAttacker) {
        modValue = -10
        announce = "ep2e.roll.announce.combat.ranged.coverAttacker";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }

    if (options.aim === "quick") {
        modValue = 10
        announce = "ep2e.roll.announce.combat.ranged.aimQuick";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.aim === "long") {
        modValue = 30
        announce = "ep2e.roll.announce.combat.ranged.aimLong";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }

    if (options.size === "xs") {
        modValue = -30
        announce = "ep2e.roll.announce.combat.ranged.sizeXS";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.size === "s") {
        modValue = -10
        announce = "ep2e.roll.announce.combat.ranged.sizeS";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.size === "l") {
        modValue = 10
        announce = "ep2e.roll.announce.combat.ranged.sizeL";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.size === "xl") {
        modValue = 30
        announce = "ep2e.roll.announce.combat.ranged.sizeXL";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    console.log("My options", options)
    if (options.range === "range" && options.prone) {
        modValue = -20
        announce = "ep2e.roll.announce.combat.ranged.rangeProne";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.range === "beyond" && options.prone) {
        modValue = -30
        announce = "ep2e.roll.announce.combat.ranged.beyondProne";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.range === "beyond+" && options.prone) {
        modValue = -40
        announce = "ep2e.roll.announce.combat.ranged.beyondPlusProne";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.range === "range") {
        modValue = -10
        announce = "ep2e.roll.announce.combat.ranged.range";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.range === "beyond") {
        modValue = -20
        announce = "ep2e.roll.announce.combat.ranged.beyond";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.range === "beyond+") {
        modValue = -30
        announce = "ep2e.roll.announce.combat.ranged.beyondPlus";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.range === "pointBlank" || options.range === "pointBlank" && options.prone){
        if (!weaponTraits?.automatedEffects?.long){
            modValue = 10
            announce = "ep2e.roll.announce.combat.ranged.pointBlank";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
    }

    if (options.coverDefender === "minor") {
        modValue = -10
        announce = "ep2e.roll.announce.combat.ranged.defMinCover";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.coverDefender === "moderate") {
        modValue = -20
        announce = "ep2e.roll.announce.combat.ranged.defModCover";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.coverDefender === "major") {
        modValue = -30
        announce = "ep2e.roll.announce.combat.ranged.defMajCover";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }

    if (options.visualImpairment === "minor") {
        modValue = -10
        announce = "ep2e.roll.announce.combat.ranged.visImpMin";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.visualImpairment === "major") {
        modValue = -20
        announce = "ep2e.roll.announce.combat.ranged.visImpMaj";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.visualImpairment === "blind") {
        modValue = -30
        announce = "ep2e.roll.announce.combat.ranged.blind";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.visualImpairment === "indirect" && options.ammoEffect != "ignoreIndirect") {
        modValue = -20
        announce = "ep2e.roll.announce.combat.ranged.indirect";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }

    if (options.defenderHidden) {
        modValue = -30
        announce = "ep2e.roll.announce.combat.ranged.defHidden";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }

    if (options.attackMode === "wBurst") {
        modValue = 10
        announce = "ep2e.roll.announce.combat.ranged.wBurst";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.attackMode === "wFullAuto") {
        modValue = 30
        announce = "ep2e.roll.announce.combat.ranged.wFullAuto";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }

    if (options.ammoEffect === "ammoSkillModifier"){
        modValue = 10
        announce = "ep2e.roll.announce.combat.ranged.ammoSkillModifier";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    if (rolledFrom === "rangedWeapon"){
        if (!options.weaponFixated && weaponTraits.confirmationEffects.fixed){
            modValue = -20
            announce = "ep2e.roll.announce.combat.ranged.weaponFixated";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
    }

    /* Resleeving & Jamming */

    if (isJammingRoll) {
        if (options.jammingRollTarget === "own") {
            modValue = -30;
            announce = "ep2e.roll.announce.jamming.ownBodyPenalty";
            task.addModifier(new TaskRollModifier(announce, modValue));

            // Own-body Trait/Ware delta, see getOwnBodyEffectDelta.
            if (options.ownBodyEffectDelta) {
                announce = "ep2e.roll.announce.jamming.ownBodyTraits";
                task.addModifier(new TaskRollModifier(announce, options.ownBodyEffectDelta));
            }

            // Rolling with the real body instead of the drone: its stashed wounds and its own
            // worn-armor encumbrance apply again, since neither affects the drone while jamming.
            if (actorModel?.additionalSystems?.jamming?.ownBodyWoundMod) {
                modValue = actorModel.additionalSystems.jamming.ownBodyWoundMod;
                announce = "ep2e.roll.announce.jamming.ownBodyWounds";
                task.addModifier(new TaskRollModifier(announce, modValue));
            }
            if (actorModel?.additionalSystems?.jamming?.ownBodyArmorMalus) {
                modValue = actorModel.additionalSystems.jamming.ownBodyArmorMalus;
                announce = "ep2e.roll.announce.jamming.ownBodyArmor";
                task.addModifier(new TaskRollModifier(announce, modValue));
            }

            // The Homebrew weapon/gear/bulky/consumable encumbrance is suppressed on the drone's own
            // rolls (see _calculateHomebrewEncumberance), so the real body's stashed values apply here instead.
            if (actorModel?.homebrew) {
                const weapon = actorModel.additionalSystems?.jamming?.ownBodyWeaponMalus || 0;
                const gear = actorModel.additionalSystems?.jamming?.ownBodyGearMalus || 0;
                const homebrewEncumbrance = (weapon + gear) * -1;
                if (homebrewEncumbrance) {
                    modValue = homebrewEncumbrance;
                    announce = "ep2e.roll.announce.jamming.ownBodyEncumbrance";
                    task.addModifier(new TaskRollModifier(announce, modValue));
                }
            }
        }
        else if (!actorModel?.additionalSystems?.jamming?.ignorePenalty) {
            modValue = -10;
            announce = "ep2e.roll.announce.jamming.penalty";
            task.addModifier(new TaskRollModifier(announce, modValue));
        }
    }

    if (actorModel?.additionalSystems?.sleeving?.integrationIssues !== undefined && rolledFrom !== "vehicleSkill"){
            modValue = actorModel.additionalSystems.sleeving.integrationIssues.value
            announce = actorModel.additionalSystems.sleeving.integrationIssues.title;
            task.addModifier(new TaskRollModifier(announce, modValue))
    }

    if (rolledFrom === "integration"){
        // For a real resleeve, check the newly sleeved Morph. For a jam, check the body actually
        // being jammed into instead - activeMorph never changes during a jam, so checking it here
        // meant the aversion check silently never fired for jamming (Vehicle or Morph target alike).
        const targetId = actorModel.activeJam || actorModel.activeMorph;
        const targetBody = actorWhole.items.get(targetId);
        const targetType = targetBody
            ? (targetBody.type === "vehicle"
                ? (targetBody.system.chassisType === "animal" ? "bio" : "synth")
                : targetBody.system.type)
            : undefined;

        // Each Aversion trait (Biomorph/Synthmorph/Infomorph, I-III) writes to its own
        // sleeving.aversions.<bodyType> key, so multiple simultaneous Aversions can't collide into
        // one merged value (they used to all target the same sleeving.aversion.type/.value pair,
        // which "add"-mode string-concatenated the type into garbage like "bioinfosynth" - see the
        // v2.0 migration for the fix applied to already-placed copies of these traits).
        const aversionValue = targetType ? actorModel?.additionalSystems?.sleeving?.aversions?.[targetType] : undefined;
        if (aversionValue) {
            modValue = eval(aversionValue)
            announce = "ep2e.roll.announce.sleeving.aversion";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        if(options.exoticMorphology){
            modValue = eval(actorModel.additionalSystems.sleeving.exotic)
            announce = "ep2e.roll.announce.sleeving.exoticMorphology";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
    }
    if (rolledFrom === "stressTest"){
        
        if(actorModel?.additionalSystems?.sleeving?.bodyDysmorphia !== undefined){
            modValue = actorModel.additionalSystems.sleeving.bodyDysmorphia;
            announce = "ep2e.roll.announce.sleeving.bodyDysmorphia";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        if(actorModel?.additionalSystems?.sleeving?.morphingDisorder !== undefined){
            modValue = actorModel.additionalSystems.sleeving.morphingDisorder
            announce = "ep2e.roll.announce.sleeving.morphingDisorder";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        if(actorModel?.additionalSystems?.sleeving?.adaptability !== undefined){
            modValue = actorModel.additionalSystems.sleeving.adaptability
            announce = "ep2e.roll.announce.sleeving.adaptability";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

    }

}

async function checkAmmo(actorWhole, weaponSelected, attackMode){

    let updateAmmo
    let ammoUpdate = [] 
    const multiShot = Number(weaponSelected.weaponTraits.additionalEffects.multiShot ? weaponSelected.weaponTraits.additionalEffects.multiShot.number : 1)

    if (attackMode === "single") {
        updateAmmo = weaponSelected.currentAmmo - (1 * multiShot);
    }
    else if (attackMode === "burst") {
        updateAmmo = weaponSelected.currentAmmo - (3 * multiShot);
    }
    else if (attackMode === "fullAuto"){
        updateAmmo = weaponSelected.currentAmmo - (10 * multiShot);
    }
    else if (attackMode === "wBurst") {
        updateAmmo = weaponSelected.currentAmmo - (3 * multiShot);
    }
    else if (attackMode === "wFullAuto") {
        updateAmmo = weaponSelected.currentAmmo - (10 * multiShot);
    }
    else if (attackMode === "suppressive") {
        updateAmmo = weaponSelected.currentAmmo - (20 * multiShot);
    }
    //Rolls only if the weapon has enough amunition & updates the ammo accordingly
    if (updateAmmo>=0){
    
        ammoUpdate.push({
            "_id" : weaponSelected.weaponID,
            "system.ammoMin": updateAmmo
        });
    
        //This updates the items ammunition
        actorWhole.updateEmbeddedDocuments("Item", ammoUpdate);
    }
    
    else {
    
        let message = {}

        message.type = "reload";
        message.copy = "ep2e.roll.announce.combat.ranged.reloadNeeded";
        message.weaponName = weaponSelected.weaponName;
        message.ammoLoadedName = weaponSelected.weapon.system.ammoSelected.name
    
        let html = await foundry.applications.handlebars.renderTemplate(WEAPON_DAMAGE_OUTPUT, message)
    
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actorWhole}),
            content: html,
            whisper: [game.user._id]
        })

        return "cancel"
    }
}

/**
 * @param {Object} dataset - contains special data to manipulate the roll in a special way (e.g. render it in a specific way to the chat)
 * @param {Object} message - Provides all values to the html template
 * @param {Class} task - Result of the TaskRoll class 
 * @param {Array} recipientList - List of users to whisper the result to (empty if public)
 * @param {Boolean} blind - If the roll is blind or not (important: due to the API provided by DsN blind rolls will not trigger any 3D dice animations)
 * @param {String} alias - Alias of the speaker
 * @param {String} htmlTemplate - Path to the html template to use for the chat message
 * @param {*} roll - The roll object (standard: Object. May be an array if multirolls are performed)
 * @param {String} rollType - The type of roll
 * @param {String} rollTitle - The title of the roll
 */
export async function rollToChat(dataset, message, htmlTemplate, roll, alias, recipientList, blind, rollType){
    const diceArray = []
    let specialRules = dataset ? dataset : false;
    const showTo = recipientList != null ? recipientList.length > 0 ? recipientList : null : null
    if(roll){
        if(roll.length > 1){
             for(let array = 0; array < roll.length; array++){
                
                const diceBreakdown = breakdown(roll[array])

                diceBreakdown.rollType = rollType
                diceBreakdown.rollTitle = message.rollTitle
                diceBreakdown.total = roll[array].total
                diceBreakdown.rollNumber = array + 1
                diceArray.push(diceBreakdown)

                /* Rolls 3D dice if the module is enabled, otherwise plays the default sound */
                if (game.dice3d) {
                    game.dice3d.showForRoll(roll[array], game.user, true, showTo, blind)
                } else {
                    message.sound = CONFIG.sounds.dice
                }
            }
            message.diceArray = diceArray
        }
        else{
            
            const diceBreakdown = breakdown(roll)
            
            message.diceBreakdown = diceBreakdown
            
            /* Rolls 3D dice if the module is enabled, otherwise plays the default sound */
            if (game.dice3d) {
                await game.dice3d.showForRoll(roll, game.user, true, showTo, blind)
            } else {
                message.sound = CONFIG.sounds.dice
            }
        }
        message.formula = roll.length > 1 ? roll.formula : null
        message.total = roll.total
        message.rollType = rollType
    }

    let html = await foundry.applications.handlebars.renderTemplate(htmlTemplate, message)

    
    //Returns a roll without producing the output directly to the chat
    if(specialRules.preventPrintToChat) return message;

    message.chatMessage = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({alias: alias}),
        content: html,
        whisper: showTo,
        sound: message.sound,
        blind: blind
    })

    return message;
}

function breakdown(roll){
    
    let diceBreakdown = {"hundreds": {}, "tens": {}, "sixes": {}}
    let i = 0
    for(let dice of roll.dice){
        if(dice.faces === 6)
            for(let roll of dice.results){
            diceBreakdown.sixes[i] = roll
            i++
        }
        else if(dice.faces === 10)
            for(let roll of dice.results){
            diceBreakdown.tens[i] = roll
            i++
        }
        else if (dice.faces === 100)
            for(let roll of dice.results){
            diceBreakdown.hundreds[i] = roll
            i++
        }
    }
    return diceBreakdown
}