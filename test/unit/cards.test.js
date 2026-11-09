import { postCheckCard, markCardRolled, rollAptitudeCheck, settleOnRoll, modifiersOnRoll } from "../../module/rolls/cards.js";
import { TASK_RESULT } from "../../module/rolls/dice.js";
import { makeActor, resetWorld, seedRolls } from "../setup/factories.js";

const { createdMessages } = global.__ep;
const SKIP_DIALOG = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } };

/**
 * A character to make checks.
 * @returns {Actor} The prepared actor
 */
function checker() {
  return makeActor({ type: "character", system: { aptitudes: { wil: { value: 15 } } } });
}

beforeEach(() => resetWorld());
afterEach(() => jest.restoreAllMocks());

describe("a check card", () => {
  test("carries its request and a button, for the actor's owners and the GMs", async () => {
    const actor = checker();

    const card = await postCheckCard(actor, "testCheck", { card: { icon: "fa-x", color: "--negative", headline: "Check!" }, button: { action: "rollTest", label: "Roll" }, payload: { what: "it" } });

    expect(card.getFlag("eclipsephase", "testCheck")).toMatchObject({ actorUuid: actor.uuid, what: "it", rolled: false });
    expect(card.content).toContain("rollTest");
    expect(Array.isArray(card.whisper)).toBe(true);
  });

  test("once rolled it keeps a note instead of its button, and says so in its flag", async () => {
    const actor = checker();
    const card = await postCheckCard(actor, "testCheck", { card: { icon: "fa-x", color: "--negative", headline: "Check!" }, button: { action: "rollTest", label: "Roll" } });

    await markCardRolled(card, "testCheck");

    expect(card.content).not.toContain("rollTest");
    expect(card.content).toContain("ep2e.chat.dose.checkRolled");
    expect(card.getFlag("eclipsephase", "testCheck").rolled).toBe(true);
  });

  test("a player who may not change the card asks the active GM to mark it", async () => {
    const card = await postCheckCard(checker(), "testCheck", { card: { headline: "Check!" }, button: { action: "rollTest", label: "Roll" } });
    card.author = "someone-else";
    game.user.isGM = false;
    game.users.activeGM = { id: "gm-1" };
    const emitted = [];
    const realEmit = game.socket.emit;
    game.socket.emit = (name, payload) => emitted.push(payload);

    try {
      await markCardRolled(card, "testCheck");
    } finally {
      game.socket.emit = realEmit;
      game.user.isGM = true;
    }

    expect(emitted).toEqual([{ action: "updateCard", messageId: card.id, key: "testCheck", mutation: "merge", payload: { rolled: true }, extra: {} }]);
  });
});

describe("settling a check from the roll pipeline", () => {
  test("the roll settles once as it lands and again when a pool spend turns it, with its own modifier on it", async () => {
    const settled = [];
    settleOnRoll("testCheck", (payload, passed, { byPool }) => settled.push([payload.what, passed, byPool]));
    modifiersOnRoll("testCheck", payload => [{ text: "Test", value: payload.modifier }]);
    const actor = checker();

    seedRolls([95]);
    await rollAptitudeCheck(actor, "wil", { testCheck: { what: "it", modifier: -20 } }, SKIP_DIALOG);
    Hooks.callAll("eclipsephase.poolResult", { context: { testCheck: { what: "it" }, messageId: "m1" }, newResult: TASK_RESULT.SUCCESS });
    for (let wait = 0; wait < 50 && settled.length < 2; wait++) await new Promise(resolve => setTimeout(resolve, 0));

    expect(settled).toEqual([["it", false, false], ["it", true, true]]);
    expect(createdMessages.some(message => message.content?.includes("Test"))).toBe(true);
  });
});
