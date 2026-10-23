import { healthBarChange } from "../../module/rolls/health.js";
import { makeActor, resetWorld, seedDialogs, seedRolls } from "../setup/factories.js";

const { createdMessages } = global.__ep;

/**
 * A character carrying damage and a wound on both tracks.
 * @param {String} [type] - The actor type
 * @returns {Actor} The prepared actor
 */
function hurt(type = "character") {
  return makeActor({
    type,
    system: {
      activeMorph: "morph1",
      health: { physical: { value: 8 }, mental: { value: 5 } },
      physical: { wounds: 1 },
      mental: { trauma: 1 }
    },
    items: [{ _id: "morph1", name: "Splicer", type: "morph", system: { type: "bio", dur: 30 } }]
  });
}

/**
 * Wires the sheet's health controls the way the sheet does and hands back their click handlers.
 * @param {Actor} actor - The actor whose sheet is open
 * @param {Object} [inputs] - Values typed into the damage fields, by element id
 * @returns {Promise<Object>} Click handlers by element id
 */
async function healthControls(actor, inputs = {}) {
  const handlers = {};
  const html = {
    querySelector: selector => {
      const id = selector.replace("#", "");
      return { style: {}, value: inputs[id] ?? "", addEventListener: (_, fn) => { handlers[id] = fn; } };
    }
  };
  await healthBarChange(actor, html);
  return handlers;
}

beforeEach(() => resetWorld());

describe("taking damage from the sheet", () => {
  test("the damage field adds damage and the wounds it is worth", async () => {
    const actor = hurt();
    const controls = await healthControls(actor, { receivePhysicalDamage: String(actor.system.physical.wt) });

    await controls.takePhysicalDamage();

    expect(actor.system.health.physical.value).toEqual(8 + actor.system.physical.wt);
    expect(actor.system.physical.wounds).toEqual(2);
  });
});

describe("healing from the sheet", () => {
  test("a full heal clears damage and wounds on the body and posts a card", async () => {
    const actor = hurt();
    const controls = await healthControls(actor);

    await controls.healPhysicalDamageFull();

    expect(actor.system.health.physical.value).toEqual(0);
    expect(actor.system.physical.wounds).toEqual(0);
    expect(createdMessages).toHaveLength(1);
  });

  test("a full heal of the mind clears stress and trauma and leaves the body alone", async () => {
    const actor = hurt();
    const controls = await healthControls(actor);

    await controls.healMentalDamageFull();

    expect(actor.system.health.mental.value).toEqual(0);
    expect(actor.system.mental.trauma).toEqual(0);
    expect(actor.system.health.physical.value).toEqual(8);
  });

  test("the heal card is posted as the character who was healed", async () => {
    const actor = hurt();
    const controls = await healthControls(actor);

    await controls.healPhysicalDamageFull();

    expect(createdMessages[0].speaker.actor).toEqual(actor.id);
  });

  test("an NPC's heal card goes to the GMs", async () => {
    const actor = hurt("npc");
    const controls = await healthControls(actor);

    await controls.healPhysicalDamageFull();

    expect(createdMessages[0].whisper).toEqual([{ id: "gm-user", isGM: true }]);
  });

  test("a partial heal rolls the healing for the time that passed and keeps what is left", async () => {
    const actor = hurt();
    const controls = await healthControls(actor);
    seedDialogs({ heal: [{ cycle: 1, roll: "1d10" }], wound: [], duration: 1, minimumHealingCycles: { health: 1, modifier: 1 } });
    seedRolls([5]);

    await controls.healPhysicalDamagePartial();

    expect(actor.system.health.physical.value).toEqual(3);
    expect(actor.system.physical.wounds).toEqual(1);
  });

  test("backing out of the partial heal changes nothing", async () => {
    const actor = hurt();
    const controls = await healthControls(actor);
    seedDialogs({ cancelled: true });

    await controls.healPhysicalDamagePartial();

    expect(actor.system.health.physical.value).toEqual(8);
    expect(createdMessages).toHaveLength(0);
  });
});

describe("the token's health bar", () => {
  test("raising the bar is taking damage, wounds included", async () => {
    const actor = hurt();
    const wt = actor.system.physical.wt;

    await actor.modifyTokenAttribute("health.physical", wt, true, true);

    expect(actor.system.health.physical.value).toEqual(8 + wt);
    expect(actor.system.physical.wounds).toEqual(2);
  });

  test("damage on the bar never runs past the death rating", async () => {
    const actor = hurt();

    await actor.modifyTokenAttribute("health.physical", 999, true, true);

    expect(actor.system.health.physical.value).toEqual(actor.system.physical.dr);
  });

  test("lowering the bar only moves the value: healing stays a deliberate act on the sheet", async () => {
    const actor = hurt();

    await actor.modifyTokenAttribute("health.physical", -3, true, true);

    expect(actor.system.health.physical.value).toEqual(5);
    expect(actor.system.physical.wounds).toEqual(1);
  });
});

describe("the bars on the sheet", () => {
  /**
   * A sheet's health elements, each with a style to read the bar widths from.
   * @returns {Object} querySelector and the elements by id
   */
  function sheetHtml() {
    const elements = {};
    return {
      elements,
      querySelector: selector => {
        const id = selector.replace("#", "");
        elements[id] ??= { style: {}, value: "", addEventListener: () => {} };
        return elements[id];
      }
    };
  }

  test("a sheet drawn again while the bars move picks the animation up instead of starting it over", async () => {
    const actor = hurt();
    await actor.update({ "system.health.physical.value": 1, "system.physical.oldHealthBarValue": 60, "system.physical.oldDeathBarValue": 0, "system.health.barModifier": "physicalDown" });
    const first = sheetHtml();
    const second = sheetHtml();

    const animation = healthBarChange(actor, first);
    await new Promise(resolve => setTimeout(resolve, 120));
    const reached = parseFloat(first.elements.physicalHealthBar.style.width);
    const redraw = healthBarChange(actor, second);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(reached).toBeLessThan(60);
    expect(parseFloat(second.elements.physicalHealthBar.style.width)).toBeLessThanOrEqual(reached);
    await Promise.all([animation, redraw]);
    expect(parseFloat(second.elements.physicalHealthBar.style.width)).toBe(actor.system.physical.relativePhysicalDamage);
  });
});
