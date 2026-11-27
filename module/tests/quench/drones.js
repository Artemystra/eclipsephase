import { withTempActor, waitUntil } from "./helpers.js";
import { createDrone, bringDroneHome, deployedDrone } from "../../common/drones.js";

// A drone sent out and brought home in a live world: Foundry itself makes the NPC from the data the
// system hands it, with its embedded ids, its template defaults and its prepared values, and
// deletes it again - none of which the Jest stand-ins can vouch for.

const GUARDIAN = {
  name: "Quench Guardian", type: "vehicle",
  system: {
    chassisType: "robot", dur: 25, flex: 1, armor: { energy: 16, kinetic: 12 },
    skills: { 1: { name: "Fray", value: 30 }, 2: { name: "Guns", value: 40 }, 3: { name: "Pilot: Aerospace", value: 60 } }
  }
};

/**
 * Registers the drones batch.
 * @param {Object} quench - Quench's registry
 * @returns {void}
 */
export function registerDronesBatch(quench) {
  quench.registerBatch("eclipsephase.drones", context => {
    const { describe, it, assert } = context;

    describe("a drone out and home again", function () {
      it("goes out as an NPC with the vehicle's values and brings back what happened to it", async function () {
        this.timeout(30000);
        await withTempActor({ type: "character", name: "Quench Operator" }, async actor => {
          await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"), 5000);
          const [vehicle] = await actor.createEmbeddedDocuments("Item", [GUARDIAN]);
          const [rounds] = await actor.createEmbeddedDocuments("Item", [{ name: "Quench Rounds", type: "ammo", system: { boundTo: vehicle.id, quantity: 3 } }]);

          const { drone, placed } = await createDrone(actor, vehicle.id);
          try {
            assert.strictEqual(deployedDrone(actor.items.get(vehicle.id))?.id, drone.id, "the vehicle is marked as out");
            assert.strictEqual(placed, actor.getActiveTokens().length > 0, "a token only beside the character's own");
            assert.strictEqual(drone.items.get(drone.system.activeMorph)?.type, "vehicle", "its body is the vehicle's copy");
            assert.strictEqual(drone.system.health.physical.max, 25, "durability from the vehicle");
            assert.deepEqual([drone.system.skillsVig.fray.derived, drone.system.skillsVig.guns.derived], [30, 40], "AI skills roll their row's value");
            assert.ok(drone.items.some(item => item.type === "specialSkill" && item.name === "Pilot: Aerospace"), "other rows are skills of their own");
            assert.deepEqual(drone.ownership, actor.ownership, "owned by the character's owners");

            const copy = drone.items.find(item => item.type === "ammo");
            await copy.update({ "system.quantity": 1 });
            await drone.update({ "system.health.physical.value": 8, "system.physical.wounds": 1 }, { eclipsephase: { woundCheck: false } });
          } finally {
            await bringDroneHome(drone);
          }

          assert.notOk(game.actors.get(drone.id), "the NPC is gone");
          assert.notOk(actor.items.get(vehicle.id).getFlag("eclipsephase", "deployed"), "the vehicle is home");
          assert.deepEqual(actor.items.get(vehicle.id).getFlag("eclipsephase", "bodyDamage"), { value: 8, wounds: 1 }, "its damage came back");
          assert.strictEqual(actor.items.get(rounds.id).system.quantity, 1, "the spent rounds are spent on the character too");
          assert.strictEqual(actor.items.get(rounds.id).system.boundTo, vehicle.id, "and still lie on the vehicle");
        });
      });
    });
  });
}
