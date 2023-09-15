import { listSelection } from "./common-sheet-functions.js";
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
  
        let calculated = await damageValueCalc(weapon, weapon.system.mode1, weapon.system.mode1.traits, "weapon")
  
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
  
              let calculated = await damageValueCalc(weapon, weapon.system.mode1, weapon.system.mode1.traits, "weapon")
        
              let weaponEntry = skillKey === "guns" ? {"_id":weapon._id, "name": weapon.name, "ammoCur": weapon.system.ammoMin, "ammoMax": weapon.system.ammoMax, "dv": calculated.dv} : {"_id":weapon._id, "name": weapon.name, "dv": calculated.dv};
              weaponslist.push(weaponEntry)
          }
      }
      else {
  
          let calculated = await damageValueCalc(weapon, weapon.system.mode1, weapon.system.mode1.traits, "weapon")
  
          let weaponEntry = skillKey === "guns" ? {"_id":weapon._id, "name": weapon.name, "ammoCur": weapon.system.ammoMin, "ammoMax": weapon.system.ammoMax, "dv": calculated.dv} : {"_id":weapon._id, "name": weapon.name, "dv": calculated.dv};
          weaponslist.push(weaponEntry)
      }
    }
  
    if (weaponslist.length > 2){
      checkWeapon = await listSelection(weaponslist, "weaponList")
      weaponID = checkWeapon.selection ? checkWeapon.selection : weaponID = "0";
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
  
            let calculated = await damageValueCalc(weaponObj, weaponObj.system.mode1, weaponObj.system.mode1.traits, "weapon")
  
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
  
  }
  
  //Select weapon mode in case of multiple available modes
  async function selectWeaponMode (weapon){
    
    let mode1calculated = await damageValueCalc(weapon, weapon.system.mode1, weapon.system.mode1.traits, "weapon");
    let mode2calculated = await damageValueCalc(weapon, weapon.system.mode2, weapon.system.mode2.traits, "weapon");
  
    let weaponModes = [{"_id": 1, "name": weapon.system.mode1.name, "range": weapon.system.mode1.range, "firingModes": weapon.system.mode1.firingMode, "dv": mode1calculated.dv},{"_id": 2, "name": weapon.system.mode2.name, "range": weapon.system.mode2.range, "firingModes": weapon.system.mode2.firingMode, "dv": mode2calculated.dv}];
    let selectedWeaponMode = await listSelection(weaponModes, "weaponList" , "ep2e.roll.dialog.ranged.weaponSelect.modeSelectionHeadline");
  
    if(selectedWeaponMode.cancelled){
      let cancel = selectedWeaponMode.cancelled
      return {cancel};
    }
  
    if(selectedWeaponMode.selection === "1"){
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
  
  }
  
  //DV calculator (this translates the three given integers into a human readable roll formula)
  export async function damageValueCalc (object, dvPath, traits, calcType){
    let dv = "";
    
    if(calcType === "ammo"){
      //Ammo Damage Calculation
      console.log("BINGO IN AMMO")
      dv = "ep2e.item.weapon.table.noDamageValueModifier"
      const d10 = dvPath.d10
      const d6 = dvPath.d6
      const bonus = dvPath.bonus
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
      
      console.log("BINGO IN AMMO", d10, d6, bonus)
      console.log("BINGO IN AMMO", dv)
    }
    else if (calcType === "weapon"){
      //Weapon Damage Calculation
      const d10 = dvPath.d10
      const d6 = dvPath.d6
      const bonus = dvPath.bonus
      if (!d10 && !d6 && !bonus){
        dv = "ep2e.item.weapon.table.noDamage"
      }
      else if(object.system.ammoSelected.traits){

      }
      else {
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
      }
    }
  
    return {dv};
  }

//Reload Weapons
export async function reloadWeapon(html, actor) {
    
    html.find('.reload').click( async event => {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;
        const weaponID = dataset.weaponid;
        const weapon = actor.items.get(weaponID);
        const maxAmmo = weapon.system.ammoMax;
        const ammoType = weapon.system.ammoType;
        const weaponName = weapon.name;
        const ammoPresent = weapon.system.ammoSelected._id ? weapon.system.ammoSelected._id : "-"
        let currentAmmo = weapon.system.ammoMin;
        let difference = maxAmmo - currentAmmo;
        let ammoUpdate = [];
        let ammoList = [];
        let numberOfPacks = actor.ammo[ammoType] ? actor.ammo[ammoType].length : 0;
        let ammoSelected = "";
        let calculated = null;
        let object = {};

        if (numberOfPacks >= 1){
          if (numberOfPacks > 1){
            for (let ammo of actor.ammo[ammoType]){
  
                calculated = await damageValueCalc(ammo, ammo.system.dv, ammo.system.traits, "ammo")
                let ammoEntry = {"_id":ammo._id, "name": ammo.name, "traits": ammo.system.traits, "dv": calculated.dv}
                console.log("This is my ammoEntry: ", ammoEntry)
                ammoList.push(ammoEntry)
            }
  
            let selectedAmmo = await listSelection(ammoList, "ammoList");
      
            if(selectedAmmo.cancelled){
              let cancel = selectedAmmo.cancelled
              return {cancel};
            }
  
            ammoSelected = actor.items.get(selectedAmmo.selection)
          }
          else {
            ammoSelected = actor.ammo[ammoType][0]
          }

          calculated = await damageValueCalc(ammoSelected, ammoSelected.system.dv, ammoSelected.system.traits, "ammo")

          console.log("Ammo Selected? ", ammoSelected)
          for(let trait in ammoSelected.system.traits){
            let traitThing = ammoSelected.system.traits[trait].value
            console.log("This is my trait: ",traitThing)
            if(ammoSelected.system.traits[trait].value){
              console.log("Bingo!")
              object[trait] = ammoSelected.system.traits[trait]
            }
          }

          console.log("Is object? ", Boolean(object))
          console.log("This is my ammoSelected traits", ammoSelected.system.traits);
          console.log("This is my object traits", object.length);

          if (difference>0 || ammoPresent != ammoSelected._id){
            currentAmmo = maxAmmo;
            console.log(Boolean(ammoPresent === ammoSelected._id))
            ammoUpdate.push({
              "_id" : weaponID,
              "system.ammoMin": currentAmmo,
              "system.ammoSelected._id": ammoSelected._id,
              "system.ammoSelected.name": ammoSelected.name,
              "system.ammoSelected.dvModifier": ammoSelected.system.dv,
              "system.ammoSelected.description": ammoSelected.system.description,
              "system.ammoSelected.dvModifier.calculated": calculated.dv,
              "system.ammoSelected.traits": Object.keys(object).length > 0 ? object : false
            });
            console.log("This is my ammoUpdate: ", ammoUpdate)
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

    })
  }