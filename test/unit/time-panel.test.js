import { isRunningEffect, watchedActors, rechargeTargets, runningEffectGroups } from "../../module/apps/time-panel.js";
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

describe("who the recharge reset applies to", () => {
  test("it lists the assigned characters of connected players", () => {
    const player = makeActor({ type: "character", name: "Hex" });
    assignToPlayer(player);
    expect(rechargeTargets().map(actor => actor.name)).toEqual(["Hex"]);
  });

  test("it leaves out the GM and anyone not connected", () => {
    assignToPlayer(makeActor({ type: "character", name: "Keeper" }), { isGM: true });
    assignToPlayer(makeActor({ type: "character", name: "Away" }), { active: false });
    expect(rechargeTargets()).toEqual([]);
  });
});

describe("whose effects the list shows", () => {
  test("a GM sees every actor in the world, npcs included", () => {
    game.user.isGM = true;
    makeActor({ type: "character", name: "Hex" });
    makeActor({ type: "npc", name: "Exhuman Brute" });
    expect(watchedActors().map(actor => actor.name).sort()).toEqual(["Exhuman Brute", "Hex"]);
  });

  test("a player sees only their own character, never the GM's", () => {
    const mine = makeActor({ type: "character", name: "Hex" });
    makeActor({ type: "npc", name: "Exhuman Brute" });
    game.user.isGM = false;
    game.user.character = mine;
    expect(watchedActors().map(actor => actor.name)).toEqual(["Hex"]);
  });

  test("a player without a character sees nothing", () => {
    makeActor({ type: "npc", name: "Exhuman Brute" });
    game.user.isGM = false;
    game.user.character = null;
    expect(watchedActors()).toEqual([]);
  });
});

describe("the running-effects list", () => {
  test("it groups effects under the actor carrying them, with a count", () => {
    makeActor({
      type: "character",
      name: "Hex",
      effects: [{ name: "Kick", duration: { value: 8, units: "hours" } }],
      items: [{ _id: "sleight1", name: "Bolt", type: "aspect", system: { active: true }, effects: [{ name: "Bolt", flags: { eclipsephase: { chiPushBoost: true } } }] }]
    });

    const groups = runningEffectGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "Hex", count: 2 });
    expect(groups[0].effects.map(row => row.name)).toEqual(["Bolt", "Kick"]);
  });

  test("it marks which effects sit on an item", () => {
    makeActor({
      type: "character",
      name: "Hex",
      effects: [{ name: "Kick", duration: { value: 8, units: "hours" } }],
      items: [{ _id: "sleight1", name: "Bolt", type: "aspect", system: { active: true }, effects: [{ name: "Bolt", flags: { eclipsephase: { chiPushBoost: true } } }] }]
    });

    const rows = runningEffectGroups()[0].effects;
    expect(rows.find(row => row.name === "Kick").onItem).toBe(false);
    expect(rows.find(row => row.name === "Bolt").onItem).toBe(true);
  });

  test("an actor with nothing running is left out entirely", () => {
    makeActor({ type: "character", name: "Hex", effects: [{ name: "Neurachem" }] });
    expect(runningEffectGroups()).toEqual([]);
  });

  test("an expired effect is still listed, flagged as expired", () => {
    makeActor({
      type: "character",
      name: "Hex",
      effects: [{ name: "Kick", duration: { value: 8, units: "hours", expired: true } }]
    });
    expect(runningEffectGroups()[0].effects[0]).toMatchObject({ name: "Kick", expired: true });
  });

  test("an effect carrying a description offers an info icon, one without does not", () => {
    makeActor({
      type: "character",
      name: "Hex",
      effects: [
        { name: "Kick", description: "A strong stimulant.", duration: { value: 8, units: "hours" } },
        { name: "Bare", duration: { value: 1, units: "hours" } }
      ]
    });

    const rows = runningEffectGroups()[0].effects;
    expect(rows.find(row => row.name === "Kick")).toMatchObject({ hasInfo: true, description: "A strong stimulant." });
    expect(rows.find(row => row.name === "Bare").hasInfo).toBe(false);
  });

  test("groups come back in actor-name order", () => {
    for (const name of ["Zara", "Alix"]) {
      makeActor({ type: "character", name, effects: [{ name: "Kick", duration: { value: 1, units: "hours" } }] });
    }
    expect(runningEffectGroups().map(group => group.name)).toEqual(["Alix", "Zara"]);
  });
});
