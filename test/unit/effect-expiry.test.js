import { makeActor, resetWorld } from "../setup/factories.js";

const CHANGE = [{ key: "system.pools.vigor.mod", value: "+2", type: "add" }];

/**
 * An ActiveEffect standing on its own, the way an actor-level timed effect does.
 * @param {Object} duration - The effect's duration data
 * @returns {ActiveEffect} The effect
 */
function looseEffect(duration) {
  return new ActiveEffect({ name: "Kick", duration, changes: CHANGE });
}

beforeEach(() => resetWorld());

describe("an effect whose duration ran out", () => {
  test("it is suppressed, so a timed effect stops applying once Foundry marks it expired", () => {
    expect(looseEffect({ expired: true }).isSuppressed).toBe(true);
  });

  test("it is no longer active, which is what keeps its changes out of the actor", () => {
    expect(looseEffect({ expired: true }).active).toBe(false);
  });

  test("an effect that has not expired is left alone", () => {
    expect(looseEffect({ expired: false, value: 8, units: "hours" }).isSuppressed).toBe(false);
    expect(looseEffect({}).isSuppressed).toBe(false);
  });
});

describe("expiry and the body rules together", () => {
  test("an expired effect on an item is suppressed even where the body rules would allow it", () => {
    const actor = makeActor({
      type: "character",
      items: [{ _id: "shades1", name: "Shades", type: "gear", system: { active: true }, effects: [{ name: "Shades", duration: { expired: true }, changes: CHANGE }] }]
    });
    expect(actor.items.get("shades1").effects[0].isSuppressed).toBe(true);
  });

  test("the body rules still suppress an unexpired effect on an item that is not at hand", () => {
    const actor = makeActor({
      type: "character",
      items: [{ _id: "shades2", name: "Shades", type: "gear", system: { active: false }, effects: [{ name: "Shades", changes: CHANGE }] }]
    });
    expect(actor.items.get("shades2").effects[0].isSuppressed).toBe(true);
  });
});

describe("a drug's own effects", () => {
  test.each([true, false])("they never apply from the item, at hand or not (active: %s)", active => {
    const actor = makeActor({
      type: "character",
      items: [{ _id: "kick1", name: "Kick", type: "drug", system: { active }, effects: [{ name: "Kick", changes: CHANGE }] }]
    });
    expect(actor.items.get("kick1").effects[0].isSuppressed).toBe(true);
  });

  test("carrying a drug therefore leaves the pool it would boost untouched", () => {
    const actor = makeActor({
      type: "character",
      items: [{ _id: "kick2", name: "Kick", type: "drug", system: { active: true }, effects: [{ name: "Kick", changes: CHANGE }] }]
    });
    expect(actor.items.get("kick2").effects[0].active).toBe(false);
  });
});

describe("a world actor's dose on its unlinked tokens", () => {
  /**
   * A stand-in for Foundry's duration registry, recording what was handed to it.
   * @param {Boolean} initialized - Whether the registry has been populated yet
   * @returns {Object} The registry
   */
  function registry(initialized = true) {
    const registered = [];
    return { initialized, registered, addFromParent: parent => registered.push(parent) };
  }

  afterEach(() => {
    delete foundry.documents.ActiveEffect;
  });

  test("the copies each token rebuilt are registered, so they run down on the clock", () => {
    const world = makeActor({ type: "character", name: "Dinah" });
    const copies = [makeActor({ type: "character", name: "Dinah 1" }), makeActor({ type: "character", name: "Dinah 2" })];
    world.getDependentTokens = () => copies.map(actor => ({ actor }));
    const tracking = registry();
    foundry.documents.ActiveEffect = { registry: tracking };

    world._updateDependentTokens();

    expect(tracking.registered).toEqual(copies);
  });

  test("nothing is registered before Foundry has populated the registry itself", () => {
    const world = makeActor({ type: "character", name: "Dinah" });
    world.getDependentTokens = () => [{ actor: makeActor({ type: "character" }) }];
    const tracking = registry(false);
    foundry.documents.ActiveEffect = { registry: tracking };

    world._updateDependentTokens();

    expect(tracking.registered).toEqual([]);
  });

  test("a token whose actor is gone is skipped", () => {
    const world = makeActor({ type: "character", name: "Dinah" });
    world.getDependentTokens = () => [{ actor: null }];
    const tracking = registry();
    foundry.documents.ActiveEffect = { registry: tracking };

    expect(() => world._updateDependentTokens()).not.toThrow();
    expect(tracking.registered).toEqual([]);
  });
});
