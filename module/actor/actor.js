import { eclipsephase } from "../config.js"

/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class EclipsePhaseActor extends Actor {

  static SKILL_DATA = [
    { skill: "athletics", aptitude: "som", multiplier: 1, category: "vigor" },
    { skill: "deceive", aptitude: "sav", multiplier: 1, category: "moxie" },
    { skill: "fray", aptitude: "ref", multiplier: 2, category: "vigor" },
    { skill: "free fall", aptitude: "som", multiplier: 1, category: "vigor" },
    { skill: "guns", aptitude: "ref", multiplier: 1, category: "vigor" },
    { skill: "infiltrate", aptitude: "ref", multiplier: 1, category: "vigor" },
    { skill: "infosec", aptitude: "cog", multiplier: 1, category: "insight" },
    { skill: "interface", aptitude: "cog", multiplier: 1, category: "insight" },
    { skill: "kinesics", aptitude: "sav", multiplier: 1, category: "moxie" },
    { skill: "melee", aptitude: "som", multiplier: 1, category: "vigor" },
    { skill: "perceive", aptitude: "int", multiplier: 2, category: "insight" },
    { skill: "persuade", aptitude: "sav", multiplier: 1, category: "moxie" },
    { skill: "program", aptitude: "cog", multiplier: 1, category: "insight" },
    { skill: "provoke", aptitude: "sav", multiplier: 1, category: "moxie" },
    { skill: "psi", aptitude: "wil", multiplier: 1, category: "moxie" },
    { skill: "research", aptitude: "int", multiplier: 1, category: "insight" },
    { skill: "survival", aptitude: "int", multiplier: 1, category: "insight" },
  ]

  /**
   * Augment the basic actor data with additional dynamic data.
   */
  prepareData() {
    super.prepareData();

    const actorData = this.system
    const flags = actorData.flags;
    const items = this.items;
    const psiMod = 0;
    const brewStatus = game.settings.get("eclipsephase", "superBrew");

    // Homebrew Switch
    if (brewStatus) {
      actorData.homebrew = true;
    }
    else {
      actorData.homebrew = false;
    }

    // if(actorData.type === 'character' || actorData.type === 'npc' || actorData.type === 'goon')
    //   this._prepareCharacterData(actorData)

    //HOMEBREW - Encumbrance through weapons & gear
    if(actorData.homebrew === true && this.type === "character"){
      //Weapon Variables
      let weaponScore = 0
      let bulkyWeaponCount = 0
      let weaponMalus = 0;
      //Weapon loop
      for(let weaponCheck of items){
        if(weaponCheck.type === "ccWeapon" || weaponCheck.type === "rangedWeapon") {
          if(weaponCheck.active === true && weaponCheck.slotType === "Sidearm"){
            weaponScore++;
          } 
          else if(weaponCheck.active === true && weaponCheck.slotType === "One Handed"){
            weaponScore += 2;
          }
          else if(weaponCheck.active === true && weaponCheck.slotType === "Two Handed"){
            weaponScore += 5;
          }
          else if(weaponCheck.active === true && weaponCheck.slotType === "Bulky"){
            bulkyWeaponCount++;
          }
        }
      }
      if(weaponScore > 6){
        
        weaponMalus = Math.ceil((weaponScore-5)/5)*10;
      }
      actorData.physical.totalWeaponMalus = weaponMalus;
      //Gear Variables
      let accessoryCount = 0;
      let bulkyCount = bulkyWeaponCount;
      let accessoryMalus = 0;
      let bulkyMalus = 0;
      //Gear loop
      for(let gearCheck of items){
        if(gearCheck.type === "gear" && gearCheck.active === true && gearCheck.slotType === "Accessory"){
          accessoryCount++;
        }
        if(gearCheck.type === "gear" && gearCheck.active === true && gearCheck.slotType === "Bulky"){
          bulkyCount++;
        }    
      }
      if(accessoryCount > 4){
        accessoryMalus = Math.ceil((accessoryCount-4)/4)*10;
      }
      if(bulkyCount >= 1){
        bulkyMalus = (bulkyCount)*20;
      }
      actorData.physical.totalGearMalus = bulkyMalus + accessoryMalus;
    }
    //In case "Homebrew" is ticked off, this prevents a NaN failure in the dice roll
    else {
      actorData.physical.totalWeaponMalus = 0;
      actorData.physical.totalGearMalus = 0;
    }
    
    //Determin whether any gear is present
    actorData.hasGear=false;
    for(let gearCheck of items){
      if(gearCheck.displayCategory === "ranged" || gearCheck.displayCategory === "ccweapon" || gearCheck.displayCategory === "gear"){
        actorData.hasGear = true;
        break;
      }
    }

    //Checks if morph & ego picture are the same
    if (actorData.img === actorData.bodies.morph1.img){
      console.log("Check if the same picture is used for Ego & Body. Source: actor.js");
    }

    this._calculateMentalHealth(actorData)

    //Physical Health
    //NPCs & Goons only
    if(this.type === 'npc' || this.type === 'goon') {

      //Calculating WT & DR
      actorData.health.physical.max = (actorData.bodies.morph1.dur) + eval(actorData.mods.durmod) // only one morph for npcs
      actorData.physical.wt = Math.round(actorData.health.physical.max / 5)
      actorData.physical.dr = Math.round(actorData.health.physical.max * 
        eclipsephase.damageRatingMultiplier[actorData.bodyType.value])

      if(actorData.health.physical.value === null) {
        actorData.health.physical.value = actorData.health.physical.max
      }
    }
    //Characters only
    //Durability
    if(this.type === "character") {
      let morph = actorData.bodies[actorData.bodies.activeMorph]
      actorData.health.physical.max = morph.dur + eval(actorData.mods.durmod)
      actorData.physical.wt = Math.round(actorData.health.physical.max / 5)
      actorData.physical.dr = Math.round(actorData.health.physical.max * 
        eclipsephase.damageRatingMultiplier[morph.type])
      if(actorData.health.physical.value === null) {
        actorData.health.physical.value = actorData.health.physical.max
      }

      this._calculatePools(actorData, morph)
    }

    this._calculateArmor(actorData)
    ////Calculating armor
    //let energyTotal = null;
    //let kineticTotal = null;
    //let mainArmorAmount = null;
    //let additionalArmorAmount = null;
    //for (let armor of items ) {
    //  let key = armor.type;
    //  if(key === 'armor' && armor.active){
    //    energyTotal += parseInt(armor.energy);
    //    kineticTotal += parseInt(armor.kinetic);
    //    if (armor.slotType === "Main Armor") {
    //      mainArmorAmount++
    //    }
    //    if (armor.slotType === "Additional Armor") {
    //      additionalArmorAmount++
    //    }
    //  }
    //}
    //actorData.physical.energyArmorTotal = energyTotal + eval(actorData.mods.energyMod);
    //actorData.physical.kineticArmorTotal = kineticTotal + eval(actorData.mods.kineticMod);
    //actorData.physical.mainArmorTotal = mainArmorAmount
    //actorData.physical.additionalArmorTotal = additionalArmorAmount
    //actorData.physical.mainArmorMalus = 0
    //actorData.physical.additionalArmorMalus = 0
    //actorData.physical.armorMalusTotal = 0
    //if (mainArmorAmount > 1){
    //  actorData.physical.mainArmorMalus = (mainArmorAmount - 1)*20
    //}
    //if (additionalArmorAmount > 1){
    //  actorData.physical.additionalArmorMalus = (additionalArmorAmount - 1)*20
    //}
    //if (actorData.physical.mainArmorMalus || actorData.physical.additionalArmorMalus) {
    //  actorData.physical.armorMalusTotal = actorData.physical.mainArmorMalus+data.physical.additionalArmorMalus
    //}

    this._calculateInitiative(actorData)

    /*Modificators
    data.mods.wounds = (data.physical.wounds * 10)+(eval(data.mods.woundMod) * 10);
    data.mods.trauma = (data.mental.trauma * 10)+(eval(data.mods.traumaMod) * 10);
    console.log("This is data.mods.wounds: " + data.mods.wounds + " calculated from data.physical.wounds * 10: " + data.physical.wounds * 10 + " plust data.mods.woundMod * 10: " + data.mods.woundMod * 10);
    if (data.mods.trauma < 0){
      data.mods.trauma = 0
    }
    if (data.mods.wounds < 0){
      data.mods.wounds = 0
    }*/
    //Psi-Calculator - Not Working yet
    if (this.type === "npc" || this.type === "character") {
      actorData.psiStrain.new = 0;
      actorData.psiStrain.current = Number(actorData.psiStrain.infection) + actorData.psiStrain.new;
    }


    // Aptitudes
    for (let [key, aptitude] of Object.entries(actorData.aptitudes)) {
      aptitude.calc = aptitude.value * 3 + eval(aptitude.mod);
      aptitude.roll = aptitude.calc;
    }

    // Insight Skills
    for (let [key, skill] of Object.entries(actorData.skillsIns)) {
      this._calculateSkillValue(key,skill,actorData,this.type);
    }

    // Moxie skills
    for (let [key, skill] of Object.entries(actorData.skillsMox)) {
      this._calculateSkillValue(key,skill,actorData,this.type);
    }

    // Vigor skills
    for (let [key, skill] of Object.entries(actorData.skillsVig)) {
      this._calculateSkillValue(key,skill,actorData,this.type);
    }

    //Showing skill calculations for know/spec skills
    for (let value of items ) {
      let key = value.type;
      let aptSelect = 0;
      if (value.aptitude === "Intuition") {
        aptSelect = actorData.aptitudes.int.value;
      }
      else if (value.aptitude === "Cognition") {
        aptSelect = actorData.aptitudes.cog.value;
      }
      else if (value.aptitude === "Reflexes") {
        aptSelect = actorData.aptitudes.ref.value;
      }
      else if (value.aptitude === "Somatics") {
        aptSelect = actorData.aptitudes.som.value;
      }
      else if (value.aptitude === "Willpower") {
        aptSelect = actorData.aptitudes.wil.value;
      }
      else if (value.aptitude === "Savvy") {
        aptSelect = actorData.aptitudes.sav.value;
      }
      if(key === 'specialSkill' || key === 'knowSkill'){
        if(actorData.type=="goon")
          value.roll = value.value?Number(value.value):aptSelect;
        else
          value.roll = Number(value.value) + aptSelect - actorData.mods.wounds - actorData.mods.trauma;
      }
    }
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    // const data = actorData.data;
  }

  _calculateInitiative(actorData) {
    actorData.initiative.value = Math.round((actorData.aptitudes.ref.value +
      actorData.aptitudes.int.value) / 5) + eval(actorData.mods.iniMod)
    actorData.initiative.display = "1d6 + " + actorData.initiative.value
  }

  _calculateMentalHealth(actorData) {
    actorData.health.mental.max = (actorData.aptitudes.wil.value * 2) + eval(actorData.mods.lucmod);
    actorData.mental.ir = actorData.health.mental.max * 2;
    actorData.mental.tt = Math.round(actorData.health.mental.max / 5) + eval(actorData.mods.ttMod);
    if(actorData.health.mental.value === null){
      actorData.health.mental.value = actorData.health.mental.max;
    }
  }

  _calculatePools(actorData, morph) {
    actorData.pools.flex.totalFlex = Number(morph.flex) +
      Number(actorData.ego.egoFlex) +
      Number(actorData.pools.flex.mod)
    actorData.pools.insight.totalInsight = Number(morph.insight) +
      Number(actorData.pools.insight.mod)
    actorData.pools.moxie.totalMoxie = Number(morph.moxie) +
      Number(actorData.pools.moxie.mod)
    actorData.pools.vigor.totalVigor = Number(morph.vigor) +
      Number(actorData.pools.vigor.mod)
  }

  _calculateArmor(actorData) {
    let energyTotal = null;
    let kineticTotal = null;
    let mainArmorAmount = null;
    let additionalArmorAmount = null;
    for (let armor of this.items) {
      let key = armor.type;
      if(key === 'armor' && armor.active){
        energyTotal += parseInt(armor.energy);
        kineticTotal += parseInt(armor.kinetic);
        if (armor.slotType === "Main Armor") {
          mainArmorAmount++
        }
        if (armor.slotType === "Additional Armor") {
          additionalArmorAmount++
        }
      }
    }
    actorData.physical.energyArmorTotal = energyTotal +
      Number(actorData.mods.energyMod)
    actorData.physical.kineticArmorTotal = kineticTotal +
      Number(actorData.mods.kineticMod);
    actorData.physical.mainArmorTotal = mainArmorAmount
    actorData.physical.additionalArmorTotal = additionalArmorAmount
    actorData.physical.mainArmorMalus = 0
    actorData.physical.additionalArmorMalus = 0
    actorData.physical.armorMalusTotal = 0

    if (mainArmorAmount > 1){
      actorData.physical.mainArmorMalus = (mainArmorAmount - 1)*20
    }
    if (additionalArmorAmount > 1){
      actorData.physical.additionalArmorMalus = (additionalArmorAmount - 1)*20
    }
    if (actorData.physical.mainArmorMalus || actorData.physical.additionalArmorMalus) {
      actorData.physical.armorMalusTotal = actorData.physical.mainArmorMalus+data.physical.additionalArmorMalus
    }
  }

  _calculateSkillValue(key, skill, data, actorType) {
    let skillData = EclipsePhaseActor.SKILL_DATA.find(element => element.skill == key)
    let skillValue = data.aptitudes[skillData.aptitude].value

    if(actorType === 'character' || actorType === 'npc')
      skill.derived = skill.value + skillValue * skillData.multiplier + Number(skill.mod)
    else
      skill.derived = skill.value

    skill.roll = skill.derived - data.mods.wounds - data.mods.trauma
    skill.specialized = skill.roll + 10
  }
}
