import { tempEffectCreation, tempEffectDeletion, deleteRunOutTempEffects } from "../../module/common/general-sheet-functions.js";
import { integrationPenalty } from "../../module/rolls/resleeving.js";
import { makeActor, resetWorld } from "../setup/factories.js";

const WOUND_CHANGE = [{ key: "system.mods.woundMod", mode: 2, value: "-1" }];

/**
 * A character carrying a freshly spent Ignore Wound, as the Vigor pool spend creates it.
 * @returns {Promise<Object>} The actor and its ignore effect
 */
async function withIgnoreWound() {
  const actor = makeActor({ type: "character" });
  await tempEffectCreation(actor, "Temp Ignore Wound", "", WOUND_CHANGE, "woundIgnore", 24);
  return { actor, effect: actor.effects.find(e => e.getFlag("eclipsephase", "effectKey") === "woundIgnore") };
}

beforeEach(() => resetWorld());

describe("ignoring a wound or trauma", () => {
  test("it lasts the 24 hours RAW gives it", async () => {
    const { effect } = await withIgnoreWound();
    expect(effect.duration).toMatchObject({ value: 24, units: "hours" });
  });

  test("it puts no icon on the token, which a duration would otherwise do", async () => {
    const { effect } = await withIgnoreWound();
    expect(effect.showIcon).toEqual(CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER);
  });

  test("it runs down on the clock, not on a combat turn", async () => {
    const { effect } = await withIgnoreWound();
    expect(effect.duration.expiry).toBeNull();
  });

  test("an effect created without hours stays open-ended", async () => {
    const actor = makeActor({ type: "character" });
    await tempEffectCreation(actor, "Open ended", "", WOUND_CHANGE, "someKey");
    const effect = actor.effects.find(e => e.getFlag("eclipsephase", "effectKey") === "someKey");
    expect(effect.duration.value).toBeNull();
  });
});

describe("when the 24 hours run out", () => {
  test("the effect is deleted rather than left lying around marked expired", async () => {
    const { actor, effect } = await withIgnoreWound();
    effect.duration.remaining = 0;
    await deleteRunOutTempEffects(actor, [effect]);
    expect(actor.effects).toHaveLength(0);
  });

  test("one still counting down is left alone", async () => {
    const { actor, effect } = await withIgnoreWound();
    effect.duration.remaining = 5;
    await deleteRunOutTempEffects(actor, [effect]);
    expect(actor.effects).toHaveLength(1);
  });

  test("an effect that is not one of the system's own is never touched", async () => {
    const actor = makeActor({ type: "character" });
    const other = new ActiveEffect({ name: "Kick", duration: { expired: true } });
    actor.effects.push(other);
    await deleteRunOutTempEffects(actor, [other]);
    expect(actor.effects).toHaveLength(1);
  });
});

describe("the other half of the rule still holds", () => {
  test("a recharge ends it before the 24 hours are up", async () => {
    const { actor } = await withIgnoreWound();
    await tempEffectDeletion(actor, "eclipsephase", "effectKey", ["woundIgnore", "traumaIgnore"]);
    expect(actor.effects).toHaveLength(0);
  });
});

describe("a failed Integration Test", () => {
  test.each([[2, 1], [1, 2], [0, 3], [6, 3], [8, 3]])(
    "result %i hampers the character for %i day(s), per RAW",
    (result, days) => {
      expect(integrationPenalty(result).days).toEqual(days);
    }
  );

  test("each span keeps naming its own label", () => {
    expect(integrationPenalty(2).label).toContain("oneDay");
    expect(integrationPenalty(1).label).toContain("twoDay");
    expect(integrationPenalty(6).label).toContain("threeDay");
  });

  test("the penalty is carried as a real duration, so it shows up in the running-effects list", async () => {
    const actor = makeActor({ type: "character" });
    const { days } = integrationPenalty(1);
    await tempEffectCreation(actor, "Integration Issues", "", WOUND_CHANGE, "integrationIssues", days * 24);

    const effect = actor.effects.find(e => e.getFlag("eclipsephase", "effectKey") === "integrationIssues");
    expect(effect.duration).toMatchObject({ value: 48, units: "hours" });
    expect(effect.showIcon).toEqual(CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER);
  });
});
