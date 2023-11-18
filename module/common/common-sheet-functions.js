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

export async function healthBarChange(actor, html){
  const actorModel = actor.system;
  const barModifier = actorModel.health.barModifier
  
  console.log("This is barModifier on top of the function:", barModifier)

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
    console.log("Physical barUp triggered")
    barUp(physicalHealthBar, physicalDeathBar, oldHealthBarValue, oldDeathBarValue, healthBarValue, deathBarValue, actor, "physical")

  }
  //Physical Heal Animation
  else if (barModifier === "physicalDown"){
    console.log("Physical Bar Down triggered")
    physicalHealthBar[0].style.width = oldHealthBarValue + "%";
    physicalDeathBar[0].style.width = oldDeathBarValue + "%";
    barDown(physicalHealthBar, physicalDeathBar, oldHealthBarValue, oldDeathBarValue, healthBarValue, deathBarValue, actor, "physical")

  }
  //No change/Open sheet
  else{
    console.log("No Animation for Physical triggered")
    console.log("The healthbar has a value of:",healthBarValue)
    console.log("The deathbar has a value of:",deathBarValue)
    physicalHealthBar[0].style.width = healthBarValue + "%";
    physicalDeathBar[0].style.width = deathBarValue + "%";
  }

  //Mental health bar animation
  if(actor.type === "character"){
    //Mental damage Animation
    if(barModifier === "mentalUp"){
      console.log("Mental barUp triggered")
      barUp(mentalStressBar, mentalInsanityBar, oldStressBarValue, oldInsanityBarValue, stressBarValue, insanityBarValue, actor, "mental")

    }
    //Mental Heal Animation
    else if (barModifier === "mentalDown"){
      console.log("Mental Bar Down triggered")
      mentalStressBar[0].style.width = oldStressBarValue + "%";
      mentalInsanityBar[0].style.width = oldInsanityBarValue + "%";
      barDown(mentalStressBar, mentalInsanityBar, oldStressBarValue, oldInsanityBarValue, stressBarValue, insanityBarValue, actor, "mental")
  
    }
    //No Change/Open Sheet
    else{
      console.log("No Animation for Mental triggered")
      console.log("The stressbar has a value of:",stressBarValue)
      console.log("The insanitybar has a value of:",insanityBarValue)
      mentalStressBar[0].style.width = stressBarValue + "%";
      mentalInsanityBar[0].style.width = insanityBarValue + "%";
    }
  }

  //Take Physical Damage
  html.find("#takePhysicalDamage").click(takeDamage.bind("physical" ,receivePhysicalDamage, currentPhysicalDamage, healthBarValue, deathBarValue, currentWounds, woundThreshold, physicalHealthTarget, woundTarget, actor, "physical", maxPhysicalHealth));

  //Take Mental Damage
  html.find("#takeMentalDamage").click(takeDamage.bind("mental", receiveMentalDamage, currentMentalDamage, stressBarValue, insanityBarValue, currentTrauma, traumaThreshold, mentalHealthTarget, traumaTarget, actor, "mental", maxMentalHealth));

  //Heal full
  html.find("#healMentalDamageFull").click(healDamage.bind("mentalHeal", receiveMentalDamage, currentMentalDamage, stressBarValue, insanityBarValue, currentTrauma, traumaThreshold, mentalHealthTarget, traumaTarget, actor, "full", "mental"));
  html.find("#healPhysicalDamageFull").click(healDamage.bind("physicalHeal" ,receivePhysicalDamage, currentPhysicalDamage, healthBarValue, deathBarValue, currentWounds, woundThreshold, physicalHealthTarget, woundTarget, actor, "full", "physical"));
}

async function takeDamage (receiveDamage, currentDamage, bar, overBar, currentModifier, threshold, damageTarget, modifierTarget, actor, barTarget, maxHealth) {
    
  let inputValue = Number(receiveDamage[0].value) < maxHealth ? Number(receiveDamage[0].value) : maxHealth;

  let oldDamageBarTarget = ""
  let oldOverBarTarget = ""

  const barModifierTarget = "system.health.barModifier"
  let barModifier = ""

  if(barTarget === "mental"){
    oldDamageBarTarget = "system.mental.oldStressBarValue"
    oldOverBarTarget = "system.mental.oldInsanityBarValue"
    barModifier = "mentalUp"
  }
  else if(barTarget === "physical"){
    oldDamageBarTarget = "system.physical.oldHealthBarValue"
    oldOverBarTarget = "system.physical.oldDeathBarValue"
    barModifier = "physicalUp"
  }
  
  if(inputValue >= 1 && oldDamageBarTarget != "" && oldOverBarTarget != ""){
    bar = bar >= 1 ? bar : 1;
    let newDamage = eval(inputValue + currentDamage) >= maxHealth ? maxHealth : eval(inputValue + currentDamage);
    let newModifier = Math.floor(inputValue/threshold) + currentModifier;
    console.log("This newDamage is a:", typeof(newDamage));
    console.log("It's value is:",newDamage);
    console.log("The oldDamageBar is:", bar, "The oldOverBar is:", overBar)
    return actor.update({[damageTarget] : newDamage, [modifierTarget] : newModifier,[oldDamageBarTarget] : bar,[oldOverBarTarget] : overBar, [barModifierTarget] : barModifier})

  }
}

async function healDamage (receiveHeal, currentDamage, bar, overBar, currentModifier, threshold, damageTarget, modifierTarget, actor, healType, healTarget) {
  let inputValue = null;
  let newDamage = 0;
  let newModifier = currentModifier;
  let oldDamageBarTarget = ""
  let oldOverBarTarget = ""

  const barModifierTarget = "system.health.barModifier"
  let barModifier = ""

  if(healTarget === "mental"){
    oldDamageBarTarget = "system.mental.oldStressBarValue"
    oldOverBarTarget = "system.mental.oldInsanityBarValue"
    barModifier = "mentalDown"
  }
  else if(healTarget === "physical"){
    oldDamageBarTarget = "system.physical.oldHealthBarValue"
    oldOverBarTarget = "system.physical.oldDeathBarValue"
    barModifier = "physicalDown"
  }

  if (healType === "partial"){
    
    
  }
  else if (healType === "full"){
    newModifier = 0;
  }
  
  console.log("This is barModifier inside healDamage:", barModifier)
  console.log("oldDamageBar:", bar, "oldOverBar:", overBar)
  return actor.update({[damageTarget] : newDamage, [modifierTarget] : newModifier, [oldDamageBarTarget] : bar, [oldOverBarTarget] : overBar, [barModifierTarget] : barModifier})

}

  async function barUp (bar, overBar, oldBarValue, oldOverBarValue, barValue, overBarValue, actor, barType){
    console.log("**BarUp")
    console.log("oldBar %:", oldBarValue, "newBar %:", barValue)
    console.log("oldOverBar %:", oldOverBarValue, "newOverBar %:", overBarValue)

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

  async function barDown (bar, overBar, oldBarValue, oldOverBarValue, barValue, overBarValue, actor, barType){
    console.log("**BarDown")
    console.log("The oldBarValue:", oldBarValue, "needs to go down to the newBarValue:", barValue, "of the bar:", bar)
    console.log("The oldBarValue:", oldOverBarValue, "needs to go down to the newBarValue:", overBarValue, "of the bar:", overBar)

    for(let i = oldOverBarValue ; i >= overBarValue ; i--){
      console.log("Over-Damage left:", i)
      await new Promise(resolve => setTimeout(resolve, 7));
      overBar[0].style.width = i + "%";
    }
    for(let i = oldBarValue ; i >= barValue ; i--){
      console.log("Damage left:", i)
      await new Promise(resolve => setTimeout(resolve, 7));
      bar[0].style.width = i + "%";
    } 
    await new Promise(resolve => setTimeout(resolve, 10));
    return actor.update({"system.health.barModifier" : "none"})
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