import { takeRecharge, rechargesLeft, openRechargeDialog, placeRechargeFlyout, rechargeSegments } from "../../module/rolls/resting.js";
import { JSDOM } from "jsdom";
import { makeActorFromFixture, resetWorld, seedDialogs } from "../setup/factories.js";

/**
 * Takes a recharge of the given kind, as the recharge dialog does once answered.
 * @param {Actor} actor - The resting actor
 * @param {String} restType - Either "short" or "long"
 * @param {Object} [options] - rollMode
 * @returns {Promise<Boolean>} Whether it was taken
 */
function rest(actor, restType, options = {}) {
  return takeRecharge(actor, restType, options);
}

/**
 * Builds an async whose pools are spent and whose Infection Rating is above its floor.
 * @returns {Actor} The prepared actor
 */
function makeRester() {
  const actor = makeActorFromFixture("character-psi");
  actor.system.pools.insight.value = 0;
  actor.system.pools.vigor.value = 0;
  actor.system.pools.moxie.value = 0;
  actor.system.pools.flex.value = 0;
  return actor;
}

describe("postRest", () => {
  beforeEach(() => resetWorld());

  test("fires with the actor, the kind of rest and the payload", async () => {
    let seen = null;
    Hooks.on("eclipsephase.postRest", (actor, restType, updates) => { seen = { actor, restType, updates }; });

    const actor = makeRester();
    await rest(actor, "long");

    expect(seen.actor).toBe(actor);
    expect(seen.restType).toEqual("long");
    expect(Object.keys(seen.updates)).toContain("system.pools.insight.value");
  });

  test("runs before the payload is written, so the hook can still change it", async () => {
    Hooks.on("eclipsephase.postRest", (actor, restType, updates) => {
      updates["system.psiStrain.infection"] = 42;
    });

    const actor = makeRester();
    await rest(actor, "long");

    expect(actor.system.psiStrain.infection).toEqual(42);
  });

  test("a long rest resets the Infection Rating to its floor", async () => {
    const actor = makeRester();
    const floor = actor.system.psiStrain.minimumInfection;

    await rest(actor, "long");

    expect(actor.system.psiStrain.infection).toEqual(floor);
  });

  test("a short rest eases the Infection Rating instead of resetting it", async () => {
    const actor = makeRester();
    const before = actor.system.psiStrain.infection;

    await rest(actor, "short");

    expect(actor.system.psiStrain.infection).toEqual(before - 10);
  });

  test("a listener that throws does not stop the rest from being written", async () => {
    Hooks.on("eclipsephase.postRest", () => { throw new Error("broken rest listener"); });

    const actor = makeRester();
    await rest(actor, "long");

    expect(actor.system.pools.insight.value).toEqual(actor.system.pools.insight.totalInsight);
    expect(global.__ep.notifications.error.join(" ")).toContain("broken rest listener");
  });
});

describe("a recharge reports how long it took", () => {
  beforeEach(() => resetWorld());

  /**
   * The text of every chat message a recharge produced.
   * @returns {String} The messages, flattened
   */
  function posted() {
    return global.__ep.createdMessages.map(message => JSON.stringify(message)).join(" ");
  }

  test("a short recharge names a timeframe on its card", async () => {
    await rest(makeRester(), "short");
    expect(posted()).toMatch(/ep2e\.recharge\.duration\.short(Biomods|Flat)/);
  });

  test("a long recharge names its own timeframe", async () => {
    await rest(makeRester(), "long");
    expect(posted()).toMatch(/ep2e\.recharge\.duration\.long(Biomods|Flat)/);
  });

  test("the timeframe reaches the card through the announcement's time slot", async () => {
    await rest(makeRester(), "short");
    expect(posted()).toContain("ep2e.roll.announce.rest.short");
    expect(posted()).toContain("time");
  });
});

describe("the recharges left", () => {
  beforeEach(() => resetWorld());

  test("a recharge uses up its slot: the long one, or the next short one, until none is left", async () => {
    const actor = makeRester();

    expect(rechargesLeft(actor)).toEqual({ long: true, short: 2, shortSlot: "short1" });
    await rest(actor, "short");
    await rest(actor, "long");
    expect(rechargesLeft(actor)).toEqual({ long: false, short: 1, shortSlot: "short2" });
    await rest(actor, "short");

    expect(await rest(actor, "short")).toBe(false);
    expect(await rest(actor, "long")).toBe(false);
    expect([actor.system.rest.short1, actor.system.rest.short2, actor.system.rest.long]).toEqual([true, true, true]);
  });

  test("the extra recharge adds a third short one", () => {
    const actor = makeRester();
    actor.system.additionalSystems.extraRest = true;
    actor.system.rest.short1 = true;
    actor.system.rest.short2 = true;

    expect(rechargesLeft(actor)).toMatchObject({ short: 1, shortSlot: "shortExtra" });
  });

  test("with nothing left, the dialog does not open and a notice says so", async () => {
    const actor = makeRester();
    Object.assign(actor.system.rest, { short1: true, short2: true, long: true });

    expect(await openRechargeDialog(actor)).toBe(false);
    expect(global.__ep.notifications.warn).toContain("ep2e.skills.restingMenu.warnings.noneLeft");
  });

  test("the dialog's choice is taken, and its card is seen as the dialog's roll mode says: private reaches the GMs and the roller", async () => {
    const actor = makeRester();
    const realFilter = game.users.filter;
    game.users.filter = fn => [{ _id: "gm1", isGM: true, active: true }].filter(fn);
    seedDialogs({ restType: "long", rollMode: "private" });

    try {
      expect(await openRechargeDialog(actor)).toBe(true);
    } finally {
      game.users.filter = realFilter;
    }
    const card = global.__ep.createdMessages.find(message => JSON.stringify(message).includes("ep2e.roll.announce.rest.long"));
    expect(actor.system.rest.long).toBe(true);
    expect([card.blind, card.whisper]).toEqual([false, ["gm1", game.user._id]]);
  });

  test("a public short recharge's card goes to everyone", async () => {
    await rest(makeRester(), "short", { rollMode: "public" });
    const card = global.__ep.createdMessages.find(message => JSON.stringify(message).includes("ep2e.roll.announce.rest.short"));

    expect(card.blind ?? false).toBe(false);
    expect(card.whisper ?? []).toEqual([]);
  });

  test("the dialog offers only what is left: a used-up long recharge is greyed out and the short one chosen", async () => {
    const actor = makeRester();
    actor.system.rest.long = true;
    const wait = jest.spyOn(foundry.applications.api.DialogV2, "wait").mockResolvedValue(null);

    await openRechargeDialog(actor);
    const content = wait.mock.calls[0][0].content;
    wait.mockRestore();

    expect(content).toMatch(/value="long"[^>]*disabled/);
    expect(content).toMatch(/value="short"[^>]*checked/);
    expect(content).toContain('name="rollMode"');
    expect(content).not.toContain('value="blind"');
  });
});

describe("the recharge flyout", () => {
  test("opens right below the battery, flush with its left edge, so the pointer can move into it", () => {
    const { document } = new JSDOM("").window;
    const anchor = document.createElement("span");
    anchor.innerHTML = `<div role="tooltip"></div>`;
    anchor.getBoundingClientRect = () => ({ left: 640, top: 380, bottom: 402, right: 705, width: 65, height: 22 });

    placeRechargeFlyout(anchor);
    const flyout = anchor.querySelector("div[role=tooltip]");

    expect([flyout.style.left, flyout.style.top]).toEqual(["640px", "402px"]);
  });
});

describe("the recharge battery", () => {
  beforeEach(() => resetWorld());

  /**
   * The battery as text: L/S for a long or short segment still to be had, l/s for a used one.
   * @param {Actor} actor - The actor
   * @returns {String} The segments, left to right
   */
  function battery(actor) {
    return rechargeSegments(actor).map(entry => (entry.flex > 1 ? "L" : "S")[entry.used ? "toLowerCase" : "toString"]()).join("");
  }

  test("is full from the left and empty from the right, each segment keeping its size", () => {
    const actor = makeRester();
    expect(battery(actor)).toBe("LSS");
    actor.system.rest.short1 = true;
    expect(battery(actor)).toBe("LSs");
    actor.system.rest.short1 = false;
    actor.system.rest.long = true;
    expect(battery(actor)).toBe("SSl");
    actor.system.rest.short2 = true;
    expect(battery(actor)).toBe("Ssl");
  });

  test("gives the long recharge half the width, also with a third short one", () => {
    const actor = makeRester();
    actor.system.additionalSystems.extraRest = true;
    const segments = rechargeSegments(actor);

    expect(segments.map(entry => entry.flex)).toEqual([3, 1, 1, 1]);
  });
});

