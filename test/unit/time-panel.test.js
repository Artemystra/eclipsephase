import { isRunningEffect, watchedActors, runningEffectRows } from "../../module/apps/time-panel.js";
import { makeActor, resetWorld } from "../setup/factories.js";

/**
 * Registers an actor as a connected player's assigned character, which is who the panel watches.
 * @param {Actor} actor - The character
 * @param {Object} [options] - Whether the user is connected and whether they are a GM
 * @returns {void}
 */
function assignToPlayer(actor, { active = true, isGM = false } = {}) {
  game.users.contents ??= [];
  game.users.contents.push({ id: `user-${actor.id}`, active, isGM, character: actor });
  game.users[Symbol.iterator] = function* () { yield* game.users.contents; };
}

beforeEach(() => {
  resetWorld();
  game.users.contents = [];
  game.users[Symbol.iterator] = function* () { yield* game.users.contents; };
});

describe("isRunningEffect", () => {
  test("an effect with a duration counts", () => {
    expect(isRunningEffect(new ActiveEffect({ name: "Kick", duration: { value: 8, units: "hours" } }))).toBe(true);
  });

  test("a system temporary effect counts even without a duration", () => {
    const effect = new ActiveEffect({ name: "Temp Ignore Wound", flags: { eclipsephase: { effectKey: "woundIgnore" } } });
    expect(isRunningEffect(effect)).toBe(true);
  });

  test("a permanent effect from ware does not", () => {
    expect(isRunningEffect(new ActiveEffect({ name: "Neurachem" }))).toBe(false);
  });
});

describe("watchedActors", () => {
  test("it lists the assigned characters of connected players", () => {
    const player = makeActor({ type: "character", name: "Hex" });
    assignToPlayer(player);
    expect(watchedActors().map(actor => actor.name)).toEqual(["Hex"]);
  });

  test("it leaves out the GM and anyone not connected", () => {
    assignToPlayer(makeActor({ type: "character", name: "Keeper" }), { isGM: true });
    assignToPlayer(makeActor({ type: "character", name: "Away" }), { active: false });
    expect(watchedActors()).toEqual([]);
  });
});

describe("runningEffectRows", () => {
  test("it reports a timed effect with its owner and marks whether it sits on an item", () => {
    const actor = makeActor({
      type: "character",
      name: "Hex",
      effects: [{ name: "Kick", duration: { value: 8, units: "hours" } }],
      items: [{ _id: "sleight1", name: "Bolt", type: "aspect", system: { active: true }, effects: [{ name: "Bolt", flags: { eclipsephase: { chiPushBoost: true } } }] }]
    });
    assignToPlayer(actor);

    const rows = runningEffectRows();
    expect(rows.map(row => row.name)).toEqual(["Bolt", "Kick"]);
    expect(rows.find(row => row.name === "Kick")).toMatchObject({ owner: "Hex", onItem: false });
    expect(rows.find(row => row.name === "Bolt")).toMatchObject({ owner: "Hex", onItem: true });
  });

  test("a permanent effect is left out", () => {
    assignToPlayer(makeActor({ type: "character", name: "Hex", effects: [{ name: "Neurachem" }] }));
    expect(runningEffectRows()).toEqual([]);
  });

  test("an expired effect is still listed, flagged as expired", () => {
    assignToPlayer(makeActor({
      type: "character",
      name: "Hex",
      effects: [{ name: "Kick", duration: { value: 8, units: "hours", expired: true } }]
    }));
    expect(runningEffectRows()[0]).toMatchObject({ name: "Kick", expired: true });
  });
});
