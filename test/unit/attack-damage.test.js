import { registerTargetedAttackHooks, applyTargetedAttack, rollDefence, attackFor, exposureModifiers, strikeUnderSuppression, layDownSuppression, takeCover, suppressOnTurn, inOpenPart, reviveSuppression, endSuppression, blastNote, blastPosition, spareRemaining, renderDefenceCard, scatterBlast, scatterOffset, superiorFailures, detonateArmed, defuseArmed, tickArmed, armedExplosives, armedAfterCombat, trapOwnership, armedIcon, armedCountdown, PROXIMITY_BEHAVIOR, SUPPRESSIVE_BEHAVIOR } from "../../module/rolls/attacks.js";
import { registerChemicalAttacks, registerDoseHooks } from "../../module/common/doses.js";
import { JSDOM } from "jsdom";
import { registerWeaponAttacks, detectWeaponAttack, detectThrow, damageAgainst, armorAgainst, rollAttackDamage, attackDamageLine } from "../../module/rolls/damage.js";
import { scatterSide } from "../../module/rolls/cards.js";
import { cellCentre, spotShapes, spotTop, wholeShapes, createShadowedArea } from "../../module/common/targeting.js";
import { MELEE_CURSOR, wirePreRollTargets, areaSquares, squareShapes, shapeContains } from "../../module/common/targeting.js";
import { weaponPreparation, grenadePreparation, blastReach, weaponRange, formulaMax, munitionArea, timerSpan, attackTargetCount, coneDamage, ANY_TARGETS } from "../../module/common/weapon-functions.js";
import { weaponDamage } from "../../module/rolls/damage.js";
import { attackPicking } from "../../module/rolls/attacks.js";
import { RollCheck, wireSuppressiveFields } from "../../module/rolls/dice.js";
import { makeActor, resetWorld, seedRolls, loadPackItem, setSetting } from "../setup/factories.js";

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

  test("a roll with no weapon and no attack of its own picks no targets; melee picks one with the slash", () => {
    expect(attackPicking({ rolledFrom: "skill", weapon: null, flags: {} })).toBeNull();
    const melee = attackPicking({ rolledFrom: "ccWeapon", weapon: { weapon: { type: "ccWeapon", system: {} } } });
    expect(melee.cursor).toEqual(MELEE_CURSOR);
    expect(melee.count(null)).toBe(1);
  });

  test("the pick button names one target or several, as the chosen mode strikes", () => {
    const { root, button } = dialogRoot();
    wirePreRollTargets(root, null, RIFLE, { pick: async () => null });

    expect(button.querySelector("span").textContent).toBe("ep2e.chat.attack.chooseTarget");
    choose(root, "attackMode", "burstTargets");
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

  test("a touch, in melee or for a sleight, reaches no farther than point-blank from the attacker's token", () => {
    const square = x => ({ x, y: 0, width: 100, height: 100 });
    const origin = { bounds: square(0) };
    const actor = { getActiveTokens: () => [origin] };
    const near = { bounds: square(300), actor: { name: "Ana" } };
    const far = { bounds: square(400), actor: { name: "Bo" } };
    const melee = attackPicking({ rolledFrom: "ccWeapon", actor, weapon: { weapon: { type: "ccWeapon", system: {} } } });
    const touching = { elements: { touchOnly: { checked: true } } };
    global.canvas = { ready: true, grid: { size: 100, distance: 1 } };
    try {
      expect(melee.refuseFor(touching)(near)).toBeNull();
      expect(melee.refuseFor(touching)(far)).toContain("ep2e.targeting.outOfTouch");
      expect(melee.refuseFor({ elements: {} })?.(far) ?? null).toBeNull();
    } finally {
      delete global.canvas;
    }
  });

  describe("an area placed before the targets", () => {
    const square = x => ({ x, y: 0, width: 100, height: 100 });

    /**
     * An attack dialog whose picking places an area first, with stand-ins for the area and the picker.
     * @param {Object} overrides - place, pick, area (the zone the picking names)
     * @returns {Promise<Object>} root, element, and the tokens in and outside the area
     */
    async function fireArea({ place, pick, area = { kind: "circle", radius: 20, from: {}, max: 3, within: 1 } }) {
      const root = document.createElement("div");
      root.innerHTML = `<form><select name="range"><option value="none">c</option><option value="beyond">b</option></select>
        <input type="hidden" name="preTargets" value=""><input type="hidden" name="measuredRanges" value=""><input type="hidden" name="placedArea" value="">
        <button data-action="pickTargets"><span>Pick</span></button></form>`;
      const element = dialogWindow();
      const inside = { actor: { uuid: "Actor.ana" }, bounds: square(300) };
      const outside = { actor: { uuid: "Actor.bo" }, bounds: square(900) };
      global.canvas = { grid: { size: 100, distance: 1 }, tokens: { placeables: [area.from, inside, outside] } };
      const picking = { cursor: {}, refuse: null, count: () => 3, minimum: () => 1, area: () => area };
      wirePreRollTargets(root, { element }, picking, { place, pick });
      root.querySelector("button").click();
      await new Promise(resolve => setTimeout(resolve, 10));
      return { root, element, inside, outside };
    }

    afterEach(() => { delete global.canvas; });

    test("only tokens in the area can be picked", async () => {
      const pick = jest.fn(async () => null);
      const { inside, outside } = await fireArea({ place: async () => ({ polygon: { contains: x => x < 500 } }), pick });

      const options = pick.mock.calls[0][0];
      expect(options).toMatchObject({ multi: true, max: 3, within: 1 });
      expect(options.refuse(inside)).toBeNull();
      expect(options.refuse(outside)).toBe("ep2e.targeting.outsideArea");
    });

    test("an area cancelled brings the dialog back without picking", async () => {
      const pick = jest.fn();
      const { element } = await fireArea({ place: async () => null, pick });

      expect(pick).not.toHaveBeenCalled();
      expect(element.open).toBe(true);
    });

    test("open sheets stay minimised while the area is placed and its targets picked, and come back afterwards", async () => {
      const Sheet = class {};
      const sheet = Object.assign(new Sheet(), { rendered: true, minimized: false, minimize: jest.fn(), maximize: jest.fn() });
      const realApi = foundry.applications.api;
      const realInstances = foundry.applications.instances;
      foundry.applications.api = { ...realApi, DocumentSheetV2: Sheet };
      foundry.applications.instances = new Map([["sheet", sheet]]);
      const seen = [];
      try {
        await fireArea({
          place: async options => { seen.push(["place", sheet.minimize.mock.calls.length, options.asideSheets]); return { polygon: { contains: () => true } }; },
          pick: async () => { seen.push(["pick", sheet.maximize.mock.calls.length]); return null; }
        });
      } finally {
        foundry.applications.api = realApi;
        foundry.applications.instances = realInstances;
      }

      expect(seen).toEqual([["place", 1, false], ["pick", 0]]);
      expect(sheet.maximize).toHaveBeenCalledTimes(1);
    });

    test("an area that takes no targets, such as suppressive fire, is kept in the dialog, its length counted as the distance, and rolls at once", async () => {
      const pick = jest.fn();
      const placed = { kind: "cone", origin: { x: 1, y: 2 }, radius: 40, angle: 28, rotation: 90 };
      const { root } = await fireArea({ place: async () => placed, pick, area: { kind: "cone", radius: 20, width: 20, from: {}, max: 0 } });

      expect(pick).not.toHaveBeenCalled();
      expect(JSON.parse(root.querySelector('input[name="placedArea"]').value)).toEqual({ ...placed, from: null });
      expect(root.querySelector('input[name="measuredRanges"]').value).toBe("40");
    });
  });

  describe("a cone weapon", () => {
    const SHREDDER_RANGED = { weapon: { type: "rangedWeapon", system: { ammoType: "spray", mode1: { range: 25 } } }, weaponMode: "1" };

    test("picks up to three targets within a metre of each other, and its measured range decides how many it may strike (Core p.218)", () => {
      const picking = attackPicking({ rolledFrom: "rangedWeapon", weapon: SHREDDER_RANGED });
      const at = range => ({ elements: { attackMode: { value: "single" }, range: { value: range } } });

      expect(picking.area).toBeUndefined();
      expect(picking.count(at("none"))).toBe(3);
      expect([picking.allowed(at("none")), picking.allowed(at("range")), picking.allowed(at("beyond"))]).toEqual([1, 2, 3]);
    });

    test("more targets than its range allows bring the dialog back with a notice", async () => {
      const root = document.createElement("div");
      root.innerHTML = `<form><select name="range"><option value="none">c</option></select><input type="hidden" name="preTargets" value=""><button data-action="pickTargets"><span>Pick</span></button></form>`;
      const element = dialogWindow();
      const picking = { cursor: {}, refuse: null, count: () => 3, minimum: () => 1, allowed: () => 1 };
      wirePreRollTargets(root, { element }, picking, { pick: async () => [{ actor: { uuid: "Actor.ana" } }, { actor: { uuid: "Actor.cy" } }] });
      root.querySelector("button").click();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(root.querySelector('input[name="preTargets"]').value).toBe("");
      expect(element.open).toBe(true);
      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("ep2e.targeting.tooMany"));
    });
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

describe("suppressive fire (Core p.207)", () => {
  /**
   * Lays down suppressive fire with an assault rifle, the d100 showing the given value.
   * @param {Number} die - The d100 result
   * @param {Object} [options] - Further dialog values
   * @returns {Promise<Object>} The shooter and the roll card
   */
  async function suppress(die, options = {}) {
    const actor = armed("Assault_Rifle_2gtjv5LMnBnWEPBb.json");
    await actor.items.get("gun1").update({ "system.ammoMin": 60, "system.ammoMax": 60 });
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");
    seedRolls([die]);
    await RollCheck({ type: "skill", key: "guns", name: "guns", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { ...SINGLE_SHOT.presetOptions, attackMode: "suppressive", ...options } }, weapon, "rangedWeapon");
    return { actor, card: createdMessages.filter(message => message.getFlag?.("eclipsephase", "taskCard")).at(-1) };
  }

  test("its roll takes no modifier but range and wounds", async () => {
    const { card } = await suppress(30, { range: "range", aim: "quick", calledShot: true, globalMod: 20 });

    expect(card.getFlag("eclipsephase", "taskCard").data.modifiers.map(modifier => modifier.text)).toEqual(["ep2e.roll.announce.combat.ranged.range"]);
  });

  test("whoever moves in the cone joins the targets once and defends; never the shooter, and nobody when the roll missed", async () => {
    const { actor, card } = await suppress(30);
    const target = armoured("Bo");

    expect(card.content).toContain("ep2e.chat.attack.suppressiveNote");
    expect(await strikeUnderSuppression(card, target)).toHaveLength(1);
    expect(await strikeUnderSuppression(card, target)).toBeNull();
    expect(await strikeUnderSuppression(card, actor)).toBeNull();
    expect(card.getFlag("eclipsephase", "taskCard").targets.map(entry => entry.name)).toEqual(["Bo"]);

    const missed = await suppress(95);
    expect(await strikeUnderSuppression(missed.card, armoured("Cy"))).toBeNull();
  });

  test("each target struck gets a damage card of their own, as from a single shot; one who got away gets none", async () => {
    const { card } = await suppress(3);
    const bo = armoured("Bo");
    const cy = armoured("Cy");

    await strikeUnderSuppression(card, bo);
    await defend(bo, 95);
    await until(() => damageCards().length === 1);
    await strikeUnderSuppression(card, cy);
    await defend(cy, 4);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(damageCards().map(damage => damage.getFlag("eclipsephase", "damageCard").targets.map(target => target.name))).toEqual([["Bo"]]);
  });

  test("someone in the cone when their turn begins may move into cover instead of dodging; someone who moved in may not", async () => {
    const { card } = await suppress(30);
    const bo = armoured("Bo");
    const cy = armoured("Cy");
    const region = { getFlag: () => ({ suppressive: true, messageId: card.id }), tokens: new Set() };
    const boToken = { actor: bo };
    region.tokens.add(boToken);

    await suppressOnTurn(boToken, { regions: [region] });
    await suppressOnTurn({ actor: cy }, { regions: [region] });
    const boCard = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);
    await strikeUnderSuppression(card, cy);
    const cyCard = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);

    expect(boCard.content).toContain("defenceCover");
    expect(cyCard.content).not.toContain("defenceCover");
    expect(await takeCover(cyCard, cy.uuid)).toBe(false);
    expect(await takeCover(boCard, bo.uuid)).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(boCard.getFlag("eclipsephase", "attackDefence").entries[0]).toMatchObject({ outcome: "none", cover: "moved" });
    expect(boCard.content).toContain("ep2e.chat.defence.outcome.cover");
    expect(damageCards()).toHaveLength(0);
  });

  test("someone behind a wall still defends, but only the GM sees their cards, and the attack card does not name them", async () => {
    const { card } = await suppress(3);
    const hidden = armoured("Zenobia");
    const gm = { id: "gm1", _id: "gm1", isGM: true, active: false };
    jest.spyOn(game.users, "filter").mockImplementation(test => [gm].filter(test));

    await strikeUnderSuppression(card, hidden, { hidden: true });
    const defence = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);
    await defend(hidden, 95);
    await until(() => damageCards().length);

    expect(defence.whisper).toEqual(["gm1"]);
    expect(damageCards().at(-1).whisper).toEqual(["gm1"]);
    expect(card.content).not.toContain("Zenobia");
  });

  test("behind a wall the card offers to remain in cover, also to someone who moved there; stepping into the open replaces it, and not the other way round", async () => {
    const { card } = await suppress(3);
    const hider = armoured("Zenobia");
    const defenceCards = () => createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence"));

    await strikeUnderSuppression(card, hider, { hidden: true });
    const shadowCard = defenceCards().at(-1);
    expect(shadowCard.content).toContain("ep2e.chat.defence.remainCover");

    await strikeUnderSuppression(card, hider);
    const openCard = defenceCards().at(-1);
    expect(game.messages.get(shadowCard.id)).toBeUndefined();
    expect(openCard.id).not.toBe(shadowCard.id);
    expect(openCard.content).not.toContain("defenceCover");
    expect(card.getFlag("eclipsephase", "taskCard").targets).toEqual([expect.objectContaining({ name: "Zenobia", hidden: false, defenceMessageId: openCard.id })]);

    expect(await strikeUnderSuppression(card, hider, { hidden: true })).toBeNull();
    expect(defenceCards().at(-1).id).toBe(openCard.id);
  });

  test("a player's character behind a wall keeps the choice to remain in cover, but in the open: the card and the name are public", async () => {
    const { card } = await suppress(3);
    const player = armoured("Wren");
    Object.defineProperty(player, "hasPlayerOwner", { value: true });

    await strikeUnderSuppression(card, player, { hidden: true });
    const defence = createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);

    expect(defence.content).toContain("ep2e.chat.defence.remainCover");
    expect(defence.whisper ?? []).toEqual([]);
    expect(card.content).toContain("Wren");
  });

  test("the centre of a token decides which part of the cone it stands in, so one in a narrow strip behind a wall counts as behind it", () => {
    const open = { getFlag: () => ({ attackId: "a1", part: "open" }), testPoint: ({ x }) => x < 500 };
    const shadow = { getFlag: () => ({ attackId: "a1", part: "shadow" }) };
    const scene = { grid: { size: 100 }, regions: [open, shadow] };
    const token = x => ({ x, y: 0, width: 1, height: 1, elevation: 0 });

    expect(inOpenPart({ attackId: "a1", part: "shadow" }, token(380), scene)).toBe(true);
    expect(inOpenPart({ attackId: "a1", part: "open" }, token(460), scene)).toBe(false);
    expect(inOpenPart({ attackId: "gone", part: "shadow" }, token(0), scene)).toBe(false);
  });

  test("on a square grid an area is whole squares, by their centres: open ones red, those behind walls yellow, and rows joined", () => {
    global.canvas = { dimensions: { distancePixels: 100 } };
    const grid = { size: 100, getOffset: ({ x, y }) => ({ i: Math.floor(y / 100), j: Math.floor(x / 100) }), getCenterPoint: ({ i, j }) => ({ x: j * 100 + 50, y: i * 100 + 50 }), getTopLeftPoint: ({ i, j }) => ({ x: j * 100, y: i * 100 }) };
    try {
      const area = { kind: "circle", origin: { x: 250, y: 250 }, radius: 1, polygon: { contains: x => x < 300 } };
      const { open, shadow } = areaSquares(area, grid);
      expect(open).toEqual(expect.arrayContaining([{ i: 2, j: 1 }, { i: 2, j: 2 }, { i: 1, j: 2 }, { i: 3, j: 2 }]));
      expect(shadow).toEqual([{ i: 2, j: 3 }]);
      expect(areaSquares(area, grid, new Set(["2,3"])).shadow).toEqual([]);
      expect(squareShapes([{ i: 2, j: 1 }, { i: 2, j: 2 }, { i: 2, j: 4 }], grid)).toEqual([
        { type: "rectangle", x: 100, y: 200, width: 200, height: 100 },
        { type: "rectangle", x: 400, y: 200, width: 100, height: 100 }
      ]);
      expect([shapeContains({ kind: "cone", origin: { x: 0, y: 0 }, radius: 5, angle: 90, rotation: 0 }, { x: 300, y: 100 }), shapeContains({ kind: "cone", origin: { x: 0, y: 0 }, radius: 5, angle: 90, rotation: 0 }, { x: -300, y: 0 })]).toEqual([true, false]);
    } finally {
      delete global.canvas;
    }
  });

  test("fire that missed is laid in grey and strikes nobody; a pool point that turns it into a hit lays it red and yellow instead", async () => {
    const created = [];
    const deleted = [];
    const regions = [];
    const scene = { id: "scene1", regions, createEmbeddedDocuments: async (type, data) => { for (const entry of data) regions.push({ ...entry, id: `r${regions.length}`, getFlag: (scope, key) => entry.flags.eclipsephase[key] }); created.push(...data); return data; }, deleteEmbeddedDocuments: async (type, ids) => { deleted.push(...ids); } };
    global.canvas = { scene, level: null, dimensions: { distancePixels: 100 } };
    CONFIG.Canvas = { ...(CONFIG.Canvas ?? {}), polygonBackends: { move: { create: () => ({ points: [0, 0, 100, 0, 100, 100] }) } } };
    CONFIG.Region = { documentClass: { canUserCreate: () => true } };
    global.CONST.REGION_VISIBILITY = { ALWAYS: 2 };
    try {
      const { card } = await suppress(95);
      const placedArea = JSON.stringify({ kind: "cone", origin: { x: 0, y: 0 }, radius: 24, angle: 45, rotation: 0 });
      created.length = 0;
      await layDownSuppression({ actor: { name: "Ana" }, message: card, outputData: { alternatives: card.getFlag("eclipsephase", "roll").alternatives }, flags: { targetedAttack: { id: "a1", actorUuid: "Actor.ana", suppressive: true } }, options: { placedArea } });
      expect(created.map(entry => [entry.color, entry.flags.eclipsephase.area.part])).toEqual([["#999999", "spent"]]);
      expect(await strikeUnderSuppression(card, armoured("Bo"))).toBeNull();

      created.length = 0;
      await reviveSuppression({ targetedAttack: { id: "a1", actorUuid: "Actor.ana", suppressive: true } }, 3);
      expect(deleted).toEqual(["r0"]);
      expect(created.map(entry => entry.flags.eclipsephase.area.part)).toEqual(["open", "shadow"]);
    } finally {
      delete global.canvas;
    }
  });

  test("when the combat ends, every suppressive fire on its scene ends with it, removed by the active GM alone", async () => {
    const region = (id, flag) => ({ id, isOwner: true, getFlag: () => flag });
    const deleted = [];
    const regions = [region("r1", { suppressive: true, part: "open" }), region("r2", { suppressive: true, part: "spent" }), region("r3", { attackId: "blast" })];
    regions.get = id => regions.find(entry => entry.id === id);
    const scene = { id: "scene1", regions, deleteEmbeddedDocuments: async (type, ids) => { deleted.push(...ids); } };
    const realUser = game.user;
    try {
      game.user = { ...realUser, isGM: true, isActiveGM: false };
      expect(await endSuppression({ scene })).toBe(0);
      game.user = { ...realUser, isGM: true, isActiveGM: true };
      expect(await endSuppression({ scene })).toBe(2);
    } finally {
      game.user = realUser;
    }
    expect(deleted).toEqual(["r1", "r2"]);
  });

  test("the attack dialog greys out what suppressive fire ignores, and leaves alone what was disabled anyway", () => {
    const document = new JSDOM("").window.document;
    const root = document.createElement("div");
    root.innerHTML = `<form><select name="attackMode"><option value="single">s</option><option value="suppressive">x</option></select>
      <div class="form-group"><input type="checkbox" name="aim"></div><input type="checkbox" name="smartlink" disabled>
      <select name="range"><option value="none">c</option></select><input type="checkbox" name="vacuum"></form>`;
    const field = name => root.querySelector(`[name="${name}"]`);
    wireSuppressiveFields(root);

    field("attackMode").value = "suppressive";
    field("attackMode").dispatchEvent(new document.defaultView.Event("change"));
    expect([field("aim").disabled, field("range").disabled, field("vacuum").disabled]).toEqual([true, false, false]);
    expect(field("aim").closest(".form-group").classList.contains("ep-field-suppressed")).toBe(true);

    field("attackMode").value = "single";
    field("attackMode").dispatchEvent(new document.defaultView.Event("change"));
    expect([field("aim").disabled, field("smartlink").disabled]).toEqual([false, true]);
  });

  test("the cone it was placed in is left whole, one colour at every spot - the open part red, the part behind walls yellow - both answering to the roll card", async () => {
    const created = [];
    global.canvas = { scene: { id: "scene1", createEmbeddedDocuments: async (type, data) => { created.push(...data); return data; } }, level: null, dimensions: { distancePixels: 100 } };
    CONFIG.Canvas = { ...(CONFIG.Canvas ?? {}), polygonBackends: { move: { create: () => ({ points: [0, 0, 100, 0, 100, 100] }) } } };
    CONFIG.Region = { documentClass: { canUserCreate: () => true } };
    global.CONST.REGION_VISIBILITY = { ALWAYS: 2 };
    try {
      const { card } = await suppress(30);
      const context = { actor: { name: "Ana" }, message: card, outputData: { alternatives: card.getFlag("eclipsephase", "roll").alternatives }, flags: { targetedAttack: { id: "a1", actorUuid: "Actor.ana", suppressive: true } }, options: { placedArea: JSON.stringify({ kind: "cone", origin: { x: 0, y: 0 }, radius: 24, angle: 45, rotation: 0 }) } };
      created.length = 0;
      await layDownSuppression(context);
    } finally {
      delete global.canvas;
    }

    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ color: "#db2a2a", shapes: [{ type: "polygon" }], flags: { eclipsephase: { area: { part: "open", attackId: "a1", actorUuid: "Actor.ana", suppressive: true, radius: 24 } } } });
    expect(created[1]).toMatchObject({ color: "#f2c94c", shapes: [{ type: "cone", angle: 45, rotation: 0 }, { type: "polygon", hole: true }], flags: { eclipsephase: { area: { part: "shadow" } } } });
    for (const region of created) expect(region.behaviors).toEqual([expect.objectContaining({ type: SUPPRESSIVE_BEHAVIOR, system: { messageId: expect.any(String) } })]);
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

describe("a thrown grenade (Core p.209, p.212, p.218)", () => {
  const FRAG = "Tactical_Multipurpose__Frag__vkQ4T5gd4VvWjyEi.json";
  const STUN = "Stun_7YLUqmPxMXi2BuJn.json";
  let regions;

  /**
   * A thrower holding a stack of compendium grenades.
   * @param {String} file - The grenade's source file in the grenades compendium
   * @returns {Actor} The thrower
   */
  function thrower(file) {
    const grenade = { ...loadPackItem(`grenades/${file}`), _id: "gren1" };
    grenade.system = { ...grenade.system, active: true, quantity: 2 };
    return makeActor({ type: "character", name: "Thrower", system: { aptitudes: { som: { value: 15 } } }, items: [grenade] });
  }

  /**
   * A token stand-in on a square grid of 100 pixels a metre.
   * @param {Actor} actor - Its actor
   * @param {Number} i - Its row
   * @param {Number} j - Its column
   * @returns {Object} The token
   */
  function tokenAt(actor, i, j) {
    return { actor, bounds: { x: j * 100, y: i * 100, width: 100, height: 100 } };
  }

  /**
   * Sets up a scene of 100-pixel squares a metre each, whose wall-cut blast is everything left of
   * x = 900, with the given tokens on it.
   * @param {Object[]} tokens - The tokens
   * @returns {void}
   */
  function scene(tokens) {
    regions = [];
    const grid = { isSquare: true, size: 100, distance: 1, getOffset: ({ x, y }) => ({ i: Math.floor(y / 100), j: Math.floor(x / 100) }), getCenterPoint: ({ i, j }) => ({ x: j * 100 + 50, y: i * 100 + 50 }), getTopLeftPoint: ({ i, j }) => ({ x: j * 100, y: i * 100 }) };
    global.canvas = { ready: true, grid, level: null, dimensions: { distancePixels: 100 }, tokens: { placeables: tokens }, scene: { id: "scene1", regions, createEmbeddedDocuments: async (type, data) => { regions.push(...data); return data; } } };
    CONFIG.Canvas = { ...(CONFIG.Canvas ?? {}), polygonBackends: { move: { create: () => ({ points: [0, 0, 900, 0, 900, 900], contains: x => x < 900 }), testCollision: () => null } } };
    CONFIG.Region = { documentClass: { canUserCreate: () => true } };
    global.CONST.REGION_VISIBILITY = { ALWAYS: 2 };
  }

  /**
   * Throws the grenade at a point, the d100 showing the given value.
   * @param {Actor} actor - The thrower
   * @param {Number} die - The d100 result
   * @param {Object} [options] - Further dialog values; origin, where it is placed (null for none)
   * @returns {Promise<Object>} The attack card
   */
  async function hurl(actor, die, { origin = { x: 550, y: 550 }, from = { x: 50, y: 550 }, ...options } = {}) {
    const weapon = grenadePreparation(actor, "gren1");
    seedRolls([die]);
    const placedArea = origin ? JSON.stringify({ kind: "circle", origin, radius: 0, from }) : "";
    await RollCheck({ type: "skill", key: "athletics", name: "athletics", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, placedArea, trigger: "impact", ...options } }, weapon, "grenade");
    return createdMessages.filter(message => message.getFlag?.("eclipsephase", "taskCard")).at(-1);
  }

  /**
   * The defence cards posted so far.
   * @returns {Object[]} The cards
   */
  function defenceCards() {
    return createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence"));
  }

  afterEach(() => {
    delete global.canvas;
  });

  test("a grenade is thrown with Athletics as far as the thrower's SOM in metres, and the throw takes it off its stack", async () => {
    scene([]);
    const actor = thrower(FRAG);
    const weapon = grenadePreparation(actor, "gren1");

    expect(weaponRange(weapon)).toBe(15);
    await hurl(actor, 95);
    expect(actor.items.get("gren1").system.quantity).toBe(1);
  });

  test("a blast reaches its radius or, centred, as far as its highest damage lasts; dialled back, less", () => {
    const frag = grenadePreparation(thrower(FRAG), "gren1").blast;
    const stun = grenadePreparation(thrower(STUN), "gren1").blast;

    expect(blastReach(frag)).toEqual({ kind: "centered", radius: 18, reduction: 2 });
    expect(blastReach(frag, { reduction: 6 })).toEqual({ kind: "centered", radius: 6, reduction: 6 });
    expect(blastReach(frag, { reduction: 50 }).reduction).toBe(20);
    expect(blastReach(frag, { reduction: 1 }).reduction).toBe(2);
    expect(blastReach(stun, { radius: 4 })).toEqual({ kind: "uniform", radius: 4, reduction: 0 });
    expect(blastReach(stun, { radius: 40 }).radius).toBe(10);
  });

  test("on a hit it goes off where it was placed: the area is laid red and yellow, and everyone in it defends, the thrower too with a warning", async () => {
    const actor = thrower(STUN);
    const bo = armoured("Bo");
    const far = armoured("Far");
    scene([tokenAt(actor, 5, 6), tokenAt(bo, 5, 5), tokenAt(far, 5, 20)]);

    const card = await hurl(actor, 30);
    await until(() => defenceCards().length);

    expect(regions.map(region => region.flags.eclipsephase.area.part)).toEqual(["open", "shadow"]);
    expect(regions[0].flags.eclipsephase.area).toMatchObject({ blast: true, actorUuid: actor.uuid });
    expect(card.getFlag("eclipsephase", "taskCard").targets.map(target => target.name).sort()).toEqual(["Bo", "Thrower"]);
    expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("ep2e.targeting.ownBlast"));
    expect(defenceCards().flatMap(message => message.getFlag("eclipsephase", "attackDefence").entries.map(entry => entry.name)).sort()).toEqual(["Bo", "Thrower"]);
  });

  test("a throw that misses sets nothing off, nor does one that was not placed", async () => {
    const actor = thrower(STUN);
    scene([tokenAt(armoured("Bo"), 5, 5)]);

    await hurl(actor, 95);
    const narrative = await hurl(actor, 30, { origin: null });

    expect(regions).toEqual([]);
    expect(defenceCards()).toEqual([]);
    expect(narrative.content).toContain("data-action=\"weaponDamage\"");
  });

  test("a successful dodge clears someone at the edge or behind a wall from the centre, and lets half through to anyone else", async () => {
    const actor = thrower(STUN);
    const middle = armoured("Middle");
    const edge = armoured("Edge");
    const behind = armoured("Behind");
    scene([tokenAt(middle, 5, 6), tokenAt(edge, 5, 14), tokenAt(behind, 6, 10)]);

    const card = await hurl(actor, 30);
    await until(() => defenceCards().length === 2);
    for (const target of [middle, edge, behind]) {
      const defence = defenceCards().find(message => message.getFlag("eclipsephase", "attackDefence").entries.some(entry => entry.uuid === target.uuid));
      seedRolls([4]);
      await rollDefence(defence, target.uuid, "dodge", DODGE);
    }
    await until(() => card.getFlag("eclipsephase", "taskCard").targets.every(target => target.outcome));

    const outcomes = Object.fromEntries(card.getFlag("eclipsephase", "taskCard").targets.map(target => [target.name, target.outcome]));
    expect(outcomes).toEqual({ Middle: "half", Edge: "none", Behind: "none" });
  });

  test("someone behind a wall whom no player owns is the GM's alone: their defence card, their line on the damage card, and not named on the attack card", async () => {
    const actor = thrower(FRAG);
    const seen = armoured("Seen");
    const hidden = armoured("Zenobia");
    const gm = { id: "gm1", _id: "gm1", isGM: true, active: false };
    jest.spyOn(game.users, "filter").mockImplementation(test => [gm].filter(test));
    scene([tokenAt(seen, 5, 6), tokenAt(hidden, 5, 10)]);

    const card = await hurl(actor, 30);
    await until(() => defenceCards().length === 2);
    const secretCard = defenceCards().find(message => message.getFlag("eclipsephase", "attackDefence").entries[0].uuid === hidden.uuid);
    seedRolls([95]);
    await rollDefence(secretCard, hidden.uuid, "dodge", DODGE);
    seedRolls([95]);
    await rollDefence(defenceCards().find(message => message !== secretCard), seen.uuid, "dodge", DODGE);
    await until(() => damageCards().length);
    seedRolls([5, 5, 5]);
    await rollAttackDamage(damageCards()[0]);

    expect(secretCard.whisper).toEqual(["gm1"]);
    expect(card.content).not.toContain("Zenobia");
    expect(damageCards()[0].whisper ?? []).toEqual([]);
    const secretLine = damageCards()[0].getFlag("eclipsephase", "damageCard").lines.find(line => line.uuid === hidden.uuid);
    expect(secretLine).toMatchObject({ secret: true, summary: "" });
  });

  test("a centred blast loses its DV per metre on the way to each target, by whole metres from the centre", async () => {
    const actor = thrower(FRAG);
    const near = armoured("Near", { energy: 0, kinetic: 0 });
    const away = armoured("Away", { energy: 0, kinetic: 0 });
    scene([tokenAt(near, 5, 5), tokenAt(away, 5, 8)]);

    await hurl(actor, 30);
    await until(() => defenceCards().length);
    for (const target of [near, away]) {
      seedRolls([95]);
      await rollDefence(defenceCards().find(message => message.getFlag("eclipsephase", "attackDefence").entries.some(entry => entry.uuid === target.uuid)), target.uuid, "dodge", DODGE);
    }
    await until(() => damageCards().length);
    seedRolls([25]);
    await rollAttackDamage(damageCards()[0]);

    expect(near.system.health.physical.value).toBe(25);
    expect(away.system.health.physical.value).toBe(19);
  });

  test("a token beside a blast is not in it: on a square grid its squares count by their centres, as the blast is drawn, and elsewhere its centre", () => {
    scene([]);
    const area = { kind: "circle", origin: { x: 550, y: 550 }, radius: 10, polygon: { contains: () => true } };
    const beside = { bounds: { x: 1555, y: 500, width: 100, height: 100 } };
    const touching = { bounds: { x: 1520, y: 500, width: 100, height: 100 } };

    expect(blastPosition(beside, area, canvas.grid)).toBeNull();
    expect(blastPosition(touching, area, canvas.grid)).toMatchObject({ distance: 10, nearEdge: true });
    expect(blastPosition(touching, area, { isSquare: false, size: 100, distance: 1 })).toBeNull();
  });

  test("the last grenade thrown takes its stack with it, and its damage is still rolled", async () => {
    const actor = thrower(FRAG);
    await actor.items.get("gren1").update({ "system.quantity": 1 });
    const bo = armoured("Bo", { energy: 0, kinetic: 0 });
    scene([tokenAt(bo, 5, 5)]);

    await hurl(actor, 30);
    await until(() => defenceCards().length);
    seedRolls([95]);
    await rollDefence(defenceCards()[0], bo.uuid, "dodge", DODGE);
    await until(() => damageCards().length);
    seedRolls([20]);
    await rollAttackDamage(damageCards()[0]);

    expect(actor.items.get("gren1")).toBeUndefined();
    expect(bo.system.health.physical.value).toBe(20);
  });

  test("a blast that catches nobody, or that everyone it caught got away from, is cleared; one that leaves smoke stays", async () => {
    const realTimeout = global.setTimeout;
    jest.spyOn(global, "setTimeout").mockImplementation((callback, delay, ...rest) => realTimeout(callback, delay >= 3000 ? 0 : delay, ...rest));
    const bo = armoured("Bo");
    scene([tokenAt(bo, 5, 10)]);
    regions.get = id => regions.find(region => region.id === id);
    canvas.scene.createEmbeddedDocuments = async (type, data) => { data.forEach(entry => regions.push({ ...entry, id: `r${regions.length}`, isOwner: true, getFlag: (scope, key) => entry.flags.eclipsephase[key] })); return data; };
    canvas.scene.deleteEmbeddedDocuments = async (type, ids) => { for (const id of ids) regions.splice(regions.findIndex(region => region.id === id), 1); };

    await hurl(thrower(STUN), 30, { origin: { x: 2550, y: 2550 } });
    await until(() => regions.length === 0);
    expect(regions).toHaveLength(0);

    await hurl(thrower(STUN), 30);
    await until(() => defenceCards().length);
    await takeCover(defenceCards()[0], bo.uuid);
    await until(() => regions.length === 0);
    expect(regions).toHaveLength(0);

    const combat = game.combat;
    game.combat = { started: true };
    try {
      await hurl(thrower(STUN), 30);
      await until(() => defenceCards().length === 2);
      seedRolls([95]);
      await rollDefence(defenceCards().at(-1), bo.uuid, "dodge", DODGE);
      await until(() => damageCards().length);
      seedRolls([5]);
      await rollAttackDamage(damageCards().at(-1));
      await until(() => regions.length === 0);
      expect(regions).toHaveLength(0);
    } finally {
      game.combat = combat;
    }

    await hurl(thrower("Gas_Smoke_tpxWJJNwXCBRgZ45.json"), 30);
    await new Promise(resolve => realTimeout(resolve, 20));
    expect(regions.length).toBeGreaterThan(0);
  });

  test("against a blast someone behind a wall may dodge or stay in cover without a roll, someone in the open only dodges, and the GM may spare the rest", async () => {
    const actor = thrower(STUN);
    const bo = armoured("Bo");
    const cy = armoured("Cy");
    const dee = armoured("Dee");
    scene([tokenAt(bo, 5, 10), tokenAt(cy, 5, 6), tokenAt(dee, 5, 5)]);

    const card = await hurl(actor, 30);
    await until(() => defenceCards().length === 2);
    const cardFor = target => defenceCards().find(message => message.getFlag("eclipsephase", "attackDefence").entries.some(entry => entry.uuid === target.uuid));
    expect(cardFor(bo).content).toContain(`data-action="defenceCover" data-target-uuid="${bo.uuid}"`);
    expect(cardFor(cy).content).not.toContain("data-action=\"defenceCover\"");
    expect(cardFor(cy).content).toContain('data-action="defenceSpare"');
    expect(await takeCover(cardFor(cy), cy.uuid)).toBe(false);

    expect(await takeCover(cardFor(bo), bo.uuid)).toBe(true);
    seedRolls([95]);
    await rollDefence(cardFor(dee), dee.uuid, "dodge", DODGE);
    expect(await spareRemaining(cardFor(cy))).toBe(1);
    await until(() => card.getFlag("eclipsephase", "taskCard").targets.every(target => target.outcome));

    expect(Object.fromEntries(card.getFlag("eclipsephase", "taskCard").targets.map(target => [target.name, target.outcome]))).toEqual({ Bo: "none", Cy: "none", Dee: "hit" });
    const covers = defenceCards().flatMap(message => message.getFlag("eclipsephase", "attackDefence").entries.map(entry => [entry.name, entry.cover || null]));
    expect(Object.fromEntries(covers)).toEqual({ Bo: "inCover", Cy: "spared", Dee: null });
  });

  test("a scatter turns 3.6 degrees a point of the d100 clockwise from the line of the throw, and goes a d10 metres, doubled for each superior failure", () => {
    const east = 0;
    const turn = direction => Math.round(scatterOffset(direction, 4, 0, east).angle * 180 / Math.PI);

    expect([turn(100), turn(25), turn(50), turn(75), turn(37)]).toEqual([0, 90, 180, 270, 133]);
    expect([scatterOffset(1, 4, 0, east).distance, scatterOffset(1, 4, 1, east).distance, scatterOffset(1, 4, 2, east).distance]).toEqual([4, 8, 16]);
    expect([superiorFailures(70), superiorFailures(66), superiorFailures(34), superiorFailures(33), superiorFailures(99)]).toEqual([0, 1, 1, 2, 0]);
    expect([scatterSide(0), scatterSide(90), scatterSide(180), scatterSide(270)]).toEqual(["ep2e.chat.attack.scatterAhead", 'ep2e.chat.attack.scatterRight {"degrees":90}', "ep2e.chat.attack.scatterBack", 'ep2e.chat.attack.scatterLeft {"degrees":90}']);
  });

  test("a throw that missed offers to scatter: it lands where the dice send it, the area it was aimed at turns grey, the pool can no longer change it, and it deals its plain damage", async () => {
    const actor = thrower(FRAG);
    const bo = armoured("Bo", { energy: 0, kinetic: 0 });
    scene([tokenAt(bo, 5, 8)]);

    const card = await hurl(actor, 70);
    expect(regions).toHaveLength(0);
    expect(card.content).toContain('data-action="blastScatter"');

    await scatterBlast(card, { rollDice: async () => ({ direction: 100, metres: 3 }) });
    await until(() => defenceCards().length);

    expect(regions.map(region => region.flags.eclipsephase.area.part).sort()).toEqual(["open", "shadow", "spent"]);
    expect(regions.find(region => region.flags.eclipsephase.area.part === "open").flags.eclipsephase.area.origin).toEqual({ x: 850, y: 550 });
    expect(card.content).toContain("ep2e.chat.attack.scattered");
    expect(card.content).not.toContain('data-action="blastScatter"');
    expect(card.getFlag("eclipsephase", "taskCard").targets.map(target => [target.name, Math.floor(target.distance)])).toEqual([["Bo", 0]]);
    expect(await scatterBlast(card, { rollDice: async () => ({ direction: 1, metres: 1 }) })).toBeNull();

    seedRolls([95]);
    await rollDefence(defenceCards()[0], bo.uuid, "dodge", DODGE);
    await until(() => damageCards().length);
    seedRolls([20]);
    await rollAttackDamage(damageCards()[0]);
    expect(bo.system.health.physical.value).toBe(20);
  });

  test("a grenade set to go off later scatters even on a hit; one on impact goes off where it hit", async () => {
    const actor = thrower(STUN);
    scene([]);

    const delayed = await hurl(actor, 30, { trigger: "timer" });
    expect(regions).toHaveLength(0);
    expect(delayed.content).toContain('data-action="blastScatter"');

    const impact = await hurl(actor, 30);
    expect(impact.content).not.toContain('data-action="blastScatter"');
    expect(regions.length).toBeGreaterThan(0);
  });

  test("a seeker missile loaded in a launcher is fired as a blast: its size adds to its damage and to how far a centred blast reaches", async () => {
    const actor = armed("Seeker_Pistol_gmwT5X2MW70ywgS2.json");
    const frag = loadPackItem("ammo/TMP_Frag_k6RLHDnQl1ZYNpG0.json");
    await actor.items.get("gun1").update({ "system.ammoSelected": { ...actor.items.get("gun1").system.ammoSelected, name: "TMP Frag", dvModifier: { ...frag.system.dv }, traits: frag.system.traits, armorused: "kinetic", area: munitionArea({ ...frag.system, size: "standard" }) } });
    const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");

    expect(weapon.blast).toMatchObject({ kind: "centered", reduction: 2, maxDamage: 46, damage: "+1d10" });
    expect(formulaMax(weapon.weaponDamage)).toBe(36);
    const attack = detectWeaponAttack({ rolledFrom: "rangedWeapon", weapon, options: { placedArea: JSON.stringify({ origin: { x: 1, y: 1 } }) } });
    expect(attack).toMatchObject({ targets: ANY_TARGETS, area: true, blast: { kind: "centered", radius: 23, origin: { x: 1, y: 1 } }, payload: { armorUsed: "kinetic" } });
    expect(attackPicking({ rolledFrom: "rangedWeapon", actor, weapon }).label()).toBe("ep2e.roll.dialog.throw.place");

    const damage = await weaponDamage({ actorUuid: actor.uuid, rolledFrom: "rangedWeapon", item: { weaponId: "gun1", weaponMode: "1" }, options: { attackMode: "single", range: "range" } }, 3);
    expect(damage.roll.formula).toContain("1d10");
    expect(damage.roll.formula.match(/d10/g)).toHaveLength(2);
  });

  test("the defence card says how far from the centre each target stands and whether a dodge gets them clear", () => {
    expect(blastNote({ distance: 3.6, nearEdge: false, shadow: false })).toBe('ep2e.chat.defence.blastDistance {"distance":3}');
    expect(blastNote({ distance: 9.5, nearEdge: true, shadow: false })).toContain("ep2e.chat.defence.blastEdge");
    expect(blastNote({ distance: 2, nearEdge: false, shadow: true })).toContain("ep2e.chat.defence.blastBehindWall");
    expect(blastNote({})).toBe("");
  });

  test("a grenade without a blast is thrown at one picked target like a shot; one without damage still blasts but strikes nobody", () => {
    const heap = thrower(FRAG);
    heap.items.get("gren1").system.area = { kind: "none", radius: null, reduction: null };
    const smoke = thrower("Gas_Smoke_tpxWJJNwXCBRgZ45.json");
    const heapAttack = detectThrow({ rolledFrom: "grenade", weapon: grenadePreparation(heap, "gren1"), options: {} });
    const smokeAttack = detectThrow({ rolledFrom: "grenade", weapon: grenadePreparation(smoke, "gren1"), options: { placedArea: JSON.stringify({ origin: { x: 1, y: 1 } }) } });

    expect(heapAttack).toMatchObject({ targets: 1, area: false, payload: { armorUsed: "kinetic" } });
    expect(heapAttack.blast).toBeUndefined();
    expect(smokeAttack).toMatchObject({ targets: ANY_TARGETS, area: true, blast: { kind: "uniform", radius: 10, harmless: true, origin: { x: 1, y: 1 } } });
    expect(attackPicking({ rolledFrom: "grenade", actor: heap, weapon: grenadePreparation(heap, "gren1") }).area).toBeUndefined();
    expect(attackPicking({ rolledFrom: "grenade", actor: smoke, weapon: grenadePreparation(smoke, "gren1") }).label()).toBe("ep2e.roll.dialog.throw.place");
  });

  describe("set to go off later (Core p.212)", () => {
    /**
     * Turns the stand-in scene's Regions into documents that can be read, updated and deleted, as
     * the armed explosives need.
     * @returns {void}
     */
    function documentRegions() {
      const wrap = entry => {
        const region = { ...entry, id: `r${regions.length}`, isOwner: true, getFlag: (scope, key) => region.flags.eclipsephase[key], update: async change => { for (const [path, value] of Object.entries(change)) foundry.utils.setProperty(region, path, value); return region; } };
        return region;
      };
      regions.get = id => regions.find(region => region.id === id);
      canvas.scene.createEmbeddedDocuments = async (type, data) => { data.forEach(entry => regions.push(wrap(entry))); return data; };
      canvas.scene.deleteEmbeddedDocuments = async (type, ids) => { for (const id of ids) regions.splice(regions.findIndex(region => region.id === id), 1); };
      game.scenes.get = id => (id === canvas.scene.id ? canvas.scene : undefined);
    }

    /**
     * Throws and scatters a grenade with a delayed trigger, so that it lies armed.
     * @param {Actor} actor - The thrower
     * @param {Object} options - The dialog's values
     * @returns {Promise<Object>} The attack card
     */
    async function lay(actor, options) {
      const card = await hurl(actor, 30, options);
      await scatterBlast(card, { rollDice: async () => ({ direction: 100, metres: 1 }) });
      return card;
    }

    const parts = () => regions.map(region => region.flags.eclipsephase.area.part).sort();

    beforeEach(() => {
      game.user.isActiveGM = true;
    });

    afterEach(() => {
      delete game.user.isActiveGM;
      game.time.worldTime = 0;
    });

    test("a timer runs whole action turns of three seconds, at least one", () => {
      expect([timerSpan(2, "rounds"), timerSpan(10, "seconds"), timerSpan(1, "minutes"), timerSpan(0, "rounds")]).toEqual([
        { rounds: 2, seconds: 6 }, { rounds: 4, seconds: 10 }, { rounds: 20, seconds: 60 }, { rounds: 1, seconds: 3 }
      ]);
    });

    test("it lies armed where it came down: a mark only its thrower's owners and the GM see, and no blast until it goes off", async () => {
      const actor = thrower(FRAG);
      scene([tokenAt(armoured("Bo"), 5, 6)]);
      documentRegions();

      const card = await lay(actor, { trigger: "signal" });

      expect(parts()).toEqual(["marker"]);
      expect(regions[0]).toMatchObject({ visibility: CONST.REGION_VISIBILITY.OBSERVER, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE } });
      expect(defenceCards()).toHaveLength(0);
      expect(card.content).toContain("ep2e.chat.attack.armedSignal");
      expect(card.content).toContain('data-action="armedDetonate"');
      expect(card.content).not.toContain('data-action="blastScatter"');
      expect(armedExplosives(actor, [canvas.scene])).toEqual([expect.objectContaining({ messageId: card.id, name: "Tactical Multipurpose (Frag)", here: true })]);
    });

    test("whether other players see an armed explosive follows Show Traps: all, players' only, or none - its owners and the GM always do", async () => {
      const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
      const player = thrower(FRAG);
      Object.defineProperty(player, "hasPlayerOwner", { value: true });
      const npc = armoured("Grunt");
      const seen = (actor, show) => {
        setSetting("eclipsephase", "showTraps", show);
        return trapOwnership(actor).default;
      };

      expect([seen(player, "all"), seen(player, "players"), seen(player, "none")]).toEqual([levels.OBSERVER, levels.OBSERVER, levels.NONE]);
      expect([seen(npc, "all"), seen(npc, "players"), seen(npc, "none")]).toEqual([levels.OBSERVER, levels.NONE, levels.NONE]);
    });

    test("hovering an armed explosive tells whose it is - '(You)' for a player's own - and how long until it goes off, which also stands as a number beside its icon", () => {
      const actor = thrower(FRAG);
      game.time.worldTime = 100;
      const flag = trigger => ({ trigger, actorUuid: actor.uuid, at: 130 });
      const user = game.user.isGM;

      expect(armedIcon(flag("timer"), null, null)).toEqual({ icon: "fa-clock", count: "30s", text: 'ep2e.chat.attack.armedTimer {"name":"Thrower","time":"ep2e.chat.attack.countdownSeconds {\\"count\\":30}"}' });
      expect(armedCountdown({ combatId: "fight", round: 5 }, { round: 3 })).toBe('ep2e.chat.attack.countdownTurns {"count":2}');
      expect(armedCountdown({ combatId: "fight", round: 5 }, { round: 3 }, true)).toBe("2");
      expect(armedCountdown({ at: 400 }, null, true)).toBe("5m");
      expect(armedIcon(flag("proximity"), { at: 130, live: false }, null)).toMatchObject({ icon: "fa-clock", count: "30s" });
      expect(armedIcon(flag("proximity"), { live: true }, null)).toMatchObject({ icon: "fa-satellite-dish" });
      expect(armedIcon(flag("signal"), null, null).count).toBeUndefined();
      game.user.isGM = false;
      try {
        expect(armedIcon(flag("signal"), null, null)).toEqual({ icon: "fa-tower-broadcast", text: 'ep2e.chat.attack.armedBy {"name":"ep2e.chat.attack.armedYours {\\"name\\":\\"Thrower\\"}"}' });
      } finally {
        game.user.isGM = user;
      }
    });

    test("once a blast went off, its attack card leaves naming whom it caught to the cards that follow", async () => {
      scene([tokenAt(armoured("Bo"), 5, 5)]);
      const card = await hurl(thrower(STUN), 30);
      await until(() => defenceCards().length);

      expect(card.content).not.toContain("ep-attack-targets");
      expect(card.getFlag("eclipsephase", "taskCard").targets.map(target => target.name)).toEqual(["Bo"]);
    });

    test("on a square grid it lies in the middle of the square it came down in, never across several", async () => {
      scene([]);
      documentRegions();
      const card = await hurl(thrower(FRAG), 30, { trigger: "signal", origin: { x: 560, y: 520 } });
      await scatterBlast(card, { rollDice: async () => ({ direction: 100, metres: 1 }) });

      expect(regions[0].flags.eclipsephase.area.point).toEqual({ x: 650, y: 550 });
      expect(regions[0].shapes).toEqual([{ type: "rectangle", x: 600, y: 500, width: 100, height: 100 }]);
    });

    test("on a hex grid it lies in its hexagon, the mark filling it and its icon resting on top of it", () => {
      const hex = [[0, -58], [50, -29], [50, 29], [0, 58], [-50, 29], [-50, -29]];
      global.canvas = { grid: { isSquare: false, isHexagonal: true, size: 100, getOffset: ({ x, y }) => ({ i: Math.round(y / 100), j: Math.round(x / 100) }), getCenterPoint: ({ i, j }) => ({ x: j * 100, y: i * 100 }), getVertices: ({ i, j }) => hex.map(([x, y]) => ({ x: j * 100 + x, y: i * 100 + y })) }, dimensions: { distancePixels: 100 } };

      expect(cellCentre({ x: 230, y: 180 })).toEqual({ x: 200, y: 200 });
      expect(spotShapes({ x: 230, y: 180 })).toEqual([{ type: "polygon", points: [200, 142, 250, 171, 250, 229, 200, 258, 150, 229, 150, 171] }]);
      expect(spotTop({ x: 200, y: 200 })).toBe(142);
      expect(wholeShapes({ kind: "circle", origin: { x: 200, y: 200 }, radius: 1 })).toHaveLength(5);
    });

    test("on a hex grid a blast is drawn in whole hexagons, red in the open and yellow behind walls, and a token counts by the hexagons it stands on", async () => {
      const hex = [[0, -58], [50, -29], [50, 29], [0, 58], [-50, 29], [-50, -29]];
      const created = [];
      global.canvas = {
        grid: { isSquare: false, isHexagonal: true, size: 100, getOffset: ({ x, y }) => ({ i: Math.round(y / 100), j: Math.round(x / 100) }), getCenterPoint: ({ i, j }) => ({ x: j * 100, y: i * 100 }), getVertices: ({ i, j }) => hex.map(([x, y]) => ({ x: j * 100 + x, y: i * 100 + y })) },
        dimensions: { distancePixels: 100 }, level: null,
        scene: { id: "scene1", createEmbeddedDocuments: async (type, data) => { created.push(...data); return data; } }
      };
      CONFIG.Region = { documentClass: { canUserCreate: () => true } };
      global.CONST.REGION_VISIBILITY = { ALWAYS: 2 };
      const area = { kind: "circle", origin: { x: 500, y: 500 }, radius: 1, polygon: { contains: x => x < 550 } };

      await createShadowedArea(area, { name: "Blast", flags: { attackId: "a1" } });

      expect(created.map(region => [region.flags.eclipsephase.area.part, region.shapes.length, region.shapes.every(shape => shape.type === "polygon")])).toEqual([["open", 4, true], ["shadow", 1, true]]);
      expect(created[1].flags.eclipsephase.area.cells).toEqual(["5,6"]);
      const token = { bounds: { x: 560, y: 450, width: 100, height: 100 }, document: { getOccupiedGridSpaceOffsets: () => [{ i: 5, j: 6 }] } };
      expect(blastPosition(token, area, canvas.grid)).toMatchObject({ distance: 1, nearEdge: true, shadow: true });
      expect(blastPosition({ ...token, document: { getOccupiedGridSpaceOffsets: () => [{ i: 5, j: 7 }] } }, area, canvas.grid)).toBeNull();
    });

    test("a signal sets it off when its owner chooses, once; one defused never goes off", async () => {
      const actor = thrower(FRAG);
      const bo = armoured("Bo");
      scene([tokenAt(bo, 5, 6)]);
      documentRegions();

      const card = await lay(actor, { trigger: "signal" });
      await detonateArmed(card);
      await until(() => defenceCards().length);
      expect(parts()).toEqual(["open", "shadow", "spent"]);
      expect(defenceCards()[0].getFlag("eclipsephase", "attackDefence").entries[0].uuid).toBe(bo.uuid);
      expect(await detonateArmed(card)).toBeNull();

      const second = await lay(thrower(FRAG), { trigger: "signal" });
      expect(await defuseArmed(second)).toBe(true);
      expect(await detonateArmed(second)).toBeNull();
      expect(second.content).toContain("ep2e.chat.attack.defusedNote");
    });

    test("a timer in combat goes off at the end of its thrower's turn in the round it was set for", async () => {
      const actor = thrower(FRAG);
      scene([]);
      documentRegions();
      const combatants = new Map([["c1", { actor }], ["c2", { actor: armoured("Other") }]]);
      const combat = { id: "fight", started: true, round: 2, scene: null, combatants };
      combatants[Symbol.iterator] = function* () { yield* combatants.values(); };
      const previous = game.combat;
      game.combat = combat;
      try {
        await lay(actor, { trigger: "timer", timerValue: 1, timerUnit: "rounds" });
        expect(regions[0].flags.eclipsephase.area).toMatchObject({ part: "marker", combatId: "fight", round: 3 });

        await tickArmed({ combat, prior: { round: 2, combatantId: "c1" } });
        await tickArmed({ combat: { ...combat, round: 3 }, prior: { round: 3, combatantId: "c2" } });
        expect(parts()).toEqual(["marker"]);

        await tickArmed({ combat: { ...combat, round: 3 }, prior: { round: 3, combatantId: "c1" } });
        expect(parts()).not.toContain("marker");
        expect(parts()).toContain("spent");
      } finally {
        game.combat = previous;
      }
    });

    test("a timer outside combat goes off on the world clock, and one a combat counted down keeps running when the combat ends", async () => {
      const actor = thrower(FRAG);
      scene([]);
      documentRegions();

      await lay(actor, { trigger: "timer", timerValue: 1, timerUnit: "minutes" });
      game.time.worldTime = 59;
      await tickArmed();
      expect(parts()).toEqual(["marker"]);
      game.time.worldTime = 60;
      await tickArmed();
      expect(parts()).not.toContain("marker");

      regions.length = 0;
      const combat = { id: "fight", started: true, round: 4, scene: null, combatants: new Map() };
      regions.push({ id: "m1", flags: { eclipsephase: { area: { armed: true, part: "marker", trigger: "timer", combatId: "fight", round: 6, messageId: "none" } } }, getFlag(scope, key) { return this.flags.eclipsephase[key]; }, async update(change) { for (const [path, value] of Object.entries(change)) foundry.utils.setProperty(this, path, value); } });
      await armedAfterCombat(combat);
      expect(regions[0].flags.eclipsephase.area).toMatchObject({ combatId: null, at: 60 + 3 * 3 });
    });

    test("a proximity trigger's sensor reaches as far as set, at most 3 m, and is live - in the target colour - only after three action turns", async () => {
      const actor = thrower(FRAG);
      scene([]);
      documentRegions();

      await lay(actor, { trigger: "proximity", proximityRadius: 9 });
      const sensor = regions.find(region => region.flags.eclipsephase.area.part === "sensor");
      expect(sensor.flags.eclipsephase.area).toMatchObject({ live: false, at: 9 });
      expect(sensor.behaviors).toEqual([expect.objectContaining({ type: PROXIMITY_BEHAVIOR })]);
      expect(sensor.color).not.toBe("#00f5e4");
      const covered = sensor.shapes.reduce((sum, shape) => sum + shape.width * shape.height, 0) / 10000;
      expect(covered).toBe(29);

      game.time.worldTime = 9;
      await tickArmed();
      expect(sensor).toMatchObject({ color: "#00f5e4", flags: { eclipsephase: { area: { live: true } } } });
    });
  });
});