import { _ep25_migrateSubStrainByArchetype } from "../../module/common/migration.js";

const { ForcedDeletion } = foundry.data.operators;
const FLAT_KEYS = ["influence2", "influence3", "influence4", "influence5", "influence6"];

/**
 * An actor as the 2.3 migration sees one: a label plus whichever flat influence fields the
 * pre-2.3 schema left behind.
 * @param {String} label - The selected sub-strain archetype
 * @param {Object} [flat] - The legacy influence fields still in the actor's source
 * @param {Object} [byArchetype] - An already-migrated bucket
 * @returns {Object} The stand-in actor
 */
function actorWith(label, flat = {}, byArchetype = undefined) {
  const subStrain = { label, ...flat };
  if (byArchetype) subStrain.byArchetype = byArchetype;
  return { system: { subStrain } };
}

const legacyFields = {
  influence2: { label: "Two", description: "second" },
  influence4: { label: "Four", description: "fourth" }
};

describe("the 2.3 per-archetype sub-strain migration", () => {
  test("it moves the flat fields into the selected archetype's bucket", () => {
    const update = _ep25_migrateSubStrainByArchetype(actorWith("architect", legacyFields));
    expect(update["system.subStrain.byArchetype.architect"]).toEqual(legacyFields);
  });

  test("it deletes the flat fields with a ForcedDeletion", () => {
    const update = _ep25_migrateSubStrainByArchetype(actorWith("beast", legacyFields));
    for (const key of FLAT_KEYS) {
      expect(update[`system.subStrain.${key}`]).toBeInstanceOf(ForcedDeletion);
    }
  });

  test("no key uses the legacy deletion syntax, which Foundry 14 refuses under FAILURE mode", () => {
    const update = _ep25_migrateSubStrainByArchetype(actorWith("haunter", legacyFields));
    expect(Object.keys(update).filter(key => key.includes("-="))).toEqual([]);
  });

  test("an actor on a label the migration does not cover is left alone", () => {
    expect(_ep25_migrateSubStrainByArchetype(actorWith("", legacyFields))).toBeNull();
    expect(_ep25_migrateSubStrainByArchetype(actorWith("crucible", legacyFields))).toBeNull();
  });

  test("an archetype without flat fields needs no update", () => {
    expect(_ep25_migrateSubStrainByArchetype(actorWith("stranger"))).toBeNull();
  });

  test("it does not run a second time on an already migrated actor", () => {
    const migrated = actorWith("xenomorph", {}, { xenomorph: legacyFields });
    expect(_ep25_migrateSubStrainByArchetype(migrated)).toBeNull();
  });
});

describe("applying that update to a document", () => {
  test("the flat fields are gone and the bucket is there", async () => {
    const actor = new Actor({
      name: "Sub-strain Migration",
      type: "character",
      system: { subStrain: { label: "architect", ...legacyFields } }
    });
    await actor.update(_ep25_migrateSubStrainByArchetype(actor));

    expect(actor._source.system.subStrain.influence2).toBeUndefined();
    expect(actor._source.system.subStrain.influence4).toBeUndefined();
    expect(actor._source.system.subStrain.byArchetype.architect).toEqual(legacyFields);
  });
});
