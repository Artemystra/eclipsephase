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
      items: [{ _id: "kick1", name: "Kick", type: "drug", system: { active: true }, effects: [{ name: "Kick", duration: { expired: true }, changes: CHANGE }] }]
    });
    expect(actor.items.get("kick1").effects[0].isSuppressed).toBe(true);
  });

  test("the body rules still suppress an unexpired effect on an item that is not at hand", () => {
    const actor = makeActor({
      type: "character",
      items: [{ _id: "kick2", name: "Kick", type: "drug", system: { active: false }, effects: [{ name: "Kick", changes: CHANGE }] }]
    });
    expect(actor.items.get("kick2").effects[0].isSuppressed).toBe(true);
  });
});
