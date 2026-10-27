import { areaPolygon, tokensInArea, scatterPoint, wallBetween, createAreaRegion, createShadowedArea, clearAreas, AREA_FLAG } from "../../common/targeting.js";
import { waitUntil, withTempActor, seedDice, restoreDice, uniformForFace, suppressDice3d, restoreDice3d } from "./helpers.js";
import { RollCheck } from "../../rolls/dice.js";
import { weaponPreparation, grenadePreparation } from "../../common/weapon-functions.js";
import { SUPPRESSIVE_BEHAVIOR, strikeUnderSuppression, scatterBlast, trapOwnership, rollDefence } from "../../rolls/attacks.js";
import { rollAttackDamage } from "../../rolls/damage.js";
import { activeDoseFor } from "../../common/doses.js";
import { TARGET_COLOR } from "../../common/targeting.js";

// Areas on a real canvas: walls of a scratch scene cut a blast and a cone off and stop what flies at
// them, and an area left as a Region can be cleared again. The scene is viewed while the batch runs
// and removed afterwards; the scene viewed before comes back.

// The scratch scene: 30 x 30 squares of 100 pixels, a metre each, no padding, so canvas coordinates
// are scene coordinates. One wall runs from top to bottom at x = 1500.
const SCENE = { name: "Quench Areas", width: 3000, height: 3000, padding: 0, grid: { size: 100, distance: 1, units: "m" } };
const WALL_X = 1500;

// A successful dodge, rolled without its dialog.
const DODGE = { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, rangedFray: true, behindCover: false } };

/**
 * Throws a grenade at a point of the scratch scene with two NPCs in its 6 metre blast - one a metre
 * from the centre, one 4 metres out, 2 metres short of the edge - and lets both dodge successfully.
 * Their tokens are linked, so each stands for its own actor, and are removed whatever happens.
 * @param {Object} scene - The scratch scene
 * @param {Object} grenade - The grenade's data
 * @param {Function} check - check({ inner, edge, outcomes, posted }) once both have defended
 * @returns {Promise<void>} Resolves once checked and cleaned up
 */
async function dodgeInBlast(scene, grenade, check) {
  const posted = new Set(game.messages.contents.map(message => message.id));
  const defences = () => game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "attackDefence"));
  const dodger = name => ({ type: "npc", name, system: { aptitudes: { ref: { value: 20 } }, skillsVig: { fray: { value: 80 } } } });
  let tokens = [];
  suppressDice3d();
  try {
    await withTempActor({ type: "character", name: "Quench Thrower", items: [grenade] }, thrower => withTempActor(dodger("Quench Inner"), inner => withTempActor(dodger("Quench Edge"), async edge => {
      await waitUntil(() => thrower.getFlag("eclipsephase", "defaultMorphAdded"), 5000);
      tokens = await scene.createEmbeddedDocuments("Token", [
        { actorId: inner.id, actorLink: true, name: inner.name, x: 800, y: 1400 },
        { actorId: edge.id, actorLink: true, name: edge.name, x: 1100, y: 1400 }
      ]);
      const ids = tokens.map(token => token.id);
      await waitUntil(() => canvas.tokens.placeables.filter(placeable => ids.includes(placeable.document.id)).length === 2, 5000);
      const weapon = grenadePreparation(thrower, thrower.items.find(item => item.name === grenade.name).id);
      seedDice([uniformForFace(30, 100)]);
      await RollCheck({ type: "skill", key: "athletics", name: "Athletics", rollvalue: 60, pooltype: "Vigor" }, thrower.system, thrower, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, trigger: "impact", placedArea: JSON.stringify({ kind: "circle", origin: { x: 750, y: 1450 }, radius: 0 }) } }, weapon, "grenade");
      await waitUntil(() => defences().length === 1, 10000);
      seedDice([uniformForFace(2, 100)]);
      await rollDefence(defences()[0], inner.uuid, "dodge", DODGE);
      await rollDefence(defences()[0], edge.uuid, "dodge", DODGE);
      restoreDice();
      const entries = () => game.messages.get(defences()[0].id).getFlag("eclipsephase", "attackDefence").entries;
      await waitUntil(() => entries().every(entry => entry.outcome), 10000);
      const outcomes = Object.fromEntries(entries().map(entry => [entry.uuid === inner.uuid ? "inner" : entry.uuid === edge.uuid ? "edge" : entry.uuid, { outcome: entry.outcome, nearEdge: entry.nearEdge }]));
      await check({ inner, edge, outcomes, posted });
    })));
  } finally {
    restoreDice3d();
    restoreDice();
    await clearAreas(flag => flag.blast === true, scene);
    const left = tokens.map(token => token.id).filter(id => scene.tokens.has(id));
    if (left.length) await scene.deleteEmbeddedDocuments("Token", left);
    const mine = game.messages.contents.filter(message => !posted.has(message.id)).map(message => message.id);
    if (mine.length) await ChatMessage.deleteDocuments(mine);
  }
}

/**
 * A token stand-in covering a square whose top left corner is at a point.
 * @param {Number} x - Its left edge
 * @param {Number} y - Its top edge
 * @returns {Object} The token
 */
function square(x, y) {
  return { bounds: { x, y, width: 100, height: 100 } };
}

/**
 * Registers the areas batch.
 * @param {Object} quench - Quench's registry
 * @returns {void}
 */
export function registerAreasBatch(quench) {
  quench.registerBatch("eclipsephase.areas", context => {
    const { describe, it, before, after, assert } = context;
    let scene;
    let previous;

    before(async function () {
      this.timeout(30000);
      previous = canvas.scene;
      scene = await Scene.create(SCENE);
      await scene.createEmbeddedDocuments("Wall", [{ c: [WALL_X, 0, WALL_X, 3000] }]);
      await scene.view();
      await waitUntil(() => canvas.ready && canvas.scene?.id === scene.id && canvas.walls.placeables.length === 1, 15000);
    });

    after(async function () {
      this.timeout(30000);
      if (previous) await previous.view();
      if (scene) await scene.delete();
    });

    describe("walls cut an area off", function () {
      it("a blast reaches what lies open around it, but not what is behind the wall", function () {
        const polygon = areaPolygon({ x: 1000, y: 1500 }, { radius: 10 });

        assert.isTrue(polygon.contains(1200, 1500), "in front of the wall");
        assert.isTrue(polygon.contains(1000, 2300), "open to the side");
        assert.isFalse(polygon.contains(1800, 1500), "behind the wall");
        assert.isFalse(polygon.contains(1000, 2700), "beyond the radius");
      });

      it("the tokens in a blast are those in front of the wall", function () {
        const polygon = areaPolygon({ x: 1000, y: 1500 }, { radius: 10 });
        const near = square(1100, 1450);
        const behind = square(1600, 1450);

        assert.deepEqual(tokensInArea(polygon, [near, behind]), [near]);
      });

      it("a cone covers the side it faces and not the other", function () {
        const polygon = areaPolygon({ x: 1000, y: 1500 }, { radius: 5, angle: 45, rotation: 180 });

        assert.isTrue(polygon.contains(700, 1500), "in the cone");
        assert.isFalse(polygon.contains(1300, 1500), "behind its tip");
        assert.isFalse(polygon.contains(700, 1200), "beside the cone");
      });
    });

    describe("what flies stops at the first wall", function () {
      it("something thrown at the wall comes down just short of it, thrown away from it the full distance", function () {
        const towards = scatterPoint({ x: 1000, y: 1500 }, 0, 1000, wallBetween, 5);
        const away = scatterPoint({ x: 1000, y: 1500 }, Math.PI, 500, wallBetween, 5);

        assert.isTrue(towards.blocked);
        assert.approximately(towards.point.x, WALL_X - 5, 2);
        assert.isFalse(away.blocked);
        assert.approximately(away.point.x, 500, 1);
      });
    });

    describe("an area left in the scene", function () {
      it("is a Region in the wall-cut shape, and clearing it removes it", async function () {
        this.timeout(15000);
        const origin = { x: 1000, y: 1500 };
        const region = await createAreaRegion({ kind: "circle", origin, radius: 10, polygon: areaPolygon(origin, { radius: 10 }) }, { name: "Quench Blast", flags: { attackId: "quench" } });

        assert.strictEqual(region.shapes[0].type, "polygon");
        assert.strictEqual(region.getFlag("eclipsephase", AREA_FLAG).attackId, "quench");
        assert.isTrue(region.testPoint({ x: 1200, y: 1500, elevation: 0 }), "in front of the wall");
        assert.isFalse(region.testPoint({ x: 1800, y: 1500, elevation: 0 }), "behind the wall");

        assert.strictEqual(await clearAreas(flag => flag.attackId === "quench", scene), 1);
        assert.isUndefined(scene.regions.get(region.id));
      });
    });

    describe("suppressive fire's cone", function () {
      it("makes a token that moves into it defend against the roll, once", async function () {
        this.timeout(40000);
        const rifle = { name: "Quench Rifle", type: "rangedWeapon", system: { active: true, ammoType: "kinetic", ammoMin: 60, ammoMax: 60, mode1: { d10: 2, d6: 0, bonus: 2, range: 150, firingMode: "saBFfa", armorused: "kinetic" } } };
        const posted = new Set(game.messages.contents.map(message => message.id));
        suppressDice3d();
        try {
          await withTempActor({ type: "character", name: "Quench Gunner", system: { skillsVig: { guns: { value: 60 } } }, items: [rifle] }, shooter => withTempActor({ type: "npc", name: "Quench Runner" }, async runner => {
            await waitUntil(() => shooter.getFlag("eclipsephase", "defaultMorphAdded"), 5000);
            const weapon = await weaponPreparation(shooter, "guns", "rangedWeapon", shooter.items.find(item => item.name === "Quench Rifle").id);
            seedDice([uniformForFace(30, 100)]);
            await RollCheck({ type: "skill", key: "guns", name: "Guns", rollvalue: 60, pooltype: "Vigor" }, shooter.system, shooter, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, attackMode: "suppressive" } }, weapon, "rangedWeapon");
            restoreDice();
            const card = game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "taskCard")).at(-1);
            assert.isTrue(card.getFlag("eclipsephase", "roll").targetedAttack.suppressive);

            const origin = { x: 1000, y: 1500 };
            const region = await createAreaRegion({ kind: "circle", origin, radius: 5, polygon: areaPolygon(origin, { radius: 5 }) }, {
              name: "Quench Suppression",
              flags: { attackId: "quench", suppressive: true, actorUuid: shooter.uuid },
              behaviors: [{ type: SUPPRESSIVE_BEHAVIOR, name: "Quench Suppression", system: { messageId: card.id } }]
            });
            const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: runner.id, name: "Quench Runner", x: 200, y: 200 }]);
            const defences = () => game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "attackDefence"));

            await token.update({ x: 900, y: 1400 });
            await waitUntil(() => defences().length === 1, 10000);
            await token.update({ x: 1000, y: 1400 });
            await new Promise(resolve => setTimeout(resolve, 1000));

            assert.strictEqual(defences().length, 1, "once per burst");
            assert.deepEqual(game.messages.get(card.id).getFlag("eclipsephase", "taskCard").targets.map(target => target.name), ["Quench Runner"]);
            await clearAreas(flag => flag.attackId === "quench", scene);
            assert.isUndefined(scene.regions.get(region.id));
            await token.delete();
          }));
        } finally {
          restoreDice3d();
          restoreDice();
          const mine = game.messages.contents.filter(message => !posted.has(message.id)).map(message => message.id);
          if (mine.length) await ChatMessage.deleteDocuments(mine);
        }
      });

      it("a token stepping from a yellow square behind a ledge onto the red one beside it gets the open card in place of the yellow one", async function () {
        this.timeout(40000);
        const rifle = { name: "Quench Rifle", type: "rangedWeapon", system: { active: true, ammoType: "kinetic", ammoMin: 60, ammoMax: 60, mode1: { d10: 2, d6: 0, bonus: 2, range: 150, firingMode: "saBFfa", armorused: "kinetic" } } };
        const posted = new Set(game.messages.contents.map(message => message.id));
        suppressDice3d();
        try {
          await withTempActor({ type: "character", name: "Quench Gunner", system: { skillsVig: { guns: { value: 60 } } }, items: [rifle] }, shooter => withTempActor({ type: "npc", name: "Quench Runner" }, async runner => {
            await waitUntil(() => shooter.getFlag("eclipsephase", "defaultMorphAdded"), 5000);
            const weapon = await weaponPreparation(shooter, "guns", "rangedWeapon", shooter.items.find(item => item.name === "Quench Rifle").id);
            seedDice([uniformForFace(30, 100)]);
            await RollCheck({ type: "skill", key: "guns", name: "Guns", rollvalue: 60, pooltype: "Vigor" }, shooter.system, shooter, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, attackMode: "suppressive" } }, weapon, "rangedWeapon");
            restoreDice();
            const card = game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "taskCard")).at(-1);

            const [ledge] = await scene.createEmbeddedDocuments("Wall", [{ c: [700, 1200, 900, 1200] }]);
            await waitUntil(() => canvas.walls.placeables.length === 2, 5000);
            const origin = { x: 550, y: 1050 };
            const regions = await createShadowedArea({ kind: "circle", origin, radius: 8, polygon: areaPolygon(origin, { radius: 8 }) }, {
              name: "Quench Suppression",
              flags: { attackId: "quench-strip", messageId: card.id, actorUuid: shooter.uuid, suppressive: true },
              behaviors: [{ type: SUPPRESSIVE_BEHAVIOR, name: "Quench Suppression", system: { messageId: card.id } }]
            });
            assert.deepEqual(regions.map(region => region.getFlag("eclipsephase", AREA_FLAG).part).sort(), ["open", "shadow"]);
            const open = regions.find(region => region.getFlag("eclipsephase", AREA_FLAG).part === "open");
            assert.isFalse(open.testPoint({ x: 950, y: 1250, elevation: 0 }), "the square below the ledge is behind it, yellow");
            assert.isTrue(open.testPoint({ x: 1050, y: 1250, elevation: 0 }), "the square beside it is red");

            const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: runner.id, name: "Quench Runner", x: 900, y: 1200 }]);
            const defences = () => game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "attackDefence"));
            await strikeUnderSuppression(card, token.actor, { hidden: true });
            const shadowCard = defences()[0];
            assert.include(shadowCard.content, "defenceCover", "behind the ledge: remain in cover");
            assert.isNotEmpty(shadowCard.whisper, "behind the ledge, an NPC's card is for the GM");

            await token.update({ x: 1000, y: 1200 });
            await waitUntil(() => !game.messages.get(shadowCard.id) && defences().length === 1, 10000);
            const openCard = defences()[0];
            assert.notInclude(openCard.content, "defenceCover", "stepped into the open: dodge only");
            assert.isEmpty(openCard.whisper ?? [], "in the open the card is public");

            await ledge.delete();
            await clearAreas(flag => flag.attackId === "quench-strip", scene);
            await token.delete();
          }));
        } finally {
          restoreDice3d();
          restoreDice();
          const mine = game.messages.contents.filter(message => !posted.has(message.id)).map(message => message.id);
          if (mine.length) await ChatMessage.deleteDocuments(mine);
        }
      });
    });

    describe("a thrown grenade", function () {
      it("goes off where it was placed, red in front of the wall and yellow behind it, and an NPC behind the wall defends from a card only the GM sees", async function () {
        this.timeout(40000);
        const frag = { name: "Quench Frag", type: "grenade", system: { active: true, quantity: 2, dv: { d10: 3, d6: null, bonus: 6 }, area: { kind: "centered", radius: null, reduction: 2 }, armorused: "kinetic", trigger: "impact" } };
        const posted = new Set(game.messages.contents.map(message => message.id));
        const defences = () => game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "attackDefence"));
        suppressDice3d();
        try {
          await withTempActor({ type: "character", name: "Quench Thrower", items: [frag] }, thrower => withTempActor({ type: "npc", name: "Quench Bystander" }, async bystander => {
            await waitUntil(() => thrower.getFlag("eclipsephase", "defaultMorphAdded"), 5000);
            const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: bystander.id, name: "Quench Bystander", x: 1600, y: 1400 }]);
            await waitUntil(() => canvas.tokens.placeables.some(placeable => placeable.document.id === token.id), 5000);
            const weapon = grenadePreparation(thrower, thrower.items.find(item => item.name === "Quench Frag").id);
            seedDice([uniformForFace(30, 100)]);
            await RollCheck({ type: "skill", key: "athletics", name: "Athletics", rollvalue: 60, pooltype: "Vigor" }, thrower.system, thrower, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, trigger: "impact", placedArea: JSON.stringify({ kind: "circle", origin: { x: 1250, y: 1450 }, radius: 0 }) } }, weapon, "grenade");
            restoreDice();
            await waitUntil(() => defences().length === 1, 10000);

            const parts = scene.regions.filter(region => region.getFlag("eclipsephase", AREA_FLAG)?.blast).map(region => region.getFlag("eclipsephase", AREA_FLAG).part).sort();
            assert.deepEqual(parts, ["open", "shadow"]);
            const entry = defences()[0].getFlag("eclipsephase", "attackDefence").entries[0];
            assert.strictEqual(entry.uuid, token.actor.uuid, "the token's own actor, an NPC token being unlinked");
            assert.isTrue(entry.shadow, "behind the wall from the centre");
            assert.strictEqual(Math.floor(entry.distance), 4);
            assert.isNotEmpty(defences()[0].whisper, "an NPC behind the wall is the GM's to see");
            assert.strictEqual(thrower.items.find(item => item.name === "Quench Frag").system.quantity, 1);

            await clearAreas(flag => flag.blast === true, scene);
            await token.delete();
          }));
        } finally {
          restoreDice3d();
          restoreDice();
          const mine = game.messages.contents.filter(message => !posted.has(message.id)).map(message => message.id);
          if (mine.length) await ChatMessage.deleteDocuments(mine);
        }
      });

      it("that misses scatters straight on towards the wall and comes down short of it, the area it was aimed at left in grey", async function () {
        this.timeout(40000);
        const stun = { name: "Quench Stun", type: "grenade", system: { active: true, quantity: 2, dv: { d10: null, d6: 1, bonus: 2 }, area: { kind: "uniform", radius: 3, reduction: null }, armorused: "kinetic", trigger: "impact" } };
        const posted = new Set(game.messages.contents.map(message => message.id));
        suppressDice3d();
        try {
          await withTempActor({ type: "character", name: "Quench Thrower", items: [stun] }, async thrower => {
            await waitUntil(() => thrower.getFlag("eclipsephase", "defaultMorphAdded"), 5000);
            const weapon = grenadePreparation(thrower, thrower.items.find(item => item.name === "Quench Stun").id);
            seedDice([uniformForFace(95, 100)]);
            await RollCheck({ type: "skill", key: "athletics", name: "Athletics", rollvalue: 60, pooltype: "Vigor" }, thrower.system, thrower, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, trigger: "impact", placedArea: JSON.stringify({ kind: "circle", origin: { x: 1250, y: 1450 }, radius: 0, from: { x: 250, y: 1450 } }) } }, weapon, "grenade");
            restoreDice();
            const card = game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "taskCard")).at(-1);
            assert.include(card.content, "blastScatter");

            await scatterBlast(card, { rollDice: async () => ({ direction: 100, metres: 10 }) });
            const flags = () => scene.regions.map(region => region.getFlag("eclipsephase", AREA_FLAG)).filter(flag => flag?.blast);
            await waitUntil(() => flags().some(flag => flag.part === "spent"), 10000);

            const landed = flags().find(flag => flag.part !== "spent").origin;
            assert.isBelow(landed.x, WALL_X, "short of the wall");
            assert.isAbove(landed.x, WALL_X - 20, "right at it");
            assert.isTrue(game.messages.get(card.id).getFlag("eclipsephase", "taskCard").scatter.blocked, "the card notes the wall");
            await clearAreas(flag => flag.blast === true, scene);
          });
        } finally {
          restoreDice3d();
          restoreDice();
          const mine = game.messages.contents.filter(message => !posted.has(message.id)).map(message => message.id);
          if (mine.length) await ChatMessage.deleteDocuments(mine);
        }
      });

      it("scatters a d10 metres doubled per superior failure, turned clockwise by the d100 from the line of the throw: 00 on, 25 right, 50 back, 75 left", async function () {
        this.timeout(60000);
        const stun = { name: "Quench Scatter", type: "grenade", system: { active: true, quantity: 9, dv: { d10: null, d6: 1, bonus: 2 }, area: { kind: "uniform", radius: 1, reduction: null }, armorused: "kinetic", trigger: "impact" } };
        const origin = { x: 1250, y: 1450 };
        const cases = [
          { die: 95, direction: 100, metres: 2, at: { x: 1450, y: 1450 } },
          { die: 50, direction: 50, metres: 3, at: { x: 650, y: 1450 } },
          { die: 20, direction: 50, metres: 3, at: { x: 50, y: 1450 } },
          { die: 95, direction: 25, metres: 3, at: { x: 1250, y: 1750 } },
          { die: 95, direction: 75, metres: 3, at: { x: 1250, y: 1150 } }
        ];
        const posted = new Set(game.messages.contents.map(message => message.id));
        suppressDice3d();
        try {
          await withTempActor({ type: "character", name: "Quench Thrower", items: [stun] }, async thrower => {
            await waitUntil(() => thrower.getFlag("eclipsephase", "defaultMorphAdded"), 5000);
            for (const { die, direction, metres, at } of cases) {
              const weapon = grenadePreparation(thrower, thrower.items.find(item => item.name === "Quench Scatter").id);
              seedDice([uniformForFace(die, 100)]);
              await RollCheck({ type: "skill", key: "athletics", name: "Athletics", rollvalue: 10, pooltype: "Vigor" }, thrower.system, thrower, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, trigger: "impact", placedArea: JSON.stringify({ kind: "circle", origin, radius: 0, from: { x: 250, y: 1450 } }) } }, weapon, "grenade");
              restoreDice();
              const card = game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "taskCard")).at(-1);
              await scatterBlast(card, { rollDice: async () => ({ direction, metres }) });
              const landed = () => scene.regions.map(region => region.getFlag("eclipsephase", AREA_FLAG)).find(flag => flag?.blast && flag.part !== "spent" && flag.messageId === card.id);
              await waitUntil(() => landed(), 10000);
              assert.approximately(landed().origin.x, at.x, 1, `d100 ${direction}, die ${die}: x`);
              assert.approximately(landed().origin.y, at.y, 1, `d100 ${direction}, die ${die}: y`);
              await clearAreas(flag => flag.messageId === card.id, scene);
            }
          });
        } finally {
          restoreDice3d();
          restoreDice();
          const mine = game.messages.contents.filter(message => !posted.has(message.id)).map(message => message.id);
          if (mine.length) await ChatMessage.deleteDocuments(mine);
        }
      });

      it("dodged inside its blast still strikes for half the damage, dodged within 2 metres of the edge it misses", async function () {
        this.timeout(40000);
        const frag = { name: "Quench Uniform", type: "grenade", system: { active: true, quantity: 2, dv: { d10: 2, d6: null, bonus: 10 }, area: { kind: "uniform", radius: 6, reduction: null }, armorused: "kinetic", trigger: "impact" } };
        await dodgeInBlast(scene, frag, async ({ inner, edge, outcomes, posted }) => {
          assert.deepEqual(outcomes, { inner: { outcome: "half", nearEdge: false }, edge: { outcome: "none", nearEdge: true } });
          const damageCard = () => game.messages.contents.find(message => !posted.has(message.id) && message.getFlag("eclipsephase", "damageCard"));
          await waitUntil(() => damageCard(), 8000);
          await rollAttackDamage(damageCard());
          await waitUntil(() => game.messages.get(damageCard().id).getFlag("eclipsephase", "damageCard").lines.length, 8000);
          const total = game.messages.get(damageCard().id).getFlag("eclipsephase", "damageCard").data.total;
          assert.isAtMost(Math.abs(inner.system.health.physical.value - total / 2), 0.5, "half the damage");
          assert.strictEqual(edge.system.health.physical.value, 0, "none at the edge");
        });
      });

      it("a splash grenade dodged inside its blast still gives its whole dose, dodged within 2 metres of the edge none", async function () {
        this.timeout(40000);
        const source = (await game.packs.get("eclipsephase.grenades").getDocument("eXXBBl2NCEnduzOu")).toObject();
        const splash = { ...source, name: "Quench Splash", system: { ...source.system, active: true, quantity: 2, area: { ...source.system.area, radius: 6 }, trigger: "impact", payload: { ...source.system.payload, enabled: true, loaded: [{ uuid: "Compendium.eclipsephase.drugs-and-toxins.Item.jo3GAYGK409hcV16", name: "Aggro" }] } } };
        delete splash._id;
        await dodgeInBlast(scene, splash, async ({ inner, edge, outcomes }) => {
          assert.deepEqual(outcomes, { inner: { outcome: "half", nearEdge: false }, edge: { outcome: "none", nearEdge: true } });
          await waitUntil(() => activeDoseFor(inner, "Aggro"), 8000);
          assert.isNull(activeDoseFor(edge, "Aggro"));
        });
      });

      it("set to a proximity trigger lies armed, seen only by its owners and the GM, and goes off when a token moves within its live sensor", async function () {
        this.timeout(40000);
        const frag = { name: "Quench Mine", type: "grenade", system: { active: true, quantity: 2, dv: { d10: 3, d6: null, bonus: 6 }, area: { kind: "centered", radius: null, reduction: 2 }, armorused: "kinetic", trigger: "proximity" } };
        const posted = new Set(game.messages.contents.map(message => message.id));
        const defences = () => game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "attackDefence"));
        suppressDice3d();
        try {
          await withTempActor({ type: "character", name: "Quench Thrower", items: [frag] }, thrower => withTempActor({ type: "npc", name: "Quench Walker" }, async walker => {
            await waitUntil(() => thrower.getFlag("eclipsephase", "defaultMorphAdded"), 5000);
            const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: walker.id, name: "Quench Walker", x: 200, y: 1400 }]);
            const weapon = grenadePreparation(thrower, thrower.items.find(item => item.name === "Quench Mine").id);
            seedDice([uniformForFace(30, 100)]);
            await RollCheck({ type: "skill", key: "athletics", name: "Athletics", rollvalue: 60, pooltype: "Vigor" }, thrower.system, thrower, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, trigger: "proximity", proximityRadius: 2, placedArea: JSON.stringify({ kind: "circle", origin: { x: 950, y: 1450 }, radius: 0, from: { x: 250, y: 1450 } }) } }, weapon, "grenade");
            restoreDice();
            const card = game.messages.contents.filter(message => !posted.has(message.id) && message.getFlag("eclipsephase", "taskCard")).at(-1);
            await scatterBlast(card, { rollDice: async () => ({ direction: 100, metres: 0 }) });
            const armed = part => scene.regions.find(region => region.getFlag("eclipsephase", AREA_FLAG)?.messageId === card.id && region.getFlag("eclipsephase", AREA_FLAG).part === part);
            await waitUntil(() => armed("sensor"), 10000);

            assert.strictEqual(armed("marker").visibility, CONST.REGION_VISIBILITY.OBSERVER, "only observers see the mark");
            assert.strictEqual(armed("marker").ownership.default, trapOwnership(thrower).default, "others see it as Show Traps allows");
            await token.update({ x: 900, y: 1400 });
            await new Promise(resolve => setTimeout(resolve, 1000));
            assert.isOk(armed("marker"), "a sensor that is not live yet does not set it off");

            await token.update({ x: 200, y: 1400 });
            await armed("sensor").update({ color: TARGET_COLOR, [`flags.eclipsephase.${AREA_FLAG}.live`]: true });
            await token.update({ x: 1000, y: 1400 });
            await waitUntil(() => defences().length === 1, 10000);
            assert.isUndefined(armed("marker"), "the mark is gone once it went off");
            assert.strictEqual(defences()[0].getFlag("eclipsephase", "attackDefence").entries[0].uuid, token.actor.uuid);

            await clearAreas(flag => flag.messageId === card.id, scene);
            await token.delete();
          }));
        } finally {
          restoreDice3d();
          restoreDice();
          const mine = game.messages.contents.filter(message => !posted.has(message.id)).map(message => message.id);
          if (mine.length) await ChatMessage.deleteDocuments(mine);
        }
      });
    });
  }, { displayName: "Eclipse Phase: Areas" });
}
