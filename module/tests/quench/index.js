import { RollCheck, TaskRollModifier } from "../../rolls/dice.js";
import { confirmation } from "../../common/general-sheet-functions.js";
import { _ep23_migrateSubStrainByArchetype, _ep25_migrateKiSubStrain, migrationPre25Needed } from "../../common/migration.js";
import { getStrainFamily, listStrainFamilies, hasStrainFamily } from "../../rolls/strain-families.js";
import { strainSubstrate } from "../../common/body-markers.js";
import {
  withTempActor,
  withTempItem,
  seedDice,
  restoreDice,
  uniformForFace,
  lastMessage,
  autoConfirm,
  waitUntil,
  suppressDice3d,
  restoreDice3d
} from "./helpers.js";

/**
 * Runs a roll with the 3D dice animation stubbed out, restoring it afterwards even on failure.
 * @param {Function} fn - Called with no arguments; its return value is awaited and passed through
 * @returns {Promise<*>} Whatever fn returned
 */
async function withoutDiceAnimation(fn) {
  suppressDice3d();
  try {
    return await fn();
  } finally {
    restoreDice3d();
  }
}

/**
 * Waits for the createActor hook's own default-morph grant, which Foundry starts but never awaits.
 * @param {Actor} actor - The freshly created actor
 * @returns {Promise<void>} Resolves once the grant has finished
 */
function awaitDefaultMorph(actor) {
  return waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"));
}

/**
 * The dataset a sheet click would hand RollCheck() for a plain Infiltrate skill check.
 * @param {Actor} actor - The rolling actor, already prepared
 * @returns {Object} The dataset
 */
function infiltrateDataset(actor) {
  return { name: "Infiltrate", key: "infiltrate", type: "skill", rollvalue: actor.system.skillsVig.infiltrate.roll, pooltype: "Vigor" };
}

/**
 * A skipDialog systemOptions object that answers the roll dialog as if nothing was chosen.
 * @param {Object} [overrides] - Fields merged into the preset answer
 * @returns {Object} The systemOptions RollCheck() expects
 */
function skipDialogOptions(overrides = {}) {
  return { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, ...overrides } };
}

Hooks.on("quenchReady", quench => {
  quench.registerBatch("eclipsephase.core.actors", context => {
    const { describe, it, assert } = context;

    describe("actor creation", function () {
      it("gives a new character a default morph and ID", async function () {
        await withTempActor({ type: "character" }, async actor => {
          await awaitDefaultMorph(actor);
          assert.isOk(actor.system.activeMorph, "activeMorph should be set");
          assert.isOk(actor.system.activeID, "activeID should be set");
          const morph = actor.items.get(actor.system.activeMorph);
          assert.strictEqual(morph?.type, "morph");
        });
      });

      it("an actor created with activeMorph already set skips the default-morph grant", async function () {
        await withTempActor({ type: "character", system: { activeMorph: "already-set" } }, actor => {
          assert.strictEqual(actor.items.size, 0);
        });
      });

      it("a goon's token is unlinked, with a physical bar and no mental one", async function () {
        await withTempActor({ type: "goon" }, actor => {
          assert.strictEqual(actor.prototypeToken.actorLink, false);
          assert.strictEqual(actor.prototypeToken.bar1.attribute, "health.physical");
          assert.notOk(actor.prototypeToken.bar2?.attribute);
        });
      });

      it("an npc's token is linked and gets no mental health bar, against the manifest default", async function () {
        await withTempActor({ type: "npc" }, actor => {
          assert.strictEqual(actor.prototypeToken.actorLink, true);
          assert.strictEqual(actor.prototypeToken.bar1.attribute, "health.physical");
          assert.notOk(actor.prototypeToken.bar2?.attribute);
        });
      });

      it("a character's token is linked and gets both health bars", async function () {
        await withTempActor({ type: "character" }, actor => {
          assert.strictEqual(actor.prototypeToken.actorLink, true);
          assert.strictEqual(actor.prototypeToken.bar2.attribute, "health.mental");
        });
      });

      it("MANAGED_TYPES guard: a type the system does not manage is left alone", async function () {
        await withTempActor({ type: "shop" }, actor => {
          assert.notStrictEqual(actor.prototypeToken.displayBars, CONST.TOKEN_DISPLAY_MODES.HOVER);
          assert.notOk(actor.getFlag("eclipsephase", "defaultMorphAdded"));
          assert.notOk(actor.system.pools, "the character pipeline should not have run");
        });
      });
    });
  }, { displayName: "Eclipse Phase: Actor creation" });

  quench.registerBatch("eclipsephase.core.rolls", context => {
    const { describe, it, assert } = context;

    describe("RollCheck via the skipDialog test seam", function () {
      it("a preset skill roll creates a message carrying flags.eclipsephase.roll", async function () {
        await withTempActor({ type: "character", system: { skillsVig: { infiltrate: { value: 40 } } } }, async actor => {
          seedDice([uniformForFace(42, 100)]);
          try {
            await withoutDiceAnimation(() =>
              RollCheck(infiltrateDataset(actor), actor.system, actor, skipDialogOptions(), null, "skill"));
          } finally {
            restoreDice();
          }
          const message = lastMessage();
          assert.exists(message);
          assert.strictEqual(message.flags.eclipsephase.roll.rolledFrom, "skill");
          assert.isDefined(message.flags.eclipsephase.roll.alternatives.originalResult);
          assert.strictEqual(lastMessage().content.includes("42"), true, "the seeded die must be the die that rolled");
        });
      });

      it("a preset globalMod reaches the roll like a dialog answer would", async function () {
        await withTempActor({ type: "character", system: { skillsVig: { infiltrate: { value: 40 } } } }, async actor => {
          await withoutDiceAnimation(() =>
            RollCheck(infiltrateDataset(actor), actor.system, actor, skipDialogOptions({ globalMod: -10 }), null, "skill"));
          assert.include(lastMessage().content, "-10");
        });
      });

      it("usePool spends the pool named in the preset options", async function () {
        await withTempActor(
          { type: "character", system: { skillsVig: { infiltrate: { value: 40 } }, pools: { vigor: { value: 2 } } } },
          async actor => {
            const before = actor.system.pools.vigor.value;
            await withoutDiceAnimation(() =>
              RollCheck(infiltrateDataset(actor), actor.system, actor, skipDialogOptions({ usePool: "pool" }), null, "skill"));
            assert.isBelow(actor.system.pools.vigor.value, before);
          }
        );
      });

      it("a blind rollMode whispers the message and marks it blind", async function () {
        await withTempActor({ type: "character", system: { skillsVig: { infiltrate: { value: 40 } } } }, async actor => {
          await withoutDiceAnimation(() =>
            RollCheck(infiltrateDataset(actor), actor.system, actor, skipDialogOptions({ rollMode: "blind" }), null, "skill"));
          const message = lastMessage();
          assert.isTrue(message.blind);
          assert.isAbove(message.whisper.length, 0);
        });
      });

      it("a modifier added by an eclipsephase.preRoll hook reaches the result breakdown", async function () {
        const onPreRoll = ctx => ctx.modifiers.push(new TaskRollModifier("ep2e.quench.probeModifier", -5));
        Hooks.on("eclipsephase.preRoll", onPreRoll);
        try {
          await withTempActor({ type: "character", system: { skillsVig: { infiltrate: { value: 40 } } } }, async actor => {
            await withoutDiceAnimation(() =>
              RollCheck(infiltrateDataset(actor), actor.system, actor, skipDialogOptions(), null, "skill"));
            assert.include(lastMessage().content, "-5");
          });
        } finally {
          Hooks.off("eclipsephase.preRoll", onPreRoll);
        }
      });
    });
  }, { displayName: "Eclipse Phase: Rolls" });

  quench.registerBatch("eclipsephase.core.hooks", context => {
    const { describe, it, assert } = context;

    describe("roll and data-preparation hooks", function () {
      it("fires preRollDialog, preRoll and postRoll in that order", async function () {
        const order = [];
        const names = ["eclipsephase.preRollDialog", "eclipsephase.preRoll", "eclipsephase.postRoll"];
        const handlers = names.map(name => {
          const fn = () => order.push(name);
          Hooks.on(name, fn);
          return [name, fn];
        });
        try {
          await withTempActor({ type: "character", system: { skillsVig: { infiltrate: { value: 40 } } } }, async actor => {
            await withoutDiceAnimation(() =>
              RollCheck(infiltrateDataset(actor), actor.system, actor, skipDialogOptions(), null, "skill"));
          });
          assert.deepEqual(order, names);
        } finally {
          for (const [name, fn] of handlers) Hooks.off(name, fn);
        }
      });

      it("a preRollDialog handler returning false cancels the roll", async function () {
        const fn = ctx => {
          ctx.cancelReason = "ep2e.quench.probeCancel";
          return false;
        };
        Hooks.on("eclipsephase.preRollDialog", fn);
        try {
          await withTempActor({ type: "character", system: { skillsVig: { infiltrate: { value: 40 } } } }, async actor => {
            const before = game.messages.size;
            await RollCheck(infiltrateDataset(actor), actor.system, actor, skipDialogOptions(), null, "skill");
            assert.strictEqual(game.messages.size, before);
          });
        } finally {
          Hooks.off("eclipsephase.preRollDialog", fn);
        }
      });

      it("autoConfirm resolves a confirmation dialog without a real click", async function () {
        autoConfirm(true);
        try {
          const result = await confirmation("Quench Probe", "Headline", "Copy");
          assert.deepEqual(result, { confirm: true });
        } finally {
          autoConfirm(false);
        }
      });

      it("prepareActorMods/Status/Derived each fire exactly once per prepareData() call", async function () {
        await withTempActor({ type: "character" }, async actor => {
          await awaitDefaultMorph(actor);

          const counts = { mods: 0, status: 0, derived: 0 };
          const onMods = () => counts.mods++;
          const onStatus = () => counts.status++;
          const onDerived = () => counts.derived++;
          Hooks.on("eclipsephase.prepareActorMods", onMods);
          Hooks.on("eclipsephase.prepareActorStatus", onStatus);
          Hooks.on("eclipsephase.prepareActorDerived", onDerived);
          try {
            actor.prepareData();
            assert.strictEqual(counts.mods, 1);
            assert.strictEqual(counts.status, 1);
            assert.strictEqual(counts.derived, 1);
          } finally {
            Hooks.off("eclipsephase.prepareActorMods", onMods);
            Hooks.off("eclipsephase.prepareActorStatus", onStatus);
            Hooks.off("eclipsephase.prepareActorDerived", onDerived);
          }
        });
      });
    });
  }, { displayName: "Eclipse Phase: Hooks" });

  quench.registerBatch("eclipsephase.core.drop", context => {
    const { describe, it, assert } = context;

    describe("creation gating", function () {
      it("allows creating the current traits item type normally", async function () {
        await withTempItem({ type: "traits", name: "Quench Probe Trait" }, item => {
          assert.strictEqual(item.type, "traits");
        });
      });
    });
  }, { displayName: "Eclipse Phase: Creation gating" });

  quench.registerBatch("eclipsephase.core.sheet", context => {
    const { describe, it, assert } = context;

    describe("actor sheet rendering", function () {
      for (const type of ["character", "npc", "goon"]) {
        it(`renders the ${type} sheet without a console error`, async function () {
          await withTempActor({ type }, async actor => {
            const errors = [];
            const original = console.error;
            console.error = (...args) => {
              errors.push(args);
              original(...args);
            };
            try {
              await actor.sheet.render(true);
              await actor.sheet.close();
            } finally {
              console.error = original;
            }
            assert.lengthOf(errors, 0);
          });
        });
      }
    });
  }, { displayName: "Eclipse Phase: Sheet rendering" });

  quench.registerBatch("eclipsephase.psi.families", context => {
    const { describe, it, assert } = context;

    describe("the strain family the core registers", function () {
      it("offers Psi, with its own table and partial", function () {
        assert.include(listStrainFamilies().map(family => family.id), "psi");
        assert.strictEqual(getStrainFamily("psi").subStrains, CONFIG.eclipsephase.strains);
        assert.isFunction(getStrainFamily("psi").influence);
      });

      it("has Psi's details partial loaded, so the sheet can render it", function () {
        assert.isFunction(Handlebars.partials[getStrainFamily("psi").detailsPartial]);
      });

      it("refuses a family nobody registered instead of treating it as Psi", function () {
        const family = getStrainFamily("quench-nonesuch");
        assert.isTrue(family.missing);
        assert.isTrue(family.substrate({}).blocked);
        assert.strictEqual(family.substrate({}).reasonKey, "ep2e.roll.announce.strainFamilyMissing");
      });

      it("a biological body carries Psi", async function () {
        await withTempActor({ type: "character", name: "Quench Sleeved" }, async actor => {
          await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"));
          assert.isFalse(strainSubstrate(actor, "psi").blocked, "a default biological morph must not block Psi");
        });
      });

      it("every localisation key Psi reports really exists", function () {
        const psi = getStrainFamily("psi");
        assert.isTrue(game.i18n.has(psi.mismatchKey));
        assert.isTrue(game.i18n.has(psi.tabLabel));
        assert.isTrue(game.i18n.has("ep2e.roll.announce.strainFamilyMissing"));
      });
    });
  }, { displayName: "Eclipse Phase: Strain families" });

  // Ki belongs to the eclipsephase-ki module. Both states are asserted rather than skipped, so a
  // run reports a real result whether or not the module happens to be installed.
  quench.registerBatch("eclipsephase.ki.moduleAbsent", context => {
    const { describe, it, assert } = context;

    /**
     * Whether the Ki module is installed and switched on in this world.
     * @returns {Boolean} True while the module provides the Ki family
     */
    function kiActive() {
      return game.modules.get("eclipsephase-ki")?.active === true;
    }

    describe("who owns the Ki family", function () {
      it("the core never registers it; only the module does", function () {
        if (kiActive()) {
          assert.isTrue(hasStrainFamily("ki"), "with the module on, Ki has to be registered");
          assert.isUndefined(getStrainFamily("ki").missing);
        } else {
          assert.isFalse(hasStrainFamily("ki"), "without the module, the core must not know Ki");
          assert.isTrue(getStrainFamily("ki").missing);
        }
      });

      it("its data path and partial come from the module, never from the core", function () {
        const family = getStrainFamily("ki");
        if (kiActive()) {
          assert.strictEqual(family.dataPath, "flags.eclipsephase-ki.subStrain");
          assert.include(family.detailsPartial, "modules/eclipsephase-ki/");
          assert.isFunction(Handlebars.partials[family.detailsPartial]);
        } else {
          assert.strictEqual(family.dataPath, "");
          assert.strictEqual(family.detailsPartial, "");
        }
      });

      it("the Ki sub-strain table is on CONFIG only while the module provides it", function () {
        if (kiActive()) {
          assert.isOk(CONFIG.eclipsephase.kiStrains, "the module has to contribute its table");
          assert.strictEqual(getStrainFamily("ki").subStrains, CONFIG.eclipsephase.kiStrains);
        } else {
          assert.isUndefined(CONFIG.eclipsephase.kiStrains, "the core must not keep a Ki table");
          assert.deepEqual(getStrainFamily("ki").subStrains, {});
        }
      });
    });

    describe("a Ki sleight the core cannot resolve", function () {
      it("is refused outright rather than falling back to Psi", function () {
        const bodiless = { system: {}, items: { some: () => false, get: () => null } };
        const substrate = strainSubstrate(bodiless, "quench-unregistered-family");

        assert.isTrue(substrate.blocked, "an unregistered family must never roll");
        assert.strictEqual(substrate.reasonKey, "ep2e.roll.announce.strainFamilyMissing");
        assert.notInclude(substrate.reasonKey, "psi", "the message must not be Psi's");
      });

      it("says so in a message the world can actually show", function () {
        assert.isTrue(game.i18n.has("ep2e.roll.announce.strainFamilyMissing"));
        assert.isTrue(game.i18n.has("ep2e.psi.moduleMissing.headline"));
        assert.isTrue(game.i18n.has("ep2e.psi.moduleMissing.copy"));
      });
    });
  }, { displayName: "Eclipse Phase: Ki without its module" });

  // Read through the registry's dataPath, never through getFlag: a flag scope whose module is not
  // active throws, and the Ki module does not exist yet. The migration writes the same way.
  quench.registerBatch("eclipsephase.ki.migration", context => {
    const { describe, it, assert } = context;

    const KI_STRAINS = ["crucible", "redline", "signal", "ruin", "colony"];
    const KI_SUBSTRAIN_PATH = "flags.eclipsephase-ki.subStrain";

    describe("moving a Ki character's sub-strain choices into the module's flags", function () {
      it("writes the flags, clears the system keys and keeps the values", async function () {
        const stored = { influence2: { label: "label2", description: "quenchChoice" } };
        await withTempActor({
          type: "character",
          name: "Quench Ki Migrant",
          system: { subStrain: { label: "crucible", byArchetype: { crucible: stored } } }
        }, async actor => {
          const update = _ep25_migrateKiSubStrain(actor);
          assert.isNotNull(update, "the fixture has to look like an unmigrated character");
          await actor.update(update);

          const moved = foundry.utils.getProperty(actor, KI_SUBSTRAIN_PATH);
          assert.strictEqual(moved.crucible.influence2.description, "quenchChoice", "the choice has to survive the move");
          assert.notOk(actor._source.system.subStrain.byArchetype.crucible?.influence2, "the system copy has to be gone");
          assert.strictEqual(actor.system.subStrain.label, "crucible", "the chosen sub-strain itself stays in the core");
        });
      });

      it("a second run has nothing left to do", async function () {
        await withTempActor({
          type: "character",
          name: "Quench Ki Migrated",
          system: { subStrain: { label: "ruin", byArchetype: { ruin: { influence2: { label: "l", description: "d" } } } } }
        }, async actor => {
          await actor.update(_ep25_migrateKiSubStrain(actor));
          assert.isNull(_ep25_migrateKiSubStrain(actor), "an already migrated actor must not be written to again");
        });
      });

      it("a Psi character is left entirely alone", async function () {
        await withTempActor({
          type: "character",
          name: "Quench Psi Untouched",
          system: { subStrain: { label: "architect", byArchetype: { architect: { influence2: { label: "l", description: "psiChoice" } } } } }
        }, async actor => {
          assert.isNull(_ep25_migrateKiSubStrain(actor));
          assert.strictEqual(actor.system.subStrain.byArchetype.architect.influence2.description, "psiChoice");
          assert.isUndefined(foundry.utils.getProperty(actor, KI_SUBSTRAIN_PATH));
        });
      });
    });

    describe("whether this world is asked to migrate at all", function () {
      it("says no while no actor carries Ki data in system data", function () {
        assert.isFalse(migrationPre25Needed(), "a world without unmigrated Ki characters must not be prompted");
      });

      it("says yes as soon as one does", async function () {
        await withTempActor({
          type: "character",
          name: "Quench Ki Unmigrated",
          system: { subStrain: { label: "signal", byArchetype: { signal: { influence2: { label: "l", description: "d" } } } } }
        }, async () => {
          assert.isTrue(migrationPre25Needed());
        });
      });
    });

    describe("where each family's choices are read from", function () {
      it("Psi reads from system data; the Ki half is the module's to declare", function () {
        assert.strictEqual(getStrainFamily("psi").dataPath, "system.subStrain.byArchetype");
      });

      it("the core schema keeps the Ki keys only as empty stubs", function () {
        for (const strain of KI_STRAINS) {
          assert.deepEqual(game.model.Actor.character.subStrain.byArchetype[strain], {}, `${strain} should be a stub`);
        }
        assert.isOk(game.model.Actor.character.subStrain.byArchetype.architect.influence2, "Psi keeps its full schema");
      });
    });
  }, { displayName: "Eclipse Phase: Ki sub-strain migration" });

  quench.registerBatch("eclipsephase.core.migration", context => {
    const { describe, it, assert } = context;

    describe("the 2.3 per-archetype sub-strain migration", function () {
      it("deletes the flat fields for real, with no legacy key left to warn about", async function () {
        const legacy = { label: "Two", description: "second" };
        await withTempActor({
          type: "character",
          name: "Quench Sub-strain",
          system: { subStrain: { label: "architect", influence2: legacy } }
        }, async actor => {
          assert.isDefined(actor._source.system.subStrain.influence2, "the fixture has to carry the pre-2.3 key");

          const mode = CONFIG.compatibility.mode;
          CONFIG.compatibility.mode = CONST.COMPATIBILITY_MODES.FAILURE;
          try {
            await actor.update(_ep23_migrateSubStrainByArchetype(actor));
          } finally {
            CONFIG.compatibility.mode = mode;
          }

          assert.notProperty(actor._source.system.subStrain, "influence2", "the server has to return the deletion in its diff");
          assert.deepEqual(actor._source.system.subStrain.byArchetype.architect.influence2, legacy);
          assert.isNull(_ep23_migrateSubStrainByArchetype(actor), "a second run has nothing left to do");
        });
      });
    });
  }, { displayName: "Eclipse Phase: Migrations" });
});
