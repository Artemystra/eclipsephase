import { RollCheck } from "../../rolls/dice.js";
import { usePoolFromChat } from "../../rolls/pools.js";
import { takeDose, offerDose, claimDose, requestUseCheck, rollWearOffStress, demandWillpower, requestAddictionCheck } from "../../common/doses.js";
import { postDefenceCards, rollRemainingDefences, applyTargetedAttack, rollDefence, yieldDefence } from "../../rolls/attacks.js";
import { rollAttackDamage } from "../../rolls/damage.js";
import { weaponPreparation } from "../../common/weapon-functions.js";
import { withTempActor, seedDice, restoreDice, uniformForFace, waitUntil, suppressDice3d, restoreDice3d } from "./helpers.js";

// Every chat card that changes after it is posted, driven once through its change in a live world:
// the change lands on the same card, and every card keeps the system's shape. The last state of
// each card stays in the chat as a gallery to compare by eye; the next run clears it.

const GALLERY_FLAG = "quenchGallery";

// The messages there were before the current test, so a card is only looked for among its own.
let existing = new Set();
const NO_CHECK = { aptitude: "", modifier: 0, failure: "", duration: { value: null, units: "" }, stress: { d10: 0, d6: 0, bonus: 0 }, successPsiPenalty: 0 };

/**
 * A drug a test character carries, at hand, one pack.
 * @param {String} name - Its name
 * @param {Object} [system] - Drug fields to override
 * @returns {Object} The item data
 */
function drug(name, system = {}) {
  return {
    name, type: "drug",
    system: { active: true, drugType: "", category: "drug", injection: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 1, units: "hours" }, useCheck: NO_CHECK, ...system }
  };
}

/**
 * The shape the system's cards share, read from a card's markup.
 * @param {ChatMessage} message - The card
 * @returns {Object} root (the outer block centres the card), icon, buttons, stray (buttons outside
 *   a controls block) and primaryLast (every stacked primary button comes last)
 */
function cardShape(message) {
  const body = new DOMParser().parseFromString(message.content, "text/html").body;
  const buttons = Array.from(body.querySelectorAll("button"));
  return {
    root: body.firstElementChild?.classList.contains("alignCenter") === true,
    icon: !!body.querySelector("i.fa-solid"),
    buttons: buttons.length,
    stray: buttons.filter(button => !button.closest(".chatControls")).length,
    primaryLast: Array.from(body.querySelectorAll(".ep-chat-stack")).every(stack => {
      const primary = stack.querySelector(".ep-chat-primary");
      return !primary || stack.lastElementChild === primary;
    })
  };
}

/**
 * Runs a test's work and tidies the chat afterwards: every message it posted goes, except the card
 * it names, which is kept and marked for the gallery.
 * @param {Function} fn - Called with nothing; returns the card to keep
 * @returns {Promise<void>} Resolves once the chat is tidied
 */
async function keepingOnly(fn) {
  const before = new Set(game.messages.contents.map(message => message.id));
  existing = before;
  let kept = null;
  suppressDice3d();
  try {
    kept = await fn();
  } finally {
    restoreDice3d();
    restoreDice();
    const posted = game.messages.contents.filter(message => !before.has(message.id) && message.id !== kept?.id).map(message => message.id);
    if (posted.length) await ChatMessage.deleteDocuments(posted);
    if (kept && game.messages.get(kept.id)) await kept.setFlag("eclipsephase", GALLERY_FLAG, true);
  }
}

/**
 * The newest message the current test posted that carries a flag.
 * @param {String} key - The flag under eclipsephase
 * @returns {ChatMessage|undefined} The message
 */
function newestWith(key) {
  return game.messages.contents.filter(message => !existing.has(message.id) && message.getFlag("eclipsephase", key) !== undefined).at(-1);
}

/**
 * Registers the chat card batch.
 * @param {Object} quench - Quench's registry
 * @returns {void}
 */
export function registerChatCardBatch(quench) {
  quench.registerBatch("eclipsephase.chatCards", context => {
    const { describe, it, before, assert } = context;

    before(async function () {
      const old = game.messages.contents.filter(message => message.getFlag("eclipsephase", GALLERY_FLAG)).map(message => message.id);
      if (old.length) await ChatMessage.deleteDocuments(old);
    });

    describe("cards that change after they are posted", function () {
      it("a roll card takes its pool spend itself: the note replaces the controls, the swapped die shows", async function () {
        this.timeout(20000);
        await keepingOnly(() => withTempActor({ type: "character", name: "Quench Roller", system: { skillsVig: { infiltrate: { value: 40 } }, pools: { vigor: { value: 2 } } } }, async actor => {
          await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"));
          seedDice([uniformForFace(91, 100)]);
          await RollCheck({ name: "Infiltrate", key: "infiltrate", type: "skill", rollvalue: 55, pooltype: "Vigor" }, actor.system, actor, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } }, null, "skill");
          const card = newestWith("taskCard");
          const row = document.createElement("li");
          row.dataset.messageId = card.id;
          const button = document.createElement("button");
          button.dataset.usepool = "pool";
          row.append(button);
          const posted = game.messages.size;

          await usePoolFromChat({ currentTarget: button });
          await waitUntil(() => game.messages.get(card.id).content.includes("ep-pool-spent"));

          const after = game.messages.get(card.id);
          assert.strictEqual(game.messages.size, posted, "no second card");
          assert.notInclude(after.content, "data-usepool");
          assert.strictEqual(after.getFlag("eclipsephase", "taskCard").data.total, 19);
          assert.isTrue(cardShape(after).root);
          return after;
        }));
      });

      it("a check card turns its button into a note once rolled", async function () {
        this.timeout(20000);
        await keepingOnly(() => withTempActor({ type: "character", name: "Quench Taker", items: [drug("Quench Twitch", { useCheck: { ...NO_CHECK, aptitude: "som", failure: "incapacitated", duration: { value: 10, units: "minutes" } } })] }, async actor => {
          await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"));
          await takeDose(actor, actor.items.find(item => item.name === "Quench Twitch"));
          const card = newestWith("doseCheck");
          const shape = cardShape(card);

          seedDice([uniformForFace(5, 100)]);
          await requestUseCheck(card.id, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } });
          await waitUntil(() => game.messages.get(card.id).getFlag("eclipsephase", "doseCheck").rolled);

          const after = game.messages.get(card.id);
          assert.deepInclude(shape, { root: true, icon: true, stray: 0, primaryLast: true });
          assert.isAbove(shape.buttons, 0);
          assert.deepInclude(cardShape(after), { root: true, icon: true, buttons: 0 });
          return after;
        }));
      });

      it("a dose offer names who took it and loses its buttons", async function () {
        this.timeout(20000);
        await keepingOnly(() => withTempActor({ type: "character", name: "Quench Giver", items: [drug("Quench Kick")] }, giver => withTempActor({ type: "character", name: "Quench Taker" }, async taker => {
          await waitUntil(() => giver.getFlag("eclipsephase", "defaultMorphAdded") && taker.getFlag("eclipsephase", "defaultMorphAdded"));
          const { message } = await offerDose(giver, giver.items.find(item => item.name === "Quench Kick"));
          const shape = cardShape(message);

          await claimDose(message, taker);

          const after = game.messages.get(message.id);
          assert.deepInclude(shape, { root: true, icon: true, stray: 0, primaryLast: true });
          assert.strictEqual(after.getFlag("eclipsephase", "doseOffer").usedBy, "Quench Taker");
          assert.strictEqual(cardShape(after).buttons, 0);
          return after;
        })));
      });

      it("a wear-off card loses its stress button once the stress is rolled", async function () {
        this.timeout(20000);
        await keepingOnly(() => withTempActor({ type: "character", name: "Quench Taker", items: [drug("Quench Psi-Kick", { wearOff: { d10: 1, d6: 0, bonus: 2 } })] }, async actor => {
          await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"));
          await takeDose(actor, actor.items.find(item => item.name === "Quench Psi-Kick"));
          const dose = actor.effects.find(effect => effect.getFlag("eclipsephase", "dose"));
          await actor.deleteEmbeddedDocuments("ActiveEffect", [dose.id]);
          await waitUntil(() => newestWith("wearOff"));
          const card = newestWith("wearOff");
          const shape = cardShape(card);

          await rollWearOffStress(card);

          const after = game.messages.get(card.id);
          assert.deepInclude(shape, { root: true, icon: true, stray: 0, primaryLast: true });
          assert.isTrue(after.getFlag("eclipsephase", "wearOff").rolled);
          assert.strictEqual(cardShape(after).buttons, 0);
          return after;
        }));
      });

      it("an addiction check card turns its button into a note once rolled", async function () {
        this.timeout(20000);
        await keepingOnly(() => withTempActor({ type: "character", name: "Quench Taker", items: [drug("Quench Juice", { addictionType: "mental", addictionMod: "-20" })] }, async actor => {
          await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"));
          const card = await demandWillpower(actor.uuid, "Quench Juice");
          const shape = cardShape(card);

          seedDice([uniformForFace(5, 100)]);
          await requestAddictionCheck(card.id, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } });
          await waitUntil(() => game.messages.get(card.id).getFlag("eclipsephase", "addictionCheck").rolled);

          const after = game.messages.get(card.id);
          assert.deepInclude(shape, { root: true, icon: true, stray: 0, primaryLast: true });
          assert.strictEqual(cardShape(after).buttons, 0);
          return after;
        }));
      });

      it("a defence card keeps every outcome when the rest are rolled at once", async function () {
        this.timeout(20000);
        await keepingOnly(() => withTempActor({ type: "character", name: "Quench Ana" }, ana => withTempActor({ type: "character", name: "Quench Bo" }, async bo => {
          await waitUntil(() => ana.getFlag("eclipsephase", "defaultMorphAdded") && bo.getFlag("eclipsephase", "defaultMorphAdded"));
          const attack = { id: "quench", effect: "quench-none", defence: "ranged", area: true, targets: 2, weaponName: "Quench Sprayer", effectLabel: "", payload: null };
          const [card] = await postDefenceCards(attack, [ana, bo]);
          const shape = cardShape(card);

          seedDice([uniformForFace(95, 100)]);
          await rollRemainingDefences(card);
          await waitUntil(() => game.messages.get(card.id).getFlag("eclipsephase", "attackDefence").entries.every(entry => entry.outcome), 8000);

          const after = game.messages.get(card.id);
          assert.deepInclude(shape, { root: true, icon: true, stray: 0, primaryLast: true });
          assert.deepEqual(after.getFlag("eclipsephase", "attackDefence").entries.map(entry => entry.outcome), ["hit", "hit"]);
          assert.strictEqual(cardShape(after).buttons, 0);
          return after;
        })));
      });

      it("a weapon attack's damage card follows the defence and turns into the roll, naming what the target took", async function () {
        this.timeout(30000);
        const pistol = { name: "Quench Pistol", type: "rangedWeapon", system: { active: true, ammoType: "kinetic", ammoMin: 10, ammoMax: 10, mode1: { d10: 2, d6: 0, bonus: 2, armorused: "kinetic" } } };
        const vest = { name: "Quench Vest", type: "armor", system: { energy: 2, kinetic: 3 } };
        await keepingOnly(() => withTempActor({ type: "character", name: "Quench Shooter", system: { skillsVig: { guns: { value: 60 } } }, items: [pistol] }, shooter => withTempActor({ type: "npc", name: "Quench Mark", items: [vest] }, async mark => {
          await waitUntil(() => shooter.getFlag("eclipsephase", "defaultMorphAdded"));
          const weapon = await weaponPreparation(shooter, "guns", "rangedWeapon", shooter.items.find(item => item.name === "Quench Pistol").id);
          seedDice([uniformForFace(30, 100)]);
          await RollCheck({ type: "skill", key: "guns", name: "Guns", rollvalue: 60, pooltype: "Vigor" }, shooter.system, shooter, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, attackMode: "single" } }, weapon, "rangedWeapon");
          const card = newestWith("taskCard");
          await applyTargetedAttack(card, { pick: async () => [{ actor: mark }], confirm: async () => true });
          const defence = newestWith("attackDefence");

          seedDice([uniformForFace(95, 100)]);
          await rollDefence(defence, mark.uuid, "dodge", { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0, rangedFray: true, behindCover: false } });
          await waitUntil(() => newestWith("damageCard"), 8000);
          const damage = newestWith("damageCard");
          const shape = cardShape(damage);
          restoreDice();
          await rollAttackDamage(damage);
          await waitUntil(() => game.messages.get(damage.id).getFlag("eclipsephase", "damageCard").lines.length, 8000);

          const after = game.messages.get(damage.id);
          const state = after.getFlag("eclipsephase", "damageCard");
          assert.deepInclude(shape, { root: true, icon: true, buttons: 1, stray: 0, primaryLast: true });
          assert.strictEqual(mark.system.health.physical.value, Math.max(0, state.data.total - 3));
          assert.include(after.content, "ep-damage-applied");
          assert.strictEqual(cardShape(after).buttons, 0);
          assert.isTrue(cardShape(after).root);
          return after;
        })));
      });

      it("a psi attack is resisted with WIL on its defence card, and a target who does not resist takes the damage card's stab", async function () {
        this.timeout(30000);
        const stab = { name: "Quench Stab", type: "aspect", system: { psiType: "gamma", strainFamily: "psi", infection: 0, damage: { target: "physical", d10: 2, d6: 0, bonus: 0 } } };
        await keepingOnly(() => withTempActor({ type: "goon", name: "Quench Async", items: [stab] }, async caster => withTempActor({ type: "character", name: "Quench Mind" }, async mind => {
          await waitUntil(() => mind.getFlag("eclipsephase", "defaultMorphAdded"));
          seedDice([uniformForFace(30, 100)]);
          await RollCheck({ name: "Psi", key: "psi", type: "psi", rollvalue: 70, itemid: caster.items.find(item => item.name === "Quench Stab").id, pooltype: "Moxie" }, caster.system, caster, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } }, null, "psiSleight");
          const card = newestWith("taskCard");
          await applyTargetedAttack(card, { pick: async () => [{ actor: mind }], confirm: async () => true });
          const defence = newestWith("attackDefence");
          const shape = cardShape(defence);
          assert.include(defence.content, "data-kind=\"will\"");
          assert.include(defence.content, "defenceYield");

          await yieldDefence(defence, mind.uuid);
          await waitUntil(() => newestWith("damageCard"), 8000);
          const damage = newestWith("damageCard");
          restoreDice();
          await rollAttackDamage(damage);
          await waitUntil(() => game.messages.get(damage.id).getFlag("eclipsephase", "damageCard").lines.length, 8000);

          const after = game.messages.get(damage.id);
          assert.deepInclude(shape, { root: true, icon: true, stray: 0 });
          assert.isAbove(mind.system.health.physical.value, 0);
          assert.isTrue(cardShape(after).root);
          return after;
        })));
      });

      it("a target who resists psi with a critical success locks the async out, and the card says so", async function () {
        this.timeout(30000);
        const sense = { name: "Quench Sense", type: "aspect", system: { psiType: "gamma", strainFamily: "psi", infection: 0, damage: { d10: 0, d6: 0, bonus: 0 } } };
        await keepingOnly(() => withTempActor({ type: "goon", name: "Quench Async", items: [sense] }, async caster => withTempActor({ type: "character", name: "Quench Mind", system: { aptitudes: { wil: { value: 15 } } } }, async mind => {
          await waitUntil(() => mind.getFlag("eclipsephase", "defaultMorphAdded"));
          seedDice([uniformForFace(30, 100)]);
          await RollCheck({ name: "Psi", key: "psi", type: "psi", rollvalue: 70, itemid: caster.items.find(item => item.name === "Quench Sense").id, pooltype: "Moxie" }, caster.system, caster, { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } }, null, "psiSleight");
          const card = newestWith("taskCard");
          await applyTargetedAttack(card, { pick: async () => [{ actor: mind }], confirm: async () => true });
          const defence = newestWith("attackDefence");

          seedDice([uniformForFace(22, 100)]);
          await rollDefence(defence, mind.uuid, "will", { skipDialog: true, presetOptions: { rollMode: "public", usePool: "", globalMod: 0 } });
          await waitUntil(() => game.messages.get(defence.id).getFlag("eclipsephase", "attackDefence").entries[0].outcome, 8000);

          const after = game.messages.get(defence.id);
          assert.deepInclude(after.getFlag("eclipsephase", "attackDefence").entries[0], { outcome: "none", lockedOut: true });
          assert.include(after.content, game.i18n.localize("ep2e.chat.defence.lockedOut"));
          assert.isTrue(cardShape(after).root);
          return after;
        })));
      });
    });

    describe("a psi touch attack and the pool points that turn it around", function () {
      const SENSE = { name: "Quench Sense", type: "aspect", system: { psiType: "gamma", strainFamily: "psi", infection: 0, damage: { d10: 0, d6: 0, bonus: 0 } } };
      const PUBLIC = { rollMode: "public", usePool: "", globalMod: 0 };

      /**
       * Starts a sleight by touch at a target, answering the touch's melee dialog with the values given.
       * @param {Actor} caster - The async
       * @param {Actor} target - The target
       * @param {Object} melee - What the melee dialog answers
       * @param {Number} die - The melee test's d100
       * @returns {Promise<ChatMessage>} The melee test's card
       */
      async function touchAt(caster, target, melee, die) {
        const wait = foundry.applications.api.DialogV2.wait;
        foundry.applications.api.DialogV2.wait = async () => ({ ...PUBLIC, ...melee });
        try {
          seedDice([uniformForFace(die, 100)]);
          await RollCheck({ name: "Psi", key: "psi", type: "psi", rollvalue: 70, itemid: caster.items.find(item => item.name === "Quench Sense").id, pooltype: "Moxie" }, caster.system, caster, { skipDialog: true, presetOptions: { ...PUBLIC, psiTouch: true, preTargets: target.uuid } }, null, "psiSleight");
        } finally {
          foundry.applications.api.DialogV2.wait = wait;
        }
        return newestWith("taskCard");
      }

      /**
       * Spends a pool point on a roll card, swapping its die.
       * @param {ChatMessage} card - The roll card
       * @returns {Promise<void>} Resolves once spent
       */
      async function flip(card) {
        const row = document.createElement("li");
        row.dataset.messageId = card.id;
        const button = document.createElement("button");
        button.dataset.usepool = "pool";
        row.append(button);
        await usePoolFromChat({ currentTarget: button });
      }

      /**
       * The touch card the current test posted.
       * @returns {ChatMessage|undefined} The card
       */
      function touchCard() {
        return newestWith("psiTouch");
      }

      const async = () => ({ type: "character", name: "Quench Async", system: { skillsVig: { melee: { value: 40 } }, pools: { vigor: { value: 2 } } }, items: [SENSE] });
      const mind = () => ({ type: "character", name: "Quench Mind", system: { aptitudes: { ref: { value: 20 } }, skillsVig: { fray: { value: 30 } }, pools: { vigor: { value: 2 } } } });

      it("a defence the target turns around with a pool point turns the card from touched to avoided", async function () {
        this.timeout(30000);
        await keepingOnly(() => withTempActor(async(), caster => withTempActor(mind(), async target => {
          await waitUntil(() => caster.getFlag("eclipsephase", "defaultMorphAdded") && target.getFlag("eclipsephase", "defaultMorphAdded"));
          await touchAt(caster, target, { touchOnly: true }, 5);
          await waitUntil(() => newestWith("attackDefence"), 8000);
          assert.isUndefined(touchCard(), "no card before the defence");

          seedDice([uniformForFace(91, 100)]);
          await rollDefence(newestWith("attackDefence"), target.uuid, "dodge", { skipDialog: true, presetOptions: { ...PUBLIC } });
          await waitUntil(() => touchCard()?.getFlag("eclipsephase", "psiTouch").outcome === "touched", 8000);
          const card = touchCard();

          await flip(newestWith("taskCard"));
          await waitUntil(() => game.messages.get(card.id)?.getFlag("eclipsephase", "psiTouch").outcome === "avoided", 8000);

          const after = game.messages.get(card.id);
          assert.include(after.content, game.i18n.format("ep2e.chat.psiTouch.usePointBlank", { sleight: "Quench Sense" }));
          assert.isTrue(cardShape(after).root);
          return after;
        })));
      });

      it("a touch that misses shows its card at once; a pool point that turns it into a hit takes it back, and the defence brings a new one", async function () {
        this.timeout(30000);
        await keepingOnly(() => withTempActor(async(), caster => withTempActor(mind(), async target => {
          await waitUntil(() => caster.getFlag("eclipsephase", "defaultMorphAdded") && target.getFlag("eclipsephase", "defaultMorphAdded"));
          const attack = await touchAt(caster, target, { touchOnly: true }, 91);
          await waitUntil(() => touchCard()?.getFlag("eclipsephase", "psiTouch").outcome === "missed", 8000);
          const missed = touchCard();

          await flip(attack);
          await waitUntil(() => !game.messages.get(missed.id), 8000);
          await waitUntil(() => newestWith("attackDefence"), 8000);
          seedDice([uniformForFace(95, 100)]);
          await rollDefence(newestWith("attackDefence"), target.uuid, "dodge", { skipDialog: true, presetOptions: { ...PUBLIC } });
          await waitUntil(() => touchCard()?.getFlag("eclipsephase", "psiTouch").outcome === "touched", 8000);

          const after = touchCard();
          assert.notStrictEqual(after.id, missed.id);
          assert.include(after.content, game.i18n.format("ep2e.chat.psiTouch.useTouch", { sleight: "Quench Sense" }));
          return after;
        })));
      });

      it("a melee test with Touch Attack unticked is no touch: no defence and no touch card", async function () {
        this.timeout(30000);
        await keepingOnly(() => withTempActor(async(), caster => withTempActor(mind(), async target => {
          await waitUntil(() => caster.getFlag("eclipsephase", "defaultMorphAdded") && target.getFlag("eclipsephase", "defaultMorphAdded"));
          const card = await touchAt(caster, target, { touchOnly: false }, 5);
          await new Promise(resolve => setTimeout(resolve, 500));

          assert.isUndefined(newestWith("attackDefence"));
          assert.isUndefined(touchCard());
          assert.isUndefined(card.getFlag("eclipsephase", "roll")?.targetedAttack);
          return null;
        })));
      });
    });
  }, { displayName: "Eclipse Phase: Chat cards" });
}
