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

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.
    if (actorData.type === 'character') this._prepareCharacterData(actorData);

    //Physical & Mental derives
      data.physical.wt = Math.floor(data.bodies.morph1.dur / 5);
      if (data.bodyType.value === 'synth') {
          data.physical.dr = data.bodies.morph1.dur * 2;
      }
      else if (data.bodyType.value === 'bio'){
          data.physical.dr = data.bodies.morph1.dur * 1.5;
      }
      data.mental.luc = data.aptitudes.wil.value * 2;
      data.mental.ir = data.mental.luc * 2;
      data.mental.tt = Math.floor(data.mental.luc / 5);


    //Special Skill Derives
      data.specSkills.special1.specCheck = (data.specSkills.special1.value + parseInt(data.specSkills.special1.aptitude, 10));
      data.specSkills.special2.specCheck = (data.specSkills.special2.value + parseInt(data.specSkills.special2.aptitude, 10));
      data.specSkills.special3.specCheck = (data.specSkills.special3.value + parseInt(data.specSkills.special3.aptitude, 10));
      data.specSkills.special4.specCheck = (data.specSkills.special4.value + parseInt(data.specSkills.special4.aptitude, 10));
      data.specSkills.special5.specCheck = (data.specSkills.special5.value + parseInt(data.specSkills.special5.aptitude, 10));
      data.specSkills.special6.specCheck = (data.specSkills.special6.value + parseInt(data.specSkills.special6.aptitude, 10));

  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    const data = actorData.data;

    for (let [key, aptitude] of Object.entries(data.aptitudes)) {
        aptitude.mod = aptitude.value * 3;
    }
    for (let [key, skill] of Object.entries(data.skillsIns)) {
      if(key === 'program' || key === 'interface' || key === 'infosec' ){
        skill.derived = skill.value + data.aptitudes.cog.value;
        skill.specialized = skill.derived + 10;
      }
      else if (key === 'perceive') {
          skill.derived = skill.value + data.aptitudes.int.value * 2;
          skill.specialized = skill.derived + 10;
      }
      else {
        skill.derived = skill.value + data.aptitudes.int.value;
        skill.specialized = skill.derived + 10;
      }
    }
    for (let [key, skill] of Object.entries(data.skillsMox)) {
      if(key === 'provoke' || key === 'persuade' || key === 'kinesics' || key === 'deceive' ){
        skill.derived = skill.value + data.aptitudes.sav.value;
        skill.specialized = skill.derived + 10;
      }
      else {
        skill.derived = skill.value + data.aptitudes.wil.value;
        skill.specialized = skill.derived + 10;
      }
    }
    for (let [key, skill] of Object.entries(data.skillsVig)) {
      if(key === 'athletics' || key === 'free fall' || key === 'melee' ){
        skill.derived = skill.value + data.aptitudes.som.value;
        skill.specialized = skill.derived + 10;
      }
      else if (key === 'fray'){
        skill.derived = (skill.value + data.aptitudes.ref.value * 2);
        skill.specialized = skill.derived + 10;
      }
      else {
        skill.derived = skill.value + data.aptitudes.ref.value;
        skill.specialized = skill.derived + 10;
      }
    }
  }
}