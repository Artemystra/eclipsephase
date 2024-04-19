import { itemReduction, listSelection, gmList } from "./common-sheet-functions.js";
import { damageValueCalc } from "./common-sheet-functions.js";
//End-to-end weapon preparation
export async function weaponPreparation(actorWhole, skillKey, rolledFrom, weaponID, mode){
  
  let selection = {};
  let weaponName = null;
  let weaponDamage = null;
  let weaponType = null;
  let currentAmmo = null;
  let maxAmmo = null;
  let weaponTraits = null;
  let weapon = null;
  let weaponMode = null;

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
      selectedWeaponMode = await selectWeaponMode(weapon, traits.curatedList, mode);

      if(selectedWeaponMode.cancel){
        return;
      }
      
      weaponDamage = selectedWeaponMode.dv;
      weaponTraits = selectedWeaponMode.weaponTraits;
      weaponMode = selectedWeaponMode.weaponMode;
    }
    else{

      let calculated = await damageValueCalc(weapon, weapon.system.mode1, traits.curatedList.mode1.automatedEffects, "weapon");

      weaponDamage = calculated.dv;
      weaponMode = "1";
    }

    rolledFrom = rolledFrom ? rolledFrom : null,
    currentAmmo = currentAmmo ? currentAmmo : null,
    selection = {weapon, weaponID, weaponName, weaponDamage, weaponType, rolledFrom, currentAmmo, weaponTraits, weaponMode}
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
    weaponMode = weaponUsed.weaponMode
    selection = {weapon, weaponID, weaponName, weaponDamage, weaponType, rolledFrom, currentAmmo, weaponTraits, weaponMode}
    
  }

  return selection
}

//Constructs a subset of active traits
export async function traitSubSetConstructor(weapon){
  console.log("My weapon:", weapon.system)
  let traitsMode1 = weapon.system.mode1.traits;
  let traitsMode2 =  weapon.system.mode2.traits;
  let accessories = weapon.system.accessories;
  let curatedList = {};
  curatedList.mode1 = {"automatedEffects" : {}, "confirmationEffects" : {}, "additionalEffects" : {}};
  curatedList.mode2 = {"automatedEffects" : {}, "confirmationEffects" : {}, "additionalEffects" : {}};
  let joinedEffectsMode1 = {}
  let joinedEffectsMode2 = {}

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
    if(key === "dvHalved" || key === "fragile" || key === "noDamage" || key === "noSmartlink" || key === "long" || key === "noClose" || key === "noPointBlank" || key === "singleUse" || key === "steady" || key === "Gyromount" || key === "laserSight" || key === "smartlink" || key === "specialAmmoBugs" || key === "specialAmmoDrugs" || key === "selfReplenishing" || key === "dvOnMiss" ){
      effects[key] = joinedEffectsMode1[key]
    }
  }
  curatedList.mode1.automatedEffects = effects
  effects = {}

  for (const key in joinedEffectsMode2){
    if(key === "dvHalved" || key === "fragile" || key === "noDamage" || key === "noSmartlink" || key === "long" || key === "noClose" || key === "noPointBlank" || key === "singleUse" || key === "steady" || key === "Gyromount" || key === "laserSight" || key === "smartlink" || key === "specialAmmoBugs" || key === "specialAmmoDrugs" || key === "selfReplenishing" || key === "dvOnMiss" ){
      effects[key] = joinedEffectsMode2[key]
    }
  }
  curatedList.mode2.automatedEffects = effects
  effects = {}

  //Effects that need human confirmation before being applied (e.g. +1d6 damage IF the target is a biomorph)
  for (const key in joinedEffectsMode1){
    if(key === "bioMorphsOnly" || key === "fixed" || key === "indirectOrBonus" || key === "touchOnly"){
      effects[key] = joinedEffectsMode1[key]
    }
  }
  curatedList.mode1.confirmationEffects = effects
  effects = {}

  for (const key in joinedEffectsMode2){
    if(key === "bioMorphsOnly" || key === "fixed" || key === "indirectOrBonus" || key === "touchOnly"){
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
          let weaponMode = "1";
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
              weaponMode = selectedWeaponMode.weaponMode;
            }

          }

          return {weaponID, weaponName, weaponDamage, weaponType, rolledFrom, currentAmmo, weaponTraits, weaponMode}
        }
      }
    }
  }  

}
  
  //Select weapon mode in case of multiple available modes
 export async function selectWeaponMode (weapon, traits, selectedWeaponMode){

    let mode1calculated = await damageValueCalc(weapon, weapon.system.mode1, traits.mode1.automatedEffects, "weapon");
    let mode2calculated = await damageValueCalc(weapon, weapon.system.mode2, traits.mode2.automatedEffects, "weapon");

    let weaponModes = [{"_id": 1, "name": weapon.system.mode1.name, "range": weapon.system.mode1.range, "firingModes": weapon.system.mode1.firingMode, "dv": mode1calculated.dv},{"_id": 2, "name": weapon.system.mode2.name, "range": weapon.system.mode2.range, "firingModes": weapon.system.mode2.firingMode, "dv": mode2calculated.dv}];
    if(!selectedWeaponMode)
      selectedWeaponMode = await listSelection(weaponModes, "weaponList" , "ep2e.roll.dialog.ranged.weaponSelect.modeSelectionHeadline");
  
    if(selectedWeaponMode.cancelled){
      let cancel = selectedWeaponMode.cancelled
      return {cancel};
    }
  
    if(selectedWeaponMode.selection === "1" || selectedWeaponMode === "1" ){
      console.log("Mode 1 selected")
      let name = weapon.system.mode1.name;
      let range = weapon.system.mode1.range;
      let firingMode = weapon.system.mode1.firingMode;
      let dv = weaponModes[0].dv
      let weaponTraits = traits.mode1
      let weaponMode = "1"
    
      return {name, range, firingMode, dv, weaponTraits, weaponMode};
  
    }
    
    else {
      let name = weapon.system.mode2.name;
      let range = weapon.system.mode2.range;
      let firingMode = weapon.system.mode2.firingMode;
      let dv = weaponModes[1].dv
      let weaponTraits = traits.mode2
      let weaponMode = "2"
    
      return {name, range, firingMode, dv, weaponTraits, weaponMode};
  
    }
  
  }

//Reload Weapons
export async function reloadWeapon(html, actor) {
    
    html.find('.reload').click( async event => {
        event.preventDefault();
        const ammoRules = game.settings.get("eclipsephase", "ammoRules");
        const element = event.currentTarget;
        const dataset = element.dataset;
        const weaponID = dataset.weaponid;
        const weapon = actor.items.get(weaponID);
        const maxAmmo = weapon.system.ammoMax;
        const weaponName = weapon.name;
        const selfReplenishing = weapon.system.mode1.traits.selfReplenishing.value;
        const usesDrugs = weapon.system.mode1.traits.specialAmmoDrugs.value;
        const usesBugs = weapon.system.mode1.traits.specialAmmoBugs.value;
        const ammoType = usesDrugs ? "chemical" : (usesBugs ? "swarm" : weapon.system.ammoType);
        const ammoPresent = weapon.system.ammoSelected._id ? weapon.system.ammoSelected._id : "-"
        const WEAPON_DAMAGE_OUTPUT = 'systems/eclipsephase/templates/chat/damage-result.html';
        let currentAmmo = weapon.system.ammoMin;
        let difference = maxAmmo - currentAmmo;
        let weaponUpdate = [];
        let ammoList = [];
        let numberOfPacks = actor.ammo[ammoType] ? actor.ammo[ammoType].length : 0;
        let ammoSelected = "";
        let calculated = null;
        let traits = null;
        let dv = "";

        //Checks whether fitting ammo is present at all
        if (numberOfPacks >= 1 || selfReplenishing){
          //Creates a list of all applicable ammo available
          if (numberOfPacks > 1 || selfReplenishing && numberOfPacks >= 1){
              if (selfReplenishing){
                let ammoName = "ep2e.item.weapon.table.selfReplenish"
                let ammoEntry = {"_id":weapon.system.ammoSelected._id, "name": ammoName, "traits": weapon.system.ammoSelected.traits, "dv": weapon.system.ammoSelected.dvModifier.calculated}
                ammoList.push(ammoEntry)
              }
            for (let ammo of actor.ammo[ammoType]){
  
                calculated = await damageValueCalc(ammo, ammo.system.dv, traits, "ammo")
                traits = ammoType != "chemical" ? ammo.system.traits : {};
                dv = ammoType != "chemical" ? calculated.dv : "ep2e.item.weapon.table.noDamageValueModifier";

                let ammoEntry = {"_id":ammo._id, "name": ammo.name, "traits": traits, "dv": dv}
                ammoList.push(ammoEntry)
            }
  
            let selectedAmmo = await listSelection(ammoList, "ammoList");
      
            if(selectedAmmo.cancelled){
              let cancel = selectedAmmo.cancelled
              return {cancel};
            }
            
            if(selectedAmmo.selection === weapon.system.ammoSelected._id && selfReplenishing){

              await selfReplenish (actor, maxAmmo, weaponID, weaponName, weapon, difference, WEAPON_DAMAGE_OUTPUT);

              return;
            }

            ammoSelected = actor.items.get(selectedAmmo.selection);
            let calc = await damageValueCalc(ammoSelected, ammoSelected.system.dv, ammoSelected.system.traits, "ammo");
            dv = ammoType != "chemical" ? calc.dv : "ep2e.item.weapon.table.noDamageValueModifier";
          }
          //Just uses the only fitting ammo pack available
          else if (!selfReplenishing){
            ammoSelected = actor.ammo[ammoType][0];
            let calc = await damageValueCalc(ammoSelected, ammoSelected.system.dv, ammoSelected.system.traits, "ammo");
            dv = ammoType != "chemical" && !selfReplenishing ? calc.dv : "ep2e.item.weapon.table.noDamageValueModifier";
          }

          
          //Refills the weapon if selfReplenishing 'true' & no other swarm was selected
          if (selfReplenishing && numberOfPacks < 1){

            await selfReplenish (actor, maxAmmo, weaponID, weaponName, weapon, difference, WEAPON_DAMAGE_OUTPUT);

            return;
          }

          traits = ammoSelected.system.traits
          ammoSelected.system.areaeffect ? traits["effectRadius"] = {"name" : "ep2e.item.weapon.table.trait.effectRadius", "value" : true, "radius" : ammoSelected.system.areaeffect} : null

          calculated = await damageValueCalc(ammoSelected, ammoSelected.system.dv, traits, "ammo")

          if (difference>0 || ammoPresent != ammoSelected._id){
            weaponUpdate.push({
              "_id" : weaponID,
              "system.ammoSelected.traits": {},
            });
            await actor.updateEmbeddedDocuments("Item", weaponUpdate);
          }

          //Automatic ammo deduction (based on the setting chosen in eclipsephase.js)
          //Survival mode (deduction/deletion)
          if (ammoRules === "survival" && actor.type === "character"){
            if (difference>0 || ammoPresent != ammoSelected._id){
              await itemReduction(actor, ammoSelected._id, ammoSelected.system.quantity)
            }
          }

          //Grenades only mode (deduction/deletion)
          if (ammoRules === "grenadesOnly" && actor.type === "character"){
            if(ammoSelected.system.type === "seeker" || ammoSelected.type === "chemical" ){
              if (difference>0 || ammoPresent != ammoSelected._id){
                await itemReduction(actor, ammoSelected._id, ammoSelected.system.quantity)
              }
            }
          }

          if (difference>0 || ammoPresent != ammoSelected._id){
            currentAmmo = maxAmmo;

            weaponUpdate.push({
              "_id" : weaponID,
              "system.ammoMin": currentAmmo,
              "system.ammoSelected._id": ammoSelected._id,
              "system.ammoSelected.name": ammoSelected.name,
              "system.ammoSelected.dvModifier": ammoType != "chemical" ? ammoSelected.system.dv : {"d10": 0, "d6" : 0, "bonus" : 0},
              "system.ammoSelected.description": ammoSelected.system.description,
              "system.ammoSelected.dvModifier.calculated": dv,
              "system.ammoSelected.traits": ammoType != "chemical" ? traits : {}
            });
            
            let message = {};
            message.type = "reload";
            message.copy = "ep2e.roll.announce.combat.ranged.reloadedWeapon";
            message.weaponName = weaponName;
            message.ammoLoadedName = ammoSelected.name
            
            html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

            if(actor.type === "charachter"){
              ChatMessage.create({
                  speaker: ChatMessage.getSpeaker({actor: actor}),
                  content: html
              })
            }
            else{
              ChatMessage.create({
                  speaker: ChatMessage.getSpeaker({actor: actor}),
                  content: html,
                  whisper: gmList()
              })
            }

            return actor.updateEmbeddedDocuments("Item", weaponUpdate);
          }
          else {

            let message = {};
            message.type = "reload";
            message.copy = "ep2e.roll.announce.combat.ranged.weaponFull";
            message.weaponName = weaponName;
            message.ammoLoadedName = null
            
            html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: actor}),
                content: html,
                whisper: [game.user._id]
            })

          }
        }
        else {

          let message = {};
          message.type = "reload";
          message.copy = "ep2e.roll.announce.combat.ranged.noAmmoPresent";
          message.weaponName = weaponName;
          message.ammoLoadedName = ammoType[0].toUpperCase() + ammoType.slice(1)
          
          html = await renderTemplate(WEAPON_DAMAGE_OUTPUT, message)

          ChatMessage.create({
              speaker: ChatMessage.getSpeaker({actor: actor}),
              content: html,
              whisper: [game.user._id]
          })

        }

    })
  }

  //Reloading self replenishing weapons
  async function selfReplenish (actor, maxAmmo, weaponID, weaponName, weapon, difference, htmlTemplate){
    let weaponUpdate = [];
    if (difference > 0){
      let currentAmmo = maxAmmo;

      weaponUpdate.push({
        "_id" : weaponID,
        "system.ammoMin": currentAmmo
      });
  
      let message = {};
      message.type = "reload";
      message.copy = "ep2e.roll.announce.combat.ranged.reloadedWeapon";
      message.weaponName = weaponName;
      message.ammoLoadedName = weapon.system.ammoSelected.name
      
      let html = await renderTemplate(htmlTemplate, message)

      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: actor}),
          content: html
      })

      return actor.updateEmbeddedDocuments("Item", weaponUpdate);
    }
    else{

      let message = {};
      message.type = "reload";
      message.copy = "ep2e.roll.announce.combat.ranged.weaponFull";
      message.weaponName = weaponName;
      message.ammoLoadedName = null
      
      let html = await renderTemplate(htmlTemplate, message)

      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: actor}),
          content: html,
          whisper: [game.user._id]
      })

      return;
    }
  }