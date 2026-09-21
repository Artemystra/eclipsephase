import { RollCheck, TaskRollModifier } from "../../rolls/dice.js";
import { confirmation } from "../../common/general-sheet-functions.js";
import { _ep23_migrateSubStrainByArchetype } from "../../common/migration.js";
import { getStrainFamily, listStrainFamilies } from "../../rolls/strain-families.js";
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

    describe("the strain families the core registers", function () {
      it("offers Psi and Ki, each with its own tables and partial", function () {
        assert.deepEqual(listStrainFamilies().map(family => family.id), ["psi", "ki"]);
        assert.strictEqual(getStrainFamily("psi").subStrains, CONFIG.eclipsephase.strains);
        assert.strictEqual(getStrainFamily("ki").subStrains, CONFIG.eclipsephase.kiStrains);
        assert.notStrictEqual(getStrainFamily("psi").detailsPartial, getStrainFamily("ki").detailsPartial);
      });

      it("has both details partials loaded, so a sheet can render either", function () {
        assert.isFunction(Handlebars.partials[getStrainFamily("psi").detailsPartial]);
        assert.isFunction(Handlebars.partials[getStrainFamily("ki").detailsPartial]);
      });

      it("refuses a family nobody registered instead of treating it as Psi", function () {
        const family = getStrainFamily("quench-nonesuch");
        assert.isTrue(family.missing);
        assert.isTrue(family.substrate({}).blocked);
        assert.strictEqual(family.substrate({}).reasonKey, "ep2e.roll.announce.strainFamilyMissing");
      });
    });

    describe("the same body judged by both families", function () {
      it("a biological body carries Psi and refuses Ki", async function () {
        await withTempActor({ type: "character", name: "Quench Sleeved" }, async actor => {
          await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"));

          const psi = strainSubstrate(actor, "psi");
          const ki = strainSubstrate(actor, "ki");

          assert.isFalse(psi.blocked, "a default biological morph must not block Psi");
          assert.isTrue(ki.blocked, "Ki needs a Cyberbrain, which a default morph has not got");
          assert.strictEqual(ki.reasonKey, "ep2e.roll.announce.ki.noCyberbrain");
        });
      });

      it("every localisation key a blocked body reports really exists", function () {
        for (const id of ["psi", "ki"]) {
          const family = getStrainFamily(id);
          assert.isTrue(game.i18n.has(family.mismatchKey), `${id} is missing ${family.mismatchKey}`);
          assert.isTrue(game.i18n.has(family.tabLabel), `${id} is missing ${family.tabLabel}`);
        }
        assert.isTrue(game.i18n.has("ep2e.roll.announce.strainFamilyMissing"));
      });
    });
  }, { displayName: "Eclipse Phase: Strain families" });

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
