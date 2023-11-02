import { eclipsephase } from "./config.js";
import { damageValueCalc } from "./common/weapon-functions.js"
/*
 * Path constants for dialog templates
 */
const REPUTATION_TASK_DIALOG = 'systems/eclipsephase/templates/chat/rep-test-dialog.html'
const TASK_RESULT_OUTPUT = 'systems/eclipsephase/templates/chat/task-result.html'
const POOL_USAGE_OUTPUT = 'systems/eclipsephase/templates/chat/pool-usage.html'
const WEAPON_DAMAGE_OUTPUT = 'systems/eclipsephase/templates/chat/damage-result.html'
const PSI_INFLUENCE_OUTPUT = 'systems/eclipsephase/templates/chat/psi-influence.html'

/*
 * Task result constants
 */
export const TASK_RESULT = {
  CRITICAL_SUCCESS: 0,
  SUCCESS_TWO: 1,
  SUCCESS_ONE: 2,
  SUCCESS: 3,
  CRITICAL_FAILURE: 4,
  FAILURE_TWO: 5,
  FAILURE_ONE: 6,
  FAILURE: 7
}

const TASK_RESULT_TEXT = {
  0: { class: 'success', text: 'ep2e.roll.successType.criticalSuccess' },
  1: { class: 'success', text: 'ep2e.roll.successType.superiorSuccess' },
  2: { class: 'success', text: 'ep2e.roll.successType.greaterSuccess' },
  3: { class: 'success', text: 'ep2e.roll.successType.success' },
  4: { class: 'fail', text: 'ep2e.roll.successType.criticalFailure' },
  5: { class: 'fail', text: 'ep2e.roll.successType.superiorFailure' },
  6: { class: 'fail', text: 'ep2e.roll.successType.greaterFailure' },
  7: { class: 'fail', text: 'ep2e.roll.successType.failure' }
}

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
  constructor(taskName, baseValue) {
    this._taskName = taskName
    this._baseValue = baseValue
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
    return this._baseValue
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
   * Retrieves the combined target number, taking into account the
   * base value and all roll modifiers.
   * @type {Number}
   */
  get totalTargetNumber() {
    let mods = this.modifiers.map((mod) => mod.value)
      .reduce((sum, value) => { return sum + value }, 0)

    return this.baseValue + mods
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
    let result = await this._roll.evaluate({async: true })

    this._rollValue = parseInt(this._roll.total)
    this._calculateResult()
  }


  /**
   * Figure out the result of the roll, compared to the target number
   */
  _calculateResult() {

    let target = this.totalTargetNumber
    let value = this.diceRollValue
    let result

    if(value <= target) {   // success results
      if(value % 11 === 0)
        result = TASK_RESULT.CRITICAL_SUCCESS
      else if(value > 66)
        result = TASK_RESULT.SUCCESS_TWO
      else if(value > 33)
        result = TASK_RESULT.SUCCESS_ONE
      else
        result = TASK_RESULT.SUCCESS
    }
    else {                  // failure results
      if(value % 11 === 0)
        result = TASK_RESULT.CRITICAL_FAILURE
      else if(value < 33)
        result = TASK_RESULT.FAILURE_TWO
      else if(value < 66)
        result = TASK_RESULT.FAILURE_ONE
      else
        result = TASK_RESULT.FAILURE
    }

    this._result = result
  }


  /**
   * Format all of the output data so the output partial understands it.
   */
  outputData() {
    let data = {}

    let resultText = TASK_RESULT_TEXT[this._result]

    data.resultClass = resultText.class
    data.resultText = resultText.text

    data.taskName = this.taskName
    data.targetNumber = this.totalTargetNumber
    data.taskValue = this.baseValue

    data.modifiers = []
    if(this.modifiers.length > 0) {
      for(let mod of this.modifiers) {
        if(mod.value !== 0)
          data.modifiers.push({text: mod.text, value: mod.formattedValue})
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
 * Perform a roll against the selected reputation network score (on the
 * selected id). Output the results to the chat log.
 *
 * FIXME - Most of this function can be abstracted when(/if) other task
 * types are converted.
 */
export async function ReputationRoll(dataset, actorModel) {
  let id = actorModel.ego.idSelected
  let rep = actorModel.ego.ids[id].rep[dataset.name]
  let repName = dataset.name
  let repValue = parseInt(rep.value || 0)
  let names = ['favorMod', 'globalMod']

  let values = await showOptionsDialog(REPUTATION_TASK_DIALOG,
    'Reputation Roll', names)

  if(values.cancelled)
    return

  let favor_mod = parseInt(values['favorMod']) || 0
  let global_mod = parseInt(values['globalMod']) || 0

  let task = new TaskRoll(`${dataset.name}`, repValue)

  if(global_mod !== 0)
    task.addModifier(new TaskRollModifier('ep2e.roll.announce.global', global_mod))

  if(favor_mod !== 0)
    task.addModifier(new TaskRollModifier('ep2e.roll.announce.favor', favor_mod))

  applyHealthModifiers(actorModel, task)

  await task.performRoll()


  let outputData = task.outputData()
  let html = await renderTemplate(TASK_RESULT_OUTPUT, outputData)

  task.roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    flavor: html
  })
}


/**
 * Applies any penalties due to injury or mental trauma to the roll
 * @param {ActorData} actorData Where to pull the injury values from
 * @param {TaskRoll} taskRoll Where to write the modifiers
 */
function applyHealthModifiers(actorData, taskRoll) {

    let wounds = 10*(parseInt(actorData.physical.wounds)+eval(actorData.mods.woundMod) + (actorData.mods.woundChiMod ? (eval(actorData.mods.woundChiMod)*actorData.mods.psiMultiplier) : 0))*eval(actorData.mods.woundMultiplier)
    let trauma = 10*parseInt(actorData.mental.trauma)+eval(actorData.mods.traumaMod) + (actorData.mods.traumaChiMod ? (eval(actorData.mods.traumaChiMod)*actorData.mods.psiMultiplier) : 0)

  if(wounds > 0)
    taskRoll.addModifier(new TaskRollModifier('ep2e.roll.announce.woundModifier', -wounds))

  if(trauma > 0)
    taskRoll.addModifier(new TaskRollModifier('ep2e.roll.announce.traumaModifier', -trauma))
}





/**
 * Generic dialog presenter
 * @param {string} template - Path to the html template for this dialog
 * @param {string} title - What to display in the title bar
 * @param {string[]} names - List of element ids to get values from
 */
async function showOptionsDialog(template, title, names) {
  const html = await renderTemplate(template, {})

  function extractFormValues(html) {
    let form = html[0].querySelector("form")

    let values = {}

    for(let name of names)
      values[name] = form[name].value

    return values
  }

  return new Promise((resolve, reject) => {
    let cancelButton = new Localizer ('ep2e.roll.dialog.button.cancel');
    let rollButton = new Localizer ('ep2e.roll.dialog.button.roll');
    const data = {
      title: title,
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
    let options = {width:276}
    new Dialog(data, options).render(true);
  })
}










//General & Special Task Checks
export async function TaskCheck({
    //General
    msg = null,
    actorData = "",
    actorWhole = "",
    actorType = actorWhole.type,
    skillKey = "",
    skillName = "",
    specName = "",
    useSpecialization = null,
    skillValue = null,
    askForOptions = false,
    optionsSettings = null,
    brewStatus = false,
    rolledFrom = "",
    announce = "",
    usedRaise = null,
    usedFlexRaise = null,
    //Results
    success = false,
    critical = false,
    autoSuccess = false,
    autoFail = false,
    doubleSuperior = false,
    superior = false,
    successMessage = "",
    successClass = "",
    successName = null,
    //Pools
    poolType = "",
    poolValue = 0,
    flexValue = 0,
    usePool = null,
    useFlex = null,
    useThreat = null,
    poolUpdate = 0,
    usedSwipSwap = null,
    usedMitigate = false,
    //Roll
    rollType = "",
    rollModeSelection = null,
    activeRollTarget = "",
    globalMod = null,
    rollFormula = "1d100",
    woundsMod = null,
    modValue = null,
    addition = "",
    //Psi
    infectionMod = null,
    aspectPushed = null,
    aspectBase = null,
    ignoreInfection = null,
    //Guns
    aim = "",
    size = "",
    range = "",
    coverDefender = "",
    coverAttacker = false,
    visualImpairment = "",
    prone = false,
    smartlink = true,
    running = false,
    superiorPosition = false,
    calledShot = false,
    inMelee = false,
    ammoEffect = null,
    weaponFixated = false,
    biomorphTarget = false,
    gunsMod = 0,
    //Melee
    numberOfTargets = 1,
    meleeMod = 0,
    meleeDamageMod = null,
    sizeDifference = "",
    touchOnly = false,
    //Weapon Data
    weaponSelected = null,
    weaponName = null,
    weaponID = "",
    weaponDamage = "",
    weaponType = "",
    currentAmmo = "",
    updateAmmo = "",
    ammoUpdate = [],
    successType = false,
    attackMode = "",
    weaponTraits = {},
    //Psi
    sleightName = "",
    sleightDescription = "",
    sleightAction = "",
    sleightDuration = "",
    sleightInfection = ""
    } = {}) {

    //Task Roll created
    let task = new TaskRoll (skillName, skillValue);

    //Guns check dialog

    if (askForOptions != optionsSettings && skillKey === "guns") {
        
        let checkOptions = await GetGunsTaskOptions(specName, poolType, poolValue, flexValue, actorType, weaponTraits, rolledFrom);

        if (checkOptions.cancelled) {
            return;
        }

        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        ammoEffect = checkOptions.ammoEffect
        weaponFixated = checkOptions.weaponFixated
        biomorphTarget = checkOptions.biomorphTarget
        aim = checkOptions.aim;
        size = checkOptions.size;
        range = checkOptions.range;
        coverDefender = checkOptions.coverDefender;
        coverAttacker = checkOptions.coverAttacker;
        visualImpairment = checkOptions.visualImpairment;
        prone = checkOptions.prone;
        attackMode = checkOptions.attackMode;
        smartlink = checkOptions.smartlink;
        running = checkOptions.running
        superiorPosition = checkOptions.superiorPosition;
        calledShot = checkOptions.calledShot;
        inMelee = checkOptions.inMelee;
        useSpecialization = checkOptions.useSpecialization;
        usePool = checkOptions.usePool;
        useFlex = checkOptions.useFlex;
        useThreat = checkOptions.useThreat;
    }

    //Melee skill check dialog
    else if (askForOptions != optionsSettings && skillKey === "melee") {

        let checkOptions = await GetMeleeTaskOptions(specName, poolType, poolValue, flexValue,  actorType, weaponTraits, rolledFrom);

        if (checkOptions.cancelled) {
            return;
        }
        attackMode = checkOptions.attackMode;
        sizeDifference = checkOptions.sizeDifference;
        touchOnly = checkOptions.touchOnly;
        numberOfTargets = checkOptions.numberOfTargets;
        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        calledShot = checkOptions.calledShot;
        useSpecialization = checkOptions.useSpecialization;
        usePool = checkOptions.usePool;
        useFlex = checkOptions.useFlex;
        useThreat = checkOptions.useThreat;
    }

    //Default skill check dialog
    else if (askForOptions != optionsSettings) {
        let taskType = skillKey
        let checkOptions = await GetTaskOptions(skillName, specName, poolType, poolValue, flexValue,  actorType, taskType, sleightInfection, rolledFrom);

        if (checkOptions.cancelled) {
            return;
        }

        skillValue = checkOptions.ranged ? Math.floor(Number(skillValue)/2): skillValue;
        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        ignoreInfection = checkOptions.ignoreInfection;
        aspectPushed = checkOptions.pushes
        aspectBase = checkOptions.aspects
        useSpecialization = checkOptions.useSpecialization;
        usePool = checkOptions.usePool;
        useFlex = checkOptions.useFlex;
        useThreat = checkOptions.useThreat;
    }

    //Melee Combat

    if (skillKey === "melee"){
        if (attackMode === "charge"){
            meleeMod -= 10;
            modValue = -10;
            addition = "ep2e.roll.announce.combat.melee.agressiveAddition";
            announce = "ep2e.roll.announce.combat.melee.charge";
            task.addModifier(new TaskRollModifier(announce, modValue, addition))
        }
        else if (attackMode === "aggressive"){
            meleeMod += 10;
            modValue = 10;
            addition = "ep2e.roll.announce.combat.melee.agressiveAddition";
            announce = "ep2e.roll.announce.combat.melee.agressive";
            task.addModifier(new TaskRollModifier(announce, modValue, addition))
        }
        else if (attackMode === "aggressiveCharge"){
            modValue = 0
            addition = "ep2e.roll.announce.combat.melee.agressiveChargeAddition"
            announce = "ep2e.roll.announce.combat.melee.agressiveCharge";
            task.addModifier(new TaskRollModifier(announce, modValue, addition))
        }

        if (sizeDifference){
            if(rolledFrom === "ccWeapon"){
                meleeMod += Number(sizeDifference != "none" ? sizeDifference : 0) + Number(weaponTraits.additionalEffects.reach ? weaponTraits.additionalEffects.reach.skillMod : 0);
            }
            else{
                meleeMod += Number(sizeDifference != "none" ? sizeDifference : 0)
            }

            if(meleeMod >30){
                meleeMod = 30;
            }
            if(meleeMod < -30){
                meleeMod = -30;
            }

            
            if (meleeMod != 0){
                modValue = meleeMod;
                announce = "ep2e.roll.announce.combat.melee.sizeDifference";
                task.addModifier(new TaskRollModifier(announce, modValue))
            }
        }

        if (calledShot) {
            meleeMod -= 10;
            modValue = -10;
            addition = "ep2e.roll.announce.combat.calledShotAddition";
            announce = "ep2e.roll.announce.combat.calledShot";
            task.addModifier(new TaskRollModifier(announce, modValue, addition))
        }

        if (numberOfTargets>1) {
            meleeMod -= numberOfTargets ? (numberOfTargets-1)*20 : 0;
            modValue = 0 - (numberOfTargets-1)*20
            announce = "ep2e.roll.announce.combat.melee.multipleTargets";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        
        if (touchOnly) {
            meleeMod += 20;
            modValue = +20;
            weaponDamage = "ep2e.item.weapon.table.noDamage";
            announce = "ep2e.roll.announce.combat.melee.touchOnly";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
    }

    //Ranged Combat

    if (skillKey === "guns"){
        //Guns roll modifications
        if (!smartlink) {
            gunsMod -= 10;
            modValue = -10
            announce = "ep2e.roll.announce.combat.ranged.smartLink";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        if (running) {
            gunsMod -= 20;
            modValue = -20
            announce = "ep2e.roll.announce.combat.ranged.running";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        if (superiorPosition) {
            gunsMod += 20;
            modValue = 20
            announce = "ep2e.roll.announce.combat.ranged.superiorPosition";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        if (calledShot) {
            gunsMod -= 10;
            modValue = -10
            addition = "ep2e.roll.announce.combat.calledShotAddition";
            announce = "ep2e.roll.announce.combat.calledShot";
            task.addModifier(new TaskRollModifier(announce, modValue, addition))
        }
        if (inMelee) {
            if (weaponTraits.automatedEffects.long){
                gunsMod -= 30;
                modValue = -30
            }
            else{
                gunsMod -= 10;
                modValue = -10
            }
            announce = "ep2e.roll.announce.combat.ranged.inMelee";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (coverAttacker) {
            gunsMod -= 10;
            modValue = -10
            announce = "ep2e.roll.announce.combat.ranged.coverAttacker";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (aim === "quick") {
            gunsMod += 10;
            modValue = 10
            announce = "ep2e.roll.announce.combat.ranged.aimQuick";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (aim === "long") {
            gunsMod += 30;
            modValue = 30
            announce = "ep2e.roll.announce.combat.ranged.aimLong";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (size === "xs") {
            gunsMod -= 30;
            modValue = -30
            announce = "ep2e.roll.announce.combat.ranged.sizeXS";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (size === "s") {
            gunsMod -= 10;
            modValue = -10
            announce = "ep2e.roll.announce.combat.ranged.sizeS";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (size === "l") {
            gunsMod += 10;
            modValue = 10
            announce = "ep2e.roll.announce.combat.ranged.sizeL";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (size === "xl") {
            gunsMod += 30;
            modValue = 30
            announce = "ep2e.roll.announce.combat.ranged.sizeXL";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (range === "range" && prone) {
            gunsMod -= 20;
            modValue = -20
            announce = "ep2e.roll.announce.combat.ranged.rangeProne";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (range === "beyond" && prone) {
            gunsMod -= 30;
            modValue = -30
            announce = "ep2e.roll.announce.combat.ranged.beyondProne";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (range === "beyond+" && prone) {
            gunsMod -= 40;
            modValue = -40
            announce = "ep2e.roll.announce.combat.ranged.beyondPlusProne";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (range === "range") {
            gunsMod -= 10;
            modValue = -10
            announce = "ep2e.roll.announce.combat.ranged.range";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (range === "beyond") {
            gunsMod -= 20;
            modValue = -20
            announce = "ep2e.roll.announce.combat.ranged.beyond";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (range === "beyond+") {
            gunsMod -= 30;
            modValue = -30
            announce = "ep2e.roll.announce.combat.ranged.beyondPlus";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (range === "pointBlank" || range === "pointBlank" && prone){
            if (!weaponTraits.automatedEffects.long){
                gunsMod += 10;
                modValue = 10
                announce = "ep2e.roll.announce.combat.ranged.pointBlank";
                task.addModifier(new TaskRollModifier(announce, modValue))
            }
        }

        if (coverDefender === "minor") {
            gunsMod -= 10;
            modValue = -10
            announce = "ep2e.roll.announce.combat.ranged.defMinCover";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (coverDefender === "moderate") {
            gunsMod -= 20;
            modValue = -20
            announce = "ep2e.roll.announce.combat.ranged.defModCover";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (coverDefender === "major") {
            gunsMod -= 30;
            modValue = -30
            announce = "ep2e.roll.announce.combat.ranged.defMajCover";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (visualImpairment === "minor") {
            gunsMod -= 10;
            modValue = -10
            announce = "ep2e.roll.announce.combat.ranged.visImpMin";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (visualImpairment === "major") {
            gunsMod -= 20;
            modValue = -20
            announce = "ep2e.roll.announce.combat.ranged.visImpMaj";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (visualImpairment === "blind") {
            gunsMod -= 30;
            modValue = -30
            announce = "ep2e.roll.announce.combat.ranged.blind";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (visualImpairment === "indirect" && ammoEffect != "ignoreIndirect") {
            gunsMod -= 20;
            modValue = -20
            announce = "ep2e.roll.announce.combat.ranged.indirect";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (attackMode === "wBurst") {
            gunsMod += 10;
            modValue = 10
            announce = "ep2e.roll.announce.combat.ranged.wBurst";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
        else if (attackMode === "wFullAuto") {
            gunsMod += 30;
            modValue = 30
            announce = "ep2e.roll.announce.combat.ranged.wFullAuto";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (ammoEffect === "ammoSkillModifier"){
            gunsMod += 10;
            modValue = 10
            announce = "ep2e.roll.announce.combat.ranged.ammoSkillModifier";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (rolledFrom === "rangedWeapon"){
            if (!weaponFixated && weaponTraits.confirmationEffects.fixed){
                gunsMod -= 20;
                modValue = -20
                announce = "ep2e.roll.announce.combat.ranged.weaponFixated";
                task.addModifier(new TaskRollModifier(announce, modValue))
            }
        }
    }

    //console.log("this is my task: ", task)
    
    //General roll modifications
    let curratedWounds = 10 * (Number(actorData.physical.wounds) + eval(actorData.mods.woundMod) + (actorData.mods.woundChiMod ? (eval(actorData.mods.woundChiMod)*actorData.mods.psiMultiplier) : 0))*eval(actorData.mods.woundMultiplier);
    let curratedTrauma = 10 * (Number(actorData.mental.trauma) + eval(actorData.mods.traumaMod) + (actorData.mods.traumaChiMod ? (eval(actorData.mods.traumaChiMod)*actorData.mods.psiMultiplier) : 0));
    
    if (curratedWounds > 0) {
        woundsMod += curratedWounds
    }
    if (curratedTrauma > 0) {
        woundsMod += curratedTrauma
    }
 
    let woundsTotal = null;
    let totalEncumberance = actorData.physical.armorMalusTotal + actorData.physical.totalGearMalus + actorData.physical.totalWeaponMalus
    if (actorType != "character"){
        totalEncumberance = 0
    }
    let rollMod = null;
    let specMod = 0;
    let poolMod = 0;
        //Prevents wounds from being added to aptitudes
        /*if (rollType === "aptitude"){
            rollMod = Number(globalMod);
        }
        else {
            woundsTotal = woundsMod;
            rollMod = Number(globalMod) - Number(woundsTotal);
        }*/

        woundsTotal = woundsMod;
        rollMod = Number(globalMod) - Number(woundsTotal);

        //Checks if spec used
        if (useSpecialization){
            specMod = 10;
            task._name += "(" + specName + ")"
            announce = "ep2e.roll.announce.specialization"
            task.addModifier(new TaskRollModifier(announce, specMod))
        }

        //Checks if pool used
        if (usePool || useThreat || useFlex){
            poolMod = 20;
            poolValue -= 1*numberOfTargets;
            flexValue -= 1*numberOfTargets;
            poolUpdate = usePool || useThreat ? poolValue : flexValue;
            let poolUsed = usePool || useThreat ? poolType : "Flex";
            //Determine pool to be updated
            await poolUpdater(poolUpdate,poolUsed);
            task.addModifier(new TaskRollModifier(poolUsed, poolMod))
        }
        
        if (globalMod){
            modValue = globalMod;
            announce = "ep2e.roll.announce.global"
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (totalEncumberance){
            modValue = -(totalEncumberance);
            announce = "ep2e.roll.announce.encumberance"
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (woundsTotal){
            modValue = -(woundsTotal);
            announce = "ep2e.roll.announce.wounds"
            task.addModifier(new TaskRollModifier(announce, modValue))
        }

        if (skillKey === "psi" && actorWhole.type != "goon"){
            if (ignoreInfection && poolValue>0){
                poolUpdate = poolValue -1;
                poolValue--;
                await poolUpdater(poolUpdate,poolType);
            }
            else{
                ignoreInfection = false;
            }
            infectionMod = aspectPushed != "none" ? aspectBase * 2 : aspectBase;
            infectionMod += Number(actorData.psiStrain.infection)
                if (infectionMod <= 100){
                    actorWhole.update({"system.psiStrain.infection" : infectionMod});
                }
                else {
                    actorWhole.update({"system.psiStrain.infection" : 100});
                    infectionMod = 100;
                }
        }

    modValue = rollMod + Number(gunsMod) + Number(meleeMod) + specMod + poolMod - totalEncumberance;
    let modSkillValue = (Number(skillValue) + Number(modValue))>0 ? Number(skillValue) + Number(modValue) : 0;

    //The dice roll
    for (i = numberOfTargets; i > 0; i--) {
        let roll = await new Roll(rollFormula).evaluate({async: true});

        //Success check
        let rollCheck = roll.total;

        let rollResult = await successCheck(rollCheck, modSkillValue)

        success = rollResult["success"]
        critical = rollResult["critical"]
        autoSuccess = rollResult["autoSuccess"]
        autoFail = rollResult["autoFail"]
        doubleSuperior = rollResult["doubleSuperior"]
        superior = rollResult["superior"]

        //Success messages
        let successContent = await successTranslation(success,critical,autoSuccess,autoFail,doubleSuperior,superior)

        successMessage = successContent["successMessage"];
        successClass = successContent["successClass"];
        successName = successContent["successName"];

        //Visibility toggler
        if (activeRollTarget === "" || activeRollTarget === "public") {
            rollModeSelection = CONST.DICE_ROLL_MODES.PUBLIC
        } else if (activeRollTarget === "private") {
            rollModeSelection = CONST.DICE_ROLL_MODES.PRIVATE
        } else if (activeRollTarget === "blind") {
            rollModeSelection = CONST.DICE_ROLL_MODES.BLIND
        }

        //Chat message builder

        let message = {}

        message.isGM = game.user.isGM
        message.rolledFrom = rolledFrom ? rolledFrom : null;
    
        message.resultText = successMessage;
        message.resultClass = successClass;
    
        message.taskName = specMod? task._taskName + " (" + specName + ")": task._taskName;
        message.taskValue = Number(task._baseValue);
        message.modValue = Number(modValue);
        message.targetNumber = modSkillValue;

        message.visibility = activeRollTarget;

        message.sleightName = sleightName ? sleightName : null;
        message.sleightDescription = sleightDescription ? sleightDescription : null;
        message.sleightDuration = sleightDuration ? sleightDuration : null;
        message.sleightAction = sleightAction ? sleightAction : null;
        message.sleightInfection = sleightInfection ? sleightInfection : null;
        message.infection = infectionMod ? infectionMod : null;
    
        message.modifiers = []
        if(task._modifiers.length > 0) {
            for(let mod of task._modifiers) {
                message.modifiers.push({text: mod.text, value: mod.formattedValue, comment: mod.comment})
            }
        }

        let html = await renderTemplate(TASK_RESULT_OUTPUT, message)

        //For default skill roll
        if (rolledFrom != "rangedWeapon" && rolledFrom != "ccWeapon") {
            msg = await roll.toMessage({
                speaker: ChatMessage.getSpeaker({actor: this.actor}),
                flavor: html
            },{
                rollMode: rollModeSelection
            });

            if (game.dice3d){
                await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
            }

            let evaluatedRoll = msg.content;
            let swipSwap = 0;
            let swapPossible = false;
            let severeConsequences = false;
            let severityLevel = null;
            let severityFlavor = null;

            if (evaluatedRoll < 100) {
                
                let swapPreparationData = await swapPreparator(evaluatedRoll, modSkillValue, successType, swapPossible, severeConsequences, severityLevel, severityFlavor, swipSwap, successName, poolValue, flexValue);

                swapPossible = swapPreparationData["swapPossible"]
                severeConsequences = swapPreparationData["severeConsequences"]
                severityLevel = swapPreparationData["severityLevel"]
                severityFlavor = swapPreparationData["severityFlavor"]
                swipSwap = swapPreparationData["swipSwap"]

            }

            let combinedPools = poolValue+flexValue;
            
            if (!successType && swapPossible && combinedPools > 0){
                let checkOptions = await GetSwipSwapOptions(swipSwap, poolValue, actorType, poolType, flexValue, successMessage, swapPossible, severityFlavor);

                if (checkOptions.cancelled) {
                    return;
                }
                
                usedSwipSwap = checkOptions.swap;

                if (usedSwipSwap === "pool" || usedSwipSwap === "flex"){

                    let swapCheckData = await swapChecker(successType, swapPossible, swipSwap, successMessage, poolValue, flexValue, actorType, poolType, usedSwipSwap, rollModeSelection);

                    successType = swapCheckData["successName"];
                    swapPossible = swapCheckData["swapPossible"];
                    successMessage = swapCheckData["successMessage"];
                    successName = swapCheckData["successName"];
                    flexValue = swapCheckData["flexValue"];
                    poolValue = swapCheckData["poolValue"];
                    usedSwipSwap = swapCheckData["usedPoolType"];

                } 
            }

            if (severeConsequences && severityLevel > 0 && combinedPools > 0){
                let checkOptions = await GetSwipSwapOptions(swipSwap, poolValue, actorType, poolType, flexValue, successMessage, swapPossible, severityFlavor);

                if (checkOptions.cancelled) {
                    return;
                }
                
                usedMitigate = checkOptions.mitigate;

            }

            if (usedMitigate === "pool" || usedMitigate === "flex"){

                let mitigationCheckData = await mitigationChecker(poolType, flexValue, severityLevel, actorType, usedMitigate);

                flexValue = mitigationCheckData["flexValue"];
                poolValue = mitigationCheckData["poolValue"];

            }

            let potentialRaise = false;

            if (successType){
                switch (successName) {
                    case 'Success':
                        potentialRaise = true;
                        break;
                    case 'Greater Success':
                        potentialRaise = true;
                        break;
                    case 'Critical Success':
                        potentialRaise = true;
                        break;
                    case 'Greater Critical Success':
                        potentialRaise = true;
                        break;
                    default:
                        break;
                }
            }

            usedSwipSwap = false;

            let poolRAM = poolType;
            
            if (successType &&  poolValue > 0 && potentialRaise || successType &&  poolValue > 0 && swapPossible || successType &&  flexValue > 0 && potentialRaise || successType &&  flexValue > 0 && swapPossible){
                
                let checkOptions = await GetRaiseOptions(successMessage, swipSwap, swapPossible, potentialRaise, poolValue, flexValue, actorType, poolType);

                if (checkOptions.cancelled) {
                    return;
                }
                usedRaise = checkOptions.raise;
                usedFlexRaise = checkOptions.flexRaise;
                usedSwipSwap = checkOptions.swap;
            }

            if(usedSwipSwap === "pool" || usedSwipSwap === "flex"){

                if (swipSwap > 33){
                    successName = "Greater Success";
                    successMessage = await successLabel("greatSuc");
                    success = true;
                    superior = true;
                }
                if (swipSwap > 66){
                    successName = "Superior Success";
                    successMessage = await successLabel("supSuc");
                    success = true;
                    doubleSuperior = true;
                }

                poolValue--;
                poolUpdate = poolValue;
                
                if (usedSwipSwap === "flex"){
                    poolType = "Flex";
                    poolValue++;
                    flexValue--;
                    poolUpdate = flexValue;
                }

                message = {}
    
                message.resultText = successMessage;
                
                message.type = "usedSwipSwap";
                message.poolName = await poolName(poolType);
                message.swipSwap = swipSwap;

                html = await renderTemplate(POOL_USAGE_OUTPUT, message)

                if (rollModeSelection === "gmroll"){
                    ChatMessage.create({
                        content: html,
                        whisper: ChatMessage.getWhisperRecipients("GM")
                      });
                }
                else {
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        flavor: html
                    })
                }

                poolUpdater(poolUpdate, poolType)

            }

            if (rollModeSelection === "gmroll"){

                  if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success" || usedFlexRaise && flexValue && successName != "Superior Success" && successName != "Superior Critical Success"){

                    switch (successName){
                        case 'Success':
                            successName = "Greater Success";
                            successMessage = await successLabel("greatSuc");
                            superior = true;
                            break;
                        case 'Greater Success':
                            successName = "Superior Success";
                            successMessage = await successLabel("supSuc");
                            doubleSuperior = true;
                            break;
                        case 'Critical Success':
                            successName = "Greater Critical Success";
                            successMessage = await successLabel("greatCritSuc");
                            superior = true;
                            break;
                        case 'Greater Critical Success':
                            successName = "Superior Critical Success";
                            successMessage = await successLabel("supCritSuc");
                            doubleSuperior = true;
                            break;
                    }
    
                    poolType = poolRAM;
                    
                    poolUpdate = usedRaise ? poolValue-1 : flexValue-1;
                    let poolUsed = usedRaise ? poolType : "Flex";

                    message = {}
        
                    message.resultText = successMessage;
                    
                    message.type = "usedRaise";
                    message.poolName = await poolName(poolUsed);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    
                    ChatMessage.create({
                        content: html,
                        whisper: ChatMessage.getWhisperRecipients("GM")
                    });

                    poolUpdater(poolUpdate, poolUsed)
                }
    
                else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){

                    message = {}
                    
                    message.type = "beyondSuperior";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: html,
                        whisper: [game.user._id]
                    })
                }
    
                else if (usedRaise && !poolValue){

                    message = {}
                    
                    message.type = "cantRaise";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: html,
                        whisper: [game.user._id]
                    })
                }
            }
            else {
                if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success" || usedFlexRaise && flexValue && successName != "Superior Success" && successName != "Superior Critical Success"){

                    switch (successName){
                        case 'Success':
                            successName = "Greater Success";
                            successMessage = await successLabel("greatSuc");
                            superior = true;
                            break;
                        case 'Greater Success':
                            successName = "Superior Success";
                            successMessage = await successLabel("supSuc");
                            doubleSuperior = true;
                            break;
                        case 'Critical Success':
                            successName = "Greater Critical Success";
                            successMessage = await successLabel("greatCritSuc");
                            superior = true;
                            break;
                        case 'Greater Critical Success':
                            successName = "Superior Critical Success";
                            successMessage = await successLabel("supCritSuc");
                            doubleSuperior = true;
                            break;
                    }
    
                    poolType = poolRAM;

                    poolUpdate = usedRaise ? poolValue-1 : flexValue-1;
                    let poolUsed = usedRaise ? poolType : "Flex";

                    message = {}
        
                    message.resultText = successMessage;
                    
                    message.type = "usedRaise";
                    message.poolName = await poolName(poolUsed);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        flavor: html
                    })

                    poolUpdater(poolUpdate, poolUsed)
                }
    
                else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){

                    message = {}
                    
                    message.type = "beyondSuperior";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: html,
                        whisper: [game.user._id]
                    })
                }
    
                else if (usedRaise && !poolValue){

                    message = {}
                    
                    message.type = "cantRaise";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: html,
                        whisper: [game.user._id]
                    })
                }
            }

            

        //Infection (only relevant for psi checks)
        if (skillKey === "psi" && !ignoreInfection && actorWhole.type != "goon"){

            let stressDamageRoll = null;
            let physicalDamageRoll = null;
            let durUpdate = actorWhole.system.health.physical.value;
            let woundUpdate = actorWhole.system.physical.wounds;
            let death = actorWhole.system.health.death.max + actorWhole.system.health.physical.max
            let woundThreshold = actorWhole.system.physical.wt
            let traumaThreshold = actorWhole.system.mental.tt
            let stressUpdate = actorWhole.system.health.mental.value;
            let traumaUpdate = actorWhole.system.mental.trauma;
            let insanity = actorWhole.system.health.insanity.max + actorWhole.system.health.mental.max
            let d6 = {total: null};

            //Success check of the virus
            let infectionRoll = await new Roll(rollFormula).evaluate({async: true});
            let rollCheck = infectionRoll.total;

            let rollResult = await successCheck(rollCheck, infectionMod)

            success = rollResult["success"]
            critical = rollResult["critical"]
            autoSuccess = rollResult["autoSuccess"]
            autoFail = rollResult["autoFail"]
            doubleSuperior = rollResult["doubleSuperior"]
            superior = rollResult["superior"]

            //Success messages
            let successContent = await successTranslation(success,critical,autoSuccess,autoFail,doubleSuperior,superior)

            successMessage = successContent["successMessage"];
            successClass = successContent["successClass"];
            successName = successContent["successName"];

            if (successClass === "fail"){
                successClass = "success"
            }
            else {
                successClass = "fail"
            }

            let message = {}
            
            message.resultText = successMessage;
            message.resultClass = successClass;
        
            message.targetNumber = infectionMod;

            message.visibility = activeRollTarget;

            let html = await renderTemplate(TASK_RESULT_OUTPUT, message)
            let alias = game.i18n.localize("ep2e.roll.dialog.push.infectionTries");


            //Viruses Skill check printed to the chat
            msg = await infectionRoll.toMessage({
                speaker: ChatMessage.getSpeaker({alias: alias}),
                flavor: html
            },{
                rollMode: rollModeSelection
            });

            if (game.dice3d){
                await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
            }

            //Effect in case virus was successful
            if(success || autoSuccess){
                let virusMod = "";
                if(success && !superior && !doubleSuperior && !critical && !autoSuccess){
                    virusMod = "";
                }
                else if(success && superior && !doubleSuperior && !critical && !autoSuccess){
                    virusMod = " + 1"
                }
                else {
                    virusMod = " + 2"
                }

                rollFormula = "1d6"

                d6 = await new Roll(rollFormula+virusMod).evaluate({async: true});

                let message = {};
                let result = d6.total > 6 ? 6 : d6.total;
                let psiLabel = "";
                let psiCopy = "";

                if(actorData.subStrain.label != "custom"){
                    if(result === 1){
                        message.influenceLabel = "ep2e.psi.effect.physicalDamage";
                        message.influenceCopy = "ep2e.psi.effect.takeDamage";
                    }
                    else if (result > 1 && result <=3) {   
                        psiLabel = eval("actorData.subStrain.influence" + result + ".label");
                        psiCopy = eval("actorData.subStrain.influence" + result + ".description");
                        if(psiLabel === "restrictedBehaviour" && actorData.subStrain.label != "architect"){
                            message.influenceLabel = eval("eclipsephase.psiStrainLabels." + psiLabel);
                            message.influenceCopy = "ep2e.psi.effect.restrictedBehaviour.relaxation";
                        }
                        else if(psiLabel === "restrictedBehaviour" && actorData.subStrain.label != "haunter"){
                            message.influenceLabel = eval("eclipsephase.psiStrainLabels." + psiLabel);
                            message.influenceCopy = "ep2e.psi.effect.restrictedBehaviour.empathy";
                        }
                        else if(actorData.subStrain.label != "xenomorph"){
                            message.influenceLabel = eval("eclipsephase.psiStrainLabels.enhancedBehaviour");
                            message.influenceCopy = "ep2e.psi.effect." + psiLabel + "." + psiCopy; 
                        }
                        else {
                            message.influenceLabel = eval("eclipsephase.psiStrainLabels." + psiLabel);
                            message.influenceCopy = "ep2e.psi.effect." + psiLabel + "." + psiCopy; 
                        }
                    }
                    else if (result > 3 && actorData.subStrain.label != "beast" && actorData.subStrain.label != "haunter") {
                        psiCopy = eval("actorData.subStrain.influence" + result + ".description");
                        message.influenceLabel = "ep2e.psi.effect.motivation.label";
                        message.influenceCopy = "ep2e.psi.effect.motivation." + psiCopy;
                    }
                    else if (result > 3 && result <=5){
                        psiCopy = eval("actorData.subStrain.influence" + result + ".description");
                        message.influenceLabel = "ep2e.psi.effect.motivation.label";
                        message.influenceCopy = "ep2e.psi.effect.motivation." + psiCopy;
                    }
                    else if (result === 6 && actorData.subStrain.label === "beast"){
                        message.influenceCopy = "ep2e.psi.effect.frenzy"
                    }
                    else if (result === 6 && actorData.subStrain.label === "haunter"){
                        message.influenceCopy = "ep2e.psi.effect.hallucination"
                    }
                }
                else{   
                    message.influenceLabel = eclipsephase.psiCustomLabels + "." + actorData.strainInfluence.influence + result + ".label";
                    message.influenceCopy = actorData.strainInfluence.influence + result + ".description";
                }

                let html = await renderTemplate(PSI_INFLUENCE_OUTPUT, message)
                let alias = game.i18n.localize("ep2e.roll.dialog.push.infectionInfluence");

                msg = await d6.toMessage({
                    speaker: ChatMessage.getSpeaker({alias: alias}),
                    flavor: html
                },{
                    rollMode: rollModeSelection
                });
    
                if (game.dice3d){
                    await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
                }
            }
            
            if (aspectPushed != "none" && d6.total === 1){
                physicalDamageRoll += "2d6";
            }
            else if (d6.total === 1 || aspectPushed != "none"){
                physicalDamageRoll = "1d6";
            }

            if (physicalDamageRoll && actorWhole.type === "character"){
                
                let physicalDamage = await new Roll(physicalDamageRoll).evaluate({async: true});
                let alias = game.i18n.localize("ep2e.roll.dialog.push.infectionDamage");

                msg = await physicalDamage.toMessage({
                    speaker: ChatMessage.getSpeaker({alias: alias})
                },{
                    rollMode: rollModeSelection
                });
    
                if (game.dice3d){
                    await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
                }
    
                durUpdate += physicalDamage.total;
    
                if (physicalDamage.total >= woundThreshold){
                    woundUpdate += Math.floor(physicalDamage.total/woundThreshold);
                }

                if (durUpdate > death){
                    durUpdate = death
                }
    
                actorWhole.update({"system.health.physical.value" : durUpdate, "system.physical.wounds" : woundUpdate})
            }
        }
    }

        //For roll from Weapon
        else if (rolledFrom === "rangedWeapon" || rolledFrom === "ccWeapon") {
            let modeDamage = "";
            let multiShot = Number(weaponTraits.additionalEffects.multiShot ? weaponTraits.additionalEffects.multiShot.number : 1)
            if (attackMode === "single") {
                updateAmmo = currentAmmo - (1 * multiShot);
            }
            else if (attackMode === "burst") {
                modeDamage = "+ 1d10";
                updateAmmo = currentAmmo - (3 * multiShot);
            }
            else if (attackMode === "fullAuto"){
                modeDamage = "+ 2d10";
                updateAmmo = currentAmmo - (10 * multiShot);
            }
            else if (attackMode === "wBurst") {
                modeDamage = "";
                updateAmmo = currentAmmo - (3 * multiShot);
            }
            else if (attackMode === "wFullAuto") {
                modeDamage = "";
                updateAmmo = currentAmmo - (10 * multiShot);
            }
            else if (attackMode === "suppressive") {
                modeDamage = "";
                updateAmmo = currentAmmo - (20 * multiShot);
            }
            else if (attackMode === "charge") {
                modeDamage = "+ 1d6";
            }
            else if (attackMode === "aggressive") {
                modeDamage = "+ 1d10";
            }
            else if (attackMode === "aggressiveCharge") {
                modeDamage = "+ 1d10";
            }
            else {
                modeDamage = "";
            }
            //Rolls only if the weapon has enough amunition & updates the ammo accordingly
            if (updateAmmo>=0){
                msg = await roll.toMessage({
                    speaker: ChatMessage.getSpeaker({actor: this.actor}),
                    flavor: html
                },{
                    rollMode: rollModeSelection
                });

                ammoUpdate.push({
                    "_id" : weaponID,
                    "system.ammoMin": updateAmmo
                });
        
                //This updates the items ammunition
                actorWhole.updateEmbeddedDocuments("Item", ammoUpdate);

                if (game.dice3d){
                    await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
                }

                let evaluatedRoll = msg.content;
                let swipSwap = 0;
                let swapPossible = false;
                let severeConsequences = false;
                let severityLevel = null;
                let severityFlavor = null;

                if (evaluatedRoll < 100) {
                    
                    let swapPreparationData = await swapPreparator(evaluatedRoll, modSkillValue, successType, swapPossible, severeConsequences, severityLevel, severityFlavor, swipSwap, successName, poolValue, flexValue);

                    swapPossible = swapPreparationData["swapPossible"]
                    severeConsequences = swapPreparationData["severeConsequences"]
                    severityLevel = swapPreparationData["severityLevel"]
                    severityFlavor = swapPreparationData["severityFlavor"]
                    swipSwap = swapPreparationData["swipSwap"]

                }

                let criticalModifier = null;
                let successModifier = null;
                let potentialRaise = false;
                let combinedPools = poolValue+flexValue;

                //SwipSwap Failed Rolls
                if (!successType && swapPossible && combinedPools > 0){
                    let checkOptions = await GetSwipSwapOptions(swipSwap, poolValue, actorType, poolType, flexValue, successMessage, swapPossible, severityFlavor);
    
                    if (checkOptions.cancelled) {
                        return;
                    }
                    
                    usedSwipSwap = checkOptions.swap;

                    if (usedSwipSwap === "pool" || usedSwipSwap === "flex"){

                        let swapCheckData = await swapChecker(successType, swapPossible, swipSwap, successMessage, poolValue, flexValue, actorType, poolType, usedSwipSwap, rollModeSelection);

                        successType = swapCheckData["successName"];
                        swapPossible = swapCheckData["swapPossible"];
                        successMessage = swapCheckData["successMessage"];
                        successName = swapCheckData["successName"];
                        flexValue = swapCheckData["flexValue"];
                        poolValue = swapCheckData["poolValue"];
                        usedSwipSwap = swapCheckData["usedPoolType"];
                    } 
                }

                //Mitigate Failed Rolls
                if (severeConsequences && severityLevel > 0 && combinedPools > 0){
                    let checkOptions = await GetSwipSwapOptions(swipSwap, poolValue, actorType, poolType, flexValue, successMessage, swapPossible, severityFlavor);
    
                    if (checkOptions.cancelled) {
                        return;
                    }
                    
                    usedMitigate = checkOptions.mitigate;
                    
                }

                //Show Mitigation Results
                if (usedMitigate === "pool" || usedMitigate === "flex"){

                    let mitigationCheckData = await mitigationChecker(poolType, flexValue, severityLevel, actorType, usedMitigate);

                    flexValue = mitigationCheckData["flexValue"];
                    poolValue = mitigationCheckData["poolValue"];
                    severityLevel = mitigationCheckData["newSeverityLevel"]

                }

                //Fragile weapons break / Single use weapons get deleted
                if(weaponTraits.automatedEffects.fragile && !successType && severityLevel){
                    actorWhole.deleteEmbeddedDocuments("Item", [weaponID])
                    message = {}
                    message.type = "weaponBreak";
                    message.weaponName = weaponName;
                    message.copy = "ep2e.roll.announce.combat.breakWeapon"

                    html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: html
                    })
                }
                else if (weaponTraits.automatedEffects.singleUse){
                    actorWhole.deleteEmbeddedDocuments("Item", [weaponID])
                    message = {}
                    message.type = "weaponBreak";
                    message.weaponName = weaponName;
                    message.copy = "ep2e.roll.announce.combat.singleUse"

                    html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: html,
                        whisper: [game.user._id]
                    })
                }

                //If test succeeded
                if(successType){
                    switch (successName) {
                        case 'Greater Success':
                            successModifier = "+ 1d6";
                            potentialRaise = true;
                            break;
                        case 'greatSuc' :
                            successModifier = "+ 1d6";
                            potentialRaise = true;
                            break;
                        case 'Superior Success':
                            successModifier = "+ 2d6";
                            break;
                        case 'supSuc':
                            successModifier = "+ 2d6";
                            break;
                        case 'Critical Success':
                            criticalModifier = "2 * (";
                            successModifier = ")";
                            potentialRaise = true;
                            break;
                        case 'Greater Critical Success':
                            criticalModifier = "2 * (";
                            successModifier = "+ 1d6)";
                            potentialRaise = true;
                            break;
                        case 'Superior Critical Success':
                            criticalModifier = "2 * (";
                            successModifier = "+ 2d6)";
                            break;
                        case 'Supreme Success':
                            criticalModifier = "2 * (";
                            successModifier = "+ 2d6)";
                            break;
                        default:
                            successModifier = "";
                            potentialRaise = true;
                            break;
                    }

                    //Weapon damage dialog
                    if (weaponType === "ranged" && swapPossible || weaponType === "ranged" && potentialRaise || weaponType === "melee" && swapPossible || weaponType === "melee" && potentialRaise){
                        let checkOptions = await GetDamageOptions(weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successMessage, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, weaponTraits.automatedEffects, meleeDamageMod, biomorphTarget);
    
                        if (checkOptions.cancelled) {
                            return;
                        }
                        usedRaise = checkOptions.raise;
                        usedSwipSwap = checkOptions.swap;
                    }
                }

                let poolRAM = poolType;
                if (usedSwipSwap === "pool" || usedSwipSwap === "flex") {
                    if (swipSwap > 33 && swipSwap < 66){
                        successModifier = "+ 1d6";
                        successName = "Greater Success";
                        successMessage = await successLabel("greatSuc");
                    }
                    if (swipSwap > 66){
                        successModifier = "+ 2d6";
                        successName = "Superior Success"
                        successMessage = await successLabel("supSuc");
                    }
                    poolValue--;
                    poolUpdate = poolValue;
                    
                    if (usedSwipSwap === "flex"){
                        poolType = "Flex";
                        poolValue++;
                        flexValue--;
                        poolUpdate = flexValue;
                    }

                    message = {}
        
                    message.resultText = successMessage;
                    
                    message.type = "usedSwipSwap";
                    message.poolName = await poolName(poolType);
                    message.swipSwap = swipSwap;
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        flavor: html
                    })

                    poolUpdater(poolUpdate, poolType)
                }

                poolType = poolRAM;

                if (rollModeSelection === "gmroll"){

                    if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success" || usedFlexRaise && flexValue && successName != "Superior Success" && successName != "Superior Critical Success"){
                        successModifier += "+ 1d6";
                        switch (successName) {
                            case 'Success':
                                successName = "Greater Success";
                                successMessage = await successLabel("greatSuc");
                                break;
                            case 'Greater Success':
                                successName = "Superior Success";
                                successMessage = await successLabel("supSuc");
                                break;
                            case 'Critical Success':
                                successName = "Greater Critical Success";
                                successMessage = await successLabel("greatCritSuc");
                                successModifier = "+ 1d6)";
                                break;
                            case 'Greater Critical Success':
                                successName = "Superior Critical Success";
                                successMessage = await successLabel("supCritSuc");
                                successModifier = "+ 2d6)";
                                break;
                            default:
                                break;
                        }
      
                      poolType = poolRAM;

                      poolUpdate = usedRaise ? poolValue-1 : flexValue-1;
                      let poolUsed = usedRaise ? poolType : "Flex";

                      message = {}
          
                      message.resultText = successMessage;
                      
                      message.type = "usedRaise";
                      message.poolName = await poolName(poolType);
      
                      html = await renderTemplate(POOL_USAGE_OUTPUT, message)

                      ChatMessage.create({
                          content: html,
                          whisper: ChatMessage.getWhisperRecipients("GM")
                      });

                      poolUpdater(poolUpdate, poolUsed)
                  }
      
                  else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){

                    message = {}
                    
                    message.type = "beyondSuperior";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          content: html,
                          whisper: [game.user._id]
                      })
                  }
      
                  else if (usedRaise && !poolValue){

                    message = {}
                    
                    message.type = "cantRaise";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          content: html,
                          whisper: [game.user._id]
                      })
                  }
              }
              else {
                  if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success" || usedFlexRaise && flexValue && successName != "Superior Success" && successName != "Superior Critical Success"){
                    successModifier += "+ 1d6";
                    switch (successName) {
                        case 'Success':
                            successName = "Greater Success";
                            successMessage = await successLabel("greatSuc");
                            break;
                        case 'Greater Success':
                            successName = "Superior Success";
                            successMessage = await successLabel("supSuc");
                            break;
                        case 'Critical Success':
                            successName = "Greater Critical Success";
                            successMessage = await successLabel("greatCritSuc");
                            successModifier = "+ 1d6)";
                            break;
                        case 'Greater Critical Success':
                            successName = "Superior Critical Success";
                            successMessage = await successLabel("supCritSuc");
                            successModifier = "+ 2d6)";
                            break;
                        default:
                            break;
                    }
      
                      poolType = poolRAM;
                      
                      poolUpdate = usedRaise ? poolValue-1 : flexValue-1;
                      let poolUsed = usedRaise ? poolType : "Flex";

                      message = {}
          
                      message.resultText = successMessage;
                      
                      message.type = "usedRaise";
                      message.poolName = await poolName(poolType);
      
                      html = await renderTemplate(POOL_USAGE_OUTPUT, message)
      
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          flavor: html
                      })

                      poolUpdater(poolUpdate, poolUsed)
                  }
      
                  else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){

                    message = {}
                    
                    message.type = "beyondSuperior";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          content: html,
                          whisper: [game.user._id]
                      })
                  }
      
                  else if (usedRaise && !poolValue){

                    message = {}
                    
                    message.type = "cantRaise";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          content: html,
                          whisper: [game.user._id]
                      })
                  }
              }
              
            //Damage Chat Message Constructor
            if(weaponDamage && successType){
                let intermediateRollFormula =  weaponDamage + modeDamage + (meleeDamageMod ? meleeDamageMod : "") + (biomorphTarget ? " + 1d6" : "") + successModifier;
                let rollFormula = null

                if (criticalModifier && !weaponTraits.automatedEffects.dvHalved) {
                    rollFormula = criticalModifier + (intermediateRollFormula);
                }
                else if (!criticalModifier && !weaponTraits.automatedEffects.dvHalved){
                    rollFormula = intermediateRollFormula;
                }
                else if (!criticalModifier && weaponTraits.automatedEffects.dvHalved){
                    rollFormula = "ceil((" + intermediateRollFormula + ")/2)";
                }
                else {
                    rollFormula = "ceil((" + criticalModifier + (intermediateRollFormula) + ")/2)";
                }
                
                //The message is built
                message = {}
                
                message.type = "damage";
                message.weaponName = weaponName;
                message.ammoLoadedName = rolledFrom === "rangedWeapon" ? weaponSelected.system.ammoSelected.name : null

                //Weapon traits are added
                message.weaponTraits = weaponTraits.additionalEffects;
                if (biomorphTarget){
                    message.weaponTraits["bioMorphsOnly"] = weaponTraits.confirmationEffects["bioMorphsOnly"]
                }

                //Weapon Traits object gets deleted, if it's empty
                if (!Object.keys(message.weaponTraits).length > 0){
                    delete message.weaponTraits
                }

                html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

                if (!weaponTraits.automatedEffects.noDamage && weaponDamage != "ep2e.item.weapon.table.noDamage"){
                    let roll = await new Roll(rollFormula).evaluate({async: true});
                    let label = html;
    
                    roll.toMessage({
                        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                        flavor: label
                    },{
                        rollMode: rollModeSelection
                    });
                }
                else {
                    html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: html
                    })
                }
            }
            else if (!successType && successName === "Fail" && weaponTraits.automatedEffects.dvOnMiss){
                let damageCalc = await damageValueCalc(null,  weaponTraits.automatedEffects.dvOnMiss.dv, null, "ammo")
                rollFormula = damageCalc.dv

                //The message is built
                message = {}
                                
                message.type = "damage";
                message.weaponName = weaponName;
                message.ammoLoadedName = rolledFrom === "rangedWeapon" ? weaponSelected.system.ammoSelected.name : null

                //Weapon traits are added
                message.weaponTraits = weaponTraits.additionalEffects
                message.weaponTraits["dvOnMiss"] = weaponTraits.automatedEffects["dvOnMiss"]
                message.weaponTraits.dvOnMiss["calculated"] = rollFormula

                html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

                let roll = await new Roll(rollFormula).evaluate({async: true});
                let label = html;

                roll.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    flavor: label
                },{
                    rollMode: rollModeSelection
                });
            }
                    
        }
            else {

                message = {}
                
                message.type = "reload";
                message.copy = "ep2e.roll.announce.combat.ranged.reloadNeeded";
                message.weaponName = weaponName;
                message.ammoLoadedName = rolledFrom === "rangedWeapon" ? weaponSelected.system.ammoSelected.name : null

                html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: this.actor}),
                    content: html,
                    whisper: [game.user._id]
                })
            }
        } 
    }

    //Success Check
    async function successCheck(rollCheck, modSkillValue){

        let success = rollCheck <= modSkillValue;
        let critical = rollCheck === 11 || rollCheck === 22 || rollCheck === 33 || rollCheck === 44 || rollCheck === 55 || rollCheck === 66 || rollCheck === 77 || rollCheck === 88;
        let autoSuccess = rollCheck === 100;
        let autoFail = rollCheck === 99;
        let doubleSuperior = rollCheck >= 66;
        let superior = rollCheck >= 33;

        return {success, critical, autoSuccess, autoFail, doubleSuperior, superior};
    }

    //Success Translation
    async function successTranslation(success,critical,autoSuccess,autoFail,doubleSuperior,superior){

        if (autoFail) {
            successMessage = await successLabel("autoFail");
            successClass = "fail";
            successName = "Supreme Fail";
        } else if (autoSuccess) {
            successMessage = await successLabel("autoSuccess");
            successClass = "success";
            successType = true;
            successName = "Supreme Success";
        } else if (success && critical && doubleSuperior) {
            successMessage = await successLabel("supCritSuc");
            successClass = "success";
            successType = true;
            successName = "Superior Critical Success";
        } else if (!success && critical && !superior) {
            successMessage = await successLabel("supCritFail");
            successClass = "fail";
            successName = "Superior Critical Fail";
        } else if (success && critical && superior) {
            successMessage = await successLabel("greatCritSuc");
            successClass = "success";
            successType = true;
            successName = "Greater Critical Success";
        } else if (!success && critical && !doubleSuperior) {
            successMessage = await successLabel("greatCritFail");
            successClass = "fail";
            successName = "Greater Critical Fail";
        } else if (success && critical) {
            successMessage = await successLabel("critSuc");
            successClass = "success";
            successType = true;
            successName = "Critical Success";
        } else if (!success && critical) {
            successMessage = await successLabel("critFail");
            successClass = "fail";
            successName = "Critical Fail";
        } else if (success && doubleSuperior) {
            successMessage = await successLabel("supSuc");
            successClass = "success";
            successType = true;
            successName = "Superior Success";
        } else if (!success && !superior) {
            successMessage = await successLabel("supFail");
            successClass = "fail";
            successName = "Superior Fail";
        } else if (success && superior) {
            successMessage = await successLabel("greatSuc");
            successClass = "success";
            successType = true;
            successName = "Greater Success";
        } else if (!success && !doubleSuperior) {
            successMessage = await successLabel("greatFail");
            successClass = "fail";
            successName = "Greater Fail";
        } else if (success) {
            successMessage = await successLabel("suc");
            successClass = "success";
            successType = true;
            successName = "Success";
        } else if (!success) {
            successMessage = await successLabel("fail");
            successClass = "fail";
            successName = "Fail";
        }

        return {successMessage, successClass, successName};
    }

    //SwipSwap Dice
    async function swapDice(str){
        if (str<10){
            return str + "0"
        }
        let first = str[0];
        let last = str[1];
        return last+first;
    }

    //Update Pools
    async function poolUpdater(poolUpdate, poolType){
        
        switch (poolType) {
            case 'Insight':
                return actorWhole.update({"system.pools.insight.value" : poolUpdate});
            case 'Vigor':
                return actorWhole.update({"system.pools.vigor.value" : poolUpdate});
            case 'Moxie':
                return actorWhole.update({"system.pools.moxie.value" : poolUpdate});
            case 'Threat':
                return actorWhole.update({"system.threatLevel.current" : poolUpdate});
            case 'Flex':
                return actorWhole.update({"system.pools.flex.value" : poolUpdate});
            default:
                break;
            }
    }

    //Swap Preparation
    async function swapPreparator(evaluatedRoll, modSkillValue, successType, swapPossible, severeConsequences, severityLevel, severityFlavor, swipSwap, successName, poolValue, flexValue){
        swipSwap = await swapDice(evaluatedRoll);
        if (swipSwap <= modSkillValue && swipSwap > evaluatedRoll && poolValue && successName != "Supreme Fail" || swipSwap <= modSkillValue && swipSwap > evaluatedRoll && flexValue && successName != "Supreme Fail") {
            swapPossible = true;
        }
        if (swipSwap <= modSkillValue && !successType && poolValue && successName != "Supreme Fail" || swipSwap <= modSkillValue && !successType && flexValue && successName != "Supreme Fail") {
            swapPossible = true;
        }
        /*To Be Continued 
        if (successName === "Greater Fail" && poolValue && swipSwap > modSkillValue && !successName.includes("Critical")|| successName === "Superior Fail" && flexValue && swipSwap > modSkillValue && !successName.includes("Critical")){
            console.log("*4* Bingo! This is a greater OR superior fail with a modSkillValue of ", evaluatedRoll, " and a swipSwap of ", swipSwap, " which would be a normal fail.")
            if (swipSwap > 66){
                swapPossible = true
                severeConsequences = true
                severityLevel = 0
                console.log("This means you can swap to a normal fail")
            }
            else if (swipSwap > 33 && swipSwap < 66){
                swapPossible = true
                severeConsequences = true
                severityLevel = 1
                console.log("This means you can ONLY swap to a Greater fail")
            }
        }
        */
        if (successName === "Supreme Fail" || swipSwap > modSkillValue && !successType && poolValue || swipSwap > modSkillValue && !successType && flexValue) {
            severeConsequences = true;
            swapPossible = false;
            switch (successName){
                case 'Fail':
                    severityLevel = 0;
                    break;
                case 'Greater Fail':
                    severityLevel = 1;
                    severityFlavor = "huge";
                    break;
                case 'Superior Fail':
                    severityLevel = 2;
                    severityFlavor = "severe";
                    break;
                default:
                    severityLevel = 3;
                    severityFlavor = "dire";
                    break;
            }
        }
        return {swapPossible, severeConsequences, severityLevel, severityFlavor, swipSwap}
    }

    //Roll Increase Check
    async function swapChecker(successType, swapPossible, swipSwap, successMessage, poolValue, flexValue, actorType, poolType, usedSwipSwap, rollModeSelection){
        successType = true;
        swapPossible = false;
        let usedPoolType = usedSwipSwap;
        if (swipSwap < 33){
            successMessage = "ep2e.roll.successType.success";
            successName = "suc"
        }
        if (swipSwap > 33 && swipSwap < 66){
            successMessage = "ep2e.roll.successType.greaterSuccess";
            successName = "greatSuc"
        }
        if (swipSwap > 66){
            successMessage = "ep2e.roll.successType.superiorSuccess";
            successName = "supSuc"
        }

        poolValue--;
        poolUpdate = poolValue;

        if (usedSwipSwap === "flex"){
            poolType = "Flex";
            poolValue++;
            flexValue--;
            poolUpdate = flexValue;
        }

        let message = {}
        
        message.resultText = successMessage;
        
        message.type = "usedSwipSwap";
        message.poolName = await poolName(poolType);
        message.swipSwap = swipSwap;

        let html = await renderTemplate(POOL_USAGE_OUTPUT, message);

        usedSwipSwap = null

        if (rollModeSelection === "gmroll"){
            ChatMessage.create({
                content: html,
                whisper: ChatMessage.getWhisperRecipients("GM")
              });
        }
        else {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker(),
                flavor: html
            })
        }

        poolUpdater(poolUpdate, poolType);
        return {successType, swapPossible, successMessage, successName, flexValue, poolValue, usedPoolType};
    }

    //Failure Mitigation Check
    async function mitigationChecker(poolType, flexValue, severityLevel, actorType, usedMitigate){
        let severityAfter = "";
        let newSeverityLevel = severityLevel - 1
        poolValue--;
        poolUpdate = poolValue;
        
        if (usedMitigate === "flex"){
            poolType = "Flex";
            poolValue++;
            flexValue--;
            poolUpdate = flexValue;
        }

        if (severityLevel === 1){
            severityAfter = "ep2e.roll.successType.failure"
        }
        if (severityLevel === 2){
            severityAfter = "ep2e.roll.successType.greaterFailure"
        }
        if (severityLevel === 3){
            severityAfter = "ep2e.roll.successType.superiorFailure"
        }

        let message = {}
        
        message.type = "mitigate";
        message.poolName = await poolName(poolType);
        message.severityNew = severityAfter;

        let html = await renderTemplate(POOL_USAGE_OUTPUT, message);


        if (rollModeSelection === "gmroll"){
            ChatMessage.create({
                content: html,
                whisper: ChatMessage.getWhisperRecipients("GM")
              });
        }
        else {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker(),
                flavor: html
            })
        }

        poolUpdater(poolUpdate, poolType)

        return [flexValue, poolValue, newSeverityLevel];
    }

    async function poolName(poolType){
        let poolName
        switch(poolType){
            case 'Insight':
                poolName = "ep2e.skills.insightSkills.poolHeadline";
                break;
            case 'Vigor':
                poolName = "ep2e.skills.vigorSkills.poolHeadline";
                break;
            case 'Moxie':
                poolName = "ep2e.skills.moxieSkills.poolHeadline";
                break;
            case 'Flex':
                poolName = "ep2e.skills.flex.poolHeadline";
                break;
            case 'Threat':
                poolName = "ep2e.healthbar.tooltip.threat";
                break;
        }

        return poolName;
    }

    async function successLabel(successName){
        let successLabel
        if (successName === "autoFail") {
            successLabel = "ep2e.roll.successType.supremeFailure";
        } else if (successName === "autoSuccess") {
            successLabel = "ep2e.roll.successType.supremeSuccess";
        } else if (successName === "supCritSuc") {
            successLabel = "ep2e.roll.successType.superiorCriticalSuccess";
        } else if (successName === "supCritFail") {
            successLabel = "ep2e.roll.successType.superiorCriticalFailure";
        } else if (successName === "greatCritSuc") {
            successLabel = "ep2e.roll.successType.greaterCriticalSuccess";
        } else if (successName === "greatCritFail") {
            successLabel = "ep2e.roll.successType.greaterCriticalFailure";
        } else if (successName === "critSuc") {
            successLabel = "ep2e.roll.successType.criticalSuccess";
        } else if (successName === "critFail") {
            successLabel = "ep2e.roll.successType.criticalFailure";
        } else if (successName === "supSuc") {
            successLabel = "ep2e.roll.successType.superiorSuccess";
        } else if (successName === "supFail") {
            successLabel = "ep2e.roll.successType.superiorFailure";
        } else if (successName === "greatSuc") {
            successLabel = "ep2e.roll.successType.greaterSuccess";
        } else if (successName === "greatFail") {
            successLabel = "ep2e.roll.successType.greaterFailure";
        } else if (successName === "suc") {
            successLabel = "ep2e.roll.successType.success";
        } else if (successName === "fail") {
            successLabel = "ep2e.roll.successType.failure";
        }

        return successLabel;
    }

    //Skill check dialog constructor
    async function GetTaskOptions(skillName, specName, poolType, poolValue, flexValue, actorType, taskType, sleightInfection, rolledFrom) {
        let dialogName = new Localizer ('ep2e.roll.dialog.title.talentCheck');
        let cancelButton = new Localizer ('ep2e.roll.dialog.button.cancel');
        let rollButton = new Localizer ('ep2e.roll.dialog.button.roll');
        const template = "systems/eclipsephase/templates/chat/skill-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, flexValue, actorType, taskType, sleightInfection, rolledFrom});

        return new Promise(resolve => {
            const data = {
                title: skillName[0].toUpperCase() + skillName.slice(1) + " " + dialogName.title,
                content: html,
                buttons: {
                    cancel: {
                        label: cancelButton.title,
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: rollButton.title,
                        callback: html => resolve(_proTaskCheckOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };
            let options = {width:276}
            new Dialog(data, options).render(true);
        });
    }

    //General skill check results
    function _proTaskCheckOptions(form) {
        return {
            ranged: form.RangedFray ? form.RangedFray.checked : false,
            aspects: form.AspectNumber ? (parseInt(form.AspectNumber.value)>0 ? parseInt(form.AspectNumber.value) : 0) : 0,
            pushes: form.Push ? form.Push.value : "none",
            ignoreInfection: form.IgnoreInfection ? form.IgnoreInfection.checked : false,
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            activeRollMode: form.RollMode.value,
            useSpecialization: form.useSpec ? form.useSpec.checked : false,
            usePool: form.usePool ? form.usePool.value != "on" ? form.usePool.value === "pool" ? true : false : form.usePool.checked : false,
            useFlex: form.useFlex ? form.useFlex.checked : form.usePool ? form.usePool.value != "on" ? form.usePool.value === "flex" ? true : false : false: false,
            useThreat: form.useThreat ? form.useThreat.checked : false
        }
    }

    //Skill check dialog constructor
    async function GetMeleeTaskOptions(specName, poolType, poolValue, flexValue, actorType, traits, rolledFrom) {
        let dialogName = new Localizer ('ep2e.roll.dialog.title.melee');
        let cancelButton = new Localizer ('ep2e.roll.dialog.button.cancel');
        let rollButton = new Localizer ('ep2e.roll.dialog.button.roll');
        const template = "systems/eclipsephase/templates/chat/melee-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, flexValue, actorType, traits, rolledFrom});

        return new Promise(resolve => {
            const data = {
                title: dialogName.title,
                content: html,
                buttons: {
                    cancel: {
                        label: cancelButton.title,
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: rollButton.title,
                        callback: html => resolve(_proMeleeCheckOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };
            let options = {width:536}
            new Dialog(data, options).render(true);
        });
    }

    //Melee skill check results
    function _proMeleeCheckOptions(form) {
        return {
            numberOfTargets: parseInt(form.NumberTargets.value)>0 ? parseInt(form.NumberTargets.value) : 1,
            attackMode: form.HitType.value,
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            activeRollMode: form.RollMode.value,
            useSpecialization: form.useSpec ? form.useSpec.checked : false,
            usePool: form.usePool ? form.usePool.value != "on" ? form.usePool.value === "pool" ? true : false : form.usePool.checked : false,
            useFlex: form.useFlex ? form.useFlex.checked : form.usePool ? form.usePool.value != "on" ? form.usePool.value === "flex" ? true : false : false: false,
            useThreat: form.useThreat ? form.useThreat.checked : false,
            calledShot: form.CalledShot.checked,
            sizeDifference: form.SizeDifference.value,
            touchOnly: form.TouchOnly ? form.TouchOnly.checked : false,
        }

    }

    //Guns check dialog constructor
    async function GetGunsTaskOptions(specName, poolType, poolValue, flexValue, actorType, traits, rolledFrom) {
        let specialEffects = null;
        if(rolledFrom === "rangedWeapon"){
            specialEffects = Object.keys(traits.confirmationEffects).length
        }
        let dialogName = new Localizer ('ep2e.roll.dialog.title.guns');
        let cancelButton = new Localizer ('ep2e.roll.dialog.button.cancel');
        let rollButton = new Localizer ('ep2e.roll.dialog.button.roll');
        const template = "systems/eclipsephase/templates/chat/gun-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, flexValue, actorType, traits, specialEffects});

        return new Promise(resolve => {
            const data = {
                title: dialogName.title,
                content: html,
                buttons: {
                    cancel: {
                        label: cancelButton.title,
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: rollButton.title,
                        callback: html => resolve(_proGunsTaskCheckOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };
            let options = {width:1086}
            new Dialog(data, options).render(true);
        });
    }

    //Guns skill check results
    function _proGunsTaskCheckOptions(form) {
        return {
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            activeRollMode: form.RollMode.value,
            aim: form.Aim.value,
            size: form.Size.value,
            range: form.Range ? form.Range.value : "none",
            coverDefender: form.TargetCover.value,
            coverAttacker: form.AttackerCover.checked,
            visualImpairment: form.VisualImpair.value,
            prone: form.DefenderProne.checked,
            attackMode: form.FiringMode.value,
            smartlink: form.Smartlink.checked,
            running: form.Running.checked,
            superiorPosition: form.SupPosition.checked,
            calledShot: form.CalledShot.checked,
            inMelee: form.Melee.checked,
            ammoEffect: form.AmmoEffect ? form.AmmoEffect.value : false,
            weaponFixated: form.WeaponFixated ? form.WeaponFixated.checked : false,
            biomorphTarget: form.BiomorphTarget ? form.BiomorphTarget.checked : false,
            useSpecialization: form.useSpec ? form.useSpec.checked : false,
            usePool: form.usePool ? form.usePool.value != "on" ? form.usePool.value === "pool" ? true : false : form.usePool.checked : false,
            useFlex: form.useFlex ? form.useFlex.checked : form.usePool ? form.usePool.value != "on" ? form.usePool.value === "flex" ? true : false : false: false,
            useThreat: form.useThreat ? form.useThreat.checked : false
        }

    }

    async function GetDamageOptions(weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, traits, meleeDamageMod, biomorphTarget) {
        let groupName = "useSwap";
        let choices = 0;
        if (poolValue && flexValue && swapPossible){
            choices = 1;
        }
        else if (!poolValue && flexValue && swapPossible){
            choices = 2;
        }
        else if (poolValue && !flexValue && swapPossible){
            choices = 3;
        }
        let dialogName = new Localizer ('ep2e.roll.dialog.title.damageRoll');
        let cancelButton = new Localizer ('ep2e.roll.dialog.button.cancel');
        let rollButton = new Localizer ('ep2e.roll.dialog.button.roll');
        const template = "systems/eclipsephase/templates/chat/damage-dialog.html";
        const html = await renderTemplate(template, {weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, traits, groupName, choices, meleeDamageMod, biomorphTarget});
        return new Promise(resolve => {
            const data = {
                title: weaponName[0].toUpperCase() + weaponName.slice(1) + " " + dialogName.title,
                content: html,
                buttons: {
                    cancel: {
                        label: cancelButton.title,
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: rollButton.title,
                        callback: html => resolve(_proDamageRollOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };
            let options = {width:276}
            new Dialog(data, options).render(true);
        });
    }
    function _proDamageRollOptions(form) {
        return {
            swap: form.useSwap ? form.useSwap.value : null,
            raise: form.useRaise ? form.useRaise.checked : false
        }
    }

    async function GetSwipSwapOptions(swipSwap, poolValue, actorType, poolType, flexValue, successMessage, swapPossible, severityFlavor) {
        
        let choices = 0;

        if (severityFlavor && poolValue && flexValue){
            choices = 1;
        }
        else if (severityFlavor && !poolValue && flexValue){
            choices = 2;
        }
        else if (severityFlavor && poolValue && !flexValue){
            choices = 3;
        }
        else if (poolValue && flexValue){
            choices = 1;
        }
        else if (!poolValue && flexValue){
            choices = 2;
        }
        else if (poolValue && !flexValue){
            choices = 3;
        }
        let dialogName = new Localizer ('ep2e.roll.dialog.title.swap');
        let useSelection = new Localizer ('ep2e.roll.dialog.button.useSelection');
        const template = "systems/eclipsephase/templates/chat/swap-dialog.html";
        const html = await renderTemplate(template, {swipSwap, poolValue, actorType, poolType, flexValue, successMessage, swapPossible, severityFlavor, choices});
        return new Promise(resolve => {
            const data = {
                title: dialogName.title,
                content: html,
                dv: weaponDamage,
                buttons: {
                    normal: {
                        label: useSelection.title,
                        callback: html => resolve(_proSwipSwapOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal"
            };
            let options = {width:276}
            new Dialog(data, options).render(true);
        });
    }

    function _proSwipSwapOptions(form) {
        return {
            swap: form.useSwap ? form.useSwap.value : null,
            mitigate: form.useMitigate ? form.useMitigate.value : null
        }
    }

    async function GetRaiseOptions(successMessage, swipSwap, swapPossible, potentialRaise, poolValue, flexValue, actorType, poolType) {

        let choices = 0;

        if (poolValue && flexValue && swapPossible){
            choices = 1;
        }
        else if (!poolValue && flexValue && swapPossible){
            choices = 2;
        }
        else if (poolValue && !flexValue && swapPossible){
            choices = 3;
        }

        let dialogName = new Localizer ('ep2e.roll.dialog.title.raise');
        let useSelection = new Localizer ('ep2e.roll.dialog.button.useSelection');
        const template = "systems/eclipsephase/templates/chat/raise-dialog.html";
        const html = await renderTemplate(template, {successMessage, swipSwap, swapPossible, potentialRaise, poolValue, flexValue, actorType, poolType, choices});
        return new Promise(resolve => {
            const data = {
                title: dialogName.title,
                content: html,
                buttons: {
                    normal: {
                        label: useSelection.title,
                        callback: html => resolve(_proRaiseOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal"
            };
            let options = {width:276}
            new Dialog(data, options).render(true);
        });
    }

    function _proRaiseOptions(form) {
        return {
            swap: form.useSwap ? form.useSwap.value : false,
            raise: form.useRaise ? form.useRaise.value != "on" ? form.useRaise.value === "pool" ? true : false : form.useRaise.checked : false,
            flexRaise: form.useFlexRaise ? form.useFlexRaise.checked : form.useRaise ? form.useRaise.value != "on" ? form.useRaise.value === "flex" ? true : false : false: false,
        }
    }
}
