/*
 * Path constants for dialog templates
 */
const REPUTATION_TASK_DIALOG = 'systems/eclipsephase/templates/chat/rep-test-dialog.html'
const TASK_RESULT_OUTPUT = 'systems/eclipsephase/templates/chat/task-result.html'

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
  0: { class: 'success', text: 'Critical Success' },
  1: { class: 'success', text: 'Superior Success' },
  2: { class: 'success', text: 'Greater Success' },
  3: { class: 'success', text: 'Success' },
  4: { class: 'fail', text: 'Critical Failure' },
  5: { class: 'fail', text: 'Superior Failure' },
  6: { class: 'fail', text: 'Greater Failure' },
  7: { class: 'fail', text: 'Failure' }
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
  constructor(text, value) {
    this._text = text
    this._value = value
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

  let task = new TaskRoll(`${dataset.name} network`, repValue)

  if(global_mod !== 0)
    task.addModifier(new TaskRollModifier('Situational modifier', global_mod))

  if(favor_mod !== 0)
    task.addModifier(new TaskRollModifier('Favor modifier', favor_mod))

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
    taskRoll.addModifier(new TaskRollModifier('Wound modifier', -wounds))

  if(trauma > 0)
    taskRoll.addModifier(new TaskRollModifier('Trauma modifier', -trauma))
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

    new Dialog(data, null).render(true);
  })
}










//General & Special Task Checks
export async function TaskCheck({
    //General
    msg = null,
    actorData = "",
    actorWhole = "",
    actorType = actorWhole.type,
    skillName = "",
    specName = "",
    useSpecialization = null,
    skillValue = null,
    askForOptions = false,
    optionsSettings = null,
    brewStatus = false,
    rolledFrom = "",
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
    usedRaise = null,
    //Melee
    numberOfTargets = 1,
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
    //Guns check dialog

    console.log("My Actor Type: ", actorType)

    if (askForOptions != optionsSettings && skillName === "guns") {
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

    //Psi check dialog
    else if (askForOptions != optionsSettings && skillName === "psi" && brewStatus === true) {
        let checkOptions = await GetPsiTaskOptions(specName, poolType, poolValue, actorType);

        if (checkOptions.cancelled) {
            return;
        }

        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        aspectPushes = checkOptions.pushes
        aspectBase = checkOptions.aspects
        useSpecialization = checkOptions.useSpecialization;
        usePool = checkOptions.usePool;
        useThreat = checkOptions.useThreat;
    }

    //Fray skill check dialog
    else if (askForOptions != optionsSettings && skillName === "fray") {
        let checkOptions = await GetFrayTaskOptions(rollType, specName, poolType, poolValue, actorType);

        if (checkOptions.cancelled) {
            return;
        }
        skillValue = checkOptions.ranged ? Math.floor(Number(skillValue)/2): skillValue;
        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        useSpecialization = checkOptions.useSpecialization;
        usePool = checkOptions.usePool;
        useThreat = checkOptions.useThreat;
    }

    //Fray skill check dialog
    else if (askForOptions != optionsSettings && skillName === "melee") {
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
        let checkOptions = await GetTaskOptions(rollType, specName, poolType, poolValue, actorType);

        if (checkOptions.cancelled) {
            return;
        }

        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        useSpecialization = checkOptions.useSpecialization;
        usePool = checkOptions.usePool;
        useThreat = checkOptions.useThreat;
    }

    //Melee Combat
    let meleeMod = numberOfTargets>1 ? 0 - (numberOfTargets-1)*20 : 0;
    let meleeAnnounce = numberOfTargets>1 ? "<br>Multiple Targets (<strong> -" + (numberOfTargets-1)*20 +"</strong>)" : "";
    let meleeModTitle = "";

    if (skillName === "melee"){
        if (attackMode === "charge"){
            meleeMod -=10;
            meleeAnnounce += "<br>Charging (<strong>-10 Hit +1d6DV</strong>)";
        }
        else if (attackMode === "aggressive"){
            meleeMod +=10;
            meleeAnnounce += "<br>Agressive Hit (<strong>+10</strong>)<br/>Fray <strong>-10</strong>";
        }
        else if (attackMode === "aggressiveCharge"){
            meleeAnnounce += "<br>Agressive Charge (<strong>+1d10DV</strong>)<br/>Fray <strong>-10</strong>";
        }

        if (calledShot) {
            meleeMod -= 10;
            meleeAnnounce += "<br>Called Shot (<strong>-10</strong>)";
        }

        meleeModTitle = meleeAnnounce? "<p/><u>Melee Modifiers</u>" : "";
    }

    //Ranged Combat
    let gunsMod = 0;
    let gunAnnounce = "";
    let gunModTitle = "";

    if (skillName === "guns"){
        //Guns roll modifications
        if (!smartlink) {
            gunsMod -= 10;
            gunAnnounce += "<br>No Smartgun (<strong>-10</strong>)";
        }
        if (running) {
            gunsMod -= 20;
            gunAnnounce += "<br>Running (<strong>-20</strong>)";
        }
        if (superiorPosition) {
            gunsMod += 20;
            gunAnnounce += "<br>Superior Position (<strong>+20</strong>)";
        }
        if (calledShot) {
            gunsMod -= 10;
            gunAnnounce += "<br>Called Shot (<strong>-10</strong>)";
        }
        if (inMelee) {
            gunsMod -= 20;
            gunAnnounce += "<br>Stuck in Melee (<strong>-10</strong>)";
        }

        if (coverAttacker) {
            gunsMod -= 10;
            gunAnnounce += "<br>In Cover (<strong>-10</strong>)";
        }

        if (aim === "quick") {
            gunsMod += 10;
            gunAnnounce += "<br>Quick Aim (<strong>+10</strong>)";
        }
        else if (aim === "long") {
            gunsMod += 30;
            gunAnnounce += "<br>Long Aim (<strong>+30</strong>)";
        }

        if (size === "xs") {
            gunsMod -= 30;
            gunAnnounce += "<br>Very Small Target (<strong>-30</strong>)";
        }
        else if (size === "s") {
            gunsMod -= 10;
            gunAnnounce += "<br>Small Target (<strong>-10</strong>)";
        }
        else if (size === "l") {
            gunsMod += 10;
            gunAnnounce += "<br>Large Target (<strong>+10</strong>)";
        }
        else if (size === "xl") {
            gunsMod += 30;
            gunAnnounce += "<br>Very Large Target (<strong>+30</strong>)";
        }

        if (range === "range" && prone) {
            gunsMod -= 20;
            gunAnnounce += "<br>Prone at Range (<strong>-20</strong>)";
        }
        else if (range === "beyond" && prone) {
            gunsMod -= 30;
            gunAnnounce += "<br>Prone Beyond Range (<strong>-30</strong>)";
        }
        else if (range === "beyond+" && prone) {
            gunsMod -= 40;
            gunAnnounce += "<br>Prone Far Beyond Range (<strong>-40</strong>)";
        }
        else if (range === "range") {
            gunsMod -= 10;
            gunAnnounce += "<br>At Range (<strong>-10</strong>)";
        }
        else if (range === "beyond") {
            gunsMod -= 20;
            gunAnnounce += "<br>Beyond Range (<strong>-20</strong>)";
        }
        else if (range === "beyond+") {
            gunsMod -= 30;
            gunAnnounce += "<br>Far Beyond Range (<strong>-30</strong>)";
        }
        else if (range === "pointBlank" || range === "pointBlank" && prone){
            gunsMod += 10;
            gunAnnounce += "<br>Point Blank (<strong>+10</strong>)";
        }


        if (coverDefender === "minor") {
            gunsMod -= 10;
            gunAnnounce += "<br>Target in minor Cover (<strong>-10</strong>)";
        }
        else if (coverDefender === "moderate") {
            gunsMod -= 20;
            gunAnnounce += "<br>Target in moderate Cover (<strong>-20</strong>)";
        }
        else if (coverDefender === "major") {
            gunsMod -= 30;
            gunAnnounce += "<br>Target in major Cover (<strong>-30</strong>)";
        }

        if (visualImpairment === "minor") {
            gunsMod -= 10;
            gunAnnounce += "<br>Minor Visual Impairment <strong>-10</strong>";
        }
        else if (visualImpairment === "major") {
            gunsMod -= 20;
            gunAnnounce += "<br>Moderate Visual Impaired <strong>-20</strong>";
        }
        else if (visualImpairment === "blind") {
            gunsMod -= 30;
            gunAnnounce += "<br>Blind (<strong>-30</strong>)";
        }

        if (attackMode === "wBurst") {
            gunsMod += 10;
            gunAnnounce += "<br>Wide Burst (<strong>+10</strong>)";
        }
        else if (attackMode === "wFullAuto") {
            gunsMod += 30;
            gunAnnounce += "<br>Wide Full Auto (<strong>+30</strong>)";
        }
        else if (attackMode === "indirect") {
            gunsMod -= 20;
            gunAnnounce += "<br>Indirect (<strong>-20</strong>)";
        }

        gunModTitle = gunAnnounce ? "<p/><u>Shooting Modifiers</u>" : "";
    }


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
    let spec = false;
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
        }
        //Checks if pool used
        if (usePool || useThreat){
            poolMod = 20;
            poolValue--;
            poolUpdate = poolValue;
            //Determine pool to be updated
            await poolUpdater(poolUpdate,poolType);
        }
    let modSkillValue = Number(skillValue) + rollMod + Number(gunsMod) + Number(meleeMod) + specMod + poolMod - totalEncumberance;
    //Chat message variables
    
    spec = useSpecialization ? "(" + specName + ")" : "";
    let poolAnnounce = usePool ? poolType + ": <strong>+ 20</strong><br>" : "";
    let threatAnnounce = useThreat ? "threat: <strong>+ 20</strong><br>" : "";
    let situationalPlus = globalMod>0 ? "+" : "";
    let modAnnounce = rollMod||poolMod||totalEncumberance ? "<u>Applied General Mods:</u> <br>" : "";
    let encumberanceModAnnounce = totalEncumberance ? "Encumberance:<strong> -" + totalEncumberance + "</strong><br>" : "";
    let woundAnnounce = woundsTotal ? "Wound/Trauma:<strong> -" + woundsTotal + "</strong><br>" : "";
    let globalAnnounce = globalMod ? "Situational:<strong>" + situationalPlus + globalMod + "</strong><br>" : "";

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
        let successName = null;

        //Success messages
        if (autofail) {
            successMessage = "<span class='fail'>Supreme Fail!</span> <p>";
            successName = "Supreme Fail";
        } else if (autoSuccess) {
            successMessage = "<span class='success'>Supreme Success!</span> <p>";
            successType = true;
            successName = "Supreme Success";
        } else if (success && critical && doubleSuperior) {
            successMessage = "<span class='success'>Superior Critical Success!</span> <p>";
            successType = true;
            successName = "Superior Critical Success";
        } else if (!success && critical && rollCheck <= 33) {
            successMessage = "<span class='fail'>Superior Critical Fail!</span> <p>";
            successName = "Superior Critical Fail";
        } else if (success && critical && superior) {
            successMessage = "<span class='success'>Greater Critical Success!</span> <p>";
            successType = true;
            successName = "Greater Critical Success";
        } else if (!success && critical && rollCheck <= 66) {
            successMessage = "<span class='fail'> Greater Critical Fail!</span> <p>";
            successName = "Greater Critical Fail";
        } else if (success && critical) {
            successMessage = "<span class='success'>Critical Success!</span> <p>";
            successType = true;
            successName = "Critical Success";
        } else if (!success && critical) {
            successMessage = "<span class='fail'>Critical Fail!</span> <p>";
            successName = "Critical Fail";
        } else if (success && doubleSuperior) {
            successMessage = "<span class='success'>Superior Success!</span> <p>";
            successType = true;
            successName = "Superior Success";
        } else if (!success && !superior) {
            successMessage = "<span class='fail'>Superior Fail!</span> <p>";
            successName = "Superior Fail";
        } else if (success && superior) {
            successMessage = "<span class='success'>Greater Success!</span> <p>";
            successType = true;
            successName = "Greater Success";
        } else if (!success && !doubleSuperior) {
            successMessage = "<span class='fail'>Greater Fail!</span> <p>";
            successName = "Greater Fail";
        } else if (success) {
            successMessage = "<span class='success'>Success!</span> <p>";
            successType = true;
            successName = "Success";
        } else if (!success) {
            successMessage = "<span class='fail'>Fail!</span> <p>";
            successName = "Fail";
        }


        //Visibility toggler
        let rollVisibility = "";
        if (activeRollTarget === "" || activeRollTarget === "public") {
            rollModeSelection = CONST.DICE_ROLL_MODES.PUBLIC
        } else if (activeRollTarget === "private") {
            rollModeSelection = CONST.DICE_ROLL_MODES.PRIVATE
            rollVisibility = "<p/><h5 style='font-weight: normal; margin: 0;'>Private Roll <i class=\"fas fa-eye-slash\"></i></h5><p/>"
        } else if (activeRollTarget === "blind") {
            rollModeSelection = CONST.DICE_ROLL_MODES.BLIND
            rollVisibility = "<p/><h5 style='font-weight: normal; margin: 0;'>Blind GM Roll <i class=\"fas fa-low-vision\"></i></h5><p/>"
        }

        //Infection (only relevant for psi checks)
        let infectionAddition = "";

        if (success && doubleSuperior) {
            aspectPushes -= 4
        } else if (success && superior) {
            aspectPushes -= 2
        }
        infectionMod = aspectPushes > 0 ? aspectBase * aspectPushes : aspectBase;
        if (skillName === "psi" && brewStatus === true && aspectBase) {
            infectionMod += Number(actorData.psiStrain.infection)
            infectionAddition = "<p/><u>Infection raises to:</u><br><strong>" + infectionMod + "</strong>"
        }

        //Chat message constructor

        //For default skill roll
        if (rolledFrom != "rangedWeapon" && rolledFrom != "ccWeapon") {
            if(modSkillValue>0){
                let label = successMessage + rollVisibility + "Rolled <strong>" + skillName + spec + "</strong> check <br> against <strong>" + modSkillValue + "</strong><p> <h5 style='font-weight: normal; margin: 0;'>" + modAnnounce + woundAnnounce + encumberanceModAnnounce + globalAnnounce + poolAnnounce + threatAnnounce + infectionAddition + gunModTitle + gunAnnounce + meleeModTitle + meleeAnnounce + "</h5>";
                msg = await roll.toMessage({
                    speaker: ChatMessage.getSpeaker({actor: this.actor}),
                    flavor: label
                },{
                    rollMode: rollModeSelection
                });
            }
            else{
                let label = "is desperate and pushes their luck<br> and rolls a:<p>" + successMessage + "<p> <h5 style='font-weight: normal; margin: 0;'><u>Skill value lower than 0  due to:</u><p>" + woundAnnounce + encumberanceModAnnounce + globalAnnounce + poolAnnounce + threatAnnounce + gunModTitle + gunAnnounce + meleeModTitle + meleeAnnounce + "</h5>";
                msg = await roll.toMessage({
                    speaker: ChatMessage.getSpeaker({actor: this.actor}),
                    flavor: label
                },{
                    rollMode: rollModeSelection
                });
            }

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
                let checkOptions = await GetSwipSwapOptions(swipSwap, poolValue, actorType, poolType, flexValue, successName, swapPossible, severityFlavor);

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
                
                let checkOptions = await GetRaiseOptions(successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType);

                if (checkOptions.cancelled) {
                    return;
                }
                usedRaise = checkOptions.raise;
                usedSwipSwap = checkOptions.swap;
            }

            if(usedSwipSwap === "pool" || usedSwipSwap === "flex"){

                if (swipSwap > 33){
                    successName = "Greater Success";
                }
                if (swipSwap > 66){
                    successName = "Superior Success";
                }

                poolValue--;
                poolUpdate = poolValue;
                
                if (usedSwipSwap === "flex"){
                    poolType = "Flex";
                    poolValue++;
                    flexValue--;
                    poolUpdate = flexValue;
                }

                if (rollModeSelection === "gmroll"){
                    ChatMessage.create({
                        content: "Used <strong>" + poolType + "<p/></strong>to swap the result to <strong>" + swipSwap + "</strong><p/><span class='success'>" + successName + "</span></strong>",
                        whisper: ChatMessage.getWhisperRecipients("GM")
                      });
                }
                else {
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        flavor: "Used <strong>" + poolType + "<p/></strong>to swap the result to <strong>" + swipSwap + "</strong><p/><span class='success'>" + successName + "</span></strong>"
                    })
                }

                poolUpdater(poolUpdate, poolType)

            }

            if (rollModeSelection === "gmroll"){

                  if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success"){

                    switch (successName){
                        case 'Success':
                            successName = "Greater Success";
                            break;
                        case 'Greater Success':
                            successName = "Superior Success";
                            break;
                        case 'Critical Success':
                            successName = "Greater Critical Success";
                            break;
                        case 'Greater Critical Success':
                            successName = "Superior Critical Success";
                            break;
                    }
    
                    poolType = poolRAM;
    
                    poolValue--;
                    poolUpdate = poolValue;

                    
                    ChatMessage.create({
                        content: "Used <strong>" + poolType + "<p/></strong>to raise the result to </strong><p/><span class='success'>" + successName + "</span></strong>",
                        whisper: ChatMessage.getWhisperRecipients("GM")
                    });
    
                    poolUpdater(poolUpdate, poolType)
                }
    
                else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: "You cannot increse your success level beyond 'Superior...'. <p/><strong>" + poolType + "</strong><p/> has not been deducted.",
                        whisper: [game.user._id]
                    })
                }
    
                else if (usedRaise && !poolValue){
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: "You have not enough <p/><strong>" + poolType + "</strong><p/> to increase your success level.",
                        whisper: [game.user._id]
                    })
                }
            }
            else {
                if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success"){

                    switch (successName){
                        case 'Success':
                            successName = "Greater Success";
                            break;
                        case 'Greater Success':
                            successName = "Superior Success";
                            break;
                        case 'Critical Success':
                            successName = "Greater Critical Success";
                            break;
                        case 'Greater Critical Success':
                            successName = "Superior Critical Success";
                            break;
                    }
    
                    poolType = poolRAM;
    
                    poolValue--;
                    poolUpdate = poolValue;
    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        flavor: "Used <strong>" + poolType + "<p/></strong>to raise the result to </strong><p/><span class='success'>" + successName + "</span></strong>"
                    })
    
                    poolUpdater(poolUpdate, poolType)
                }
    
                else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: "You cannot increse your success level beyond 'Superior...'. <p/><strong>" + poolType + "</strong><p/> has not been deducted.",
                        whisper: [game.user._id]
                    })
                }
    
                else if (usedRaise && !poolValue){
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        content: "You have not enough <p/><strong>" + poolType + "</strong><p/> to increase your success level.",
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
                if(modSkillValue>0){
                    let label = successMessage + rollVisibility + "Rolled <strong>" + skillName + spec + "</strong> check <br> against <strong>" + modSkillValue + "</strong><p> <h5 style='font-weight: normal; margin: 0;'>" + modAnnounce + woundAnnounce + encumberanceModAnnounce + globalAnnounce + poolAnnounce + threatAnnounce + infectionAddition + gunModTitle + gunAnnounce + meleeModTitle + meleeAnnounce + "</h5>";
                    msg = await roll.toMessage({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        flavor: label
                    },{
                        rollMode: rollModeSelection
                    });

                    ammoUpdate.push({
                        "_id" : weaponID,
                        "system.ammoMin": updateAmmo
                    });
            
                    //This updates the items ammunition
                    actorWhole.updateEmbeddedDocuments("Item", ammoUpdate);
                }
                else{
                    let label = "is desperate and pushes their luck<br> and rolls a:<p>" + successMessage + "<p> <h5 style='font-weight: normal; margin: 0;'><u>Skill value lower than 0  due to:</u><p>" + woundAnnounce + encumberanceModAnnounce + globalAnnounce + poolAnnounce + threatAnnounce + gunModTitle + gunAnnounce + meleeModTitle + meleeAnnounce + "</h5>";
                    msg = await roll.toMessage({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        flavor: label
                    },{
                        rollMode: rollModeSelection
                    });

                    ammoUpdate.push({
                        "_id" : weaponID,
                        "system.ammoMin": updateAmmo
                    });
            
                    //This updates the items ammunition
                    actorWhole.updateEmbeddedDocuments("Item", ammoUpdate);
                }

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

                //Mitigate Failed Rolls
                if (severeConsequences && severityLevel > 0 && combinedPools > 0){
                    let checkOptions = await GetSwipSwapOptions(swipSwap, poolValue, actorType, poolType, flexValue, successName, swapPossible, severityFlavor);
    
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
                        let checkOptions = await GetDamageRangedOptions(weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue);
    
                        if (checkOptions.cancelled) {
                            return;
                        }
                        usedRaise = checkOptions.raise;
                        usedSwipSwap = checkOptions.swap;
                    }

                    if (weaponType === "melee" && swapPossible || weaponType === "melee" && potentialRaise){
                        let checkOptions = await GetDamageMeleeOptions(weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, meleeDamageMod);
    
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
                    }
                    if (swipSwap > 66){
                        successModifier = "+ 2d6";
                        successName = "Superior Success"
                    }
                    poolValue--;
                    poolUpdate = poolValue;
                    
                    if (usedSwipSwap === "flex"){
                        poolType = "Flex";
                        poolValue++;
                        flexValue--;
                        poolUpdate = flexValue;
                    }

                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: this.actor}),
                        flavor: "Used <strong>" + poolType + "<p/></strong>to swap the result to <strong>" + swipSwap + "</strong><p/><span class='success'>" + successName + "</span></strong>"
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
                                break;
                            case 'Greater Success':
                                successName = "Superior Success";
                                break;
                            case 'Critical Success':
                                successName = "Greater Critical Success";
                                successModifier = "+ 1d6)";
                                break;
                            case 'Greater Critical Success':
                                successName = "Superior Critical Success";
                                successModifier = "+ 2d6)";
                                break;
                            default:
                                break;
                        }
      
                      poolType = poolRAM;
      
                      poolValue--;
                      poolUpdate = poolValue;
  
                      
                      ChatMessage.create({
                          content: "Used <strong>" + poolType + "<p/></strong>to raise the damage done",
                          whisper: ChatMessage.getWhisperRecipients("GM")
                      });
      
                      poolUpdater(poolUpdate, poolType)
                  }
      
                  else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          content: "You cannot increse your success level beyond 'Superior...'. <p/><strong>" + poolType + "</strong><p/> has not been deducted.",
                          whisper: [game.user._id]
                      })
                  }
      
                  else if (usedRaise && !poolValue){
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          content: "You have not enough <p/><strong>" + poolType + "</strong><p/> to increase your success level.",
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
                            break;
                        case 'Greater Success':
                            successName = "Superior Success";
                            break;
                        case 'Critical Success':
                            successName = "Greater Critical Success";
                            successModifier = "+ 1d6)";
                            break;
                        case 'Greater Critical Success':
                            successName = "Superior Critical Success";
                            successModifier = "+ 2d6)";
                            break;
                        default:
                            break;
                    }
      
                      poolType = poolRAM;
      
                      poolValue--;
                      poolUpdate = poolValue;
      
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          flavor: "Used <strong>" + poolType + "<p/></strong>to raise the result to </strong><p/><span class='success'>" + successName + "</span></strong>"
                      })
      
                      poolUpdater(poolUpdate, poolType)
                  }
      
                  else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          content: "You cannot increse your success level beyond 'Superior...'. <p/><strong>" + poolType + "</strong><p/> has not been deducted.",
                          whisper: [game.user._id]
                      })
                  }
      
                  else if (usedRaise && !poolValue){
                      ChatMessage.create({
                          speaker: ChatMessage.getSpeaker({actor: this.actor}),
                          content: "You have not enough <p/><strong>" + poolType + "</strong><p/> to increase your success level.",
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

                    let roll = await new Roll(rollFormula).evaluate({async: true});
                    let label = "Rolls damage with <br> <strong>" + weaponName + "</strong>";

                    roll.toMessage({
                        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                        flavor: label
                    },{
                        rollMode: rollModeSelection
                    });
                }
                    
            }
            else {
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: this.actor}),
                    content: "Your weapon has insuficient ammunition. <p/> <strong>Please reload first! </strong>",
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
            successName = "Success";
        }
        if (swipSwap > 33 && swipSwap < 66){
            successName = "Greater Success";
        }
        if (swipSwap > 66){
            successName = "Superior Success";
        }

        poolValue--;
        poolUpdate = poolValue;

        if (usedSwipSwap === "flex"){
            poolType = "Flex";
            poolValue++;
            flexValue--;
            poolUpdate = flexValue;
        }

        usedSwipSwap = null

        if (rollModeSelection === "gmroll"){
            ChatMessage.create({
                content: "Used <strong>" + poolType + "<p/></strong>to swap the result to <strong>" + swipSwap + "</strong><p/><span class='success'>" + successName + "</span></strong>",
                whisper: ChatMessage.getWhisperRecipients("GM")
              });
        }
        else {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker(),
                flavor: "Used <strong>" + poolType + "<p/></strong>to swap the result to <strong>" + swipSwap + "</strong><p/><span class='success'>" + successName + "</span></strong>"
            })
        }

        poolUpdater(poolUpdate, poolType);

        return {successType, swapPossible, successName, flexValue, poolValue, usedSwipSwap};
    }

    //Failure Mitigation Check
    async function mitigationChecker(poolType, flexValue, severityLevel, actorType, usedMitigate){
        let flavorText = null;
        poolValue--;
        poolUpdate = poolValue;
        
        if (usedMitigate === "flex"){
            poolType = "Flex";
            poolValue++;
            flexValue--;
            poolUpdate = flexValue;
        }

        if (severityLevel === 1){
            flavorText = "Used<p/><strong>" + poolType + "<p/></strong>to mitigate their greater failure to a <p/><strong><span class='fail'>Fail</span></strong>";
        }
        if (severityLevel === 2){
            flavorText = "Used<p/><strong>" + poolType + "<p/></strong>to mitigate their superior failure to a <p/><strong><span class='fail'>Greater Fail</span></strong>";
        }
        if (severityLevel === 3){
            flavorText = "Used<p/><strong>" + poolType + "<p/></strong>to mitigate their Critical failure to a <p/><strong><span class='fail'>Superior Fail</span></strong>";
        }

        if (rollModeSelection === "gmroll"){
            ChatMessage.create({
                content: flavorText,
                whisper: ChatMessage.getWhisperRecipients("GM")
              });
        }
        else {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker(),
                flavor: flavorText
            })
        }

        poolUpdater(poolUpdate, poolType)

        return [flexValue, poolValue];
    }

    //Skill check dialog constructor
    async function GetTaskOptions(rollType, specName, poolType, poolValue, actorType) {
        const template = "systems/eclipsephase/templates/chat/skill-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, actorType});

        return new Promise(resolve => {
            const data = {
                title: rollType[0].toUpperCase() + rollType.slice(1) + " Check",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
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
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            activeRollMode: form.RollMode.value,
            useSpecialization: form.useSpec ? form.useSpec.checked : false,
            usePool: form.usePool ? form.usePool.checked : false,
            useThreat: form.useThreat ? form.useThreat.checked : false
        }
    }

    //Skill check dialog constructor
    async function GetFrayTaskOptions(rollType, specName, poolType, poolValue, actorType) {
        const template = "systems/eclipsephase/templates/chat/fray-test-dialog.html";
        const html = await renderTemplate(template, {rollType, specName, poolType, poolValue, actorType});

        return new Promise(resolve => {
            const data = {
                title: "Fray Check",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
                        callback: html => resolve(_proFrayCheckOptions(html[0].querySelector("form")))
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
    function _proFrayCheckOptions(form) {
        return {
            ranged: form.RangedFray.checked,
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            activeRollMode: form.RollMode.value,
            useSpecialization: form.useSpec ? form.useSpec.checked : false,
            usePool: form.usePool ? form.usePool.checked : false,
            useThreat: form.useThreat ? form.useThreat.checked : false
        }

    }

    //Skill check dialog constructor
    async function GetMeleeTaskOptions(specName, poolType, poolValue, actorType) {
        const template = "systems/eclipsephase/templates/chat/melee-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, actorType});

        return new Promise(resolve => {
            const data = {
                title: "Melee Check",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
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

    //Psi check dialog constructor
    async function GetPsiTaskOptions(specName, poolType, poolValue, actorType) {
        const template = "systems/eclipsephase/templates/chat/psi-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, actorType});

        return new Promise(resolve => {
            const data = {
                title: "Psi Check",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
                        callback: html => resolve(_proPsiTaskCheckOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };
            let options = {width:276}
            new Dialog(data, options).render(true);
        });
    }

    //Psi check results
    function _proPsiTaskCheckOptions(form) {
        return {
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            aspects: parseInt(form.AspectNumber.value),
            pushes: parseInt(form.PushesNumber.value)*2,
            activeRollMode: form.RollMode.value,
            useSpecialization: form.useSpec ? form.useSpec.checked : false,
            usePool: form.usePool ? form.usePool.checked : false,
            useThreat: form.useThreat ? form.useThreat.checked : false
        }

    }

    //Guns check dialog constructor
    async function GetGunsTaskOptions(specName, poolType, poolValue, actorType) {
        const template = "systems/eclipsephase/templates/chat/gun-test-dialog.html";
        const html = await renderTemplate(template, {specName, poolType, poolValue, actorType});

        return new Promise(resolve => {
            const data = {
                title: "Guns Check",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
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
        let choices = {};
        let radioStatus = true
        if (poolValue && flexValue && swapPossible){
            choices = {none: "Don't Swap Dice", pool: "1 <strong>" + poolType + "</strong> to swap to <strong>" + swipSwap + "</strong>", flex: "1 <strong>Flex</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else if (!poolValue && flexValue && swapPossible){
            choices = {none: "Don't Swap Dice", flex: "1 <strong>Flex</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else if (poolValue && !flexValue && swapPossible){
            choices = {none: "Don't Swap Dice", pool: "1 <strong>" + poolType + "</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else {
            radioStatus = false
        }
        
        let chosen = "none";
        const template = "systems/eclipsephase/templates/chat/damage-gun-dialog.html";
        const html = await renderTemplate(template, {weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, groupName, choices, chosen, radioStatus});
        return new Promise(resolve => {
            const data = {
                title: weaponName[0].toUpperCase() + weaponName.slice(1) + " Damage Roll",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
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
        let choices = {};
        let radioStatus = true
        if (poolValue && flexValue && swapPossible){
            choices = {none: "Don't Swap Dice", pool: "1 <strong>" + poolType + "</strong> to swap to <strong>" + swipSwap + "</strong>", flex: "1 <strong>Flex</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else if (!poolValue && flexValue && swapPossible){
            choices = {none: "Don't Swap Dice", flex: "1 <strong>Flex</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else if (poolValue && !flexValue && swapPossible){
            choices = {none: "Don't Swap Dice", pool: "1 <strong>" + poolType + "</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else {
            radioStatus = false
        }
        
        let chosen = "none";
        const template = "systems/eclipsephase/templates/chat/damage-melee-dialog.html";
        const html = await renderTemplate(template, {weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, groupName, choices, chosen, radioStatus, meleeDamageMod});
        return new Promise(resolve => {
            const data = {
                title: weaponName[0].toUpperCase() + weaponName.slice(1) + " Damage Roll",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
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
    
    async function GetSwipSwapOptions(swipSwap, poolValue, actorType, poolType, flexValue, successName, swapPossible, severityFlavor) {
        let groupName = "useSwap";
        if (severityFlavor){
            groupName = "useMitigate";
        }
        let choices = {};
        let radioStatus = true
        if (severityFlavor && poolValue && flexValue){
            choices = {none: "Don't Mitigate Failure",pool: "1 <strong>" + poolType  + "</strong> to mitigate",flex: "1 <strong>Flex</strong> to mitigate"};
        }
        else if (severityFlavor && !poolValue && flexValue){
            choices = {none: "Don't Mitigate Failure",flex: "1 <strong>Flex</strong> to mitigate"};
        }
        else if (severityFlavor && poolValue && !flexValue){
            choices = {none: "Don't Mitigate Failure",pool: "1 <strong>" + poolType + "</strong> to mitigate"};
        }
        else if (poolValue && flexValue){
            choices = {none: "Don't Swap Dice",pool: "1 <strong>" + poolType + "</strong> to swap to <strong>" + swipSwap + "</strong>",flex: "1 <strong>Flex</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else if (!poolValue && flexValue){
            choices = {none: "Don't Swap Dice",flex: "1 <strong>Flex</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else if (poolValue && !flexValue){
            choices = {none: "Don't Swap Dice",pool: "1 <strong>" + poolType + "</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else {
            radioStatus = false
        }
        
        let chosen = "none";
        const template = "systems/eclipsephase/templates/chat/swap-dialog.html";
        const html = await renderTemplate(template, {swipSwap, poolValue, actorType, poolType, flexValue, successName, swapPossible, severityFlavor, groupName, choices, chosen, radioStatus});
        return new Promise(resolve => {
            const data = {
                title: "Swap Roll",
                content: html,
                dv: weaponDamage,
                buttons: {
                    normal: {
                        label: "Use this Selection",
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

    async function GetRaiseOptions(successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType) {
        let groupName = "useSwap";
        let choices = {};
        let radioStatus = true
        if (poolValue && flexValue && swapPossible){
            choices = {none: "Don't Swap Dice", pool: "1 <strong>" + poolType + "</strong> to swap to <strong>" + swipSwap + "</strong>", flex: "1 <strong>Flex</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else if (!poolValue && flexValue && swapPossible){
            choices = {none: "Don't Swap Dice", flex: "1 <strong>Flex</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else if (poolValue && !flexValue && swapPossible){
            choices = {none: "Don't Swap Dice", pool: "1 <strong>" + poolType + "</strong> to swap to <strong>" + swipSwap + "</strong>"};
        }
        else {
            radioStatus = false
        }
        
        let chosen = "none";
        const template = "systems/eclipsephase/templates/chat/raise-dialog.html";
        const html = await renderTemplate(template, {successName, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, groupName, choices, chosen, radioStatus});
        return new Promise(resolve => {
            const data = {
                title: "Raise Roll",
                content: html,
                buttons: {
                    normal: {
                        label: "Use this Selection",
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
