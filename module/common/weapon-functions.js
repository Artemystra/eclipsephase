import { itemReduction, listSelection, gmList, searchableListSelection } from "./general-sheet-functions.js";
import { damageValueCalc } from "./general-sheet-functions.js";
import { dosesRemaining, isAmmoPack, payloadCandidates } from "./drugs.js";

const DRUG_CHOICE = "drug-";
/**
 * End-to-end weapon preparation
 * @param {*} actorWhole The actor document
 * @param {*} skillKey either "guns" or "melee" - Important for skill rolls while weapons are present
 * @param {*} rolledFrom either "rangedWeapon" or "ccWeapon". Circumvents the weapon selection and moves directly to the roll
 * @param {*} weaponID the ID of the weapon to use. Keep empty if rolled directly from a skill
 * @param {*} mode the mode of the weapon to use. Keep empty if rolled directly from a skill
 * @returns 
 */
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
    selection = {weapon, weaponID, weaponName, weaponDamage, weaponType, rolledFrom, currentAmmo, weaponTraits, weaponMode, drugId: weaponUsed.drugId ?? null}
    
  }

  return selection
}

/**
 * The armour a weapon's damage meets when the weapon names none: energy for a beam weapon, kinetic
 * for any other (Core p.214: beams are energy, firearms and melee kinetic).
 * @param {Item|Object} item - The weapon
 * @returns {String} "energy" or "kinetic"
 */
export function defaultArmorUsed(item) {
  return item?.type === "rangedWeapon" && item.system?.ammoType === "beam" ? "energy" : "kinetic";
}

/**
 * The armour an attack meets: the loaded ammunition's when it names one, otherwise the fired
 * mode's, otherwise the weapon's default.
 * @param {Item} weapon - The weapon
 * @param {String} [mode] - "1" or "2", the mode fired
 * @returns {String} "energy", "kinetic" or "none"
 */
export function attackArmorUsed(weapon, mode = "1") {
  const ammo = weapon?.system?.ammoSelected?.armorused;
  if (ammo === "energy" || ammo === "kinetic" || ammo === "none") return ammo;
  return weapon?.system?.[`mode${mode}`]?.armorused || defaultArmorUsed(weapon);
}

// An area that is none.
export const NO_AREA = { kind: "none", radius: null, reduction: null };

/**
 * A weapon range in metres, read from a number or from text like "75m" or "100m (AoE 1m)".
 * @param {*} value - The stored range
 * @returns {Number|null} The metres, null when there is none or it cannot be read
 */
export function parseRangeText(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const match = String(value ?? "").trim().match(/^(\d+(?:[.,]\d+)?)\s*m?(?![a-z])/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

/**
 * The area a range text names in its "(AoE 1m)" suffix, as a uniform blast.
 * @param {*} value - The stored range
 * @returns {Object|null} The area, null when the text names none
 */
export function parseRangeArea(value) {
  const match = String(value ?? "").match(/AoE\s*(\d+(?:[.,]\d+)?)\s*m?/i);
  return match ? { kind: "uniform", radius: Number(match[1].replace(",", ".")), reduction: null } : null;
}

/**
 * An area effect read from text like "Uniform (50 m)" or "Centered (-2 DV/m)" (Core p.213).
 * @param {*} value - The stored text
 * @returns {Object} kind ("uniform", "centered" or "none"), radius in metres, reduction in DV per metre
 */
export function parseAreaText(value) {
  const text = String(value ?? "");
  const uniform = text.match(/uniform\s*\(\s*(\d+(?:[.,]\d+)?)/i);
  if (uniform) return { kind: "uniform", radius: Number(uniform[1].replace(",", ".")), reduction: null };
  const centered = text.match(/cent(?:ere|re)d\s*\(\s*[-–]?\s*(\d+)\s*DV/i);
  if (centered) return { kind: "centered", radius: null, reduction: Number(centered[1]) };
  return { ...NO_AREA };
}

/**
 * A munition's area once its size is applied (Core p.213, baseline = minigrenades and
 * micromissiles): standard grenades and minimissiles double a uniform radius and add +1d10 to a
 * centred blast; standard missiles double both the uniform radius and a centred blast's damage.
 * @param {Object} system - The ammunition's or grenade's system data
 * @returns {Object} kind, radius, reduction, plus damage ("+1d10" or "") and damageMultiplier
 */
export function munitionArea(system) {
  const area = { ...NO_AREA, ...(system?.area ?? {}), damage: "", damageMultiplier: 1 };
  const size = system?.size;
  if (size !== "standard" && size !== "missile") return area;
  if (area.kind === "uniform" && area.radius) area.radius *= 2;
  if (area.kind === "centered") {
    if (size === "standard") area.damage = "+1d10";
    else area.damageMultiplier = 2;
  }
  return area;
}

/**
 * An area as the damage card names it, e.g. "Uniform (10 m)" or "Centered (-2 DV/m)".
 * @param {Object} area - kind, radius and reduction
 * @returns {String} The label, "" for no area
 */
export function areaText(area) {
  if (area?.kind === "uniform") return `${game.i18n.localize("ep2e.item.weapon.table.area.uniform")} (${area.radius ?? "?"} m)`;
  if (area?.kind === "centered") return `${game.i18n.localize("ep2e.item.weapon.table.area.centered")} (-${area.reduction ?? 2} DV/m)`;
  return "";
}

// The seeker sizes a munition can be chosen as (Core p.213), baseline being the micromissile.
const SEEKER_SIZES = ["baseline", "standard", "missile"];

/**
 * What is still open on a munition before it lands on a sheet: a seeker whose size reads "select",
 * and a payload that is switched on but carries nothing yet.
 * @param {String} type - The item type
 * @param {Object} system - The item's system data
 * @returns {Object} size and payload, each true when it still has to be chosen
 */
export function needsMunitionChoice(type, system) {
  if (type !== "ammo" && type !== "grenade") return { size: false, payload: false };
  return {
    size: type === "ammo" && system?.type === "seeker" && system?.size === "select",
    payload: system?.payload?.enabled === true && !system.payload.loaded?.length
  };
}

/**
 * Whether two munitions of one name are the same thing to stack: same size (none counts as the
 * baseline) and same payload.
 * @param {Object} a - One munition's system data
 * @param {Object} b - The other's
 * @returns {Boolean} True when they stack
 */
export function sameMunition(a, b) {
  const payload = system => system?.payload?.enabled ? system.payload.loaded?.[0]?.uuid ?? "" : "";
  return (a?.size || "baseline") === (b?.size || "baseline") && payload(a) === payload(b);
}

/**
 * A munition as a list row names it beyond its name: a seeker's size and the payload it carries.
 * @param {String} type - The item type
 * @param {Object} system - The item's system data
 * @returns {String} The label, "" when there is nothing to add
 */
export function munitionLabel(type, system) {
  const parts = [];
  if (type === "ammo" && system?.type === "seeker" && SEEKER_SIZES.includes(system.size)) parts.push(game.i18n.localize(`ep2e.item.weapon.table.size.${system.size}`));
  if (system?.payload?.enabled && system.payload.loaded?.[0]?.name) parts.push(system.payload.loaded[0].name);
  return parts.join(" · ");
}

/**
 * Settles what a munition still leaves open, on its data before it is created: asks a seeker's size
 * and a switched-on payload's substance in one dialog. Choosing no payload switches it off. Anything
 * else, and a munition with nothing open, passes through unasked.
 * @param {Object} itemData - The incoming item's source data, changed in place
 * @returns {Promise<Boolean>} False when the choice was cancelled
 */
export async function chooseMunition(itemData) {
  const system = itemData?.system;
  const open = needsMunitionChoice(itemData?.type, system);
  if (!open.size && !open.payload) return true;

  const entries = [];
  if (open.payload) {
    entries.push({ id: "none", label: game.i18n.localize("ep2e.dialog.selectMunition.noPayload") });
    for (const entry of await payloadCandidates(system.payload.delivery)) entries.push({ id: entry.uuid, label: entry.name });
  }
  const sizeChoice = open.size
    ? { label: "ep2e.item.weapon.table.size.label", options: SEEKER_SIZES.map(id => ({ id, label: `ep2e.item.weapon.table.size.${id}` })) }
    : null;
  const result = await searchableListSelection(entries, "ep2e.dialog.selectMunition.header", open.payload ? "ep2e.dialog.selectMunition.copy" : "", { sizeChoice });
  if (!result || result.cancelled) return false;

  if (open.size) system.size = SEEKER_SIZES.includes(result.size) ? result.size : "baseline";
  if (open.payload) {
    const chosen = entries.find(entry => entry.id === result.selection && entry.id !== "none");
    if (chosen) system.payload.loaded = [{ uuid: chosen.id, name: chosen.label }];
    else system.payload.enabled = false;
  }
  return true;
}

// The armour types a munition can name.
const ARMOR_TYPES = ["energy", "kinetic", "none"];

/**
 * What a weapon, ammunition or grenade written before 2.8.5 needs to fit its schema: ranges in
 * metres, an area read from its text, and a munition's armour type out of the key the old sheet
 * wrote. Values that already fit are left out.
 * @param {String} type - The item type
 * @param {Object} system - The item's system data
 * @returns {Object} The repairs, as system paths to values
 */
export function weaponDataRepairs(type, system) {
  const repairs = {};
  if (!system) return repairs;
  if (type === "rangedWeapon") {
    for (const mode of ["mode1", "mode2"]) {
      const data = system[mode];
      if (!data) continue;
      const range = data.range;
      if (range !== null && range !== undefined && typeof range !== "number") {
        repairs[`${mode}.range`] = parseRangeText(range);
        const area = parseRangeArea(range);
        if (area && (!data.area || data.area.kind === "none")) repairs[`${mode}.area`] = area;
      }
    }
  }
  if (type === "ammo" || type === "grenade") {
    if ((!system.area || system.area.kind === "none") && system.areaeffect) {
      const area = parseAreaText(system.areaeffect);
      if (area.kind !== "none") repairs.area = area;
    }
  }
  if ((type === "ammo" || type === "grenade") && !ARMOR_TYPES.includes(system.armorused)) {
    if (ARMOR_TYPES.includes(system.armorUsed)) repairs.armorused = system.armorUsed;
    else if (type === "grenade") repairs.armorused = "none";
  }
  return repairs;
}

/**
 * The range a weapon is fired at, in metres: the chosen mode's range rating.
 * @param {Object} weaponSelected - The roll's weapon, with weapon and weaponMode
 * @returns {Number|null} The metres, null for a weapon without one
 */
export function weaponRange(weaponSelected) {
  const mode = weaponSelected?.weaponMode ?? "1";
  return parseRangeText(weaponSelected?.weapon?.system?.[`mode${mode}`]?.range);
}

/**
 * The range category a distance falls into for a weapon (Core p.207): point-blank up to 2 m (+10),
 * close up to 10 m (+0), range up to the weapon's rating (-10), and beyond it -10 per range multiple,
 * so 200 m with range 50 is -40. A long weapon gets nothing at point-blank. select is the attack
 * dialog's matching distance entry.
 * @param {Number} distance - The distance in metres
 * @param {Number|null} range - The weapon's range rating, none for a weapon without one
 * @param {Object} [traits] - The weapon's automated traits, of which long counts
 * @returns {Object} band ("pointBlank", "close", "range" or "beyond"), multiples beyond range, modifier and select
 */
export function rangeBand(distance, range, traits = {}) {
  const metres = Math.max(0, Number(distance) || 0);
  if (range > 0 && metres > range) {
    const multiples = Math.ceil(metres / range);
    return { band: "beyond", multiples, modifier: -10 * multiples, select: multiples > 2 ? "beyond+" : "beyond" };
  }
  if (metres <= 2) return { band: "pointBlank", multiples: 0, modifier: traits?.long?.value ? 0 : 10, select: "pointBlank" };
  if (metres <= 10) return { band: "close", multiples: 0, modifier: 0, select: "none" };
  return { band: "range", multiples: 0, modifier: -10, select: "range" };
}

/**
 * The damage a kinetic weapon loses beyond its range (Core p.207): -1d10, unless in vacuum. A cone
 * loses it through coneDamage, beams and seekers never do.
 * @param {Object} weapon - The weapon item
 * @param {String} range - The attack dialog's distance entry
 * @param {Boolean} vacuum - Whether the attack is made in vacuum
 * @returns {String} A formula fragment, "" for none
 */
export function beyondRangeDamage(weapon, range, vacuum) {
  if (vacuum || (range !== "beyond" && range !== "beyond+")) return "";
  const ammo = weapon?.system?.ammoType;
  return ammo === "kinetic" || ammo === "rail" ? "-1d10" : "";
}

/**
 * Why a weapon may not be fired at a distance: no point-blank within 2 m, no close within 10 m.
 * @param {Number} distance - The distance in metres
 * @param {Object} [traits] - The weapon's automated traits
 * @returns {String|null} The localization key of the reason, null when it may
 */
export function rangeRefusal(distance, traits = {}) {
  if (traits?.noClose?.value && distance <= 10) return "ep2e.item.weapon.table.trait.noCloseAndPointBlank";
  if (traits?.noPointBlank?.value && distance <= 2) return "ep2e.item.weapon.table.trait.noPointBlank";
  return null;
}

// How wide suppressive fire's cone is at its far end, in metres (Core p.207); its length is the shooter's to choose.
export const SUPPRESSIVE_WIDTH = 20;

// The most targets a cone reaches (Core p.218).
export const CONE_MAX_TARGETS = 3;

// An attack's target count that stands for any number of targets. Kept as 0, since a card's flags
// cannot hold Infinity.
export const ANY_TARGETS = 0;

// What each attack mode of the attack dialogs does (Core p.204-206): rounds a ranged mode uses,
// the modifier it brings (kind says which dialog's modifiers it joins), the damage dice it adds,
// the targets it strikes with one attack test, and what it leaves the attacker open to afterwards.
// An aggressive attack takes either +10 to hit (Aggressive Hit) or +1d10 DV (Ruthless Attack), and
// costs -10 on Fray until the attacker's next action.
export const ATTACK_MODES = {
  single: { rounds: 1 },
  burst: { rounds: 3, damage: "+1d10" },
  wBurst: { rounds: 3, hit: { kind: "ranged", value: 10, announce: "ep2e.roll.announce.combat.ranged.wBurst" } },
  burstTargets: { rounds: 3, targets: 2 },
  fullAuto: { rounds: 10, damage: "+2d10" },
  wFullAuto: { rounds: 10, hit: { kind: "ranged", value: 30, announce: "ep2e.roll.announce.combat.ranged.wFullAuto" } },
  fullAutoTargets: { rounds: 10, targets: 3 },
  suppressive: { rounds: 20, targets: ANY_TARGETS },
  charge: { damage: "+1d6", hit: { kind: "melee", value: -10, announce: "ep2e.roll.announce.combat.melee.charge", addition: "ep2e.roll.announce.combat.melee.chargeAddition" } },
  aggressive: { hit: { kind: "melee", value: 10, announce: "ep2e.roll.announce.combat.melee.agressive" }, exposure: { nameKey: "ep2e.roll.announce.combat.melee.agressive", fray: -10 } },
  aggressiveCharge: { damage: "+1d10", exposure: { nameKey: "ep2e.roll.announce.combat.melee.agressiveCharge", fray: -10 } }
};

/**
 * The fewest targets an attack mode needs: two for a mode that strikes several, one otherwise.
 * @param {String} attackMode - The mode chosen in the attack dialog
 * @returns {Number} The minimum
 */
export function minimumTargets(attackMode) {
  return ATTACK_MODES[attackMode]?.targets > 1 ? 2 : 1;
}

/**
 * Whether a weapon fires in a cone: every spray weapon does (Core p.217).
 * @param {Item} weapon - The weapon
 * @returns {Boolean} True for a cone weapon
 */
export function isConeWeapon(weapon) {
  return weapon?.type === "rangedWeapon" && weapon.system?.ammoType === "spray";
}

/**
 * How many targets a cone reaches at a range (Core p.218): one at point-blank and close, two at
 * range, three beyond it.
 * @param {String} range - The distance chosen in the attack dialog
 * @returns {Number} The targets
 */
export function coneTargets(range) {
  if (range === "range") return 2;
  if (range === "beyond" || range === "beyond+") return 3;
  return 1;
}

/**
 * The damage dice a cone adds or loses at a range (Core p.218): +1d10 at point-blank and close,
 * -1d10 beyond range.
 * @param {Item} weapon - The weapon
 * @param {String} range - The distance chosen in the attack dialog
 * @returns {String} A formula fragment, "" for none
 */
export function coneDamage(weapon, range) {
  if (!isConeWeapon(weapon)) return "";
  if (range === "beyond" || range === "beyond+") return "-1d10";
  if (range === "range") return "";
  return "+1d10";
}


/**
 * How many targets a ranged attack strikes: a cone by its range, a burst or full auto at several
 * targets by the mode, suppressive fire anyone who breaks cover, anything else one.
 * @param {Item} weapon - The weapon
 * @param {Object} options - attackMode and range from the attack dialog
 * @returns {Number} The targets, ANY_TARGETS for any number
 */
export function attackTargetCount(weapon, { attackMode, range } = {}) {
  if (attackMode === "suppressive") return ANY_TARGETS;
  if (isConeWeapon(weapon)) return coneTargets(range);
  return ATTACK_MODES[attackMode]?.targets ?? 1;
}

/**
 * The drugs a character can force on someone in melee: those at hand with a dose left, not packs
 * meant to load a weapon. NPCs and goons carry all of theirs at hand.
 * @param {Actor} actor - The attacker
 * @returns {Item[]} The drugs
 */
export function forceableDrugs(actor) {
  return Array.from(actor.items ?? []).filter(item => item.type === "drug"
    && (actor.type !== "character" || item.system.active === true)
    && !isAmmoPack(item.system)
    && dosesRemaining(item.system) > 0);
}

/**
 * How many doses one shot of a weapon delivers: a weapon that fires chemicals delivers one per
 * round it uses up, so its Multi Shot number, or a single dose without one. Any other weapon
 * delivers none.
 * @param {Object} weaponTraits - The weapon's curated traits for the mode fired
 * @returns {Number} Doses per shot
 */
export function chemicalDoses(weaponTraits) {
  if (!weaponTraits?.automatedEffects?.specialAmmoDrugs) return 0;
  return Number(weaponTraits.additionalEffects?.multiShot?.number) || 1;
}

//Constructs a subset of active traits
export async function traitSubSetConstructor(weapon){
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
  let weaponslist = [{"id":1, "name": flatRollLabel},{"id":"", "name": ""}];
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
      
            let weaponEntry = skillKey === "guns" ? {"id":weapon.id, "name": weapon.name, "ammoCur": weapon.system.ammoMin, "ammoMax": weapon.system.ammoMax, "dv": calculated.dv} : {"id":weapon.id, "name": weapon.name, "dv": calculated.dv};
            weaponslist.push(weaponEntry)
        }
    }
    else {

        let traits = await traitSubSetConstructor(weapon)
        let calculated = await damageValueCalc(weapon, weapon.system.mode1, traits.curatedList.mode1.automatedEffects, "weapon")

        let weaponEntry = skillKey === "guns" ? {"id":weapon.id, "name": weapon.name, "ammoCur": weapon.system.ammoMin, "ammoMax": weapon.system.ammoMax, "dv": calculated.dv} : {"id":weapon.id, "name": weapon.name, "dv": calculated.dv};
        weaponslist.push(weaponEntry)
    }
  }
  const drugs = skillKey === "melee" ? forceableDrugs(actor) : [];
  if (drugs.length) {
    weaponslist.push({ "heading": "ep2e.roll.dialog.ranged.weaponSelect.drugsHeadline" });
    for (const drug of drugs) weaponslist.push({ "id": `${DRUG_CHOICE}${drug.id}`, "name": drug.name });
  }

  if (weaponslist.length > 2){
    checkWeapon = await listSelection(weaponslist, "weaponList", 536)
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

    if (weaponID.startsWith(DRUG_CHOICE)) {
      return { cancel: false, drugId: weaponID.slice(DRUG_CHOICE.length) };
    }

    else {
      for (let weaponObj of actorWeapons){        
        if (weaponObj.id === weaponID){
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

    let weaponModes = [{"id": 1, "name": weapon.system.mode1.name, "range": weapon.system.mode1.range, "firingModes": weapon.system.mode1.firingMode, "dv": mode1calculated.dv},{"id": 2, "name": weapon.system.mode2.name, "range": weapon.system.mode2.range, "firingModes": weapon.system.mode2.firingMode, "dv": mode2calculated.dv}];
    if(!selectedWeaponMode)
      selectedWeaponMode = await listSelection(weaponModes, "weaponList" , 536, "ep2e.roll.dialog.ranged.weaponSelect.modeSelectionHeadline");
  
    if(selectedWeaponMode.cancelled){
      let cancel = selectedWeaponMode.cancelled
      return {cancel};
    }
  
    if(selectedWeaponMode.selection === "1" || selectedWeaponMode === "1" ){
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

/**
 * The ammunition type a weapon takes, as the reload card names it: its translated label where the
 * system has one, the type itself otherwise.
 * @param {String} ammoType - The weapon's ammunition type, e.g. "kinetic" or "chemical"
 * @returns {String} The label to show
 */
function ammoTypeLabel(ammoType) {
  const key = `ep2e.item.weapon.table.ammoUsed.${ammoType}`;
  const label = game.i18n.localize(key);
  return label !== key ? label : ammoType[0].toUpperCase() + ammoType.slice(1);
}

//Reload Weapons
export async function reloadWeapon(html, actor) {
  html.querySelectorAll(".reload").forEach(element => {
    element.addEventListener("click", async event => {
      event.preventDefault();
      const ammoRules = game.settings.get("eclipsephase", "ammoRules");
      const dataset = event.currentTarget.dataset;
      const weaponID = dataset.weaponid;
      const weapon = actor.items.get(weaponID);
      const maxAmmo = weapon.system.ammoMax;
      const weaponName = weapon.name;
      const selfReplenishing = weapon.system.mode1.traits.selfReplenishing.value;
      const usesDrugs = weapon.system.mode1.traits.specialAmmoDrugs.value;
      const usesBugs = weapon.system.mode1.traits.specialAmmoBugs.value;
      const ammoType = usesDrugs ? "chemical" : (usesBugs ? "swarm" : weapon.system.ammoType);
      const ammoPresent = weapon.system.ammoSelected.id ? weapon.system.ammoSelected.id : "-";
      const WEAPON_DAMAGE_OUTPUT = "systems/eclipsephase/templates/chat/damage-result.html";
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
      if (numberOfPacks >= 1 || selfReplenishing) {
        //Creates a list of all applicable ammo available
        if (numberOfPacks > 1 || (selfReplenishing && numberOfPacks >= 1)) {
          if (selfReplenishing) {
            let ammoName = "ep2e.item.weapon.table.selfReplenish";
            let ammoEntry = {
              "id": weapon.system.ammoSelected.id,
              "name": ammoName,
              "traits": weapon.system.ammoSelected.traits,
              "dv": weapon.system.ammoSelected.dvModifier.calculated
            };
            ammoList.push(ammoEntry);
          }

          for (let ammo of actor.ammo[ammoType]) {
            calculated = await damageValueCalc(ammo, ammo.system.dv, traits, "ammo");
            traits = ammoType != "chemical" ? ammo.system.traits : {};
            dv = ammoType != "chemical" ? calculated.dv : "ep2e.item.weapon.table.noDamageValueModifier";

            let ammoEntry = { "id": ammo.id, "name": ammo.name, "traits": traits, "dv": dv };
            ammoList.push(ammoEntry);
          }

          let selectedAmmo = await listSelection(ammoList, "ammoList", 536);

          if (selectedAmmo.cancelled) {
            let cancel = selectedAmmo.cancelled;
            return { cancel };
          }

          if (selectedAmmo.selection === weapon.system.ammoSelected.id && selfReplenishing) {
            await selfReplenish(actor, maxAmmo, weaponID, weaponName, weapon, difference, WEAPON_DAMAGE_OUTPUT);
            return;
          }

          ammoSelected = actor.items.get(selectedAmmo.selection);
          let calc = await damageValueCalc(ammoSelected, ammoSelected.system.dv, ammoSelected.system.traits, "ammo");
          dv = ammoType != "chemical" ? calc.dv : "ep2e.item.weapon.table.noDamageValueModifier";
        }
        //Just uses the only fitting ammo pack available
        else if (!selfReplenishing) {
          ammoSelected = actor.ammo[ammoType][0];
          let calc = await damageValueCalc(ammoSelected, ammoSelected.system.dv, ammoSelected.system.traits, "ammo");
          dv = ammoType != "chemical" && !selfReplenishing ? calc.dv : "ep2e.item.weapon.table.noDamageValueModifier";
        }

        //Refills the weapon if selfReplenishing 'true' & no other swarm was selected
        if (selfReplenishing && numberOfPacks < 1) {
          await selfReplenish(actor, maxAmmo, weaponID, weaponName, weapon, difference, WEAPON_DAMAGE_OUTPUT);
          return;
        }

        traits = ammoSelected.system.traits;
        const loadedArea = munitionArea(ammoSelected.system);
        if (loadedArea.kind !== "none") traits["effectRadius"] = {
          "name": "ep2e.item.weapon.table.trait.effectRadius",
          "value": true,
          "radius": areaText(loadedArea)
        };

        calculated = await damageValueCalc(ammoSelected, ammoSelected.system.dv, traits, "ammo");

        if (difference > 0 || ammoPresent != ammoSelected.id) {
          weaponUpdate.push({
            "_id": weaponID,
            "system.ammoSelected.traits": {}
          });
          await actor.updateEmbeddedDocuments("Item", weaponUpdate);
        }

        //Automatic ammo deduction (based on the setting chosen in eclipsephase.js)
        //Survival mode (deduction/deletion)
        if (ammoRules === "survival" && actor.type === "character") {
          if (difference > 0 || ammoPresent != ammoSelected.id) {
            await itemReduction(actor, ammoSelected.id, ammoSelected.system.quantity);
          }
        }

        //Grenades only mode (deduction/deletion)
        if (ammoRules === "grenadesOnly" && actor.type === "character") {
          if (ammoSelected.system.type === "seeker" || ammoType === "chemical") {
            if (difference > 0 || ammoPresent != ammoSelected.id) {
              await itemReduction(actor, ammoSelected.id, ammoSelected.system.quantity);
            }
          }
        }

        if (difference > 0 || ammoPresent != ammoSelected.id) {
          currentAmmo = maxAmmo;

          const loaded = {
            "_id": weaponID,
            "system.ammoMin": currentAmmo,
            "system.ammoSelected.id": ammoSelected.id,
            "system.ammoSelected.name": ammoSelected.name,
            "system.ammoSelected.dvModifier": ammoType != "chemical" ? ammoSelected.system.dv : { "d10": 0, "d6": 0, "bonus": 0 },
            "system.ammoSelected.description": ammoSelected.system.description,
            "system.ammoSelected.dvModifier.calculated": dv,
            "system.ammoSelected.traits": ammoType != "chemical" ? traits : {},
            "system.ammoSelected.dose": null,
            "system.ammoSelected.armorused": ammoSelected.system?.armorused ?? "",
            "system.ammoSelected.area": loadedArea,
            "system.ammoSelected.payload": ammoSelected.system?.payload?.enabled ? foundry.utils.deepClone(ammoSelected.system.payload) : null
          };
          Hooks.callAll("eclipsephase.weaponLoaded", { actor, weapon, ammo: ammoSelected, ammoType, update: loaded });
          weaponUpdate.push(loaded);

          let message = {};
          message.type = "reload";
          message.copy = "ep2e.roll.announce.combat.ranged.reloadedWeapon";
          message.weaponName = weaponName;
          message.ammoLoadedName = ammoSelected.name;

          const renderedHtml = await foundry.applications.handlebars.renderTemplate(WEAPON_DAMAGE_OUTPUT, message);

          if (actor.type === "character") {
            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              content: renderedHtml
            });
          }
          else {
            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              content: renderedHtml,
              whisper: gmList()
            });
          }

          return actor.updateEmbeddedDocuments("Item", weaponUpdate);
        }
        else {
          let message = {};
          message.type = "reload";
          message.copy = "ep2e.roll.announce.combat.ranged.weaponFull";
          message.weaponName = weaponName;
          message.ammoLoadedName = null;

          const renderedHtml = await foundry.applications.handlebars.renderTemplate(WEAPON_DAMAGE_OUTPUT, message);

          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: renderedHtml,
            whisper: [game.user.id]
          });
        }
      }
      else {
        let message = {};
        message.type = "reload";
        message.copy = "ep2e.roll.announce.combat.ranged.noAmmoPresent";
        message.weaponName = weaponName;
        message.ammoLoadedName = ammoTypeLabel(ammoType);

        const renderedHtml = await foundry.applications.handlebars.renderTemplate(WEAPON_DAMAGE_OUTPUT, message);

        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          content: renderedHtml,
          whisper: [game.user.id]
        });
      }
    });
  });
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
      
      let html = await foundry.applications.handlebars.renderTemplate(htmlTemplate, message)

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
      
      let html = await foundry.applications.handlebars.renderTemplate(htmlTemplate, message)

      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: actor}),
          content: html,
          whisper: [game.user.id]
      })

      return;
    }
  }