import { isHit, signed, TASK_RESULT } from "../../module/rolls/dice.js";
import { isTimedSpan, SECONDS_PER } from "../../module/common/time.js";
import { ownersAndGMs, actorAudience, findCompendiumItem, cloneCompendiumItem, escapeText } from "../../module/common/general-sheet-functions.js";
import { boundToActiveBody } from "../../module/common/morp-functions.js";
import { makeActor, resetWorld, registerSystemPacks } from "../setup/factories.js";

beforeEach(() => resetWorld());

describe("the shared roll helpers", () => {
  test("a hit is any success - ordinary, critical or automatic - and nothing else", () => {
    const hits = Object.values(TASK_RESULT).filter(isHit).sort((a, b) => a - b);
    expect(hits).toEqual([TASK_RESULT.SUCCESS, TASK_RESULT.SUCCESS_ONE, TASK_RESULT.SUCCESS_TWO, TASK_RESULT.CRITICAL_SUCCESS, TASK_RESULT.AUTOSUCCESS].sort((a, b) => a - b));
  });

  test("a modifier is shown with its sign, zero without one", () => {
    expect([signed(10), signed(-20), signed(0), signed("5")]).toEqual(["+10", "-20", "0", "+5"]);
  });
});

describe("the shared time helpers", () => {
  test("a span is timed only with a positive value and units", () => {
    expect([isTimedSpan({ value: 1, units: "hours" }), isTimedSpan({ value: null, units: "hours" }), isTimedSpan({ value: 2, units: "" }), isTimedSpan(undefined)]).toEqual([true, false, false, false]);
  });

  test("every unit a drug records has its seconds", () => {
    expect(SECONDS_PER).toEqual({ seconds: 1, minutes: 60, hours: 3600, days: 86400 });
  });
});

describe("the shared card and compendium helpers", () => {
  test("an owner-only card goes to the actor's owners and every GM", () => {
    const realFilter = game.users.filter;
    game.users.filter = predicate => [{ id: "gm-1", isGM: true }, { id: "owner-1", isGM: false }, { id: "stranger", isGM: false }].filter(predicate);
    const actor = makeActor({ type: "character" });
    actor.testUserPermission = user => user.id === "owner-1";

    try {
      expect(ownersAndGMs(actor)).toEqual(["gm-1", "owner-1"]);
    } finally {
      game.users.filter = realFilter;
    }
  });

  test("a card about a player character is public, one about anyone else goes to the GMs", () => {
    expect(actorAudience(makeActor({ type: "character" }))).toBeNull();
    expect(Array.isArray(actorAudience(makeActor({ type: "npc" })))).toBe(true);
  });

  test("a compendium item is found by name and cloned without its id and folder", async () => {
    registerSystemPacks();

    const trait = await findCompendiumItem("eclipsephase.traits", "Addiction I");
    const data = cloneCompendiumItem(trait);

    expect(trait.name).toBe("Addiction I");
    expect(data._id).toBeUndefined();
    expect(data.folder).toBeUndefined();
    expect(await findCompendiumItem("eclipsephase.traits", "No Such Trait")).toBeNull();
  });

  test("text is made safe for markup", () => {
    expect(escapeText('<b>"x" & y</b>')).not.toMatch(/[<>"]/);
    expect(escapeText(null)).toBe("");
  });
});

describe("the shared body rule", () => {
  test("ware works in the sleeved morph, in the jammed body while jamming, and in its own body if it keeps working while jamming", () => {
    const actor = makeActor({ type: "character", system: { activeMorph: "morph1", activeJam: "drone1" } });
    const ware = (boundTo, keepsJamming = false) => ({ system: { boundTo, additionalSystems: { staysActiveWhileJamming: keepsJamming } } });

    expect(boundToActiveBody(actor, ware("drone1"))).toBe(true);
    expect(boundToActiveBody(actor, ware("morph1"))).toBe(false);
    expect(boundToActiveBody(actor, ware("morph1", true))).toBe(true);
    expect(boundToActiveBody(actor, ware(null))).toBe(true);
    expect(boundToActiveBody(makeActor({ type: "npc" }), ware("anything"))).toBe(true);
  });
});
