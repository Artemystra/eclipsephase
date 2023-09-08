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
      let dialogType = "weaponList";
      checkWeapon = await GetWeaponsList(weaponslist, dialogType)
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
    async function GetWeaponsList(weaponslist, dialogType){
      let dialogName = game.i18n.localize('ep2e.actorSheet.dialogHeadline.confirmationNeeded');
      let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
      let useButton = game.i18n.localize('ep2e.actorSheet.button.select');
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

//Reload Weapons
export async function reloadWeapon(html, actor) {
    html.find('.reload').click( event => {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;
        const weaponID = dataset.weaponid;
        const weapon = actor.items.get(weaponID);
        const maxAmmo = weapon.system.ammoMax;
        const ammoType = weapon.system.ammoType;
        const ammoSelected = weapon.system.ammoSelected
        const loadout = actor.items.get(ammoSelected)
        const weaponName = weapon.name;
        let currentAmmo = weapon.system.ammoMin;
        let difference = maxAmmo - currentAmmo;
        let ammoUpdate = [];
        let ammoLoaded = Boolean(loadout);
        let ammoPresent = ammoLoaded ? true : Boolean(actor.ammo[ammoType].length);

        console.log("Ammo is present: ", ammoPresent)

        /*for (let weapon of actorWeapons){
          if (actorType === "character"){
            if (weapon.system.active === true){
          
                let weaponEntry = skillKey === "guns" ? {"_id":weapon._id, "name": weapon.name, "ammoCur": weapon.system.ammoMin, "ammoMax": weapon.system.ammoMax, "dv": calculated.dv} : {"_id":weapon._id, "name": weapon.name, "dv": calculated.dv};
                weaponslist.push(weaponEntry)
            }
          }
        }*/

        if (ammoLoaded || ammoPresent){
          if (difference>0){
            currentAmmo = maxAmmo;
            ammoUpdate.push({
              "_id" : weaponID,
              "system.ammoMin": currentAmmo
            });
      
            actor.updateEmbeddedDocuments("Item", ammoUpdate);
            let message = game.i18n.localize("ep2e.roll.announce.combat.ranged.reloadedWeapon");
      
            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({actor: actor}),
              flavor: "<center>" + message + "<p><strong>(" + weaponName + ")</strong></center><p/>"
          })
          }
          else {
          let message = game.i18n.localize("ep2e.roll.announce.combat.ranged.weaponFull");
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actor}),
            content: "<center>" + message + "<p><strong>(" + weaponName + ")</strong></center><p/>",
            whisper: [game.user._id]
          })
          }
        }
        else {
          let message = game.i18n.localize("ep2e.roll.announce.combat.ranged.noAmmoPresent");
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actor}),
            content: "<center>" + message + "<p><strong>(" + ammoType + ")</strong></center><p/>",
            whisper: [game.user._id]
          })
        }

        /*for(let item of actor.consumable){
          if(item.type === amunition){
            if(test = 0){}
          }
        }*/
    })
  }