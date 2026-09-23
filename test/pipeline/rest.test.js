import { restingListeners } from "../../module/rolls/resting.js";
import { makeActorFromFixture, resetWorld } from "../setup/factories.js";

/**
 * A stand-in for the sheet markup the rest listeners attach to. Records the click handler of every
 * element carrying one of the requested classes, so a test can invoke it directly.
 * @param {Object} handlers - Collector the recorded handlers are written into, keyed by class
 * @returns {Object} An object shaped like the sheet element the listeners receive
 */
function fakeSheet(handlers) {
  return {
    querySelectorAll: selector => [{
      dataset: {},
      addEventListener: (event, fn) => { if (event === "click") handlers[selector] = fn; }
    }]
  };
}

/**
 * Triggers a rest of the given kind on an actor and returns once it settled.
 * @param {Actor} actor - The resting actor
 * @param {String} restType - Either "short" or "long"
 * @returns {Promise<void>} Resolves when the handler finished
 */
async function rest(actor, restType) {
  const handlers = {};
  restingListeners(fakeSheet(handlers), actor);
  await handlers[".rest"]({ currentTarget: { dataset: { resttype: restType } } });
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
