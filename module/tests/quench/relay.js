import { RollCheck } from "../../rolls/dice.js";
import { grenadePreparation } from "../../common/weapon-functions.js";
import { applyTargetedAttack } from "../../rolls/attacks.js";
import { usePoolFromChat } from "../../rolls/pools.js";
import { activeDoseFor, takeDose, requestUseCheck } from "../../common/doses.js";
import { waitUntil, seedDice, restoreDice, uniformForFace, suppressDice3d, restoreDice3d } from "./helpers.js";

// What a player's client leaves to the active GM, checked with two logins: a GM runs the setup batch,
// then a player runs the relay batch on their own client while the GM stays connected, and the GM
// runs the clean-up batch at the end. The relay batch fails on any error toast the player gets.
// None of the three is selected by default, so a run of everything leaves them out.

const PREFIX = "Quench Relay";
const NAMES = { scene: `${PREFIX} Scene`, agent: `${PREFIX} Agent`, async: `${PREFIX} Async`, npc: `${PREFIX} Npc` };
// 30 x 30 squares of 100 pixels, a metre each; every token can be seen by everyone.
const SCENE = { name: NAMES.scene, width: 3000, height: 3000, padding: 0, tokenVision: false, grid: { size: 100, distance: 1, units: "m" } };
const OWNER = 3;
const OBSERVER = 2;
const PUBLIC = { rollMode: "public", usePool: "", globalMod: 0 };
const GAS_GRENADE = ["eclipsephase.grenades", "tpxWJJNwXCBRgZ45"];
const AGGRO = "Compendium.eclipsephase.drugs-and-toxins.Item.jo3GAYGK409hcV16";
const SHORT_CIRCUIT = ["eclipsephase.psi-sleights", "aH5xFkIr9iCM6SkR"];
const CHECK_DRUG = { name: `${PREFIX} Caustic`, type: "drug", system: { active: true, drugType: "biochem", category: "drug", injection: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 1, units: "hours" }, useCheck: { aptitude: "som", modifier: 0, failure: "damage", duration: { value: null, units: "" }, stress: { d10: 1, d6: 0, bonus: 2 }, successPsiPenalty: 0 } } };

/**
 * A test fixture of this batch, found by its name.
 * @param {String} key - agent, async or npc
 * @returns {Actor|undefined} The actor
 */
function fixture(key) {
  return game.actors.find(actor => actor.name === NAMES[key]);
}

/**
 * The newest roll card of the dose check the GM rolled for the agent.
 * @param {Actor} agent - The agent
 * @returns {ChatMessage|undefined} The card
 */
function checkRollCard(agent) {
  return game.messages.contents.filter(message => message.getFlag("eclipsephase", "roll")?.doseCheck?.actorUuid === agent.uuid && message.getFlag("eclipsephase", "taskCard")).at(-1);
}

/**
 * Removes whatever an earlier run left: the scene, the actors and the cards about them.
 * @returns {Promise<void>} Resolves once gone
 */
async function removeFixtures() {
  const actors = game.actors.filter(actor => actor.name.startsWith(PREFIX));
  const uuids = new Set(actors.map(actor => actor.uuid));
  const ids = new Set(actors.map(actor => actor.id));
  const cards = game.messages.contents.filter(message => ids.has(message.speaker?.actor) || uuids.has(message.getFlag("eclipsephase", "roll")?.doseCheck?.actorUuid)).map(message => message.id);
  if (cards.length) await ChatMessage.deleteDocuments(cards);
  for (const scene of game.scenes.filter(entry => entry.name === NAMES.scene)) await scene.delete();
  if (actors.length) await Actor.deleteDocuments(actors.map(actor => actor.id));
}

/**
 * Registers the relay batches: setup and clean-up for the GM, the relay checks for a player.
 * @param {Object} quench - Quench's registry
 * @returns {void}
 */
export function registerRelayBatches(quench) {
  quench.registerBatch("eclipsephase.relaySetup", context => {
    const { describe, it, assert } = context;

    describe("the fixtures a player's relay run needs (run as GM)", function () {
      it("lays out a scene with the player's agent and async, an NPC they may only observe, and a failed dose check the GM rolled", async function () {
        if (!game.user.isGM) this.skip();
        this.timeout(60000);
        await removeFixtures();

        const grenade = (await game.packs.get(GAS_GRENADE[0]).getDocument(GAS_GRENADE[1])).toObject();
        grenade.system = { ...grenade.system, active: true, quantity: 3, payload: { ...grenade.system.payload, enabled: true, loaded: [{ uuid: AGGRO, name: "Aggro" }] } };
        const circuit = (await game.packs.get(SHORT_CIRCUIT[0]).getDocument(SHORT_CIRCUIT[1])).toObject();
        const agent = await Actor.create({ name: NAMES.agent, type: "character", ownership: { default: OWNER }, system: { aptitudes: { som: { value: 15 } }, pools: { vigor: { value: 2 } } }, items: [grenade, CHECK_DRUG] });
        const caster = await Actor.create({ name: NAMES.async, type: "goon", ownership: { default: OWNER }, system: { aptitudes: { wil: { value: 20 } } }, items: [circuit] });
        const npc = await Actor.create({ name: NAMES.npc, type: "npc", ownership: { default: OBSERVER }, system: { aptitudes: { wil: { value: 15 } } } });
        await waitUntil(() => [agent, caster, npc].every(actor => actor.getFlag("eclipsephase", "defaultMorphAdded")), 10000);

        const scene = await Scene.create(SCENE);
        await scene.createEmbeddedDocuments("Token", [
          { actorId: agent.id, actorLink: true, name: agent.name, x: 1400, y: 1400 },
          { actorId: caster.id, actorLink: true, name: caster.name, x: 400, y: 400 },
          { actorId: npc.id, actorLink: true, name: npc.name, x: 1600, y: 1400 }
        ]);
        await scene.activate();

        suppressDice3d();
        try {
          await takeDose(agent, agent.items.find(item => item.name === CHECK_DRUG.name));
          const check = game.messages.contents.filter(message => message.getFlag("eclipsephase", "doseCheck")).at(-1);
          seedDice([uniformForFace(91, 100)]);
          await requestUseCheck(check.id, { skipDialog: true, presetOptions: PUBLIC });
          await waitUntil(() => checkRollCard(agent), 10000);
        } finally {
          restoreDice();
          restoreDice3d();
        }
        assert.isFalse(!!checkRollCard(agent).getFlag("eclipsephase", "doseHarm")?.rolled, "the harm waits for a pool point");
      });
    });
  }, { displayName: "Eclipse Phase: Relay setup (GM)", preSelected: false });

  quench.registerBatch("eclipsephase.relay", context => {
    const { describe, it, before, after, assert } = context;
    const errors = [];
    let realError;

    before(async function () {
      this.timeout(20000);
      if (game.user.isGM || !game.users.activeGM || !fixture("agent")) return;
      realError = ui.notifications.error;
      ui.notifications.error = (message, ...rest) => {
        errors.push(String(message));
        return realError.call(ui.notifications, message, ...rest);
      };
      await waitUntil(() => canvas.ready && canvas.scene?.name === NAMES.scene, 15000);
    });

    after(function () {
      if (realError) ui.notifications.error = realError;
    });

    /**
     * Skips a check unless a player runs it with a GM online and the fixtures laid out.
     * @param {Object} test - The Mocha test context
     * @returns {void}
     */
    function needsPlayerAndGM(test) {
      if (game.user.isGM || !game.users.activeGM || !fixture("agent")) test.skip();
      errors.length = 0;
    }

    describe("a player's gas cloud (run as player, with the GM connected)", function () {
      it("doses the NPC through the GM and the player's own agent directly, without an error", async function () {
        needsPlayerAndGM(this);
        this.timeout(30000);
        const agent = fixture("agent");
        const npc = fixture("npc");
        const weapon = grenadePreparation(agent, agent.items.find(item => item.type === "grenade").id);
        suppressDice3d();
        try {
          seedDice([uniformForFace(30, 100)]);
          await RollCheck({ type: "skill", key: "athletics", name: "Athletics", rollvalue: 60, pooltype: "Vigor" }, agent.system, agent, { skipDialog: true, presetOptions: { ...PUBLIC, trigger: "impact", placedArea: JSON.stringify({ kind: "circle", origin: { x: 1550, y: 1450 }, radius: 0 }) } }, weapon, "grenade");
          await waitUntil(() => activeDoseFor(npc, "Aggro") && activeDoseFor(agent, "Aggro"), 20000);
        } finally {
          restoreDice();
          restoreDice3d();
        }
        assert.ok(activeDoseFor(npc, "Aggro"), "the NPC");
        assert.ok(activeDoseFor(agent, "Aggro"), "the agent");
        assert.deepEqual(errors, []);
      });
    });

    describe("a willing target of a player's sleight (run as player, with the GM connected)", function () {
      it("Short Circuit leaves the NPC prone, incapacitated and stunned through the GM, without an error", async function () {
        needsPlayerAndGM(this);
        this.timeout(30000);
        const caster = fixture("async");
        const npc = fixture("npc");
        const statuses = () => npc.effects.contents.flatMap(effect => Array.from(effect.statuses ?? [])).sort();
        suppressDice3d();
        try {
          seedDice([uniformForFace(50, 100)]);
          await RollCheck({ name: "Psi", key: "psi", type: "psi", rollvalue: 70, itemid: caster.items.find(item => item.type === "aspect").id, pooltype: "Moxie" }, caster.system, caster, { skipDialog: true, presetOptions: { ...PUBLIC, willing: true } }, null, "psiSleight");
          const card = game.messages.contents.filter(message => message.getFlag("eclipsephase", "roll")?.targetedAttack && message.speaker?.actor === caster.id).at(-1);
          assert.ok(card, "the psi test posted an attack card");
          const attack = card.getFlag("eclipsephase", "roll").targetedAttack;
          assert.isTrue(attack.willing === true, "the attack is for a willing target");
          assert.strictEqual(card.getFlag("eclipsephase", "taskCard")?.data?.resultClass, "success", "the psi test succeeded");
          const targets = await applyTargetedAttack(card, { pick: async () => [{ actor: npc }], confirm: async () => true });
          assert.lengthOf(targets ?? [], 1, "the attack reached the NPC");
          assert.isTrue(game.messages.get(card.id).getFlag("eclipsephase", "roll").targetedAttack.delivered === true, "the attack card shows it delivered");
          await waitUntil(() => statuses().length >= 3, 20000).catch(() => {});
          assert.includeMembers(statuses(), ["incapacitated", "prone", "stunned"], "the GM put the conditions on");
        } finally {
          restoreDice();
          restoreDice3d();
        }
        assert.includeMembers(statuses(), ["incapacitated", "prone", "stunned"]);
        assert.deepEqual(errors, []);
      });
    });

    describe("a pool point on a check the GM rolled (run as player, with the GM connected)", function () {
      it("turns the agent's failed dose check into a pass and leaves closing its card to the GM, without an error", async function () {
        needsPlayerAndGM(this);
        this.timeout(30000);
        const agent = fixture("agent");
        const card = checkRollCard(agent);
        assert.ok(card, "the setup batch rolled the check");
        assert.notStrictEqual(card.author?.id, game.user.id, "rolled by the GM");
        const row = document.createElement("li");
        row.dataset.messageId = card.id;
        const button = document.createElement("button");
        button.dataset.usepool = "pool";
        row.append(button);

        await usePoolFromChat({ currentTarget: button });
        await waitUntil(() => game.messages.get(card.id)?.getFlag("eclipsephase", "doseHarm")?.rolled, 20000);

        assert.strictEqual(agent.system.health.physical.value ?? 0, 0, "no harm");
        assert.deepEqual(errors, []);
      });
    });
  }, { displayName: "Eclipse Phase: Relay (player, GM connected)", preSelected: false });

  quench.registerBatch("eclipsephase.relayCleanup", context => {
    const { describe, it, assert } = context;

    describe("after a relay run (run as GM)", function () {
      it("removes the scene, the actors and their cards", async function () {
        if (!game.user.isGM) this.skip();
        this.timeout(30000);
        await removeFixtures();
        assert.isUndefined(fixture("agent"));
        assert.isUndefined(game.scenes.find(scene => scene.name === NAMES.scene));
      });
    });
  }, { displayName: "Eclipse Phase: Relay cleanup (GM)", preSelected: false });
}
