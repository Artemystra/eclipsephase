export function registerItemHandlers(html,callerobj,caller){
      // Add Inventory Item
      html.find('.item-create').click(caller._onItemCreate.bind(this));

      // Update Inventory Item
      html.find('.item-edit').click(ev => {
        const li = $(ev.currentTarget).parents(".item");
        const item = callerobj.items.get(li.data("itemId"));
        item.sheet.render(true);
      });

          // Delete Inventory Item
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      callerobj.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
      li.slideUp(200, () => this.render(false));
    });
}

export function registerEffectHandlers(html,callerobj){
    html.find('.effect-create').click(ev => {
        callerobj.createEmbeddedDocuments('ActiveEffect', [{
          label: 'Active Effect',
          icon: '/icons/svg/mystery-man.svg'
        }]);
        
      });
  
      html.find('.effect-edit').click(ev => {
        const li = $(ev.currentTarget).parents(".effect");
        const effect = callerobj.getEmbeddedDocument('ActiveEffect',li.data("itemId"));
        effect.sheet.render(true);
      });
  
      html.find('.effect-delete').click(async ev => {
        let askForOptions = ev.shiftKey;

        if (!askForOptions){

        const li = $(ev.currentTarget).parents(".effect");
        const itemName = [li.data("itemName")] ? [li.data("itemName")] : null;
        const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
        const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.button.delete"))+ " " +(itemName?itemName:"");
        const popUpCopy = "ep2e.actorSheet.popUp.deleteCopyGeneral";
        const popUpInfo = "ep2e.actorSheet.popUp.deleteAdditionalInfo";

        let popUp = await confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo);
        
        if(popUp.confirm === true){
          callerobj.deleteEmbeddedDocuments('ActiveEffect', [li.data("itemId")]);
          }
          else{
            return
          }
        }
        else {
          callerobj.deleteEmbeddedDocuments('ActiveEffect', [li.data("itemId")]);
        }
      });
  
}

export async function _tempEffectCreation(callerobj, numberOfRuns, tempEffLabel, tempEffIcon, tempEffTar, tempEffMode, tempEffVal){
    return callerobj.createEmbeddedDocuments('ActiveEffect', [{
      label: tempEffLabel,
      icon: tempEffIcon,
      changes: [{key : tempEffTar, mode : tempEffMode, value : -1*numberOfRuns}]
    }]);
}

export function registerCommonHandlers(html,callerobj){
    
    //Open/Close items (gear/weapons/flaws/traits etc.)

    html.find(".slideShow").click(ev => {
        const current = $(ev.currentTarget);
        const first = current.children().first();
        const last = current.children().last();
        const target = current.closest(".item").children().last();
        first.toggleClass("noShow").toggleClass("showFlex");
        last.toggleClass("noShow").toggleClass("showFlex");
        target.slideToggle(200).toggleClass("showFlex");
    });

    
    //Auto-close parent item
    html.find(".autoClose").click(ev => {
      const current = $(ev.currentTarget);
      const parent = current.closest(".showMore").toggleClass("showFlex").toggleClass("noShow");
      parent.slideToggle(200);
  });
    
    // Custom Droplists (for pools)
    
    const dropdownBtns = html.find(".dropdown");
    const closeBtns = html.find(".closeButton");

    // Close the dropdown menu if the user clicks outside of it
    
    //This part needs further investigation as it triggers AFTER the button is clicked, leading to directly closing the just opened dropdown.
    /*document.addEventListener("click", function(event) {
      console.log("My event target matches .dropdown: ",event.target.matches(".dropdown"))
      console.log("this is because my event target is: ",event.target)
      if (!event.target.matches(".dropdown")) {
        console.log("Now I trigger closeAll")
        closeAllDropdowns();
      }
    });*/

    document.addEventListener("click", function(event) {
      if (event.target.matches(".droplistBackground") || event.target.matches(".droplistElement")) {
        closeAllDropdowns();
      }
    });

    closeBtns.click(ev => {
      closeAllDropdowns();
    });

    for (const btn of dropdownBtns) {
      btn.addEventListener("click", function() {
        const dropdownContainer = this.nextElementSibling;
        const open = dropdownContainer.style.display === "grid";
        closeAllDropdowns();
        if (!open) {
          dropdownContainer.style.display = "grid";
        }
      });
    }

    function closeAllDropdowns() {
      const dropdownContainers = document.querySelectorAll(".poolDroplist");
      for (const container of dropdownContainers) {
          container.style.display = "none";
      }
    }
    
}

export function itemCreate(event,callerobj){
      event.preventDefault();
      const header = event.currentTarget;
      const type = header.dataset.type;
      const data = duplicate(header.dataset);
      const name = `New ${type.capitalize()}`;
      const itemData = {
        name: name,
        type: type,
        data: data
      };
      delete itemData.data["type"];
      if (itemData.type === "specialSkill" || itemData.type === "knowSkill") {
        itemData.name = "New Skill";
      }
      return callerobj.createEmbeddedDocuments("Item", [itemData]);
}

export async function itemReduction(actor, itemID, itemQuantity){
  let quantity = Number(itemQuantity) - 1;
  let ammoUpdate = [];

  if(quantity >= 1){
    ammoUpdate.push({
      "_id" : itemID,
      "system.quantity": quantity,
    });
    await actor.updateEmbeddedDocuments("Item", ammoUpdate);
  }
  else{
    await actor.deleteEmbeddedDocuments("Item", [itemID])
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
    barUp(physicalHealthBar, physicalDeathBar, oldHealthBarValue, oldDeathBarValue, healthBarValue, deathBarValue, actor, "physical")

  }
  //Physical Heal Animation
  else if (barModifier === "physicalDown"){
    physicalHealthBar[0].style.width = oldHealthBarValue + "%";
    physicalDeathBar[0].style.width = oldDeathBarValue + "%";
    barDown(physicalHealthBar, physicalDeathBar, oldHealthBarValue, oldDeathBarValue, healthBarValue, deathBarValue, actor, "physical")

  }
  //No change/Open sheet
  else{
    physicalHealthBar[0].style.width = healthBarValue + "%";
    physicalDeathBar[0].style.width = deathBarValue + "%";
  }

  //Mental health bar animation
  if(actor.type === "character"){
    //Mental damage Animation
    if(barModifier === "mentalUp"){
      barUp(mentalStressBar, mentalInsanityBar, oldStressBarValue, oldInsanityBarValue, stressBarValue, insanityBarValue, actor, "mental")

    }
    //Mental Heal Animation
    else if (barModifier === "mentalDown"){
      mentalStressBar[0].style.width = oldStressBarValue + "%";
      mentalInsanityBar[0].style.width = oldInsanityBarValue + "%";
      barDown(mentalStressBar, mentalInsanityBar, oldStressBarValue, oldInsanityBarValue, stressBarValue, insanityBarValue, actor, "mental")
  
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
  async function takeDamage (receiveDamage, currentDamage, bar, overBar, currentModifier, threshold, damageTarget, modifierTarget, actor, barTarget, maxHealth) {
      
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

        let html = await renderTemplate('systems/eclipsephase/templates/chat/damage-message.html', message)

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
      switch (actor.system.bodyType.value){
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
              
              let arrayItem = await new Roll(rollFormula).evaluate({async: true})
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

        html = await renderTemplate('systems/eclipsephase/templates/chat/damage-message.html', message);
        
        if (healRoll.length > 0){
          let rollMode = CONST.DICE_ROLL_MODES.SELF
          msg = await joinDiceRollMessage(healRoll, {
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: html
          }, {rollMode});
    
          if (game.dice3d){
            game.dice3d.waitFor3DAnimationByMessageID(msg.id);
          } 
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
      let html = await renderTemplate('systems/eclipsephase/templates/chat/damage-message.html', message)

      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          flavor: html
      })
    }
    else if(actor.type != "character"){
      let html = await renderTemplate('systems/eclipsephase/templates/chat/damage-message.html', message)

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

//Standard Dialogs

export async function confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, popUpTarget) {
  let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
  let deleteButton = game.i18n.localize('ep2e.actorSheet.button.delete');
  const dialogType = "confirmation"
  const template = "systems/eclipsephase/templates/chat/pop-up.html";
  const html = await renderTemplate(template, {popUpHeadline, popUpCopy, dialogType, popUpInfo, popUpTarget});

  return new Promise(resolve => {
      const data = {
          title: popUpTitle,
          content: html,
          buttons: {
              cancel: {
                label: cancelButton,
                callback: html => resolve ({confirm: false})
              },
              normal: {
                  label: deleteButton,
                  callback: html => resolve ({confirm: true})
              }
          },
          default: "normal",
          close: () => resolve ({confirm: false})
      };
      let options = {width:250}
      new Dialog(data, options).render(true);
  });
}

export async function moreInfo(event){
  const element = event.currentTarget;
  const dataset = element.dataset;
  const template = 'systems/eclipsephase/templates/chat/pop-up.html'
  let dialogData = {}
  dialogData.dialogType = "information";

  //This builds the dataset if objects are needed from the item (I'm not entirely sure why item is needed, but a smarter me figured this out at some point in time...)
  if(dataset.uuid){
    let item = await fromUuid(dataset.uuid);
    let path = eval("item." + dataset.datapath);

    for (let item in path){
      dialogData[item] = path[item];
    }
    
    dialogData.rolledfrom = dataset.rolledfrom;
  }
  
  //This uses the data provided by handlebars datasets
  else{
    for (let item in dataset){
        dialogData[item] = dataset[item];
    }
  }

  let dialog = await moreInformation(template, dialogData)

  async function moreInformation(template, dialogData) {
      let dialogName = game.i18n.localize('ep2e.actorSheet.dialogHeadline.information');
      let closeButton = game.i18n.localize('ep2e.actorSheet.button.close');
      let html = await renderTemplate(template, dialogData);
    
      return new Promise(resolve => {
          const data = {
              title: dialogName,
              content: html,
              buttons: {
                  cancel: {
                      label: closeButton,
                      callback: html => resolve ({cancelled: true})
                  }
              },
              default: "normal",
              close: () => resolve ({cancelled: true})
          };
          let options = {width:325}
          new Dialog(data, options).render(true);
      });
    }
}

//Item Toggles

export function embeddedItemToggle(html, actor, allEffects){
  html.find('.equipped.checkBox').click(async ev => {
    const itemId = ev.currentTarget.closest(".equipped.checkBox").dataset.itemId;
    const item = actor.items.get(itemId);
    let toggle = !item.system.active;
    const updateData = {
        "system.active": toggle
    };
    const updated = item.update(updateData);
    
    //handles activation/deactivation of values provided by effects inherited from items
    let effUpdateData=[];
    for(let effectScan of allEffects){
  
      if (effectScan.origin){
        let parentItem = await fromUuid(effectScan.origin);
        if (itemId === parentItem._id){
  
          effUpdateData.push({
            "_id" : effectScan._id,
            disabled: !toggle
          });
  
        }
      }
    }
    actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
  });
}

export function itemToggle(html, item){
  html.find('.toggleItem').click(async ev => {
    const element = ev.currentTarget;
    const dataset = element.dataset;
    const path = dataset.path;
    let toggle = !eval("item." + path);
    const updateData = {
        [path]: toggle
    };
    item.update(updateData);
  });
}

//List dialog constructor
export async function listSelection(objectList, dialogType, headline){
  let dialogName = game.i18n.localize('ep2e.actorSheet.dialogHeadline.confirmationNeeded');
  let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
  let useButton = game.i18n.localize('ep2e.actorSheet.button.select');
  const template = "systems/eclipsephase/templates/chat/list-dialog.html";
  const html = await renderTemplate(template, {objectList, dialogType, headline});
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
                  label: useButton,
                  callback: html => resolve(_proListSelection(html[0].querySelector("form")))
              }
          },
          default: "normal",
          close: () => resolve ({cancelled: true})
      };
      let options = {width:536}
      new Dialog(data, options).render(true);
  });
}
function _proListSelection(form) {
  return {
      selection: form.WeaponSelect.value
  }
}

//Joins multiple consecutive dice rolls into one Message
async function joinDiceRollMessage(rollsArray, messageData={}, {rollMode, create=true}={}) {
  for ( const roll of rollsArray ) {
      if ( !roll._evaluated ) await roll.evaluate({async: true});
  }

  // Prepare chat data
  messageData = foundry.utils.mergeObject({
      user: game.user.id,
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      sound: CONFIG.sounds.dice
  }, messageData);
  messageData.rolls = rollsArray;

  // Either create the message or just return the chat data
  const cls = getDocumentClass("ChatMessage");
  const msg = new cls(messageData);

  // Either create or return the data
  if ( create ) return cls.create(msg.toObject(), { rollMode });
  else {
      if ( rollMode ) msg.applyRollMode(rollMode);
      return msg.toObject();
  }
}