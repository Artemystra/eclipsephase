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

    const actorModel = this.system;
    const flags = actorModel.flags;
    const items = this.items;
    const psiMod = 0;
    const brewStatus = game.settings.get("eclipsephase", "superBrew");

    // Homebrew Switch
    if (brewStatus) {
      actorModel.homebrew = true;
    }
    else {
      actorModel.homebrew = false;
    }

    if (game.user.isGM){

    }
    
    //Determin whether any gear is present
    for(let gearCheck of items){
      if(gearCheck.system.displayCategory === "ranged" || gearCheck.system.displayCategory === "ccweapon" || gearCheck.system.displayCategory === "gear" || gearCheck.system.displayCategory === "armor"){
        actorModel.additionalSystems.hasGear = true;
        break;
      }
    }

    this._calculateMentalHealth(actorModel)

    //Physical Health
    //NPCs & Goons only
    if(this.type === 'npc' || this.type === 'goon') {

      //Calculating WT & DR
      actorModel.health.physical.max = (actorModel.bodies.morph1.dur) + 
        eval(actorModel.mods.durmod) // only one morph for npcs
      actorModel.physical.wt = Math.round(actorModel.health.physical.max / 5)
      actorModel.physical.dr = Math.round(actorModel.health.physical.max * 
        eclipsephase.damageRatingMultiplier[actorModel.bodyType.value])

      if(actorModel.health.physical.value === null) {
        actorModel.health.physical.value = actorModel.health.physical.max
      }
    }

    if(!actorModel.mods.woundMultiplier){
      actorModel.mods.woundMultiplier = 1;
    }

    //Characters only
    //Durability
    if(this.type === "character") {
      let morph = actorModel.bodies[actorModel.bodies.activeMorph]
      actorModel.health.physical.max = Number(morph.dur) + eval(actorModel.mods.durmod)
      actorModel.physical.wt = Math.round(actorModel.health.physical.max / 5)
      actorModel.physical.dr = Math.round(actorModel.health.physical.max * Number(eclipsephase.damageRatingMultiplier[morph.type]))
      if(actorModel.health.physical.value === null) {
        actorModel.health.physical.value = actorModel.health.physical.max
      }

      this._calculatePools(actorModel, morph)
    }

    this._calculateArmor(actorModel)
    this._calculateInitiative(actorModel)
    this._calculateHomebrewEncumberance(actorModel)
    this._calculateSideCart(actorModel, items)
    if (this.type === "character"){
      this._poolUpdate(actorModel)
    }

    //Psi-Calculator - Not Working yet
    if (this.type === "npc" || this.type === "character") {
      actorModel.psiStrain.new = 0;
      actorModel.psiStrain.current = Number(actorModel.psiStrain.infection) + actorModel.psiStrain.new;
    }


    // Aptitudes
    for (let [key, aptitude] of Object.entries(actorModel.aptitudes)) {
      aptitude.calc = aptitude.value * 3 + eval(aptitude.mod);
      aptitude.roll = aptitude.calc;
    }

    // Insight Skills
    for (let [key, skill] of Object.entries(actorModel.skillsIns)) {
      skill.mod = eval(skill.mod);
      this._calculateSkillValue(key,skill,actorModel,this.type);
    }

    // Moxie skills
    for (let [key, skill] of Object.entries(actorModel.skillsMox)) {
      skill.mod = eval(skill.mod);
      this._calculateSkillValue(key,skill,actorModel,this.type);
    }

    // Vigor skills
    for (let [key, skill] of Object.entries(actorModel.skillsVig)) {
      skill.mod = eval(skill.mod);
      this._calculateSkillValue(key,skill,actorModel,this.type);
    }

    //Pool Bonuses
    for (let [key, pool] of Object.entries(actorModel.pools)) {
      pool.mod = eval(pool.mod);
    }

    //Showing skill calculations for know/spec skills
    for (let value of items ) {
      let key = value.type;
      let aptSelect = 0;
      if (value.aptitude === "Intuition") {
        aptSelect = actorModel.aptitudes.int.value;
      }
      else if (value.aptitude === "Cognition") {
        aptSelect = actorModel.aptitudes.cog.value;
      }
      else if (value.aptitude === "Reflexes") {
        aptSelect = actorModel.aptitudes.ref.value;
      }
      else if (value.aptitude === "Somatics") {
        aptSelect = actorModel.aptitudes.som.value;
      }
      else if (value.aptitude === "Willpower") {
        aptSelect = actorModel.aptitudes.wil.value;
      }
      else if (value.aptitude === "Savvy") {
        aptSelect = actorModel.aptitudes.sav.value;
      }
      if(key === 'specialSkill' || key === 'knowSkill'){
        if(actorModel.type=="goon")
          value.roll = value.value?Number(value.value):aptSelect;
        else
          value.roll = Number(value.value) + aptSelect;
      }
    }
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorModel) {
    // const data = actorModel.data;
  }

  _calculateInitiative(actorModel) {
    actorModel.initiative.value = Math.round((actorModel.aptitudes.ref.value +
      actorModel.aptitudes.int.value) / 5) + eval(actorModel.mods.iniMod)
    actorModel.initiative.display = "1d6 + " + actorModel.initiative.value
  }

  _calculateMentalHealth(actorModel) {
    actorModel.health.mental.max = (actorModel.aptitudes.wil.value * 2) + eval(actorModel.mods.lucmod);
    actorModel.mental.ir = actorModel.health.mental.max * 2;
    actorModel.mental.tt = Math.round(actorModel.health.mental.max / 5) + eval(actorModel.mods.ttMod);
    if(actorModel.health.mental.value === null){
      actorModel.health.mental.value = actorModel.health.mental.max;
    }
  }

  _calculatePools(actorModel, morph) {
    actorModel.pools.flex.totalFlex = Number(morph.flex) +
      Number(actorModel.ego.egoFlex) +
      eval(actorModel.pools.flex.mod)
    actorModel.pools.insight.totalInsight = Number(morph.insight) +
      eval(actorModel.pools.insight.mod)
    actorModel.pools.moxie.totalMoxie = Number(morph.moxie) +
      eval(actorModel.pools.moxie.mod)
    actorModel.pools.vigor.totalVigor = Number(morph.vigor) +
      eval(actorModel.pools.vigor.mod)
  }

  _calculateHomebrewEncumberance(actorModel) {
   //HOMEBREW - Encumbrance through weapons & gear
   if(actorModel.homebrew === true && this.type === "character"){
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
    actorModel.physical.totalWeaponMalus = weaponMalus;
    actorModel.physical.totalGearMalus = bulkyMalus + accessoryMalus;
  }
  //In case "Homebrew" is ticked off, this prevents a NaN failure in the dice roll
  else {
    actorModel.physical.totalWeaponMalus = 0;
    actorModel.physical.totalGearMalus = 0;
  }
  }

  _calculateSideCart(actorModel, items) {
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
      actorModel.additionalSystems.rangedEquipped = true;
    }
    else{
      actorModel.additionalSystems.rangedEquipped = false;
    }
    if(ccCount>0){
      actorModel.additionalSystems.ccEquipped = true;
    }
    else{
      actorModel.additionalSystems.ccEquipped = false;
    }
    if(armorCount>0){
      actorModel.additionalSystems.armorEquipped = true;
    }
    else{
      actorModel.additionalSystems.armorEquipped = false;
    }
    if(gearCount>0){
      actorModel.additionalSystems.gearEquipped = true;
    }
    else{
      actorModel.additionalSystems.gearEquipped = false;
    }
  }

  _poolUpdate(actorModel) {
    actorModel.pools.update.possible = true;
    let insightUpdate = actorModel.pools.update.insight;
    let vigorUpdate = actorModel.pools.update.vigor;
    let moxieUpdate = actorModel.pools.update.moxie;
    let flexUpdate = actorModel.pools.update.flex;
    const curInsight = actorModel.pools.insight.value;
    const curVigor = actorModel.pools.vigor.value;
    const curMoxie = actorModel.pools.moxie.value;
    const curFlex = actorModel.pools.flex.value;
    const maxInsight = actorModel.pools.insight.totalInsight;
    const maxVigor = actorModel.pools.vigor.totalVigor;
    const maxMoxie = actorModel.pools.moxie.totalMoxie;
    const maxFlex = actorModel.pools.flex.totalFlex;
    console.log("This is my restValue: ", actorModel.rest.restValue)
    const restValue = actorModel.rest.restValue;
    const updateTotal = insightUpdate + vigorUpdate + moxieUpdate + flexUpdate;
    restValue ? actorModel.rest.restValueUpdate = restValue - updateTotal : 0;
    const restValueUpdate = actorModel.rest.restValueUpdate;

    if (insightUpdate + curInsight > maxInsight){
      insightUpdate = maxInsight - curInsight;
      return this.update({"system.pools.update.insight" : insightUpdate});
    }
    if (vigorUpdate + curVigor > maxVigor){
      vigorUpdate = maxVigor - curVigor;
      return this.update({"system.pools.update.vigor" : vigorUpdate});
    }
    if (moxieUpdate + curMoxie > maxMoxie){
      moxieUpdate = maxMoxie - curMoxie;
      return this.update({"system.pools.update.moxie" : moxieUpdate});
    }
    if (flexUpdate + curFlex > maxFlex){
      flexUpdate = maxFlex - curFlex;
      return this.update({"system.pools.update.flex" : flexUpdate});
    }

    if (restValueUpdate === 0){
      actorModel.pools.update.possible = 0;
    }
    if (restValueUpdate < 0){
      actorModel.pools.update.possible = 2;
    }
    if (restValueUpdate > 0){
      actorModel.pools.update.possible = 1;
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
