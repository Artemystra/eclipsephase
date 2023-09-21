import { listSelection } from "./common-sheet-functions.js";
//End-to-end weapon preparation
export async function weaponPreparation(actorModel, actorWhole, skillKey, rolledFrom, weaponID){
  
  let selection = {};
  let weaponName = null;
  let weaponDamage = null;
  let weaponType = null;
  let currentAmmo = null;
  let maxAmmo = null;
  let weaponTraits = null;
  let weapon = null;



  if (rolledFrom === "ccWeapon" || rolledFrom === "rangedWeapon"){
    weapon = actorWhole.items.get(weaponID);
    let selectedWeaponMode = "";
    let traits = await traitSubSetConstructor(weapon);
    weaponTraits = traits.curatedList.mode1
    weaponName = weapon.name;
    weaponType = rolledFrom === "ccWeapon" ? "melee" : "ranged";
    currentAmmo = weapon.system.ammoMin;
    maxAmmo = weapon.system.ammoMax;

    if (weapon.system.additionalMode){
      selectedWeaponMode = await selectWeaponMode(weapon, traits.curatedList);

      if(selectedWeaponMode.cancel){
        return;
      }
      
      weaponDamage = selectedWeaponMode.dv;
      weaponTraits = selectedWeaponMode.weaponTraits;
    }
    else{

      let calculated = await damageValueCalc(weapon, weapon.system.mode1, traits.curatedList.mode1.automatedEffects, "weapon");

      weaponDamage = calculated.dv;
    }
    
    rolledFrom = rolledFrom ? rolledFrom : null,
    currentAmmo = currentAmmo ? currentAmmo : null,
    selection = {weapon, weaponID, weaponName, weaponDamage, weaponType, rolledFrom, currentAmmo, weaponTraits}
  }
  else {
    let weaponUsed = await weaponListConstructor(actorWhole, skillKey)

    if(weaponUsed.cancel){
        return;
    }

    weapon = actorWhole.items.get(weaponUsed.weaponID),
    weaponID = weaponUsed.weaponID,
    weaponName = weaponUsed.weaponName,
    weaponDamage = weaponUsed.weaponDamage,
    weaponType = weaponUsed.weaponType,
    rolledFrom = weaponUsed.rolledFrom ? weaponUsed.rolledFrom : null,
    currentAmmo = weaponUsed.currentAmmo ? weaponUsed.currentAmmo : null,
    weaponTraits = weaponUsed.weaponTraits
    selection = {weapon, weaponID, weaponName, weaponDamage, weaponType, rolledFrom, currentAmmo, weaponTraits}
    
  }

  return {selection}
}

//Constructs a subset of active traits
async function traitSubSetConstructor(weapon){

  let traitsMode1 = weapon.system.mode1.traits;
  let traitsMode2 =  weapon.system.mode2.traits;
  let accessories = weapon.system.accessories;
  let curatedList = {};
  curatedList.mode1 = {"automatedEffects" : {}, "confirmationEffects" : {}, "additionalEffects" : {}};
  curatedList.mode2 = {"automatedEffects" : {}, "confirmationEffects" : {}, "additionalEffects" : {}};
  let joinedEffectsMode1 = {}
  let joinedEffectsMode2 = {}

  console.log("***traits1 ",traitsMode1, " & traits 2 ",traitsMode2)

  //Clears the weapon's traits list of all inactive traits
  for (const key in traitsMode1){
    if (traitsMode1[key].value){
      joinedEffectsMode1[key] = traitsMode1[key]
    }
  }
  for (const key in traitsMode2){
    if (traitsMode2[key].value){
      joinedEffectsMode2[key] = traitsMode2[key]
    }
  }

  //Checks weapon & ammo traits on rangedWeapons for duplicates and joins a list with all uniques for both modes
  if (weapon.type === "rangedWeapon"){
    let ammoTraits = weapon.system.ammoSelected.traits;
    
    //Summarizes traits (weapon & ammo) in two collections
    for (const key in ammoTraits){
      if (ammoTraits[key].value){

        if(!(key in joinedEffectsMode1)){
          joinedEffectsMode1[key] = ammoTraits[key]
        }
        
        if(!(key in joinedEffectsMode2)){
          joinedEffectsMode2[key] = ammoTraits[key]
        }

      }
    }
    console.log("***traits1 ",joinedEffectsMode1, " & traits 2 ",joinedEffectsMode2)

    //Adds acessories to both collections
    for (const key in accessories){
      if (accessories[key].value){
      joinedEffectsMode1[key] = accessories[key]

      joinedEffectsMode2[key] = accessories[key]
      }
    }
    
  }

  //The list is split into 3 sub lists, based on the place in the code they're used in
  let effects = {}
  
  //Effects that are automatically used and accounted for during weapon preparation (e.g. -1d10 damage)
  for (const key in joinedEffectsMode1){
    if(key === "dvHalved" || key === "fragile" || key === "noDamage" || key === "noSmartlink" || key === "long" || key === "noClose" || key === "noPointBlank" || key === "singleUse" || key === "steady" || key === "Gyromount" || key === "laserSight" || key === "smartlink" || key === "specialAmmoBugs" || key === "specialAmmoDrugs" || key === "selfReplenishing"){
      effects[key] = joinedEffectsMode1[key]
    }
  }
  curatedList.mode1.automatedEffects = effects
  effects = {}

  for (const key in joinedEffectsMode2){
    if(key === "dvHalved" || key === "fragile" || key === "noDamage" || key === "noSmartlink" || key === "long" || key === "noClose" || key === "noPointBlank" || key === "singleUse" || key === "steady" || key === "Gyromount" || key === "laserSight" || key === "smartlink" || key === "specialAmmoBugs" || key === "specialAmmoDrugs" || key === "selfReplenishing"){
      effects[key] = joinedEffectsMode2[key]
    }
  }
  curatedList.mode2.automatedEffects = effects
  effects = {}

  //Effects that need human confirmation before being applied (e.g. +1d6 damage IF the target is a biomorph)
  for (const key in joinedEffectsMode1){
    if(key === "bioMorphsOnly" || key === "dvOnMiss" || key === "fixed" || key === "indirectOrBonus" || key === "touchOnly"){
      effects[key] = joinedEffectsMode1[key]
    }
  }
  curatedList.mode1.confirmationEffects = effects
  effects = {}

  for (const key in joinedEffectsMode2){
    if(key === "bioMorphsOnly" || key === "dvOnMiss" || key === "fixed" || key === "indirectOrBonus" || key === "touchOnly"){
      effects[key] = joinedEffectsMode2[key]
    }
  }
  curatedList.mode2.confirmationEffects = effects
  effects = {}


  //Effects that will effect the nature of the damage taken once the shot hit (e.g. "Shock", "Armor Piercing", "Stun" etc.)
  for (const key in joinedEffectsMode1){
    if(key === "blinding" || key === "disablesRadio" || key === "entagling" || key === "knockdown"|| key === "reach"  || key === "pain" || key === "shock" || key === "stun" || key === "singleUse" || key === "stunBiomorphs" || key === "armorPiercing" || key === "noDamage" || key === "imagingScope" || key === "flashSuppressor" || key === "safetySystem" || key === "shockSafety" || key === "silencer" || key === "effectRadius" || key === "multiShot"){
      effects[key] = joinedEffectsMode1[key]
    }
  }
  curatedList.mode1.additionalEffects = effects
  effects = {}

  for (const key in joinedEffectsMode2){
    if(key === "blinding" || key === "disablesRadio" || key === "entagling" || key === "knockdown"|| key === "reach"  || key === "pain" || key === "shock" || key === "stun" || key === "singleUse" || key === "stunBiomorphs" || key === "armorPiercing" || key === "noDamage" || key === "imagingScope" || key === "flashSuppressor" || key === "safetySystem" || key === "shockSafety" || key === "silencer" || key === "effectRadius" || key === "multiShot"){
      effects[key] = joinedEffectsMode2[key]
    }
  }
  curatedList.mode2.additionalEffects = effects

  
  return{curatedList}
}

//Constructs the weapon overlay for selecting a weapon for melee/ranged attacks
export async function weaponListConstructor(actor, skillKey){
  
  let flatRollLabel = game.i18n.localize('ep2e.roll.dialog.button.withoutWeapon');
  let weaponslist = [{"_id":1, "name": flatRollLabel},{"_id":"", "name": ""}];
  let actorType = actor.type;
  let checkWeapon = "";
  let weaponID = null;
  let weaponTraits = {};
  let actorWeapons = skillKey === "guns" ? actor.rangedWeapon : actor.ccweapon;

  //Weapon list overlay
  for (let weapon of actorWeapons){
    if (actorType === "character"){
        if (weapon.system.active === true){

            let traits = await traitSubSetConstructor(weapon)
            let calculated = await damageValueCalc(weapon, weapon.system.mode1, traits.curatedList.mode1.automatedEffects, "weapon")
      
            let weaponEntry = skillKey === "guns" ? {"_id":weapon._id, "name": weapon.name, "ammoCur": weapon.system.ammoMin, "ammoMax": weapon.system.ammoMax, "dv": calculated.dv} : {"_id":weapon._id, "name": weapon.name, "dv": calculated.dv};
            weaponslist.push(weaponEntry)
        }
    }
    else {

        let traits = await traitSubSetConstructor(weapon)
        let calculated = await damageValueCalc(weapon, weapon.system.mode1, traits.curatedList.mode1.automatedEffects, "weapon")

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
          let rolledFrom = weaponObj.type;
          let weaponType = rolledFrom === "ccWeapon" ? "melee" : "ranged";
          let currentAmmo = weaponObj.system.ammoMin;
          let traits = await traitSubSetConstructor(weaponObj)
          weaponTraits = traits.curatedList.mode1

          let calculated = await damageValueCalc(weaponObj, weaponObj.system.mode1, traits.curatedList.mode1.automatedEffects, "weapon")

          let weaponDamage = calculated.dv;
          
          if(weaponObj.system.additionalMode){
            let selectedWeaponMode = await selectWeaponMode(weaponObj, traits.curatedList);

            if(selectedWeaponMode.cancel){
              let cancel = selectedWeaponMode.cancel
              return {cancel};
            }
            else{
              weaponDamage = selectedWeaponMode.dv;
              weaponTraits = selectedWeaponMode.weaponTraits;
            }

          }

          return {weaponID, weaponName, weaponDamage, weaponType, rolledFrom, currentAmmo, weaponTraits}
        }
      }
    }
  }  

}
  
  //Select weapon mode in case of multiple available modes
  async function selectWeaponMode (weapon, traits){

    let mode1calculated = await damageValueCalc(weapon, weapon.system.mode1, traits.mode1.automatedEffects, "weapon");
    let mode2calculated = await damageValueCalc(weapon, weapon.system.mode2, traits.mode2.automatedEffects, "weapon");

  
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
      let weaponTraits = traits.mode1
    
      return {name, range, firingMode, dv, weaponTraits};
  
    }
    
    else {
      let name = weapon.system.mode2.name;
      let range = weapon.system.mode2.range;
      let firingMode = weapon.system.mode2.firingMode;
      let dv = weaponModes[1].dv
      let weaponTraits = traits.mode2
    
      return {name, range, firingMode, dv, weaponTraits};
  
    }
  
  }
  
//DV calculator (this translates the three given integers into a human readable roll formula)
export async function damageValueCalc (object, dvPath, traits, calcType){
  let dv = "";
  
  if(calcType === "ammo"){
    //Ammo Damage Calculation
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
    
  }
  else if (calcType === "weapon"){
    //if the weapon has the noDamage Trait the calculation is skipped
    if (traits.noDamage){
      dv = "ep2e.item.weapon.table.noDamageAmmo"
    }
    //Weapon Damage Calculation
    else {
      console.log("***weapon ",object)
      let d10 = Number(dvPath.d10);
      let d6 = Number(dvPath.d6);
      let bonus = Number(dvPath.bonus);
      //Ammo damage modifier
      if (object.type != "ccWeapon"){
        if (!object.system.ammoSelected.traits.bioMorphsOnly.value && !object.system.ammoSelected.traits.dvOnMiss.value){
          d10 += Number(object.system.ammoSelected.dvModifier.d10);
          d6 += Number(object.system.ammoSelected.dvModifier.d6);
          bonus += Number(object.system.ammoSelected.dvModifier.bonus);
        }
      }
      if (!d10 && !d6 && !bonus){
        dv = "ep2e.item.weapon.table.noDamage"
      }
      /*else if(object.system.ammoSelected.traits){
  
      }*/
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
        let traits = null;

        if (numberOfPacks >= 1){
          if (numberOfPacks > 1){
            for (let ammo of actor.ammo[ammoType]){

                traits = ammo.system.traits
  
                calculated = await damageValueCalc(ammo, ammo.system.dv, traits, "ammo")
                let ammoEntry = {"_id":ammo._id, "name": ammo.name, "traits": traits, "dv": calculated.dv}
                ammoList.push(ammoEntry)
            }
  
            let selectedAmmo = await listSelection(ammoList, "ammoList");
      
            if(selectedAmmo.cancelled){
              let cancel = selectedAmmo.cancelled
              return {cancel};
            }
  
            ammoSelected = actor.items.get(selectedAmmo.selection);
          }
          else {
            ammoSelected = actor.ammo[ammoType][0];
          }

          traits = ammoSelected.system.traits
          ammoSelected.system.areaeffect ? traits["effectRadius"] = {"name" : "ep2e.item.weapon.table.trait.effectRadius", "value" : true, "radius" : ammoSelected.system.areaeffect} : null

          console.log("**traitTest: ", traits)

          calculated = await damageValueCalc(ammoSelected, ammoSelected.system.dv, traits, "ammo")

          if (difference>0 || ammoPresent != ammoSelected._id){
            ammoUpdate.push({
              "_id" : weaponID,
              "system.ammoSelected.traits": {},
            });
            actor.updateEmbeddedDocuments("Item", ammoUpdate);
          }

          if (difference>0 || ammoPresent != ammoSelected._id){
            currentAmmo = maxAmmo;


            ammoUpdate.push({
              "_id" : weaponID,
              "system.ammoMin": currentAmmo,
              "system.ammoSelected._id": ammoSelected._id,
              "system.ammoSelected.name": ammoSelected.name,
              "system.ammoSelected.dvModifier": ammoSelected.system.dv,
              "system.ammoSelected.description": ammoSelected.system.description,
              "system.ammoSelected.dvModifier.calculated": calculated.dv,
              "system.ammoSelected.traits": traits,
            });
      
            let message = game.i18n.localize("ep2e.roll.announce.combat.ranged.reloadedWeapon");
            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({actor: actor}),
              flavor: "<center>" + message + "<p><strong>(" + weaponName + ")</strong></center><p/>"
            })
          
            return actor.updateEmbeddedDocuments("Item", ammoUpdate);
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