import EPactorSheet, { lockEgoFields } from "../../module/actor/EPactorSheet.js";
import { JSDOM } from "jsdom";
import {
  aiSkillSetup, droneActorData, freeSquareBeside, createDrone, deployDrone, recallDrone, bringDroneHome, recallChanges,
  deployedDrone, isDrone, registerDrones, jamDrone, unjamDrone, endDroneJam, jammedDrone, jammingEgo, stripEgoOverlay, droneJamBlock, flexAfter
} from "../../module/common/drones.js";
import { RollCheck } from "../../module/rolls/dice.js";
import { inflictCondition } from "../../module/common/conditions.js";
import { getBodyBindingInfo, bodyIsDestroyed, setBodyDamage, jamBlockReason } from "../../module/common/morp-functions.js";
import { makeActor, resetWorld, seedDialogs, seedRolls } from "../setup/factories.js";

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

  test("nothing in its data asks the actor to change itself before it exists; its pools are filled once it does", async () => {
    const actor = owner();
    expect(droneActorData(actor, actor.items.get("drone1")).flags.eclipsephase.resleeving).toBeUndefined();

    const { drone } = await createDrone(actor, "drone1");
    await new Promise(resolve => setTimeout(resolve, 0));

    expect([drone.system.pools.vigor.value, drone.getFlag("eclipsephase", "resleeving")]).toEqual([drone.system.pools.vigor.totalVigor, false]);
    expect(drone.system.pools.vigor.totalVigor).toBe(1);
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

  test("a vehicle already out or destroyed does not go out, and a morph goes out only for a jam", async () => {
    const out = owner();
    await createDrone(out, "drone1");
    expect(await createDrone(out, "drone1")).toBeNull();
    expect(await createDrone(out, "morph1", { temporary: true })).toBeNull();

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

describe("jamming a deployed drone", () => {
  const SOCK = { name: "Puppet Sock", changes: [{ key: "flags.eclipsephase.grantsPuppetSock", type: "override", value: "1" }] };
  const settle = () => new Promise(resolve => setTimeout(resolve, 20));

  /**
   * A character with an ego of her own - aptitudes, skills, a Field skill, Ego Flex and an ego trait -
   * whose puppet-socked Guardian is out as a drone.
   * @param {Object[]} [items] - Further items of hers
   * @returns {Promise<{actor: Actor, drone: Actor}>} The character and the drone
   */
  async function operator(items = []) {
    const actor = makeActor({
      _id: "ana", name: "Ana", type: "character",
      system: {
        activeMorph: "morph1",
        aptitudes: { ref: { value: 15 }, int: { value: 10 }, som: { value: 10 }, cog: { value: 10 }, sav: { value: 10 }, wil: { value: 10 } },
        skillsVig: { guns: { value: 45, specname: "Rifles", spec: true }, fray: { value: 20 } },
        ego: { egoFlex: 2 },
        pools: { flex: { value: 3 } }
      },
      items: [
        { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio", dur: 30, flex: 1 } },
        { _id: "drone1", name: "Guardian", type: "vehicle", system: { chassisType: "robot", dur: 25, flex: 1,
          skills: { 1: { name: "Guns", value: 30 }, 2: { name: "Fray", value: 30 }, 3: { name: "Pilot: Aerospace", value: 60 } } } },
        { _id: "sock", name: "Puppet Sock", type: "ware", system: { boundTo: "drone1" }, effects: [SOCK] },
        { _id: "pilot", name: "Pilot: Groundcraft", type: "specialSkill", system: { value: 30, aptitude: "ref" } },
        { _id: "luck", name: "Bad Luck", type: "traits", system: {},
          effects: [{ name: "Bad Luck", changes: [{ key: "system.additionalSystems.noFlipFlop", type: "override", value: "true" }] }] },
        ...items
      ]
    });
    const { drone } = await createDrone(actor, "drone1");
    createdMessages.length = 0;
    return { actor, drone };
  }

  test("the drone acts with the ego's aptitudes, skills and ego traits, its body stays its own, and nothing of it is saved on the drone", async () => {
    const { actor, drone } = await operator();
    expect(drone.system.skillsVig.guns.derived).toBe(30);

    seedDialogs(true);
    expect(await jamDrone(actor, "drone1")).toBe(true);

    expect([jammedDrone(actor), jammingEgo(drone)]).toEqual([drone, actor]);
    expect([drone.system.aptitudes.ref.value, drone.system.skillsVig.guns.derived, drone.system.skillsVig.fray.derived]).toEqual([15, 60, 50]);
    expect([drone.system.skillsVig.guns.specname, drone.system.skillsVig.guns.spec]).toEqual(["Rifles", true]);
    expect(drone.system.additionalSystems.noFlipFlop).toBeTruthy();
    expect([drone.system.health.physical.max, drone.system.physical.activeMorphType]).toEqual([25, "synth"]);
    expect(drone._source.system.skillsVig.guns.value).toBe(30);
    expect(createdMessages.at(-1).content).toContain("ep2e.morph.sleeving.announce.title.jammed");
  });

  test("its sheet lists the ego's Field skills, rolled with the ego's aptitudes", async () => {
    const { actor, drone } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: drone }, {});

    expect(drone.specialSkill.map(row => [row.name, row.roll])).toEqual([["Pilot: Groundcraft", 45]]);
    expect(drone.jammedBy).toBe("Ana");
  });

  test("a body spends its own Flex before the ego's, and what comes back fills the ego's first", () => {
    expect(flexAfter(1, 2, -1, 2)).toEqual({ body: 0, ego: 2 });
    expect(flexAfter(1, 2, -2, 2)).toEqual({ body: 0, ego: 1 });
    expect(flexAfter(0, 1, -3, 2)).toEqual({ body: 0, ego: 0 });
    expect(flexAfter(0, 1, 2, 2)).toEqual({ body: 1, ego: 2 });
  });

  test("Ego Flex is one pool for both bodies: the character keeps its Flex, the drone has its own plus the ego's", async () => {
    const { actor, drone } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");

    expect([drone.system.pools.flex.value, drone.system.pools.flex.totalFlex, actor.system.pools.flex.value]).toEqual([3, 3, 3]);
    expect(drone.getFlag("eclipsephase", "droneJam")).toEqual({ droneFlex: 1, ownFlex: 1, egoFlex: 2 });
  });

  test("Ego Flex spent through the drone is gone for the character at once, the drone's own Flex going first", async () => {
    registerDrones();
    const { actor, drone } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");

    await drone.update({ "system.pools.flex.value": 2 });
    await settle();
    expect([drone.system.pools.flex.value, actor.system.pools.flex.value]).toEqual([2, 3]);

    await drone.update({ "system.pools.flex.value": 1 });
    await settle();
    expect([drone.system.pools.flex.value, actor.system.pools.flex.value]).toEqual([1, 2]);
  });

  test("Ego Flex the character spends with its own body is gone for the drone too, its own body's Flex going first", async () => {
    registerDrones();
    const { actor, drone } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");

    await actor.update({ "system.pools.flex.value": 2 });
    await settle();
    expect([actor.system.pools.flex.value, drone.system.pools.flex.value]).toEqual([2, 3]);

    await actor.update({ "system.pools.flex.value": 0 });
    await settle();
    expect([actor.system.pools.flex.value, drone.system.pools.flex.value]).toEqual([0, 1]);
  });

  test("when the jam ends the drone keeps what is left of its own Flex and the character what is left of its own and the ego's", async () => {
    const { actor, drone } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");
    await drone.update({ "system.pools.flex.value": 1 });

    await endDroneJam(actor);

    expect([drone.system.pools.flex.value, actor.system.pools.flex.value]).toEqual([0, 2]);
    expect([jammedDrone(actor), jammingEgo(drone)]).toEqual([null, null]);
    expect(drone.system.skillsVig.guns.derived).toBe(30);
  });

  test("the drone rolls at -10 unless the ego has a Drone Rig, and the ego's own body at -30", async () => {
    const roll = async actor => {
      createdMessages.length = 0;
      seedDialogs({ rollMode: "public", usePool: "", globalMod: 0 });
      seedRolls([42]);
      await RollCheck({ name: "Guns", key: "guns", type: "skill", rollvalue: 60, pooltype: "Vigor" }, actor.system, actor, { askForOptions: false, optionsSettings: false }, null, "skill");
      return createdMessages[0].content;
    };
    const { actor, drone } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");
    expect(await roll(drone)).toContain("ep2e.roll.announce.jamming.penalty");
    expect(await roll(actor)).toContain("ep2e.roll.announce.jamming.ownBodyPenalty");

    resetWorld();
    game.actors.clear();
    const rigged = await operator([{ _id: "rig", name: "Drone Rig", type: "ware", system: { boundTo: "morph1" },
      effects: [{ name: "Drone Rig", changes: [{ key: "system.additionalSystems.jamming.ignorePenalty", type: "override", value: "true" }] }] }]);
    seedDialogs(true);
    await jamDrone(rigged.actor, "drone1");
    expect(await roll(rigged.drone)).not.toContain("ep2e.roll.announce.jamming.penalty");
  });

  test("the status box shows what the jam costs before any roll: -10 on the drone, none with a Drone Rig, -30 on the ego's own body", async () => {
    const costs = actor => actor.system.currentStatus.specialModifiers.filter(entry => entry.flag === "jamming").map(entry => [entry.label, entry.modifier]);
    const { actor, drone } = await operator();
    expect([costs(drone), costs(actor)]).toEqual([[], []]);

    seedDialogs(true);
    await jamDrone(actor, "drone1");
    expect(costs(drone)).toEqual([["ep2e.roll.announce.jamming.penalty", -10]]);
    expect(costs(actor)).toEqual([["ep2e.roll.announce.jamming.ownBodyPenalty", -30]]);
    expect([drone.system.currentStatus.body, actor.system.currentStatus.body]).toEqual([-10, -30]);

    resetWorld();
    game.actors.clear();
    const rigged = await operator([{ _id: "rig", name: "Drone Rig", type: "ware", system: { boundTo: "morph1" },
      effects: [{ name: "Drone Rig", changes: [{ key: "system.additionalSystems.jamming.ignorePenalty", type: "override", value: "true" }] }] }]);
    seedDialogs(true);
    await jamDrone(rigged.actor, "drone1");
    expect(costs(rigged.drone)).toEqual([]);
  });

  test("on the drone's sheet the ego's aptitudes, skills, Ego Flex and Field skills are locked, its own fields stay open", async () => {
    const { actor, drone } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");
    const own = drone.items.find(item => item.type === "specialSkill");
    const { document } = new JSDOM(`<div id="sheet">
      <input name="system.aptitudes.ref.value"><input name="system.skillsVig.guns.value"><input name="system.skillsIns.perceive.specname">
      <input name="system.ego.egoFlex"><input name="system.health.physical.value"><input name="name">
      <div id="skillsPane">
        <div class="item" data-item-id="pilot"><input class="sheet-inline-edit"><a class="item-delete"></a></div>
        <div class="item" data-item-id="${own.id}"><input class="sheet-inline-edit"><a class="item-delete"></a></div>
      </div></div>`).window;
    const html = document.getElementById("sheet");

    lockEgoFields(html, drone);

    const locked = Array.from(html.querySelectorAll("input")).map(input => input.disabled);
    expect(locked).toEqual([true, true, true, true, false, false, true, false]);
    expect(Array.from(html.querySelectorAll(".item-delete")).map(control => control.style.display)).toEqual(["none", ""]);
  });

  test("the drone's sheet never saves the ego's values over its own", () => {
    const data = { name: "Guardian", system: { aptitudes: { ref: { value: 15 } }, skillsVig: { guns: { value: 45 } }, skillsIns: {}, skillsMox: {},
      ego: { egoFlex: 2, age: "3" }, health: { physical: { value: 4 } } } };
    expect(stripEgoOverlay(data)).toEqual({ name: "Guardian", system: { ego: { age: "3" }, health: { physical: { value: 4 } } } });
  });

  test("backing out of the dialog, or jamming a drone already, starts no jam", async () => {
    const { actor, drone } = await operator();
    seedDialogs(false);
    expect(await jamDrone(actor, "drone1")).toBe(false);
    expect(jammingEgo(drone)).toBeNull();

    seedDialogs(true);
    await jamDrone(actor, "drone1");
    createdMessages.length = 0;
    seedDialogs(true);
    expect(await jamDrone(actor, "drone1")).toBe(false);
    expect(createdMessages).toHaveLength(0);
  });

  test("unjamming on the player's word ends it, backing out keeps it", async () => {
    const { actor } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");

    seedDialogs(false);
    await unjamDrone(actor);
    expect(jammedDrone(actor)).not.toBeNull();

    seedDialogs(true);
    await unjamDrone(actor);
    expect(jammedDrone(actor)).toBeNull();
  });

  test("the jam breaks off when the drone is knocked out, and when the ego's own body is, and says so", async () => {
    registerDrones();
    const first = await operator();
    seedDialogs(true);
    await jamDrone(first.actor, "drone1");
    createdMessages.length = 0;
    await inflictCondition(first.drone, "unconscious");
    await settle();
    expect(jammedDrone(first.actor)).toBeNull();
    expect(createdMessages.at(-1).content).toContain("ep2e.morph.jamming.broken");

    seedDialogs(true);
    await first.drone.deleteEmbeddedDocuments("ActiveEffect", first.drone.effects.map(effect => effect.id));
    await jamDrone(first.actor, "drone1");
    await inflictCondition(first.actor, "unconscious");
    await settle();
    expect(jammedDrone(first.actor)).toBeNull();
  });

  test("recalling a jammed drone ends the jam first, and so does deleting it by hand", async () => {
    registerDrones();
    const { actor, drone } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");

    await bringDroneHome(drone);
    expect([actor.getFlag("eclipsephase", "jammedDrone"), actor.system.pools.flex.value]).toEqual([undefined, 3]);

    const again = await createDrone(actor, "drone1");
    seedDialogs(true);
    await jamDrone(actor, "drone1");
    await again.drone.delete();
    await settle();
    expect(actor.getFlag("eclipsephase", "jammedDrone")).toBeUndefined();
  });

  test("a change to the ego shows on the drone it jams", async () => {
    registerDrones();
    const { actor, drone } = await operator();
    seedDialogs(true);
    await jamDrone(actor, "drone1");

    await actor.update({ "system.skillsVig.guns.value": 60 });
    await settle();

    expect(drone.system.skillsVig.guns.derived).toBe(75);
  });

  test("a broken or knocked-out drone, one without a puppet sock, and a busy or downed ego cannot jam", async () => {
    const { actor, drone } = await operator();
    const vehicle = actor.items.get("drone1");
    vehicle.hasPuppetSock = true;
    expect(droneJamBlock(actor, vehicle, null)).toBeNull();
    expect(droneJamBlock(actor, vehicle, "ego down")).toBe("ego down");

    vehicle.hasPuppetSock = false;
    expect(droneJamBlock(actor, vehicle, null)).toBe("ep2e.actorSheet.popUp.needPuppetSockToJam");
    drone.statuses = new Set(["unconscious"]);
    expect(droneJamBlock(actor, vehicle, null)).toContain("ep2e.morph.jamming.blocked");
    drone.statuses = new Set(["dead"]);
    expect(droneJamBlock(actor, vehicle, null)).toBe("ep2e.morph.drone.destroyed");

    actor.flags.eclipsephase = { ...actor.flags.eclipsephase, jammedDrone: drone.id };
    expect(jamBlockReason(actor)).toBe("ep2e.morph.jamming.busy");
  });

  test("its tab on the character offers Jam beside Recall, and Unjam while jammed", async () => {
    const render = actor => foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/actor/partials/tabs/morph-tab.html",
      { actor, tabGroups: { morph: "sleeved" }, tabs: { primary: { morph: { active: true } } }, isGM: true, editable: true });
    const { actor } = await operator();
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    const out = await render(actor);
    expect(out).toContain(" jamDroneButton");
    expect(out).toContain("recallDroneButton");

    seedDialogs(true);
    await jamDrone(actor, "drone1");
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    const jammed = await render(actor);
    expect(jammed).toContain("unjamDroneButton");
    expect(jammed).not.toContain(" jamDroneButton");
    expect(jammed).not.toContain("sleeveButton");
  });

  /**
   * The same character with her Guardian still at home and a spare Fury with a puppet sock.
   * @returns {Actor} The character
   */
  function atHome() {
    return makeActor({
      _id: "bea", name: "Bea", type: "character",
      system: { activeMorph: "morph1", aptitudes: { ref: { value: 15 } }, skillsVig: { guns: { value: 45 } }, ego: { egoFlex: 1 }, pools: { flex: { value: 2 } } },
      items: [
        { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio", dur: 30, flex: 1 } },
        { _id: "morph2", name: "Fury", type: "morph", system: { type: "bio", dur: 50, flex: 2 }, flags: { eclipsephase: { bodyDamage: { value: 4, wounds: 0 } } } },
        { _id: "drone1", name: "Guardian", type: "vehicle", system: { chassisType: "robot", dur: 25, skills: { 1: { name: "Guns", value: 30 } } } },
        { _id: "sock1", name: "Puppet Sock", type: "ware", system: { boundTo: "drone1" }, effects: [SOCK] },
        { _id: "sock2", name: "Puppet Sock", type: "ware", system: { boundTo: "morph2" }, effects: [SOCK] },
        { _id: "claws", name: "Claws", type: "ccWeapon", system: { boundTo: "morph2" } }
      ]
    });
  }

  test("jamming a vehicle at home sends it out for the jam, without announcing a deployment, and unjamming collects it again", async () => {
    const actor = atHome();
    seedDialogs(true);

    expect(await jamDrone(actor, "drone1")).toBe(true);
    const drone = jammedDrone(actor);

    expect(drone.flags.eclipsephase.drone.temporary).toBe(true);
    expect(drone.system.skillsVig.guns.derived).toBe(60);
    expect(createdMessages.map(message => message.content).join()).not.toContain("ep2e.morph.drone.announce.deployed");
    expect(createdMessages.at(-1).content).toContain("ep2e.morph.sleeving.announce.title.jammed");

    createdMessages.length = 0;
    seedDialogs(true);
    await unjamDrone(actor);

    expect([jammedDrone(actor), game.actors.get(drone.id), deployedDrone(actor.items.get("drone1"))]).toEqual([null, undefined, null]);
    expect(actor.system.pools.flex.value).toBe(2);
    expect(createdMessages).toHaveLength(0);
  });

  test("a body out only for a jam counts as jammed on its tab from the moment it is out", async () => {
    const actor = atHome();
    await createDrone(actor, "drone1", { temporary: true });
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    const html = await foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/actor/partials/tabs/morph-tab.html",
      { actor, tabGroups: { morph: "sleeved" }, tabs: { primary: { morph: { active: true } } }, isGM: true, editable: true });

    expect(actor.remoteVehicles[0].droneJammed).toBe(true);
    expect(html).toContain("unjamDroneButton");
    expect(html).not.toContain("recallDroneButton");
  });

  test("a drone that was out before the jam stays out when the jam ends", async () => {
    const actor = atHome();
    const { drone } = await createDrone(actor, "drone1");
    seedDialogs(true);
    await jamDrone(actor, "drone1");

    seedDialogs(true);
    await unjamDrone(actor);

    expect([jammedDrone(actor), deployedDrone(actor.items.get("drone1"))]).toEqual([null, drone]);
  });

  test("a morph with a puppet sock is jammed the same way: out with what it carries and the damage it kept, collected at the end", async () => {
    const actor = atHome();
    expect(await createDrone(actor, "morph2")).toBeNull();
    seedDialogs(true);
    await jamDrone(actor, "morph2");
    const puppet = jammedDrone(actor);

    expect(puppet.items.get(puppet.system.activeMorph).type).toBe("morph");
    expect([puppet.system.health.physical.max, puppet.system.health.physical.value, puppet.system.physical.activeMorphType]).toEqual([50, 4, "bio"]);
    expect(puppet.items.some(item => item.name === "Claws")).toBe(true);
    expect(puppet.system.skillsVig.guns.derived).toBe(60);
    expect(getBodyBindingInfo(actor).bodies.map(body => body.id)).toEqual(["morph1", "drone1"]);

    await puppet.update({ "system.health.physical.value": 9 });
    seedDialogs(true);
    await unjamDrone(actor);

    expect(actor.items.get("morph2").getFlag("eclipsephase", "bodyDamage")).toEqual({ value: 9, wounds: 0 });
    expect(game.actors.get(puppet.id)).toBeUndefined();
  });

  test("a body knocked out mid-jam stays where it fell, out like any drone", async () => {
    registerDrones();
    const actor = atHome();
    seedDialogs(true);
    await jamDrone(actor, "drone1");
    const drone = jammedDrone(actor);

    await inflictCondition(drone, "unconscious");
    await settle();

    expect(jammedDrone(actor)).toBeNull();
    expect([deployedDrone(actor.items.get("drone1")), drone.flags.eclipsephase.drone.temporary]).toEqual([drone, false]);
  });

  test("a player's jam of a body at home goes to the active GM, one of a drone already out does not", async () => {
    const emit = jest.spyOn(game.socket, "emit");
    const actor = atHome();
    const { drone } = await createDrone(actor, "drone1");
    game.user.isGM = false;

    seedDialogs(true);
    await jamDrone(actor, "morph2");
    seedDialogs(true);
    await jamDrone(actor, "drone1");

    expect(emit.mock.calls.map(([, sent]) => sent)).toEqual([{ action: "jamBody", actorUuid: actor.uuid, bodyId: "morph2", userId: game.user.id }]);
    expect(jammedDrone(actor)).toBe(drone);
    emit.mockRestore();
  });

  test("an incapacitated, unconscious or dead ego cannot start a jam", () => {
    const actor = atHome();
    expect(jamBlockReason(actor)).toBeNull();
    actor.statuses = new Set(["incapacitated"]);
    expect(jamBlockReason(actor)).toContain("ep2e.morph.jamming.blocked");
  });

  test("a jammed morph's tab offers Unjam, and its panel opens the puppet's sheet instead of listing what it carries", async () => {
    const render = actor => foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/actor/partials/tabs/morph-tab.html",
      { actor, tabGroups: { morph: "sleeved" }, tabs: { primary: { morph: { active: true } } }, isGM: true, editable: true });
    const actor = atHome();
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    const home = await render(actor);
    expect(home.match(/jammButton"/g).length).toBeGreaterThanOrEqual(2);
    expect(home).toContain("sleeveButton");

    seedDialogs(true);
    await jamDrone(actor, "morph2");
    await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
    const jammed = await render(actor);
    expect(jammed).toContain("unjamDroneButton");
    expect(jammed).toContain("openDroneSheet");
    expect(jammed).not.toContain("sleeveButton");
    expect(actor.bodies.morph2.damage.locked).toBe(true);
  });
});
