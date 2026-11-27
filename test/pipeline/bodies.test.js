import EPactorSheet, { isSectionOpen, setSectionOpen, toggleBodySection } from "../../module/actor/EPactorSheet.js";
import {
  resleeveMorph, bodyDamage, bodyDamagePlace, setBodyDamage, bodyKind, deleteBody, getBodyBindingInfo, resolveBodyForItem, rebindItem,
  stashItem, equipItemFromStash, announceKind, ANNOUNCE_KINDS, resolveItemsOnBodyDelete, tacnetChannel, seesThroughTacnet, sharedSightMode,
  registerBodyTokens, locationOf, itemsOn, isUsable, moveItem, npcBodyKey, targetKinds
} from "../../module/common/morp-functions.js";
import { mergeOrCreateItem } from "../../module/common/general-sheet-functions.js";
import { calcEffects, sleevingTest } from "../../module/rolls/resleeving.js";
import { healBody } from "../../module/rolls/health.js";
import { registerStrikeChecks } from "../../module/rolls/damage.js";
import { readDialogValues } from "../../module/rolls/dice.js";
import { makeActor, makeItem, resetWorld, seedDialogs, seedRolls, setSetting } from "../setup/factories.js";
import { JSDOM } from "jsdom";

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

describe("resleeving in one dialog", () => {
  afterEach(() => jest.restoreAllMocks());

  /**
   * Runs a body change's tests, answering their one dialog with the given values.
   * @param {Actor} actor - The actor
   * @param {String} type - "resleeve", "integration" or "stress"
   * @param {Object} answer - What the dialog returns: values per column, rollMode, shared
   * @param {Number[]} dice - The d100 results, in order
   * @returns {Promise<Object>} The dialog's options and the result card
   */
  async function resleeve(actor, type, answer, dice) {
    const wait = jest.spyOn(foundry.applications.api.DialogV2, "wait").mockResolvedValue(answer);
    seedRolls(dice);
    const card = await sleevingTest({ currentTarget: { dataset: { actorid: actor.id, type } } });
    return { dialogs: wait.mock.calls.map(([options]) => options), card };
  }

  test("asks for both tests side by side, with one roll mode and what a failed Stress Test costs, then rolls each with its own values", async () => {
    const actor = makeActor({ type: "character", name: "Ana", system: { aptitudes: { som: { value: 15 }, wil: { value: 15 } } } });
    const { dialogs, card } = await resleeve(actor, "resleeve", { values: [{ globalMod: "", usePool: "" }, { globalMod: "-10", usePool: "" }], rollMode: "private", shared: { stressSeverity: "majorStress" } }, [20, 30]);

    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].content.match(/class="ep-dialog-column"/g)).toHaveLength(2);
    expect(dialogs[0].content.match(/name="rollMode"/g)).toHaveLength(1);
    expect(dialogs[0].content).toContain('name="stressSeverity"');
    expect(dialogs[0].content).not.toMatch(/<form\b/);
    expect(card.whisper).toContain(game.user._id);
    expect(card.flavor).toContain('data-stressseverity="majorStress"');
    expect(card.flavor).toContain("-10");
  });

  test("once its tests are rolled, the announcement of the body change loses its roll buttons and says so", async () => {
    const { window } = new JSDOM("");
    global.DOMParser = window.DOMParser;
    const actor = makeActor({ type: "character", name: "Ana", system: { aptitudes: { som: { value: 15 }, wil: { value: 15 } } } });
    const announcement = await ChatMessage.create({ content: `<p>Sleeved</p><div class="item privateChatButton horizontal"><button class="chatButton resleeve">Roll</button></div>` });
    const row = window.document.createElement("li");
    row.className = "chat-message";
    row.dataset.messageId = announcement.id;
    const button = window.document.createElement("button");
    Object.assign(button.dataset, { actorid: actor.id, type: "resleeve" });
    row.append(button);
    jest.spyOn(foundry.applications.api.DialogV2, "wait").mockResolvedValue({ values: [{ globalMod: "" }, { globalMod: "" }], rollMode: "public", shared: { stressSeverity: "minorStress" } });
    seedRolls([20, 30]);

    try {
      await sleevingTest({ currentTarget: button });
    } finally {
      delete global.DOMParser;
    }

    expect(announcement.content).not.toContain("resleeve");
    expect(announcement.content).toContain("ep2e.morph.sleeving.announce.rolled");
  });

  test("a single test shows one column and no stress choice", async () => {
    const actor = makeActor({ type: "character", name: "Ana", system: { aptitudes: { som: { value: 15 } } } });
    const { dialogs, card } = await resleeve(actor, "integration", { values: [{ globalMod: "", usePool: "" }], rollMode: "public", shared: {} }, [20]);

    expect(dialogs[0].content.match(/class="ep-dialog-column"/g)).toHaveLength(1);
    expect(dialogs[0].content).not.toContain('name="stressSeverity"');
    expect(card.whisper ?? []).toEqual([]);
  });

  test("cancelling the dialog rolls nothing", async () => {
    const actor = makeActor({ type: "character", name: "Ana" });
    const before = createdMessages.length;
    const { card } = await resleeve(actor, "resleeve", { cancelled: true }, []);

    expect(card).toBeNull();
    expect(createdMessages).toHaveLength(before);
  });

  test("a failed Stress Test costs the stress chosen before the roll, without asking again, seen as the result card was", async () => {
    const actor = makeActor({ type: "character", system: { aptitudes: { wil: { value: 15 } } } });
    const wait = jest.spyOn(foundry.applications.api.DialogV2, "wait");
    seedRolls([4]);

    await calcEffects(actor, actor.system, 4, 1, { stressSeverity: "minorStress", whisper: ["gm1"], blind: false });

    expect(wait).not.toHaveBeenCalled();
    expect(actor.system.health.mental.value).toEqual(4);
    expect(createdMessages.at(-1).whisper).toEqual(["gm1"]);
  });

  test("a roll dialog's column is read by its own fields: text, checkbox and radio", () => {
    const { document } = new JSDOM("").window;
    const column = document.createElement("div");
    column.innerHTML = `<input name="globalMod" value="-20"><input type="checkbox" name="useSpec" checked><input type="radio" name="mode" value="a"><input type="radio" name="mode" value="b" checked>`;

    expect(readDialogValues(column, ["globalMod", "useSpec", "mode", "missing"])).toEqual({ globalMod: "-20", useSpec: true, mode: "b", missing: null });
  });
});

describe("resleeving", () => {
  test("a resleeve with both tests passed says so in the chat and leaves nothing behind", async () => {
    const actor = makeActor();
    await calcEffects(actor, actor.system, 3, 4);

    expect(createdMessages.at(-1).content).toContain("ep2e.morph.sleeving.announce.result.cleanCopy");
    expect(Array.from(actor.effects)).toHaveLength(0);
  });

  test("a passed integration test without a stress test counts as clean too", async () => {
    const actor = makeActor();
    await calcEffects(actor, actor.system, 5, null);

    expect(createdMessages.at(-1).content).toContain("ep2e.morph.sleeving.announce.result.cleanCopy");
  });

  test("a failed integration test brings no clean message", async () => {
    const actor = makeActor();
    await calcEffects(actor, actor.system, 1, 4);

    expect(createdMessages.some(message => String(message.content).includes("cleanCopy"))).toBe(false);
  });

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

});

describe("a body's own damage", () => {
  /**
   * A character sleeved in a hurt Splicer, jamming nothing, with a hurt drone and a spare Fury.
   * @param {Object} [system] - Extra actor system fields
   * @returns {Actor} The prepared actor
   */
  function hurt(system = {}) {
    return makeActor({
      type: "character",
      system: foundry.utils.mergeObject({ activeMorph: "morph1", aptitudes: { wil: { value: 15 } }, health: { physical: { value: 10 }, mental: { value: 4 } }, physical: { wounds: 1 } }, system),
      items: [
        { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio", dur: 30 } },
        { _id: "morph2", name: "Fury", type: "morph", system: { type: "synth", dur: 50 }, flags: { eclipsephase: { bodyDamage: { value: 3, wounds: 0 } } } },
        { _id: "drone1", name: "Guardian", type: "vehicle", system: { chassisType: "robot", dur: 40 }, flags: { eclipsephase: { bodyDamage: { value: 8, wounds: 1 } } } },
        { _id: "nano", name: "Nanobots", type: "ware", system: { boundTo: "drone1" },
          effects: [{ name: "Nanobots", changes: [{ key: "system.additionalSystems.healing.nanobots", type: "override", value: "true" }] }] }
      ]
    });
  }

  test("is the actor's health for the morph the ego is sleeved in, the body's own otherwise", () => {
    const actor = hurt();
    expect([bodyDamagePlace(actor, "morph1"), bodyDamagePlace(actor, "morph2"), bodyDamagePlace(actor, "drone1")]).toEqual(["live", "body", "body"]);
    expect([bodyDamage(actor, "morph1"), bodyDamage(actor, "drone1")]).toEqual([{ value: 10, wounds: 1 }, { value: 8, wounds: 1 }]);
  });

  test("set by the GM lands where it is kept", async () => {
    const actor = hurt();
    await setBodyDamage(actor, "drone1", { wounds: 3 });
    await setBodyDamage(actor, "morph1", { value: 4 });
    expect(actor.items.get("drone1").getFlag("eclipsephase", "bodyDamage")).toEqual({ value: 8, wounds: 3 });
    expect([actor.system.health.physical.value, actor.system.physical.wounds]).toEqual([4, 1]);
  });

  test("healed fully from its panel, a body not in use heals on itself and the actor's health stays", async () => {
    const actor = hurt();
    seedDialogs("full");

    await healBody(actor, "drone1");

    expect(actor.items.get("drone1").getFlag("eclipsephase", "bodyDamage")).toBeUndefined();
    expect([actor.system.health.physical.value, actor.system.physical.wounds]).toEqual([10, 1]);
    expect(createdMessages.at(-1).flavor).toContain("ep2e.roll.announce.heal.full.bodyRepair");
  });

  test("healed fully from its panel, the sleeved morph heals like from the health bar", async () => {
    const actor = hurt();
    seedDialogs("full");

    await healBody(actor, "morph1");

    expect([actor.system.health.physical.value, actor.system.physical.wounds]).toEqual([0, 0]);
    expect(createdMessages.at(-1).flavor).toContain("ep2e.roll.announce.heal.full.bodyHeal");
  });

  test("backing out of the heal dialog heals nothing", async () => {
    const actor = hurt();
    seedDialogs("cancel");

    await healBody(actor, "drone1");

    expect(actor.items.get("drone1").getFlag("eclipsephase", "bodyDamage")).toEqual({ value: 8, wounds: 1 });
    expect(createdMessages).toHaveLength(0);
  });

  test("a body heals or is repaired by what it is made of", () => {
    expect([
      bodyKind({ type: "morph", system: { type: "bio" } }), bodyKind({ type: "morph", system: { type: "info" } }),
      bodyKind({ type: "vehicle", system: { chassisType: "animal" } }), bodyKind({ type: "vehicle", system: { chassisType: "robot" } })
    ]).toEqual(["bio", "info", "bio", "synth"]);
  });

  test("each body panel shows its damage over its durability", async () => {
    const actor = await sorted(hurt());

    expect(actor.bodies.morph1.damage).toEqual({ value: 10, wounds: 1, dur: actor.system.health.physical.max, kind: "bio" });
    expect(actor.bodies.morph2.damage).toEqual({ value: 3, wounds: 0, dur: 50, kind: "synth" });
    expect(actor.remoteVehicles[0].damage).toEqual({ value: 8, wounds: 1, dur: 40, kind: "synth" });
  });

  test("resleeving into a wounded body asks for no check", async () => {
    registerStrikeChecks();
    const actor = hurt();
    await actor.items.get("morph2").setFlag("eclipsephase", "bodyDamage", { value: 3, wounds: 2 });
    seedDialogs(true);

    await resleeveMorph(actor, sleeveClick("morph2"), { tabGroups: {} });
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(actor.system.physical.wounds).toBe(2);
    expect(createdMessages.filter(message => String(message.content).includes("ep2e.chat.strike"))).toHaveLength(0);
  });

  test("resleeving leaves the body's conditions with it and brings the new body's own", async () => {
    const actor = hurt();
    await actor.createEmbeddedDocuments("ActiveEffect", [
      { name: "Prone", statuses: ["prone"], flags: { eclipsephase: { effectKey: "condition" } } },
      { name: "Confused", statuses: ["confused"], flags: { eclipsephase: { effectKey: "condition" } } }
    ]);
    await actor.items.get("morph2").setFlag("eclipsephase", "bodyConditions", [{ name: "Stunned", statuses: ["stunned"], flags: { eclipsephase: { effectKey: "condition" } } }]);
    seedDialogs(true);

    await resleeveMorph(actor, sleeveClick("morph2"), { tabGroups: {} });

    expect(actor.effects.flatMap(effect => Array.from(effect.statuses)).sort()).toEqual(["confused", "stunned"]);
    expect(actor.items.get("morph1").getFlag("eclipsephase", "bodyConditions")).toHaveLength(1);
  });

  test("resleeving leaves damage and wounds with the body left behind and brings the new body's own; stress goes with the ego", async () => {
    const actor = hurt();
    seedDialogs(true);

    await resleeveMorph(actor, sleeveClick("morph2"), { tabGroups: {} });

    expect([actor.system.health.physical.value, actor.system.physical.wounds, actor.system.health.mental.value]).toEqual([3, 0, 4]);
    expect(actor.items.get("morph1").getFlag("eclipsephase", "bodyDamage")).toEqual({ value: 10, wounds: 1 });
    expect(actor.items.get("morph2").getFlag("eclipsephase", "bodyDamage")).toBeUndefined();
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

    await rebindItem(actor, "vest1");

    expect(actor.items.get("vest1").system.boundTo).toEqual("morph2");
  });

  test("with no other body to move to, the vest stays where it is", async () => {
    const actor = makeActor({ type: "character", items: [
      { _id: "morph1", name: "Splicer", type: "morph" },
      { _id: "vest1", name: "Vest", type: "armor", system: { boundTo: "morph1" } }
    ] });

    await rebindItem(actor, "vest1");

    expect(actor.items.get("vest1").system.boundTo).toEqual("morph1");
  });

  test("stashing sets the vest aside once confirmed, or at once on a shift-click", async () => {
    const actor = twoBodies();

    seedDialogs(false);
    await stashItem(actor, "vest1", false);
    expect(actor.items.get("vest1").system.boundTo).toEqual("morph1");

    await stashItem(actor, "vest1", true);
    expect(actor.items.get("vest1").system.boundTo).toEqual("stash");
  });

  test("an NPC has no stash", async () => {
    const actor = makeActor({ type: "npc", items: [{ _id: "vest1", name: "Vest", type: "armor", system: { boundTo: "activeMorph" } }] });

    await stashItem(actor, "vest1", true);

    expect(actor.items.get("vest1").system.boundTo).toEqual("activeMorph");
  });

  test("equipping from the stash binds the vest to the body picked and announces it", async () => {
    setSetting("eclipsephase", "equipAnnouncements", ["armor"]);
    const actor = twoBodies({ items: [{ _id: "vest2", name: "Coat", type: "armor", system: { boundTo: "stash" } }] });
    seedDialogs({ selection: "morph2" });

    await equipItemFromStash(actor, "vest2");

    expect(actor.items.get("vest2").system.boundTo).toEqual("morph2");
    expect(createdMessages).toHaveLength(1);
  });
});

describe("what a body carries when it is about to be deleted", () => {
  test("a body with no armour bound may simply go", async () => {
    const actor = twoBodies();

    expect(await resolveItemsOnBodyDelete(actor, "morph2", "Fury")).toEqual({ proceed: true });
  });

  test("a character can stash the armour first, and the delete then leaves it alone", async () => {
    const actor = await sorted(twoBodies());
    seedDialogs({ stash: true });

    const outcome = await resolveItemsOnBodyDelete(actor, "morph1", "Splicer");
    await deleteBody(actor, "morph1");

    expect(outcome).toEqual({ proceed: true });
    expect(actor.items.get("vest1").system.boundTo).toEqual("stash");
  });

  test("a character can let the armour go with the body", async () => {
    const actor = await sorted(twoBodies());
    seedDialogs({ stash: false });

    expect(await resolveItemsOnBodyDelete(actor, "morph1", "Splicer")).toEqual({ proceed: true });
    await deleteBody(actor, "morph1");

    expect(actor.items.get("vest1")).toBeUndefined();
  });

  test("everything the body carries goes into the Stash with its armour, and what is built in goes with the body", async () => {
    const actor = twoBodies({ items: [
      { _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "morph1" } },
      { _id: "kit", name: "Kit", type: "gear", system: { slotType: "accessory", boundTo: "morph2" } }
    ] });
    seedDialogs({ stash: true });

    expect(await resolveItemsOnBodyDelete(actor, "morph1", "Splicer")).toEqual({ proceed: true });
    await deleteBody(actor, "morph1");

    expect(["vest1", "gun"].map(id => actor.items.get(id).system.boundTo)).toEqual(["stash", "stash"]);
    expect([actor.items.get("morph1"), actor.items.get("ware1")]).toEqual([undefined, undefined]);
    expect(actor.items.get("kit").system.boundTo).toBe("morph2");
  });

  test("a body that carries only a weapon still asks", async () => {
    const actor = twoBodies({ items: [{ _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "morph2" } }] });
    seedDialogs({ cancelled: true });

    expect(await resolveItemsOnBodyDelete(actor, "morph2", "Fury")).toEqual({ proceed: false });
    expect(actor.items.get("gun").system.boundTo).toBe("morph2");
  });

  test("backing out keeps body and armour", async () => {
    const actor = twoBodies();
    seedDialogs({ cancelled: true });

    expect(await resolveItemsOnBodyDelete(actor, "morph1", "Splicer")).toEqual({ proceed: false });
    expect(actor.items.get("vest1").system.boundTo).toEqual("morph1");
  });

  test("an NPC is only asked to confirm that the armour goes too", async () => {
    const actor = makeActor({ type: "npc", items: [
      { _id: "morph1", name: "Body", type: "morph" },
      { _id: "vest1", name: "Vest", type: "armor", system: { boundTo: "activeMorph" } }
    ] });

    seedDialogs(false);
    expect(await resolveItemsOnBodyDelete(actor, "activeMorph", "Body")).toEqual({ proceed: false });

    seedDialogs(true);
    expect(await resolveItemsOnBodyDelete(actor, "activeMorph", "Body")).toEqual({ proceed: true });
  });
});

describe("sight shared through a tacnet", () => {
  const actor = (tacnet, hasPlayerOwner = true, observed = false) => ({
    hasPlayerOwner,
    system: { additionalSystems: { tacnet } },
    testUserPermission: () => observed
  });
  const token = (a, controlled = false) => ({ actor: a, controlled });
  const player = { isGM: false };

  test("the effect's value names the channel, and true means the actor's side", () => {
    expect(tacnetChannel(actor(true))).toEqual("player");
    expect(tacnetChannel(actor("true", false))).toEqual("nonPlayer");
    expect(tacnetChannel(actor("alpha"))).toEqual("alpha");
    expect(tacnetChannel(actor(undefined))).toBeNull();
    expect(tacnetChannel(actor(false))).toBeNull();
    expect(tacnetChannel(null)).toBeNull();
  });

  test("a player sees through a token on the channel of the one they control, and only then", () => {
    const mate = token(actor(true));
    const own = token(actor(true), true);
    const foe = token(actor(true, false));
    const outsider = token(actor(undefined));
    const tokens = [mate, own, foe, outsider];

    expect(seesThroughTacnet(mate, tokens, player)).toBe(true);
    expect(seesThroughTacnet(foe, tokens, player)).toBe(false);
    expect(seesThroughTacnet(outsider, tokens, player)).toBe(false);
    expect(seesThroughTacnet(own, tokens, player)).toBe(false);
  });

  test("without a controlled token a player looks through those they observe, and a viewer outside the net sees nothing", () => {
    const mate = token(actor(true));
    const mine = token(actor(true, true, true));
    expect(seesThroughTacnet(mate, [mate, mine], player)).toBe(true);

    const notOnIt = token(actor(undefined, true, true));
    expect(seesThroughTacnet(mate, [mate, notOnIt], player)).toBe(false);
  });

  test("the GM looks through controlled tokens only", () => {
    const gm = { isGM: true };
    const guard = token(actor(true, false));
    const other = token(actor(true, false));
    expect(seesThroughTacnet(guard, [guard, other], gm)).toBe(false);
    other.controlled = true;
    expect(seesThroughTacnet(guard, [guard, other], gm)).toBe(true);
  });

  test("a user who turned sight effects off sees shared sight without them", () => {
    expect(sharedSightMode(true)).toEqual("tacnet");
    expect(sharedSightMode(false)).toEqual("tacnetPlain");
  });
});

describe("the token follows the body it is sleeved in", () => {
  let emitted;
  let listeners;
  let keepScenes;
  let keepSocket;
  beforeEach(() => {
    emitted = [];
    listeners = [];
    keepScenes = game.scenes;
    keepSocket = { ...game.socket };
    game.socket.emit = (name, payload) => emitted.push([name, payload]);
    game.socket.on = (name, fn) => listeners.push(fn);
    registerBodyTokens();
  });
  afterEach(() => {
    game.scenes = keepScenes;
    Object.assign(game.socket, keepSocket);
  });

  /**
   * Lets the hooks a change set off finish their own updates.
   * @returns {Promise<void>}
   */
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

  /**
   * An actor with a base token image, sleeved in a plain morph, with a reserve morph that has its
   * own token image.
   * @param {String} [type] - The actor type
   * @returns {Actor} The actor
   */
  function sleeved(type = "character") {
    const actor = makeActor({
      type,
      system: { activeMorph: "plain" },
      items: [
        { _id: "plain", name: "Splicer", type: "morph", system: { type: "bio" } },
        { _id: "fury", name: "Fury", type: "morph", system: { type: "bio", customToken: "tokens/fury.webp" } }
      ]
    });
    actor.prototypeToken = { texture: { src: "tokens/me.webp" } };
    return actor;
  }

  /**
   * An active scene holding tokens, which records the token updates made on it.
   * @param {Object[]} tokens - Token stand-ins: id, actorId, actorLink, src, and whether this user may change them
   * @returns {Object} The scene
   */
  function activeScene(tokens) {
    const scene = {
      id: "scene1",
      updates: [],
      tokens: tokens.map(({ id, actorId, actorLink = true, src = "tokens/me.webp", mayChange = true }) => ({
        id, actorId, actorLink, texture: { src }, canUserModify: () => mayChange
      })),
      async updateEmbeddedDocuments(name, updates) { this.updates.push(...updates); }
    };
    game.scenes = { active: scene, get: id => (id === scene.id ? scene : null) };
    return scene;
  }

  test("sleeving into a morph with a token image swaps the prototype and the actor's linked tokens on the active scene", async () => {
    const actor = sleeved();
    const scene = activeScene([{ id: "t1", actorId: actor.id }, { id: "t2", actorId: actor.id, actorLink: false }, { id: "t3", actorId: "someoneElse" }]);

    await actor.update({ "system.activeMorph": "fury" });
    await settle();

    expect(actor.prototypeToken.texture.src).toBe("tokens/fury.webp");
    expect(scene.updates).toEqual([{ _id: "t1", "texture.src": "tokens/fury.webp" }]);
  });

  test("sleeving back into a morph without one brings the actor's own image back", async () => {
    const actor = sleeved();
    activeScene([]);
    await actor.update({ "system.activeMorph": "fury" });
    await settle();
    expect(actor.prototypeToken.texture.src).toBe("tokens/fury.webp");

    await actor.update({ "system.activeMorph": "plain" });
    await settle();

    expect(actor.prototypeToken.texture.src).toBe("tokens/me.webp");
  });

  test("an image picked by hand while the morph shows none becomes the actor's own image", async () => {
    const actor = sleeved();
    activeScene([]);
    await actor.update({ "system.activeMorph": "fury" });
    await settle();
    await actor.update({ "system.activeMorph": "plain" });
    await settle();
    await actor.update({ "prototypeToken.texture.src": "tokens/new-me.webp" });

    await actor.update({ "system.activeMorph": "fury" });
    await settle();
    expect(actor.prototypeToken.texture.src).toBe("tokens/fury.webp");
    await actor.update({ "system.activeMorph": "plain" });
    await settle();

    expect(actor.prototypeToken.texture.src).toBe("tokens/new-me.webp");
  });

  test("a token image given to the sleeved morph shows at once, one given to a reserve morph does not", async () => {
    const actor = sleeved();
    activeScene([]);

    await actor.items.get("fury").update({ "system.customToken": "tokens/fury2.webp" });
    await settle();
    expect(actor.prototypeToken.texture.src).toBe("tokens/me.webp");

    await actor.items.get("plain").update({ "system.customToken": "tokens/splicer.webp" });
    await settle();
    expect(actor.prototypeToken.texture.src).toBe("tokens/splicer.webp");
  });

  test("a goon's prototype changes, its tokens on the scene are its own copies and stay", async () => {
    const actor = sleeved("goon");
    const scene = activeScene([{ id: "t1", actorId: actor.id }]);

    await actor.update({ "system.activeMorph": "fury" });
    await settle();

    expect(actor.prototypeToken.texture.src).toBe("tokens/fury.webp");
    expect(scene.updates).toEqual([]);
  });

  test("tokens this user may not change are left to the active GM, who takes the image from the actor", async () => {
    const actor = sleeved();
    const scene = activeScene([{ id: "t1", actorId: actor.id, mayChange: false }]);
    game.user.isGM = false;
    game.users.activeGM = { id: "gm" };

    await actor.update({ "system.activeMorph": "fury" });
    await settle();

    expect(scene.updates).toEqual([]);
    expect(emitted).toEqual([["system.eclipsephase", { action: "syncBodyToken", sceneId: "scene1", actorId: actor.id }]]);

    game.user.isGM = true;
    game.users.activeGM = { id: game.user.id };
    for (const listen of listeners) await listen({ action: "syncBodyToken", sceneId: "scene1", actorId: actor.id, src: "tokens/forged.webp" });

    expect(scene.updates).toEqual([{ _id: "t1", "texture.src": "tokens/fury.webp" }]);
  });
});

describe("carried weapons weigh on the body that carries them (homebrew encumbrance)", () => {
  /**
   * A character with three two-handed weapons at hand, sleeved in a morph and owning a drone.
   * @param {Object} [system] - Extra actor system fields
   * @returns {Actor} The actor
   */
  function loaded(system = {}) {
    setSetting("eclipsephase", "superBrew", true);
    const rifle = id => ({ _id: id, name: `Rifle ${id}`, type: "rangedWeapon", system: { boundTo: "morph1", slotType: "twoHanded" } });
    return makeActor({
      type: "character",
      system: { activeMorph: "morph1", ...system },
      items: [
        { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio" } },
        { _id: "drone1", name: "Drone", type: "vehicle", system: {} },
        rifle("r1"), rifle("r2"), rifle("r3")
      ]
    });
  }

  test("weapons at hand encumber the sleeved body", () => {
    expect(loaded().system.physical.totalWeaponMalus).toBe(20);
  });

  test("what lies in the Stash weighs on no one", async () => {
    const actor = loaded();
    await actor.items.get("r3").update({ "system.boundTo": "stash" });

    expect(actor.system.physical.totalWeaponMalus).toBe(10);
  });
});

describe("how the sheet sorts a character's items", () => {
  test("by kind, and each into the Stash or onto the body it lies on; ware and traits by their body", async () => {
    const actor = await sorted(makeActor({
      type: "character",
      system: { activeMorph: "morph1" },
      items: [
        { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio" } },
        { _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "morph1" } },
        { _id: "knife", name: "Knife", type: "ccWeapon", system: { boundTo: "stash" } },
        { _id: "kit", name: "Kit", type: "gear", system: { slotType: "accessory", boundTo: "morph1" } },
        { _id: "pill", name: "Pill", type: "drug", system: { slotType: "consumable", boundTo: "stash" } },
        { _id: "rounds", name: "Rounds", type: "ammo", system: { boundTo: "morph1", type: "kinetic" } },
        { _id: "app", name: "App", type: "program", system: {} },
        { _id: "vest", name: "Vest", type: "armor", system: { boundTo: "morph1" } },
        { _id: "coat", name: "Coat", type: "armor", system: { boundTo: "stash" } },
        { _id: "eyes", name: "Eyes", type: "ware", system: { boundTo: "morph1" } }
      ]
    }));
    const ids = list => list.map(item => item.id);

    expect(ids(actor.rangedWeapon)).toEqual(["gun"]);
    expect(ids(actor.ccweapon)).toEqual(["knife"]);
    expect(ids(actor.gear)).toEqual(["kit"]);
    expect(ids(actor.consumable)).toEqual(["pill", "rounds"]);
    expect(ids(actor.ammo.kinetic)).toEqual(["rounds"]);
    expect(ids(actor.program)).toEqual(["app"]);
    const body = actor.bodies.morph1;
    expect([ids(body.peripherals.armor), ids(body.peripherals.weapons), ids(body.peripherals.consumables), ids(body.peripherals.gear)])
      .toEqual([["vest"], ["gun"], ["rounds"], ["kit"]]);
    expect([ids(actor.stash.armor), ids(actor.stash.weapons), ids(actor.stash.consumables), ids(actor.stash.gear), ids(actor.stash.programs)])
      .toEqual([["coat"], ["knife"], ["pill"], [], ["app"]]);
    expect([body.peripheralCount, body.internalCount, actor.stash.count]).toEqual([4, 1, 4]);
    expect(ids(body.morphgear)).toEqual(["eyes"]);
  });
});

describe("where a character's carried items lie", () => {
  /**
   * A character sleeved in one morph, with a drone, a spare morph and carried items in every place.
   * @param {Object[]} [items] - Further items
   * @returns {Actor} The actor
   */
  function owner(items = []) {
    return makeActor({
      type: "character",
      system: { activeMorph: "morph1" },
      items: [
        { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio" } },
        { _id: "morph2", name: "Fury", type: "morph", system: { type: "bio" } },
        { _id: "drone1", name: "Drone", type: "vehicle", system: {} },
        { _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "morph1" } },
        { _id: "turret", name: "Turret", type: "rangedWeapon", system: { boundTo: "drone1" } },
        { _id: "spare", name: "Spare", type: "rangedWeapon", system: { boundTo: "morph2" } },
        { _id: "kept", name: "Kept", type: "rangedWeapon", system: { boundTo: "stash" } },
        { _id: "lost", name: "Lost", type: "rangedWeapon", system: { boundTo: "gone" } },
        { _id: "app", name: "App", type: "program", system: {} },
        ...items
      ]
    });
  }

  test("on the body it is bound to, or in the Stash when it has no body or a program", () => {
    const actor = owner();
    const where = id => locationOf(actor, actor.items.get(id));

    expect(["gun", "turret", "spare", "kept", "lost", "app"].map(where)).toEqual(["morph1", "drone1", "morph2", "stash", "stash", "stash"]);
    expect(itemsOn(actor, "stash").map(item => item.id)).toEqual(["kept", "lost", "app"]);
  });

  test("usable only on the sleeved morph, not on a drone or a spare body; an NPC uses all it has", () => {
    const actor = owner();
    const npc = makeActor({ type: "npc", items: [{ _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "stash" } }] });
    const usable = id => isUsable(actor, actor.items.get(id));

    expect(["gun", "turret", "spare", "kept"].map(usable)).toEqual([true, false, false, false]);
    expect(isUsable(npc, npc.items.get("gun"))).toBe(true);
  });

  test("moving a whole item puts it on the other body", async () => {
    const actor = owner();

    await moveItem(actor, "gun", "stash");

    expect(actor.items.get("gun").system.boundTo).toBe("stash");
  });

  test("part of a stack moves on its own, and joins a stack already there", async () => {
    const actor = owner([
      { _id: "rounds", name: "Rounds", type: "ammo", system: { boundTo: "stash", quantity: 5, type: "kinetic" } },
      { _id: "carried", name: "Rounds", type: "ammo", system: { boundTo: "morph1", quantity: 1, type: "kinetic" } }
    ]);

    await moveItem(actor, "rounds", "morph1", { quantity: 2 });

    expect(actor.items.get("rounds").system.quantity).toBe(3);
    expect(actor.items.get("carried").system.quantity).toBe(3);
  });

  test("of a drug the open pack moves first", async () => {
    const actor = owner([{ _id: "pills", name: "Pills", type: "drug", system: { boundTo: "stash", quantity: 2, usagesMax: 5, usagesUsed: 3, slotType: "consumable" } }]);

    const moved = await moveItem(actor, "pills", "morph1", { quantity: 1 });

    expect([moved.system.quantity, moved.system.usagesUsed]).toEqual([1, 3]);
    expect([actor.items.get("pills").system.quantity, actor.items.get("pills").system.usagesUsed]).toEqual([1, 0]);
  });

  test("two open packs of a drug put together make up whole packs where their doses do", async () => {
    const actor = owner([
      { _id: "kept", name: "Pills", type: "drug", system: { boundTo: "morph1", quantity: 1, usagesMax: 5, usagesUsed: 3, slotType: "consumable" } },
      { _id: "more", name: "Pills", type: "drug", system: { boundTo: "stash", quantity: 2, usagesMax: 5, usagesUsed: 4, slotType: "consumable" } }
    ]);

    await moveItem(actor, "more", "morph1");

    expect(actor.items.get("more")).toBeUndefined();
    expect([actor.items.get("kept").system.quantity, actor.items.get("kept").system.usagesUsed]).toEqual([2, 2]);
  });

  test("a stack in the Stash and one on a body stay two rows", async () => {
    const actor = owner([{ _id: "carried", name: "Rounds", type: "ammo", system: { boundTo: "morph1", quantity: 1, type: "kinetic" } }]);

    await mergeOrCreateItem(actor, { name: "Rounds", type: "ammo", system: { boundTo: "stash", quantity: 4, type: "kinetic" } });

    expect(actor.items.filter(item => item.name === "Rounds").map(item => item.system.quantity)).toEqual([1, 4]);
  });
});

describe("what a character can use, and what helps which body", () => {
  /**
   * A character sleeved in a morph with a spare morph and a drone, carrying a rifle and goggles that
   * add to its Vigor.
   * @param {Object} [system] - Extra actor system fields
   * @param {Object} [where] - Where the rifle, the goggles and the vest lie
   * @returns {Actor} The actor
   */
  function kitted(system = {}, where = {}) {
    return makeActor({
      type: "character",
      system: { activeMorph: "morph1", ...system },
      items: [
        { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio" } },
        { _id: "morph2", name: "Fury", type: "morph", system: { type: "bio" } },
        { _id: "drone1", name: "Drone", type: "vehicle", system: {} },
        { _id: "rifle", name: "Rifle", type: "rangedWeapon", system: { boundTo: where.rifle ?? "morph1" } },
        { _id: "vest", name: "Vest", type: "armor", system: { boundTo: where.vest ?? "morph1" } },
        { _id: "goggles", name: "Goggles", type: "gear", system: { slotType: "accessory", boundTo: where.goggles ?? "morph1" },
          effects: [{ name: "Goggles", changes: [{ key: "system.pools.vigor.mod", type: "add", value: "1" }] }] }
      ]
    });
  }

  test("at hand is what lies on the sleeved morph, never in the Stash, on a drone or on a spare body", () => {
    const active = actor => ["rifle", "vest"].map(id => actor.items.get(id).system.active);

    expect(active(kitted())).toEqual([true, true]);
    expect(active(kitted({}, { rifle: "morph2", vest: "stash" }))).toEqual([false, false]);
    expect(active(kitted({}, { rifle: "drone1" }))).toEqual([false, true]);
  });

  test("an item's effect helps only the body it lies on, and only the one the ego is sleeved in", () => {
    const suppressed = actor => Array.from(actor.items.get("goggles").effects)[0].isSuppressed;

    expect(suppressed(kitted())).toBe(false);
    expect(suppressed(kitted({}, { goggles: "stash" }))).toBe(true);
    expect(suppressed(kitted({}, { goggles: "drone1" }))).toBe(true);
  });

  test("putting part of a stack into the Stash asks how many packs, and moves that many", async () => {
    const actor = kitted();
    await actor.createEmbeddedDocuments("Item", [{ _id: "flares", name: "Flare", type: "gear", system: { slotType: "consumable", quantity: 3, boundTo: "morph1" } }]);
    seedDialogs(2);

    await stashItem(actor, "flares", false);

    expect(actor.items.filter(item => item.name === "Flare").map(item => [item.system.boundTo, item.system.quantity]))
      .toEqual([["morph1", 1], ["stash", 2]]);
  });

  test("a shift-click puts the whole stack into the Stash without asking", async () => {
    const actor = kitted();
    await actor.createEmbeddedDocuments("Item", [{ _id: "flares", name: "Flare", type: "gear", system: { slotType: "consumable", quantity: 3, boundTo: "morph1" } }]);

    await stashItem(actor, "flares", true);

    expect([actor.items.get("flares").system.boundTo, actor.items.get("flares").system.quantity]).toEqual(["stash", 3]);
  });

  test("equipping from the Stash puts the item on the body picked, announced only where the setting names its kind", async () => {
    setSetting("eclipsephase", "equipAnnouncements", ["armor"]);
    const actor = kitted({}, { rifle: "stash", vest: "stash" });

    seedDialogs({ selection: "morph2" });
    await equipItemFromStash(actor, "rifle");
    expect([actor.items.get("rifle").system.boundTo, createdMessages.length]).toEqual(["morph2", 0]);

    setSetting("eclipsephase", "equipAnnouncements", new Set(["weapons", "gear"]));
    await actor.createEmbeddedDocuments("Item", [
      { _id: "knife", name: "Knife", type: "ccWeapon", system: { boundTo: "stash" } },
      { _id: "kit", name: "Kit", type: "gear", system: { boundTo: "stash" } }
    ]);
    await actor.items.get("rifle").update({ "system.boundTo": "stash" });
    for (const id of ["rifle", "knife", "kit", "vest"]) {
      seedDialogs({ selection: "morph1" });
      await equipItemFromStash(actor, id);
    }

    expect(createdMessages.map(message => message.content.includes("ep2e.roll.announce.weapon.equipped"))).toEqual([true, true, false]);
    expect(createdMessages[2].content).toContain("ep2e.roll.announce.item.gear");
    expect(createdMessages[0].content).toContain("Rifle");
  });

  test("both weapon types are announced as one kind, every other carried type by itself", () => {
    expect([announceKind("rangedWeapon"), announceKind("ccWeapon"), announceKind("gear"), announceKind("armor")]).toEqual(["weapons", "weapons", "gear", "armor"]);
    expect(ANNOUNCE_KINDS).toEqual(["armor", "weapons", "gear", "drug", "ammo", "grenade"]);
  });

  test("moving to another body asks for no confirmation once the body is picked", async () => {
    const actor = kitted();
    seedDialogs({ selection: "drone1" });

    await rebindItem(actor, "rifle");

    expect(actor.items.get("rifle").system.boundTo).toBe("drone1");
  });
});

describe("dropping a fresh item onto a character", () => {
  /**
   * Drops an item from outside any actor onto the actor's sheet.
   * @param {Actor} actor - The actor
   * @param {Object} data - The item's data
   * @returns {Promise<Item|null>} The item created
   */
  function drop(actor, data) {
    return EPactorSheet.prototype._onDropItem.call({ actor }, {}, makeItem(data));
  }

  test("offers the Stash first; the item lies where it is put", async () => {
    const actor = twoBodies();

    seedDialogs({ selection: "stash" });
    const stashed = await drop(actor, { name: "Rifle", type: "rangedWeapon" });
    seedDialogs({ selection: "morph2" });
    const carried = await drop(actor, { name: "Knife", type: "ccWeapon" });

    expect([stashed.system.boundTo, carried.system.boundTo]).toEqual(["stash", "morph2"]);
  });

  test("backing out of the choice drops nothing", async () => {
    const actor = twoBodies();
    seedDialogs({ cancelled: true });

    expect(await drop(actor, { name: "Rifle", type: "rangedWeapon" })).toBeNull();
    expect(actor.items.find(item => item.name === "Rifle")).toBeUndefined();
  });

  test("a character without a body puts it into the Stash without asking", async () => {
    const actor = makeActor({ type: "character", items: [] });

    const item = await drop(actor, { name: "Rifle", type: "rangedWeapon" });

    expect(item.system.boundTo).toBe("stash");
  });
});

describe("an NPC whose body is a vehicle", () => {
  /**
   * An NPC that is a guard robot, with a vest and a radar bound to its body, and a car beside it.
   * @param {String} [type] - The actor type
   * @returns {Actor} The prepared actor
   */
  function guardBot(type = "npc") {
    return makeActor({
      type,
      system: { activeMorph: "bot" },
      items: [
        { _id: "bot", name: "Sentry", type: "vehicle", system: { chassisType: "robot", dur: 75, flex: 1, armor: { energy: 18, kinetic: 14 },
          movement: { move1: { active: true, type: "tracked", base: 4, full: 12 } } } },
        { _id: "car", name: "Car", type: "vehicle", system: { chassisType: "vehicle", dur: 100 } },
        { _id: "vest", name: "Vest", type: "armor", system: { boundTo: "activeMorph", energy: 2, kinetic: 3 } },
        { _id: "radar", name: "Radar", type: "ware", system: { boundTo: "activeMorph" } }
      ]
    });
  }

  test("binds what is on it under the body's key, a vehicle beside it under its own", () => {
    const actor = guardBot();
    expect([npcBodyKey(actor, actor.items.get("bot")), npcBodyKey(actor, actor.items.get("car"))]).toEqual(["activeMorph", "activeVehicle"]);
  });

  test("takes durability, armour, movement and its kind from the vehicle", () => {
    for (const type of ["npc", "goon"]) {
      const actor = guardBot(type);
      expect([actor.system.health.physical.max, actor.system.physical.activeMorphType]).toEqual([75, "synth"]);
      expect([actor.system.physical.energyArmorTotal, actor.system.physical.kineticArmorTotal]).toEqual([20, 17]);
      expect(actor.system.additionalSystems.armorEquipped).toBe(true);
      expect(actor.system.currentMovement).toEqual({ type: "tracked", base: 4, full: 12 });
      expect(targetKinds(actor)).toEqual(["bot"]);
    }
  });

  test("an animal body counts as bio", () => {
    const actor = makeActor({ type: "npc", system: { activeMorph: "dog" }, items: [{ _id: "dog", name: "Dog", type: "vehicle", system: { chassisType: "animal", dur: 30 } }] });
    expect([actor.system.physical.activeMorphType, targetKinds(actor)[0]]).toEqual(["bio", "animal"]);
  });

  test("the sheet shows the vehicle as the one body, with what is built in, and not as a remote body", async () => {
    const actor = await sorted(guardBot());
    expect(actor.bodies.activeMorph.morphdetails[0].id).toBe("bot");
    expect(actor.bodies.activeMorph.morphgear.map(item => item.id)).toEqual(["radar"]);
    expect(actor.bodies.migrationBody).toBeUndefined();
    expect(actor.remoteVehicles.map(vehicle => vehicle.id)).toEqual(["car"]);

    const html = await foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/actor/partials/tabs/npcgear.html", { actor });
    expect(html).toContain("ep2e.item.vehicle.table.type.robot");
    expect(html).toContain("ep2e.actorSheet.button.editBody");
  });

  test("a vehicle dropped on an NPC replaces its morph and what was bound to it", async () => {
    const actor = makeActor({ type: "npc", system: { activeMorph: "m" }, items: [
      { _id: "m", name: "Splicer", type: "morph", system: { type: "bio", dur: 30 } },
      { _id: "w", name: "Neurachem", type: "ware", system: { boundTo: "activeMorph" } }
    ] });
    seedDialogs(true);

    const created = await EPactorSheet.prototype._onDropItem.call({ actor }, {}, makeItem({ name: "Sentry", type: "vehicle", system: { chassisType: "robot", dur: 75 } }));

    expect(actor.system.activeMorph).toBe(created.id);
    expect(actor.items.map(item => item.name)).toEqual(["Sentry"]);
    expect(actor.system.health.physical.max).toBe(75);
  });

  test("backing out of the replacement leaves the NPC as it was", async () => {
    const actor = makeActor({ type: "npc", system: { activeMorph: "m" }, items: [{ _id: "m", name: "Splicer", type: "morph", system: { type: "bio", dur: 30 } }] });
    seedDialogs(false);

    const created = await EPactorSheet.prototype._onDropItem.call({ actor }, {}, makeItem({ name: "Sentry", type: "vehicle", system: { chassisType: "robot" } }));

    expect(created).toBeNull();
    expect([actor.system.activeMorph, actor.items.map(item => item.name)]).toEqual(["m", ["Splicer"]]);
  });
});

describe("the body panels and the Stash tab", () => {
  const render = (template, context) => foundry.applications.handlebars.renderTemplate(`systems/eclipsephase/templates/${template}`, context);

  test("a body shows Peripherals and Internals with their counts, closed, one subsection per kind", async () => {
    const actor = await sorted(makeActor({
      type: "character",
      system: { activeMorph: "morph1" },
      items: [
        { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio" } },
        { _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "morph1" } },
        { _id: "kit", name: "Kit", type: "gear", system: { slotType: "accessory", boundTo: "morph1" } },
        { _id: "eyes", name: "Eyes", type: "ware", system: { boundTo: "morph1" } }
      ]
    }));

    const html = await render("actor/partials/body-inventory.html", { body: actor.bodies.morph1, bodyKey: "morph1", actor });

    expect(html).toContain("ep2e.inventory.peripherals (2)");
    expect(html).toContain("ep2e.inventory.internals (1)");
    expect(html.match(/ep-section-body noShow/g)).toHaveLength(2);
    expect(html).toContain("ep2e.inventory.weaponsLabel");
    expect(html).toContain("ep2e.inventory.gearLabel");
    expect(html).not.toContain("ep2e.inventory.consumablesLabel");
    expect(html.match(/item-stash /g)).toHaveLength(2);
    expect(html.match(/item-rebind/g)).toHaveLength(2);
    expect(html).toContain("ep-control-disabled");
    expect(html.match(/<span class="wantToKnowMoreFixed ep-name-tip"/g)).toHaveLength(3);
    expect(html.match(/class="ep-row-icons"/g)).toHaveLength(3);
    expect(html).not.toContain("item-controls");
  });

  test("the Stash tab lists what is put aside, each with Equip but the programs", async () => {
    const actor = await sorted(makeActor({
      type: "character",
      system: { activeMorph: "morph1" },
      items: [
        { _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio" } },
        { _id: "gun", name: "Pistol", type: "rangedWeapon", system: { boundTo: "stash" } },
        { _id: "app", name: "App", type: "program", system: {} }
      ]
    }));

    const html = await render("actor/partials/tabs/gear-tab.html", { actor, tabs: { primary: { weapons: { active: true } } } });

    expect(html).toContain("ep2e.inventory.weaponsLabel");
    expect(html).toContain("ep2e.inventory.programs.label");
    expect(html.match(/item-equip/g)).toHaveLength(1);
    expect(html).not.toContain("data-path=\"system.active\"");
  });

  test("a click on a closed section opens it and it stays open once the slide is done; a second click closes it", async () => {
    jest.useFakeTimers();
    const dom = new JSDOM(`<div><div class="ep-section-toggle" data-body-key="morph1" data-section="internals"><span class="ep-section-chevron"><i class="fa-plus"></i></span></div><div class="ep-section-body noShow" data-display="block"></div></div>`);
    const keep = { window: global.window, document: global.document, getComputedStyle: global.getComputedStyle, requestAnimationFrame: global.requestAnimationFrame };
    Object.assign(global, { window: dom.window, document: dom.window.document, getComputedStyle: el => (el.classList.contains("noShow") && !el.style.display ? { display: "none" } : { display: el.style.display || "block" }), requestAnimationFrame: fn => fn() });
    const actor = makeActor({ type: "character" });
    const toggle = dom.window.document.querySelector(".ep-section-toggle");
    const content = dom.window.document.querySelector(".ep-section-body");
    try {
      toggleBodySection(actor, toggle);
      jest.advanceTimersByTime(300);
      expect([content.classList.contains("noShow"), getComputedStyle(content).display]).toEqual([false, "block"]);

      toggleBodySection(actor, toggle);
      jest.advanceTimersByTime(300);
      expect(getComputedStyle(content).display).toBe("none");
      expect(isSectionOpen(actor, "morph1", "internals")).toBe(false);
    } finally {
      Object.assign(global, keep);
      jest.useRealTimers();
    }
  });

  test("an opened weapon shows its mode as titles over values: four columns for ranged, one for melee, the mode named only on two-mode weapons, NPC rows alike", async () => {
    const weapon = (type, extra = {}) => makeItem({ name: type, type, system: { slotType: "oneHanded", ...extra } });
    const row = (item, sheetType) => render("actor/partials/item-partials/weapons.html", { item, sheetType, type: item.type === "rangedWeapon" ? "ranged" : undefined, place: "body" });
    const titles = html => html.match(/<div class="ep-weapon-stats[^"]*">([\s\S]*?)<\/div>/)[1].match(/resource-label/g).length;

    const ranged = await row(weapon("rangedWeapon"), "PC");
    const melee = await row(weapon("ccWeapon"), "PC");
    const twoModes = await row(weapon("ccWeapon", { additionalMode: true }), "PC");
    const npc = await row(weapon("rangedWeapon"), undefined);

    const rangedTwo = await row(weapon("rangedWeapon", { additionalMode: true }), "PC");

    expect([ranged.includes("ep-weapon-stats-single"), titles(ranged)]).toEqual([true, 4]);
    expect([melee.includes("ep-weapon-stats-single"), titles(melee)]).toEqual([true, 1]);
    expect([rangedTwo.includes("ep-weapon-stats-single"), titles(rangedTwo)]).toEqual([false, 5]);
    expect(titles(twoModes)).toBe(2);
    expect(twoModes.match(/class="ep-weapon-stats /g)).toHaveLength(2);
    expect([npc.includes("ep-weapon-stats-ranged"), titles(npc)]).toEqual([true, 4]);
    expect(npc).toContain("ep-name-tip");
  });

  test("an opened weapon's accessories and traits stand one below the other, each after its title, a dash where there are none", async () => {
    const item = makeItem({ name: "Stunner", type: "rangedWeapon", system: { mode1: { traits: { shock: { value: true, name: "Shock" } } } } });
    item.system.additionalSystems.mode1Traits = 1;
    item.system.additionalSystems.accessories = 0;
    const plain = makeItem({ name: "Knife", type: "ccWeapon" });

    const html = await render("actor/partials/item-partials/weapons.html", { item, sheetType: "PC", type: "ranged", place: "body" });
    const none = await render("actor/partials/item-partials/weapons.html", { item: plain, sheetType: "PC", place: "body" });
    const extras = html.match(/<div class="ep-weapon-extras">([\s\S]*)/)[1];

    expect(extras.indexOf("section.accessories")).toBeLessThan(extras.indexOf("section.traits"));
    expect(extras.indexOf("section.traits")).toBeLessThan(extras.indexOf(">Shock<"));
    expect(extras).toContain(">Shock<");
    expect(extras).toMatch(/\{\{else\}\}|>\s*-\s*</);
    expect(none).not.toContain("ep-weapon-extras");
  });

  test("an armour row looks like the others: its icons in the grid, energy and kinetic as titles over values when opened", async () => {
    const actor = makeActor({ type: "character" });
    const vest = makeItem({ name: "Vest", type: "armor", system: { energy: 6, kinetic: 12 } });

    const worn = await render("global-partials/armor-row-list.hbs", { item: [vest], actor });
    const stashed = await render("global-partials/armor-stash-row-list.hbs", { item: [vest], actor });
    const stats = worn.match(/<div class="ep-weapon-stats ep-armor-stats">([\s\S]*?)<\/div>/)[1];

    expect(stats.match(/resource-label/g)).toHaveLength(2);
    expect(stats.indexOf("armorEnergy")).toBeLessThan(stats.indexOf("armorKinetic"));
    expect([stats.includes(">6<"), stats.includes(">12<")]).toEqual([true, true]);
    for (const html of [worn, stashed]) {
      const icons = html.match(/<div class="ep-row-icons">([\s\S]*?)<div class="item showMore/)[1];
      expect(["item-delete", "item-edit", "slideShow"].every(control => icons.includes(control))).toBe(true);
    }
    expect([worn.includes("item-stash "), worn.includes("item-rebind"), stashed.includes("item-equip"), stashed.includes("item-rebind")]).toEqual([true, true, true, false]);
  });

  test("an item name's tooltip shows only where the name is cut off", () => {
    const dom = new JSDOM(`<span class="ep-name-tip"><label class="truncate">Tactical Multipurpose Grenade</label><span class="tooltipText"></span></span><span class="ep-name-tip"><label class="truncate">Klar</label></span>`);
    const keep = global.document;
    global.document = dom.window.document;
    try {
      jest.isolateModules(() => require("../../module/common/general-sheet-functions.js").listenForNameTips());
      const [long, short] = dom.window.document.querySelectorAll(".ep-name-tip");
      const [longName, shortName] = dom.window.document.querySelectorAll(".truncate");
      Object.defineProperties(longName, { scrollWidth: { value: 240 }, clientWidth: { value: 180 } });
      Object.defineProperties(shortName, { scrollWidth: { value: 40 }, clientWidth: { value: 180 } });

      for (const name of [longName, shortName]) name.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true }));

      expect([long.classList.contains("ep-name-fits"), short.classList.contains("ep-name-fits")]).toEqual([false, true]);
    } finally {
      global.document = keep;
    }
  });

  test("a section opened on a page stays open there, and a fresh page starts with all closed", () => {
    const actor = makeActor({ type: "character" });
    setSectionOpen(actor, "morph1", "peripherals", true);

    expect(isSectionOpen(actor, "morph1", "peripherals")).toBe(true);
    expect(isSectionOpen(actor, "morph1", "internals")).toBe(false);
    let fresh;
    jest.isolateModules(() => { fresh = require("../../module/actor/EPactorSheet.js"); });
    expect(fresh.isSectionOpen(actor, "morph1", "peripherals")).toBe(false);
  });
});
