import { _ep25_migrateKiSubStrain, migrationPre25Needed, _ep25_ACTOR_STEPS } from "../../module/common/migration.js";

const { ForcedDeletion } = foundry.data.operators;
const KI_STRAINS = ["crucible", "redline", "signal", "ruin", "colony"];
const PSI_ARCHETYPES = ["architect", "beast", "haunter", "stranger", "xenomorph"];

/**
 * The influence choices one sub-strain carries, as a 2.3 character stored them.
 * @param {String} mark - Something recognisable in every description, to prove the values travel
 * @returns {Object} The influence fields
 */
function choices(mark) {
  return Object.fromEntries([2, 3, 4, 5, 6].map(n => [`influence${n}`, { label: `label${n}`, description: `${mark}${n}` }]));
}

/**
 * An actor whose sub-strain bucket holds whichever archetypes are named.
 * @param {String[]} archetypes - The keys to fill
 * @returns {Object} A stand-in actor
 */
function actorWith(archetypes) {
  const byArchetype = Object.fromEntries(archetypes.map(a => [a, choices(a)]));
  return { name: "Migrant", system: { subStrain: { label: archetypes[0] ?? "", byArchetype } } };
}

describe("moving the Ki sub-strains into the module's flags", () => {
  test("every Ki choice is copied to the flag path the module reads", () => {
    const update = _ep25_migrateKiSubStrain(actorWith(KI_STRAINS));

    for (const strain of KI_STRAINS) {
      expect(update[`flags.eclipsephase-ki.subStrain.${strain}`]).toEqual(choices(strain));
    }
  });

  test("the values survive the move rather than being replaced by defaults", () => {
    const update = _ep25_migrateKiSubStrain(actorWith(["redline"]));
    const moved = update["flags.eclipsephase-ki.subStrain.redline"];

    expect(moved.influence2.description).toEqual("redline2");
    expect(moved.influence6.label).toEqual("label6");
  });

  test("the old system keys are deleted, not left behind as a second copy", () => {
    const update = _ep25_migrateKiSubStrain(actorWith(KI_STRAINS));

    for (const strain of KI_STRAINS) {
      expect(update[`system.subStrain.byArchetype.${strain}`]).toBeInstanceOf(ForcedDeletion);
    }
  });

  test("a copy is taken, so the update does not alias the actor's own data", () => {
    const actor = actorWith(["colony"]);
    const update = _ep25_migrateKiSubStrain(actor);

    expect(update["flags.eclipsephase-ki.subStrain.colony"]).not.toBe(actor.system.subStrain.byArchetype.colony);
  });
});

describe("what the migration leaves alone", () => {
  test("the Psi archetypes are not touched", () => {
    const update = _ep25_migrateKiSubStrain(actorWith(PSI_ARCHETYPES));
    expect(update).toBeNull();
  });

  test("a mixed bucket moves only the Ki half", () => {
    const update = _ep25_migrateKiSubStrain(actorWith(["architect", "crucible"]));

    expect(Object.keys(update)).toEqual([
      "flags.eclipsephase-ki.subStrain.crucible",
      "system.subStrain.byArchetype.crucible"
    ]);
  });

  test("an actor with no sub-strain data at all needs no update", () => {
    expect(_ep25_migrateKiSubStrain({ name: "Empty", system: {} })).toBeNull();
    expect(_ep25_migrateKiSubStrain({ name: "Empty", system: { subStrain: { byArchetype: {} } } })).toBeNull();
  });

  test("an empty Ki bucket is not worth an update either", () => {
    const actor = { name: "Blank", system: { subStrain: { byArchetype: { crucible: {} } } } };
    expect(_ep25_migrateKiSubStrain(actor)).toBeNull();
  });
});

describe("running it twice", () => {
  test("a second pass finds nothing left to move", () => {
    const actor = actorWith(["signal"]);
    expect(_ep25_migrateKiSubStrain(actor)).not.toBeNull();

    delete actor.system.subStrain.byArchetype.signal;
    expect(_ep25_migrateKiSubStrain(actor)).toBeNull();
  });

  test("an actor already carrying the flags is not migrated again", () => {
    const actor = { name: "Done", flags: { "eclipsephase-ki": { subStrain: { ruin: choices("ruin") } } }, system: { subStrain: { byArchetype: {} } } };
    expect(_ep25_migrateKiSubStrain(actor)).toBeNull();
  });
});

describe("whether the migration is offered at all", () => {
  /**
   * Puts the given actors in the world, so the precheck has something to look at.
   * @param {Object[]} actors - Stand-in actors
   * @returns {void}
   */
  function world(actors) {
    game.actors.clear();
    actors.forEach((actor, index) => game.actors.set(`a${index}`, actor));
  }

  /**
   * An actor of a given type carrying one archetype's choices.
   * @param {String} type - The actor type
   * @param {String} archetype - The sub-strain to fill
   * @returns {Object} A stand-in actor
   */
  function member(type, archetype) {
    return { ...actorWith([archetype]), type };
  }

  test("a world without any Ki data is never asked to migrate", () => {
    world([member("character", "architect"), member("npc", "beast")]);
    expect(migrationPre25Needed()).toBe(false);
  });

  test("an empty world is never asked either", () => {
    world([]);
    expect(migrationPre25Needed()).toBe(false);
  });

  test("one Ki character anywhere is enough to offer it", () => {
    world([member("character", "architect"), member("character", "redline")]);
    expect(migrationPre25Needed()).toBe(true);
  });

  test("NPCs and goons count too", () => {
    world([member("goon", "signal")]);
    expect(migrationPre25Needed()).toBe(true);
  });

  test("an actor type the migration ignores does not trigger it", () => {
    world([{ ...actorWith(["colony"]), type: "shop" }]);
    expect(migrationPre25Needed()).toBe(false);
  });
});

describe("the precheck and the migration loop cannot drift apart", () => {
  /**
   * Puts the given actors in the world.
   * @param {Object[]} actors - Stand-in actors
   * @returns {void}
   */
  function world(actors) {
    game.actors.clear();
    actors.forEach((actor, index) => game.actors.set(`a${index}`, actor));
  }

  /**
   * An actor of a given type carrying one archetype's choices.
   * @param {String} type - The actor type
   * @param {String} archetype - The sub-strain to fill
   * @returns {Object} A stand-in actor
   */
  function member(type, archetype) {
    return { ...actorWith([archetype]), type };
  }

  test("every step the loop runs is a step the precheck asks about", () => {
    for (const archetype of [...KI_STRAINS, ...PSI_ARCHETYPES]) {
      const actor = member("character", archetype);
      world([actor]);

      const anyStepHasWork = _ep25_ACTOR_STEPS.some(step => step.map(actor) !== null);

      expect(migrationPre25Needed()).toEqual(anyStepHasWork);
    }
  });

  test("an unmigrated Psi character is work the precheck reports, now that 2.3 rides along with 2.5", () => {
    world([{ type: "character", name: "Pre-2.3", system: { subStrain: { label: "architect", influence2: { label: "l", description: "d" } } } }]);
    expect(migrationPre25Needed()).toBe(true);
  });

  test("a Psi character whose table already moved is not offered again", () => {
    world([member("character", "architect")]);
    expect(migrationPre25Needed()).toBe(false);
  });

  test("an actor with nothing for any step reports no work", () => {
    world([{ type: "character", name: "Blank", system: { subStrain: { byArchetype: {} } } }]);
    expect(migrationPre25Needed()).toBe(false);
  });

  test("each step carries a label, so a failure names itself in the log", () => {
    for (const step of _ep25_ACTOR_STEPS) {
      expect(typeof step.label).toEqual("string");
      expect(step.label.length).toBeGreaterThan(0);
      expect(typeof step.map).toEqual("function");
    }
  });
});
