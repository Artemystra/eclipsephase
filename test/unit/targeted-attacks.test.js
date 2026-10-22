import { JSDOM } from "jsdom";
import { registerTargetedAttackHooks, applyTargetedAttack, defenceGroups, rollDefence, rollRemainingDefences, defenceOutcome } from "../../module/rolls/targeted-attacks.js";
import { registerChemicalAttacks, registerDoseHooks, forceDose, chemicalPayload, activeDoseFor, DOSE_CURSOR } from "../../module/common/doses.js";
import { chemicalDoses, weaponPreparation, forceableDrugs } from "../../module/common/weapon-functions.js";
import { RollCheck, TASK_RESULT } from "../../module/rolls/dice.js";
import { usePoolFromChat } from "../../module/rolls/pools.js";
import { pickTokensOnCanvas, targetLabel, iconGlyph, iconImage, MARK_COLOR } from "../../module/common/general-sheet-functions.js";
import { TARGET_SHAPES } from "../../module/common/target-icons.js";
import { ownerVision } from "../../module/rolls/chat.js";
import { makeActor, resetWorld, seedRolls, loadPackItem } from "../setup/factories.js";

const { createdMessages } = global.__ep;
const SKIP_DIALOG = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } };
const SINGLE_SHOT = { skipDialog: true, presetOptions: { ...SKIP_DIALOG.presetOptions, attackMode: "single" } };
const DODGE = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, rangedFray: true, behindCover: false } };
const DODGE_IN_COVER = { skipDialog: true, presetOptions: { ...DODGE.presetOptions, behindCover: true } };
const GRIN = { _id: "grin1", name: "Grin", type: "drug", system: { active: true, slotType: "consumable", drugType: "biochem", inhalation: true, isAmmo: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 3, units: "hours" } } };

/**
 * Waits until a condition holds, for work a hook starts without awaiting. Gives up after a second.
 * @param {Function} predicate - Checked after every tick
 * @returns {Promise<void>} Resolves once the predicate holds
 */
async function until(predicate) {
  for (let tick = 0; tick < 200 && !predicate(); tick++) await new Promise(resolve => setTimeout(resolve, 5));
}

/**
 * A character holding the compendium's sprayer, full and loaded with Grin.
 * @returns {Promise<Actor>} The shooter
 */
async function shooter() {
  const sprayer = { ...loadPackItem("weapons/Sprayer_VtPETs2TTFaeEec7.json"), _id: "gun1" };
  sprayer.system = { ...sprayer.system, active: true, ammoMin: 15, ammoSelected: { id: "grin1", name: "Grin" } };
  const actor = makeActor({ type: "character", system: { aptitudes: { ref: { value: 15 } } }, items: [sprayer, GRIN] });
  await actor.items.get("gun1").update({ "system.ammoSelected.dose": chemicalPayload(actor.items.get("grin1")) });
  return actor;
}

/**
 * Someone to be hit, in a body of the given type.
 * @param {String} name - Their name
 * @param {String} [morphType] - "bio" or "synth"
 * @returns {Actor} The target
 */
function target(name, morphType = "bio") {
  return makeActor({
    type: "character",
    name,
    system: { activeMorph: "morph1", aptitudes: { ref: { value: 15 }, som: { value: 15 } }, skillsVig: { melee: { value: 40 } } },
    items: [{ _id: "morph1", name: "Morph", type: "morph", system: { type: morphType } }]
  });
}

/**
 * Fires the sprayer with the d100 showing the given value.
 * @param {Actor} actor - The shooter
 * @param {Number} die - The d100 result
 * @returns {Promise<Object>} The attack card
 */
async function fire(actor, die) {
  const weapon = await weaponPreparation(actor, "guns", "rangedWeapon", "gun1");
  seedRolls([die]);
  await RollCheck({ type: "skill", key: "guns", name: "Guns", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, SINGLE_SHOT, weapon, "rangedWeapon");
  return createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack).at(-1);
}

/**
 * Picks the given actors as the attack's targets, confirming fewer than it delivers to.
 * @param {Object} card - The attack card
 * @param {Actor[]} actors - The targets
 * @param {Boolean} [confirmed] - The answer to fewer targets
 * @returns {Promise<Actor[]|null>} What applyTargetedAttack returned
 */
function aimAt(card, actors, confirmed = true) {
  return applyTargetedAttack(card, { pick: async () => actors.map(actor => ({ actor })), confirm: async () => confirmed });
}

/**
 * The defence cards posted so far.
 * @returns {Object[]} The cards
 */
function defenceCards() {
  return createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence"));
}

/**
 * A target's outcome as their defence card records it.
 * @param {Actor} actor - The target
 * @returns {String|null} The outcome
 */
function outcomeOf(actor) {
  for (const card of defenceCards()) {
    const entry = card.getFlag("eclipsephase", "attackDefence").entries.find(candidate => candidate.uuid === actor.uuid);
    if (entry) return entry.outcome;
  }
  return null;
}

let realDocument;
beforeEach(() => {
  resetWorld();
  realDocument = global.document;
  global.document = new JSDOM("").window.document;
  registerDoseHooks();
  registerTargetedAttackHooks();
  registerChemicalAttacks();
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
  jest.spyOn(ui.notifications, "info").mockImplementation(() => {});
});

afterEach(() => {
  global.document = realDocument;
  jest.restoreAllMocks();
});

describe("what a chemical weapon delivers", () => {
  test("a weapon firing chemicals delivers one dose per round a shot uses, a single dose without Multi Shot, and anything else none", () => {
    expect(chemicalDoses({ automatedEffects: { specialAmmoDrugs: { value: true } }, additionalEffects: { multiShot: { number: 3 } } })).toBe(3);
    expect(chemicalDoses({ automatedEffects: { specialAmmoDrugs: { value: true } }, additionalEffects: {} })).toBe(1);
    expect(chemicalDoses({ automatedEffects: {}, additionalEffects: { multiShot: { number: 3 } } })).toBe(0);
  });

  test("a sprayer's hit offers to apply its dose to three targets instead of rolling damage, and uses three rounds", async () => {
    const actor = await shooter();

    const card = await fire(actor, 5);

    const attack = card.getFlag("eclipsephase", "roll").targetedAttack;
    expect(attack).toMatchObject({ effect: "dose", targets: 3, area: true, defence: "ranged", delivered: false });
    expect(attack.payload.name).toBe("Grin");
    expect(card.content).toContain("ep2e.chat.attack.applyDose");
    expect(card.content).not.toContain("ep2e.chat.buttonLabel.weaponDamage");
    expect(actor.items.get("gun1").system.ammoMin).toBe(12);
  });

  test("a miss offers nothing", async () => {
    const actor = await shooter();

    const card = await fire(actor, 95);

    expect(card.content).not.toContain("ep2e.chat.attack.applyDose");
  });

  test("a pool spend that turns the miss into a hit shows the target button on the same card, for the attacker's owner", async () => {
    const actor = await shooter();
    await actor.update({ "system.pools.vigor.value": 2 });
    const card = await fire(actor, 91);
    const posted = createdMessages.length;

    await usePoolFromChat({ currentTarget: { dataset: { usepool: "pool" }, closest: () => ({ dataset: { messageId: card.id } }) } });
    const holder = document.createElement("div");
    holder.innerHTML = card.content;
    await ownerVision(holder);

    expect(createdMessages).toHaveLength(posted);
    expect(holder.querySelector("button.targetedAttack").classList.contains("noShow")).toBe(false);
  });
});

describe("picking the targets", () => {
  test("the picked targets are named on the attack card and the button is gone", async () => {
    const card = await fire(await shooter(), 5);

    await aimAt(card, [target("Ana"), target("Bo"), target("Cy")]);

    expect(card.getFlag("eclipsephase", "roll").targetedAttack).toMatchObject({ delivered: true, targetNames: ["Ana", "Bo", "Cy"] });
    expect(card.content).not.toContain("ep2e.chat.attack.applyDose");
  });

  test("a sprayer's targets are picked several at once, with the default crosshair", async () => {
    const card = await fire(await shooter(), 5);
    const pick = jest.fn(async () => [{ actor: target("Ana") }]);

    await applyTargetedAttack(card, { pick, confirm: async () => true });

    expect(pick).toHaveBeenCalledWith({ multi: true, max: 3 });
  });

  test("fewer targets than doses go ahead only once confirmed", async () => {
    const card = await fire(await shooter(), 5);

    expect(await aimAt(card, [target("Ana")], false)).toBeNull();
    expect(defenceCards()).toHaveLength(0);
    expect(await aimAt(card, [target("Ana")], true)).toHaveLength(1);
    expect(defenceCards()).toHaveLength(1);
  });

  test("an attack applied once cannot be applied again", async () => {
    const card = await fire(await shooter(), 5);
    await aimAt(card, [target("Ana"), target("Bo"), target("Cy")]);

    expect(await aimAt(card, [target("Dee")])).toBeNull();
    expect(ui.notifications.warn).toHaveBeenCalledWith("ep2e.actorSheet.warnings.attackDelivered");
  });
});

describe("who defends", () => {
  test("each owner gets one card for their targets, and targets no player owns go to the GM", () => {
    const realUsers = game.users;
    const players = [{ id: "p1", isGM: false }, { id: "p2", isGM: false }];
    game.users = Object.assign([...players], { activeGM: null, get: () => null });
    const owned = (...ids) => user => ids.includes(user.id);
    const ana = Object.assign(target("Ana"), { testUserPermission: owned("p1") });
    const bo = Object.assign(target("Bo"), { testUserPermission: owned("p2") });
    const goonA = Object.assign(target("Goon A"), { testUserPermission: owned() });
    const goonB = Object.assign(target("Goon B"), { testUserPermission: owned() });

    try {
      const groups = defenceGroups([ana, goonA, bo, goonB]).map(group => ({ users: group.users, names: group.targets.map(actor => actor.name) }));
      expect(groups).toEqual([
        { users: ["p1"], names: ["Ana"] },
        { users: [], names: ["Goon A", "Goon B"] },
        { users: ["p2"], names: ["Bo"] }
      ]);
    } finally {
      game.users = realUsers;
    }
  });

  test("a card holding several targets offers to roll the rest at once", async () => {
    const card = await fire(await shooter(), 5);

    await aimAt(card, [target("Ana"), target("Bo")]);

    expect(defenceCards()[0].content).toContain("ep2e.chat.defence.rollAll");
  });
});

describe("dodging a sprayer's dose", () => {
  /**
   * Fires at one target and returns their defence card.
   * @param {Actor} victim - The target
   * @returns {Promise<Object>} The defence card
   */
  async function sprayed(victim) {
    const card = await fire(await shooter(), 5);
    await aimAt(card, [victim]);
    return defenceCards().at(-1);
  }

  test("an area attack's outcome: a failed dodge takes the dose, a dodge in the open half of it, a dodge behind cover none", () => {
    const attack = { defence: "ranged", area: true };
    expect(defenceOutcome(attack, false, false)).toBe("hit");
    expect(defenceOutcome(attack, true, false)).toBe("half");
    expect(defenceOutcome(attack, true, true)).toBe("none");
    expect(defenceOutcome({ defence: "melee", area: false }, true, false)).toBe("none");
  });

  test("a failed dodge puts the full dose on the target", async () => {
    const victim = target("Ana");
    const defence = await sprayed(victim);

    seedRolls([95]);
    await rollDefence(defence, victim.uuid, "dodge", DODGE);
    await until(() => activeDoseFor(victim, "Grin"));

    expect(outcomeOf(victim)).toBe("hit");
    expect(activeDoseFor(victim, "Grin").getFlag("eclipsephase", "dose").defense).toBeUndefined();
  });

  test("a dodge in the open still lets half the dose through", async () => {
    const victim = target("Ana");
    const defence = await sprayed(victim);

    seedRolls([5]);
    await rollDefence(defence, victim.uuid, "dodge", DODGE);
    await until(() => activeDoseFor(victim, "Grin"));

    expect(outcomeOf(victim)).toBe("half");
    expect(activeDoseFor(victim, "Grin").getFlag("eclipsephase", "dose").defense.halved).toBe(true);
  });

  test("a dodge behind cover keeps the dose out entirely", async () => {
    const victim = target("Ana");
    const defence = await sprayed(victim);

    seedRolls([5]);
    await rollDefence(defence, victim.uuid, "dodge", DODGE_IN_COVER);
    await until(() => outcomeOf(victim));

    expect(outcomeOf(victim)).toBe("none");
    expect(activeDoseFor(victim, "Grin")).toBeNull();
  });

  test("a pool spend that turns a failed dodge into a dodge in the open swaps the full dose for half, with no wear-off card", async () => {
    const victim = target("Ana");
    const defence = await sprayed(victim);
    seedRolls([95]);
    await rollDefence(defence, victim.uuid, "dodge", DODGE);
    await until(() => activeDoseFor(victim, "Grin"));
    const roll = createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.attackDefence).at(-1);

    Hooks.callAll("eclipsephase.poolResult", { context: { ...roll.flags.eclipsephase.roll, messageId: roll.id }, newResult: TASK_RESULT.SUCCESS });
    await until(() => activeDoseFor(victim, "Grin")?.getFlag("eclipsephase", "dose").defense?.halved);

    expect(outcomeOf(victim)).toBe("half");
    expect(createdMessages.some(message => message.content?.includes("ep2e.chat.dose.endedEarly"))).toBe(false);
  });

  test("a synthmorph is not touched by a biochemical spray", async () => {
    const victim = target("Rusty", "synth");
    const defence = await sprayed(victim);

    seedRolls([95]);
    await rollDefence(defence, victim.uuid, "dodge", DODGE);
    await until(() => createdMessages.some(message => message.content?.includes("ep2e.chat.dose.unaffected")));

    expect(activeDoseFor(victim, "Grin")).toBeNull();
  });

  test("rolling the rest at once rolls every remaining dodge together, and the card keeps every outcome", async () => {
    const card = await fire(await shooter(), 5);
    const targets = [target("Ana"), target("Bo"), target("Cy")];
    await aimAt(card, targets);
    let inFlight = 0;
    let mostAtOnce = 0;
    Hooks.on("eclipsephase.preRoll", () => { inFlight++; mostAtOnce = Math.max(mostAtOnce, inFlight); });
    Hooks.on("eclipsephase.postRoll", () => { inFlight--; });

    seedRolls([95, 95, 95]);
    await rollRemainingDefences(defenceCards().at(-1));
    await until(() => targets.every(outcomeOf));

    expect(mostAtOnce).toBe(3);
    expect(targets.map(outcomeOf)).toEqual(["hit", "hit", "hit"]);
  });
});

describe("forcing a drug on someone in melee", () => {
  /**
   * A character with Kick at hand.
   * @param {Object} [drug] - Drug system fields to override
   * @returns {Actor} The attacker
   */
  function attacker(drug = {}) {
    return makeActor({
      type: "character",
      system: { activeMorph: "morph1", skillsVig: { melee: { value: 40 } } },
      items: [
        { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio" } },
        { _id: "kick1", name: "Kick", type: "drug", system: { active: true, drugType: "biochem", injection: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 8, units: "hours" }, ...drug } }
      ]
    });
  }

  /**
   * Forces Kick with the d100 showing the given value and returns the attack card.
   * @param {Actor} actor - The attacker
   * @param {Number} die - The d100 result
   * @returns {Promise<Object>} The attack card
   */
  async function lunge(actor, die) {
    seedRolls([die]);
    await forceDose(actor, actor.items.get("kick1"), SKIP_DIALOG);
    return createdMessages.filter(message => message.getFlag?.("eclipsephase", "roll")?.targetedAttack).at(-1);
  }

  test("the drugs offered in the weapon selection are those at hand with a dose left that are not ammunition", () => {
    const actor = makeActor({
      type: "character",
      items: [
        { _id: "d1", name: "Kick", type: "drug", system: { active: true, usagesUsed: 0, usagesMax: 5, quantity: 1 } },
        { _id: "d2", name: "Stowed", type: "drug", system: { active: false, usagesUsed: 0, usagesMax: 5, quantity: 1 } },
        { _id: "d3", name: "Spent", type: "drug", system: { active: true, usagesUsed: 5, usagesMax: 5, quantity: 1 } },
        { _id: "d4", name: "Ammo", type: "drug", system: { active: true, isAmmo: true, inhalation: true, usagesUsed: 0, usagesMax: 5, quantity: 1 } }
      ]
    });

    expect(forceableDrugs(actor).map(item => item.name)).toEqual(["Kick"]);
  });

  test("a hit offers the dose to one target, defended in melee, picked with the dose cards' syringe", async () => {
    const card = await lunge(attacker(), 5);
    const pick = jest.fn(async () => null);
    await applyTargetedAttack(card, { pick });

    expect(pick).toHaveBeenCalledWith({ multi: false, max: 1, ...DOSE_CURSOR });

    expect(card.getFlag("eclipsephase", "roll").targetedAttack).toMatchObject({ effect: "dose", targets: 1, area: false, defence: "melee" });
    expect(card.content).toContain("ep2e.chat.attack.applyDose");
  });

  test("the dose leaves the pack once the target is picked, and the defence card offers dodging and parrying", async () => {
    const actor = attacker();
    const card = await lunge(actor, 5);

    await aimAt(card, [target("Ana")]);

    expect(actor.items.get("kick1").system.usagesUsed).toBe(1);
    const defence = defenceCards().at(-1);
    expect(defence.content).toContain("ep2e.chat.defence.dodge");
    expect(defence.content).toContain("ep2e.chat.defence.parry");
    expect(defence.content).not.toContain("ep2e.chat.defence.rollAll");
  });

  test("a successful parry keeps the dose out, a failed dodge lets it in", async () => {
    const actor = attacker({ quantity: 2 });
    const parrier = target("Ana");
    await aimAt(await lunge(actor, 5), [parrier]);
    seedRolls([5]);
    await rollDefence(defenceCards().at(-1), parrier.uuid, "parry", SKIP_DIALOG);
    await until(() => outcomeOf(parrier));

    const dodger = target("Bo");
    await aimAt(await lunge(actor, 5), [dodger]);
    seedRolls([95]);
    await rollDefence(defenceCards().at(-1), dodger.uuid, "dodge", SKIP_DIALOG);
    await until(() => activeDoseFor(dodger, "Kick"));

    expect(outcomeOf(parrier)).toBe("none");
    expect(activeDoseFor(parrier, "Kick")).toBeNull();
    expect(outcomeOf(dodger)).toBe("hit");
  });

  test("a pack emptied before the target is picked delivers nothing", async () => {
    const actor = attacker();
    const card = await lunge(actor, 5);
    await actor.deleteEmbeddedDocuments("Item", ["kick1"]);

    expect(await aimAt(card, [target("Ana")])).toBeNull();
    expect(defenceCards()).toHaveLength(0);
  });

  test("an ammunition pack or an empty pack is refused before any attack is rolled", async () => {
    const ammo = attacker({ isAmmo: true });
    const empty = attacker({ usagesUsed: 5 });

    expect(await forceDose(ammo, ammo.items.get("kick1"), SKIP_DIALOG)).toBeNull();
    expect(await forceDose(empty, empty.items.get("kick1"), SKIP_DIALOG)).toBeNull();
    expect(createdMessages).toHaveLength(0);
  });
});

describe("marking targets on the canvas", () => {
  let board;
  let tokens;
  let marks;

  /**
   * A token stand-in covering a square of the canvas.
   * @param {String} name - Its name
   * @param {Number} x - Its left edge
   * @returns {Object} The token
   */
  function token(name, x) {
    return { name, x, y: 0, w: 100, h: 100, actor: { name }, bounds: { contains: (px, py) => px >= x && px < x + 100 && py >= 0 && py < 100 } };
  }

  /**
   * Presses a mouse button on the board at a point.
   * @param {Number} x - Where, across
   * @param {Number} [button] - 0 for the left, 2 for the right button
   * @returns {void}
   */
  function press(x, button = 0) {
    board.dispatchEvent(new document.defaultView.MouseEvent("pointerdown", { button, clientX: x, clientY: 50, bubbles: true }));
  }

  beforeEach(() => {
    board = document.createElement("div");
    board.id = "board";
    document.body.append(board);
    tokens = [token("Ana", 0), token("Bo", 200), token("Cy", 400)];
    marks = new Set();
    global.canvas = { ready: true, canvasCoordinatesFromClient: point => point, tokens: { placeables: tokens } };
  });

  afterEach(() => {
    delete global.canvas;
  });

  /**
   * Starts picking with a marker that records which tokens are marked.
   * @param {Number} max - How many may be marked
   * @param {Object} [options] - Further picker options, e.g. multi or color
   * @returns {Promise<Object[]|null>} What the picker resolves to
   */
  function picking(max, options = { multi: true }) {
    return pickTokensOnCanvas({ max, ...options, marker: picked => { marks.add(picked.name); return () => marks.delete(picked.name); } });
  }

  test("clicked tokens are marked, a second click unmarks, and a right-click confirms them in order", async () => {
    const pick = picking(3);
    press(10);
    press(210);
    press(10);
    press(410);
    expect(marks).toEqual(new Set(["Bo", "Cy"]));
    press(10, 2);

    expect((await pick).map(picked => picked.name)).toEqual(["Bo", "Cy"]);
    expect(marks.size).toBe(0);
  });

  test("a click past the limit marks nothing and says the limit is reached", async () => {
    const pick = picking(1, { multi: true });
    press(10);
    press(210);
    press(10, 2);

    expect((await pick).map(picked => picked.name)).toEqual(["Ana"]);
    expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("ep2e.targeting.limitReached"));
  });

  test("a right-click with nothing marked, or Escape, cancels", async () => {
    const first = picking(2);
    press(10, 2);
    expect(await first).toBeNull();

    const second = picking(2);
    press(10);
    document.dispatchEvent(new document.defaultView.KeyboardEvent("keydown", { key: "Escape" }));
    expect(await second).toBeNull();
    expect(marks.size).toBe(0);
  });

  test("with one target, a click on another token moves the mark over, and a click on the marked one unmarks it", async () => {
    const pick = picking(1, {});
    press(10);
    press(210);
    expect(marks).toEqual(new Set(["Bo"]));
    press(210);
    expect(marks.size).toBe(0);
    press(410);
    press(10, 2);

    expect((await pick).map(picked => picked.name)).toEqual(["Cy"]);
    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });

  test("marks are drawn in the system's red unless the caller names another colour", async () => {
    const colours = [];
    const marker = (picked, point, { color }) => { colours.push(color); return () => {}; };
    const standard = pickTokensOnCanvas({ marker });
    press(10);
    press(10, 2);
    await standard;
    const custom = pickTokensOnCanvas({ marker, markColor: "#00ff00" });
    press(10);
    press(10, 2);
    await custom;

    expect(colours).toEqual([MARK_COLOR, "#00ff00"]);
  });

  test("the cursor shows how many targets are left, or for one target whether it is chosen, and how to confirm once one is marked", () => {
    const format = jest.spyOn(game.i18n, "format");

    expect(targetLabel({ multi: true, left: 3, marked: 0 })).not.toContain("ep2e.targeting.confirmHint");
    expect(targetLabel({ multi: true, left: 2, marked: 1 })).toContain("ep2e.targeting.confirmHint");
    expect(format).toHaveBeenLastCalledWith("ep2e.targeting.remaining", { count: 2 });
    expect(targetLabel({ multi: false, left: 1, marked: 0 })).toContain("ep2e.targeting.selectTarget");
    expect(targetLabel({ multi: false, left: 0, marked: 1 })).toContain("ep2e.targeting.targetChosen");
  });

  test("the system's own shapes are drawn in the colour asked for, with a white border, from their traced paths", () => {
    for (const key of ["ep-slash", "ep-lightning"]) {
      const svg = decodeURIComponent(iconImage(key, "#123456").replace("data:image/svg+xml,", ""));

      expect(svg).toContain("fill='#123456'");
      expect(svg).toContain("stroke='#ffffff'");
      expect(svg).toContain(TARGET_SHAPES[key].d);
    }
  });

  test("a picker started with a shape shows it as the cursor", async () => {
    const cursorRule = () => Array.from(document.head.querySelectorAll("style")).map(style => style.textContent).find(text => text.includes("#board"));
    const pick = picking(1, { icon: "ep-slash" });
    const during = cursorRule();
    press(10, 2);
    await pick;

    expect(during).toContain(encodeURIComponent(TARGET_SHAPES["ep-slash"].d.slice(0, 20)));
  });

  test("an icon's glyph is read without Font Awesome 7's alternative text, escaped or not", () => {
    const syringe = String.fromCodePoint(0xf48e);

    expect(iconGlyph(`"${syringe}" / ""`)).toBe(syringe);
    expect(iconGlyph(String.raw`"\f48e" / ""`)).toBe(syringe);
    expect(iconGlyph(String.raw`"\f48e"`)).toBe(syringe);
    expect(iconGlyph("none")).toBe("");
  });

  test("the cursor takes the colour it is given while picking, outranks the canvas's own cursor, and goes again afterwards", async () => {
    const cursorRules = () => Array.from(document.head.querySelectorAll("style")).map(style => style.textContent).filter(text => text.includes("#board"));
    const pick = picking(1, { color: "#123456" });
    const during = cursorRules();
    press(10, 2);
    await pick;

    expect(during).toHaveLength(1);
    expect(during[0]).toContain(encodeURIComponent("#123456"));
    expect(during[0]).toContain("!important");
    expect(cursorRules()).toEqual([]);
  });
});
