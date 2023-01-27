/*
 * Path constants for dialog templates
 */
const REPUTATION_TASK_DIALOG = 'systems/eclipsephase/templates/chat/rep-test-dialog.html'
const TASK_RESULT_OUTPUT = 'systems/eclipsephase/templates/chat/task-result.html'
const POOL_USAGE_OUTPUT = 'systems/eclipsephase/templates/chat/pool-usage.html'
const WEAPON_DAMAGE_OUTPUT = 'systems/eclipsephase/templates/chat/damage-result.html'

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

    let wounds = 10*(parseInt(actorData.physical.wounds)+eval(actorData.mods.woundMod))*eval(actorData.mods.woundMultiplier)
    let trauma = 10*parseInt(actorData.mental.trauma)+eval(actorData.mods.traumaMod)

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
    const data = {
      title: title,
      content: html,
      buttons: {
        cancel: {
          label: 'Cancel',
          callback: (html) => resolve({cancelled: true})
        },
        normal: {
          label: 'Roll!',
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
    //Pools
    poolType = "",
    poolValue = 0,
    flexValue = 0,
    usePool = null,
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
    aspectPushes = null,
    aspectBase = null,
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
    gunsMod = 0,
    //Melee
    numberOfTargets = 1,
    meleeMod = 0,
    meleeDamageMod = null,
    //Weapon Data
    weaponName = null,
    weaponID = "",
    weaponDamage = "",
    weaponType = "",
    currentAmmo = "",
    updateAmmo = "",
    ammoUpdate = [],
    successType = false,
    attackMode=""
    } = {}) {

    //Task Roll created
    let task = new TaskRoll (skillName, skillValue);

    //Guns check dialog

    if (askForOptions != optionsSettings && skillKey === "guns") {
        let checkOptions = await GetGunsTaskOptions(specName, poolType, poolValue, actorType);

        if (checkOptions.cancelled) {
            return;
        }

        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
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
        useThreat = checkOptions.useThreat;
    }

    //Melee skill check dialog
    else if (askForOptions != optionsSettings && skillKey === "melee") {
        let checkOptions = await GetMeleeTaskOptions(specName, poolType, poolValue, actorType);

        if (checkOptions.cancelled) {
            return;
        }
        attackMode = checkOptions.attackMode;
        numberOfTargets = checkOptions.numberOfTargets;
        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        calledShot = checkOptions.calledShot;
        useSpecialization = checkOptions.useSpecialization;
        usePool = checkOptions.usePool;
        useThreat = checkOptions.useThreat;
    }

    //Default skill check dialog
    else if (askForOptions != optionsSettings) {
        let taskType = skillKey
        let checkOptions = await GetTaskOptions(skillName, specName, poolType, poolValue, actorType, taskType);

        if (checkOptions.cancelled) {
            return;
        }

        skillValue = checkOptions.ranged ? Math.floor(Number(skillValue)/2): skillValue;
        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        aspectPushes = checkOptions.pushes
        aspectBase = checkOptions.aspects
        useSpecialization = checkOptions.useSpecialization;
        usePool = checkOptions.usePool;
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

        if (calledShot) {
            meleeMod -= 10;
            modValue = -10
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
            modValue = -10
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
            gunsMod -= 20;
            modValue = -20
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
            gunsMod += 10;
            modValue = 10
            announce = "ep2e.roll.announce.combat.ranged.pointBlank";
            task.addModifier(new TaskRollModifier(announce, modValue))
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
        else if (attackMode === "indirect") {
            gunsMod -= 20;
            modValue = -20
            announce = "ep2e.roll.announce.combat.ranged.indirect";
            task.addModifier(new TaskRollModifier(announce, modValue))
        }
    }

    //console.log("this is my task: ", task)
    
    //General roll modifications
    let curratedWounds = 10 * (Number(actorData.physical.wounds) + eval(actorData.mods.woundMod))*eval(actorData.mods.woundMultiplier);
    let curratedTrauma = 10 * (Number(actorData.mental.trauma) + eval(actorData.mods.traumaMod));
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
        if (rollType === "aptitude"){
            rollMod = Number(globalMod);
        }
        else {
            woundsTotal = woundsMod;
            rollMod = Number(globalMod) - Number(woundsTotal);
        }
        //Checks if spec used
        if (useSpecialization){
            specMod = 10;
            task._name += "(" + specName + ")"
            announce = "ep2e.roll.announce.specialization"
            task.addModifier(new TaskRollModifier(announce, specMod))
        }
        //Checks if pool used
        if (usePool || useThreat){
            poolMod = 20;
            poolValue -= 1*numberOfTargets;
            poolUpdate = poolValue;
            //Determine pool to be updated
            await poolUpdater(poolUpdate,poolType);
            task.addModifier(new TaskRollModifier(poolType+":", poolMod))
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

    let modSkillValue = Number(skillValue) + rollMod + Number(gunsMod) + Number(meleeMod) + specMod + poolMod - totalEncumberance;

    //The dice roll
    for (i = numberOfTargets; i > 0; i--) {
        let roll = await new Roll(rollFormula).evaluate({async: true});

        //Success check
        let rollCheck = roll.total;
        let success = rollCheck <= modSkillValue;
        let critical = rollCheck === 11 || rollCheck === 22 || rollCheck === 33 || rollCheck === 44 || rollCheck === 55 || rollCheck === 66 || rollCheck === 77 || rollCheck === 88;
        let autoSuccess = rollCheck === 100;
        let autofail = rollCheck === 99;
        let doubleSuperior = rollCheck >= 66;
        let superior = rollCheck >= 33;
        let successMessage = "";
        let successClass = "";
        let successName = null;

        //Success messages
        if (autofail) {
            successMessage = await successLabel("autofail");
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
        } else if (!success && critical && rollCheck <= 33) {
            successMessage = await successLabel("supCritFail");
            successClass = "fail";
            successName = "Superior Critical Fail";
        } else if (success && critical && superior) {
            successMessage = await successLabel("greatCritSuc");
            successClass = "success";
            successType = true;
            successName = "Greater Critical Success";
        } else if (!success && critical && rollCheck <= 66) {
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

        //Visibility toggler
        if (activeRollTarget === "" || activeRollTarget === "public") {
            rollModeSelection = CONST.DICE_ROLL_MODES.PUBLIC
        } else if (activeRollTarget === "private") {
            rollModeSelection = CONST.DICE_ROLL_MODES.PRIVATE
        } else if (activeRollTarget === "blind") {
            rollModeSelection = CONST.DICE_ROLL_MODES.BLIND
        }

        //Infection (only relevant for psi checks)
        if (skillKey === "psi"){
            if (success && doubleSuperior) {
                aspectPushes -= 4
            } else if (success && superior) {
                aspectPushes -= 2
            }
            infectionMod = aspectPushes > 0 ? aspectBase * aspectPushes : aspectBase;
            if (skillKey === "psi" && brewStatus === true && aspectBase) {
                infectionMod += Number(actorData.psiStrain.infection)
                if (infectionMod <= 100){
                    actorWhole.update({"system.psiStrain.infection" : infectionMod});
                }
                else {
                    actorWhole.update({"system.psiStrain.infection" : 100});
                    infectionMod = 100;
                }
            }
        }

        //Chat message builder

        let message = {}
    
        message.resultText = successMessage;
        message.resultClass = successClass;
    
        message.taskName = specMod? task._taskName + " (" + specName + ")": task._taskName;
        message.taskValue = Number(task._baseValue);
        message.targetNumber = modSkillValue;

        message.visibility = activeRollTarget;

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

            await game.dice3d.waitFor3DAnimationByMessageID(msg.id);

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
                let checkOptions = await GetSwipSwapOptions(swipSwap, poolValue, actorType, poolType, flexValue, successName, swapPossible, severityFlavor);

                if (checkOptions.cancelled) {
                    return;
                }
                
                usedSwipSwap = checkOptions.swap;

                if (usedSwipSwap === "pool" || usedSwipSwap === "flex"){

                    let swapCheckData = await swapChecker(successType, swapPossible, swipSwap, successName, poolValue, flexValue, actorType, poolType, usedSwipSwap, rollModeSelection);

                    successType = swapCheckData["successName"];
                    swapPossible = swapCheckData["swapPossible"];
                    successName = swapCheckData["successName"];
                    flexValue = swapCheckData["flexValue"];
                    poolValue = swapCheckData["poolValue"];
                    usedSwipSwap = swapCheckData["usedSwipSwap"];

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
                
                let checkOptions = await GetRaiseOptions(successMessage, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType);

                if (checkOptions.cancelled) {
                    return;
                }
                usedRaise = checkOptions.raise;
                usedSwipSwap = checkOptions.swap;
            }

            if(usedSwipSwap === "pool" || usedSwipSwap === "flex"){

                if (swipSwap > 33){
                    successName = "Greater Success";
                    successMessage = await successLabel("greatSuc");
                }
                if (swipSwap > 66){
                    successName = "Superior Success";
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

                  if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success"){

                    switch (successName){
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
                            break;
                        case 'Greater Critical Success':
                            successName = "Superior Critical Success";
                            successMessage = await successLabel("supCritSuc");
                            break;
                    }
    
                    poolType = poolRAM;
    
                    poolValue--;
                    poolUpdate = poolValue;

                    message = {}
        
                    message.resultText = successMessage;
                    
                    message.type = "usedRaise";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    
                    ChatMessage.create({
                        content: html,
                        whisper: ChatMessage.getWhisperRecipients("GM")
                    });
    
                    poolUpdater(poolUpdate, poolType)
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
                    
                    message.type = "notEnoughPool";
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
                if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success"){

                    switch (successName){
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
                            break;
                        case 'Greater Critical Success':
                            successName = "Superior Critical Success";
                            successMessage = await successLabel("supCritSuc");
                            break;
                    }
    
                    poolType = poolRAM;
    
                    poolValue--;
                    poolUpdate = poolValue;

                    message = {}
        
                    message.resultText = successMessage;
                    
                    message.type = "usedRaise";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        flavor: html
                    })
    
                    poolUpdater(poolUpdate, poolType)
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
                    
                    message.type = "notEnoughPool";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: html,
                        whisper: [game.user._id]
                    })
                }
            }
        }

        //For roll from Weapon
        else if (rolledFrom === "rangedWeapon" || rolledFrom === "ccWeapon") {
            let modeDamage = "";
            if (attackMode === "single") {
                updateAmmo = currentAmmo - 1;
            }
            else if (attackMode === "burst") {
                modeDamage = "+ 1d10";
                updateAmmo = currentAmmo - 3;
            }
            else if (attackMode === "fullAuto"){
                modeDamage = "+ 2d10";
                updateAmmo = currentAmmo - 10;
            }
            else if (attackMode === "wBurst") {
                modeDamage = "";
                updateAmmo = currentAmmo - 3;
            }
            else if (attackMode === "wFullAuto") {
                modeDamage = "";
                updateAmmo = currentAmmo - 10;
            }
            else if (attackMode === "suppressive") {
                modeDamage = "";
                updateAmmo = currentAmmo - 20;
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

                await game.dice3d.waitFor3DAnimationByMessageID(msg.id);

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

                        let swapCheckData = await swapChecker(successType, swapPossible, swipSwap, successName, poolValue, flexValue, actorType, poolType, usedSwipSwap, rollModeSelection);

                        successType = swapCheckData["successName"];
                        swapPossible = swapCheckData["swapPossible"];
                        successName = swapCheckData["successName"];
                        flexValue = swapCheckData["flexValue"];
                        poolValue = swapCheckData["poolValue"];
                        usedSwipSwap = swapCheckData["usedSwipSwap"];

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

                }

                if(successType){
                    switch (successName) {
                        case 'Greater Success':
                            successModifier = "+ 1d6";
                            potentialRaise = true;
                            break;
                        case 'Superior Success':
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

                    if (weaponType === "ranged" && swapPossible || weaponType === "ranged" && potentialRaise){
                        let checkOptions = await GetDamageRangedOptions(weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successMessage, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue);
    
                        if (checkOptions.cancelled) {
                            return;
                        }
                        usedRaise = checkOptions.raise;
                        usedSwipSwap = checkOptions.swap;
                    }

                    if (weaponType === "melee" && swapPossible || weaponType === "melee" && potentialRaise){
                        let checkOptions = await GetDamageMeleeOptions(weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successMessage, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, meleeDamageMod);
    
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

                    if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success"){
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
      
                      poolValue--;
                      poolUpdate = poolValue;

                      message = {}
          
                      message.resultText = successMessage;
                      
                      message.type = "usedRaise";
                      message.poolName = await poolName(poolType);
      
                      html = await renderTemplate(POOL_USAGE_OUTPUT, message)

                      ChatMessage.create({
                          content: html,
                          whisper: ChatMessage.getWhisperRecipients("GM")
                      });
      
                      poolUpdater(poolUpdate, poolType)
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
                    
                    message.type = "notEnoughPool";
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
                  if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success"){
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
      
                      poolValue--;
                      poolUpdate = poolValue;

                      message = {}
          
                      message.resultText = successMessage;
                      
                      message.type = "usedRaise";
                      message.poolName = await poolName(poolType);
      
                      html = await renderTemplate(POOL_USAGE_OUTPUT, message)
      
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          flavor: html
                      })
      
                      poolUpdater(poolUpdate, poolType)
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
                    
                    message.type = "notEnoughPool";
                    message.poolName = await poolName(poolType);
    
                    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
                    
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          content: html,
                          whisper: [game.user._id]
                      })
                  }
              }

                if(weaponDamage && successType){
                    
                    let intermediateRollFormula = null;
                    let rollFormula = null

                    if(weaponType === "melee" && meleeDamageMod){
                        intermediateRollFormula = weaponDamage + modeDamage + successModifier + meleeDamageMod;
                    }
                    else{
                        intermediateRollFormula = weaponDamage + modeDamage + successModifier;
                    }
                    if (criticalModifier) {
                        rollFormula = criticalModifier + (intermediateRollFormula);
                    }
                    else {
                        rollFormula = intermediateRollFormula;
                    }

                    message = {}
                    
                    message.type = "damage";
                    message.weaponName = weaponName;
    
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
                message.poolName = await poolName(poolType);

                html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: this.actor}),
                    content: html,
                    whisper: [game.user._id]
                })
            }
        } 
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
        if (swipSwap <= modSkillValue && swipSwap > evaluatedRoll && poolValue || swipSwap <= modSkillValue && swipSwap > evaluatedRoll && flexValue) {
            swapPossible = true;
        }
        if (swipSwap <= modSkillValue && !successType && poolValue || swipSwap <= modSkillValue && !successType && flexValue) {
            swapPossible = true;
        }
        if (swipSwap > modSkillValue && !successType && poolValue || swipSwap > modSkillValue && !successType && flexValue) {
            severeConsequences = true;
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
    async function swapChecker(successType, swapPossible, swipSwap, successName, poolValue, flexValue, actorType, poolType, usedSwipSwap, rollModeSelection){
        successType = true;
        swapPossible = false;
        if (swipSwap < 33){
            successName = "ep2e.roll.successType.success";
        }
        if (swipSwap > 33 && swipSwap < 66){
            successName = "ep2e.roll.successType.greaterSuccess";
        }
        if (swipSwap > 66){
            successName = "ep2e.roll.successType.superiorSuccess";
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
        
        message.resultText = successName;
        
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

        return {successType, swapPossible, successName, flexValue, poolValue, usedSwipSwap};
    }

    //Failure Mitigation Check
    async function mitigationChecker(poolType, flexValue, severityLevel, actorType, usedMitigate){
        let severityAfter = "";
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

        return [flexValue, poolValue];
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
        if (successName === "autofail") {
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
    async function GetTaskOptions(skillName, specName, poolType, poolValue, actorType, taskType) {
        let dialogName = new Localizer ('ep2e.roll.dialog.title.talentCheck');
        let cancelButton = new Localizer ('ep2e.roll.dialog.button.cancel');
        let rollButton = new Localizer ('ep2e.roll.dialog.button.roll');
        const template = "systems/eclipsephase/templates/chat/skill-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, actorType, taskType});

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
            aspects: form.AspectNumber ? parseInt(form.AspectNumber.value) : 0,
            pushes: form.PushesNumber ? parseInt(form.PushesNumber.value)*2 : 0,
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            activeRollMode: form.RollMode.value,
            useSpecialization: form.useSpec ? form.useSpec.checked : false,
            usePool: form.usePool ? form.usePool.checked : false,
            useThreat: form.useThreat ? form.useThreat.checked : false
        }
    }

    //Skill check dialog constructor
    async function GetMeleeTaskOptions(specName, poolType, poolValue, actorType) {
        let dialogName = new Localizer ('ep2e.roll.dialog.title.melee');
        let cancelButton = new Localizer ('ep2e.roll.dialog.button.cancel');
        let rollButton = new Localizer ('ep2e.roll.dialog.button.roll');
        const template = "systems/eclipsephase/templates/chat/melee-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, actorType});

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

    //General skill check results
    function _proMeleeCheckOptions(form) {
        return {
            numberOfTargets: parseInt(form.NumberTargets.value)>0 ? parseInt(form.NumberTargets.value) : 1,
            attackMode: form.HitType.value,
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            activeRollMode: form.RollMode.value,
            useSpecialization: form.useSpec ? form.useSpec.checked : false,
            usePool: form.usePool ? form.usePool.checked : false,
            useThreat: form.useThreat ? form.useThreat.checked : false,
            calledShot: form.CalledShot.checked
        }

    }

    //Guns check dialog constructor
    async function GetGunsTaskOptions(specName, poolType, poolValue, actorType) {
        let dialogName = new Localizer ('ep2e.roll.dialog.title.guns');
        let cancelButton = new Localizer ('ep2e.roll.dialog.button.cancel');
        let rollButton = new Localizer ('ep2e.roll.dialog.button.roll');
        const template = "systems/eclipsephase/templates/chat/gun-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, actorType});

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
            range: form.Range.value,
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
            useSpecialization: form.useSpec ? form.useSpec.checked : false,
            usePool: form.usePool ? form.usePool.checked : false,
            useThreat: form.useThreat ? form.useThreat.checked : false
        }

    }

    async function GetDamageRangedOptions(weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue) {
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
        const template = "systems/eclipsephase/templates/chat/damage-gun-dialog.html";
        const html = await renderTemplate(template, {weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, groupName, choices});
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
                        callback: html => resolve(_proRangedRollOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };
            let options = {width:276}
            new Dialog(data, options).render(true);
        });
    }
    function _proRangedRollOptions(form) {
        return {
            swap: form.useSwap ? form.useSwap.value : null,
            raise: form.useRaise ? form.useRaise.checked : false
        }
    }

    async function GetDamageMeleeOptions(weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, meleeDamageMod) {
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
        const template = "systems/eclipsephase/templates/chat/damage-melee-dialog.html";
        const html = await renderTemplate(template, {weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, groupName, choices, meleeDamageMod});
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
                        callback: html => resolve(_proMeleeRollOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };
            let options = {width:276}
            new Dialog(data, options).render(true);
        });
    }

    function _proMeleeRollOptions(form) {
        return {
            swap: form.useSwap ? form.useSwap.value : false,
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
            let options = {width:266}
            new Dialog(data, options).render(true);
        });
    }

    function _proSwipSwapOptions(form) {
        return {
            swap: form.useSwap ? form.useSwap.value : null,
            mitigate: form.useMitigate ? form.useMitigate.value : null
        }
    }

    async function GetRaiseOptions(successMessage, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType) {

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
        const html = await renderTemplate(template, {successMessage, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, choices});
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
            raise: form.useRaise ? form.useRaise.checked : false
        }
    }
}
