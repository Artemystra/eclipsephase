import { weaponPreparation } from "../common/weapon-functions.js"
import { damageValueCalc } from "../common/common-sheet-functions.js"
import { WEAPON_DAMAGE_OUTPUT, DAMAGE_STATUS_OUTPUT, rollToChat } from "./dice.js"
import { prepareRecipients } from "../common/common-sheet-functions.js"

export async function prepareWeapon(data, result, preparedData){
    /*const messageID = data.target.closest(`[data-message-id]`).dataset.messageId
    console.log("messageID: ", game.messages.get(messageID))*/
    const dataset = preparedData ? preparedData : data.currentTarget.dataset;

    /*let unlinkedActorToken
    if(dataset.tokenid){
      unlinkedActorToken = await fromUuid(dataset.tokenid)
      console.log("Ping")
      console.log(unlinkedActorToken)
      console.log(unlinkedActorToken.actors.values().next().value)
    }*/

    const actorWhole = await fromUuid(dataset.actorid);
    const weaponID = dataset.weaponid;
    const selectedWeaponMode = dataset.weaponmode;
    const rolledFrom = dataset.rolledfrom;
    const skillKey = rolledFrom === "ccWeapon" ? "melee" : "guns"
    const rollResult = dataset.rollresult ? parseInt(dataset.rollresult) : result;
    const biomorphTarget = dataset.biomorphtarget === "true" ? true : false
    const touchOnly = dataset.touchonly === "true" ? true : false
    const attackMode = dataset.attackmode
    const rollMode = dataset.rollmode
    const blind = rollMode === "blindroll" ? game.user.isGM ? false : true : false
    let modeDamage
    if(attackMode === "burst" || attackMode === "aggressive" || attackMode === "aggressiveCharge")
        modeDamage = "+1d10"
    else if(attackMode === "charge")
        modeDamage = "+1d6"
    else if(attackMode === "fullAuto")
        modeDamage = "+2d10"
    else
        modeDamage = ""

    let recipientList = prepareRecipients(rollMode)
    
    let weaponSelected = await weaponPreparation(actorWhole, skillKey, rolledFrom, weaponID, selectedWeaponMode)
    
    if(rollResult > 2 && rollResult < 6 || rollResult === 7 || rollResult === 9)
        await dealWeaponDamage(actorWhole, weaponSelected, rollResult, modeDamage, biomorphTarget, touchOnly, blind, recipientList)


    else if (weaponSelected.weaponTraits.automatedEffects.dvOnMiss){
        let damageCalc = await damageValueCalc({type: "kinetic"},  weaponSelected.weaponTraits.automatedEffects.dvOnMiss.dv, null, "ammo")
        let rollFormula = damageCalc.dv

        //The message is built
        let message = {}
                        
        message.type = "damage";
        message.weaponName = weaponSelected.weaponName;
        message.ammoLoadedName = rolledFrom === "rangedWeapon" ? weaponSelected.weapon.system.ammoSelected.name : null

        //Weapon traits are added
        message.weaponTraits = weaponSelected.weaponTraits.additionalEffects
        message.weaponTraits["dvOnMiss"] = weaponSelected.weaponTraits.automatedEffects["dvOnMiss"]
        message.weaponTraits.dvOnMiss["calculated"] = rollFormula
        message.rollTitle = "ep2e.roll.announce.damageDone"

        let roll = await new Roll(rollFormula).evaluate();

        await rollToChat(null, message, WEAPON_DAMAGE_OUTPUT, roll, actorWhole.name, recipientList, blind, "rollOutput")

    }

}

async function dealWeaponDamage(actorWhole, weaponSelected, rollResult, modeDamage, biomorphTarget, touchOnly, blind, recipientList){
    let meleeDamageMod = actorWhole.system.mods.meleeDamageMod
    let successModifier = "";
    let criticalModifier = "";
    let weaponDamage = touchOnly ? "ep2e.item.weapon.table.noDamage" : weaponSelected.weaponDamage

    if(rollResult === 4)
        successModifier = "+1d6";

    else if(rollResult === 5)
        successModifier = "+2d6";

    else if(rollResult === 7 || rollResult === 9){
        criticalModifier = "2*(";
        successModifier = ")";
    }
    
    //Damage Chat Message Constructor
    let intermediateRollFormula
    let rollFormula = null

    if(weaponSelected.rolledFrom === "ccWeapon")
        intermediateRollFormula =  weaponDamage + modeDamage + (meleeDamageMod ? meleeDamageMod : "") + (biomorphTarget ? " + 1d6" : "") + successModifier;
    else
        intermediateRollFormula =  weaponDamage + modeDamage + (biomorphTarget ? " + 1d6" : "") + successModifier;


    if (criticalModifier && !weaponSelected.weaponTraits.automatedEffects.dvHalved) {
        rollFormula = criticalModifier + (intermediateRollFormula);
    }
    else if (!criticalModifier && !weaponSelected.weaponTraits.automatedEffects.dvHalved){
        rollFormula = intermediateRollFormula;
    }
    else if (!criticalModifier && weaponSelected.weaponTraits.automatedEffects.dvHalved){
        rollFormula = "ceil((" + intermediateRollFormula + ")/2)";
    }
    else {
        rollFormula = "ceil((" + criticalModifier + (intermediateRollFormula) + ")/2)";
    }
    //The message is built
    let message = {}
    
    message.type = "damage";
    message.weaponName = weaponSelected.weaponName;
    message.ammoLoadedName = weaponSelected.rolledFrom === "rangedWeapon" ? weaponSelected.weapon.system.ammoSelected.name : null
    message.rollTitle = "ep2e.roll.announce.damageDone"

    //Weapon traits that are applied on the roll result
    message.weaponTraits = weaponSelected.weaponTraits.additionalEffects;
    if (biomorphTarget){
        message.weaponTraits["bioMorphsOnly"] = weaponSelected.weaponTraits.confirmationEffects["bioMorphsOnly"]
    }

    //Weapon Traits object gets deleted, if it's empty
    if (!Object.keys(message.weaponTraits).length > 0){
        delete message.weaponTraits
    }

    if (!weaponSelected.weaponTraits.automatedEffects.noDamage && weaponDamage != "ep2e.item.weapon.table.noDamage"){
        let roll = await new Roll(rollFormula).evaluate();

        await rollToChat(null, message, WEAPON_DAMAGE_OUTPUT, roll, actorWhole.name, recipientList, blind, "rollOutput")

    }
    else {
        message.total = false

        await rollToChat(null, message, WEAPON_DAMAGE_OUTPUT, false, actorWhole.name, recipientList, blind, "rollOutput")

    }
}


//Character Healing & Damage
//Animate health bars on character sheet reload
export async function healthBarChange(actor, html){
    const actorModel = actor.system;
    const barModifier = actorModel.health.barModifier
  
    //Physical Variable Definition
    const physicalHealthBarContainer = html.find("#physicalHealthBarContainer");
    const physicalDeathBarContainer = html.find("#physicalDeathBarContainer");
    const physicalHealthBar = html.find("#physicalHealthBar");
    const physicalDeathBar = html.find("#physicalDeathBar");
    const healthBarValue = actorModel.physical.relativePhysicalDamage;
    const deathBarValue = actorModel.physical.relativeDeathDamage;
    const oldHealthBarValue = actorModel.physical.oldHealthBarValue ? actorModel.physical.oldHealthBarValue : 0;
    const oldDeathBarValue = actorModel.physical.oldDeathBarValue ? actorModel.physical.oldDeathBarValue : 0;
    const currentWounds = actor.system.physical.wounds;
    const woundThreshold = actor.system.physical.wt;
    const physicalHealthTarget = "system.health.physical.value";
    const woundTarget = "system.physical.wounds";
    const currentPhysicalDamage = actor.system.health.physical.value;
    const receivePhysicalDamage = html.find("#receivePhysicalDamage");
    const maxPhysicalHealth = actor.system.health.physical.max + actor.system.health.death.max;
  
    //Physical Container Definition (Depends on Body type chosen)
    physicalHealthBarContainer[0].style.width = actorModel.physical.relativeDurabilityContainer + "%";
    physicalDeathBarContainer[0].style.width = actorModel.physical.relativeDeathContainer + "%";
  
    //Mental Variable Definition
    const currentMentalDamage = Number(actor.system.health.mental.value);
    const receiveMentalDamage = html.find("#receiveMentalDamage");
    const mentalStressBar = html.find("#mentalStressBar");
    const mentalInsanityBar = html.find("#mentalInsanityBar");
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
    if(barModifier === "physicalUp"){
      await barUp(physicalHealthBar, physicalDeathBar, oldHealthBarValue, oldDeathBarValue, healthBarValue, deathBarValue, actor, "physical")
  
    }
    //Physical Heal Animation
    else if (barModifier === "physicalDown"){
      physicalHealthBar[0].style.width = oldHealthBarValue + "%";
      physicalDeathBar[0].style.width = oldDeathBarValue + "%";
      await barDown(physicalHealthBar, physicalDeathBar, oldHealthBarValue, oldDeathBarValue, healthBarValue, deathBarValue, actor, "physical")
  
    }
    //No change/Open sheet
    else{
      physicalHealthBar[0].style.width = healthBarValue + "%";
      physicalDeathBar[0].style.width = deathBarValue + "%";
    }
  
    //Mental health bar animation
    if(actor.type != "goon"){
      //Mental damage Animation
      if(barModifier === "mentalUp"){
        await barUp(mentalStressBar, mentalInsanityBar, oldStressBarValue, oldInsanityBarValue, stressBarValue, insanityBarValue, actor, "mental")
  
      }
      //Mental Heal Animation
      else if (barModifier === "mentalDown"){
        mentalStressBar[0].style.width = oldStressBarValue + "%";
        mentalInsanityBar[0].style.width = oldInsanityBarValue + "%";
        await barDown(mentalStressBar, mentalInsanityBar, oldStressBarValue, oldInsanityBarValue, stressBarValue, insanityBarValue, actor, "mental")
    
      }
      //No Change/Open Sheet
      else{
        mentalStressBar[0].style.width = stressBarValue + "%";
        mentalInsanityBar[0].style.width = insanityBarValue + "%";
      }
    }
  
    //Take Physical Damage
    html.find("#takePhysicalDamage").click(takeDamage.bind("physical" ,receivePhysicalDamage, currentPhysicalDamage, healthBarValue, deathBarValue, currentWounds, woundThreshold, physicalHealthTarget, woundTarget, actor, "physical", maxPhysicalHealth));
  
    //Take Mental Damage
    html.find("#takeMentalDamage").click(takeDamage.bind("mental", receiveMentalDamage, currentMentalDamage, stressBarValue, insanityBarValue, currentTrauma, traumaThreshold, mentalHealthTarget, traumaTarget, actor, "mental", maxMentalHealth));
  
    //Mental Heal Full
    html.find("#healMentalDamageFull").click(healDamage.bind("mentalHeal", currentMentalDamage, stressBarValue, insanityBarValue, currentTrauma, traumaThreshold, mentalHealthTarget, traumaTarget, actor, "full", "mental"));
  
    //Physical Heal Full
    html.find("#healPhysicalDamageFull").click(healDamage.bind("physicalHeal", currentPhysicalDamage, healthBarValue, deathBarValue, currentWounds, woundThreshold, physicalHealthTarget, woundTarget, actor, "full", "physical"));
  
    //Mental Heal Partial
    html.find("#healMentalDamagePartial").click(healDamage.bind("mentalHeal", currentMentalDamage, stressBarValue, insanityBarValue, currentTrauma, traumaThreshold, mentalHealthTarget, traumaTarget, actor, "partial", "mental"));
  
    //Physical Heal Partial
    html.find("#healPhysicalDamagePartial").click(healDamage.bind("physicalHeal", currentPhysicalDamage, healthBarValue, deathBarValue, currentWounds, woundThreshold, physicalHealthTarget, woundTarget, actor, "partial", "physical"));
  }
  
    //Take Damage through character sheet
    export async function takeDamage (receiveDamage, currentDamage, bar, overBar, currentModifier, threshold, damageTarget, modifierTarget, actor, barTarget, maxHealth) {
      
      let inputValue = Number(receiveDamage[0].value) < maxHealth ? Number(receiveDamage[0].value) : maxHealth;
      let oldDamageBarTarget = ""
      let oldOverBarTarget = ""
  
      const barModifierTarget = "system.health.barModifier"
      let barModifier = ""
  
      let message = {};
  
      if(barTarget === "mental"){
        oldDamageBarTarget = "system.mental.oldStressBarValue"
        oldOverBarTarget = "system.mental.oldInsanityBarValue"
        barModifier = "mentalUp"
        message.title = "ep2e.roll.announce.combat.damage.mentalDamage";
        message.damageType = "ep2e.roll.announce.combat.damage.stress";
        message.modifierType = "ep2e.roll.announce.combat.damage.trauma";
      }
      else if(barTarget === "physical"){
        oldDamageBarTarget = "system.physical.oldHealthBarValue"
        oldOverBarTarget = "system.physical.oldDeathBarValue"
        barModifier = "physicalUp"
        message.title = "ep2e.roll.announce.combat.damage.physicalDamage";
        message.damageType = "ep2e.roll.announce.combat.damage.damage";
        message.modifierType = "ep2e.roll.announce.combat.damage.wounds";
      }
      
      if(inputValue >= 1 && oldDamageBarTarget != "" && oldOverBarTarget != ""){
        bar = bar >= 1 ? bar : 1;
        let newDamage = eval(inputValue + currentDamage) >= maxHealth ? maxHealth : eval(inputValue + currentDamage);
        let newModifier = Math.floor(inputValue/threshold) + currentModifier;
      
        if(actor.type === "character"){
  
          message.damageValue = inputValue;
          message.modifierValue = Math.floor(inputValue/threshold);
  
          let html = await renderTemplate(DAMAGE_STATUS_OUTPUT, message)
  
          ChatMessage.create({
              speaker: ChatMessage.getSpeaker({actor: this.actor}),
              flavor: html
          })
        }
        return actor.update({[damageTarget] : newDamage, [modifierTarget] : newModifier,[oldDamageBarTarget] : bar,[oldOverBarTarget] : overBar, [barModifierTarget] : barModifier})
  
      }
    }
  
    //Heal damage through character sheet
    async function healDamage (currentDamage, bar, overBar, currentModifier, threshold, damageTarget, modifierTarget, actor, healType, healTarget) {
  
      let newDamage = 0;
      let newModifier = currentModifier;
      let oldDamageBarTarget = "";
      let oldOverBarTarget = "";
      let damageCount = currentDamage
      let woundCount = currentModifier
      let healFormula;
      let message = {};
      const activeMorphType = actor.system.physical.activeMorphType
      message.totalDamage = currentDamage + currentModifier;
  
      //Dialog args
      const dialog = 'systems/eclipsephase/templates/chat/pop-up.html';
      const dialogType = "healDamage";
      let enhancements = {};
      let enhancementsCount = 0;
      let hoursPassed = 0;
  
      for (let enhancement in actor.system.additionalSystems.healing){
        enhancements[enhancement] = true
        enhancementsCount++
      }
  
      const barModifierTarget = "system.health.barModifier";
      let barModifier = ""
  
      if(healTarget === "mental"){
        message.title = "ep2e.roll.announce.heal.full.mindHeal";
        message.damageType = "ep2e.roll.announce.heal.full.stress";
        message.modifierType = "ep2e.roll.announce.heal.full.trauma";
        oldDamageBarTarget = "system.mental.oldStressBarValue";
        oldOverBarTarget = "system.mental.oldInsanityBarValue";
        barModifier = "mentalDown"
      }
      else if(healTarget === "physical"){
        switch (activeMorphType){
          case 'bio':
            message.title = "ep2e.roll.announce.heal.full.bodyHeal";
          break;
          case 'synth':
            message.title = "ep2e.roll.announce.heal.full.bodyRepair";
          break;
          case 'info':
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
  
      if(message.totalDamage > 0){
        if (healType === "partial"){
          let msg;
          healFormula = await healingDialog(dialog, healTarget, dialogType, enhancements, enhancementsCount)
          
          if (healFormula.cancelled){
            return;
          }
          
          let healRoll = [];
          let repetition = 0;
          let html = null;
          if(damageCount > 0 && (healFormula.heal).length > 0){
            for (let i = 1 ; i <= healFormula.duration; i++){
  
              hoursPassed++
              
              if(repetition >= (healFormula.heal).length){
                hoursPassed--
                break
              }

              if(damageCount > 0 && healFormula.heal[repetition].cycle === hoursPassed){
                
                let rollFormula = healFormula.heal[repetition].roll;
                
                let arrayItem = await new Roll(rollFormula).evaluate()
                healRoll.push(arrayItem)
      
                damageCount = damageCount - healRoll[repetition]._total > 0 ? damageCount - healRoll[repetition]._total: 0;
                repetition++
      
              }
              
              if(damageCount === 0){
                break;
              }
  
            }
          }
          if(hoursPassed > healFormula.duration){
            hoursPassed--
          }
          if(healTarget === "physical"){
            message.weeksValue = Math.floor(hoursPassed/168);
            message.daysValue = Math.floor((hoursPassed-message.weeksValue*168)/24);
            message.hoursValue = (hoursPassed-message.weeksValue*168) % 24;
          }
          if(healTarget === "mental"){
            message.weeksValue = Math.floor(hoursPassed/7);
            message.daysValue = Math.floor((hoursPassed-message.weeksValue*7));
          }
          
          let rollCount = repetition;
          let woundHealing = 0
          repetition = 0;
          if((healFormula.wound).length > 0 && woundCount > 0){
            if(healFormula.wound[repetition].cycle + hoursPassed <= healFormula.duration){
              for (woundHealing ; woundHealing <= healFormula.duration - hoursPassed ; woundHealing++ ){
                if(repetition >= (healFormula.wound).length || healFormula.wound[repetition].cycle + hoursPassed > healFormula.duration){
                  hoursPassed--;
                  break;
                }
    
                if(healFormula.wound[repetition].cycle === woundHealing){
                  woundCount = woundCount - healFormula.wound[repetition].heal > 0 ? woundCount - healFormula.wound[repetition].heal : 0;
                  repetition++
                }
        
                if(woundCount === 0){
                  break;
                }
    
                if(woundCount != 0 && woundHealing === healFormula.duration - hoursPassed && repetition === (healFormula.wound).length){
                  break;
                }
              }
            }
          }
  
          hoursPassed += woundHealing
          message.roll = true
          message.rollTimes = "ep2e.roll.announce.heal.partial.rollTimes"
          message.rollLength = rollCount
          message.title = "ep2e.roll.announce.heal.partial.rollCopy"
          message.weeksLabel = "ep2e.roll.announce.heal.partial.weeks"
          message.daysLabel = "ep2e.roll.announce.heal.partial.days"
          message.hoursLabel = "ep2e.roll.announce.heal.partial.hours"
          message.rollTitle = "ep2e.roll.announce.total"

          if (healRoll.length > 0){
            if (healRoll.length === 1)
              await rollToChat(null, message, DAMAGE_STATUS_OUTPUT, healRoll[0], actor.name, game.user._id, false, "rollOutput")
            else
              await rollToChat(null, message, DAMAGE_STATUS_OUTPUT, healRoll, actor.name, game.user._id, false, "rollOutput")
          }     
  
          newDamage = damageCount;
          newModifier = woundCount;
  
          if (healTarget === "physical"){
            message.weeksValue = Math.floor(hoursPassed/168);
            message.daysValue = Math.floor((hoursPassed-message.weeksValue*168)/24);
            message.hoursValue = (hoursPassed-message.weeksValue*168) % 24;
          }
          else {
            message.weeksValue = Math.floor(hoursPassed/7);
            message.daysValue = Math.floor((hoursPassed-message.weeksValue*7));
            message.hoursValue = false;
          }
  
          message.damageValue = newDamage > 0 ? currentDamage - damageCount : currentDamage;
          message.modifierValue = newModifier > 0 ? currentModifier - woundCount : currentModifier;
          
        }
        else if (healType === "full"){
          newModifier = 0;
  
          message.damageValue = currentDamage;
          message.modifierValue = currentModifier;
          
        }
        
        message.roll = false;
        if (message.weeksValue || message.daysValue || message.hoursValue){
          message.timeframe = true;
          message.timeframeLabel = "ep2e.roll.announce.heal.partial.timeframeLabel"
        }
      }
      else{
        message.title = "ep2e.roll.announce.heal.partial.fullCopy";
      }
  
      if(currentDamage === damageCount && currentModifier === woundCount && message.totalDamage > 0 && healType != "full"){
        message.title = "ep2e.roll.announce.heal.partial.notEnoughTime";
        message.subheader = "ep2e.roll.announce.heal.partial.minimumTimeframe";
        let hoursPassedHealth = healFormula.minimumHealingCycles.health;
        let hoursPassedWounds = healFormula.minimumHealingCycles.modifier;
        if (healTarget === "physical"){
          message.weeksValueHealth = Math.floor(hoursPassedHealth/168);
          message.daysValueHealth = Math.floor((hoursPassedHealth-message.weeksValueHealth*168)/24);
          message.hoursValueHealth = (hoursPassedHealth-message.weeksValueHealth*168) % 24;
          message.weeksValueWounds = Math.floor(hoursPassedWounds/168);
          message.daysValueWounds = Math.floor((hoursPassedWounds-message.weeksValueWounds*168)/24);
          message.hoursValueWounds = (hoursPassedWounds-message.weeksValueWounds*168) % 24;
        }
        else {
          message.weeksValueHealth = Math.floor(hoursPassedHealth/7);
          message.daysValueHealth = Math.floor((hoursPassedHealth-message.weeksValueHealth*7));
          message.hoursValueHealth = false;
          message.weeksValueWounds = Math.floor(hoursPassedWounds/7);
          message.daysValueWounds = Math.floor((hoursPassedWounds-message.weeksValueWounds*7));
          message.hoursValueWounds = false;
        }
        message.noTime = true;
        message.totalDamage = 0;
      }
  
      if(actor.type === "character"){
        let html = await renderTemplate(DAMAGE_STATUS_OUTPUT, message)
  
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: html
        })
      }
      else if(actor.type != "character"){
        let html = await renderTemplate(DAMAGE_STATUS_OUTPUT, message)
  
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: html,
            whisper: ChatMessage.getWhisperRecipients("GM")
        })
      }
  
      return actor.update({[damageTarget] : newDamage, [modifierTarget] : newModifier, [oldDamageBarTarget] : bar, [oldOverBarTarget] : overBar, [barModifierTarget] : barModifier})
  
    }
  
    //Bar animation
    //Animate bar going up (e.g. taking damage)
    async function barUp (bar, overBar, oldBarValue, oldOverBarValue, barValue, overBarValue, actor, barType){
  
      for(let i = oldBarValue ; i <= barValue ; i++){
        await new Promise(resolve => setTimeout(resolve, 7));
        bar[0].style.width = i + "%";
      }
      for(let i = oldOverBarValue ; i <= overBarValue ; i++){
        await new Promise(resolve => setTimeout(resolve, 7));
        overBar[0].style.width = i + "%";
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      return actor.update({["system.health.barModifier"] : "none"})
    }
  
    //Animate bar going down (e.g. healing)
    async function barDown (bar, overBar, oldBarValue, oldOverBarValue, barValue, overBarValue, actor, barType){
  
      for(let i = oldOverBarValue ; i >= overBarValue ; i--){
        await new Promise(resolve => setTimeout(resolve, 7));
        overBar[0].style.width = i + "%";
      }
      for(let i = oldBarValue ; i >= barValue ; i--){
        await new Promise(resolve => setTimeout(resolve, 7));
        bar[0].style.width = i + "%";
      } 
      await new Promise(resolve => setTimeout(resolve, 10));
      return actor.update({"system.health.barModifier" : "none"})
    }
  
    //Special Dialogs
  
    async function healingDialog(dialog, type, dialogType, enhancements, enhancementsCount) {
      let dialogName = game.i18n.localize('ep2e.skills.pool.dialogHeadline');
      let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
      let confirmButton = game.i18n.localize('ep2e.actorSheet.button.confirm');
      const html = await renderTemplate(dialog, {type, dialogType, enhancements, enhancementsCount});
  
      return new Promise(resolve => {
          const data = {
              title: dialogName,
              content: html,
              buttons: {
                  cancel: {
                      label: cancelButton,
                      callback: html => resolve ({cancelled: true})
                  },
                  normal: {
                      label: confirmButton,
                      callback: html => resolve(_healingResult(html[0].querySelector("form"), enhancements, type))
                  }
              },
              default: "normal",
              close: () => resolve ({cancelled: true})
          };
          let options = {width:315}
          new Dialog(data, options).render(true);
      });
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
      if (type === "physical"){
        addition = form.addition.value
        duration = form.duration.value === "weeks" ? durationMultiplier * 168 : form.duration.value === "days" ? durationMultiplier * 24 : durationMultiplier * 1;
        circumstances = form.circumstances.value === "harsh" ? 3 : form.circumstances.value === "poor" ? 2 : 1;
        healingBasis = enhancements.medichines === true ? {"dice" : "1d10", "timeframe" : 1 * circumstances, "woundCycle" : 24 * circumstances} : enhancements.biomods === true ? {"dice" : "1d10", "timeframe" : 12 * circumstances, "woundCycle" : 72 * circumstances} : {"dice" : "1d10", "timeframe" : 24 * circumstances, "woundCycle" : 168 * circumstances}
        healingAddition = addition === "tank" ? {"dice" : "2d10", "timeframe" : 1, "woundCycle" : 2, "limit" : false} : addition === "spray" ? {"dice" : "1d10", "timeframe" : 1, "woundCycle" : false, "limit" : 12} : addition === "fixers" ? {"dice" : "1d10", "timeframe" : 1, "woundCycle" : 24, "limit" : 140} : addition === "meds" ? {"dice" : "1d10", "timeframe" : 1, "woundCycle" : 24, "limit" : 24}: false; 
        let limit = healingAddition.limit ? healingAddition.limit : duration;
  
        for(let arrayConstructor = 0 ; arrayConstructor <= duration + 1 ; arrayConstructor++){
          
          if(arrayConstructor > 0){
            if(healingAddition && Number.isInteger(arrayConstructor / healingBasis.timeframe) && arrayConstructor <= limit){
              healCycle.push({"cycle" : arrayConstructor, "roll" : healingBasis.dice + " + " + healingAddition.dice});
            }
            else if(healingAddition && !Number.isInteger(arrayConstructor / healingBasis.timeframe) && arrayConstructor <= limit){
              healCycle.push({"cycle" : arrayConstructor, "roll" : healingAddition.dice});
            }
            else if(Number.isInteger(arrayConstructor / healingBasis.timeframe)){
              healCycle.push({"cycle" : arrayConstructor, "roll" : healingBasis.dice});
            }
  
            if(healingAddition && Number.isInteger(arrayConstructor / healingAddition.woundCycle) && Number.isInteger(arrayConstructor / healingBasis.woundCycle) && arrayConstructor <= limit){
              woundCycle.push({"cycle" : arrayConstructor, "heal" : 2, "limit" : limit});
            }
            else if(healingAddition && Number.isInteger(arrayConstructor / healingAddition.woundCycle) && arrayConstructor <= limit){
              woundCycle.push({"cycle" : arrayConstructor, "heal" : 1, "limit" : limit});
            }
            else if(Number.isInteger(arrayConstructor / healingBasis.woundCycle)){
              woundCycle.push({"cycle" : arrayConstructor, "heal" : 1, "limit" : false});
            }
          }
        }
  
        let minimumHealingCycles = {};
        minimumHealingCycles.health = healingAddition ? healingAddition.timeframe < healingBasis.timeframe ? healingAddition.timeframe : healingBasis.timeframe : healingBasis.timeframe;
        minimumHealingCycles.modifier = healingAddition ? healingAddition.woundCycle < healingBasis.woundCycle ? healingAddition.woundCycle : healingBasis.woundCycle : healingBasis.woundCycle;
  
        return {
            duration : duration,
            heal : healCycle,
            wound : woundCycle,
            minimumHealingCycles : minimumHealingCycles
        }
      }
      if (type === "mental"){
        addition = form.addition.checked
        duration = form.duration.value === "weeks" ? durationMultiplier * 7 : durationMultiplier * 1;
  
        for(let arrayConstructor = 0 ; arrayConstructor <= duration + 1 ; arrayConstructor++){
          
          if(arrayConstructor > 0){
            if(addition){
              healCycle.push({"cycle" : arrayConstructor, "roll" : "1d6"});
            }
            else if(Number.isInteger(arrayConstructor / 7) && !addition){
              healCycle.push({"cycle" : arrayConstructor, "roll" : "1d6"});
            }
  
            if(Number.isInteger(arrayConstructor / 7) && addition){
              woundCycle.push({"cycle" : arrayConstructor, "heal" : 1, "limit" : false});
            }
            else if(Number.isInteger(arrayConstructor / 30) && addition){
              woundCycle.push({"cycle" : arrayConstructor, "heal" : 1, "limit" : false});
            }
          }
        }
  
        let minimumHealingCycles = {};
        minimumHealingCycles.health = addition ? 1 : 7;
        minimumHealingCycles.modifier = addition ? 7 : 30;
  
        return {
            duration : duration,
            heal : healCycle,
            wound : woundCycle,
            minimumHealingCycles : minimumHealingCycles
        }
      }
    }
