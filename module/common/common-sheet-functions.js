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
  for (let i = 0; numberOfRuns > i; i++){
    callerobj.createEmbeddedDocuments('ActiveEffect', [{
      label: tempEffLabel,
      icon: tempEffIcon,
      changes: [{key : tempEffTar, mode : tempEffMode, value : tempEffVal}]
    }]);
  }
}

export function registerCommonHandlers(html,callerobj){
    
    //Open/Close items (gear/weapons/flaws/traits etc.)

    html.find(".slideShow").click(ev => {
        const current = $(ev.currentTarget);
        const first = current.children().first();
        const last = current.children().last();
        const target = current.closest(".item").children().last();
        first.toggleClass("noShow");
        last.toggleClass("noShow");
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
  
  for (var item in dataset){
      dialogData[item] = dataset[item];
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

//Weapon Constructors

//End-to-end weapon preparation
export async function weaponPreparation(actorModel, actorWhole, skillKey, rolledFrom, weaponID){
  
  let weaponName = null;
  let weaponDamage = null;
  let weaponType = null;
  let currentAmmo = null;
  let maxAmmo = null;

  if (rolledFrom === "ccWeapon" || rolledFrom === "rangedWeapon"){
    let weapon = actorWhole.items.get(weaponID)
    console.log(weapon)
    let selectedWeaponMode = ""
    weaponName = weapon.name;
    weaponType = rolledFrom === "ccWeapon" ? "melee" : "ranged";
    currentAmmo = weapon.system.ammoMin;
    maxAmmo = weapon.system.ammoMax;

    if (weapon.system.additionalMode){
      selectedWeaponMode = await selectWeaponMode(weapon);

      if(selectedWeaponMode.cancel){
        return;
      }
      
      weaponDamage = selectedWeaponMode.dv;
    }
    else{

      let calculated = await damageValueCalc(weapon.system.mode1.d10, weapon.system.mode1.d6, weapon.system.mode1.bonus)

      weaponDamage = calculated.dv;
    }
  }
  else {
    let weaponUsed = await weaponListConstructor(actorWhole, skillKey)

    if(weaponUsed.cancel){
        return;
    }

    weaponID = weaponUsed.weaponID
    weaponName = weaponUsed.weaponName
    weaponDamage = weaponUsed.weaponDamage
    weaponType = weaponUsed.weaponType
    rolledFrom = weaponUsed.rolledFrom ? weaponUsed.rolledFrom : null;
    currentAmmo = weaponUsed.currentAmmo ? weaponUsed.currentAmmo : null;
  }
  return {weaponID, weaponName, weaponDamage, weaponType, rolledFrom, currentAmmo, maxAmmo}
}

export async function weaponListConstructor(actor, skillKey){
  
  let flatRollLabel = game.i18n.localize('ep2e.roll.dialog.button.withoutWeapon');
  let weaponslist = [{"_id":1, "name": flatRollLabel},{"_id":"", "name": ""}];
  let actorType = actor.type;
  let checkWeapon = "";
  let weaponID = null;
  let actorWeapons = skillKey === "guns" ? actor.rangedWeapon : actor.ccweapon;
  console.log(actorWeapons)

  //Weapon list overlay
  for (let weapon of actorWeapons){
    if (actorType === "character"){
        if (weapon.system.active === true){

            let calculated = await damageValueCalc(weapon.system.mode1.d10, weapon.system.mode1.d6, weapon.system.mode1.bonus)
      
            let weaponEntry = skillKey === "guns" ? {"_id":weapon._id, "name": weapon.name, "ammoCur": weapon.system.ammoMin, "ammoMax": weapon.system.ammoMax, "dv": calculated.dv} : {"_id":weapon._id, "name": weapon.name, "dv": calculated.dv};
            weaponslist.push(weaponEntry)
        }
    }
    else {

        let calculated = await damageValueCalc(weapon.system.mode1.d10, weapon.system.mode1.d6, weapon.system.mode1.bonus)

        let weaponEntry = skillKey === "guns" ? {"_id":weapon._id, "name": weapon.name, "ammoCur": weapon.system.ammoMin, "ammoMax": weapon.system.ammoMax, "dv": calculated.dv} : {"_id":weapon._id, "name": weapon.name, "dv": calculated.dv};
        weaponslist.push(weaponEntry)
    }
  }

  if (weaponslist.length > 2){
    checkWeapon = await GetWeaponsList(weaponslist)
    weaponID = checkWeapon.weaponSelect ? checkWeapon.weaponSelect : weaponID = "0";
  }
  else {
    weaponID = "1";
  }

  if (checkWeapon.cancelled || weaponID === "0" || !weaponID) {
    let cancel = true;
    return {cancel};
  }
  else {
    if (weaponID === "1"){
      let cancel = false;
      return {cancel};
    }

    else {
      for (let weaponObj of actorWeapons){        
        if (weaponObj._id === weaponID){
          let weaponName = weaponObj.name;
          let weaponType = "ranged";
          let rolledFrom = "rangedWeapon";
          let currentAmmo = weaponObj.system.ammoMin;

          let calculated = await damageValueCalc(weaponObj.system.mode1.d10, weaponObj.system.mode1.d6, weaponObj.system.mode1.bonus)

          let weaponDamage = calculated.dv;
          
          if(weaponObj.system.additionalMode){
            let selectedWeaponMode = await selectWeaponMode(weaponObj);

            if(selectedWeaponMode.cancel){
              let cancel = selectedWeaponMode.cancel
              return {cancel};
            }
            else{
              weaponDamage = selectedWeaponMode.dv;
            }

          }
    
          return {weaponID, weaponName, weaponDamage, weaponType, rolledFrom, currentAmmo}
        }
      }
    }
  }

  //Weapons list dialog constructor
  async function GetWeaponsList(weaponslist){
    let dialogName = game.i18n.localize('ep2e.actorSheet.dialogHeadline.confirmationNeeded');
    let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
    let useButton = game.i18n.localize('ep2e.actorSheet.button.select');
    let dialogType = "weaponList";
    const template = "systems/eclipsephase/templates/chat/list-dialog.html";
    const html = await renderTemplate(template, {weaponslist, dialogType});
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
                    callback: html => resolve(_proGetWeaponsList(html[0].querySelector("form")))
                }
            },
            default: "normal",
            close: () => resolve ({cancelled: true})
        };
        let options = {width:536}
        new Dialog(data, options).render(true);
    });
}
function _proGetWeaponsList(form) {
    console.log("This is my Value", form.WeaponSelect.value)
    return {
        weaponSelect: form.WeaponSelect.value
    }
}


}

//Select weapon mode in case of multiple available modes
export async function selectWeaponMode (weapon){

  let mode1calculated = await damageValueCalc(weapon.system.mode1.d10, weapon.system.mode1.d6, weapon.system.mode1.bonus)
  let mode2calculated = await damageValueCalc(weapon.system.mode2.d10, weapon.system.mode2.d6, weapon.system.mode2.bonus)

  let weaponModes = [{"_id": 1, "name": weapon.system.mode1.name, "range": weapon.system.mode1.range, "firingModes": weapon.system.mode1.firingMode, "dv": mode1calculated.dv},{"_id": 2, "name": weapon.system.mode2.name, "range": weapon.system.mode2.range, "firingModes": weapon.system.mode2.firingMode, "dv": mode2calculated.dv}];
  let selectedWeaponMode = await modeSelection(weaponModes);

  if(selectedWeaponMode.cancelled){
    let cancel = selectedWeaponMode.cancelled
    return {cancel};
  }

  if(selectedWeaponMode.mode === "1"){
    let name = weapon.system.mode1.name;
    let range = weapon.system.mode1.range;
    let firingMode = weapon.system.mode1.firingMode;
    let dv = weaponModes[0].dv
  
    return {name, range, firingMode, dv};

  }
  
  else {
    let name = weapon.system.mode2.name;
    let range = weapon.system.mode2.range;
    let firingMode = weapon.system.mode2.firingMode;
    let dv = weaponModes[1].dv
  
    return {name, range, firingMode, dv};

  }

  //Mode dialog constructor
  async function modeSelection(weaponslist){
    let dialogName = game.i18n.localize('ep2e.actorSheet.dialogHeadline.confirmationNeeded');
    let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
    let useButton = game.i18n.localize('ep2e.actorSheet.button.select');
    let dialogType = "weaponList";
    weaponslist.headline = true;
    const template = "systems/eclipsephase/templates/chat/list-dialog.html";
    const html = await renderTemplate(template, {weaponslist, dialogType});
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
                    callback: html => resolve(_proModeSelection(html[0].querySelector("form")))
                }
            },
            default: "normal",
            close: () => resolve ({cancelled: true})
        };
        let options = {width:536}
        new Dialog(data, options).render(true);
    });
}
function _proModeSelection(form) {
    return {
        mode: form.WeaponSelect.value
    }
}
}

//DV calculator (this translates the three given integers into a human readable roll formula)
export async function damageValueCalc (d10, d6, bonus){

  let dv = "ep2e.item.weapon.table.noDamage"
  let bonusValue = bonus ? "+"  + bonus : "";

  if (d10 && d6){
    dv = d10 + "d10+" + d6 + "d6" + bonusValue;
  }
  else if (d10 && !d6){
    dv = d10 + "d10" + bonusValue;
  }
  else if (!d10 && d6){
    dv = d6 + "d6" + bonusValue;
  }

  return {dv};
}