import { takeDose, offerDose, claimDose, drugAddiction, logDose, doseCounts, demandWillpower, requestAddictionCheck, becomeAddicted, registerAddictionHooks } from "../../module/common/doses.js";
import { makeActor, resetWorld, registerSystemPacks, seedRolls } from "../setup/factories.js";
import { TASK_RESULT } from "../../module/rolls/dice.js";

const { createdMessages } = global.__ep;
const SKIP_DIALOG = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } };
const HOUR = 3600;

/**
 * A character in a biomorph carrying one pack of a drug.
 * @param {Object} [drug] - Drug system fields to override
 * @param {String} [morphType] - The sleeved morph's type
 * @returns {Actor} The prepared actor
 */
function user(drug = {}, morphType = "bio") {
  return makeActor({
    type: "character",
    system: { activeMorph: "morph1", aptitudes: { wil: { value: 15 } } },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: morphType } },
      { _id: "drug1", name: "Juice", type: "drug", system: { active: true, drugType: "biochem", category: "drug", oral: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 1, units: "hours" }, addictionType: "mental", addictionMod: "-20", ...drug } }
    ]
  });
}

/**
 * The addiction check a demand posted for the actor, as a roll would carry it.
 * @param {Actor} actor - The actor
 * @param {String} type - The addiction type
 * @returns {Object} The addictionCheck
 */
function failedCheck(actor, type = "mental") {
  return { actorUuid: actor.uuid, name: "Juice", type, modifier: -20, checkId: "check-1" };
}

beforeEach(() => {
  resetWorld();
  registerSystemPacks();
  game.time.worldTime = 10 * 86400;
  registerAddictionHooks();
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("a drug's addiction", () => {
  test("is read off the sheet: type and modifier, none for a drug that is not addictive", () => {
    expect(drugAddiction({ addictionType: "mental", addictionMod: "-20" })).toEqual({ type: "mental", modifier: -20 });
    expect(drugAddiction({ addictionType: "physical", addictionMod: "-" })).toEqual({ type: "physical", modifier: 0 });
    expect(drugAddiction({ addictionType: "none", addictionMod: "-10" })).toBeNull();
  });
});

describe("counting doses", () => {
  test("every dose taken is noted, and the last 24 hours and 7 days are counted apart", async () => {
    const actor = user();
    const now = game.time.worldTime;
    await logDose(actor, "Juice", now - 3 * 86400);
    await logDose(actor, "Juice", now - 2 * HOUR);
    await logDose(actor, "Juice", now);

    expect(doseCounts(actor, "Juice", now)).toEqual({ day: 2, week: 3 });
  });

  test("a dose older than a week is forgotten", async () => {
    const actor = user();
    const now = game.time.worldTime;
    await logDose(actor, "Juice", now - 8 * 86400);
    await logDose(actor, "Kick", now);

    expect(doseCounts(actor, "Juice", now).week).toBe(0);
    expect(actor.getFlag("eclipsephase", "doseLog").Juice).toBeUndefined();
  });

  test("taking a dose counts it", async () => {
    const actor = user();

    await takeDose(actor, actor.items.get("drug1"));

    expect(doseCounts(actor, "Juice")).toEqual({ day: 1, week: 1 });
  });
});

describe("the GM's controls on the dose card", () => {
  test("an addictive drug's card carries them, for the GM only", async () => {
    const actor = user();

    await takeDose(actor, actor.items.get("drug1"));

    const card = createdMessages.find(message => message.content?.includes("ep2e.chat.dose.taken"));
    expect(card.content).toContain("demandWillpower");
    expect(card.content).toContain("doseHistory");
    expect(card.content).toMatch(/dose-addiction gmOnlyControl/);
  });

  test("a drug that is not addictive shows none", async () => {
    const actor = user({ addictionType: "none" });

    await takeDose(actor, actor.items.get("drug1"));

    expect(createdMessages.find(message => message.content?.includes("ep2e.chat.dose.taken")).content).not.toContain("demandWillpower");
  });

  test("a dose handed over carries them for the one who took it", async () => {
    const giver = user();
    const taker = user();
    game.user.isGM = true;
    const { message } = await offerDose(giver, giver.items.get("drug1"));

    await claimDose(message, taker);

    expect(message.content).toContain(`data-actor-uuid="${taker.uuid}"`);
    expect(message.content).toContain("demandWillpower");
  });
});

describe("the WIL Check", () => {
  test("the GM's demand posts a card for the actor's owners to roll it from, at the drug's modifier", async () => {
    const actor = user();

    const card = await demandWillpower(actor.uuid, "Juice");

    expect(card.getFlag("eclipsephase", "addictionCheck")).toMatchObject({ name: "Juice", type: "mental", modifier: -20 });
    expect(card.content).toContain("rollAddictionCheck");
  });

  test("a failed check adds Addiction I for the drug, on the ego for a mental addiction", async () => {
    const actor = user();
    const card = await demandWillpower(actor.uuid, "Juice");

    seedRolls([95]);
    await requestAddictionCheck(card.id, SKIP_DIALOG);
    for (let wait = 0; wait < 50 && !actor.items.some(item => item.name === "Addiction I (Juice)"); wait++) await new Promise(resolve => setTimeout(resolve, 0));

    const trait = actor.items.find(item => item.name === "Addiction I (Juice)");
    expect(trait.system).toMatchObject({ ego: true, morph: false });
  });

  test("a physical addiction goes on the sleeved biomorph, and none can take hold in a synthmorph", async () => {
    const bio = user();
    const synth = user({}, "synth");

    await becomeAddicted(failedCheck(bio, "physical"));
    await becomeAddicted(failedCheck(synth, "physical"));

    expect(bio.items.find(item => item.name === "Addiction I (Juice)").system).toMatchObject({ ego: false, morph: true, boundTo: "morph1" });
    expect(synth.items.some(item => item.name.startsWith("Addiction"))).toBe(false);
  });

  test("a drug addictive both ways hooks ego and body each", async () => {
    const actor = user();

    await becomeAddicted(failedCheck(actor, "both"));

    expect(actor.items.filter(item => item.name === "Addiction I (Juice)").map(item => item.system.ego).sort()).toEqual([false, true]);
  });

  test("each further failure raises the addiction one level, replacing the old one, up to level III", async () => {
    const actor = user();

    for (let failure = 0; failure < 4; failure++) await becomeAddicted({ ...failedCheck(actor), checkId: `check-${failure}` });

    expect(actor.items.filter(item => item.name.startsWith("Addiction")).map(item => item.name)).toEqual(["Addiction III (Juice)"]);
    expect(createdMessages.some(message => message.content?.includes("ep2e.chat.dose.addictionRaisedEgo"))).toBe(true);
  });

  test("a pool spend that turns a raising check into a pass brings the old level back", async () => {
    const actor = user();
    await becomeAddicted({ ...failedCheck(actor), checkId: "first" });
    await becomeAddicted({ ...failedCheck(actor), checkId: "second" });

    Hooks.callAll("eclipsephase.poolResult", { context: { addictionCheck: { ...failedCheck(actor), checkId: "second" } }, newResult: TASK_RESULT.SUCCESS });
    for (let wait = 0; wait < 50 && !actor.items.some(item => item.name === "Addiction I (Juice)"); wait++) await new Promise(resolve => setTimeout(resolve, 0));

    expect(actor.items.filter(item => item.name.startsWith("Addiction")).map(item => item.name)).toEqual(["Addiction I (Juice)"]);
  });

  test("the card says whether the ego, the body or both are hooked", async () => {
    await becomeAddicted(failedCheck(user(), "mental"));
    await becomeAddicted(failedCheck(user(), "physical"));
    await becomeAddicted(failedCheck(user(), "both"));

    const said = key => createdMessages.some(message => message.content?.includes(key));
    expect([said("ep2e.chat.dose.addictedEgo"), said("ep2e.chat.dose.addictedBody"), said("ep2e.chat.dose.addictedBoth")]).toEqual([true, true, true]);
  });

  test("a player rolling from the GM's card has the GM mark it as rolled", async () => {
    const actor = user();
    const card = await demandWillpower(actor.uuid, "Juice");
    card.author = "gm-user";
    game.user.isGM = false;
    game.users.activeGM = { id: "gm-1" };
    const emitted = [];
    const realEmit = game.socket.emit;
    game.socket.emit = (name, payload) => emitted.push(payload);

    try {
      seedRolls([5]);
      await requestAddictionCheck(card.id, SKIP_DIALOG);
    } finally {
      game.socket.emit = realEmit;
    }

    expect(emitted).toContainEqual({ action: "markAddictionRolled", messageId: card.id });
  });

  test("a pool spend that turns the check into a pass takes the addiction back", async () => {
    const actor = user();
    await becomeAddicted(failedCheck(actor));

    Hooks.callAll("eclipsephase.poolResult", { context: { addictionCheck: failedCheck(actor) }, newResult: TASK_RESULT.SUCCESS });
    for (let wait = 0; wait < 50 && actor.items.some(item => item.name.startsWith("Addiction")); wait++) await new Promise(resolve => setTimeout(resolve, 0));

    expect(actor.items.some(item => item.name.startsWith("Addiction"))).toBe(false);
  });
});
