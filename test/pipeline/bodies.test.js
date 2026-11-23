import EPactorSheet from "../../module/actor/EPactorSheet.js";
import {
  resleeveMorph, deleteBody, getBodyBindingInfo, resolveBodyForItem, rebindArmor,
  stashArmor, equipArmorFromStash, resolveArmorOnBodyDelete, tacnetChannel, seesThroughTacnet, sharedSightMode,
  registerBodyTokens
} from "../../module/common/morp-functions.js";
import { calcEffects, sleevingTest } from "../../module/rolls/resleeving.js";
import { readDialogValues } from "../../module/rolls/dice.js";
import { makeActor, resetWorld, seedDialogs, seedRolls } from "../setup/factories.js";
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

  test("jamming a body leaves the token as it is", async () => {
    const actor = sleeved();
    activeScene([]);

    await actor.update({ "system.activeJam": "fury" });
    await settle();

    expect(actor.prototypeToken.texture.src).toBe("tokens/me.webp");
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
