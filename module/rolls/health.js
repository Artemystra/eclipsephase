import { DAMAGE_STATUS_OUTPUT, rollToChat } from "./dice.js";
import { drugHealingAddition } from "./modifiers.js";
import { takeDamage } from "./damage.js";

// The health bars on the sheet and healing: the bars follow damage and stress as they change, and
// the heal buttons run the healing dialog. Taking damage itself lives in damage.js.

//Character Healing & Damage
//Animate health bars on character sheet reload
export async function healthBarChange(actor, html) {
  const actorModel = actor.system;
  const barModifier = actorModel.health.barModifier;

  //Physical Variable Definition
  const physicalHealthBarContainer = html.querySelector("#physicalHealthBarContainer");
  const physicalDeathBarContainer = html.querySelector("#physicalDeathBarContainer");
  const physicalHealthBar = html.querySelector("#physicalHealthBar");
  const physicalDeathBar = html.querySelector("#physicalDeathBar");
  const healthBarValue = actorModel.physical.relativePhysicalDamage;
  const deathBarValue = actorModel.physical.relativeDeathDamage;
  const oldHealthBarValue = actorModel.physical.oldHealthBarValue ? actorModel.physical.oldHealthBarValue : 0;
  const oldDeathBarValue = actorModel.physical.oldDeathBarValue ? actorModel.physical.oldDeathBarValue : 0;
  const currentWounds = actor.system.physical.wounds;
  const woundThreshold = actor.system.physical.wt;
  const physicalHealthTarget = "system.health.physical.value";
  const woundTarget = "system.physical.wounds";
  const currentPhysicalDamage = actor.system.health.physical.value;
  const receivePhysicalDamage = html.querySelector("#receivePhysicalDamage");
  const maxPhysicalHealth = actor.system.health.physical.max + actor.system.health.death.max;

  //Physical Container Definition (Depends on Body type chosen)
  if (physicalHealthBarContainer) physicalHealthBarContainer.style.width = actorModel.physical.relativeDurabilityContainer + "%";
  if (physicalDeathBarContainer) physicalDeathBarContainer.style.width = actorModel.physical.relativeDeathContainer + "%";

  //Mental Variable Definition
  const currentMentalDamage = Number(actor.system.health.mental.value);
  const receiveMentalDamage = html.querySelector("#receiveMentalDamage");
  const mentalStressBar = html.querySelector("#mentalStressBar");
  const mentalInsanityBar = html.querySelector("#mentalInsanityBar");
  const stressBarValue = actorModel.mental.relativeStressDamage;
  const insanityBarValue = actorModel.mental.relativeInsanityDamage;
  const currentTrauma = actor.system.mental.trauma;
  const traumaThreshold = actor.system.mental.tt;
  const mentalHealthTarget = "system.health.mental.value";
  const traumaTarget = "system.mental.trauma";
  const oldStressBarValue = actorModel.mental.oldStressBarValue ? Number(actorModel.mental.oldStressBarValue) : 0;
  const oldInsanityBarValue = actorModel.mental.oldInsanityBarValue ? Number(actorModel.mental.oldInsanityBarValue) : 0;
  const maxMentalHealth = actor.system.health.mental.max + actor.system.health.insanity.max;

  //Physical health bar animation
  //Physical damage Animation
  if (barModifier === "physicalUp") {
    await barUp(physicalHealthBar, physicalDeathBar, oldHealthBarValue, oldDeathBarValue, healthBarValue, deathBarValue, actor, "physical");
  }
  //Physical Heal Animation
  else if (barModifier === "physicalDown") {
    if (physicalHealthBar) physicalHealthBar.style.width = oldHealthBarValue + "%";
    if (physicalDeathBar) physicalDeathBar.style.width = oldDeathBarValue + "%";
    await barDown(physicalHealthBar, physicalDeathBar, oldHealthBarValue, oldDeathBarValue, healthBarValue, deathBarValue, actor, "physical");
  }
  //No change/Open sheet
  else {
    if (physicalHealthBar) physicalHealthBar.style.width = healthBarValue + "%";
    if (physicalDeathBar) physicalDeathBar.style.width = deathBarValue + "%";
  }

  //Mental health bar animation
  if (actor.type != "goon") {
    //Mental damage Animation
    if (barModifier === "mentalUp") {
      await barUp(mentalStressBar, mentalInsanityBar, oldStressBarValue, oldInsanityBarValue, stressBarValue, insanityBarValue, actor, "mental");
    }
    //Mental Heal Animation
    else if (barModifier === "mentalDown") {
      if (mentalStressBar) mentalStressBar.style.width = oldStressBarValue + "%";
      if (mentalInsanityBar) mentalInsanityBar.style.width = oldInsanityBarValue + "%";
      await barDown(mentalStressBar, mentalInsanityBar, oldStressBarValue, oldInsanityBarValue, stressBarValue, insanityBarValue, actor, "mental");
    }
    //No Change/Open Sheet
    else {
      if (mentalStressBar) mentalStressBar.style.width = stressBarValue + "%";
      if (mentalInsanityBar) mentalInsanityBar.style.width = insanityBarValue + "%";
    }
  }

  //Take Physical Damage
  html.querySelector("#takePhysicalDamage")?.addEventListener("click",
    takeDamage.bind("physical", receivePhysicalDamage, currentPhysicalDamage, healthBarValue, deathBarValue, currentWounds, woundThreshold, physicalHealthTarget, woundTarget, actor, "physical", maxPhysicalHealth)
  );

  //Take Mental Damage
  html.querySelector("#takeMentalDamage")?.addEventListener("click",
    takeDamage.bind("mental", receiveMentalDamage, currentMentalDamage, stressBarValue, insanityBarValue, currentTrauma, traumaThreshold, mentalHealthTarget, traumaTarget, actor, "mental", maxMentalHealth)
  );

  //Mental Heal Full
  html.querySelector("#healMentalDamageFull")?.addEventListener("click",
    healDamage.bind("mentalHeal", currentMentalDamage, stressBarValue, insanityBarValue, currentTrauma, traumaThreshold, mentalHealthTarget, traumaTarget, actor, "full", "mental")
  );

  //Physical Heal Full
  html.querySelector("#healPhysicalDamageFull")?.addEventListener("click",
    healDamage.bind("physicalHeal", currentPhysicalDamage, healthBarValue, deathBarValue, currentWounds, woundThreshold, physicalHealthTarget, woundTarget, actor, "full", "physical")
  );

  //Mental Heal Partial
  html.querySelector("#healMentalDamagePartial")?.addEventListener("click",
    healDamage.bind("mentalHeal", currentMentalDamage, stressBarValue, insanityBarValue, currentTrauma, traumaThreshold, mentalHealthTarget, traumaTarget, actor, "partial", "mental")
  );

  //Physical Heal Partial
  html.querySelector("#healPhysicalDamagePartial")?.addEventListener("click",
    healDamage.bind("physicalHeal", currentPhysicalDamage, healthBarValue, deathBarValue, currentWounds, woundThreshold, physicalHealthTarget, woundTarget, actor, "partial", "physical")
  );
}

//Heal damage through character sheet
async function healDamage(currentDamage, bar, overBar, currentModifier, threshold, damageTarget, modifierTarget, actor, healType, healTarget) {
  let newDamage = 0;
  let newModifier = currentModifier;
  let oldDamageBarTarget = "";
  let oldOverBarTarget = "";
  let damageCount = currentDamage;
  let woundCount = currentModifier;
  let healFormula;
  let message = {};
  const activeMorphType = actor.system.physical.activeMorphType;
  message.totalDamage = currentDamage + currentModifier;

  //Dialog args
  const dialog = "systems/eclipsephase/templates/chat/pop-up.html";
  const dialogType = "healDamage";
  let enhancements = {};
  let enhancementsCount = 0;
  let hoursPassed = 0;

  for (let enhancement in actor.system.additionalSystems.healing) {
    enhancements[enhancement] = true;
    enhancementsCount++;
  }

  const barModifierTarget = "system.health.barModifier";
  let barModifier = "";

  if (healTarget === "mental") {
    message.title = "ep2e.roll.announce.heal.full.mindHeal";
    message.damageType = "ep2e.roll.announce.heal.full.stress";
    message.modifierType = "ep2e.roll.announce.heal.full.trauma";
    oldDamageBarTarget = "system.mental.oldStressBarValue";
    oldOverBarTarget = "system.mental.oldInsanityBarValue";
    barModifier = "mentalDown";
  }
  else if (healTarget === "physical") {
    switch (activeMorphType) {
      case "bio":
        message.title = "ep2e.roll.announce.heal.full.bodyHeal";
        break;
      case "synth":
        message.title = "ep2e.roll.announce.heal.full.bodyRepair";
        break;
      case "info":
        message.title = "ep2e.roll.announce.heal.full.bodyDefrag";
        break;
      default:
        break;
    }
    message.damageType = "ep2e.roll.announce.heal.full.damage";
    message.modifierType = "ep2e.roll.announce.heal.full.wounds";
    oldDamageBarTarget = "system.physical.oldHealthBarValue";
    oldOverBarTarget = "system.physical.oldDeathBarValue";
    barModifier = "physicalDown";
  }

  if (message.totalDamage > 0) {
    if (healType === "partial") {
      healFormula = await healingDialog(dialog, healTarget, dialogType, enhancements, enhancementsCount, drugHealingAddition(actor));

      if (healFormula.cancelled) {
        return;
      }

      let healRoll = [];
      let repetition = 0;

      if (damageCount > 0 && (healFormula.heal).length > 0) {
        for (let i = 1; i <= healFormula.duration; i++) {
          hoursPassed++;

          if (repetition >= (healFormula.heal).length) {
            hoursPassed--;
            break;
          }

          if (damageCount > 0 && healFormula.heal[repetition].cycle === hoursPassed) {
            let rollFormula = healFormula.heal[repetition].roll;

            let arrayItem = await new Roll(rollFormula).evaluate();
            healRoll.push(arrayItem);

            damageCount = damageCount - healRoll[repetition]._total > 0 ? damageCount - healRoll[repetition]._total : 0;
            repetition++;
          }

          if (damageCount === 0) {
            break;
          }
        }
      }

      if (hoursPassed > healFormula.duration) {
        hoursPassed--;
      }

      if (healTarget === "physical") {
        message.weeksValue = Math.floor(hoursPassed / 168);
        message.daysValue = Math.floor((hoursPassed - message.weeksValue * 168) / 24);
        message.hoursValue = (hoursPassed - message.weeksValue * 168) % 24;
      }
      if (healTarget === "mental") {
        message.weeksValue = Math.floor(hoursPassed / 7);
        message.daysValue = Math.floor((hoursPassed - message.weeksValue * 7));
      }

      let rollCount = repetition;
      let woundHealing = 0;
      repetition = 0;
      if ((healFormula.wound).length > 0 && woundCount > 0) {
        if (healFormula.wound[repetition].cycle + hoursPassed <= healFormula.duration) {
          for (woundHealing; woundHealing <= healFormula.duration - hoursPassed; woundHealing++) {
            if (repetition >= (healFormula.wound).length || healFormula.wound[repetition].cycle + hoursPassed > healFormula.duration) {
              hoursPassed--;
              break;
            }

            if (healFormula.wound[repetition].cycle === woundHealing) {
              woundCount = woundCount - healFormula.wound[repetition].heal > 0 ? woundCount - healFormula.wound[repetition].heal : 0;
              repetition++;
            }

            if (woundCount === 0) {
              break;
            }

            if (woundCount != 0 && woundHealing === healFormula.duration - hoursPassed && repetition === (healFormula.wound).length) {
              break;
            }
          }
        }
      }

      hoursPassed += woundHealing;
      message.roll = true;
      message.rollTimes = "ep2e.roll.announce.heal.partial.rollTimes";
      message.rollLength = rollCount;
      message.title = "ep2e.roll.announce.heal.partial.rollCopy";
      message.weeksLabel = "ep2e.roll.announce.heal.partial.weeks";
      message.daysLabel = "ep2e.roll.announce.heal.partial.days";
      message.hoursLabel = "ep2e.roll.announce.heal.partial.hours";
      message.rollTitle = "ep2e.roll.announce.total";

      if (healRoll.length > 0) {
        if (healRoll.length === 1) {
          await rollToChat(null, message, DAMAGE_STATUS_OUTPUT, healRoll[0], actor.name, game.user._id, false, "rollOutput");
        }
        else {
          await rollToChat(null, message, DAMAGE_STATUS_OUTPUT, healRoll, actor.name, game.user._id, false, "rollOutput");
        }
      }

      newDamage = damageCount;
      newModifier = woundCount;

      if (healTarget === "physical") {
        message.weeksValue = Math.floor(hoursPassed / 168);
        message.daysValue = Math.floor((hoursPassed - message.weeksValue * 168) / 24);
        message.hoursValue = (hoursPassed - message.weeksValue * 168) % 24;
      }
      else {
        message.weeksValue = Math.floor(hoursPassed / 7);
        message.daysValue = Math.floor((hoursPassed - message.weeksValue * 7));
        message.hoursValue = false;
      }

      message.damageValue = newDamage > 0 ? currentDamage - damageCount : currentDamage;
      message.modifierValue = newModifier > 0 ? currentModifier - woundCount : currentModifier;
    }
    else if (healType === "full") {
      newModifier = 0;

      message.damageValue = currentDamage;
      message.modifierValue = currentModifier;
    }

    message.roll = false;
    if (message.weeksValue || message.daysValue || message.hoursValue) {
      message.timeframe = true;
      message.timeframeLabel = "ep2e.roll.announce.heal.partial.timeframeLabel";
    }
  }
  else {
    message.title = "ep2e.roll.announce.heal.partial.fullCopy";
  }

  if (currentDamage === damageCount && currentModifier === woundCount && message.totalDamage > 0 && healType != "full") {
    message.title = "ep2e.roll.announce.heal.partial.notEnoughTime";
    message.subheader = "ep2e.roll.announce.heal.partial.minimumTimeframe";
    let hoursPassedHealth = healFormula.minimumHealingCycles.health;
    let hoursPassedWounds = healFormula.minimumHealingCycles.modifier;
    if (healTarget === "physical") {
      message.weeksValueHealth = Math.floor(hoursPassedHealth / 168);
      message.daysValueHealth = Math.floor((hoursPassedHealth - message.weeksValueHealth * 168) / 24);
      message.hoursValueHealth = (hoursPassedHealth - message.weeksValueHealth * 168) % 24;
      message.weeksValueWounds = Math.floor(hoursPassedWounds / 168);
      message.daysValueWounds = Math.floor((hoursPassedWounds - message.weeksValueWounds * 168) / 24);
      message.hoursValueWounds = (hoursPassedWounds - message.weeksValueWounds * 168) % 24;
    }
    else {
      message.weeksValueHealth = Math.floor(hoursPassedHealth / 7);
      message.daysValueHealth = Math.floor((hoursPassedHealth - message.weeksValueHealth * 7));
      message.hoursValueHealth = false;
      message.weeksValueWounds = Math.floor(hoursPassedWounds / 7);
      message.daysValueWounds = Math.floor((hoursPassedWounds - message.weeksValueWounds * 7));
      message.hoursValueWounds = false;
    }
    message.noTime = true;
    message.totalDamage = 0;
  }

  if (actor.type === "character") {
    let html = await foundry.applications.handlebars.renderTemplate(DAMAGE_STATUS_OUTPUT, message);

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: html
    });
  }
  else if (actor.type != "character") {
    let html = await foundry.applications.handlebars.renderTemplate(DAMAGE_STATUS_OUTPUT, message);

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: html,
      whisper: ChatMessage.getWhisperRecipients("GM")
    });
  }

  return actor.update({
    [damageTarget]: newDamage,
    [modifierTarget]: newModifier,
    [oldDamageBarTarget]: bar,
    [oldOverBarTarget]: overBar,
    [barModifierTarget]: barModifier
  });
}

// A bar animation in progress, by actor and track. A sheet drawn again while the bars move - the
// actor updated once more meanwhile - hands its new bars to the animation already running, which
// goes on from where it is instead of a second one starting over from the old values.
const RUNNING_BARS = new Map();

/**
 * Moves a pair of bars from their old widths to their new ones, one step at a time, then marks
 * the change as shown. Joins the animation already running for the same actor and track, if any.
 * @param {Object} bars - bar and overBar, the elements to move
 * @param {Object} steps - [part, from, to] in the order the parts move
 * @param {Actor} actor - The actor
 * @param {String} barType - "physical" or "mental"
 * @returns {Promise<*>} Resolves once the change is shown
 */
async function animateBars(bars, steps, actor, barType) {
  if (!bars.bar || !bars.overBar) return actor.update({ "system.health.barModifier": "none" });
  const key = `${actor.uuid}:${barType}`;
  const running = RUNNING_BARS.get(key);
  if (running) {
    running.bars = bars;
    paintBars(running);
    return running.done;
  }

  const state = { bars, bar: null, overBar: null, done: null };
  for (const [part, from] of steps) state[part] = from;
  RUNNING_BARS.set(key, state);
  state.done = (async () => {
    try {
      paintBars(state);
      for (const [part, from, to] of steps) {
        const step = to >= from ? 1 : -1;
        for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
          await new Promise(resolve => setTimeout(resolve, 7));
          state[part] = i;
          paintBars(state);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    } finally {
      RUNNING_BARS.delete(key);
    }
    return actor.update({ "system.health.barModifier": "none" });
  })();
  return state.done;
}

/**
 * Sets the bars of an animation to where it stands.
 * @param {Object} state - The animation's bars and widths
 * @returns {void}
 */
function paintBars(state) {
  if (state.bars.bar && state.bar !== null) state.bars.bar.style.width = state.bar + "%";
  if (state.bars.overBar && state.overBar !== null) state.bars.overBar.style.width = state.overBar + "%";
}

//Animate bar going up (e.g. taking damage)
async function barUp(bar, overBar, oldBarValue, oldOverBarValue, barValue, overBarValue, actor, barType) {
  return animateBars({ bar, overBar }, [["bar", oldBarValue, barValue], ["overBar", oldOverBarValue, overBarValue]], actor, barType);
}

//Animate bar going down (e.g. healing)
async function barDown(bar, overBar, oldBarValue, oldOverBarValue, barValue, overBarValue, actor, barType) {
  return animateBars({ bar, overBar }, [["overBar", oldOverBarValue, overBarValue], ["bar", oldBarValue, barValue]], actor, barType);
}

//Special Dialogs

async function healingDialog(dialog, type, dialogType, enhancements, enhancementsCount, presetAddition = "") {
  const dialogName = game.i18n.localize("ep2e.skills.pool.dialogHeadline");
  const cancelButton = game.i18n.localize("ep2e.roll.dialog.button.cancel");
  const confirmButton = game.i18n.localize("ep2e.actorSheet.button.confirm");

  const content = await foundry.applications.handlebars.renderTemplate(dialog, {
    type,
    dialogType,
    enhancements,
    enhancementsCount,
    presetAddition
  });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: dialogName },
    classes: ["ep2e-primary-right"],
    content,
    buttons: [
      {
        action: "confirm",
        label: confirmButton,
        default: true,
        callback: (event, button) => {
          return _healingResult(button.form, enhancements, type);
        }
      },
      {
        action: "cancel",
        label: cancelButton,
        callback: () => ({ cancelled: true })
      }
    ],
    position: { width: 315 },
    modal: true,
    rejectClose: false
  });

  return result ?? { cancelled: true };
}

//Healing configurator
function _healingResult(form, enhancements, type) {
  let addition;
  let durationMultiplier = form.durationMultiplier.value ? form.durationMultiplier.value : 1;
  let duration;
  let circumstances;
  let healingBasis;
  let healingAddition;
  let healCycle = [];
  let woundCycle = [];

  if (type === "physical") {
    addition = form.addition.value;
    duration = form.duration.value === "weeks" ? durationMultiplier * 168 : form.duration.value === "days" ? durationMultiplier * 24 : durationMultiplier * 1;
    circumstances = form.circumstances.value === "harsh" ? 3 : form.circumstances.value === "poor" ? 2 : 1;
    healingBasis = enhancements.medichines === true ? { "dice": "1d10", "timeframe": 1 * circumstances, "woundCycle": 24 * circumstances } : enhancements.biomods === true ? { "dice": "1d10", "timeframe": 12 * circumstances, "woundCycle": 72 * circumstances } : { "dice": "1d10", "timeframe": 24 * circumstances, "woundCycle": 168 * circumstances };
    healingAddition = addition === "tank" ? { "dice": "2d10", "timeframe": 1, "woundCycle": 2, "limit": false } : addition === "spray" ? { "dice": "1d10", "timeframe": 1, "woundCycle": false, "limit": 12 } : addition === "fixers" ? { "dice": "1d10", "timeframe": 1, "woundCycle": 24, "limit": 140 } : addition === "meds" ? { "dice": "1d10", "timeframe": 1, "woundCycle": 24, "limit": 24 } : false;
    let limit = healingAddition.limit ? healingAddition.limit : duration;

    for (let arrayConstructor = 0; arrayConstructor <= duration + 1; arrayConstructor++) {
      if (arrayConstructor > 0) {
        if (healingAddition && Number.isInteger(arrayConstructor / healingBasis.timeframe) && arrayConstructor <= limit) {
          healCycle.push({ "cycle": arrayConstructor, "roll": healingBasis.dice + " + " + healingAddition.dice });
        }
        else if (healingAddition && !Number.isInteger(arrayConstructor / healingBasis.timeframe) && arrayConstructor <= limit) {
          healCycle.push({ "cycle": arrayConstructor, "roll": healingAddition.dice });
        }
        else if (Number.isInteger(arrayConstructor / healingBasis.timeframe)) {
          healCycle.push({ "cycle": arrayConstructor, "roll": healingBasis.dice });
        }

        if (healingAddition && Number.isInteger(arrayConstructor / healingAddition.woundCycle) && Number.isInteger(arrayConstructor / healingBasis.woundCycle) && arrayConstructor <= limit) {
          woundCycle.push({ "cycle": arrayConstructor, "heal": 2, "limit": limit });
        }
        else if (healingAddition && Number.isInteger(arrayConstructor / healingAddition.woundCycle) && arrayConstructor <= limit) {
          woundCycle.push({ "cycle": arrayConstructor, "heal": 1, "limit": limit });
        }
        else if (Number.isInteger(arrayConstructor / healingBasis.woundCycle)) {
          woundCycle.push({ "cycle": arrayConstructor, "heal": 1, "limit": false });
        }
      }
    }

    let minimumHealingCycles = {};
    minimumHealingCycles.health = healingAddition ? healingAddition.timeframe < healingBasis.timeframe ? healingAddition.timeframe : healingBasis.timeframe : healingBasis.timeframe;
    minimumHealingCycles.modifier = healingAddition ? healingAddition.woundCycle < healingBasis.woundCycle ? healingAddition.woundCycle : healingBasis.woundCycle : healingBasis.woundCycle;

    return {
      duration: duration,
      heal: healCycle,
      wound: woundCycle,
      minimumHealingCycles: minimumHealingCycles
    };
  }

  if (type === "mental") {
    addition = form.addition.checked;
    duration = form.duration.value === "weeks" ? durationMultiplier * 7 : durationMultiplier * 1;

    for (let arrayConstructor = 0; arrayConstructor <= duration + 1; arrayConstructor++) {
      if (arrayConstructor > 0) {
        if (addition) {
          healCycle.push({ "cycle": arrayConstructor, "roll": "1d6" });
        }
        else if (Number.isInteger(arrayConstructor / 7) && !addition) {
          healCycle.push({ "cycle": arrayConstructor, "roll": "1d6" });
        }

        if (Number.isInteger(arrayConstructor / 7) && addition) {
          woundCycle.push({ "cycle": arrayConstructor, "heal": 1, "limit": false });
        }
        else if (Number.isInteger(arrayConstructor / 30) && addition) {
          woundCycle.push({ "cycle": arrayConstructor, "heal": 1, "limit": false });
        }
      }
    }

    let minimumHealingCycles = {};
    minimumHealingCycles.health = addition ? 1 : 7;
    minimumHealingCycles.modifier = addition ? 7 : 30;

    return {
      duration: duration,
      heal: healCycle,
      wound: woundCycle,
      minimumHealingCycles: minimumHealingCycles
    };
  }
}
