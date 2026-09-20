import EPactor from "../../module/actor/EPactor.js";
import { makeActor, makeActorFromFixture, makeItem, resetWorld } from "../setup/factories.js";

const ACTOR_HOOKS = [
  "eclipsephase.prepareActorMods",
  "eclipsephase.prepareActorStatus",
  "eclipsephase.prepareActorDerived"
];

/**
 * The actor hooks that fired, in order.
 * @returns {String[]} The hook names
 */
function firedActorHooks() {
  return global.__ep.hookCalls.map(call => call.event).filter(event => ACTOR_HOOKS.includes(event));
}

describe("actor data preparation hooks", () => {
  beforeEach(() => resetWorld());

  test("all three fire exactly once per preparation, in order", () => {
    makeActorFromFixture("character-basic");
    expect(firedActorHooks()).toEqual(ACTOR_HOOKS);
  });

  test("each receives the actor and its system data", () => {
    const seen = {};
    for (const hook of ACTOR_HOOKS) Hooks.on(hook, (actor, actorModel) => { seen[hook] = { actor, actorModel }; });

    const actor = makeActorFromFixture("character-basic");

    for (const hook of ACTOR_HOOKS) {
      expect(seen[hook].actor).toBe(actor);
      expect(seen[hook].actorModel).toBe(actor.system);
    }
  });

  test("a modifier contributed in prepareActorMods survives into the derived values", () => {
    Hooks.on("eclipsephase.prepareActorMods", (actor, actorModel) => { actorModel.mods.durmod = "+10"; });

    const withHook = makeActorFromFixture("character-basic");
    const durWithHook = withHook.system.health.physical.max;

    resetWorld();
    const plain = makeActorFromFixture("character-basic");

    expect(durWithHook).toEqual(plain.system.health.physical.max + 10);
  });

  test("a status modifier contributed in prepareActorStatus reaches the summed total", () => {
    Hooks.on("eclipsephase.prepareActorStatus", (actor, actorModel) => {
      actorModel.currentStatus.specialModifiers.push({ label: "ep2e.spike.status", modifier: -20, flag: "spike" });
    });

    const actor = makeActorFromFixture("character-basic");

    expect(actor.system.currentStatus.specialModifierSum).toEqual(-20);
    expect(actor.system.currentStatus.statusPresent).toBe(true);
  });

  test("a listener that throws is swallowed and preparation still finishes", () => {
    Hooks.on("eclipsephase.prepareActorMods", () => { throw new Error("broken module"); });

    const actor = makeActorFromFixture("character-basic");

    expect(actor.system.health.physical.max).toBeGreaterThan(0);
    expect(global.__ep.notifications.error.join(" ")).toContain("broken module");
  });

  test("the derived hook sees values the earlier hooks produced", () => {
    let derivedDur = null;
    Hooks.on("eclipsephase.prepareActorMods", (actor, actorModel) => { actorModel.mods.durmod = "+5"; });
    Hooks.on("eclipsephase.prepareActorDerived", (actor, actorModel) => { derivedDur = actorModel.health.physical.max; });

    const actor = makeActorFromFixture("character-basic");

    expect(derivedDur).toEqual(actor.system.health.physical.max);
  });
});

describe("the managed type guard", () => {
  beforeEach(() => resetWorld());

  test("names the three actor types this class prepares", () => {
    expect(EPactor.MANAGED_TYPES).toEqual(["character", "npc", "goon"]);
  });

  test("a shop is skipped entirely, hooks included", () => {
    makeActorFromFixture("shop-basic");
    expect(firedActorHooks()).toEqual([]);
  });

  test("an actor type the system does not manage passes through untouched", () => {
    const foreign = makeActor({ type: "shop", name: "Stand-in", system: { acceptsSales: true } });
    foreign.type = "some-module.thing";
    foreign.prepareData();

    expect(firedActorHooks()).toEqual([]);
    expect(foreign.system.pools).toBeUndefined();
  });

  test("character, npc and goon all run the pipeline", () => {
    for (const fixture of ["character-basic", "npc-basic", "goon-basic"]) {
      resetWorld();
      makeActorFromFixture(fixture);
      expect(firedActorHooks()).toEqual(ACTOR_HOOKS);
    }
  });
});

describe("item data preparation hook", () => {
  beforeEach(() => resetWorld());

  test("fires with the item and its system data", async () => {
    let seen = null;
    Hooks.on("eclipsephase.prepareItemData", (item, itemModel) => { seen = { item, itemModel }; });

    const item = makeItem({ type: "morph", name: "Ghost", system: { morphPoints: 2 } });
    await item.prepareData();

    expect(seen.item).toBe(item);
    expect(seen.itemModel).toBe(item.system);
  });

  test("a cost tier written in the hook wins over the derived one", async () => {
    Hooks.on("eclipsephase.prepareItemData", (item, itemModel) => { itemModel.cost = "rare"; });

    const item = makeItem({ type: "morph", system: { morphPoints: 0 } });
    await item.prepareData();

    expect(item.system.cost).toEqual("rare");
  });
});
