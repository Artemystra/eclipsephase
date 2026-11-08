import { modifierValue, globalModifiers, rollScope, scopeModKey, modifierSummary, GLOBAL_MOD_KEY, PHYSICAL_MOD_KEY, MENTAL_MOD_KEY } from "../../module/rolls/modifiers.js";
import { makeActor, resetWorld } from "../setup/factories.js";

/**
 * A running dose of a drug whose effect is a modifier to all actions.
 * @param {String} name - The drug's name
 * @param {String|Number} value - The modifier as the change carries it
 * @param {Object} [extra] - Further effect fields
 * @returns {Object} The effect data
 */
function dose(name, value, extra = {}) {
  return {
    name,
    duration: { value: 1, units: "hours" },
    changes: [{ key: GLOBAL_MOD_KEY, value, type: "add" }],
    flags: { eclipsephase: { dose: { name } } },
    ...extra
  };
}

const INTOXICATED = "ep2e.roll.announce.intoxicated";

beforeEach(() => resetWorld());

describe("reading a modifier value", () => {
  test.each([
    [-20, -20],
    ["-20", -20],
    ["+5", 5],
    ["-20-30", -50],
    [null, 0],
    ["", 0],
    [Number.NaN, 0]
  ])("%p counts as %p", (value, expected) => expect(modifierValue(value)).toEqual(expected));
});

describe("the modifiers to all actions on an actor", () => {
  test("a running dose shows as intoxicated, naming the drug", () => {
    const actor = makeActor({ type: "character", effects: [dose("Twitch", "-20")] });

    expect(globalModifiers(actor)).toEqual([{ label: INTOXICATED, modifier: -20, comment: "Twitch (-20)" }]);
  });

  test("two drugs sum into the one intoxicated line, which names both", () => {
    const actor = makeActor({ type: "character", effects: [dose("Twitch", "-20"), dose("Neuropath", "-30")] });

    expect(globalModifiers(actor)).toEqual([{ label: INTOXICATED, modifier: -50, comment: "Twitch (-20)\nNeuropath (-30)" }]);
    expect(modifierValue(actor.system.mods.globalMod)).toEqual(-50);
  });

  test("an effect that is not a dose keeps a line of its own, so intoxicated never claims it", () => {
    const actor = makeActor({
      type: "character",
      effects: [dose("Twitch", "-20"), { name: "Concussion", changes: [{ key: GLOBAL_MOD_KEY, value: "-10", type: "add" }] }]
    });

    expect(globalModifiers(actor)).toEqual([
      { label: INTOXICATED, modifier: -20, comment: "Twitch (-20)" },
      { label: "Concussion", modifier: -10 }
    ]);
  });

  test("a dose switched off or run out contributes nothing", () => {
    const actor = makeActor({
      type: "character",
      effects: [dose("Twitch", "-20", { disabled: true }), dose("Nervex", "-20", { duration: { value: 1, units: "hours", expired: true } })]
    });

    expect(globalModifiers(actor)).toEqual([]);
  });

  test("a drug carried but not taken contributes nothing - its effect is only a blueprint", () => {
    const actor = makeActor({
      type: "character",
      items: [{ name: "Twitch", type: "drug", system: { active: true }, effects: [{ name: "Twitch", changes: [{ key: GLOBAL_MOD_KEY, value: "-20", type: "add" }] }] }]
    });

    expect(globalModifiers(actor)).toEqual([]);
  });

  test("a value no effect explains is still counted, under a general label", () => {
    const actor = makeActor({ type: "character", system: { mods: { globalMod: -10 } }, effects: [dose("Twitch", "-20")] });

    expect(globalModifiers(actor)).toEqual([
      { label: INTOXICATED, modifier: -20, comment: "Twitch (-20)" },
      { label: "ep2e.roll.announce.globalEffects", modifier: -10 }
    ]);
  });

  test("an actor with nothing on it has no lines", () => {
    expect(globalModifiers(makeActor({ type: "character" }))).toEqual([]);
  });
});

describe("the status summary", () => {
  test("lists each modifier to all actions among the special modifiers and counts it in the total", () => {
    const plain = makeActor({ type: "character" });
    const dosed = makeActor({ type: "character", effects: [dose("Twitch", "-20")] });

    expect(dosed.system.currentStatus.specialModifiers).toContainEqual({ label: INTOXICATED, modifier: -20, comment: "Twitch (-20)", flag: "globalMod" });
    expect(dosed.system.currentStatus.statusPresent).toBe(true);
    expect(dosed.system.currentStatus.currentModifiersSum - plain.system.currentStatus.currentModifiersSum).toEqual(-20);
  });
});

describe("the side car's current modifiers", () => {
  test("show the sums on a physical and a mental action, and the breakdown the intoxicated line with the drugs beneath it", async () => {
    const actor = makeActor({ type: "character", effects: [dose("Twitch", "-20"), dose("Neuropath", "-30")] });

    const box = await foundry.applications.handlebars.renderTemplate(
      "systems/eclipsephase/templates/actor/partials/currentStatus/statusSummary.html", { actor });
    const breakdown = await foundry.applications.handlebars.renderTemplate(
      "systems/eclipsephase/templates/actor/partials/currentStatus/modifier-breakdown.hbs", actor.system.currentStatus);

    expect(box).toContain("ep2e.sideCar.currentStatus.body");
    expect(box.match(/ep-modifier-negative">-50</g)).toHaveLength(2);
    expect(box).toContain('data-action="modifierBreakdown"');
    expect(breakdown).not.toContain("allColumn");
    expect(breakdown).toContain(INTOXICATED);
    expect(breakdown).toContain("Twitch (-20)\nNeuropath (-30)");
    expect(breakdown).toContain("ep-mod-breakdown");
  });

  test("an actor without modifiers shows 0 on both and an empty breakdown", async () => {
    const actor = makeActor({ type: "character" });

    const box = await foundry.applications.handlebars.renderTemplate(
      "systems/eclipsephase/templates/actor/partials/currentStatus/statusSummary.html", { actor });
    const breakdown = await foundry.applications.handlebars.renderTemplate(
      "systems/eclipsephase/templates/actor/partials/currentStatus/modifier-breakdown.hbs", actor.system.currentStatus);

    expect(box.match(/ep-sidecar-value">0</g)).toHaveLength(2);
    expect(box.match(/ep-modifier-note"/g)).toHaveLength(4);
    expect(box).not.toContain("ep-modifier-note-active");
    expect(breakdown).toContain("ep2e.sideCar.currentStatus.noModifiersSubHeader");
  });
});

describe("the side car's armor box", () => {
  const ARMOR = "systems/eclipsephase/templates/actor/partials/currentStatus/armorSummary.html";

  test("shows Energy and Kinetic side by side, and Mental beside them only when there is any", async () => {
    const actor = makeActor({ type: "character" });
    actor.system.additionalSystems.armorEquipped = true;
    actor.system.physical.energyArmorTotal = 16;
    actor.system.physical.kineticArmorTotal = 21;
    actor.system.mental.armorTotal = 0;
    const plain = await foundry.applications.handlebars.renderTemplate(ARMOR, { actor });
    actor.system.mental.armorTotal = 5;
    const mental = await foundry.applications.handlebars.renderTemplate(ARMOR, { actor });

    expect(plain.match(/ep-sidecar-pair"/g)).toHaveLength(2);
    expect(plain).toContain('ep-sidecar-value">16<');
    expect(plain).toContain('ep-sidecar-value">21<');
    expect(plain).not.toContain("ep2e.sideCar.armor.mental");
    expect(mental.match(/ep-sidecar-pair"/g)).toHaveLength(3);
    expect(mental).toContain('ep-sidecar-value">5<');
  });

  test("without any armor says so", async () => {
    const actor = makeActor({ type: "character" });
    actor.system.additionalSystems.armorEquipped = false;
    actor.system.mental.armorTotal = 0;
    const html = await foundry.applications.handlebars.renderTemplate(ARMOR, { actor });

    expect(html).toContain("ep2e.sideCar.armor.noArmorSubheadline");
    expect(html).not.toContain("ep-sidecar-pair");
  });
});

describe("what the current modifiers add up to", () => {
  test("wounds and all-action modifiers count for both, armour and physical ones for the body, mental ones for the mind; an effect with both is one row", () => {
    const status = { woundModifierSum: -10, traumaModifierSum: 0, encumberanceModifierSum: 0,
      specialModifiers: [{ label: "Impaired", modifier: -10 }] };
    const counts = { wounds: 1, trauma: 0, layers: 2, layerMalus: 20, somMalus: 20 };
    const summary = modifierSummary(status, counts, [{ label: "Stunned", modifier: -30 }], [{ label: "Stunned", modifier: -10 }, { label: "Mindfog", modifier: -10 }]);

    expect(summary).toMatchObject({ body: -90, mind: -40, bodyText: "-90", mindText: "-40" });
    expect(summary.rows.map(row => [row.label, row.count, row.body, row.mind])).toEqual([
      ["ep2e.sideCar.currentStatus.statuses.wounded", 1, "-10", "-10"],
      ["Impaired", undefined, "-10", "-10"],
      ["ep2e.sideCar.currentStatus.statuses.layersOfArmor", 2, "-20", ""],
      ["ep2e.sideCar.currentStatus.statuses.somExceeded", undefined, "-20", ""],
      ["Stunned", undefined, "-30", "-10"],
      ["Mindfog", undefined, "", "-10"]
    ]);
    expect(summary.rows[0].times).toBe(true);
    expect(summary.rows[2].times).toBeUndefined();
  });

  test("a module's modifier written as text still counts", () => {
    const summary = modifierSummary({ specialModifiers: [{ label: "Module", modifier: "-5" }] }, {}, [], []);
    expect(summary).toMatchObject({ body: -5, mind: -5 });
  });
});

describe("physical and mental actions", () => {
  test.each([
    [{ pooltype: "Vigor" }, "skill", "body"],
    [{ pooltype: "Insight" }, "skill", "mind"],
    [{ pooltype: "Moxie" }, "psiSleight", "mind"],
    [{ apttype: "som" }, "skill", "body"],
    [{ apttype: "REF" }, "skill", "body"],
    [{ apttype: "cog", pooltype: "Vigor" }, "skill", "mind"],
    [{}, "rangedWeapon", "body"],
    [{}, "grenade", "body"],
    [{}, "stressTest", "mind"],
    [{ pooltype: "Vigor" }, "vehicleSkill", null]
  ])("%p rolled from %p is %p", (dataset, rolledFrom, scope) => expect(rollScope(dataset, rolledFrom)).toEqual(scope));

  test("each scope has its own field", () => {
    expect(scopeModKey("body")).toBe(PHYSICAL_MOD_KEY);
    expect(scopeModKey("mind")).toBe(MENTAL_MOD_KEY);
    expect(scopeModKey(null)).toBeNull();
  });

  test("the modifiers to physical actions are read from their own field, each effect on its line", () => {
    const actor = makeActor({ type: "character", effects: [
      { name: "Stunned", changes: [{ key: PHYSICAL_MOD_KEY, value: "-30", type: "add" }, { key: MENTAL_MOD_KEY, value: "-10", type: "add" }] },
      { name: "Impaired", changes: [{ key: GLOBAL_MOD_KEY, value: "-10", type: "add" }] }
    ] });

    expect(globalModifiers(actor, { key: PHYSICAL_MOD_KEY })).toEqual([{ label: "Stunned", modifier: -30 }]);
    expect(globalModifiers(actor, { key: MENTAL_MOD_KEY })).toEqual([{ label: "Stunned", modifier: -10 }]);
    expect(globalModifiers(actor)).toEqual([{ label: "Impaired", modifier: -10 }]);
  });
});
