import { modifierValue, globalModifiers, GLOBAL_MOD_KEY } from "../../module/common/global-mod.js";
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

describe("the sidebar's special modifiers", () => {
  test("show the intoxicated line with the drugs beneath it", async () => {
    const actor = makeActor({ type: "character", effects: [dose("Twitch", "-20"), dose("Neuropath", "-30")] });

    const html = await foundry.applications.handlebars.renderTemplate(
      "systems/eclipsephase/templates/actor/partials/currentStatus/statusSummary.html", { actor });

    expect(html).toContain(INTOXICATED);
    expect(html).toContain("Twitch (-20)\nNeuropath (-30)");
    expect(html).toContain("ep-mod-breakdown");
    expect(html).toContain("-50");
  });
});
