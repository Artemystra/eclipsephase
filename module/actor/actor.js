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

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.
    if (actorData.type === 'character' || actorData.type === 'npc' || actorData.type === 'goon') this._prepareCharacterData(actorData);

    //Physical & Mental derives
      data.physical.wt = Math.round(data.bodies.morph1.dur / 5);

    if (data.bodyType.value === 'synth'){
      data.physical.dr = Math.round(data.bodies.morph1.dur * 5);
    }
      if (data.bodyType.value === 'synth'){
        data.physical.dr = Math.round(data.bodies.morph1.dur * 2);
      }
      else if (data.bodyType.value === 'bio'){
          data.physical.dr = Math.round(data.bodies.morph1.dur * 1.5);
      }
      data.mental.luc = data.aptitudes.wil.value * 2;
      data.mental.ir = data.mental.luc * 2;
      data.mental.tt = Math.round(data.mental.luc / 5);

    //Initiative
    data.initiative.value = Math.round((data.aptitudes.ref.value + data.aptitudes.int.value) / 5)

    //Modificators
    data.mods.woundMod = (data.physical.wounds * 10);
    data.mods.traumaMod = (data.mental.trauma * 10);


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

    if (actorData.type === 'npc' || actorData.type === 'goon'){
      for (let [key, spec] of Object.entries(data.specSkills)) {
        spec.specCheck = (spec.value + parseInt(spec.aptitude, 10));
        spec.roll = spec.specCheck - data.mods.woundMod - data.mods.traumaMod;
      }
      for (let [key, know] of Object.entries(data.knowSkills)) {
        know.knowCheck = (know.value + parseInt(know.aptitude, 10));
        know.roll = know.knowCheck - data.mods.woundMod - data.mods.traumaMod;
      }
    }

    for (let value of item ) {
      let key = value.type;
      let aptSelect = 0;
      console.log(value);
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