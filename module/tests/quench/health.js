import { withTempActor, waitUntil } from "./helpers.js";

// The sheet's health controls in a live world: the real sheet is rendered, its buttons are clicked,
// and what lands on the actor and on the bars is read back. The partial heal's own dialog is left
// to a hand test; here it is only opened and closed again.

/**
 * Opens an actor's sheet and waits until its health controls are there.
 * @param {Actor} actor - The actor
 * @returns {Promise<HTMLElement>} The sheet's element
 */
async function openSheet(actor) {
  await actor.sheet.render(true);
  await waitUntil(() => actor.sheet.element?.querySelector("#healPhysicalDamageFull"), 5000);
  return actor.sheet.element;
}

/**
 * Waits until the sheet has been drawn again after a change, so its controls know the new values.
 * @param {Actor} actor - The actor
 * @param {Function} predicate - What the redrawn sheet shows
 * @returns {Promise<HTMLElement>} The sheet's element
 */
async function redrawn(actor, predicate) {
  await waitUntil(() => actor.sheet.element && predicate(actor.sheet.element), 8000);
  return actor.sheet.element;
}

/**
 * Gives a test character damage, stress, wounds and trauma once its default morph is in place -
 * values set when the actor is created do not survive the morph being added - and checks they
 * landed.
 * @param {Actor} actor - The character
 * @param {Object} values - damage, stress, wounds, trauma
 * @param {Function} assert - Quench's assert
 * @returns {Promise<void>} Resolves once the actor carries them
 */
async function hurt(actor, { damage = 0, stress = 0, wounds = 0, trauma = 0 }, assert) {
  await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"), 5000);
  await actor.update({ "system.health.physical.value": damage, "system.health.mental.value": stress, "system.physical.wounds": wounds, "system.mental.trauma": trauma });
  await waitUntil(() => actor.system.health.physical.value === damage && actor.system.health.mental.value === stress, 5000);
  assert.deepEqual([actor.system.health.physical.value, actor.system.physical.wounds, actor.system.health.mental.value, actor.system.mental.trauma], [damage, wounds, stress, trauma], "the patient starts hurt");
}

const PATIENT = { type: "character", name: "Quench Patient", system: { aptitudes: { wil: { value: 15 }, som: { value: 15 } } } };

/**
 * Registers the health batch.
 * @param {Object} quench - Quench's registry
 * @returns {void}
 */
export function registerHealthBatch(quench) {
  quench.registerBatch("eclipsephase.health", context => {
    const { describe, it, assert } = context;

    describe("the sheet's health controls", function () {
      it("taking damage from the sheet adds the damage and the wounds it is worth, and the bar follows", async function () {
        this.timeout(30000);
        await withTempActor(PATIENT, async actor => {
          await hurt(actor, {}, assert);
          const wt = actor.system.physical.wt;
          let sheet = await openSheet(actor);
          sheet.querySelector("#receivePhysicalDamage").value = String(wt);
          sheet.querySelector("#takePhysicalDamage").click();

          await waitUntil(() => actor.system.health.physical.value === wt, 8000);
          sheet = await redrawn(actor, element => parseFloat(element.querySelector("#physicalHealthBar")?.style.width) > 0);

          assert.strictEqual(actor.system.physical.wounds, 1);
          assert.isAbove(parseFloat(sheet.querySelector("#physicalHealthBar").style.width), 0);
          await actor.sheet.close();
        });
      });

      it("a full heal of the body clears damage and wounds and leaves the mind alone", async function () {
        this.timeout(30000);
        await withTempActor(PATIENT, async actor => {
          await hurt(actor, { damage: 8, wounds: 1, stress: 5, trauma: 1 }, assert);
          const sheet = await openSheet(actor);
          sheet.querySelector("#healPhysicalDamageFull").click();

          await waitUntil(() => actor.system.health.physical.value === 0 && actor.system.physical.wounds === 0, 8000);

          assert.strictEqual(actor.system.physical.wounds, 0);
          assert.strictEqual(actor.system.health.mental.value, 5);
          assert.strictEqual(actor.system.mental.trauma, 1);
          await actor.sheet.close();
        });
      });

      it("a full heal of the mind clears stress and trauma and leaves the body alone", async function () {
        this.timeout(30000);
        await withTempActor(PATIENT, async actor => {
          await hurt(actor, { damage: 8, wounds: 1, stress: 5, trauma: 1 }, assert);
          const sheet = await openSheet(actor);
          sheet.querySelector("#healMentalDamageFull").click();

          await waitUntil(() => actor.system.health.mental.value === 0 && actor.system.mental.trauma === 0, 8000);

          assert.strictEqual(actor.system.mental.trauma, 0);
          assert.strictEqual(actor.system.health.physical.value, 8);
          await actor.sheet.close();
        });
      });

      it("backing out of the partial heal's dialog changes nothing", async function () {
        this.timeout(30000);
        await withTempActor(PATIENT, async actor => {
          await hurt(actor, { damage: 8, wounds: 1 }, assert);
          const sheet = await openSheet(actor);
          let opened = false;
          const hook = Hooks.once("renderDialogV2", app => {
            opened = true;
            app.close();
          });
          sheet.querySelector("#healPhysicalDamagePartial").click();

          await waitUntil(() => opened, 8000);
          await new Promise(resolve => setTimeout(resolve, 300));
          Hooks.off("renderDialogV2", hook);

          assert.strictEqual(actor.system.health.physical.value, 8);
          assert.strictEqual(actor.system.physical.wounds, 1);
          await actor.sheet.close();
        });
      });
    });
  }, { displayName: "Eclipse Phase: Health" });
}
