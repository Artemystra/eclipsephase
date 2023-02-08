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
    const actorWhole = this;
    const flags = actorModel.flags;
    const items = this.items;
    let gammaCount = 0;
    let chiCount = 0;
    const brewStatus = game.settings.get("eclipsephase", "superBrew");
    actorModel.currentStatus = [];

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
    for(let psiTypeCheck of items){
      if (psiTypeCheck.type === "aspect"){
        if(psiTypeCheck.system.psiType === "chi"){
          chiCount++
        }
        else if(psiTypeCheck.system.psiType === "gamma"){
          gammaCount++
        }
      }
    }

    this._calculateMentalHealth(actorModel)

    //Physical Health
    //NPCs & Goons only
    if(this.type === 'npc' || this.type === 'goon') {

      //Calculating WT & DR
      actorModel.health.physical.max = (actorModel.bodies.morph1.dur) + eval(actorModel.mods.durmod); // only one morph for npcs
      actorModel.physical.wt = Math.round(actorModel.health.physical.max / 5);
      actorModel.physical.dr = Math.round(actorModel.health.physical.max * eclipsephase.damageRatingMultiplier[actorModel.bodyType.value]);

      if(actorModel.health.physical.value === null) {
        actorModel.health.physical.value = 0;
      }
    }

    //Characters only
    //Durability
    if(this.type === "character") {
      let morph = actorModel.bodies[actorModel.bodies.activeMorph];
      actorModel.health.physical.max = Number(morph.dur) + eval(actorModel.mods.durmod);
      actorModel.physical.wt = Math.round(actorModel.health.physical.max / 5);
      actorModel.physical.dr = Math.round(actorModel.health.physical.max * Number(eclipsephase.damageRatingMultiplier[morph.type]));
      actorModel.health.death.max = actorModel.physical.dr - actorModel.health.physical.max;
      actorModel.health.death.value = actorModel.health.physical.value - actorModel.physical.dr

      if (actorModel.health.physical.value < actorModel.health.physical.max){
        actorModel.health.death.value = 0
      }
      else {
        actorModel.health.death.value = actorModel.health.physical.value - actorModel.health.physical.max
      }


      if(actorModel.health.physical.value === null) {
        actorModel.health.physical.value = 0
      }
      else if (actorModel.health.physical.value > actorModel.physical.dr){
        actorModel.health.physical.value = actorModel.physical.dr
      }

      this._calculatePools(actorModel, morph)
    }

    this._calculateArmor(actorModel, actorWhole, brewStatus);
    this._calculateInitiative(actorModel);
    if (this.type === "character"){
      this._calculateHomebrewEncumberance(actorModel);
      this._calculateSideCart(actorModel, items);
      this._poolUpdate(actorModel);
      this._modificationListCreator(actorModel, actorWhole);
    }
    if (this.type === "npc" || this.type === "character"){
      this._minimumInfection(actorModel, gammaCount, chiCount);
    }


    // Aptitudes
    for (let [key, aptitude] of Object.entries(actorModel.aptitudes)) {
      aptitude.calc = aptitude.value * 3 + eval(aptitude.mod);
      aptitude.roll = aptitude.calc;
    }

    // Insight Skills
    for (let [key, skill] of Object.entries(actorModel.skillsIns)) {
      skill.mod = eval(skill.mod);
      this._calculateSkillValue(key,skill,actorModel,actorWhole.type);
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
      if (value.aptitude === "int") {
        aptSelect = actorModel.aptitudes.int.value;
      }
      else if (value.aptitude === "cog") {
        aptSelect = actorModel.aptitudes.cog.value;
      }
      else if (value.aptitude === "ref") {
        aptSelect = actorModel.aptitudes.ref.value;
      }
      else if (value.aptitude === "som") {
        aptSelect = actorModel.aptitudes.som.value;
      }
      else if (value.aptitude === "wil") {
        aptSelect = actorModel.aptitudes.wil.value;
      }
      else if (value.aptitude === "sav") {
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
    actorModel.health.insanity.max = actorModel.mental.ir - actorModel.health.mental.max;
    actorModel.health.insanity.value = actorModel.health.mental.value - actorModel.mental.ir;

      if (actorModel.health.mental.value < actorModel.health.mental.max){
        actorModel.health.insanity.value = 0
      }
      else {
        actorModel.health.insanity.value = actorModel.health.mental.value - actorModel.health.mental.max
      }


      if(actorModel.health.mental.value === null) {
        actorModel.health.mental.value = 0
      }
      else if (actorModel.health.mental.value > actorModel.mental.ir){
        actorModel.health.mental.value = actorModel.mental.ir
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
    let weaponItems = this.items.filter(i => i.type === "rangedWeapon" || i.type === "ccWeapon");
    //Gear Variables
    let gearItems = this.items.filter(i => i.type === "gear");
    let accessoryCount = 0;
    let accessoryMalus = 0;
    let bulkyCount = 0;
    let bulkyMalus = 0;
    //Consumable Encumberance
    let consumableItems = this.items.filter(i => i.system.slotType === "consumable");
    let consumableCount = 0;
    let consumableMalus = 0;
    //Weapon loop
    for(let weaponCheck of weaponItems){
        if(weaponCheck.system.active && weaponCheck.system.slotType === "sidearm"){
          weaponScore++;
        } 
        else if(weaponCheck.system.active && weaponCheck.system.slotType === "oneHanded"){
          weaponScore += 2;
        }
        else if(weaponCheck.system.active && weaponCheck.system.slotType === "twoHanded"){
          weaponScore += 5;
        }
        else if(weaponCheck.system.active && weaponCheck.system.slotType === "bulky"){
          bulkyWeaponCount++;
        }
    }
    //Gear loop
    for(let gearCheck of gearItems){
      if(gearCheck.system.active && gearCheck.system.slotType === "accessory"){
        for(let i=0; i<gearCheck.system.quantity; i++){
          accessoryCount++;
        }
      }
      else if(gearCheck.system.active && gearCheck.system.slotType === "bulky"){
        for(let i=0; i<gearCheck.system.quantity; i++){
          bulkyCount++;
        }
      }
    }
    //Consumable loop
    for(let consumCheck of consumableItems){
      if (consumCheck.system.active){
        for(let i=0; i<consumCheck.system.quantity; i++){
          consumableCount++;
        }
      }
    }
    //Modification Calculator
    if(accessoryCount > 4){
      accessoryMalus = Math.ceil((accessoryCount-4)/4)*10;
    }
    if(weaponScore > 6){
      
      weaponMalus = Math.ceil((weaponScore-5)/5)*10;
    }
    if(bulkyCount >= 1){
      bulkyMalus = (bulkyCount+bulkyWeaponCount)*20;
    }
    if(consumableCount > 3){
      consumableMalus = Math.ceil((consumableCount-3)/3)*10;
    }

    actorModel.physical.totalWeaponMalus = weaponMalus;
    actorModel.physical.totalGearMalus = bulkyMalus + accessoryMalus + consumableMalus;
    actorModel.currentStatus.bulkyModifier = bulkyMalus;
    actorModel.currentStatus.gearModifier = accessoryMalus;
    actorModel.currentStatus.consumableModifier = consumableMalus;
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
    let consumableCount = 0;

    actorModel.additionalSystems.rangedEquipped = false;
    actorModel.additionalSystems.ccEquipped = false;
    actorModel.additionalSystems.armorEquipped = false;
    actorModel.additionalSystems.gearEquipped = false;
    actorModel.additionalSystems.consumableEquipped = false;

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
      else if(gearCheck.system.displayCategory === "gear" && gearCheck.system.active && gearCheck.system.slotType != "consumable"){
        gearCount++
      }
      else if(gearCheck.system.slotType === "consumable" && gearCheck.system.active){
        consumableCount++
      }
    }
    if(rangedCount>0){
      actorModel.additionalSystems.rangedEquipped = true;
    }
    if(ccCount>0){
      actorModel.additionalSystems.ccEquipped = true;
    }
    if(armorCount>0){
      actorModel.additionalSystems.armorEquipped = true;
    }
    if(gearCount>0){
      actorModel.additionalSystems.gearEquipped = true;
    }
    if(consumableCount>0){
      actorModel.additionalSystems.consumableEquipped = true;
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

  _modificationListCreator(actorModel, actorWhole){
    let wounds = (actorModel.physical.wounds + actorModel.mods.woundMod) * 10 * actorModel.mods.woundMultiplier;
    let ignoreWounds = actorModel.mods.woundMod
    let trauma = (actorModel.mental.trauma + actorModel.mods.traumaMod) * 10;
    let ignoreTrauma = actorModel.mods.traumaMod
    let armorEncumberance = actorModel.physical.mainArmorMalus;
    let numberOfLayers = armorEncumberance/20+1;
    let armorSomCumberance = actorModel.physical.armorSomMalus;
    let bulky = actorModel.currentStatus.bulkyModifier;
    let weapon = actorModel.physical.totalWeaponMalus;
    let gear = actorModel.currentStatus.gearModifier;
    let consumable = actorModel.currentStatus.consumableModifier;

    actorModel.currentStatus.generalModifier = false;
    actorModel.currentStatus.generalModifierSum = 0;
    actorModel.currentStatus.woundModifierSum = 0;
    actorModel.currentStatus.ignoreWound = ignoreWounds*(-1);
    actorModel.currentStatus.ignoreTrauma = ignoreTrauma*(-1);
    actorModel.currentStatus.traumaModifierSum = 0;
    actorModel.currentStatus.armorModifier = false;
    actorModel.currentStatus.armorModifierSum = 0;
    actorModel.currentStatus.armorLayerSum = 0;
    actorModel.currentStatus.encumberanceModifier = false;
    actorModel.currentStatus.encumberanceModifierSum = 0;
    actorModel.currentStatus.statusPresent = false

    if(wounds > 0 || trauma){
      actorModel.currentStatus.generalModifier = true;
      actorModel.currentStatus.generalModifierSum = wounds + trauma;
      actorModel.currentStatus.woundModifierSum = wounds;
      actorModel.currentStatus.traumaModifierSum = trauma;
    }
    else if(wounds >= 0 && actorModel.currentStatus.ignoreWound > 0){
      actorModel.currentStatus.generalModifier = true;
      actorModel.currentStatus.generalModifierSum = wounds + trauma;
      actorModel.currentStatus.woundModifierSum = wounds;
      actorModel.currentStatus.traumaModifierSum = trauma;
    }
    else if(trauma >= 0 && actorModel.currentStatus.ignoreTrauma > 0){
      actorModel.currentStatus.generalModifier = true;
      actorModel.currentStatus.generalModifierSum = wounds + trauma;
      actorModel.currentStatus.woundModifierSum = wounds;
      actorModel.currentStatus.traumaModifierSum = trauma;
    }

    if(armorEncumberance || armorSomCumberance){
      actorModel.currentStatus.armorModifier = true;
      actorModel.currentStatus.armorLayerSum = numberOfLayers
      actorModel.currentStatus.armorModifierSum = armorEncumberance + armorSomCumberance;
    }

    if(bulky || weapon || gear || consumable && actorModel.homebrew){
      actorModel.currentStatus.encumberanceModifier = true;
      actorModel.currentStatus.bulkySum = bulky/20;
      actorModel.currentStatus.encumberanceModifierSum = bulky + weapon + gear + consumable;
    }

    if(actorModel.currentStatus.generalModifier || actorModel.currentStatus.generalModifier || actorModel.currentStatus.armorModifier || actorModel.currentStatus.encumberanceModifier){
      actorModel.currentStatus.statusPresent = true
    }

    if (wounds>0){
      actorModel.currentStatus.currentModifiersSum = wounds + trauma + armorEncumberance + armorSomCumberance + actorModel.currentStatus.encumberanceModifierSum;
    }
    else {
      actorModel.currentStatus.currentModifiersSum = trauma + armorEncumberance + armorSomCumberance + actorModel.currentStatus.encumberanceModifierSum;
    }
  }

  _calculateArmor(actorModel, actorWhole, brewStatus) {
    let energyTotal = 0;
    let kineticTotal = 0;
    let mainArmorAmount = 0;
    let additionalArmorAmount = 0;
    let armorSomCheck = null;
    let actorSom = actorModel.aptitudes.som.value;

    let armorItems = this.items.filter(i => i.type === "armor")

    for (let armor of armorItems) {
      let key = armor.type
      if(armor.system.active){
        energyTotal += Number(armor.system.energy)
        kineticTotal += Number(armor.system.kinetic)
        if (armor.system.slotType === "Main Armor") {
          mainArmorAmount++
        }
      }
    }

    actorModel.physical.energyArmorTotal = energyTotal + eval(actorModel.mods.energyMod);
    actorModel.physical.kineticArmorTotal = kineticTotal + eval(actorModel.mods.kineticMod);
    actorModel.physical.mainArmorTotal = mainArmorAmount;
    actorModel.physical.additionalArmorTotal = additionalArmorAmount;
    actorModel.physical.mainArmorMalus = 0;
    actorModel.physical.additionalArmorMalus = 0;
    actorModel.physical.armorMalusTotal = 0;
    actorModel.physical.armorSomMalus = 0;
    actorModel.physical.armorDurAnnounce = "";

    if (mainArmorAmount > 1) {
      actorModel.physical.mainArmorMalus = (mainArmorAmount - 1)*20;
    }

    if (actorModel.physical.energyArmorTotal > actorModel.physical.kineticArmorTotal){
      armorSomCheck = actorModel.physical.energyArmorTotal;
    }
    else {
      armorSomCheck = actorModel.physical.kineticArmorTotal;
    }

    //Homebrew for SOM armor malus
    if (actorWhole.type === "character" && armorSomCheck > actorSom && brewStatus){
      actorModel.physical.armorSomMalus = 20;
    }
    else if (actorWhole.type === "character" && armorSomCheck > actorSom && mainArmorAmount > 1){
      actorModel.physical.armorSomMalus = 20;
    }

    actorModel.physical.armorMalusTotal = actorModel.physical.mainArmorMalus+actorModel.physical.armorSomMalus;

    if (actorModel.health.physical.max < armorSomCheck){
      actorModel.physical.armorDurAnnounce = 1;
    }

    if (armorSomCheck > 11){
      actorModel.physical.armorVisibilityAnnounce = 1;
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

  _minimumInfection(actorModel, gammaCount, chiCount) {

    let minimumInfection = 0;
    let currentInfection = actorModel.psiStrain.infection;

    if (gammaCount > 0){
      minimumInfection = 20
    }
    else if (chiCount > 0){
      minimumInfection = 10
    }
    
    if (currentInfection < minimumInfection){
      actorModel.psiStrain.infection = minimumInfection;
    }

    actorModel.psiStrain.minimumInfection = minimumInfection
  }
}
