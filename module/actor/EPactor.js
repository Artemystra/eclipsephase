import { eclipsephase } from "../config.js"

/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export default class EPactor extends Actor {

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
    
    //Determin whether any gear is present
    for(let gearCheck of items){
      if(gearCheck.system.displayCategory === "ranged" || gearCheck.system.displayCategory === "ccweapon" || gearCheck.system.displayCategory === "gear" || gearCheck.system.displayCategory === "armor"){
        actorData.additionalSystems.hasGear = true;
        break;
      }
    }

    this._calculateMentalHealth(actorData)

    //Physical Health
    //NPCs & Goons only
    if(this.type === 'npc' || this.type === 'goon') {

      //Calculating WT & DR
      actorData.health.physical.max = (actorData.bodies.morph1.dur) + 
        eval(actorData.mods.durmod) // only one morph for npcs
      actorData.physical.wt = Math.round(actorData.health.physical.max / 5)
      actorData.physical.dr = Math.round(actorData.health.physical.max * 
        eclipsephase.damageRatingMultiplier[actorData.bodyType.value])

      if(actorData.health.physical.value === null) {
        actorData.health.physical.value = actorData.health.physical.max
      }
    }

    if(!actorData.mods.woundMultiplier){
      actorData.mods.woundMultiplier = 1;
    }

    //Characters only
    //Durability
    if(this.type === "character") {
      let morph = actorData.bodies[actorData.bodies.activeMorph]
      actorData.health.physical.max = Number(morph.dur) + eval(actorData.mods.durmod)
      actorData.physical.wt = Math.round(actorData.health.physical.max / 5)
      actorData.physical.dr = Math.round(actorData.health.physical.max * Number(eclipsephase.damageRatingMultiplier[morph.type]))
      if(actorData.health.physical.value === null) {
        actorData.health.physical.value = actorData.health.physical.max
      }

      this._calculatePools(actorData, morph)
    }

    this._calculateArmor(actorData)
    this._calculateInitiative(actorData)
    this._calculateHomebrewEncumberance(actorData)
    this._calculateSideCart(actorData, items)

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
      skill.mod = eval(skill.mod);
      this._calculateSkillValue(key,skill,actorData,this.type);
    }

    // Moxie skills
    for (let [key, skill] of Object.entries(actorData.skillsMox)) {
      skill.mod = eval(skill.mod);
      this._calculateSkillValue(key,skill,actorData,this.type);
    }

    // Vigor skills
    for (let [key, skill] of Object.entries(actorData.skillsVig)) {
      skill.mod = eval(skill.mod);
      this._calculateSkillValue(key,skill,actorData,this.type);
    }

    //Pool Bonuses
    for (let [key, pool] of Object.entries(actorData.pools)) {
      pool.mod = eval(pool.mod);
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
          value.roll = Number(value.value) + aptSelect;
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
      eval(actorData.pools.flex.mod)
    actorData.pools.insight.totalInsight = Number(morph.insight) +
      eval(actorData.pools.insight.mod)
    actorData.pools.moxie.totalMoxie = Number(morph.moxie) +
      eval(actorData.pools.moxie.mod)
    actorData.pools.vigor.totalVigor = Number(morph.vigor) +
      eval(actorData.pools.vigor.mod)
  }

  _calculateHomebrewEncumberance(actorData) {
   //HOMEBREW - Encumbrance through weapons & gear
   if(actorData.homebrew === true && this.type === "character"){
    //Weapon Variables
    let weaponScore = 0;
    let bulkyWeaponCount = 0;
    let weaponMalus = 0;
    let weaponItems = this.items.filter(i => i.type === "rangedWeapon" || i.type === "ccWeapon")
    //Gear Variables
    let gearItems = this.items.filter(i => i.type === "gear")
    let accessoryCount = 0;
    let accessoryMalus = 0;
    let bulkyCount = 0;
    let bulkyMalus = 0;
    //Weapon loop
    for(let weaponCheck of weaponItems){
        if(weaponCheck.system.active === true && weaponCheck.system.slotType === "Sidearm"){
          weaponScore++;
        } 
        else if(weaponCheck.system.active === true && weaponCheck.system.slotType === "One Handed"){
          weaponScore += 2;
        }
        else if(weaponCheck.system.active === true && weaponCheck.system.slotType === "Two Handed"){
          weaponScore += 5;
        }
        else if(weaponCheck.system.active === true && weaponCheck.system.slotType === "Bulky"){
          bulkyWeaponCount++;
        }
    }
    //Gear loop
    for(let gearCheck of gearItems){
      if(gearCheck.system.active === true && gearCheck.system.slotType === "Accessory"){
        accessoryCount++;
      }
      else if(gearCheck.system.active === true && gearCheck.system.slotType === "Bulky"){
        bulkyCount++;
      }
    }
    //Bulky loop
    if(accessoryCount > 4){
      accessoryMalus = Math.ceil((accessoryCount-4)/4)*10;
    }
    if(weaponScore > 6){
      
      weaponMalus = Math.ceil((weaponScore-5)/5)*10;
    }
    
    if(bulkyCount >= 1){
      bulkyMalus = (bulkyCount+bulkyWeaponCount)*20;
    }
    actorData.physical.totalWeaponMalus = weaponMalus;
    actorData.physical.totalGearMalus = bulkyMalus + accessoryMalus;
  }
  //In case "Homebrew" is ticked off, this prevents a NaN failure in the dice roll
  else {
    actorData.physical.totalWeaponMalus = 0;
    actorData.physical.totalGearMalus = 0;
  }
  }

  _calculateSideCart(actorData, items) {
    //Checks for certain item types to be equipped to dynamically change the side cart content
    let rangedCount = 0;
    let ccCount = 0;
    let armorCount = 0;
    let gearCount = 0;
    for(let gearCheck of items){
      if(gearCheck.system.displayCategory === "ranged" && gearCheck.system.active){
        rangedCount++
      }
      else if(gearCheck.system.displayCategory === "ccweapon" && gearCheck.system.active){
        ccCount++
      }
      else if(gearCheck.system.displayCategory === "armor" && gearCheck.system.active){
        armorCount++
      }
      else if(gearCheck.system.displayCategory === "gear" && gearCheck.system.active){
        gearCount++
      }
    }
    if(rangedCount>0){
      actorData.additionalSystems.rangedEquipped = true;
    }
    else{
      actorData.additionalSystems.rangedEquipped = false;
    }
    if(ccCount>0){
      actorData.additionalSystems.ccEquipped = true;
    }
    else{
      actorData.additionalSystems.ccEquipped = false;
    }
    if(armorCount>0){
      actorData.additionalSystems.armorEquipped = true;
    }
    else{
      actorData.additionalSystems.armorEquipped = false;
    }
    if(gearCount>0){
      actorData.additionalSystems.gearEquipped = true;
    }
    else{
      actorData.additionalSystems.gearEquipped = false;
    }
  }

  _calculateArmor(actorModel) {
    let energyTotal = 0
    let kineticTotal = 0
    let mainArmorAmount = 0
    let additionalArmorAmount = 0

    let armorItems = this.items.filter(i => i.type === "armor")

    for (let armor of armorItems) {
      let key = armor.type
      if(armor.system.active){
        energyTotal += Number(armor.system.energy)
        kineticTotal += Number(armor.system.kinetic)
        if (armor.system.slotType === "Main Armor") {
          mainArmorAmount++
        }
        if (armor.system.slotType === "Additional Armor") {
          additionalArmorAmount++
        }
      }
    }

    actorModel.physical.energyArmorTotal = energyTotal + eval(actorModel.mods.energyMod)
    actorModel.physical.kineticArmorTotal = kineticTotal + eval(actorModel.mods.kineticMod);
    actorModel.physical.mainArmorTotal = mainArmorAmount
    actorModel.physical.additionalArmorTotal = additionalArmorAmount
    actorModel.physical.mainArmorMalus = 0
    actorModel.physical.additionalArmorMalus = 0
    actorModel.physical.armorMalusTotal = 0

    if (mainArmorAmount > 1) {
      actorModel.physical.mainArmorMalus = (mainArmorAmount - 1)*20
    }
    if (additionalArmorAmount > 1) {
      actorModel.physical.additionalArmorMalus = (additionalArmorAmount - 1) * 20
    }
    if (actorModel.physical.mainArmorMalus || actorModel.physical.additionalArmorMalus) {
      actorModel.physical.armorMalusTotal = actorModel.physical.mainArmorMalus+actorModel.physical.additionalArmorMalus
    }
  }

  _calculateSkillValue(key, skill, data, actorType) {
    let skillData = EPactor.SKILL_DATA.find(element => element.skill == key)
    let skillValue = data.aptitudes[skillData.aptitude].value

    if(actorType === 'character' || actorType === 'npc')
      skill.derived = skill.value + skillValue * skillData.multiplier + Number(skill.mod)
    else
      skill.derived = skill.value

    skill.roll = Number(skill.derived)
    skill.specialized = skill.roll + 10
  }
}
