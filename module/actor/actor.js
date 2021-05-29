/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class EclipsePhaseActor extends Actor {

  /**
   * Augment the basic actor data with additional dynamic data.
   */
  prepareData() {
    super.prepareData();

    const actorData = this.data;
    const data = actorData.data;
    const flags = actorData.flags;
    const item = this.items;
    const psiMod = 0;
    const brewStatus = game.settings.get("eclipsephase", "superBrew");

    // Homebrew Switch
    if (brewStatus) {
      data.homebrew = true;
    }
    else {
      data.homebrew = false;
    }

    if (actorData.type === 'character' || actorData.type === 'npc' || actorData.type === 'goon') this._prepareCharacterData(actorData);

    //HOMEBREW - Encumbrance through weapons & gear
    if(data.homebrew === true && actorData.type === "character"){
      //Weapon Variables
      let weaponScore = 0
      let bulkyWeaponCount = 0
      let weaponMalus = 0;
      //Weapon loop
      for(let weaponCheck of item){
        let weaponData = weaponCheck.data.data
        if(weaponCheck.type === "ccWeapon" || weaponCheck.type === "rangedWeapon") {
          if(weaponData.active === true && weaponData.slotType === "Sidearm"){
            weaponScore++;
          } 
          else if(weaponData.active === true && weaponData.slotType === "One Handed"){
            weaponScore += 2;
          }
          else if(weaponData.active === true && weaponData.slotType === "Two Handed"){
            weaponScore += 5;
          }
          else if(weaponData.active === true && weaponData.slotType === "Bulky"){
            bulkyWeaponCount++;
          }
        }
      }
      if(weaponScore > 6){
        
        weaponMalus = Math.ceil((weaponScore-5)/5)*10;
      }
      data.physical.totalWeaponMalus = weaponMalus;
      //Gear Variables
      let accessoryCount = 0;
      let bulkyCount = bulkyWeaponCount;
      let accessoryMalus = 0;
      let bulkyMalus = 0;
      //Gear loop
      for(let gearCheck of item){
        let gearData = gearCheck.data.data
        if(gearCheck.type === "gear" && gearData.active === true && gearData.slotType === "Accessory"){
          accessoryCount++;
        }
        if(gearCheck.type === "gear" && gearData.active === true && gearData.slotType === "Bulky"){
          bulkyCount++;
        }    
      }
      if(accessoryCount > 4){
        accessoryMalus = Math.ceil((accessoryCount-4)/4)*10;
      }
      if(bulkyCount > 1){
        bulkyMalus = (bulkyCount-1)*20;
      }
      data.physical.totalGearMalus = bulkyMalus + accessoryMalus;
    }
    //In case "Homebrew" is ticked off, this prevents a NaN failure in the dice roll
    else {
      data.physical.totalWeaponMalus = 0;
      data.physical.totalGearMalus = 0;
    }
    
    //Determin whether any gear is present
    for(let gearCheck of item){
      if(gearCheck.type != "rangedWeapon" && gearCheck.type != "ccWeapon" && gearCheck.type != "gear" && gearCheck.type != "program"){
        data.hasGear = false;
      }
      else{
        data.hasGear = true;
      }
    }

    //Checks if morph & ego picture are the same
    if (actorData.img === data.bodies.morph1.img){
      console.log("Check if the same picture is used for Ego & Body. Source: actor.js");
    }

    //Mental Health
    data.health.mental.max = data.aptitudes.wil.value * 2;
    data.mental.ir = data.health.mental.max * 2;
    data.mental.tt = Math.round(data.health.mental.max / 5);
    if(data.health.mental.value === null){
      data.health.mental.value = data.health.mental.max;
    }


    //Physical Health
    //NPCs & Goons only
    if (actorData.type === 'npc' || actorData.type === 'goon'){
      //Calculating WT & DR
      data.health.physical.max = data.bodies.morph1.dur;
      data.physical.wt = Math.round(data.bodies.morph1.dur / 5);
      if (data.bodyType.value === 'synth'){
            data.physical.dr = Math.round(data.bodies.morph1.dur * 2);
          }
      else if (data.bodyType.value === 'bio'){
            data.physical.dr = Math.round(data.bodies.morph1.dur * 1.5);
          }
      if(data.health.physical.value === null){
        data.health.physical.value = data.health.physical.max;
      }
    }
    //Characters only
    //Durability
    if (actorData.type === "character") {
      switch (data.bodies.activeMorph){
        case "morph1":
          data.health.physical.max = data.bodies.morph1.dur;
          data.physical.wt = Math.round(data.bodies.morph1.dur / 5);
          if (data.bodies.morph1.type === 'synth'){
            data.physical.dr = Math.round(data.bodies.morph1.dur * 2);
          }
          else if (data.bodies.morph1.type === 'bio'){
            data.physical.dr = Math.round(data.bodies.morph1.dur * 1.5);
          }
          break;
        case "morph2":
          data.health.physical.max = data.bodies.morph2.dur;
          data.physical.wt = Math.round(data.bodies.morph2.dur / 5);
          if (data.bodies.morph2.type === 'synth'){
            data.physical.dr = Math.round(data.bodies.morph2.dur * 2);
          }
          else if (data.bodies.morph2.type === 'bio'){
            data.physical.dr = Math.round(data.bodies.morph2.dur * 1.5);
          }
          break;
        case "morph3":
          data.health.physical.max = data.bodies.morph3.dur;
          data.physical.wt = Math.round(data.bodies.morph3.dur / 5);
          if (data.bodies.morph3.type === 'synth'){
            data.physical.dr = Math.round(data.bodies.morph3.dur * 2);
          }
          else if (data.bodies.morph3.type === 'bio'){
            data.physical.dr = Math.round(data.bodies.morph3.dur * 1.5);
          }
          break;
        case "morph4":
          data.health.physical.max = data.bodies.morph4.dur;
          data.physical.wt = Math.round(data.bodies.morph4.dur / 5);
          if (data.bodies.morph4.type === 'synth'){
            data.physical.dr = Math.round(data.bodies.morph4.dur * 2);
          }
          else if (data.bodies.morph4.type === 'bio'){
            data.physical.dr = Math.round(data.bodies.morph4.dur * 1.5);
          }
          break;
        case "morph5":
          data.health.physical.max = data.bodies.morph5.dur;
          data.physical.wt = Math.round(data.bodies.morph5.dur / 5);
          if (data.bodies.morph5.type === 'synth'){
            data.physical.dr = Math.round(data.bodies.morph5.dur * 2);
          }
          else if (data.bodies.morph5.type === 'bio'){
            data.physical.dr = Math.round(data.bodies.morph5.dur * 1.5);
          }
          break;
        case "morph6":
          data.health.physical.max = data.bodies.morph6.dur;
          data.physical.wt = Math.round(data.bodies.morph6.dur / 5);
          if (data.bodies.morph6.type === 'synth'){
            data.physical.dr = Math.round(data.bodies.morph6.dur * 2);
          }
          else if (data.bodies.morph6.type === 'bio'){
            data.physical.dr = Math.round(data.bodies.morph6.dur * 1.5);
          }
          break;
      }

      if(data.health.physical.value === null){
        data.health.physical.value = data.health.physical.max;
      }

      //Pools
      switch (data.bodies.activeMorph) {
        case "morph1":
          data.pools.flex.totalFlex = Number(data.bodies.morph1.flex)+Number(data.ego.egoFlex);
          data.pools.insight.totalInsight = Number(data.bodies.morph1.insight);
          data.pools.moxie.totalMoxie = Number(data.bodies.morph1.moxie);
          data.pools.vigor.totalVigor = Number(data.bodies.morph1.vigor);
          break;
        case "morph2":
          data.pools.flex.totalFlex = Number(data.bodies.morph2.flex)+Number(data.ego.egoFlex);
          data.pools.insight.totalInsight = Number(data.bodies.morph2.insight);
          data.pools.moxie.totalMoxie = Number(data.bodies.morph2.moxie);
          data.pools.vigor.totalVigor = Number(data.bodies.morph2.vigor);
          break;
        case "morph3":
          data.pools.flex.totalFlex = Number(data.bodies.morph3.flex)+Number(data.ego.egoFlex);
          data.pools.insight.totalInsight = Number(data.bodies.morph3.insight);
          data.pools.moxie.totalMoxie = Number(data.bodies.morph3.moxie);
          data.pools.vigor.totalVigor = Number(data.bodies.morph3.vigor);
          break;
        case "morph4":
          data.pools.flex.totalFlex = Number(data.bodies.morph4.flex)+Number(data.ego.egoFlex);
          data.pools.insight.totalInsight = Number(data.bodies.morph4.insight);
          data.pools.moxie.totalMoxie = Number(data.bodies.morph4.moxie);
          data.pools.vigor.totalVigor = Number(data.bodies.morph4.vigor);
          break;
        case "morph5":
          data.pools.flex.totalFlex = Number(data.bodies.morph5.flex)+Number(data.ego.egoFlex);
          data.pools.insight.totalInsight = Number(data.bodies.morph5.insight);
          data.pools.moxie.totalMoxie = Number(data.bodies.morph5.moxie);
          data.pools.vigor.totalVigor = Number(data.bodies.morph5.vigor);
          break;
        case "morph6":
          data.pools.flex.totalFlex = Number(data.bodies.morph6.flex)+Number(data.ego.egoFlex);
          data.pools.insight.totalInsight = Number(data.bodies.morph6.insight);
          data.pools.moxie.totalMoxie = Number(data.bodies.morph6.moxie);
          data.pools.vigor.totalVigor = Number(data.bodies.morph6.vigor);
          break;
      }
    }

    //Calculating armor
    let energyTotal = 0;
    let kineticTotal = 0;
    let mainArmorAmount = 0;
    let additionalArmorAmount = 0;
    for (let armor of item ) {
      let key = armor.type;
      if(key === 'armor' && armor.data.data.active){
        energyTotal += parseInt(armor.data.data.energy);
        kineticTotal += parseInt(armor.data.data.kinetic);
        if (armor.data.data.slotType === "Main Armor") {
          mainArmorAmount++
        }
        if (armor.data.data.slotType === "Additional Armor") {
          additionalArmorAmount++
        }
      }
    }
    data.physical.energyArmorTotal = energyTotal
    data.physical.kineticArmorTotal = kineticTotal
    data.physical.mainArmorTotal = mainArmorAmount
    data.physical.additionalArmorTotal = additionalArmorAmount
    data.physical.mainArmorMalus = 0
    data.physical.additionalArmorMalus = 0
    data.physical.armorMalusTotal = 0
    if (mainArmorAmount > 1){
      data.physical.mainArmorMalus = (mainArmorAmount - 1)*20
    }
    if (additionalArmorAmount > 1){
      data.physical.additionalArmorMalus = (additionalArmorAmount - 1)*20
    }
    if (data.physical.mainArmorMalus || data.physical.additionalArmorMalus) {
      data.physical.armorMalusTotal = data.physical.mainArmorMalus+data.physical.additionalArmorMalus
    }

    //Initiative
    data.initiative.value = Math.round((data.aptitudes.ref.value + data.aptitudes.int.value) / 5)

    //Modificators
    data.mods.woundMod = (data.physical.wounds * 10);
    data.mods.traumaMod = (data.mental.trauma * 10);

    //Psi-Calculator - Not Working yet
    if (actorData.type === "npc" || actorData.type === "character") {
      data.psiStrain.new = 0;
      data.psiStrain.current = Number(data.psiStrain.infection) + data.psiStrain.new;
    }


    //Derived Skills
    for (let [key, aptitude] of Object.entries(data.aptitudes)) {
      aptitude.mod = aptitude.value * 3;
      aptitude.roll = (aptitude.value * 3) - data.mods.woundMod - data.mods.traumaMod;
    }
    for (let [key, skill] of Object.entries(data.skillsIns)) {
      if(key === 'program' || key === 'interface' || key === 'infosec' ){
        skill.derived = skill.value + data.aptitudes.cog.value;
        skill.roll = skill.derived - data.mods.woundMod - data.mods.traumaMod;
        skill.specialized = skill.derived + 10 - data.mods.woundMod - data.mods.traumaMod;
      }
      else if (key === 'perceive') {
        skill.derived = skill.value + data.aptitudes.int.value * 2;
        skill.roll = skill.derived - data.mods.woundMod - data.mods.traumaMod;
        skill.specialized = skill.derived + 10 - data.mods.woundMod - data.mods.traumaMod;
      }
      else {
        skill.derived = skill.value + data.aptitudes.int.value;
        skill.roll = skill.derived - data.mods.woundMod - data.mods.traumaMod;
        skill.specialized = skill.derived + 10 - data.mods.woundMod - data.mods.traumaMod;
      }
    }
    for (let [key, skill] of Object.entries(data.skillsMox)) {
      if(key === 'provoke' || key === 'persuade' || key === 'kinesics' || key === 'deceive' ){
        skill.derived = skill.value + data.aptitudes.sav.value;
        skill.roll = skill.derived - data.mods.woundMod - data.mods.traumaMod;
        skill.specialized = skill.derived + 10 - data.mods.woundMod - data.mods.traumaMod;
      }
      else {
        skill.derived = skill.value + data.aptitudes.wil.value;
        skill.roll = skill.derived - data.mods.woundMod - data.mods.traumaMod;
        skill.specialized = skill.derived + 10 - data.mods.woundMod - data.mods.traumaMod;
      }
    }
    for (let [key, skill] of Object.entries(data.skillsVig)) {
      if(key === 'athletics' || key === 'free fall' || key === 'melee' ){
        skill.derived = skill.value + data.aptitudes.som.value;
        skill.roll = skill.derived - data.mods.woundMod - data.mods.traumaMod;
        skill.specialized = skill.derived + 10 - data.mods.woundMod - data.mods.traumaMod;
      }
      else if (key === 'fray'){
        skill.derived = (skill.value + data.aptitudes.ref.value * 2);
        skill.roll = skill.derived - data.mods.woundMod - data.mods.traumaMod;
        skill.specialized = skill.derived + 10 - data.mods.woundMod - data.mods.traumaMod;
      }
      else {
        skill.derived = skill.value + data.aptitudes.ref.value;
        skill.roll = skill.derived - data.mods.woundMod - data.mods.traumaMod;
        skill.specialized = skill.derived + 10 - data.mods.woundMod - data.mods.traumaMod;
      }
    }

      //Showing skill calculations for know/spec skills
      for (let value of item ) {
        let key = value.type;
        let aptSelect = 0;
        if (value.data.data.aptitude === "Intuition") {
          aptSelect = data.aptitudes.int.value;
        }
        else if (value.data.data.aptitude === "Cognition") {
          aptSelect = data.aptitudes.cog.value;
        }
        else if (value.data.data.aptitude === "Reflexes") {
          aptSelect = data.aptitudes.ref.value;
        }
        else if (value.data.data.aptitude === "Somatics") {
          aptSelect = data.aptitudes.som.value;
        }
        else if (value.data.data.aptitude === "Willpower") {
          aptSelect = data.aptitudes.wil.value;
        }
        else if (value.data.data.aptitude === "Savvy") {
          aptSelect = data.aptitudes.sav.value;
        }
        if(key === 'specialSkill' || key === 'knowSkill'){
          value.data.data.roll = Number(value.data.data.value) + aptSelect;
        }
      }

  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    const data = actorData.data;


  }
}