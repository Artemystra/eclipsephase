import EPactorSheet from "../../module/actor/EPactorSheet.js";
import {
  aiSkillSetup, droneActorData, freeSquareBeside, createDrone, deployDrone, recallDrone, bringDroneHome, recallChanges,
  deployedDrone, isDrone, registerDrones
} from "../../module/common/drones.js";
import { getBodyBindingInfo, bodyIsDestroyed, setBodyDamage } from "../../module/common/morp-functions.js";
import { makeActor, resetWorld } from "../setup/factories.js";

const { createdMessages } = global.__ep;
const DEAD = { name: "Dead", statuses: ["dead"], flags: { eclipsephase: { effectKey: "condition", fromDamage: true } } };

/**
 * A character sleeved in a Splicer who owns a Guardian drone with a gun, its ammunition, a radar and
 * a vest on it, and a knife of her own on the morph.
 * @param {Object} [vehicle] - Extra data for the drone item: system fields and flags
 * @returns {Actor} The prepared actor
 */
function owner(vehicle = {}) {
  return makeActor({
    _id: "ana",
    name: "Ana",
    type: "character",
    ownership: { default: 0, player1: 3 },
    system: { activeMorph: "morph1" },
    items: [
      { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio", dur: 30 } },
      { _id: "drone1", name: "Guardian", type: "vehicle", img: "drone.png", flags: vehicle.flags ?? {}, system: {
        chassisType: "robot", dur: 25, flex: 1, vigor: 1, armor: { energy: 16, kinetic: 12 },
        skills: {
          1: { name: "Fray", value: 30 }, 2: { name: "Guns", value: 40, specname: "Pistols", spec: true }, 3: { name: "Perceive", value: 40 },
          4: { name: "Pilot: Aerospace", value: 60, specname: "Guardian" }, 5: { name: "Know: Guardian Specs", value: 80 }, 6: { name: null, value: null }
        },
        ...(vehicle.system ?? {})
      } },
      { _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "drone1" } },
      { _id: "rounds", name: "Rounds", type: "ammo", system: { boundTo: "drone1", quantity: 3 } },
      { _id: "radar", name: "Radar", type: "ware", system: { boundTo: "drone1" } },
      { _id: "vest", name: "Vest", type: "armor", system: { boundTo: "drone1", energy: 2, kinetic: 2 } },
      { _id: "knife", name: "Knife", type: "ccWeapon", system: { boundTo: "morph1" } }
    ]
  });
}

/**
 * A scene stand-in holding tokens, which records the tokens made and removed on it.
 * @param {Object[]} tokens - The tokens on it
 * @returns {Object} The scene
 */
function sceneWith(tokens) {
  const scene = {
    id: "scene1",
    grid: { size: 100 },
    tokens: [...tokens],
    async createEmbeddedDocuments(name, data) {
      const made = data.map((token, index) => ({ id: `made${this.tokens.length + index}`, width: 1, height: 1, ...token }));
      this.tokens.push(...made);
      return made;
    },
    async deleteEmbeddedDocuments(name, ids) { this.tokens = this.tokens.filter(token => !ids.includes(token.id)); }
  };
  game.scenes = Object.assign([scene], { active: scene, get: id => (id === scene.id ? scene : null) });
  return scene;
}

beforeEach(() => {
  resetWorld();
  game.actors.clear();
  game.folders = { find: () => ({ id: "folder1" }) };
  game.scenes = Object.assign([], { active: null });
  // Foundry makes the NPC and hands it back; here the factory does, with what the code calls on it.
  global.Actor.create = async data => {
    const actor = makeActor(data);
    game.actors.set(actor.id, actor);
    actor.getTokenDocument = async position => ({ toObject: () => ({ actorId: actor.id, ...position }) });
    actor.delete = async options => {
      game.actors.delete(actor.id);
      Hooks.callAll("deleteActor", actor, options ?? {}, game.user.id);
    };
    return actor;
  };
});

afterEach(() => {
  delete global.Actor.create;
  game.user.isGM = true;
});

describe("a drone's AI skills", () => {
  test("a row named like a system skill fills that skill, any other becomes a skill of its own", () => {
    const { skills, items } = aiSkillSetup(owner().items.get("drone1").system.skills);

    expect(skills.skillsVig).toEqual({ fray: { value: 30, specname: "", spec: false }, guns: { value: 40, specname: "Pistols", spec: true } });
    expect(skills.skillsIns.perceive.value).toBe(40);
    expect(items.map(item => [item.type, item.name, item.system.value])).toEqual([["specialSkill", "Pilot: Aerospace", 60], ["knowSkill", "Guardian Specs", 80]]);
  });

  test("an aptitude the drone has is taken off the row, so the roll stays the row's value", () => {
    const { skills } = aiSkillSetup({ 1: { name: "Fray", value: 30 }, 2: { name: "Guns", value: 40 } }, { ref: 5 });
    expect([skills.skillsVig.fray.value, skills.skillsVig.guns.value]).toEqual([20, 35]);
  });
});

describe("what a drone goes out with", () => {
  test("a copy of the vehicle as its body and of all that is bound to it, nothing else", () => {
    const actor = owner();
    const data = droneActorData(actor, actor.items.get("drone1"), "folder1");
    const link = data.flags.eclipsephase.drone;
    const body = data.items.find(item => item.type === "vehicle");

    expect([data.type, data.folder, data.system.activeMorph]).toEqual(["npc", "folder1", body._id]);
    expect(body._id).not.toBe("drone1");
    expect(Object.values(link.items).sort()).toEqual(["gun", "radar", "rounds", "vest"]);
    expect(data.items.filter(item => item._id in link.items).every(item => item.system.boundTo === "activeMorph")).toBe(true);
    expect(data.items.some(item => item.name === "Knife" || item.name === "Splicer")).toBe(false);
    expect([link.owner, link.vehicle, link.body]).toEqual([actor.uuid, "drone1", body._id]);
    expect(data.ownership).toEqual({ default: 0, player1: 3 });
    expect(data.prototypeToken).toMatchObject({ name: "Guardian", actorLink: true, texture: { src: "drone.png" } });
  });

  test("the damage and the conditions the vehicle kept go out with it, and its copy keeps no marks", () => {
    const actor = owner({ flags: { eclipsephase: { bodyDamage: { value: 9, wounds: 1 }, bodyConditions: [{ name: "Stunned", statuses: ["stunned"] }] } } });
    const data = droneActorData(actor, actor.items.get("drone1"));

    expect([data.system.health.physical.value, data.system.physical.wounds]).toEqual([9, 1]);
    expect(data.effects.map(effect => effect.statuses)).toEqual([["stunned"]]);
    expect(data.items.find(item => item.type === "vehicle").flags?.eclipsephase ?? {}).toEqual({});
  });
});

describe("where a drone's token lands", () => {
  test("on the square right beside the character's, the next free one when that is taken", () => {
    const anchor = { x: 500, y: 500, width: 1, height: 1 };
    expect(freeSquareBeside(anchor, [anchor], 100)).toEqual({ x: 600, y: 500 });

    const crowded = [anchor, { x: 600, y: 500, width: 1, height: 1 }, { x: 400, y: 500, width: 1, height: 1 }, { x: 500, y: 600, width: 1, height: 1 }];
    expect(freeSquareBeside(anchor, crowded, 100)).toEqual({ x: 500, y: 400 });
  });

  test("beside a large token, never under it, and never off the map", () => {
    const anchor = { x: 0, y: 0, width: 2, height: 2 };
    const spot = freeSquareBeside(anchor, [anchor], 100);
    expect(spot.x >= 200 || spot.y >= 200).toBe(true);
    expect(spot.x >= 0 && spot.y >= 0).toBe(true);
  });
});

describe("sending a drone out", () => {
  test("makes its NPC with the vehicle's values, marks the vehicle and says so; no token without one of the character", async () => {
    const actor = owner();

    const out = await createDrone(actor, "drone1");
    const drone = out.drone;

    expect(out.placed).toBe(false);
    expect(deployedDrone(actor.items.get("drone1"))).toBe(drone);
    expect(isDrone(drone)).toBe(true);
    expect([drone.system.health.physical.max, drone.system.physical.activeMorphType]).toEqual([25, "synth"]);
    expect([drone.system.physical.energyArmorTotal, drone.system.physical.kineticArmorTotal]).toEqual([18, 14]);
    expect([drone.system.skillsVig.fray.derived, drone.system.skillsVig.guns.derived, drone.system.skillsIns.perceive.derived]).toEqual([30, 40, 40]);
    expect(createdMessages.at(-1).content).toContain("ep2e.morph.drone.announce.deployed");
  });

  test("puts its token on the free square beside the character's on the active scene", async () => {
    const actor = owner();
    const scene = sceneWith([{ id: "t1", actorId: "ana", x: 500, y: 500, width: 1, height: 1, elevation: 3 }]);

    const out = await createDrone(actor, "drone1");

    expect(out.placed).toBe(true);
    expect(scene.tokens.at(-1)).toMatchObject({ actorId: out.drone.id, x: 600, y: 500, elevation: 3 });
  });

  test("a vehicle already out, jammed or destroyed does not go out", async () => {
    const out = owner();
    await createDrone(out, "drone1");
    expect(await createDrone(out, "drone1")).toBeNull();

    const jamming = owner({});
    await jamming.update({ "system.activeJam": "drone1" });
    expect(await createDrone(jamming, "drone1")).toBeNull();

    const wrecked = owner({ flags: { eclipsephase: { bodyConditions: [DEAD] } } });
    expect(await createDrone(wrecked, "drone1")).toBeNull();
    expect(game.actors.filter(isDrone)).toHaveLength(1);
  });

  test("a player's request goes to the active GM", async () => {
    const emit = jest.spyOn(game.socket, "emit");
    game.user.isGM = false;
    const actor = owner();

    await deployDrone(actor, "drone1");
    await recallDrone({ id: "someDrone" });

    expect(emit.mock.calls.map(([, sent]) => sent)).toEqual([
      { action: "deployDrone", actorUuid: actor.uuid, vehicleId: "drone1", userId: game.user.id },
      { action: "recallDrone", droneId: "someDrone" }
    ]);
    expect(game.actors.filter(isDrone)).toHaveLength(0);
    emit.mockRestore();
  });

  test("nothing is bound to or moved onto a vehicle while it is out", async () => {
    const actor = owner();
    expect(getBodyBindingInfo(actor).bodies.map(body => body.id)).toEqual(["morph1", "drone1"]);

    await createDrone(actor, "drone1");
    expect(getBodyBindingInfo(actor).bodies.map(body => body.id)).toEqual(["morph1"]);
  });
});

describe("bringing a drone home", () => {
  /**
   * A character whose drone is out on a scene, hurt, stunned, two rounds spent, its radar gone and a
   * grenade picked up.
   * @returns {Promise<Object>} actor, drone and scene
   */
  async function afterTheFight() {
    const actor = owner();
    const scene = sceneWith([{ id: "t1", actorId: "ana", x: 500, y: 500, width: 1, height: 1 }]);
    const { drone } = await createDrone(actor, "drone1");
    const copyOf = original => Object.entries(drone.flags.eclipsephase.drone.items).find(([, id]) => id === original)[0];

    await drone.update({ "system.health.physical.value": 12, "system.physical.wounds": 2 });
    await drone.createEmbeddedDocuments("ActiveEffect", [{ name: "Stunned", statuses: ["stunned"], flags: { eclipsephase: { effectKey: "condition" } } }]);
    await drone.items.get(copyOf("rounds")).update({ "system.quantity": 1 });
    await drone.deleteEmbeddedDocuments("Item", [copyOf("radar")]);
    await drone.createEmbeddedDocuments("Item", [{ name: "Grenade", type: "grenade", system: { boundTo: "activeMorph", quantity: 1 } }]);
    createdMessages.length = 0;
    return { actor, drone, scene };
  }

  test("writes its damage, conditions and what it carries back onto the vehicle", async () => {
    const { actor, drone } = await afterTheFight();

    await bringDroneHome(drone);
    const vehicle = actor.items.get("drone1");

    expect(vehicle.getFlag("eclipsephase", "bodyDamage")).toEqual({ value: 12, wounds: 2 });
    expect(vehicle.getFlag("eclipsephase", "bodyConditions").map(data => data.statuses)).toEqual([["stunned"]]);
    expect([actor.items.get("rounds").system.quantity, actor.items.get("rounds").system.boundTo]).toEqual([1, "drone1"]);
    expect(actor.items.get("radar")).toBeUndefined();
    expect(actor.items.find(item => item.name === "Grenade").system.boundTo).toBe("drone1");
    expect(actor.items.some(item => item.type === "specialSkill" || item.type === "knowSkill")).toBe(false);
    expect(actor.items.get("knife").system.boundTo).toBe("morph1");
  });

  test("removes its tokens and its NPC, frees the vehicle and says so", async () => {
    const { actor, drone, scene } = await afterTheFight();

    await bringDroneHome(drone);

    expect(scene.tokens.map(token => token.id)).toEqual(["t1"]);
    expect(game.actors.get(drone.id)).toBeUndefined();
    expect(deployedDrone(actor.items.get("drone1"))).toBeNull();
    expect(actor.items.get("drone1").getFlag("eclipsephase", "deployed")).toBeUndefined();
    expect(createdMessages.at(-1).content).toContain("ep2e.morph.drone.announce.recalled");
  });

  test("a destroyed drone is written off: back on the sheet it stays destroyed until repaired", async () => {
    const { actor, drone } = await afterTheFight();
    await drone.update({ "system.health.physical.value": 50 });
    await drone.createEmbeddedDocuments("ActiveEffect", [DEAD]);
    drone.statuses = new Set(["dead"]);

    await bringDroneHome(drone);
    const vehicle = actor.items.get("drone1");

    expect(createdMessages.at(-1).content).toContain("ep2e.morph.drone.announce.writtenOff");
    expect(bodyIsDestroyed(vehicle)).toBe(true);
    expect(await createDrone(actor, "drone1")).toBeNull();

    await setBodyDamage(actor, "drone1", { value: 49 });
    expect(bodyIsDestroyed(vehicle)).toBe(false);
  });

  test("lying prone or knocked out does not come home with it, its other conditions do", async () => {
    const { actor, drone } = await afterTheFight();
    await drone.createEmbeddedDocuments("ActiveEffect", [
      { name: "Unconscious", statuses: ["unconscious"], flags: { eclipsephase: { effectKey: "condition" } } },
      { name: "Prone", statuses: ["prone"], flags: { eclipsephase: { effectKey: "condition" } } }
    ]);

    await bringDroneHome(drone);

    expect(actor.items.get("drone1").getFlag("eclipsephase", "bodyConditions").map(data => data.statuses)).toEqual([["stunned"]]);
  });

  test("what the copies changed, lost and gained, as the recall reads it", async () => {
    const { actor, drone } = await afterTheFight();
    const { updates, deletions, creations } = recallChanges(drone, actor, actor.items.get("drone1"));

    expect(updates.map(update => update._id).sort()).toEqual(["gun", "rounds", "vest"]);
    expect(updates.every(update => update.system.boundTo === "drone1")).toBe(true);
    expect(deletions).toEqual(["radar"]);
    expect(creations.map(data => [data.name, data.system.boundTo, data._id])).toEqual([["Grenade", "drone1", undefined]]);
  });

  test("a drone deleted by hand frees its vehicle, which keeps what it had", async () => {
    registerDrones();
    const { actor, drone } = await afterTheFight();

    await drone.delete();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(actor.items.get("drone1").getFlag("eclipsephase", "deployed")).toBeUndefined();
    expect([actor.items.get("rounds").system.quantity, !!actor.items.get("radar")]).toEqual([3, true]);
  });
});

describe("a vehicle out as a drone on its owner's sheet", () => {
  test("shows the drone's health, locked, and marks itself as out or down", async () => {
    const actor = owner();
    const { drone } = await createDrone(actor, "drone1");
    await drone.update({ "system.health.physical.value": 7 });
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    const vehicle = actor.remoteVehicles[0];

    expect([vehicle.deployed, vehicle.droneDown, vehicle.destroyed]).toEqual([true, false, false]);
    expect(vehicle.damage).toMatchObject({ value: 7, dur: 25, locked: true });
  });

  test("its tab offers Deploy at home, and its state with Recall while out; its panel opens the drone's sheet", async () => {
    const render = actor => foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/actor/partials/tabs/morph-tab.html",
      { actor, tabGroups: { morph: "sleeved" }, tabs: { primary: { morph: { active: true } } }, isGM: true, editable: true });
    const actor = owner();
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    const home = await render(actor);
    expect(home).toContain("deployDroneButton");
    expect(home).not.toContain("recallDroneButton");

    await createDrone(actor, "drone1");
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    const out = await render(actor);
    expect(out).toContain("recallDroneButton");
    expect(out).toContain("ep2e.morph.drone.recall");
    expect(out).toContain("openDroneSheet");
    expect(out).toContain("ep2e.morph.drone.outNote");
    expect(out).not.toContain("vehicle-task-check");
    expect(out).not.toContain("deployDroneButton");
    expect(out).not.toContain("ep-section-toggle\" data-body-key=\"drone1\"");
  });

  test("a destroyed drone turns Recall into Write Off, on its owner's tab and on its own sheet", async () => {
    const actor = owner();
    const { drone } = await createDrone(actor, "drone1");
    drone.statuses = new Set(["dead"]);
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: drone }, {});

    const tab = await foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/actor/partials/tabs/morph-tab.html",
      { actor, tabGroups: { morph: "sleeved" }, tabs: { primary: { morph: { active: true } } }, isGM: true, editable: true });
    const own = await foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/actor/partials/tabs/npcgear.html", { actor: drone });

    expect(actor.remoteVehicles[0].droneDown).toBe(true);
    expect(tab).toContain("ep2e.morph.drone.writeOff");
    expect(tab).not.toContain("ep2e.morph.drone.recall");
    expect(own).toContain("ep2e.morph.drone.writeOff");
  });

  test("the owner's open sheet is drawn again when something happens to its drone", async () => {
    registerDrones();
    const actor = owner();
    const { drone } = await createDrone(actor, "drone1");
    actor.sheet = { rendered: true, render: jest.fn() };

    await drone.update({ "system.health.physical.value": 5 });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(actor.sheet.render).toHaveBeenCalledTimes(1);

    await drone.createEmbeddedDocuments("ActiveEffect", [DEAD]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(actor.sheet.render.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test("a destroyed vehicle at home blocks jamming and sending out", async () => {
    const actor = owner({ flags: { eclipsephase: { bodyConditions: [DEAD] } } });
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    const vehicle = actor.remoteVehicles[0];

    expect([vehicle.destroyed, vehicle.jamBlock]).toEqual([true, "ep2e.morph.drone.destroyed"]);
  });

  test("a vehicle at home that is destroyed or damaged up to its Durability shows a warning in place of its skill dice", async () => {
    const render = actor => foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/actor/partials/tabs/morph-tab.html",
      { actor, tabGroups: { morph: "sleeved" }, tabs: { primary: { morph: { active: true } } }, isGM: true, editable: true });
    const view = async flags => {
      const actor = owner({ flags: { eclipsephase: flags } });
      await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
      return { block: actor.remoteVehicles[0].rollBlock, html: await render(actor) };
    };

    const sound = await view({ bodyDamage: { value: 24, wounds: 0 } });
    expect(sound.block).toBeNull();
    expect(sound.html).toContain("vehicle-task-check");

    const disabled = await view({ bodyDamage: { value: 25, wounds: 0 } });
    expect(disabled.block).toBe("ep2e.morph.drone.disabled");
    expect(disabled.html).not.toContain("vehicle-task-check");
    expect(disabled.html).toContain("fa-triangle-exclamation");

    const destroyed = await view({ bodyDamage: { value: 50, wounds: 0 }, bodyConditions: [DEAD] });
    expect(destroyed.block).toBe("ep2e.morph.drone.destroyed");
    expect(destroyed.html).not.toContain("vehicle-task-check");
  });
});
