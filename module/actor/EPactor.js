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

  static STANDARD_MORPH = { dur: 30, type: "bio", description: "", img: "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg", insight: null, moxie: null, vigor: null, flex: null}
  /**
   * Augment the basic actor data with additional dynamic data.
   */
  async prepareData() {
    super.prepareData();
    if (this.getFlag("eclipsephase", "migrating")) return super.prepareData();
    const actorWhole = this;
    const actorModel = actorWhole.system;
    const actorPools = actorModel.pools
    const activeMorph = actorModel.activeMorph;
    let morphData = null;
    if(activeMorph){
      morphData = actorWhole.items.get(actorModel.activeMorph);
    }
    const morphValues = morphData?.system ?? EPactor.STANDARD_MORPH;

    // Jamming: resolve jammed vehicle and flag it for pools & dice
    const activeJam = actorModel.activeJam;
    let jammedVehicleData = null;
    if (activeJam) {
      jammedVehicleData = actorWhole.items.get(activeJam);
      if (jammedVehicleData) {
        actorModel.additionalSystems.isJamming = true;
      }
    }

    const flags = actorModel.flags;
    const items = this.items;
    let gammaCount = 0;
    let chiCount = 0;    
    let chiMultiplier = 1;
    if(actorWhole.type === "character" || actorWhole.type === "npc"){
      actorModel.psiStrain ??= { infection: 0, minimumInfection: 0 };
      if (actorModel.psiStrain.infection >= 33){
        chiMultiplier = 2;
      }
    }
    actorModel.mods.psiMultiplier = chiMultiplier
    actorModel.currentStatus = [];    

    // Homebrew Switch
    actorModel.homebrew = game.settings.get("eclipsephase", "superBrew");

    // Trust Mode
    actorModel.editAll = game.settings.get("eclipsephase", "editAll");

    if (game.user.isGM){

    }
    
    //Determin whether any gear is present
    for(let gearCheck of items){
      if(gearCheck.system.displayCategory === "ranged" || gearCheck.system.displayCategory === "ccweapon" || gearCheck.system.displayCategory === "gear" || gearCheck.system.displayCategory === "armor" || gearCheck.system.slotType === "consumable" || gearCheck.system.slotType === "digital"){
        actorModel.additionalSystems.hasGear = true;
        break;
      }
    }

    //Determin whether any ammunition is present
    let ammoCount = 0;
    for (let item of items){
      if (item.type === "ammo")
      ammoCount++
    }
    if (ammoCount > 0){
      actorModel.additionalSystems.hasAmmo = true;
    }

    //Prepares information what type of psi a character uses
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

    //actorModel.additionalSystems.movementBase = morphData.movement1 ? morphData.movement1.base : 0;
    // When jamming, Durability/Armor come from the drone instead of the morph (drones/vehicles/robots count as synth, animals as bio)
    const jammedHealthValues = jammedVehicleData
      ? { dur: jammedVehicleData.system.dur, type: jammedVehicleData.system.type === "animal" ? "bio" : "synth" }
      : null;
    this._calculatePhysicalHealth(actorModel, jammedHealthValues || morphValues, chiMultiplier);
    this._calculateArmor(actorModel, actorWhole, jammedVehicleData);
    this._calculateInitiative(actorModel, chiMultiplier);
    this._calculateRez(actorModel)

    if (this.type === "character"){  
      this._calculateHomebrewEncumberance(actorModel);
      this._calculateSideCart(actorModel, items, jammedVehicleData);
      this._poolUpdate(actorModel);
      this._modificationListCreator(actorModel, actorWhole, chiMultiplier);
    }
    if (this.type === "npc" || this.type === "character"){
      // When jamming, body-bound pools (including the body's own Flex, if any) come from the drone
      // instead of the morph. Ego Flex is unaffected either way, since it's added separately below.
      const poolSource = jammedVehicleData
        ? {
            vigor:   Number(jammedVehicleData.system.pools?.vig?.max)  || 0,
            insight: Number(jammedVehicleData.system.pools?.ins?.max)  || 0,
            moxie:   Number(jammedVehicleData.system.pools?.mox?.max)  || 0,
            flex:    Number(jammedVehicleData.system.pools?.flex?.max) || 0
          }
        : morphValues;
      this._calculatePools(actorModel, poolSource, chiMultiplier)
      if (jammedVehicleData) {
        // Pass the real body's stashed pools through as derived data so the roll dialog can offer them.
        // Ego Flex is shared between both perspectives, so work out how much of it is still unspent from
        // the drone's live combined value - same Body-Flex-first back-derivation as jammVehicle/unjamVehicle.
        const backup = actorWhole.getFlag("eclipsephase", "jamHealthBackup");
        const egoFlex = Number(actorModel.ego.egoFlex) || 0;
        const droneTotalFlex = Number(actorModel.pools.flex.totalFlex) || 0;
        const droneBodyFlexMax = droneTotalFlex - egoFlex;
        const droneFlexSpent = droneTotalFlex - (Number(actorModel.pools.flex.value) || 0);
        const egoFlexSpent = Math.max(0, droneFlexSpent - droneBodyFlexMax);
        const egoFlexRemaining = Math.max(0, egoFlex - egoFlexSpent);
        const bodyFlexRemaining = backup?.bodyFlexValue ?? 0;
        actorModel.additionalSystems.jamming ??= {};
        actorModel.additionalSystems.jamming.ownBodyPools = {
          vigor: backup?.vigor ?? 0,
          insight: backup?.insight ?? 0,
          moxie: backup?.moxie ?? 0,
          bodyFlexRemaining: bodyFlexRemaining,
          flex: bodyFlexRemaining + egoFlexRemaining
        };
      }
      this._calculateMentalHealth(actorModel, chiMultiplier)
      this._minimumInfection(actorModel, gammaCount, chiCount);
    }

    // Aptitudes
    for (let [key, aptitude] of Object.entries(actorModel.aptitudes)) {
      aptitude.calc = aptitude.value * 3 + eval(aptitude.mod) + (aptitude.chiMod ? (eval(aptitude.chiMod)*chiMultiplier) : 0);
      aptitude.roll = aptitude.calc;
      aptitude.longLabel = "ep2e.actorSheet.aptitudes." + key;
    }

    // Insight Skills
    for (let [key, skill] of Object.entries(actorModel.skillsIns)) {
      skill.mod = eval(skill.mod) + (skill.chiMod ? (eval(skill.chiMod)*chiMultiplier) : 0);
      this._calculateSkillValue(key,skill,actorModel,actorWhole.type);
    }

    // Moxie skills
    for (let [key, skill] of Object.entries(actorModel.skillsMox)) {
      skill.mod = eval(skill.mod) + (skill.chiMod ? (eval(skill.chiMod)*chiMultiplier) : 0);
      this._calculateSkillValue(key,skill,actorModel,this.type);
    }

    // Vigor skills
    for (let [key, skill] of Object.entries(actorModel.skillsVig)) {
      skill.mod = eval(skill.mod) + (skill.chiMod ? (eval(skill.chiMod)*chiMultiplier) : 0);
      this._calculateSkillValue(key,skill,actorModel,this.type);
    }

    //Pool Bonuses
    for (let [key, pool] of Object.entries(actorModel.pools)) {
      pool.mod = eval(pool.mod) + (pool.chiMod ? (eval(pool.chiMod)*chiMultiplier) : 0);
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
      else if (value.aptitude === "soft") {
        aptSelect = 0;
      }
      if(key === 'specialSkill' || key === 'knowSkill'){
        if(actorModel.type=="goon")
          value.roll = value.value?Number(value.value):aptSelect;
        else
          value.roll = (Number(value.value) + aptSelect)<100 ? Number(value.value) + aptSelect : 100;
      }
    }

    if (actorWhole.getFlag("eclipsephase", "resleeving") === true && actorWhole.isOwner){
        // Flex is deliberately left out here: jamming/unjamming set it themselves (Body-Flex-first
        // carry-over math in morp-functions.js), and a blanket refill to full would undo that.
        await actorWhole.update({
          "system.pools.insight.value": actorPools.insight.totalInsight,
          "system.pools.vigor.value": actorPools.vigor.totalVigor,
          "system.pools.moxie.value": actorPools.moxie.totalMoxie,
          "flags.eclipsephase.resleeving": false })
    }
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorModel) {
    // const data = actorModel.data;
  }

  _calculateRez(actorModel){
    const rezCurrent = actorModel.rezPoints.value;
    const rezSpent = actorModel.rezPoints.spent;

    actorModel.rezPoints.total = rezCurrent + rezSpent;
  }

  _calculateInitiative(actorModel, chiMultiplier) {
    actorModel.initiative.value = Math.round((actorModel.aptitudes.ref.value + actorModel.aptitudes.int.value) / 5) + eval(actorModel.mods.iniMod) + (actorModel.mods.iniChiMod ? (eval(actorModel.mods.iniChiMod)*chiMultiplier) : 0) + eval(actorModel.mods.manualIniMod ? actorModel.mods.manualIniMod : 0)
    actorModel.initiative.display = "1d6 + " + (actorModel.initiative.value - eval(actorModel.mods.manualIniMod ? actorModel.mods.manualIniMod : 0))
  }

  _calculatePhysicalHealth(actorModel, morphValues, chiMultiplier){
    actorModel.health.physical.max = Number(morphValues.dur) + eval(actorModel.mods.durmod) + (actorModel.mods.durChiMod ? (eval(actorModel.mods.durChiMod)*chiMultiplier) : 0) ? Number(morphValues.dur) + eval(actorModel.mods.durmod) + (actorModel.mods.durChiMod ? (eval(actorModel.mods.durChiMod)*chiMultiplier) : 0) : 0;
    actorModel.physical.wt = Math.round(actorModel.health.physical.max / 5);
    actorModel.physical.dr = Math.round(actorModel.health.physical.max * Number(eclipsephase.damageRatingMultiplier[morphValues.type]));
    actorModel.health.death.max = actorModel.physical.dr - actorModel.health.physical.max ? actorModel.physical.dr - actorModel.health.physical.max : 0;
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
       
      
    
    //Health bar calculation
    let durabilityContainerWidth = 0
    let deathContainerWidth =  0

    const currentPhysicalDamage = actorModel.health.physical.value;
    const maxPhysicalDamage = actorModel.health.physical.max;
    actorModel.physical.relativePhysicalDamage = Math.round(currentPhysicalDamage*100/maxPhysicalDamage) > 100 ? 100 : Math.round(currentPhysicalDamage*100/maxPhysicalDamage);

    const currentDeathDamage = actorModel.health.death.value;
    const maxDeathDamage = actorModel.health.death.max;
    actorModel.physical.relativeDeathDamage = Math.round(currentDeathDamage*100/maxDeathDamage) > 100 ? 100 : Math.round(currentDeathDamage*100/maxDeathDamage);
    
    if(Number(eclipsephase.damageRatingMultiplier[morphValues.type]) === 1.5){
      durabilityContainerWidth = 66.5;
      deathContainerWidth =  33.5;
    }
    else{
      durabilityContainerWidth = 50;
      deathContainerWidth =  50;
    }
    actorModel.physical.activeMorphType = morphValues.type
    actorModel.physical.relativeDurabilityContainer = durabilityContainerWidth
    actorModel.physical.relativeDeathContainer = deathContainerWidth
  }

  _calculateMentalHealth(actorModel, chiMultiplier) {
    actorModel.health.mental.max = (actorModel.aptitudes.wil.value * 2) + eval(actorModel.mods.lucmod) + (actorModel.mods.lucChiMod ? (eval(actorModel.mods.lucChiMod)*chiMultiplier): 0);
    actorModel.mental.ir = actorModel.health.mental.max * 2;
    actorModel.mental.tt = Math.round(actorModel.health.mental.max / 5) + eval(actorModel.mods.ttMod) + (actorModel.mods.ttChiMod ? (eval(actorModel.mods.ttChiMod)*chiMultiplier) : 0);
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

    const currentPhysicalDamage = actorModel.health.mental.value;
    const maxPhysicalDamage = actorModel.health.mental.max;
    actorModel.mental.relativeStressDamage = Math.round(currentPhysicalDamage*100/maxPhysicalDamage) > 100 ? 100 : Math.round(currentPhysicalDamage*100/maxPhysicalDamage);

    const currentDeathDamage = actorModel.health.insanity.value;
    const maxDeathDamage = actorModel.health.insanity.max;
    actorModel.mental.relativeInsanityDamage = Math.round(currentDeathDamage*100/maxDeathDamage) > 100 ? 100 : Math.round(currentDeathDamage*100/maxDeathDamage);
  }

  _calculatePools(actorModel, morphValues, chiMultiplier) {
    actorModel.pools.flex.totalFlex = Number(morphValues.flex) +
      Number(actorModel.ego.egoFlex) +
      eval(actorModel.pools.flex.mod) + 
      (actorModel.pools.flex.chiMod ? (eval(actorModel.pools.flex.chiMod)*chiMultiplier) : 0)
    actorModel.pools.insight.totalInsight = Number(morphValues.insight) +
      eval(actorModel.pools.insight.mod) + 
      (actorModel.pools.insight.chiMod ? (eval(actorModel.pools.insight.chiMod)*chiMultiplier) : 0)
    actorModel.pools.moxie.totalMoxie = Number(morphValues.moxie) +
      eval(actorModel.pools.moxie.mod) + 
      (actorModel.pools.moxie.chiMod ? (eval(actorModel.pools.moxie.chiMod)*chiMultiplier) : 0)
    actorModel.pools.vigor.totalVigor = Number(morphValues.vigor) +
      eval(actorModel.pools.vigor.mod) + 
      (actorModel.pools.vigor.chiMod ? (eval(actorModel.pools.vigor.chiMod)*chiMultiplier) : 0)
  }

  _calculateHomebrewEncumberance(actorModel) {
   //HOMEBREW - Encumbrance through weapons & gear
   if(actorModel.homebrew === true && this.type === "character"){
    //Weapon Variables
    let weaponScore = 0;
    let weaponScoreMod = actorModel.mods.weaponScoreMod ? eval(actorModel.mods.weaponScoreMod) : 0;
    let bulkyWeaponCount = 0;
    let weaponMalus = 0;
    let weaponItems = this.items.filter(i => i.type === "rangedWeapon" || i.type === "ccWeapon");
    //Gear Variables
    let gearItems = this.items.filter(i => i.type === "gear");
    let accessoryCount = 0;
    let accessoryCountMod = actorModel.mods.accessoryCountMod ? eval(actorModel.mods.accessoryCountMod) : 0;
    let accessoryMalus = 0;
    let bulkyCount = 0;
    let bulkyCountMod = actorModel.mods.bulkyCountMod ? eval(actorModel.mods.bulkyCountMod) : 0;
    let bulkyMalus = 0;
    //Consumable Encumberance
    let consumableItems = this.items.filter(i => i.system.slotType === "consumable");
    let consumableCount = 0;
    let consumableCountMod = actorModel.mods.consumableCountMod ? eval(actorModel.mods.consumableCountMod) : 0;
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
          weaponScore += 4;
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
    if(accessoryCount + accessoryCountMod > 4){
      accessoryMalus = Math.ceil((accessoryCount + accessoryCountMod -4)/4)*10;
    }
    if(weaponScore + weaponScoreMod > 5){
      weaponMalus = (Math.ceil((weaponScore + weaponScoreMod -5)/5)*10);
    }
    if(bulkyCount + bulkyWeaponCount + bulkyCountMod >= 1){
      bulkyMalus = (bulkyCount + bulkyWeaponCount + bulkyCountMod)*20;
    }
    if(consumableCount + consumableCountMod > 3){
      consumableMalus = Math.ceil((consumableCount + consumableCountMod -3)/3)*10;
    }

    // While jamming, the real body's carried weapons/gear stay behind and must not encumber the
    // drone's own rolls; stash the values instead, for use by rolls made with the real body (-30).
    if (actorModel.additionalSystems?.isJamming) {
      actorModel.additionalSystems.jamming ??= {};
      actorModel.additionalSystems.jamming.ownBodyWeaponMalus = weaponMalus;
      actorModel.additionalSystems.jamming.ownBodyGearMalus = bulkyMalus + accessoryMalus + consumableMalus;

      actorModel.physical.totalWeaponMalus = 0;
      actorModel.physical.totalGearMalus = 0;
      actorModel.currentStatus.bulkyModifier = 0;
      actorModel.currentStatus.gearModifier = 0;
      actorModel.currentStatus.consumableModifier = 0;
    }
    else {
      actorModel.physical.totalWeaponMalus = weaponMalus;
      actorModel.physical.totalGearMalus = bulkyMalus + accessoryMalus + consumableMalus;
      actorModel.currentStatus.bulkyModifier = bulkyMalus;
      actorModel.currentStatus.gearModifier = accessoryMalus;
      actorModel.currentStatus.consumableModifier = consumableMalus;
    }
  }
  //In case "Homebrew" is ticked off, this prevents a NaN failure in the dice roll
  else {
    actorModel.physical.totalWeaponMalus = 0;
    actorModel.physical.totalGearMalus = 0;
  }
  }

  _calculateSideCart(actorModel, items, jammedVehicleData) {
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
    // While jamming, armor comes from the drone's own rating instead of worn armor items - see _calculateArmor()
    if(armorCount>0 || jammedVehicleData){
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

  _modificationListCreator(actorModel, actorWhole, chiMultiplier){
    //Wounds + wound mods are getting calculated
    let wounds = actorModel.physical.wounds
    let ignoreWounds = actorModel.mods.woundMod + (actorModel.mods.woundChiMod ? (eval(actorModel.mods.woundChiMod)*chiMultiplier) : 0)
    let woundsCalc = wounds + ignoreWounds > 0 ? (wounds + ignoreWounds) * -10 * actorModel.mods.woundMultiplier : 0;

    // While jamming, actorModel.physical.wounds reflects the fresh drone, not the real body. Work out
    // what the wound modifier would be for the stashed real body, for rolls made with it (-30 own body).
    if (actorModel.additionalSystems?.isJamming) {
      const ownWounds = actorWhole.getFlag("eclipsephase", "jamHealthBackup")?.wounds ?? 0;
      const ownWoundsCalc = ownWounds + ignoreWounds > 0 ? (ownWounds + ignoreWounds) * -10 * actorModel.mods.woundMultiplier : 0;
      actorModel.additionalSystems.jamming ??= {};
      actorModel.additionalSystems.jamming.ownBodyWoundMod = ownWoundsCalc;
    }

    //Trauma + trauma mods are getting calculated
    let trauma = actorModel.mental.trauma;
    let ignoreTrauma = actorModel.mods.traumaMod + (actorModel.mods.traumaChiMod ? (eval(actorModel.mods.traumaChiMod)*chiMultiplier) : 0)
    let traumaCalc = trauma + ignoreTrauma > 0 ? (trauma + ignoreTrauma) * -10 : 0;

    //Armor & bulky are getting calculated
    let armorEncumberance = actorModel.physical.mainArmorMalus;
    let numberOfLayers = armorEncumberance/20+1;
    let armorSomCumberance = actorModel.physical.armorSomMalus;
    let bulky = actorModel.currentStatus.bulkyModifier;

    //Special modifications calculated
    actorModel.currentStatus.specialModifiers = [];
    actorModel.currentStatus.specialModifierSum = 0;

    //Encumberance(Homebrew) gets calculated
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
    actorModel.currentStatus.statusPresent = false;

    if(wounds > 0 || trauma > 0){
      actorModel.currentStatus.generalModifier = true;
      actorModel.currentStatus.woundModifierSum = woundsCalc;
      actorModel.currentStatus.traumaModifierSum = traumaCalc;
      actorModel.currentStatus.generalModifierSum = woundsCalc + traumaCalc;
    }
    
    if(armorEncumberance || armorSomCumberance){
      actorModel.currentStatus.armorModifier = true;
      actorModel.currentStatus.armorLayerSum = numberOfLayers
      actorModel.currentStatus.armorModifierSum = (armorEncumberance + armorSomCumberance)*-1;
    }

    if (actorModel.homebrew){
      if(bulky || weapon || gear || consumable){
        actorModel.currentStatus.encumberanceModifier = true;
        actorModel.currentStatus.bulkySum = bulky/20;
        actorModel.currentStatus.encumberanceModifierSum = (bulky + weapon + gear + consumable)*-1;
      }
    }

    if (actorModel?.additionalSystems?.sleeving?.integrationIssues !== undefined){
      actorModel.currentStatus.specialModifiers.push({"label" : actorModel.additionalSystems.sleeving.integrationIssues.title, "modifier" : actorModel.additionalSystems.sleeving.integrationIssues.value, "appeal" : actorModel.additionalSystems.sleeving.integrationIssues.appeal, "flag" : actorModel.additionalSystems.sleeving.integrationIssues.identifier});
    }

    if(actorModel.currentStatus.generalModifier || actorModel.currentStatus.generalModifier || actorModel.currentStatus.armorModifier || actorModel.currentStatus.encumberanceModifier || actorModel.currentStatus.specialModifiers.length >= 1){
      actorModel.currentStatus.statusPresent = true
    }
    
    //Sums all spcial modifiers into one (this can be use to refactor the whole calc into a far easier method and is something fo future me)
    for(let mod of actorModel.currentStatus.specialModifiers){
      actorModel.currentStatus.specialModifierSum += mod.modifier;
    }

    actorModel.currentStatus.currentModifiersSum = actorModel.currentStatus.generalModifierSum + actorModel.currentStatus.armorModifierSum + actorModel.currentStatus.encumberanceModifierSum + actorModel.currentStatus.specialModifierSum;
  }

  _calculateArmor(actorModel, actorWhole, jammedVehicleData) {
    // While jamming, armor comes from the drone's own rating instead of the character's worn armor
    if (jammedVehicleData) {
      actorModel.physical.energyArmorTotal = Number(jammedVehicleData.system.armor?.energy) || 0;
      actorModel.physical.kineticArmorTotal = Number(jammedVehicleData.system.armor?.kinetic) || 0;
      actorModel.physical.mainArmorTotal = 0;
      actorModel.physical.additionalArmorTotal = 0;
      actorModel.physical.mainArmorMalus = 0;
      actorModel.physical.additionalArmorMalus = 0;
      actorModel.physical.armorMalusTotal = 0;
      actorModel.physical.armorSomMalus = 0;
      actorModel.physical.armorDurAnnounce = "";

      const armorSomCheck = Math.max(actorModel.physical.energyArmorTotal, actorModel.physical.kineticArmorTotal);
      if (actorModel.health.physical.max < armorSomCheck){
        actorModel.physical.armorDurAnnounce = 1;
      }
      if (armorSomCheck > 11){
        actorModel.physical.armorVisibilityAnnounce = 1;
      }

      // Also work out what the real body's own worn-armor encumbrance would be, for rolls
      // made with the real body instead of the drone (see dice.js "jammingRollTarget: own")
      let ownEnergyTotal = 0;
      let ownKineticTotal = 0;
      let ownMainArmorAmount = 0;
      for (let armor of this.items.filter(i => i.type === "armor")) {
        if (armor.system.active) {
          ownEnergyTotal += Number(armor.system.energy);
          ownKineticTotal += Number(armor.system.kinetic);
          if (armor.system.slotType === "main") ownMainArmorAmount++;
        }
      }
      ownEnergyTotal += eval(actorModel.mods.energyMod);
      ownKineticTotal += eval(actorModel.mods.kineticMod);

      let ownMainArmorMalus = 0;
      if (ownMainArmorAmount > 1) {
        ownMainArmorMalus = (ownMainArmorAmount - 1) * 20;
      }

      const ownArmorSomCheck = ownEnergyTotal > ownKineticTotal ? ownEnergyTotal : ownKineticTotal;
      const actorSom = actorModel.aptitudes.som.value;
      let ownArmorSomMalus = 0;
      if (actorWhole.type === "character" && ownArmorSomCheck > actorSom && actorModel.homebrew){
        ownArmorSomMalus = 20;
      }
      else if (actorWhole.type === "character" && ownArmorSomCheck > actorSom && ownMainArmorAmount > 1){
        ownArmorSomMalus = 20;
      }

      actorModel.additionalSystems.jamming ??= {};
      actorModel.additionalSystems.jamming.ownBodyArmorMalus = (ownMainArmorMalus + ownArmorSomMalus) * -1;

      return;
    }

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
        if (armor.system.slotType === "main") {
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
    if (actorWhole.type === "character" && armorSomCheck > actorSom && actorModel.homebrew){
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
    let skillCap = 100 + Number(skill.capMod ? skill.capMod : 0)
    skill.total = skill.value + skillValue * skillData.multiplier;

    if(actorType === 'character' || actorType === 'npc')
      skill.derived =  (skill.total < skillCap ? skill.total : skillCap) + Number(skill.mod);
    else
      skill.derived = skill.value + Number(skill.mod)

    skill.roll = Number(skill.derived)
    skill.specialized = skill.roll + 10
  }

  _minimumInfection(actorModel, gammaCount, chiCount) {
    actorModel.psiStrain ??= { infection: 0, minimumInfection: 0 };
    let minimumInfection = 0;
    let currentInfection = actorModel.psiStrain.infection ?? 0;

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

  async _autoPush(actorModel, actorWhole) {
    let currentInfection = actorModel.psiStrain.infection ?? 0;
    let autoPushSelection = actorModel.additionalSystems.autoPushSelection

    switch(currentInfection){
      case (currentInfection < 33):
        actorModel.additionalSystems.autoPush = 0;
        actorModel.additionalSystems.autoPushSelection = false;
        break;
      case (currentInfection > 66 && !autoPushSelection):
        actorModel.additionalSystems.autoPush = 2;
        let pushSelection = await autoPushSelector("selectAutoPush")
        let selection = pushSelection.pushType;
        actorModel.additionalSystems.autoPushSelection = selection;

        break;
      default:
        break;
    }
  }
}

async function autoPushSelector(dialogType) {
  const dialog = "systems/eclipsephase/templates/chat/pop-up.html";
  const dialogName = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
  const selectButton = game.i18n.localize("ep2e.actorSheet.button.select");
  const content = await foundry.applications.handlebars.renderTemplate(dialog, { dialogType });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: dialogName },
    content,
    buttons: [
      {
        action: "select",
        label: selectButton,
        default: true,
        callback: (event, button) => _autoPushSelection(button.form)
      }
    ],
    position: { width: 315 },
    modal: true,
    rejectClose: false
  });

  return result ?? { cancelled: true };
}

//General skill check results
function _autoPushSelection(form) {
  return {
    pushType: form?.autoPush ? form.autoPush.value : false
  };
}
