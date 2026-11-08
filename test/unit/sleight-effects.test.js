import { registerTargetedAttackHooks, applyTargetedAttack, yieldDefence, attackPicking } from "../../module/rolls/attacks.js";
import { registerChemicalAttacks, registerDoseHooks } from "../../module/common/doses.js";
import { registerWeaponAttacks } from "../../module/rolls/damage.js";
import { breakContact, sleightCondition, applySleightChoice, sleightTargeting, sleightArmor, skillEntries, chooseFromCard, sleightLanding, inducedErrorFailures, blockedSkillReason, forceInducedError, spendInducedError, registerSleightAttacks, detectSleightAttack, sleightModifiers, gammaPushes, sleightSpan, sleightPotency, scaledValue, scaledFormula, landSleight, relandAfterSpend, SLEIGHT_FLAG, SUSTAIN_FLAG, sustainRecords, sustainModifiers, sustainedSleights, endSustaining, sustainReach, healingFormula, sustainSummary, checkSustainReach, sleightDamageMode, sustainedTargets, endSustainingOn } from "../../module/rolls/psi.js";
import { sleightRollOptions } from "../../module/rolls/modifiers.js";
import { registerLandingRule, listLandingRules, registerFailOption } from "../../module/api/registry.js";
import { cardFailures } from "../../module/rolls/cards.js";
import { refuseForFamily, defenceDataset } from "../../module/rolls/attacks.js";
import { isEffectBlueprint } from "../../module/effects.js";
import { _ep285_sleightUpdate, _ep295_replacedBlueprints } from "../../module/common/migration.js";
import { markDefenceRolled } from "../../module/rolls/attacks.js";
import { RollCheck } from "../../module/rolls/dice.js";
import { resetStrainFamilies, registerCoreStrainFamilies, registerStrainFamily, getStrainFamily } from "../../module/rolls/strain-families.js";
import { isRunningEffect } from "../../module/common/time.js";
import { makeActor, resetWorld, seedRolls, loadPackItem } from "../setup/factories.js";

const { createdMessages } = global.__ep;
const PUBLIC = { rollMode: "public", usePool: "", globalMod: 0 };

/**
 * Waits until a condition holds, for work a hook starts without awaiting. Gives up after a second.
 * @param {Function} predicate - Checked after every tick
 * @returns {Promise<void>} Resolves once the predicate holds
 */
async function until(predicate) {
  for (let tick = 0; tick < 200 && !predicate(); tick++) await new Promise(resolve => setTimeout(resolve, 5));
}

/**
 * A goon async of WIL 20 knowing the compendium's Spam, Burst of Adrenaline, Empathic Scan, Static
 * and Tranquility, plus a minutes-long sleight without effects and an instant one. A goon is used so
 * the psi test is not followed by an Infection Test.
 * @param {Object} [additionalSystems] - e.g. a gamma-boosted async's free push
 * @returns {Actor} The async
 */
function async(additionalSystems = {}) {
  const pack = (file, id) => ({ ...loadPackItem(`psi-sleights/${file}`), _id: id });
  const items = [
    pack("Spam_ti835ZhJQuOMPyV2.json", "spam1"),
    pack("Burst_of_Adrenaline_vXDZpQKmd0MXn7D3.json", "burst1"),
    pack("Empathic_Scan_XCVbOodAkn3RO8UI.json", "scan1"),
    pack("Static_mwDrlNGwSPPK0ktO.json", "static1"),
    pack("Tranquility_rr4jbSbCV8LqjJlB.json", "calm1"),
    pack("Psi_Shield_ESBeHpg3AbBGl5sz.json", "shield1"),
    pack("Downtime_TLMaV0yThZzgn6bU.json", "down1"),
    pack("Block_Skill_2S4009ODopN12Ift.json", "block1"),
    pack("Induce_Error_CdbYcrB6K50gscPN.json", "error1"),
    pack("Invigorate_k0mxZEmjbxfMbaDc.json", "invigorate1"),
    pack("Alter_Effect_YJMlJrypaAELR1v7.json", "alter1"),
    pack("Basilisk_Stare_zXu469j4alW4HxcK.json", "stare1"),
    pack("Short_Circuit_aH5xFkIr9iCM6SkR.json", "circuit1"),
    pack("Pain_Ok2NLRCJ0fhGs5pl.json", "pain1"),
    pack("Block_Sense_ReUtU29tn1QhRGUF.json", "sense1"),
    { _id: "link1", name: "Mindlink", type: "aspect", system: { psiType: "gamma", strainFamily: "psi", duration: "sustained", infection: 0, damage: { d10: 0, d6: 0, bonus: 0 } } },
    { _id: "aphasia1", name: "Aphasia", type: "aspect", system: { psiType: "gamma", strainFamily: "psi", duration: "minutes", description: "No words.", infection: 0, damage: { d10: 0, d6: 0, bonus: 0 } } },
    { _id: "quick1", name: "Quick", type: "aspect", system: { psiType: "gamma", strainFamily: "psi", duration: "instant", infection: 0, damage: { d10: 0, d6: 0, bonus: 0 } } }
  ];
  return makeActor({ type: "goon", name: "Async", system: { aptitudes: { wil: { value: 20 } }, additionalSystems }, items });
}

/**
 * A target in a biomorph of WIL 15.
 * @param {String} name - Its name
 * @returns {Actor} The target
 */
function mind(name) {
  return makeActor({ type: "character", name, system: { activeMorph: "morph1", aptitudes: { wil: { value: 15 } } }, items: [{ _id: "morph1", name: "Morph", type: "morph", system: { type: "bio", dur: 30 } }] });
}

/**
 * Casts a sleight with the d100 showing the given value, at a skill of 70.
 * @param {Actor} actor - The async
 * @param {String} itemid - The sleight
 * @param {Number} die - The d100 result
 * @param {Object} [options] - Further dialog options, e.g. push
 * @returns {Promise<Object>} The psi test's card
 */
async function cast(actor, itemid, die, options = {}) {
  seedRolls([die]);
  await RollCheck({ name: "Psi", key: "psi", type: "psi", rollvalue: 70, itemid, pooltype: "Moxie" }, actor.system, actor, { skipDialog: true, presetOptions: { ...PUBLIC, ...options } }, null, "psiSleight");
  return createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack).at(-1);
}

/**
 * Casts a sleight at a target who yields, and waits for what it leaves.
 * @param {Actor} caster - The async
 * @param {String} itemid - The sleight
 * @param {Actor} target - The target
 * @param {Number} die - The d100 result
 * @param {Object} [options] - Further dialog options
 * @returns {Promise<Object>} The psi test's card
 */
async function landOn(caster, itemid, target, die, options = {}) {
  const card = await cast(caster, itemid, die, options);
  await applyTargetedAttack(card, { pick: async () => [{ actor: target }], confirm: async () => true });
  const defence = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);
  if (defence) await yieldDefence(defence, target.uuid);
  return card;
}

/**
 * The sleight effects on an actor.
 * @param {Actor} actor - The actor
 * @returns {ActiveEffect[]} The effects
 */
function sleightEffects(actor) {
  return Array.from(actor.effects).filter(effect => effect.getFlag("eclipsephase", SLEIGHT_FLAG));
}

/**
 * The value of an effect's first change.
 * @param {ActiveEffect} effect - The effect
 * @returns {Number} The value as a number
 */
function firstValue(effect) {
  return Number(effect.changes[0].value);
}

beforeAll(() => {
  registerChemicalAttacks();
  registerWeaponAttacks();
  registerSleightAttacks();
});

beforeEach(() => {
  resetWorld();
  resetStrainFamilies();
  registerCoreStrainFamilies();
  registerDoseHooks();
  registerTargetedAttackHooks();
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("what a sleight leaves where it lands (Core p.276)", () => {
  test("Spam on a yielding target: -10 to all actions for WIL / 5 action turns, a running effect named after it", async () => {
    const ana = mind("Ana");
    await landOn(async(), "spam1", ana, 30);
    await until(() => sleightEffects(ana).length);

    const [spam] = sleightEffects(ana);
    expect(spam.name).toBe("Spam");
    expect(spam.changes[0]).toMatchObject({ key: "system.mods.globalMod" });
    expect(firstValue(spam)).toBe(-10);
    expect(Array.from(spam.statuses)).toEqual(["impaired10"]);
    expect(spam.duration).toMatchObject({ value: 4, units: "rounds" });
    expect(isRunningEffect(spam)).toBe(true);
  });

  test("each superior success takes Spam's Impaired a level deeper, as do a critical success and the Effect push - never past -30", async () => {
    const at = async (die, options) => {
      const ana = mind("Ana");
      await landOn(async(), "spam1", ana, die, options);
      await until(() => sleightEffects(ana).length);
      return firstValue(sleightEffects(ana)[0]);
    };

    expect(await at(50)).toBe(-20);
    expect(await at(67)).toBe(-30);
    expect(await at(44)).toBe(-30);
    expect(await at(30, { push: "effect" })).toBe(-20);
  });

  test("a Burst does not repeat with superior successes, and the Duration push doubles its span", async () => {
    const ana = mind("Ana");
    await landOn(async(), "burst1", ana, 67, { push: "duration" });
    await until(() => sleightEffects(ana).length);

    const [burst] = sleightEffects(ana);
    expect(burst.changes[0].key).toBe("system.pools.vigor.mod");
    expect(firstValue(burst)).toBe(1);
    expect(burst.duration).toMatchObject({ value: 8, units: "minutes" });
  });

  test("the same sleight again renews the effect instead of stacking", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "spam1", ana, 30);
    await until(() => sleightEffects(ana).length);
    await landOn(caster, "spam1", ana, 50);
    await until(() => firstValue(sleightEffects(ana)[0]) === -20);

    expect(sleightEffects(ana)).toHaveLength(1);
  });

  test("a sleight without effects leaves a timer with its description; an instant one leaves nothing", async () => {
    const ana = mind("Ana");
    const bo = mind("Bo");
    await landOn(async(), "aphasia1", ana, 30);
    await landOn(async(), "quick1", bo, 30);
    await until(() => sleightEffects(ana).length);

    expect(sleightEffects(ana)[0]).toMatchObject({ name: "Aphasia", description: "No words." });
    expect(sleightEffects(ana)[0].changes).toEqual([]);
    expect(sleightEffects(bo)).toHaveLength(0);
  });

  test("a pool point the async spends after the sleight was sent counts: at landing, and on a target it already landed on", async () => {
    const caster = async();
    const ana = mind("Ana");
    const bo = mind("Bo");
    const card = await cast(caster, "spam1", 5);
    await applyTargetedAttack(card, { pick: async () => [{ actor: ana }, { actor: bo }], confirm: async () => true });
    const defence = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);
    await yieldDefence(defence, ana.uuid);
    await until(() => sleightEffects(ana).length);
    expect(firstValue(sleightEffects(ana)[0])).toBe(-10);

    await card.update({ "flags.eclipsephase.roll.alternatives": { ...card.getFlag("eclipsephase", "roll").alternatives, spent: true, result: 4, value: 50 } });
    expect(await relandAfterSpend(card, 4)).toBe(1);
    expect(sleightEffects(ana)).toHaveLength(1);
    expect(firstValue(sleightEffects(ana)[0])).toBe(-20);

    await yieldDefence(defence, bo.uuid);
    await until(() => sleightEffects(bo).length);
    expect(firstValue(sleightEffects(bo)[0])).toBe(-20);
  });

  test("a pool point that turns the defence takes the landing back", async () => {
    const ana = mind("Ana");
    const attack = { id: "a1", payload: { landing: { name: "Spam", duration: "action", span: { value: 4, units: "rounds" }, changes: [{ key: "system.mods.globalMod", value: "-10", type: "add" }], rollOptions: [], affects: "target", repeat: true, multiplier: 1 } }, roll: { result: 3 } };

    await landSleight(attack, ana, "hit", { defenceId: "d1" });
    expect(sleightEffects(ana)).toHaveLength(1);
    await landSleight(attack, ana, "none", { byPool: true, defenceId: "d1" });
    expect(sleightEffects(ana)).toHaveLength(0);
  });

  test("Empathic Scan works on the async: an option named after the target, offered on social tests only", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "scan1", ana, 50);
    await until(() => sleightEffects(caster).length);

    const [scan] = sleightEffects(caster);
    expect(sleightEffects(ana)).toHaveLength(0);
    expect(scan.name).toBe('ep2e.psi.sleightEffect.against {"sleight":"Empathic Scan","target":"Ana"}');
    expect(sleightRollOptions(caster, { key: "kinesics" }).map(entry => entry.option.value)).toEqual([20]);
    expect(sleightRollOptions(caster, { key: "wil", apttype: "wil" })).toEqual([]);
  });

  test("a gamma sleight's own effects are a blueprint, a chi sleight's are not", () => {
    expect(isEffectBlueprint({ type: "aspect", system: { psiType: "gamma" } })).toBe(true);
    expect(isEffectBlueprint({ type: "aspect", system: { psiType: "epsilon" } })).toBe(true);
    expect(isEffectBlueprint({ type: "aspect", system: { psiType: "chi" } })).toBe(false);
  });
});

describe("using a sleight on oneself (Core p.277)", () => {
  test("picking one's own token is a success test: no defence card, no range modifier, the effect lands", async () => {
    const caster = async();
    const card = await cast(caster, "spam1", 30);
    await applyTargetedAttack(card, { pick: async () => [{ actor: caster }], confirm: async () => true });
    await until(() => sleightEffects(caster).length);

    expect(createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence"))).toHaveLength(0);
    expect(sleightEffects(caster)).toHaveLength(1);
    const own = sleightModifiers({ rolledFrom: "psiSleight", actor: caster, dataset: { itemid: "spam1" }, options: { preTargets: caster.uuid, measuredRanges: "0" } }, () => []);
    expect(own).toEqual([]);
  });

  test("a self-only sleight asks for no target and goes to the async; an others-only one refuses the async's token", async () => {
    const caster = async();
    const context = itemid => ({ rolledFrom: "psiSleight", actor: caster, dataset: { itemid }, options: {} });

    expect(detectSleightAttack(context("static1"), { damaging: false })).toMatchObject({ selfOnly: true, preTargets: [caster.uuid], targets: 1 });
    expect(attackPicking(context("static1"))).toBeNull();
    expect(attackPicking(context("calm1")).refuse({ actor: caster })).toBe("ep2e.targeting.notOnSelf");
    expect(attackPicking(context("calm1")).refuse({ actor: mind("Ana") })).toBeNull();

    let refused = null;
    const card = await cast(caster, "calm1", 30);
    await applyTargetedAttack(card, { pick: async ({ refuse }) => { refused = refuse({ actor: caster }); return [{ actor: caster }]; }, confirm: async () => true });
    expect(refused).toBe("ep2e.targeting.notOnSelf");
    expect(sleightEffects(caster)).toHaveLength(0);
  });
});

describe("the pushes a sleight runs with (Core p.277)", () => {
  test("the free push of a gamma-boosted async counts as the chosen one: Additional Target, Power, Penetration", () => {
    const boosted = push => async({ psiGammaBoosted: true, autoPushSelection: push });
    const context = actor => ({ rolledFrom: "psiSleight", actor, dataset: { itemid: "spam1" }, options: {} });

    expect([...gammaPushes(boosted("power"), "range")].sort()).toEqual(["power", "range"]);
    expect(gammaPushes(async({ psiGammaBoosted: false, autoPushSelection: "power" }), "").size).toBe(0);
    expect(detectSleightAttack(context(boosted("target")), { damaging: false }).targets).toBe(2);
    expect(detectSleightAttack(context(boosted("power")), { damaging: false }).payload.halveWill).toBe(true);
    expect(detectSleightAttack(context(boosted("penetration")), { damaging: false }).payload.armorPiercing).toBe(true);
    expect(attackPicking(context(boosted("target"))).count({ elements: { push: { value: "" } } })).toBe(2);
    expect(attackPicking(context(boosted("target"))).within).toBeNull();
  });

  test("span: WIL / 5, at least one, in the sleight's unit; \"Actions Turns\" counts as action turns", () => {
    const actor = { system: { aptitudes: { wil: { value: 3 } } } };

    expect(sleightSpan({ duration: "Actions Turns" }, actor)).toEqual({ value: 1, units: "rounds" });
    expect(sleightSpan({ duration: "hours" }, actor, new Set(["duration"]))).toEqual({ value: 2, units: "hours" });
    expect(sleightSpan({ duration: "sustained" }, actor)).toBeNull();
  });

  test("potency and scaled values: numbers multiply, dice are counted as often and rolled once", async () => {
    expect(sleightPotency({ repeat: true, multiplier: 2 }, 5)).toEqual({ count: 3, factor: 2 });
    expect(sleightPotency({ repeat: false, multiplier: 1 }, 7)).toEqual({ count: 1, factor: 4 });
    expect(await scaledValue("+1", { count: 2, factor: 2 })).toBe(4);
    expect([scaledFormula("1d6", { count: 2, factor: 1 }), scaledFormula("2d10+5", { count: 2, factor: 2 }), scaledFormula("+5", { count: 1, factor: 1 })]).toEqual(["2d6", "(4d10 + 10) * 2", null]);
    seedRolls([8]);
    expect(await scaledValue("1d6", { count: 2, factor: 1 })).toBe(8);
  });
});

describe("the 2.8.5 migration of sleights", () => {
  test("\"Actions Turns\" becomes action turns, and a namesake's rule, options and blueprint fill what the sleight lacks", () => {
    const catalogue = new Map([["Empathic Scan", { system: { affects: "async", repeatPerSuperior: true, rollOptions: [{ id: "social", value: 10 }] }, effects: [] }], ["Spam", { system: { repeatPerSuperior: true }, effects: [{ name: "Spam" }] }]]);
    const scan = { type: "aspect", name: "Empathic Scan", system: { duration: "Actions Turns" }, effects: [] };
    const spam = { type: "aspect", name: "Spam", system: { duration: "action", repeatPerSuperior: true }, effects: [{ name: "Own" }] };

    expect(_ep285_sleightUpdate(scan, catalogue)).toEqual({ update: { "system.duration": "action", "system.affects": "async", "system.repeatPerSuperior": true, "system.rollOptions": [{ id: "social", value: 10 }] }, effects: [] });
    expect(_ep285_sleightUpdate(spam, catalogue)).toBeNull();
    expect(_ep285_sleightUpdate({ type: "gear", name: "Spam", system: {} }, catalogue)).toBeNull();
  });
});

describe("sustaining a sleight (Core p.276)", () => {
  test("a sustained sleight leaves an effect without end on the target and a record on the async, which costs -10 on other skill tests only", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "link1", ana, 30);
    await until(() => sustainRecords(caster).length);

    expect(sleightEffects(ana)[0].duration.value).toBeNull();
    const [record] = sustainRecords(caster);
    expect(record.name).toBe('ep2e.psi.sustain.name {"sleight":"Mindlink","targets":"Ana"}');
    expect(record.getFlag("eclipsephase", SUSTAIN_FLAG)).toMatchObject({ itemId: "link1", sleightName: "Mindlink", targets: [{ uuid: ana.uuid, name: "Ana" }] });
    expect(sustainedSleights(caster)).toEqual({ link1: true });
    const roll = (dataset, extra = {}) => sustainModifiers({ actor: caster, dataset, rollType: "skill", rolledFrom: "", ...extra }).map(entry => entry.value);
    expect(roll({ key: "kinesics" })).toEqual([-10]);
    expect(roll({ key: "fray" })).toEqual([-10]);
    expect(roll({ key: "system.aptitudes.wil.value", apttype: "wil" })).toEqual([]);
    expect(roll({ key: "rep" }, { rollType: "rep" })).toEqual([]);
    expect(roll({ key: "psi", itemid: "link1" }, { rolledFrom: "psiSleight" })).toEqual([]);
    expect(roll({ key: "psi", itemid: "spam1" }, { rolledFrom: "psiSleight" })).toEqual([-10]);
  });

  test("ending the record ends the effect on the target; removing the target's effect ends the record", async () => {
    registerSleightAttacks();
    const caster = async();
    const ana = mind("Ana");
    const bo = mind("Bo");
    await landOn(caster, "link1", ana, 30);
    await until(() => sustainRecords(caster).length);
    expect(await endSustaining(caster, { itemId: "link1" })).toBe(1);
    await until(() => !sleightEffects(ana).length);
    expect(sleightEffects(ana)).toHaveLength(0);

    await landOn(caster, "link1", bo, 30);
    await until(() => sustainRecords(caster).length);
    await bo.deleteEmbeddedDocuments("ActiveEffect", sleightEffects(bo).map(effect => effect.id));
    await until(() => !sustainRecords(caster).length);
    expect(sustainRecords(caster)).toHaveLength(0);
  });

  test("renewing a sustained sleight keeps its record", async () => {
    registerSleightAttacks();
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "link1", ana, 30);
    await until(() => sustainRecords(caster).length);
    await landOn(caster, "link1", ana, 30);
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(sleightEffects(ana)).toHaveLength(1);
    expect(sustainRecords(caster).length).toBeGreaterThan(0);
  });

  test("the reach is Close + 10 m: 20 m, 30 m against an async, once more with Increased Range", () => {
    expect([sustainReach(mind("Ana")), sustainReach(async()), sustainReach(mind("Ana"), true)]).toEqual([20, 30, 30]);
  });

  test("Psi Shield on oneself raises mental armour by a rolled 1d6, 2d6 with a superior success, while sustained", async () => {
    const caster = async();
    seedRolls([50, 7]);
    await RollCheck({ name: "Psi", key: "psi", type: "psi", rollvalue: 70, itemid: "shield1", pooltype: "Moxie" }, caster.system, caster, { skipDialog: true, presetOptions: { ...PUBLIC, preTargets: caster.uuid } }, null, "psiSleight");
    await until(() => sleightEffects(caster).length && sustainRecords(caster).length);

    const [shield] = sleightEffects(caster);
    expect(shield.changes[0]).toMatchObject({ key: "system.mods.mentalArmorMod", value: "7" });
    expect(caster.system.mental.armorTotal).toBe(7);
    expect(sustainRecords(caster)).toHaveLength(1);
  });
});

describe("sustaining more than once (Core p.276, p.285 Mindlink)", () => {
  test("Mindlink on three minds and Psi Shield read as one line, Mindlink x 3; a recast on the same mind keeps one record", async () => {
    const caster = async();
    const minds = [mind("Ana"), mind("Bo"), mind("Cy")];
    for (const target of minds) {
      await landOn(caster, "link1", target, 30);
      await until(() => sustainRecords(caster).some(effect => effect.getFlag("eclipsephase", SUSTAIN_FLAG).targets.some(entry => entry.uuid === target.uuid)));
    }
    await landOn(caster, "link1", minds[0], 30);
    await new Promise(resolve => setTimeout(resolve, 30));
    seedRolls([30, 4]);
    await RollCheck({ name: "Psi", key: "psi", type: "psi", rollvalue: 70, itemid: "shield1", pooltype: "Moxie" }, caster.system, caster, { skipDialog: true, presetOptions: { ...PUBLIC, preTargets: caster.uuid } }, null, "psiSleight");
    await until(() => sustainRecords(caster).length === 4);

    expect(sustainSummary(caster)).toEqual({ label: "ep2e.psi.sustain.summary", modifier: -40, comment: "Mindlink x 3 (-30)\nPsi Shield (-10)" });
    expect(sustainModifiers({ actor: caster, dataset: { key: "kinesics" }, rollType: "skill" })).toEqual([{ text: "ep2e.psi.sustain.summary", value: -40, comment: "Mindlink x 3 (-30)\nPsi Shield (-10)" }]);
  });

  test("ending a sleight sustained on several targets for some of them leaves the others", async () => {
    registerSleightAttacks();
    const caster = async();
    const ana = mind("Ana");
    const bo = mind("Bo");
    await landOn(caster, "link1", ana, 30);
    await until(() => sustainRecords(caster).length === 1);
    await landOn(caster, "link1", bo, 30);
    await until(() => sustainRecords(caster).length === 2);

    const targets = sustainedTargets(caster, "link1");
    expect(targets.map(entry => entry.name).sort()).toEqual(["Ana", "Bo"]);
    await endSustainingOn(caster, targets.filter(entry => entry.name === "Bo"));
    await until(() => sustainRecords(caster).length === 1);

    expect(sleightEffects(bo)).toHaveLength(0);
    expect(sleightEffects(ana)).toHaveLength(1);
    expect(sustainedTargets(caster, "link1").map(entry => entry.name)).toEqual(["Ana"]);
  });

  test("a range warning is whispered to the async's owners and the GMs, goes when they are back in reach, and comes again when they part again", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "link1", ana, 30);
    await until(() => sustainRecords(caster).length);
    const tokenAt = (actor, x) => ({ actor, x: 0, y: 0, width: 1, height: 1, _source: { x, y: 0, width: 1, height: 1 } });
    const asyncToken = tokenAt(caster, 0);
    let anaToken = tokenAt(ana, 200);
    const scene = { grid: { size: 100, distance: 1 }, get tokens() { return [asyncToken, anaToken]; } };
    const canvasBefore = globalThis.canvas;
    const activeGM = game.users.activeGM;
    globalThis.canvas = { ready: false, scene: null };
    game.users.activeGM = { isSelf: true };
    const warnings = () => createdMessages.filter(message => message.getFlag?.("eclipsephase", "sustainWarning"));

    try {
      expect(await checkSustainReach(scene)).toBe(0);
      anaToken = tokenAt(ana, 2500);
      expect(await checkSustainReach(scene)).toBe(1);
      expect(await checkSustainReach(scene)).toBe(0);
      expect(warnings()).toHaveLength(1);
      anaToken = tokenAt(ana, 200);
      await checkSustainReach(scene);
      expect(warnings()).toHaveLength(0);
      anaToken = tokenAt(ana, 2500);
      expect(await checkSustainReach(scene)).toBe(1);
      expect(warnings()).toHaveLength(1);
    } finally {
      globalThis.canvas = canvasBefore;
      game.users.activeGM = activeGM;
    }
  });
});

describe("a sleight that heals", () => {
  test("Downtime heals stress at once, more with a superior success, and leaves neither effect nor record", async () => {
    const caster = async();
    const ana = mind("Ana");
    await ana.update({ "system.health.mental.value": 10 });
    const card = await cast(caster, "down1", 50);
    seedRolls([6]);
    await applyTargetedAttack(card, { pick: async () => [{ actor: ana }], confirm: async () => true });
    const defence = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);
    await yieldDefence(defence, ana.uuid);
    await until(() => ana.system.health.mental.value !== 10);

    expect(ana.system.health.mental.value).toBe(4);
    expect(sleightEffects(ana)).toHaveLength(0);
    expect(sustainRecords(caster)).toHaveLength(0);
    expect(createdMessages.some(message => String(message.content).includes("ep2e.psi.healing.card"))).toBe(true);
  });

  test("the sheet's damage mode: chosen, or read off the damage value for a sleight that never chose", () => {
    const mode = damage => sleightDamageMode({ system: { damage } });
    expect([mode({ mode: "heal" }), mode({ mode: "none", d10: 2 }), mode({ mode: "", d10: 2 }), mode({ mode: "" }), mode({ d6: 1 })]).toEqual(["heal", "none", "damage", "none", "damage"]);
  });

  test("the healing formula counts dice and bonus once more per superior success and doubles on a critical", () => {
    expect(healingFormula({ d10: 0, d6: 1, bonus: 0 }, { count: 3, factor: 1 })).toBe("3d6");
    expect(healingFormula({ d10: 1, d6: 0, bonus: 2 }, { count: 1, factor: 2 })).toBe("(1d10 + 2) * 2");
  });
});

describe("landing rules", () => {
  const choiceCards = () => createdMessages.filter(message => message.getFlag?.("eclipsephase", "sleightChoice"));
  const roll = (actor, rollType) => ({ actor, rollType, modifiers: [], flags: {} });

  test("a blocked skill refuses its test once the async has chosen it, and only that skill", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "block1", ana, 30);
    const flag = choiceCards().at(-1).getFlag("eclipsephase", "sleightChoice");

    expect(blockedSkillReason(ana, "guns")).toBeNull();
    await applySleightChoice({ ...flag, skillKey: "guns", skillName: "Guns" });

    expect(blockedSkillReason(ana, "guns")).toBeTruthy();
    expect(blockedSkillReason(ana, "melee")).toBeNull();
    expect(sleightEffects(ana)[0].name).toContain("Guns");
  });

  test("each cast blocks its own skill, and the same skill again only renews its block", async () => {
    const caster = async();
    const ana = mind("Ana");
    const choose = async (skillKey, skillName) => {
      await landOn(caster, "block1", ana, 30);
      await applySleightChoice({ ...choiceCards().at(-1).getFlag("eclipsephase", "sleightChoice"), skillKey, skillName });
    };

    await choose("guns", "Guns");
    await choose("melee", "Melee");
    expect(blockedSkillReason(ana, "guns")).toBeTruthy();
    expect(blockedSkillReason(ana, "melee")).toBeTruthy();
    expect(sleightEffects(ana)).toHaveLength(2);

    await choose("guns", "Guns");
    expect(sleightEffects(ana)).toHaveLength(2);
    expect(blockedSkillReason(ana, "guns")).toBeTruthy();
  });

  test("an induced error on a plain success leaves the skill to the GM's note", async () => {
    const caster = async();
    await landOn(caster, "error1", mind("Ana"), 20);

    expect(choiceCards()).toHaveLength(0);
  });

  test("an induced error on a superior success fails the chosen skill's next test and is used up", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "error1", ana, 67);
    const flag = choiceCards().at(-1).getFlag("eclipsephase", "sleightChoice");
    await applySleightChoice({ ...flag, skillKey: "guns", skillName: "Guns" });

    const other = roll(ana, "melee");
    forceInducedError(other);
    expect(other.forcedResult).toBeUndefined();

    const context = roll(ana, "guns");
    forceInducedError(context);
    expect(context.forcedResult).toBe(2);
    expect(context.flags.failureNote).toBeTruthy();
    await spendInducedError(context);
    expect(sleightEffects(ana)).toHaveLength(0);
  });

  test("a landing rule from outside is honoured, and neither off nor unchosen counts as one", async () => {
    const choose = jest.fn(async () => true);
    expect(registerLandingRule("testRule", { label: "x", onLand: () => {}, choose })).toBe(true);
    const ana = mind("Ana");

    expect(sleightLanding({ name: "S", system: { landingRule: "testRule" } }, ana)?.rule).toBe("testRule");
    expect(sleightLanding({ name: "S", system: { landingRule: "none" } }, ana)).toBeNull();
    expect(sleightLanding({ name: "S", system: { landingRule: "select" } }, ana)).toBeNull();
    expect(listLandingRules().map(rule => rule.id)).toEqual(expect.arrayContaining(["blockSkill", "failSkill", "recharge", "alterDuration", "testRule"]));

    const message = { id: "m1", getFlag: () => ({ rule: "testRule", targetUuid: ana.uuid }) };
    expect(await chooseFromCard(message)).toBe(true);
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ message, target: ana }));
  });

  test("an induced error left to the GM is offered once per kind, and each use spends the oldest", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "error1", ana, 20);
    await landOn(caster, "error1", ana, 20);
    const held = sleightEffects(ana);
    held.forEach((effect, index) => { effect._stats = { createdTime: index === 1 ? 1 : 2 }; });

    const offered = inducedErrorFailures(ana, { skillKey: "guns" });
    expect(offered.map(entry => entry.result)).toEqual([2]);
    expect(inducedErrorFailures(ana, { skillKey: "system.aptitudes.cog.value" })).toEqual([]);

    await offered[0].spend();
    expect(sleightEffects(ana)).toEqual([held[0]]);
  });

  test("a superior failure chosen on the card becomes a failure of that tier", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "error1", ana, 67);
    await applySleightChoice({ ...choiceCards().at(-1).getFlag("eclipsephase", "sleightChoice"), superiorFailure: true });

    expect(inducedErrorFailures(ana, { skillKey: "guns" }).map(entry => entry.result)).toEqual([1]);
  });

  test("a card offers only failures that worsen it, and none once an attack reached its targets", () => {
    const ana = mind("Ana");
    registerFailOption(() => [{ id: "plain", result: 2 }, { id: "superior", result: 1 }]);
    const card = (state, result, targetedAttack) => ({
      getFlag: (scope, key) => key === "taskCard" ? { targets: [], ...state } : { actorUuid: ana.uuid, targetedAttack, alternatives: { originalResult: result } }
    });
    const ids = message => cardFailures(message).map(entry => entry.id);
    globalThis.fromUuidSync = () => ana;

    expect(ids(card({ data: { resultClass: "success", skillKey: "guns" } }, 3))).toEqual(["plain", "superior"]);
    expect(ids(card({ data: { resultClass: "fail", skillKey: "guns" } }, 2))).toEqual(["superior"]);
    expect(ids(card({ data: { resultClass: "fail", skillKey: "guns" } }, 6))).toEqual([]);
    expect(ids(card({ data: { resultClass: "success", skillKey: "guns" }, targets: [{ outcome: "hit" }] }, 3))).toEqual([]);
    expect(ids(card({ data: { resultClass: "success", skillKey: "guns", rollContext: { failureNote: "Failed" } } }, 3))).toEqual([]);
    expect(ids(card({ data: { resultClass: "success", skillKey: "guns" } }, 3, { delivered: true }))).toEqual(["plain", "superior"]);
    expect(ids(card({ data: { resultClass: "success", skillKey: "guns" } }, 3, { delivered: true, willing: true }))).toEqual([]);
    expect(ids(card({ data: { resultClass: "success", skillKey: "guns" }, targets: [{ uuid: "self" }] }, 3, { delivered: true, defence: "will", actorUuid: "self" }))).toEqual([]);
  });

  test("a strain family decides who its sleights reach, what that adds and whether range doubles", () => {
    registerStrainFamily("machine", {
      targeting: {
        refuses: (actor, kinds) => kinds.includes("cyberbrain") ? null : kinds.find(kind => ["biomorph", "infomorph"].includes(kind)) ?? null,
        doublesRange: () => false
      }
    });
    const refuse = refuseForFamily("machine");
    const body = (name, type) => makeActor({ type: "character", name, system: { activeMorph: "morph1" }, items: [{ _id: "morph1", name: "Morph", type: "morph", system: { type } }] });
    expect(refuse({ actor: body("Bio", "bio") })).toContain("ep2e.targeting.unsuitable");
    expect(refuse({ actor: body("Synth", "synth") })).toBeNull();
    expect(getStrainFamily("machine").targeting.modifiers(body("Synth", "synth"), ["synthmorph"])).toEqual([]);
    expect(sleightTargeting({ system: { strainFamily: "machine" } }).doublesRange(body("Synth", "synth"))).toBe(false);
    expect(refuseForFamily("psi")({ actor: body("Synth", "synth") })).toContain("ep2e.targeting.unsuitable");
  });

  test("range doubles only between asyncs of one family, and a family names what resists and how long", async () => {
    const psiUser = makeActor({ type: "character", items: [{ _id: "s1", name: "Stab", type: "aspect", system: { psiType: "gamma", strainFamily: "psi" } }] });
    const kiUser = makeActor({ type: "character", items: [{ _id: "s2", name: "Bite", type: "aspect", system: { psiType: "gamma", strainFamily: "ki" } }] });
    const psi = getStrainFamily("psi").targeting;
    expect(psi.doublesRange(psiUser)).toBe(true);
    expect(psi.doublesRange(kiUser)).toBe(false);
    expect(psi.doublesRange(makeActor({ type: "character" }))).toBe(false);

    registerStrainFamily("body", { targeting: { resist: { aptitude: "som", pool: "Vigor" }, durationAptitude: "som" } });
    const actor = { system: { aptitudes: { wil: { value: 10, roll: 30 }, som: { value: 25, roll: 75 } } } };
    expect(defenceDataset(actor, { strainFamily: "body" }, "will")).toMatchObject({ apttype: "som", rollvalue: 75, pooltype: "Vigor" });
    expect(defenceDataset(actor, { strainFamily: "psi" }, "will")).toMatchObject({ apttype: "wil", rollvalue: 30, pooltype: "Moxie" });
    expect(sleightSpan({ duration: "minutes", strainFamily: "body" }, actor).value).toBe(5);
    expect(sleightSpan({ duration: "minutes", strainFamily: "psi" }, actor).value).toBe(2);
  });

  test("a damaging sleight meets the armour it names, mental by default", () => {
    expect(sleightArmor({ system: { damage: { armorUsed: "kinetic" } } })).toBe("kinetic");
    expect(sleightArmor({ system: { damage: {} } })).toBe("mental");
    expect(sleightArmor({ system: { damage: { armorUsed: "nonsense" } } })).toBe("mental");
  });

  test("a skill raised by a sleight adds its bonus to the effect", async () => {
    const ana = mind("Ana");
    const [effect] = await ana.createEmbeddedDocuments("ActiveEffect", [{ name: "Overclock", flags: { eclipsephase: { sleight: { attackId: "a1", choice: { rule: "boostSkill", skillKey: null, skillName: null } } } } }]);
    await applySleightChoice({ rule: "boostSkill", targetUuid: ana.uuid, attackId: "a1", sleightName: "Overclock", skillKey: "melee", skillName: "Melee", bonus: 20 });

    const held = Array.from(ana.effects).find(candidate => candidate.id === effect.id);
    expect(held.system.changes).toEqual([{ key: "system.skillsVig.melee.mod", type: "add", value: "20" }]);
    expect(held.getFlag("eclipsephase", "sleight").choice.skillKey).toBe("melee");
  });

  test("an instant recharge sleight posts its note and leaves no effect", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "invigorate1", ana, 30);

    expect(sleightEffects(ana)).toHaveLength(0);
    expect(choiceCards()).toHaveLength(0);
  });

  test("altering a substance changes its duration by half, either way", async () => {
    const caster = async();
    const ana = mind("Ana");
    await ana.createEmbeddedDocuments("ActiveEffect", [{ _id: "kick", name: "Kick", duration: { value: 60, units: "minutes" }, flags: { eclipsephase: { dose: { name: "Kick" } } } }]);
    await landOn(caster, "alter1", ana, 30);
    const flag = choiceCards().at(-1).getFlag("eclipsephase", "sleightChoice");
    const kick = Array.from(ana.effects).find(effect => effect.name === "Kick");

    await applySleightChoice({ ...flag, effectId: kick.id, factor: 0.5 });
    expect(kick.duration.value).toBe(30);
    await applySleightChoice({ ...flag, effectId: kick.id, factor: 1.5 });
    expect(kick.duration.value).toBe(45);
  });

  test("the skills offered are the actor's own, under the key their rolls carry", () => {
    const ana = makeActor({ type: "character", name: "Ana", system: { skillsIns: { infosec: { name: "Infosec" } }, skillsVig: {} }, items: [{ _id: "k1", name: "Know: Art", type: "knowSkill", system: {} }] });

    expect(skillEntries(ana)).toEqual(expect.arrayContaining([{ id: "infosec", label: "Infosec" }, { id: "know: art", label: "Know: Art" }]));
  });
});

describe("the conditions a sleight leaves (Core p.226)", () => {
  beforeEach(() => registerSleightAttacks());

  /**
   * The statuses an actor's effects carry, sorted.
   * @param {Actor} actor - The actor
   * @returns {String[]} The statuses
   */
  const statusesOn = actor => Array.from(actor.effects).flatMap(effect => Array.from(effect.statuses ?? [])).sort();

  test("Impaired goes a level deeper each time the sleight applies, never past -30; other conditions stay as they are", () => {
    expect([1, 2, 3, 4].map(count => sleightCondition("impaired", { count, factor: 1 }))).toEqual(["impaired10", "impaired20", "impaired30", "impaired30"]);
    expect(sleightCondition("incapacitated", { count: 3, factor: 2 })).toBe("incapacitated");
    expect(sleightCondition(null)).toBeNull();
  });

  test("Basilisk Stare leaves its target Incapacitated with the condition's icon; the async keeps -30 for visual coordination and sustains it", async () => {
    const caster = async();
    const ana = mind("Ana");
    await landOn(caster, "stare1", ana, 30);
    await until(() => sleightEffects(ana).length && sleightEffects(caster).length);
    const [onTarget] = sleightEffects(ana);
    const [onAsync] = sleightEffects(caster);

    expect(Array.from(onTarget.statuses)).toEqual(["incapacitated"]);
    expect(onTarget.img).toBe("icons/svg/paralysis.svg");
    expect(onTarget.getFlag("eclipsephase", SLEIGHT_FLAG).breaksContact).toBe(true);
    expect(Array.from(onAsync.statuses ?? [])).toEqual([]);
    expect(onAsync.getFlag("eclipsephase", SLEIGHT_FLAG).rollOptions).toEqual([expect.objectContaining({ id: "visualCoordination", value: -30 })]);
    expect(sustainRecords(caster)).toHaveLength(1);
  });

  test("the stare breaks once another attack has met the target or its token moves - not by its own defence card - and says so", async () => {
    const caster = async();
    const ana = mind("Ana");
    const card = await landOn(caster, "stare1", ana, 30);
    await until(() => sustainRecords(caster).length);
    const own = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);
    await markDefenceRolled(own, ana.uuid, "hit");
    expect(statusesOn(ana)).toEqual(["incapacitated"]);

    const other = await ChatMessage.create({ content: "", flags: { eclipsephase: { attackDefence: { attack: { id: "another" }, entries: [{ uuid: ana.uuid, name: "Ana", outcome: null }] } } } });
    await markDefenceRolled(other, ana.uuid, "hit");
    await until(() => !sleightEffects(ana).length && !sleightEffects(caster).length);

    expect(statusesOn(ana)).toEqual([]);
    expect(sustainRecords(caster).length).toBe(0);
    expect(sleightEffects(caster).length).toBe(0);
    expect(createdMessages.at(-1).content).toContain("ep2e.psi.contactLost");
    expect(card).toBeDefined();

    const bo = mind("Bo");
    await landOn(caster, "stare1", bo, 30);
    await until(() => sleightEffects(bo).length);
    game.user.isActiveGM = true;
    Hooks.callAll("updateToken", { actor: bo, parent: null }, { x: 100 });
    await until(() => !sleightEffects(bo).length);
    game.user.isActiveGM = undefined;
    expect(statusesOn(bo)).toEqual([]);
  });

  test("Short Circuit works like a shock: prone, incapacitated 1 action turn plus 2 per superior success, stunned for 3 minutes", async () => {
    const ana = mind("Ana");
    await landOn(async(), "circuit1", ana, 50);
    await until(() => statusesOn(ana).length === 3);
    const span = id => Array.from(ana.effects).find(effect => Array.from(effect.statuses).includes(id))?.duration;

    expect(statusesOn(ana)).toEqual(["incapacitated", "prone", "stunned"]);
    expect(span("incapacitated")).toMatchObject({ value: 3, units: "rounds" });
    expect(span("stunned")).toMatchObject({ value: 3, units: "minutes" });
    expect(createdMessages.some(message => message.content?.includes("ep2e.chat.strike.outcome"))).toBe(true);
  });

  test("Pain impairs its target for a turn and makes it flee, without a further check; Pain Tolerance II shrugs it off", async () => {
    const ana = mind("Ana");
    await landOn(async(), "pain1", ana, 30);
    await until(() => statusesOn(ana).length);
    const flee = createdMessages.at(-1);
    const tough = mind("Tough");
    tough.system.additionalSystems.painTolerance = 2;
    await landOn(async(), "pain1", tough, 30);
    await until(() => createdMessages.at(-1).content.includes("ep2e.chat.strike.immune"));

    expect(statusesOn(ana)).toEqual(["impaired20"]);
    expect(flee.content).toContain("ep2e.chat.strike.flee");
    expect(statusesOn(tough)).toEqual([]);
    expect(createdMessages.some(message => message.getFlag?.("eclipsephase", "strikeCheck"))).toBe(false);
  });

  test("Block Sense asks the async for the sense: sight leaves it Blinded, any other sense -30 on the rolls that rely on it", async () => {
    const ana = mind("Ana");
    const card = await landOn(async(), "sense1", ana, 30);
    await until(() => sleightEffects(ana).length);
    const attackId = card.getFlag("eclipsephase", "roll").targetedAttack.id;
    await applySleightChoice({ rule: "loseSense", targetUuid: ana.uuid, attackId, sleightName: "Block Sense", sense: "sight" });
    const bo = mind("Bo");
    const other = await landOn(async(), "sense1", bo, 30);
    await until(() => sleightEffects(bo).length);
    await applySleightChoice({ rule: "loseSense", targetUuid: bo.uuid, attackId: other.getFlag("eclipsephase", "roll").targetedAttack.id, sleightName: "Block Sense", sense: "smell" });

    expect(statusesOn(ana)).toEqual(["blinded"]);
    expect(sleightEffects(ana)[0].changes).toEqual([expect.objectContaining({ value: "-30" })]);
    expect(statusesOn(bo)).toEqual([]);
    expect(sleightEffects(bo)[0].getFlag("eclipsephase", SLEIGHT_FLAG).rollOptions).toEqual([expect.objectContaining({ id: "lostSense", value: -30 })]);
    expect(createdMessages.some(message => message.content?.includes("ep2e.psi.choice.loseSense"))).toBe(true);
  });

  test("the 2.9.5 migration gives a sleight its namesake's condition and takes Spam's old -10 blueprint off", () => {
    const catalogue = new Map([["Spam", { system: { condition: "impaired", repeatPerSuperior: true }, effects: [] }], ["Basilisk Stare", { system: { condition: "incapacitated", landingRule: "eyeContact" }, effects: [] }]]);
    const spam = { type: "aspect", name: "Spam", system: { condition: "none" }, effects: [{ id: "old", changes: [{ key: "system.mods.globalMod", value: "-10" }] }, { id: "own", changes: [{ key: "system.mods.globalMod", value: "-10" }, { key: "system.mods.iniMod", value: "1" }] }] };
    const stare = { type: "aspect", name: "Basilisk Stare", system: { condition: "none", landingRule: "none" }, effects: [] };

    expect(_ep295_replacedBlueprints(spam, catalogue)).toEqual(["old"]);
    expect(_ep295_replacedBlueprints(stare, catalogue)).toEqual([]);
    expect(_ep285_sleightUpdate(stare, catalogue).update).toEqual({ "system.condition": "incapacitated", "system.landingRule": "eyeContact" });
  });
});
