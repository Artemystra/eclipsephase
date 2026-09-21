import { makeActor, makeActorFromFixture, fixtureNames, resetWorld } from "../setup/factories.js";

describe("EPactor.prepareData", () => {
  beforeEach(() => resetWorld());

  for (const name of fixtureNames()) {
    test(`derives stable data for ${name}`, () => {
      const actor = makeActorFromFixture(name);
      expect(actor.system).toMatchSnapshot();
    });
  }

  test("repeated preparation is idempotent", () => {
    const actor = makeActorFromFixture("character-basic");
    const first = JSON.stringify(actor.system);
    actor.prepareData();
    expect(JSON.stringify(actor.system)).toEqual(first);
  });

  test("a type the system does not manage is skipped by the character pipeline", () => {
    const shop = makeActor({ type: "shop", name: "Stub Shop", system: { acceptsSales: true } });
    expect(shop.system.pools).toBeUndefined();
    expect(shop.system.acceptsSales).toBe(true);
  });

  test("the Psi trait effect reaches the actor", () => {
    const actor = makeActorFromFixture("character-psi");
    expect(actor.system.additionalSystems.hasPsi).toEqual(2);
  });

  test("the Cyberbrain marker is readable on a sleeved character", () => {
    const actor = makeActorFromFixture("character-cyberbrain");
    const ware = actor.items.find(item => item.type === "ware");
    const keys = ware.effects.flatMap(effect => effect.changes.map(change => change.key));
    expect(keys).toContain("flags.eclipsephase.grantsCyberbrain");
  });
});
