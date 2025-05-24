import  * as pools  from "./pools.js";
import * as psi from "./psi.js";
import { prepareRecipients } from "../common/common-sheet-functions.js";

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

async function poolCalc(actorType, actorModel, aptType, poolType, rollType){

    let pool
    if (actorType != "character"){
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

    return calcPool
}

function defineRoll(dataset, actorWhole){
    
    let type = dataset.key ? dataset.key.toLowerCase() : null;
    let names = ['globalMod', 'usePool', 'useSpec', 'rangedFray', 'raiseInfection', 'push', 'favorMod', 'attackMode', 'sizeDifference', 'calledShot', 'numberOfTargets', 'touchOnly', 'smartlink', 'running', 'superiorPosition', 'inMelee', 'coverAttacker', 'aim', 'size', 'range', 'prone', 'hiddenDefender', 'coverDefender', 'visualImpairment', 'attackMode', 'ammoEffect', 'biomorphTarget', 'weaponFixated', 'rollMode']
    let sleight = {}
    let template
    let templateSize = {width: 276}
    let title = game.i18n.localize('ep2e.roll.dialog.title.check')

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
    let rollModeSelection = null
    if (activeRollTarget === "" || activeRollTarget === "public") {
        rollModeSelection = CONST.DICE_ROLL_MODES.PUBLIC
    } else if (activeRollTarget === "private") {
        rollModeSelection = CONST.DICE_ROLL_MODES.PRIVATE
    } else if (activeRollTarget === "blind") {
        rollModeSelection = CONST.DICE_ROLL_MODES.BLIND
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
    let pool = await poolCalc(actorWhole.type, actorModel, dataset.apttype, dataset.pooltype, roll.type)
    let values = await showOptionsDialog(roll, roll.type, specName, pool, actorWhole.type, weaponSelected ? weaponSelected.weaponTraits : null, rolledFrom)
    
    if(values.cancelled)
        return

    for (let entry in values){
        options[entry] = values[entry] || false
    }

    let numberOfTargets = options.numberOfTargets ? parseInt(options.numberOfTargets) : 1

    for(let repitition = 1; repitition <= numberOfTargets; repitition++){

        let task = new TaskRoll(`${dataset.name}`, dataset.rollvalue, options.rangedFray)

        if(options.usePool){

            let updatedPools = await pools.update(options.usePool, pool, task, actorWhole)
            
            if(pool.flexPoolValue){
                pool["skillPoolValue"] = updatedPools.skillPoolValue
                pool["flexPoolValue"] = updatedPools.flexPoolValue
            }
            else{
                pool["skillPoolValue"] = updatedPools.skillPoolValue
            }
        }

        if(roll.type === "psi" && actorWhole.type != "goon")
            options.totalInfection = await psi.infectionUpdate(actorWhole, options)
        
        if(options.usePool != "poolIgnore" && options.usePool != "flexIgnore")
            addTaskModifiers(actorModel, options, task, roll.type, rolledFrom, weaponSelected)
        
        await task.performRoll()

        let itemData = {}
        if(weaponSelected)
            itemData = weaponSelected
        else if(roll.sleight)
            itemData = roll.sleight
        
        let outputData = task.outputData(options, actorWhole, pool, itemData, rolledFrom, systemOptions)

        outputData.alternatives = await pools.outcomeAlternatives(outputData, pool, systemOptions)
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
        
        await rollToChat(outputData, TASK_RESULT_OUTPUT, diceRoll, actingPerson, recipientList, blind)
        
        if (!outputData.alternatives.options.available && outputData.taskName === "Psi" && actorWhole.type != "goon" && options.usePool != "ignoreInfection")
            psi.rollPsiEffect(actorWhole, game.user._id, options.push, systemOptions)
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
async function showOptionsDialog(rollData, rollType, specName, pool, actorType, traits, rolledFrom) {

    let specialEffects
    if(traits)
        specialEffects = Object.keys(traits.confirmationEffects).length

    const html = await renderTemplate(rollData.template, {specName, pool, actorType, rollType, traits, specialEffects, rolledFrom, rollData})

    function extractFormValues(html) {
    let form = html[0].querySelector("form")

    let values = {}

    for(let name of rollData.names)
        if (form[name] === undefined){
            values[name] = null
        }
        else{
            values[name] = form[name].value === "on" ? form[name].checked : form[name].value;
        }
        return values
    }

  return new Promise((resolve, reject) => {
    let cancelButton = new Localizer ('ep2e.roll.dialog.button.cancel');
    let rollButton = new Localizer ('ep2e.roll.dialog.button.roll');
    const data = {
        title: rollData.title,
        content: html,
        buttons: {
            cancel: {
                label: cancelButton.title,
                callback: (html) => resolve({cancelled: true})
            },
            normal: {
                label: rollButton.title,
                callback: (html) => resolve(extractFormValues(html))
            }
        },
        default: 'normal',
        close: () => resolve({cancelled: true})
    }
    let options = rollData.templateSize
    new Dialog(data, options).render(true);
    })
}

/**
 * Creates all the modifiers for one roll based on the options selected
 * in the dialog before.
 * @param {Object} options - The options selected in the dialog
 */
function addTaskModifiers(actorModel, options, task, rollType, rolledFrom, weaponSelected){
    let modValue
    let addition
    let announce
    let weaponTraits = weaponSelected ? weaponSelected.weaponTraits : null
    let wounds = 10*(parseInt(actorModel.physical.wounds)+eval(actorModel.mods.woundMod) + (actorModel.mods.woundChiMod ? (eval(actorModel.mods.woundChiMod)*actorModel.mods.psiMultiplier) : 0))*eval(actorModel.mods.woundMultiplier)
    let trauma = 10*parseInt(actorModel.mental.trauma)+eval(actorModel.mods.traumaMod) + (actorModel.mods.traumaChiMod ? (eval(actorModel.mods.traumaChiMod)*actorModel.mods.psiMultiplier) : 0)
    
    if(options.rangedFray)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.combat.ranged.fray', eval(null), "Skill base value halved"))

    if(options.globalMod)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.global', eval(options.globalMod)))

    if(options.useSpec === true)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.specialization', 10))

    if(options.favorMod)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.favor', eval(options.favorMod)))
    
    if(wounds > 0)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.woundModifier', -wounds))

    if(trauma > 0)
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.traumaModifier', -trauma))

    
    /* Armor Malus */

    if(actorModel.physical.additionalArmorMalus || actorModel.physical.mainArmorMalus || actorModel.physical.totalWeaponMalus || actorModel.physical.totalGearMalus){
        task.addModifier(new TaskRollModifier('ep2e.roll.announce.encumberance', - actorModel.physical.additionalArmorMalus - actorModel.physical.mainArmorMalus - actorModel.physical.totalWeaponMalus - actorModel.physical.totalGearMalus))
    }

    /*Test*/

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

    if (options.range === "range" && prone) {
        modValue = -20
        announce = "ep2e.roll.announce.combat.ranged.rangeProne";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.range === "beyond" && prone) {
        modValue = -30
        announce = "ep2e.roll.announce.combat.ranged.beyondProne";
        task.addModifier(new TaskRollModifier(announce, modValue))
    }
    else if (options.range === "beyond+" && prone) {
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
        if (!weaponTraits.automatedEffects.long){
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
    
        let html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)
    
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actorWhole}),
            content: html,
            whisper: [game.user._id]
        })

        return "cancel"
    }
}

/**
 * 
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
export async function rollToChat(message, htmlTemplate, roll, alias, recipientList, blind, rollType){
    const diceArray = []

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

    let html = await renderTemplate(htmlTemplate, message)

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({alias: alias}),
        content: html,
        whisper: showTo,
        sound: message.sound,
        blind: blind
    })
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
    console.log("^^^", diceBreakdown)
    return diceBreakdown
}