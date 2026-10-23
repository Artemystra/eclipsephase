import { registerTargetedAttackHooks, applyTargetedAttack, rollDefence, yieldDefence, defenceDataset, attackPicking } from "../../module/rolls/attacks.js";
import { registerChemicalAttacks, registerDoseHooks } from "../../module/common/doses.js";
import { registerWeaponAttacks, rollAttackDamage } from "../../module/rolls/damage.js";
import { registerSleightAttacks, detectSleightAttack, sleightModifiers, PSI_CURSOR, PSI_UNSUITABLE } from "../../module/rolls/psi.js";
import { targetKinds, CYBERBRAIN_MARKER } from "../../module/common/morp-functions.js";
import { _ep28_missingPsiArmorMarker } from "../../module/common/migration.js";
import { RollCheck } from "../../module/rolls/dice.js";
import { resetStrainFamilies, registerCoreStrainFamilies } from "../../module/rolls/strain-families.js";
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
 * A goon async knowing the compendium's Psychic Stab, Nightmare and a gamma sleight without
 * damage. A goon is used so the psi test is not followed by an Infection Test, which is not what
 * these tests are about.
 * @returns {Actor} The async
 */
function async() {
  const stab = { ...loadPackItem("psi-sleights/Psychic_Stab_tBGTxks2mjQgtmDL.json"), _id: "stab1" };
  const nightmare = { ...loadPackItem("psi-sleights/Nightmare_49Rrz2AKFuFFaFPR.json"), _id: "night1" };
  const sense = { _id: "sense1", name: "Sense", type: "aspect", system: { psiType: "gamma", strainFamily: "psi", infection: 0, damage: { d10: 0, d6: 0, bonus: 0 } } };
  return makeActor({ type: "goon", name: "Async", system: { aptitudes: { wil: { value: 20 } } }, items: [stab, nightmare, sense] });
}

/**
 * A target in a biomorph of WIL 15, carrying Psi Armor when asked.
 * @param {String} name - Its name
 * @param {Object} [options] - psiArmor: knows the Psi Armor sleight; morph: "bio" or "synth"
 * @returns {Actor} The target
 */
function mind(name, { psiArmor = false, morph = "bio" } = {}) {
  const items = [{ _id: "morph1", name: "Morph", type: "morph", system: { type: morph, dur: 30 } }];
  if (psiArmor) items.push({ ...loadPackItem("psi-sleights/Psi_Armor_3jo1yxsTs5wwsn06.json"), _id: "armor1" });
  return makeActor({ type: "character", name, system: { activeMorph: "morph1", aptitudes: { wil: { value: 15 } } }, items });
}

/**
 * Casts a sleight with the d100 showing the given value.
 * @param {Actor} actor - The async
 * @param {String} itemid - The sleight
 * @param {Number} die - The d100 result
 * @param {Object} [options] - Further dialog options, e.g. push or preTargets
 * @returns {Promise<Object>} The psi test's card
 */
async function cast(actor, itemid, die, options = {}) {
  seedRolls([die]);
  await RollCheck({ name: "Psi", key: "psi", type: "psi", rollvalue: 70, itemid, pooltype: "Moxie" }, actor.system, actor, { skipDialog: true, presetOptions: { ...PUBLIC, ...options } }, null, "psiSleight");
  return createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack).at(-1);
}

/**
 * The defence cards posted so far.
 * @returns {Object[]} The cards
 */
function defenceCards() {
  return createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence"));
}

/**
 * The damage cards posted so far.
 * @returns {Object[]} The cards
 */
function damageCards() {
  return createdMessages.filter(message => message.getFlag?.("eclipsephase", "damageCard"));
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

describe("a psi-gamma sleight used on someone", () => {
  test("a damaging sleight is a damage attack, resisted with WIL, picked with the lightning, unable to reach a synthmorph", async () => {
    const card = await cast(async(), "stab1", 30);

    expect(card.getFlag("eclipsephase", "roll").targetedAttack).toMatchObject({ effect: "damage", defence: "will", targets: 1, cursor: PSI_CURSOR, unsuitable: PSI_UNSUITABLE, payload: { armorUsed: "mental", damageTarget: "physical" } });
  });

  test("a sleight without damage is an attack all the same, whose outcome stays on the cards", async () => {
    const card = await cast(async(), "sense1", 30);

    expect(card.getFlag("eclipsephase", "roll").targetedAttack).toMatchObject({ effect: "sleight", defence: "will" });
  });

  test("Additional Target reaches two, Power halves the WIL resisting it, Penetration halves mental armour", () => {
    const actor = async();
    const context = push => ({ rolledFrom: "psiSleight", actor, dataset: { itemid: "stab1" }, options: { push } });

    expect(detectSleightAttack(context("target"), { damaging: true }).targets).toBe(2);
    expect(detectSleightAttack(context("power"), { damaging: true }).payload.halveWill).toBe(true);
    expect(detectSleightAttack(context("penetration"), { damaging: true }).payload.armorPiercing).toBe(true);
    expect(detectSleightAttack(context(""), { damaging: false })).toBeNull();
  });

  test("the dialog picks one target, two with Additional Target, and refuses a synthmorph", () => {
    const picking = attackPicking({ rolledFrom: "psiSleight", actor: async(), dataset: { itemid: "stab1" } });

    expect(picking.count({ elements: { push: { value: "" } } })).toBe(1);
    expect(picking.count({ elements: { push: { value: "target" } } })).toBe(2);
    expect(picking.refuse({ actor: mind("Bot", { morph: "synth" }) })).toContain("ep2e.targeting.unsuitable");
    expect(picking.refuse({ actor: mind("Ana") })).toBeNull();
  });

  test("touch adds +20, a target running a cyberbrain -30", () => {
    const actor = async();
    const brain = { _id: "brain1", name: "Cyberbrain", type: "ware", system: { boundTo: "morph1" }, effects: [{ name: "Cyberbrain", disabled: true, changes: [{ key: CYBERBRAIN_MARKER, value: "true", type: "override" }] }] };
    const pod = makeActor({ type: "character", name: "Pod", system: { activeMorph: "morph1" }, items: [{ _id: "morph1", name: "Pod", type: "morph", system: { type: "bio" } }, brain] });

    const modifiers = sleightModifiers({ rolledFrom: "psiSleight", actor, dataset: { itemid: "stab1" }, options: { psiTouch: true, preTargets: pod.uuid } }, targetKinds);

    expect(modifiers.map(modifier => modifier.value)).toEqual([20, -30]);
  });

  test("the target resists with WIL, on half of it against Power", () => {
    const target = mind("Ana");

    expect(defenceDataset(target, { payload: {} }, "will")).toMatchObject({ apttype: "wil", rollvalue: target.system.aptitudes.wil.roll, pooltype: "Moxie" });
    expect(defenceDataset(target, { payload: { halveWill: true } }, "will").rollvalue).toBe(Math.floor(target.system.aptitudes.wil.roll / 2));
  });
});

describe("what a psi attack does to its targets", () => {
  test("a target who does not resist is struck without a roll, and the damage card follows", async () => {
    const ana = mind("Ana");
    const card = await cast(async(), "stab1", 30);
    await applyTargetedAttack(card, { pick: async () => [{ actor: ana }], confirm: async () => true });

    await yieldDefence(defenceCards().at(-1), ana.uuid);
    await until(() => damageCards().length);

    expect(defenceCards().at(-1).getFlag("eclipsephase", "attackDefence").entries[0].outcome).toBe("hit");
    expect(damageCards()).toHaveLength(1);
  });

  test("a willing target gets no defence card at all, and the damage card follows at once", async () => {
    const ana = mind("Ana");
    const card = await cast(async(), "stab1", 30, { willing: true });
    await applyTargetedAttack(card, { pick: async () => [{ actor: ana }], confirm: async () => true });
    await until(() => damageCards().length);

    expect(defenceCards()).toHaveLength(0);
    expect(damageCards()).toHaveLength(1);
  });

  test("a defender who wins with a critical success locks the async out", async () => {
    const ana = mind("Ana");
    const card = await cast(async(), "stab1", 30);
    await applyTargetedAttack(card, { pick: async () => [{ actor: ana }], confirm: async () => true });
    seedRolls([33]);

    await rollDefence(defenceCards().at(-1), ana.uuid, "will", { skipDialog: true, presetOptions: PUBLIC });
    await until(() => defenceCards().at(-1).getFlag("eclipsephase", "attackDefence").entries[0].outcome);

    expect(defenceCards().at(-1).getFlag("eclipsephase", "attackDefence").entries[0]).toMatchObject({ outcome: "none", lockedOut: true });
    expect(defenceCards().at(-1).content).toContain("ep2e.chat.defence.lockedOut");
  });

  test("Psychic Stab's damage meets the target's mental armour, WIL / 3 from Psi Armor", async () => {
    const ana = mind("Ana", { psiArmor: true });
    const card = await cast(async(), "stab1", 30, { willing: true });
    await applyTargetedAttack(card, { pick: async () => [{ actor: ana }], confirm: async () => true });
    await until(() => damageCards().length);
    seedRolls([7, 8]);

    const total = await rollAttackDamage(damageCards()[0]);

    expect(ana.system.mental.armorTotal).toBe(5);
    expect(ana.system.health.physical.value).toBe(Math.max(0, total - 5));
    expect(damageCards()[0].content).toContain("ep2e.chat.damage.attackHit");
  });

  test("Nightmare's damage is stress on the mind", async () => {
    const ana = mind("Ana");
    const card = await cast(async(), "night1", 30, { willing: true });
    await applyTargetedAttack(card, { pick: async () => [{ actor: ana }], confirm: async () => true });
    await until(() => damageCards().length);
    seedRolls([3, 4]);

    const total = await rollAttackDamage(damageCards()[0]);

    expect(ana.system.health.mental.value).toBe(total);
    expect(ana.system.health.physical.value).toBe(0);
    expect(damageCards()[0].content).toContain("ep2e.chat.damage.amountStress");
  });

  test("a sleight without damage posts no damage card, its outcome stays on the cards", async () => {
    const ana = mind("Ana");
    const card = await cast(async(), "sense1", 30);
    await applyTargetedAttack(card, { pick: async () => [{ actor: ana }], confirm: async () => true });

    await yieldDefence(defenceCards().at(-1), ana.uuid);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(card.getFlag("eclipsephase", "taskCard").targets[0].outcome).toBe("hit");
    expect(damageCards()).toHaveLength(0);
    expect(defenceCards().at(-1).content).toContain("ep2e.chat.defence.outcome.will.hit");
    expect(card.content).toContain("ep2e.chat.defence.outcome.will.hit");
  });
});

describe("the Psi Armor sleight's marker", () => {
  test("a Psi Armor sleight from before 2.8 gets the marker, one that has it does not", () => {
    const old = { type: "aspect", name: "Psi Armor", effects: [] };
    const current = loadPackItem("psi-sleights/Psi_Armor_3jo1yxsTs5wwsn06.json");

    expect(_ep28_missingPsiArmorMarker(old).changes).toEqual([expect.objectContaining({ key: "system.mods.psiArmor", value: "true" })]);
    expect(_ep28_missingPsiArmorMarker({ ...current, effects: current.effects.map(effect => ({ ...effect, changes: effect.system.changes })) })).toBeNull();
    expect(_ep28_missingPsiArmorMarker({ type: "aspect", name: "Psychic Stab", effects: [] })).toBeNull();
  });
});
