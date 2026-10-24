import EPactorSheet from "../../module/actor/EPactorSheet.js";
import {
  resleeveMorph, deleteBody, getBodyBindingInfo, resolveBodyForItem, rebindArmor,
  stashArmor, equipArmorFromStash, resolveArmorOnBodyDelete
} from "../../module/common/morp-functions.js";
import { makeActor, resetWorld, seedDialogs } from "../setup/factories.js";

const { createdMessages } = global.__ep;

/**
 * A character sleeved in one morph with a second one in reserve. The sleeved body carries a piece
 * of ware and a vest; the reserve body carries ware of its own.
 * @param {Object} [options] - Extra items and actor system fields
 * @returns {Actor} The prepared actor
 */
function twoBodies({ items = [], system = {} } = {}) {
  return makeActor({
    type: "character",
    system: { activeMorph: "morph1", ego: { egoFlex: 1 }, ...system },
    items: [
      { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio", flex: 1 } },
      { _id: "morph2", name: "Fury", type: "morph", system: { type: "bio", flex: 2 } },
      { _id: "ware1", name: "Neurachem", type: "ware", system: { boundTo: "morph1" } },
      { _id: "ware2", name: "Enhanced Vision", type: "ware", system: { boundTo: "morph2" } },
      { _id: "vest1", name: "Vest", type: "armor", system: { boundTo: "morph1", energy: 3, kinetic: 4 } },
      ...items
    ]
  });
}

/**
 * Sorts the actor's items into the sheet's buckets, which deleteBody reads its bound items from.
 * @param {Actor} actor - The actor
 * @returns {Promise<Actor>} The actor
 */
async function sorted(actor) {
  await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
  return actor;
}

/**
 * A sleeve button click on a body.
 * @param {String} itemId - The body's id
 * @returns {Object} What the sheet hands resleeveMorph
 */
function sleeveClick(itemId) {
  return { dataset: { itemId, name: "Fury" } };
}

beforeEach(() => resetWorld());

describe("resleeving", () => {
  test("a confirmed resleeve moves the ego into the new morph and refills every pool", async () => {
    const actor = twoBodies({ system: { pools: { insight: { value: 0 }, vigor: { value: 0 }, moxie: { value: 0 } } } });
    const sheet = { tabGroups: {} };
    seedDialogs(true);

    await resleeveMorph(actor, sleeveClick("morph2"), sheet);
    await new Promise(resolve => setTimeout(resolve, 0));

    const pools = actor.system.pools;
    expect(actor.system.activeMorph).toEqual("morph2");
    expect(pools.flex.value).toEqual(3);
    expect([pools.insight.value, pools.vigor.value, pools.moxie.value])
      .toEqual([pools.insight.totalInsight, pools.vigor.totalVigor, pools.moxie.totalMoxie]);
    expect(actor.getFlag("eclipsephase", "resleeving")).toBe(false);
    expect(sheet.tabGroups.morph).toEqual("sleeved");
    expect(createdMessages).toHaveLength(1);
  });

  test("backing out of the confirmation changes nothing", async () => {
    const actor = twoBodies();
    seedDialogs(false);

    await resleeveMorph(actor, sleeveClick("morph2"), { tabGroups: {} });

    expect(actor.system.activeMorph).toEqual("morph1");
    expect(createdMessages).toHaveLength(0);
  });

  test("an ego off jamming a remote body cannot resleeve", async () => {
    const actor = twoBodies({ system: { activeJam: "drone1" } });
    seedDialogs(true);

    await resleeveMorph(actor, sleeveClick("morph2"), { tabGroups: {} });

    expect(actor.system.activeMorph).toEqual("morph1");
  });
});

describe("deleting a body", () => {
  test("takes everything bound to it along, and leaves the other body's items alone", async () => {
    const actor = await sorted(twoBodies());

    await deleteBody(actor, "morph1");

    expect(actor.items.get("morph1")).toBeUndefined();
    expect(actor.items.get("ware1")).toBeUndefined();
    expect(actor.items.get("vest1")).toBeUndefined();
    expect(actor.items.get("morph2")).toBeDefined();
    expect(actor.items.get("ware2")).toBeDefined();
  });

  test("an NPC's vehicle takes only the vehicle bucket, never the morph's items", async () => {
    const actor = await sorted(makeActor({
      type: "npc",
      system: { activeMorph: "morph1" },
      items: [
        { _id: "morph1", name: "Body", type: "morph", system: { type: "bio" } },
        { _id: "drone1", name: "Drone", type: "vehicle", system: { type: "synth", chassisType: "robot" } },
        { _id: "ware1", name: "Neurachem", type: "ware", system: { boundTo: "activeMorph" } }
      ]
    }));

    await deleteBody(actor, "drone1");

    expect(actor.items.get("drone1")).toBeUndefined();
    expect(actor.items.get("morph1")).toBeDefined();
    expect(actor.items.get("ware1")).toBeDefined();
  });
});

describe("which body an item binds to", () => {
  test("a character binds to the body's own id, an NPC to the shared key for its kind", () => {
    const character = twoBodies();
    const npc = makeActor({ type: "npc", items: [
      { _id: "morph1", name: "Body", type: "morph" },
      { _id: "drone1", name: "Drone", type: "vehicle" }
    ] });

    expect(getBodyBindingInfo(character).boundToFor(character.items.get("morph2"))).toEqual("morph2");
    expect(getBodyBindingInfo(npc).boundToFor(npc.items.get("morph1"))).toEqual("activeMorph");
    expect(getBodyBindingInfo(npc).boundToFor(npc.items.get("drone1"))).toEqual("activeVehicle");
  });

  test("with no body at all the item is refused", async () => {
    const actor = makeActor({ type: "character" });

    expect(await resolveBodyForItem(actor, "ep2e.systemMessage.itemAttachment.noBodyArmor")).toEqual({ cancelled: true });
  });

  test("with exactly one body it binds there without asking", async () => {
    const actor = makeActor({ type: "character", items: [{ _id: "morph1", name: "Splicer", type: "morph" }] });

    const resolved = await resolveBodyForItem(actor, "ep2e.systemMessage.itemAttachment.noBodyArmor");

    expect(resolved.boundTo).toEqual("morph1");
  });

  test("a character with several bodies picks one, and backing out cancels", async () => {
    const actor = twoBodies();

    seedDialogs({ selection: "morph2" });
    expect((await resolveBodyForItem(actor, "x")).boundTo).toEqual("morph2");

    seedDialogs({ cancelled: true });
    expect(await resolveBodyForItem(actor, "x")).toEqual({ cancelled: true });
  });
});

describe("moving armour", () => {
  test("rebinding moves the vest to the body picked", async () => {
    const actor = twoBodies();
    seedDialogs({ selection: "morph2" });

    await rebindArmor(actor, "vest1");

    expect(actor.items.get("vest1").system.boundTo).toEqual("morph2");
  });

  test("with no other body to move to, the vest stays where it is", async () => {
    const actor = makeActor({ type: "character", items: [
      { _id: "morph1", name: "Splicer", type: "morph" },
      { _id: "vest1", name: "Vest", type: "armor", system: { boundTo: "morph1" } }
    ] });

    await rebindArmor(actor, "vest1");

    expect(actor.items.get("vest1").system.boundTo).toEqual("morph1");
  });

  test("stashing sets the vest aside once confirmed, or at once on a shift-click", async () => {
    const actor = twoBodies();

    seedDialogs(false);
    await stashArmor(actor, "vest1", false);
    expect(actor.items.get("vest1").system.boundTo).toEqual("morph1");

    await stashArmor(actor, "vest1", true);
    expect(actor.items.get("vest1").system.boundTo).toEqual("stash");
  });

  test("an NPC has no stash", async () => {
    const actor = makeActor({ type: "npc", items: [{ _id: "vest1", name: "Vest", type: "armor", system: { boundTo: "activeMorph" } }] });

    await stashArmor(actor, "vest1", true);

    expect(actor.items.get("vest1").system.boundTo).toEqual("activeMorph");
  });

  test("equipping from the stash binds the vest to the body picked and announces it", async () => {
    const actor = twoBodies({ items: [{ _id: "vest2", name: "Coat", type: "armor", system: { boundTo: "stash" } }] });
    seedDialogs({ selection: "morph2" });

    await equipArmorFromStash(actor, "vest2");

    expect(actor.items.get("vest2").system.boundTo).toEqual("morph2");
    expect(createdMessages).toHaveLength(1);
  });
});

describe("armour on a body about to be deleted", () => {
  test("a body with no armour bound may simply go", async () => {
    const actor = twoBodies();

    expect(await resolveArmorOnBodyDelete(actor, "morph2", "Fury")).toEqual({ proceed: true });
  });

  test("a character can stash the armour first, and the delete then leaves it alone", async () => {
    const actor = await sorted(twoBodies());
    seedDialogs({ stash: true });

    const outcome = await resolveArmorOnBodyDelete(actor, "morph1", "Splicer");
    await deleteBody(actor, "morph1");

    expect(outcome).toEqual({ proceed: true });
    expect(actor.items.get("vest1").system.boundTo).toEqual("stash");
  });

  test("a character can let the armour go with the body", async () => {
    const actor = await sorted(twoBodies());
    seedDialogs({ stash: false });

    expect(await resolveArmorOnBodyDelete(actor, "morph1", "Splicer")).toEqual({ proceed: true });
    await deleteBody(actor, "morph1");

    expect(actor.items.get("vest1")).toBeUndefined();
  });

  test("backing out keeps body and armour", async () => {
    const actor = twoBodies();
    seedDialogs({ cancelled: true });

    expect(await resolveArmorOnBodyDelete(actor, "morph1", "Splicer")).toEqual({ proceed: false });
    expect(actor.items.get("vest1").system.boundTo).toEqual("morph1");
  });

  test("an NPC is only asked to confirm that the armour goes too", async () => {
    const actor = makeActor({ type: "npc", items: [
      { _id: "morph1", name: "Body", type: "morph" },
      { _id: "vest1", name: "Vest", type: "armor", system: { boundTo: "activeMorph" } }
    ] });

    seedDialogs(false);
    expect(await resolveArmorOnBodyDelete(actor, "activeMorph", "Body")).toEqual({ proceed: false });

    seedDialogs(true);
    expect(await resolveArmorOnBodyDelete(actor, "activeMorph", "Body")).toEqual({ proceed: true });
  });
});
