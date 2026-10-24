import { registerTargetedAttackHooks, applyTargetedAttack, rollDefence, attackFor, exposureModifiers } from "../../module/rolls/attacks.js";
import { registerChemicalAttacks, registerDoseHooks } from "../../module/common/doses.js";
import { JSDOM } from "jsdom";
import { registerWeaponAttacks, detectWeaponAttack, damageAgainst, armorAgainst, rollAttackDamage, attackDamageLine } from "../../module/rolls/damage.js";
import { MELEE_CURSOR, wirePreRollTargets } from "../../module/common/targeting.js";
import { weaponPreparation, attackTargetCount, coneDamage, ANY_TARGETS } from "../../module/common/weapon-functions.js";
import { weaponDamage } from "../../module/rolls/damage.js";
import { attackPicking } from "../../module/rolls/attacks.js";
import { RollCheck } from "../../module/rolls/dice.js";
import { makeActor, resetWorld, seedRolls, loadPackItem } from "../setup/factories.js";

const { createdMessages } = global.__ep;
const SINGLE_SHOT = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, attackMode: "single" } };
const DODGE = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, rangedFray: true, behindCover: false } };

/**
 * Waits until a condition holds, for work a hook starts without awaiting. Gives up after a second.
 * @param {Function} predicate - Checked after every tick
 * @returns {Promise<void>} Resolves once the predicate holds
 */
async function until(predicate) {
  for (let tick = 0; tick < 200 && !predicate(); tick++) await new Promise(resolve => setTimeout(resolve, 5));
}

/**
 * A character holding a compendium weapon, ready to fire.
 * @param {String} file - The weapon's source file in the weapons compendium
 * @returns {Actor} The attacker
 */
function armed(file) {
  const weapon = { ...loadPackItem(`weapons/${file}`), _id: "gun1" };
  weapon.system = { ...weapon.system, active: true, ammoMin: 10 };
  return makeActor({ type: "character", name: "Shooter", system: { aptitudes: { ref: { value: 15 } } }, items: [weapon] });
}

/**
 * An NPC in armour, whose armour always counts.
 * @param {String} name - Its name
 * @param {Object} [armor] - energy and kinetic values
 * @returns {Actor} The target
 */
function armoured(name, armor = { energy: 2, kinetic: 6 }) {
  return makeActor({
    type: "npc",
    name,
    system: { aptitudes: { ref: { value: 10 }, som: { value: 15 } }, skillsVig: { fray: { value: 10 } } },
    items: [{ _id: "vest1", name: "Vest", type: "armor", system: armor }]
  });
}

/**
 * Attacks with the weapon, the d100 showing the given value.
 * @param {Actor} actor - The attacker
 * @param {String} rolledFrom - "rangedWeapon" or "ccWeapon"
 * @param {Number} die - The d100 result
 * @returns {Promise<Object>} The attack card
 */
async function attack(actor, rolledFrom, die) {
  const skill = rolledFrom === "ccWeapon" ? "melee" : "guns";
  const weapon = await weaponPreparation(actor, skill, rolledFrom, "gun1");
  seedRolls([die]);
  await RollCheck({ type: "skill", key: skill, name: skill, rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, SINGLE_SHOT, weapon, rolledFrom);
  return createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack).at(-1);
}

/**
 * The damage cards posted so far.
 * @returns {Object[]} The cards
 */
function damageCards() {
  return createdMessages.filter(message => message.getFlag?.("eclipsephase", "damageCard"));
}

/**
 * The attack's target defends with the d100 showing the given value.
 * @param {Actor} target - The defender
 * @param {Number} die - The d100 result
 * @returns {Promise<void>} Resolves once the defence is settled on the attack card
 */
async function defend(target, die) {
  const card = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);
  seedRolls([die]);
  await rollDefence(card, target.uuid, "dodge", DODGE);
}

beforeAll(() => {
  registerChemicalAttacks();
  registerWeaponAttacks();
});

beforeEach(() => {
  resetWorld();
  registerDoseHooks();
  registerTargetedAttackHooks();
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("what one target takes of an attack's damage", () => {
  test.each([
    ["a hit takes it all, less the armour", 14, "hit", 6, false, { share: 14, armor: 6, dealt: 8 }],
    ["a partial dodge halves it, rounding up", 13, "half", 2, false, { share: 7, armor: 2, dealt: 5 }],
    ["armour piercing halves the armour, rounding up", 14, "hit", 7, true, { share: 14, armor: 4, dealt: 10 }],
    ["armour above the damage leaves none", 5, "hit", 9, false, { share: 5, armor: 9, dealt: 0 }]
  ])("%s", (_, total, outcome, armor, piercing, expected) => {
    expect(damageAgainst(total, outcome, armor, piercing)).toEqual(expected);
  });

  test("the armour counted is the kind the damage meets, and none for damage no armour stops", () => {
    const target = armoured("Vest NPC");

    expect(armorAgainst(target, "kinetic")).toBe(6);
    expect(armorAgainst(target, "energy")).toBe(2);
    expect(armorAgainst(target, "none")).toBe(0);
  });
});

describe("what the damage card says about each target", () => {
  const RESULT = { share: 14, armor: 6, armorUsed: "kinetic", wounds: 1 };

  test("for a struck target, its owners and the GMs get the reckoning, everyone else only that damage got through", () => {
    const line = attackDamageLine({ uuid: "Actor.bo", name: "Bo", outcome: "hit" }, { ...RESULT, taken: 8 });

    expect(line).toEqual({ uuid: "Actor.bo", detail: expect.stringContaining("ep2e.chat.damage.attackHit"), summary: expect.stringContaining("ep2e.chat.damage.attackTookDamage") });
  });

  test("when the armour soaks it all, everyone else hears exactly that", () => {
    const line = attackDamageLine({ uuid: "Actor.bo", name: "Bo", outcome: "half" }, { ...RESULT, taken: 0 });

    expect(line.detail).toContain("ep2e.chat.damage.attackHalf");
    expect(line.summary).toContain("ep2e.chat.damage.attackSoaked");
  });

  test("a target that got away is named for everyone, as dodged or parried", () => {
    expect(attackDamageLine({ uuid: "Actor.bo", name: "Bo", outcome: "none", kind: "dodge" })).toContain("ep2e.chat.damage.attackMissed");
    expect(attackDamageLine({ uuid: "Actor.bo", name: "Bo", outcome: "none", kind: "parry" })).toContain("ep2e.chat.damage.attackParried");
  });
});

describe("which weapon rolls are attacks on targets", () => {
  test("a ranged weapon's hit is picked with the crosshair and meets the armour its mode names", async () => {
    const actor = armed("Battle_Laser_cyFRVwMRy0cC2OeW.json");
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");

    const found = detectWeaponAttack({ rolledFrom: "rangedWeapon", weapon, options: {} });

    expect(found).toMatchObject({ targets: 1, area: false, cursor: {}, payload: { armorUsed: "energy", armorPiercing: false } });
  });

  test("a melee weapon's hit is picked with the slash", async () => {
    const actor = armed("Knife_PmMMe4WzKsEXpsAo.json");
    const weapon = await weaponPreparation(actor, "melee", "ccWeapon", "gun1");

    expect(detectWeaponAttack({ rolledFrom: "ccWeapon", weapon, options: {} }).cursor).toEqual(MELEE_CURSOR);
  });

  test("an attack whose dialog picked no targets has none picked before the roll, one that did has them", async () => {
    const actor = armed("Medium_Pistol_yWrFfONiXTuWWPpz.json");
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");
    const context = options => ({ rolledFrom: "rangedWeapon", weapon, actor, dataset: {}, flags: {}, options });

    expect(attackFor(context({ attackMode: "single", preTargets: false })).preTargets).toBeUndefined();
    expect(attackFor(context({ attackMode: "single", preTargets: "Actor.ana" })).preTargets).toEqual(["Actor.ana"]);
  });

  test("a touch that deals no damage, or a roll without a weapon, is no attack on a target", async () => {
    const actor = armed("Knife_PmMMe4WzKsEXpsAo.json");
    const weapon = await weaponPreparation(actor, "melee", "ccWeapon", "gun1");

    expect(detectWeaponAttack({ rolledFrom: "ccWeapon", weapon, options: { touchOnly: true } })).toBeNull();
    expect(detectWeaponAttack({ rolledFrom: "ccWeapon", weapon: null, options: {} })).toBeNull();
    expect(detectWeaponAttack({ rolledFrom: "skill", weapon, options: {} })).toBeNull();
  });
});

describe("a weapon attack on a target", () => {
  test("a hit rolled without targets offers only the damage, as a narrative roll does", async () => {
    const card = await attack(armed("Medium_Pistol_yWrFfONiXTuWWPpz.json"), "rangedWeapon", 30);

    expect(card.getFlag("eclipsephase", "roll").targetedAttack.effect).toBe("damage");
    expect(card.content).not.toContain("data-action=\"targetedAttack\"");
    expect(card.content).toContain("data-action=\"weaponDamage\"");
  });

  test("no damage card follows while a target has still to defend, nor when they got away", async () => {
    const target = armoured("Bo");
    const card = await attack(armed("Medium_Pistol_yWrFfONiXTuWWPpz.json"), "rangedWeapon", 5);
    await applyTargetedAttack(card, { pick: async () => [{ actor: target }], confirm: async () => true });

    expect(damageCards()).toHaveLength(0);

    await defend(target, 8);
    await until(() => card.getFlag("eclipsephase", "taskCard").targets?.[0]?.outcome);

    expect(card.getFlag("eclipsephase", "taskCard").targets[0].outcome).toBe("none");
    expect(damageCards()).toHaveLength(0);
  });

  test("once the target is struck, a damage card follows the defence, seen as the attack was, with the button to roll", async () => {
    const target = armoured("Bo");
    const card = await attack(armed("Medium_Pistol_yWrFfONiXTuWWPpz.json"), "rangedWeapon", 30);
    await applyTargetedAttack(card, { pick: async () => [{ actor: target }], confirm: async () => true });
    await defend(target, 95);
    await until(() => damageCards().length);

    const damageCard = damageCards()[0];
    expect(createdMessages.indexOf(damageCard)).toBe(createdMessages.length - 1);
    expect(damageCard.content).toContain("data-action=\"attackDamage\"");
    expect(damageCard.getFlag("eclipsephase", "damageCard").targets).toEqual([expect.objectContaining({ uuid: target.uuid, outcome: "hit" })]);
    expect(card.content).not.toContain("data-action=\"attackDamage\"");
  });

  test("a struck target takes the one damage roll less its armour, and the damage card turns into the roll and says so", async () => {
    const target = armoured("Bo");
    const card = await attack(armed("Medium_Pistol_yWrFfONiXTuWWPpz.json"), "rangedWeapon", 30);
    await applyTargetedAttack(card, { pick: async () => [{ actor: target }], confirm: async () => true });
    await defend(target, 95);
    await until(() => damageCards().length);
    const damageCard = damageCards()[0];
    const posted = createdMessages.length;

    seedRolls([9, 5]);
    const total = await rollAttackDamage(damageCard);

    expect(createdMessages).toHaveLength(posted);
    expect(damageCard.getFlag("eclipsephase", "damageCard").data.total).toBe(total);
    expect(target.system.health.physical.value).toBe(Math.max(0, total - 6));
    expect(damageCard.getFlag("eclipsephase", "damageCard").lines).toHaveLength(1);
    expect(damageCard.content).toContain("ep2e.chat.damage.attackHit");
    expect(damageCard.content).toContain(`notForOwnerControl" data-actor-uuid="${target.uuid}"`);
    expect(damageCard.content).not.toContain("data-action=\"attackDamage\"");
  });

  test("a melee defence remembers that the target parried, for the damage card to name", async () => {
    const ana = armoured("Ana");
    const actor = armed("Knife_PmMMe4WzKsEXpsAo.json");
    const weapon = await weaponPreparation(actor, "melee", "ccWeapon", "gun1");
    seedRolls([30]);
    await RollCheck({ type: "skill", key: "melee", name: "melee", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, SINGLE_SHOT, weapon, "ccWeapon");
    const card = createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack).at(-1);
    await applyTargetedAttack(card, { pick: async () => [{ actor: ana }], confirm: async () => true });
    const defence = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);
    seedRolls([95]);
    await rollDefence(defence, ana.uuid, "parry", DODGE);
    await until(() => card.getFlag("eclipsephase", "taskCard").targets?.[0]?.outcome);

    expect(card.getFlag("eclipsephase", "taskCard").targets[0]).toMatchObject({ outcome: "hit", kind: "parry" });
  });

  test("the damage is rolled once only", async () => {
    const target = armoured("Bo");
    const card = await attack(armed("Medium_Pistol_yWrFfONiXTuWWPpz.json"), "rangedWeapon", 30);
    await applyTargetedAttack(card, { pick: async () => [{ actor: target }], confirm: async () => true });
    await defend(target, 95);
    await until(() => damageCards().length);
    seedRolls([9, 5]);
    await rollAttackDamage(damageCards()[0]);

    expect(await rollAttackDamage(damageCards()[0])).toBeNull();
  });

  test("a defence follows the attack's visibility: a private attack's defence is whispered, not public", async () => {
    const target = armoured("Bo");
    const actor = armed("Medium_Pistol_yWrFfONiXTuWWPpz.json");
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");
    seedRolls([30]);
    await RollCheck({ type: "skill", key: "guns", name: "guns", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { ...SINGLE_SHOT.presetOptions, rollMode: "private" } }, weapon, "rangedWeapon");
    const card = createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack).at(-1);
    await applyTargetedAttack(card, { pick: async () => [{ actor: target }], confirm: async () => true });

    await defend(target, 95);

    const defenceRoll = createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.attackDefence).at(-1);
    expect(card.whisper.length).toBeGreaterThan(0);
    expect(defenceRoll.whisper).toEqual(expect.arrayContaining(card.whisper));
  });

  test("suppressive fire takes any number of targets after the roll, without asking about fewer", async () => {
    const actor = armed("Medium_Pistol_yWrFfONiXTuWWPpz.json");
    await actor.items.get("gun1").update({ "system.ammoMin": 20, "system.ammoMax": 20 });
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");
    seedRolls([30]);
    await RollCheck({ type: "skill", key: "guns", name: "guns", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { ...SINGLE_SHOT.presetOptions, attackMode: "suppressive" } }, weapon, "rangedWeapon");
    const card = createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack).at(-1);
    const pick = jest.fn(async () => [{ actor: armoured("Ana") }]);
    const confirm = jest.fn(async () => true);

    const stored = card.getFlag("eclipsephase", "roll").targetedAttack;
    expect(JSON.parse(JSON.stringify(stored)).targets).toBe(stored.targets);

    await applyTargetedAttack(card, { pick, confirm });

    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ multi: true, max: Infinity }));
    expect(confirm).not.toHaveBeenCalled();
  });

  test("a defence is measured against the attack as its card shows it now, a die swapped after the targets were chosen included", async () => {
    const target = armoured("Bo");
    const card = await attack(armed("Medium_Pistol_yWrFfONiXTuWWPpz.json"), "rangedWeapon", 50);
    await applyTargetedAttack(card, { pick: async () => [{ actor: target }], confirm: async () => true });
    await card.update({ "flags.eclipsephase.taskCard.data.rollResult": 5 });

    await defend(target, 8);
    await until(() => card.getFlag("eclipsephase", "taskCard").targets?.[0]?.outcome);

    expect(card.getFlag("eclipsephase", "taskCard").targets[0].outcome).toBe("none");
  });

  test("the pool controls stay on the attack card until a target has defended", async () => {
    const target = armoured("Bo");
    const actor = armed("Medium_Pistol_yWrFfONiXTuWWPpz.json");
    await actor.update({ "system.pools.vigor.value": 2 });
    const card = await attack(actor, "rangedWeapon", 50);
    await applyTargetedAttack(card, { pick: async () => [{ actor: target }], confirm: async () => true });

    expect(card.content).toContain("data-usepool");

    await defend(target, 95);
    await until(() => card.getFlag("eclipsephase", "taskCard").targets?.[0]?.outcome);

    expect(card.content).not.toContain("data-usepool");
  });

  test("a hit by a chemical weapon stays a dose, not damage", async () => {
    const sprayer = { ...loadPackItem("weapons/Sprayer_VtPETs2TTFaeEec7.json"), _id: "gun1" };
    sprayer.system = { ...sprayer.system, active: true, ammoMin: 15 };
    const actor = makeActor({ type: "character", system: { aptitudes: { ref: { value: 15 } } }, items: [sprayer] });

    const card = await attack(actor, "rangedWeapon", 19);

    expect(card.getFlag("eclipsephase", "roll").targetedAttack.effect).toBe("dose");
  });
});

describe("how many targets a ranged attack strikes", () => {
  const shredder = { type: "rangedWeapon", system: { ammoType: "spray" } };
  const rifle = { type: "rangedWeapon", system: { ammoType: "kinetic" } };

  test.each([
    ["a cone at close range reaches one target", shredder, { range: "none" }, 1],
    ["a cone at range reaches two", shredder, { range: "range" }, 2],
    ["a cone beyond range reaches three", shredder, { range: "beyond+" }, 3],
    ["a burst at two targets strikes two", rifle, { attackMode: "burstTargets" }, 2],
    ["full auto at three targets strikes three", rifle, { attackMode: "fullAutoTargets" }, 3],
    ["a concentrated burst strikes one", rifle, { attackMode: "burst" }, 1],
    ["suppressive fire strikes anyone who breaks cover", rifle, { attackMode: "suppressive" }, ANY_TARGETS]
  ])("%s", (_, weapon, options, expected) => {
    expect(attackTargetCount(weapon, options)).toBe(expected);
  });

  test("a cone adds a d10 close up and loses one beyond range; other weapons neither", () => {
    expect([coneDamage(shredder, "pointBlank"), coneDamage(shredder, "none"), coneDamage(shredder, "range"), coneDamage(shredder, "beyond")]).toEqual(["+1d10", "+1d10", "", "-1d10"]);
    expect(coneDamage(rifle, "none")).toBe("");
  });

  test("a cone strikes as an area, at targets within a meter of each other", async () => {
    const actor = armed("Shredder_Ld92RSqzeF4zQQwf.json");
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");

    expect(detectWeaponAttack({ rolledFrom: "rangedWeapon", weapon, options: { range: "range" } })).toMatchObject({ targets: 2, area: true, within: 1 });
  });

  test("a cone's damage at close range has the extra d10", async () => {
    const actor = armed("Shredder_Ld92RSqzeF4zQQwf.json");
    const context = { actorUuid: actor.uuid, rolledFrom: "rangedWeapon", item: { weaponId: "gun1", weaponMode: "1" }, options: { attackMode: "single", range: "none" } };

    const damage = await weaponDamage(context, 3);

    expect(damage.roll.formula.replace(/\s/g, "")).toBe("2d10+6+1d10");
  });
});

describe("targets picked before the roll", () => {
  const BURST = { skipDialog: true, presetOptions: { ...SINGLE_SHOT.presetOptions, attackMode: "burstTargets" } };

  /**
   * Fires a burst at two targets picked in the dialog.
   * @param {Actor[]} targets - The targets picked
   * @param {Number} die - The d100 result
   * @returns {Promise<Object>} The attack card
   */
  async function burstAt(targets, die) {
    const actor = armed("Medium_Pistol_yWrFfONiXTuWWPpz.json");
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");
    seedRolls([die]);
    const options = { ...BURST, presetOptions: { ...BURST.presetOptions, preTargets: targets.map(target => target.uuid).join(",") } };
    await RollCheck({ type: "skill", key: "guns", name: "Guns", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, options, weapon, "rangedWeapon");
    return createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack).at(-1);
  }

  test("a hit goes to them at once: they get their defence cards and there is no target button", async () => {
    const ana = armoured("Ana");
    const bo = armoured("Bo");

    const card = await burstAt([ana, bo], 30);
    await until(() => card.getFlag("eclipsephase", "roll").targetedAttack.delivered);

    expect(card.getFlag("eclipsephase", "roll").targetedAttack).toMatchObject({ targets: 2, delivered: true, targetNames: ["Ana", "Bo"] });
    expect(createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence"))).toHaveLength(1);
    expect(card.content).not.toContain("data-action=\"targetedAttack\"");
  });

  test("a miss goes to nobody", async () => {
    const card = await burstAt([armoured("Ana"), armoured("Bo")], 95);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(card.getFlag("eclipsephase", "roll").targetedAttack.delivered).toBe(false);
    expect(createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence"))).toHaveLength(0);
  });

  test("a burst at two targets uses three rounds", async () => {
    const actor = armed("Medium_Pistol_yWrFfONiXTuWWPpz.json");
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");
    seedRolls([95]);

    await RollCheck({ type: "skill", key: "guns", name: "Guns", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, BURST, weapon, "rangedWeapon");

    expect(actor.items.get("gun1").system.ammoMin).toBe(7);
  });
});

describe("picking the targets in the attack dialog", () => {
  let realDocument;
  beforeEach(() => {
    realDocument = global.document;
    global.document = new JSDOM("").window.document;
  });
  afterEach(() => { global.document = realDocument; });

  /**
   * An attack dialog's form - mode, range, target field - and its pick button, counting the clicks
   * that reach the dialog.
   * @returns {Object} root, button and counter (submitted: clicks that reached the dialog)
   */
  function dialogRoot() {
    const root = document.createElement("div");
    root.innerHTML = `<form><select name="attackMode"><option value="single">1</option><option value="burstTargets">2</option><option value="suppressive">s</option></select>
      <select name="range"><option value="none">c</option><option value="range">r</option></select>
      <input type="hidden" name="preTargets" value="">
      <button data-action="pickTargets"><i></i><span>Pick</span></button></form>`;
    const button = root.querySelector('button[data-action="pickTargets"]');
    const counter = { submitted: 0 };
    root.addEventListener("click", event => { if (event.target.closest('[data-action="pickTargets"]')) counter.submitted++; });
    return { root, button, counter };
  }

  /**
   * Chooses an option in the dialog.
   * @param {HTMLElement} root - The dialog's root
   * @param {String} name - The field
   * @param {String} value - The value
   * @returns {void}
   */
  function choose(root, name, value) {
    const select = root.querySelector(`select[name="${name}"]`);
    select.value = value;
    select.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
  }

  /**
   * A dialog window that can be closed and shown again.
   * @returns {Object} The element stand-in
   */
  function dialogWindow() {
    return { open: true, style: { display: "" }, matches: () => true, close() { this.open = false; }, showModal() { this.open = true; } };
  }

  const RIFLE = attackPicking({ rolledFrom: "rangedWeapon", weapon: { weapon: { type: "rangedWeapon", system: { ammoType: "kinetic" } } } });
  const SHREDDER = attackPicking({ rolledFrom: "rangedWeapon", weapon: { weapon: { type: "rangedWeapon", system: { ammoType: "spray" } } } });

  test("a roll with no weapon and no attack of its own picks no targets; melee picks one with the slash", () => {
    expect(attackPicking({ rolledFrom: "skill", weapon: null, flags: {} })).toBeNull();
    const melee = attackPicking({ rolledFrom: "ccWeapon", weapon: { weapon: { type: "ccWeapon", system: {} } } });
    expect(melee.cursor).toEqual(MELEE_CURSOR);
    expect(melee.count(null)).toBe(1);
  });

  test("the pick button names one target or several, as the chosen mode and range strike", () => {
    const { root, button } = dialogRoot();
    wirePreRollTargets(root, null, SHREDDER, { pick: async () => null });

    expect(button.querySelector("span").textContent).toBe("ep2e.chat.attack.chooseTarget");
    choose(root, "range", "range");
    expect(button.querySelector("span").textContent).toBe("ep2e.roll.dialog.ranged.attacker.pickTargets");
    expect(button.querySelector("i")).not.toBeNull();
  });

  test("confirming the targets rolls straight away, with them picked and the dialog out of the way", async () => {
    const { root, button, counter } = dialogRoot();
    const element = dialogWindow();
    const pick = jest.fn(async () => [{ actor: { uuid: "Actor.ana" } }, { actor: { uuid: "Actor.bo" } }]);
    wirePreRollTargets(root, { element }, RIFLE, { pick });
    choose(root, "attackMode", "burstTargets");

    button.click();
    await until(() => counter.submitted);

    expect(pick).toHaveBeenCalledWith({ multi: true, max: 2, within: 1, refuse: expect.any(Function) });
    expect(root.querySelector('input[name="preTargets"]').value).toBe("Actor.ana,Actor.bo");
    expect(counter.submitted).toBe(1);
    expect(element.style.display).toBe("none");
  });

  test("suppressive fire picks any number of targets", async () => {
    const { root, button, counter } = dialogRoot();
    const pick = jest.fn(async () => [{ actor: { uuid: "Actor.ana" } }]);
    wirePreRollTargets(root, null, RIFLE, { pick });
    choose(root, "attackMode", "suppressive");

    button.click();
    await until(() => counter.submitted);

    expect(pick).toHaveBeenCalledWith({ multi: true, max: Infinity, within: null, refuse: expect.any(Function) });
  });

  test("picked targets are measured from the attacker's token, and the farthest one's category becomes the dialog's distance", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<form><select name="attackMode"><option value="single">1</option></select>
      <select name="range"><option value="pointBlank">p</option><option value="none">c</option><option value="range">r</option><option value="beyond">b</option><option value="beyond+">b+</option></select>
      <input type="hidden" name="preTargets" value=""><input type="hidden" name="measuredRanges" value="">
      <button data-action="pickTargets"><span>Pick</span></button></form>`;
    const button = root.querySelector("button");
    let submitted = 0;
    root.addEventListener("click", event => { if (event.target.closest("button")) submitted++; });
    const square = x => ({ x, y: 0, width: 100, height: 100 });
    const shooter = { bounds: square(0) };
    const rifle = attackPicking({ rolledFrom: "rangedWeapon", weapon: { weapon: { type: "rangedWeapon", system: { ammoType: "kinetic", mode1: { range: 50 } } }, weaponMode: "1" } });
    global.canvas = { grid: { size: 100, distance: 1 } };
    try {
      wirePreRollTargets(root, null, { ...rifle, measure: () => ({ from: shooter, describe: () => "" }) }, { pick: async () => [{ actor: { uuid: "Actor.ana" }, bounds: square(6100) }, { actor: { uuid: "Actor.bo" }, bounds: square(300) }] });

      button.click();
      await until(() => submitted);
    } finally {
      delete global.canvas;
    }

    expect(root.querySelector('input[name="measuredRanges"]').value).toBe("60,2");
    expect(root.querySelector('select[name="range"]').value).toBe("beyond");
  });

  test("cancelling, or too few for the mode, brings the dialog back without rolling", async () => {
    const { root, button, counter } = dialogRoot();
    const element = dialogWindow();
    let answer = null;
    wirePreRollTargets(root, { element }, RIFLE, { pick: async () => answer });
    choose(root, "attackMode", "burstTargets");

    button.click();
    await until(() => element.open);
    answer = [{ actor: { uuid: "Actor.ana" } }];
    button.click();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(counter.submitted).toBe(0);
    expect(element.open).toBe(true);
    expect(element.style.display).toBe("");
    expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("ep2e.targeting.tooFew"));
  });
});

describe("a measured ranged attack", () => {
  /**
   * Fires a medium pistol at a target measured at a distance, with the d100 showing 30 and the damage dice 5.
   * @param {String} measuredRanges - The dialog's measured distances
   * @param {Object} [options] - Further dialog values, e.g. range or vacuum
   * @returns {Promise<Object>} The attack card
   */
  async function shoot(measuredRanges, options = {}) {
    const actor = armed("Medium_Pistol_yWrFfONiXTuWWPpz.json");
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");
    seedRolls([30]);
    await RollCheck({ type: "skill", key: "guns", name: "guns", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { ...SINGLE_SHOT.presetOptions, measuredRanges, ...options } }, weapon, "rangedWeapon");
    return createdMessages.filter(message => message.getFlag?.("eclipsephase", "taskCard")).at(-1);
  }

  /**
   * The modifiers a card's roll carried.
   * @param {Object} card - The attack card
   * @returns {Object[]} text and value per modifier
   */
  function modifiersOf(card) {
    return card.getFlag("eclipsephase", "taskCard").data.modifiers.map(modifier => ({ text: String(modifier.text), value: Number(modifier.value) }));
  }

  test("the farthest target's distance sets the modifier by the book, uncapped, in place of the chosen distance", async () => {
    const card = await shoot("12,140", { range: "range" });

    const ranged = modifiersOf(card).filter(modifier => /combat\.ranged\.(measured|range|beyond)/.test(modifier.text));
    expect(ranged).toEqual([{ text: expect.stringMatching(/ranged\.measured.*"distance":140/), value: -50 }]);
  });

  test("a prone defender at 10 m or more costs another -10; at point-blank the measured distance gives +10", async () => {
    expect(modifiersOf(await shoot("15", { prone: true }))).toEqual(expect.arrayContaining([{ text: "ep2e.roll.announce.combat.ranged.proneAtRange", value: -10 }]));
    expect(modifiersOf(await shoot("1")).filter(modifier => modifier.text.includes("combat.ranged.measured")).map(modifier => modifier.value)).toEqual([10]);
  });

  test("a kinetic weapon's damage beyond range has a d10 less, unless in vacuum", async () => {
    const base = { rolledFrom: "rangedWeapon", item: { weaponId: "gun1", weaponMode: "1" }, options: { attackMode: "single" } };
    const actor = armed("Medium_Pistol_yWrFfONiXTuWWPpz.json");
    const formula = async options => {
      seedRolls([5, 5, 5]);
      const result = await weaponDamage({ ...base, actorUuid: actor.uuid, options: { ...base.options, ...options } }, 3);
      return result.roll.formula;
    };

    expect(await formula({ range: "beyond" })).toMatch(/^1d10\b/);
    expect(await formula({ range: "beyond", vacuum: true })).toMatch(/^2d10\b/);
    expect(await formula({ range: "range" })).toMatch(/^2d10\b/);
  });
});

describe("an aggressive melee attack leaves the attacker open", () => {
  /**
   * Attacks in melee in the given mode, with or without a combat under way.
   * @param {String} attackMode - The mode chosen in the dialog
   * @param {Boolean} inCombat - Whether a combat has started
   * @returns {Promise<Object>} The attacker and the attack card
   */
  async function lunge(attackMode, inCombat) {
    const actor = armed("Knife_PmMMe4WzKsEXpsAo.json");
    const weapon = await weaponPreparation(actor, "melee", "ccWeapon", "gun1");
    game.combat = inCombat ? { started: true } : null;
    seedRolls([30]);
    await RollCheck({ type: "skill", key: "melee", name: "melee", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { ...SINGLE_SHOT.presetOptions, attackMode } }, weapon, "ccWeapon");
    await until(() => Array.from(actor.effects).length || !inCombat);
    return { actor, card: createdMessages.filter(message => message.getFlag?.("eclipsephase", "taskCard")).at(-1) };
  }

  afterEach(() => { game.combat = null; });

  test.each(["aggressive", "aggressiveCharge"])("during combat, %s gives -10 on Fray for one action turn, named after the attack", async attackMode => {
    const { actor } = await lunge(attackMode, true);

    const [state] = Array.from(actor.effects);
    expect(state.duration).toMatchObject({ value: 1, units: "rounds", expiry: "turnStart" });
    expect(state.name).toContain("ep2e.roll.announce.combat.melee.agressive");

    seedRolls([50]);
    await RollCheck({ type: "skill", key: "fray", name: "Fray", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } }, null, "skill");
    const fray = createdMessages.at(-1).getFlag("eclipsephase", "taskCard").data;
    expect(JSON.stringify(fray)).toContain(state.name);
  });

  test("the penalty is named on the Fray test only, and no longer once the state has run out", async () => {
    const { actor } = await lunge("aggressive", true);
    const [state] = Array.from(actor.effects);

    expect(exposureModifiers(actor, { key: "fray" })).toEqual([{ text: state.name, value: -10 }]);
    expect(exposureModifiers(actor, { key: "melee" })).toEqual([]);
    await state.update({ "duration.expired": true });
    expect(exposureModifiers(actor, { key: "fray" })).toEqual([]);
  });

  test("outside combat the scene is narrative, and the attacker stays as they were", async () => {
    const { actor } = await lunge("aggressive", false);

    expect(Array.from(actor.effects)).toHaveLength(0);
  });

  test("a charge leaves the attacker open to nothing", async () => {
    const { actor } = await lunge("charge", true);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(Array.from(actor.effects)).toHaveLength(0);
  });

  test("the attack itself shows no Fray penalty: an aggressive hit +10, a ruthless attack no modifier at all", async () => {
    const aggressive = (await lunge("aggressive", false)).card.getFlag("eclipsephase", "taskCard").data;
    const ruthless = (await lunge("aggressiveCharge", false)).card.getFlag("eclipsephase", "taskCard").data;

    expect(JSON.stringify(aggressive)).not.toContain("agressiveAddition");
    expect(JSON.stringify(aggressive)).toContain("ep2e.roll.announce.combat.melee.agressive");
    expect(JSON.stringify(ruthless)).not.toContain("ep2e.roll.announce.combat.melee.agressiveCharge");
  });
});

describe("a melee attack at several targets", () => {
  test("each target is attacked on its own: one roll and one card each, at that target alone", async () => {
    const ana = armoured("Ana");
    const bo = armoured("Bo");
    const actor = armed("Knife_PmMMe4WzKsEXpsAo.json");
    const weapon = await weaponPreparation(actor, "melee", "ccWeapon", "gun1");
    seedRolls([30, 40]);

    await RollCheck({ type: "skill", key: "melee", name: "melee", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { ...SINGLE_SHOT.presetOptions, attackMode: "none", numberOfTargets: "2", preTargets: `${ana.uuid},${bo.uuid}` } }, weapon, "ccWeapon");
    const cards = createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack);
    await until(() => cards.every(card => card.getFlag("eclipsephase", "roll").targetedAttack.delivered));

    expect(cards).toHaveLength(2);
    expect(cards.map(card => card.getFlag("eclipsephase", "roll").targetedAttack.targetNames)).toEqual([["Ana"], ["Bo"]]);
    expect(new Set(cards.map(card => card.getFlag("eclipsephase", "roll").targetedAttack.id)).size).toBe(2);
  });

  test("a pool point chosen before the roll goes on each attack in turn, until the pool runs dry", async () => {
    const targets = [armoured("Ana"), armoured("Bo"), armoured("Cy")];
    const actor = armed("Knife_PmMMe4WzKsEXpsAo.json");
    await actor.update({ "system.pools.vigor.value": 2 });
    const weapon = await weaponPreparation(actor, "melee", "ccWeapon", "gun1");
    const posted = createdMessages.length;
    seedRolls([30, 40, 50]);

    await RollCheck({ type: "skill", key: "melee", name: "melee", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { ...SINGLE_SHOT.presetOptions, usePool: "pool", attackMode: "none", numberOfTargets: "3", preTargets: targets.map(target => target.uuid).join(",") } }, weapon, "ccWeapon");

    const cards = createdMessages.slice(posted).filter(message => message.getFlag?.("eclipsephase", "taskCard"));
    const boosted = cards.map(card => JSON.stringify(card.getFlag("eclipsephase", "taskCard").data).includes("ep2e.roll.announce.poolUsage.poolUsed"));
    expect(boosted).toEqual([true, true, false]);
    expect(actor.system.pools.vigor.value).toBe(0);
    expect(createdMessages.slice(posted).some(message => String(message.content).includes("ep2e.roll.announce.poolUsage.notEnoughPool"))).toBe(false);
  });

  test("the dialog picks as many targets as it names, all of them", () => {
    const picking = attackPicking({ rolledFrom: "ccWeapon", weapon: { weapon: { type: "ccWeapon", system: {} } } });
    const form = { elements: { numberOfTargets: { value: "3" } } };

    expect(picking.count(form)).toBe(3);
    expect(picking.minimum(form)).toBe(3);
  });
});
