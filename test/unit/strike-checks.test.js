import { confusionResult, confusionOnTurn, acceptStrikeCheck, strikeOutcome, strikeOf, strikeChecks, settleStrikeCheck, strikeModifiers, requestStrikeCheck, strikeButtons, rollRemainingStrikes, resolveRemainingStrikes, applyDamage, applyAttackDamage, detectWeaponAttack, registerStrikeChecks, registerWeaponAttacks, spanText, STRIKE_CHECK_KEY, PAIN_TOLERANCE_BONUS } from "../../module/rolls/damage.js";
import { registerTargetedAttackHooks, yieldDefence } from "../../module/rolls/attacks.js";
import { weaponPreparation } from "../../module/common/weapon-functions.js";
import { strikeTraits, traitSubSetConstructor } from "../../module/common/weapon-functions.js";
import { rollBlockContext } from "../../module/common/conditions.js";
import { TASK_RESULT, rollCalc, superiorResults, RollCheck } from "../../module/rolls/dice.js";
import { _ep29_markerEffects } from "../../module/common/migration.js";
import { makeActor, resetWorld, seedRolls, seedDialogs, loadPackItem } from "../setup/factories.js";

const { createdMessages } = global.__ep;
const CHECK_DIALOG = { rollMode: "public", usePool: "", globalMod: 0 };

/**
 * A character in a body of the given kind, with kinetic 6 and energy 2 armour.
 * @param {String} [type] - The morph type: "bio" or "synth"
 * @param {Object} [systems] - additionalSystems set on it, such as painTolerance
 * @returns {Actor} The target
 */
function target(type = "bio", systems = {}) {
  return makeActor({
    type: "character",
    name: "Ana",
    system: { activeMorph: "morph1", aptitudes: { som: { value: 15 }, ref: { value: 15 }, wil: { value: 15 } }, additionalSystems: systems },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type, dur: 30 } },
      { _id: "vest1", name: "Vest", type: "armor", system: { energy: 2, kinetic: 6, active: true, boundTo: "morph1" } }
    ]
  });
}

/**
 * The check cards posted since the given count, by the check they ask for.
 * @param {Number} before - The messages there were before
 * @returns {String[]} The checks
 */
function asked(before) {
  return createdMessages.slice(before).map(message => message.getFlag?.("eclipsephase", STRIKE_CHECK_KEY)?.check).filter(Boolean);
}

/**
 * The conditions an actor's effects put on it.
 * @param {Actor} actor - The actor
 * @returns {Object[]} status and duration per effect
 */
function conditionsOn(actor) {
  return actor.effects.flatMap(effect => Array.from(effect.statuses ?? []).map(status => ({ status, duration: effect.duration?.value ?? null })));
}

beforeEach(() => {
  resetWorld();
  registerStrikeChecks();
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("what a check's result brings", () => {
  const fail = value => rollCalc(value, 10);
  const pass = value => rollCalc(value, 90);

  test("superior results follow the 33/66 rule: failures at 66 or less and 33 or less, successes at 33 and 66 or more, a critical by its die", () => {
    expect([superiorResults(fail(80), 80), superiorResults(fail(50), 50), superiorResults(fail(20), 20)]).toEqual([0, 1, 2]);
    expect([superiorResults(pass(20), 20), superiorResults(pass(40), 40), superiorResults(pass(70), 70)]).toEqual([0, 1, 2]);
    expect([superiorResults(TASK_RESULT.CRITICAL_FAILURE, 22), superiorResults(TASK_RESULT.CRITICAL_SUCCESS, 66), superiorResults(TASK_RESULT.AUTOFAIL, 99)]).toEqual([2, 2, 0]);
  });

  test("an attack's superior successes count only when it hit", () => {
    expect(strikeOf({ checks: ["entangling"], weaponName: "Freezer", roll: { value: 70, result: pass(70) } })).toEqual({ checks: ["entangling"], weaponName: "Freezer", superiors: 2 });
    expect(strikeOf({ roll: { value: 70, result: fail(70) } }).superiors).toBe(0);
  });

  test("shock: a pass still stuns for 3 action turns; a failure knocks prone, incapacitates 1 turn +2 per superior failure and stuns for 3 minutes", () => {
    expect(strikeOutcome("shock", pass(40), 40).conditions).toEqual([{ id: "stunned", span: { value: 3, units: "rounds" } }]);
    expect(strikeOutcome("shock", fail(50), 50).conditions).toEqual([
      { id: "prone" },
      { id: "incapacitated", span: { value: 3, units: "rounds" } },
      { id: "stunned", span: { value: 3, units: "minutes" } }
    ]);
  });

  test("stun: a failure stuns 1 turn +1 per superior failure, a critical one incapacitates 1 turn and stuns for a minute", () => {
    expect(strikeOutcome("stun", pass(40), 40).conditions).toEqual([]);
    expect(strikeOutcome("stun", fail(20), 20).conditions).toEqual([{ id: "stunned", span: { value: 3, units: "rounds" } }]);
    expect(strikeOutcome("stun", TASK_RESULT.CRITICAL_FAILURE, 55).conditions).toEqual([{ id: "incapacitated", span: { value: 1, units: "rounds" } }, { id: "stunned", span: { value: 1, units: "minutes" } }]);
  });

  test("blinding blinds 1 turn +1 per superior failure, a critical failure until healed; entangling grapples, knockdown and wounds knock prone, two wounds knock out", () => {
    expect(strikeOutcome("blinding", fail(80), 80).conditions).toEqual([{ id: "blinded", span: { value: 1, units: "rounds" } }]);
    expect(strikeOutcome("blinding", TASK_RESULT.CRITICAL_FAILURE, 77).conditions).toEqual([{ id: "blinded" }]);
    expect(strikeOutcome("entangling", fail(80), 80).conditions).toEqual([{ id: "grappled" }]);
    expect(strikeOutcome("knockdown", fail(80), 80).conditions).toEqual([{ id: "prone" }]);
    expect(strikeOutcome("unconscious", fail(80), 80).conditions).toEqual([{ id: "unconscious" }]);
    expect(strikeOutcome("knockdown", pass(40), 40).conditions).toEqual([]);
  });

  test("pain leaves no condition of its check, but a failure means fleeing", () => {
    expect(strikeOutcome("pain", fail(80), 80)).toEqual({ conditions: [], flee: true });
    expect(strikeOutcome("pain", pass(40), 40)).toEqual({ conditions: [], flee: false });
  });

  test("a span reads in action turns or minutes", () => {
    expect([spanText({ value: 1, units: "rounds" }), spanText({ value: 3, units: "rounds" }), spanText({ value: 3, units: "minutes" }), spanText(null)])
      .toEqual([expect.stringContaining("spanRound "), expect.stringContaining("spanRounds"), expect.stringContaining("spanMinutes"), ""]);
  });
});

/**
 * A damage card for the given checks, as an attack's card leaves it once applied.
 * @param {Object[]} checks - The check entries
 * @param {Object} [state] - Further state, such as area
 * @returns {Promise<ChatMessage>} The card
 */
function damageCard(checks, state = {}) {
  return ChatMessage.create({ content: "", flags: { eclipsephase: { damageCard: { data: { type: "damage" }, lines: [], checks, ...state } } } });
}

/**
 * Waits until a condition holds, for work a hook starts without awaiting.
 * @param {Function} predicate - Checked after every tick
 * @returns {Promise<void>} Resolves once it holds, or after a second
 */
async function until(predicate) {
  for (let tick = 0; tick < 200 && !predicate(); tick++) await new Promise(resolve => setTimeout(resolve, 5));
}

describe("what a hit asks of its target", () => {
  test("one wound asks for the SOM Check against falling prone on a card of its own", async () => {
    const before = createdMessages.length;
    const onCard = await strikeChecks(target(), { wounds: 1 });

    expect(asked(before)).toEqual(["knockdown"]);
    expect(onCard).toEqual([]);
  });

  test("a knockdown weapon puts that check on the damage card instead, wound or not - one check, not two", async () => {
    const before = createdMessages.length;
    const wounded = await strikeChecks(target(), { wounds: 1, checks: ["knockdown"] });
    const unhurt = await strikeChecks(target(), { checks: ["knockdown"] });

    expect(asked(before)).toEqual([]);
    expect(wounded.map(entry => entry.check)).toEqual(["knockdown"]);
    expect(unhurt.map(entry => entry.check)).toEqual(["knockdown"]);
    expect(await strikeChecks(target(), {})).toEqual([]);
  });

  test("two wounds at once knock prone outright and ask on a card of their own against passing out; the knockdown weapon asks nothing more", async () => {
    const ana = target();
    const before = createdMessages.length;
    const onCard = await strikeChecks(ana, { wounds: 2, checks: ["knockdown"] });

    expect(asked(before)).toEqual(["unconscious"]);
    expect(onCard).toEqual([]);
    expect(conditionsOn(ana)).toEqual([{ status: "prone", duration: null }]);
    expect(createdMessages.at(-1).content).toContain("icons/svg/unconscious.svg");
  });

  test("synthmorphs shrug off shock and a stun meant for biomorphs, and a card says so", async () => {
    const before = createdMessages.length;
    const onCard = await strikeChecks(target("synth"), { checks: ["shock", "stunBiomorphs"] });

    expect(onCard).toEqual([]);
    expect(createdMessages.slice(before).filter(message => message.content.includes("ep2e.chat.strike.immune"))).toHaveLength(2);
  });

  test("a biomorph gets the shock, stun and entangling checks on the damage card, entangling with the attack's superior successes", async () => {
    const onCard = await strikeChecks(target(), { checks: ["shock", "stunBiomorphs", "entangling"], superiors: 2, weaponName: "Net Gun" });

    expect(onCard.map(entry => entry.check)).toEqual(["shock", "stun", "entangling"]);
    expect(onCard[2]).toMatchObject({ superiors: 2, weaponName: "Net Gun", rolled: false });
    expect(onCard[0].superiors).toBe(0);
  });

  test("Anti-Glare keeps blinding off", async () => {
    expect(await strikeChecks(target("bio", { antiGlare: true }), { checks: ["blinding"] })).toEqual([]);
  });

  test("pain hits biomorphs only: -20 for a turn and a WIL Check, -10 with Pain Tolerance I, nothing with Pain Tolerance II", async () => {
    const plain = target();
    const tolerant = target("bio", { painTolerance: 1 });
    const checks = [
      ...await strikeChecks(plain, { checks: ["pain"] }),
      ...await strikeChecks(tolerant, { checks: ["pain"] }),
      ...await strikeChecks(target("bio", { painTolerance: 2 }), { checks: ["pain"] }),
      ...await strikeChecks(target("synth"), { checks: ["pain"] })
    ];

    expect(checks.map(entry => entry.check)).toEqual(["pain", "pain"]);
    expect(conditionsOn(plain)).toEqual([{ status: "impaired20", duration: 1 }]);
    expect(conditionsOn(tolerant)).toEqual([{ status: "impaired10", duration: 1 }]);
  });

  test("pain does not soften a stronger Impaired already on", async () => {
    const ana = target();
    ana.statuses = new Set(["impaired30"]);
    await strikeChecks(ana, { checks: ["pain"] });

    expect(conditionsOn(ana)).toEqual([]);
  });
});

describe("wounds ask for their check however they come", () => {
  test("damage that wounds asks by itself, unless the caller asks for it", async () => {
    const before = createdMessages.length;
    await applyDamage(target(), 40);
    await until(() => asked(before).length);
    const later = createdMessages.length;
    await applyDamage(target(), 40, { woundCheck: false });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(asked(before)).toEqual(["unconscious"]);
    expect(createdMessages.length).toBe(later);
  });

  test("a wound typed into the sheet asks too; taking one away does not", async () => {
    const ana = target();
    const before = createdMessages.length;
    await ana.update({ "system.physical.wounds": 1 });
    await until(() => asked(before).length);
    await ana.update({ "system.physical.wounds": 0 });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(asked(before)).toEqual(["knockdown"]);
  });

  test("an attack's damage puts its weapon's checks on the damage card, and its wound's own check stays on a card of its own only without a knockdown weapon", async () => {
    const ana = target();
    const card = await damageCard([]);
    const before = createdMessages.length;
    await applyAttackDamage({ cardId: card.id, total: 12, armorUsed: "kinetic", armorPiercing: false, strike: { checks: ["knockdown", "shock"], weaponName: "Shock Baton", superiors: 0 }, targets: [{ uuid: ana.uuid, name: ana.name, outcome: "hit" }] });

    expect(card.getFlag("eclipsephase", "damageCard").checks.map(entry => entry.check)).toEqual(["knockdown", "shock"]);
    expect(asked(before)).toEqual([]);
  });
});

describe("rolling and settling a hit's check", () => {
  test("a check on the damage card rolls its aptitude once, as a check no condition blocks, its button goes and its failure puts the conditions on", async () => {
    const ana = target();
    const [entry] = await strikeChecks(ana, { checks: ["blinding"] });
    const card = await damageCard([entry]);
    seedDialogs(CHECK_DIALOG);
    seedRolls([80]);
    await requestStrikeCheck(card.id, entry.id);

    expect(conditionsOn(ana)).toEqual([{ status: "blinded", duration: 1 }]);
    expect(card.getFlag("eclipsephase", "damageCard").checks[0].rolled).toBe(true);
    expect(strikeButtons(card.getFlag("eclipsephase", "damageCard")).strikeButtons).toEqual([]);
    expect(await requestStrikeCheck(card.id, entry.id)).toBeNull();
    expect(rollBlockContext({ contextFlags: { [STRIKE_CHECK_KEY]: {} } }).check).toBe(true);
  });

  test("a wound's own card rolls its check the same way", async () => {
    const ana = target();
    await strikeChecks(ana, { wounds: 1 });
    const card = createdMessages.at(-1);
    seedDialogs(CHECK_DIALOG);
    seedRolls([80]);
    await requestStrikeCheck(card.id);

    expect(conditionsOn(ana)).toEqual([{ status: "prone", duration: null }]);
  });

  test("the damage card names the target on each button when it holds several, and offers the GM the rest of the NPCs' checks for an area", async () => {
    const entry = (actorUuid, name, check, npc) => ({ id: `${name}-${check}`, actorUuid, name, check, npc, rolled: false });
    const one = strikeButtons({ checks: [entry("a", "Ana", "shock", true), entry("a", "Ana", "knockdown", true)] });
    const area = strikeButtons({ area: true, checks: [entry("a", "Ana", "shock", false), entry("b", "Bo", "shock", true)] });

    expect(one.strikeButtons.map(button => button.label)).toEqual([expect.stringContaining("ep2e.chat.strike.resist "), expect.stringContaining("ep2e.chat.strike.resist ")]);
    expect(one.strikeButtons.map(button => button.primary)).toEqual([false, true]);
    expect(one.strikeRest).toBe(false);
    expect(area.strikeButtons[1].label).toContain("ep2e.chat.strike.resistFor");
    expect(area.strikeRest).toBe(true);
    expect(area.strikeButtons.some(button => button.primary)).toBe(false);
  });

  test("the GM rolls every NPC's check left at once, or resolves them without a roll; the players' stay", async () => {
    const npc = target();
    npc.hasPlayerOwner = false;
    const [shock] = await strikeChecks(npc, { checks: ["shock"] });
    const [blind] = await strikeChecks(npc, { checks: ["blinding"] });
    const player = { ...shock, id: "player", npc: false, actorUuid: target().uuid };
    const rolled = await damageCard([shock, player], { area: true });
    seedRolls([5]);
    await rollRemainingStrikes(rolled);
    const resolved = await damageCard([blind, player], { area: true });
    await resolveRemainingStrikes(resolved);

    expect(rolled.getFlag("eclipsephase", "damageCard").checks.map(entry => entry.rolled)).toEqual([true, false]);
    expect(conditionsOn(npc)).toEqual([{ status: "stunned", duration: 3 }]);
    expect(resolved.getFlag("eclipsephase", "damageCard").checks.map(entry => entry.rolled)).toEqual([true, false]);
  });

  test("what a check brought is said as openly as its roll was; an immunity as openly as the damage card", async () => {
    const ana = target("synth");
    await settleStrikeCheck({ actorUuid: ana.uuid, check: "entangling", id: "e1" }, rollCalc(80, 10), 80, { whisper: [] });
    const open = createdMessages.at(-1);
    await settleStrikeCheck({ actorUuid: ana.uuid, check: "entangling", id: "e2" }, rollCalc(80, 10), 80, { whisper: ["gm"] });
    const secret = createdMessages.at(-1);
    await strikeChecks(ana, { checks: ["shock"], whisper: [] });
    const immune = createdMessages.at(-1);

    expect(open.whisper).toEqual([]);
    expect(open.content).toContain("conditions/grappled.svg");
    expect(secret.whisper).toEqual(["gm"]);
    expect(immune.whisper).toEqual([]);
  });

  test("a pool point that turns the result takes off what the old one put on and puts on what the new one brings", async () => {
    const ana = target();
    const check = { actorUuid: ana.uuid, check: "shock", id: "s1" };
    await settleStrikeCheck(check, rollCalc(50, 10), 50);
    await settleStrikeCheck(check, rollCalc(5, 10), 5);

    expect(conditionsOn(ana)).toEqual([{ status: "stunned", duration: 3 }]);
  });

  test("armour adds to shock and stun, the attack's superior successes count against entangling, Pain Tolerance I helps against pain", () => {
    const ana = target("bio", { painTolerance: 1 });
    const values = check => strikeModifiers({ actorUuid: ana.uuid, superiors: 2, check }).map(entry => entry.value);

    expect(values("shock")).toEqual([2]);
    expect(values("stun")).toEqual([6]);
    expect(values("entangling")).toEqual([-20]);
    expect(values("pain")).toEqual([PAIN_TOLERANCE_BONUS]);
    expect(values("knockdown")).toEqual([]);
  });
});

describe("weapons whose hit asks for checks", () => {
  test("an entangling weapon's trait reaches its effects, and the traits that ask for checks are picked out", async () => {
    const weapon = { system: { mode1: { traits: { entangling: { name: "x", value: true }, shock: { name: "y", value: true }, armorPiercing: { name: "z", value: true } } }, mode2: { traits: {} }, additionalMode: false, accessories: {} } };
    const { curatedList } = await traitSubSetConstructor(weapon);

    expect(curatedList.mode1.additionalEffects.entangling.value).toBe(true);
    expect(strikeTraits(curatedList.mode1.additionalEffects)).toEqual(["shock", "entangling"]);
  });

  test("a touch, or a weapon without damage dice, with a trait that asks for checks is an attack that deals no damage; without one it is none", () => {
    const context = (traits, options = {}, weaponDamage = "1d10") => ({ rolledFrom: "ccWeapon", options, weapon: { weapon: { system: {} }, weaponMode: "1", weaponDamage, weaponTraits: { automatedEffects: {}, additionalEffects: traits } } });

    expect(detectWeaponAttack(context({ shock: { value: true } }, { touchOnly: true }))).toMatchObject({ noDamage: true, checks: ["shock"] });
    expect(detectWeaponAttack(context({ entangling: { value: true } }, {}, ""))).toMatchObject({ noDamage: true, checks: ["entangling"] });
    expect(detectWeaponAttack(context({}, { touchOnly: true }))).toBeNull();
    expect(detectWeaponAttack(context({ shock: { value: true } }))).not.toHaveProperty("noDamage");
  });

  test("a touch with a Shock Glove that lands - here, soaked - brings the damage card saying it deals none, with the check on it - no button to roll damage", async () => {
    registerWeaponAttacks();
    registerTargetedAttackHooks();
    const glove = { ...loadPackItem("weapons/Shock_Glove_8zlXaSsyS6ndDlKO.json"), _id: "gun1" };
    glove.system = { ...glove.system, active: true };
    const actor = makeActor({ type: "character", name: "Toucher", system: { aptitudes: { ref: { value: 15 } } }, items: [glove] });
    const victim = target();
    const weapon = await weaponPreparation(actor, "melee", "ccWeapon", "gun1");
    seedRolls([30]);
    await RollCheck({ type: "skill", key: "melee", name: "melee", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, attackMode: "none", touchOnly: true, numberOfTargets: "1", preTargets: victim.uuid } }, weapon, "ccWeapon");
    const defence = () => createdMessages.filter(message => message.getFlag?.("eclipsephase", "attackDefence")).at(-1);
    await until(() => defence());
    await yieldDefence(defence(), victim.uuid);
    const damage = () => createdMessages.find(message => message.getFlag?.("eclipsephase", "damageCard")?.checks?.length);
    await until(() => damage());

    const state = damage().getFlag("eclipsephase", "damageCard");
    expect(state.data.total).toBe(false);
    expect(state.checks.map(entry => entry.check)).toEqual(["shock"]);
    expect(damage().content).toContain("rollStrikeCheck");
    expect(damage().content).not.toContain("attackDamage");
  });
});

describe("a confused character's turn", () => {
  afterEach(() => { game.user.isActiveGM = undefined; });

  /**
   * A combat whose turn has come to the given actor.
   * @param {Actor} actor - The one acting
   * @returns {Object} The combat
   */
  const turnOf = actor => ({ combatant: { actor } });

  test("the d100 decides: 00-24 mutter, 25-49 act at random, 50-74 flee, 75-99 attack", () => {
    expect([0, 24, 25, 49, 50, 74, 75, 99].map(confusionResult)).toEqual(["mutter", "mutter", "random", "random", "flee", "flee", "attack", "attack"]);
  });

  test("at the start of their turn the active GM asks them for the COG Check at -30; nobody else, and nobody who is not confused", async () => {
    const ana = target();
    ana.statuses = new Set(["confused"]);
    const before = createdMessages.length;
    expect(await confusionOnTurn(turnOf(ana))).toBeNull();
    game.user.isActiveGM = true;
    expect(await confusionOnTurn(turnOf(target()))).toBeNull();
    Hooks.callAll("combatTurnChange", turnOf(ana));
    await until(() => asked(before).length);

    expect(asked(before)).toEqual(["confused"]);
    expect(createdMessages.at(-1).content).toContain("icons/svg/daze.svg");
    expect(strikeModifiers({ actorUuid: ana.uuid, check: "confused" }).map(entry => entry.value)).toEqual([-30]);
  });

  /**
   * A confused character's check roll card, as the roll leaves it.
   * @param {Actor} actor - The confused character
   * @param {Number} value - The die
   * @param {Boolean} available - Whether a pool point could still turn it
   * @returns {Promise<ChatMessage>} The card
   */
  const checkCard = (actor, value, available) => ChatMessage.create({ content: "", whisper: ["gm"], flags: { eclipsephase: {
    roll: { strikeCheck: { actorUuid: actor.uuid, check: "confused", id: "c1" }, alternatives: { originalResult: rollCalc(value, 10) } },
    taskCard: { data: { rollResult: value, alternatives: { options: { available } } }, targets: [] }
  } } });

  test("a failed check with no pool to spend has the table decide at once, with the dice shown as a roll card shows them and seen as the check was", async () => {
    const ana = target();
    const card = await checkCard(ana, 80, false);
    seedRolls([60]);
    await settleStrikeCheck({ actorUuid: ana.uuid, check: "confused", id: "c1" }, rollCalc(80, 10), 80, card);
    const table = createdMessages.at(-1);

    expect(table.content).toContain("ep2e.chat.confusion.flee");
    expect(table.content).toContain("<strong>60</strong>");
    expect(table.content).toContain("ep2e.chat.confusion.rollTitle");
    expect(table.content).not.toContain("&lt;strong&gt;");
    expect(table.whisper).toEqual(["gm"]);
    expect(conditionsOn(ana)).toEqual([]);
  });

  test("the table card sets its headline as markup, so a name in bold is bold", async () => {
    const html = await foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/chat/table-roll.html", { icon: "fa-question", headline: "Confused: <strong>Ana</strong>", outcome: "x", total: "07", rollTitle: "t", diceBreakdown: { hundreds: {} } });

    expect(html).toContain("Confused: <strong>Ana</strong>");
  });

  test("while a pool point could still turn it, nothing is rolled until the result is accepted - a pass then lets them act as normal, a failure has the table decide, once", async () => {
    const ana = target();
    const card = await checkCard(ana, 80, true);
    const check = card.getFlag("eclipsephase", "roll").strikeCheck;
    const before = createdMessages.length;
    await settleStrikeCheck(check, rollCalc(80, 10), 80, card);
    await settleStrikeCheck(check, rollCalc(5, 10), 5, card, { byPool: true });
    expect(createdMessages.length).toBe(before);

    await card.update({ "flags.eclipsephase.roll.alternatives.spent": true, "flags.eclipsephase.roll.alternatives.result": rollCalc(5, 10) });
    await acceptStrikeCheck(card);
    expect(createdMessages.at(-1).content).toContain("ep2e.chat.confusion.clear");
    expect(await acceptStrikeCheck(card)).toBeNull();

    const failed = await checkCard(ana, 80, true);
    seedRolls([10]);
    await acceptStrikeCheck(failed);
    expect(createdMessages.at(-1).content).toContain("ep2e.chat.confusion.mutter");
  });
});

describe("the 2.9 migration", () => {
  test("Pain Tolerance and Anti-Glare get the effect saying what they protect against, once; other items nothing", () => {
    const item = (name, type, effects = []) => ({ name, type, img: "x.svg", effects });
    const [one] = _ep29_markerEffects(item("Pain Tolerance I", "traits"));
    const [two] = _ep29_markerEffects(item("Pain Tolerance II", "traits"));
    const [glare] = _ep29_markerEffects(item("Anti-Glare", "ware"));

    expect(one.system.changes[0]).toMatchObject({ key: "system.additionalSystems.painTolerance", value: 1 });
    expect(two.system.changes[0]).toMatchObject({ key: "system.additionalSystems.painTolerance", value: 2 });
    expect(glare.system.changes[0]).toMatchObject({ key: "system.additionalSystems.antiGlare", value: true });
    expect(_ep29_markerEffects(item("Pain Tolerance I", "traits", [{ system: { changes: [{ key: "system.additionalSystems.painTolerance" }] } }]))).toEqual([]);
    expect(_ep29_markerEffects(item("Anti-Glare", "gear"))).toEqual([]);
    expect(_ep29_markerEffects(item("Pain Tolerance III", "traits"))).toEqual([]);
  });
});
