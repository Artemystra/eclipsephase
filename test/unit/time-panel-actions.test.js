import EPtimePanel from "../../module/apps/time-panel.js";
import { elapsedTime, BEATS, HOURS } from "../../module/common/time.js";
import { makeActor, resetWorld, setSetting } from "../setup/factories.js";

const DAY = 86400;

/**
 * A stand-in for the panel instance the action handlers run against, carrying only the element
 * lookups and state they actually touch.
 * @param {Object} fields - The values the panel's input fields should report
 * @returns {Object} The stand-in
 */
function panel(fields = {}) {
  return {
    rendered: true,
    renders: 0,
    element: { querySelector: selector => {
      const name = /\[name='(.+)'\]/.exec(selector)?.[1];
      return name in fields ? { value: fields[name] } : null;
    } },
    render() { this.renders++; return Promise.resolve(); }
  };
}

beforeEach(() => {
  resetWorld();
  setSetting("eclipsephase", "timeFormat", HOURS);
  setSetting("eclipsephase", "rechargeAutoReset", true);
  game.users.activeGM = { isSelf: true };
});

describe("letting time pass", () => {
  test("a preset advances the clock by the seconds it carries", async () => {
    await EPtimePanel._onAdvance.call(panel(), null, { dataset: { seconds: "3600" } });
    expect(game.time.worldTime).toEqual(3600);
  });

  test("a button with no usable step does nothing", async () => {
    for (const seconds of ["0", "-60", "", "nonsense"]) {
      await EPtimePanel._onAdvance.call(panel(), null, { dataset: { seconds } });
    }
    expect(game.time.worldTime).toEqual(0);
  });

  test("the custom field advances by minutes", async () => {
    await EPtimePanel._onAdvanceCustom.call(panel({ customMinutes: "90" }));
    expect(game.time.worldTime).toEqual(90 * 60);
  });

  test("an empty custom field is ignored", async () => {
    await EPtimePanel._onAdvanceCustom.call(panel({ customMinutes: "" }));
    expect(game.time.worldTime).toEqual(0);
  });
});

describe("editing the date", () => {
  test("it moves to that year and day while keeping the time of day", async () => {
    game.time.worldTime = 6 * 3600 + 14 * 60;
    await EPtimePanel.prototype.setDateFromHeader.call(panel({ year: "2", dayOfYear: "100" }));
    expect(elapsedTime(game.time.worldTime)).toMatchObject({ year: 2, dayOfYear: 100, hour: 6, minute: 14 });
  });

  test("setting it to the date it already shows changes nothing", async () => {
    game.time.worldTime = 5 * DAY;
    const { year, dayOfYear } = elapsedTime(game.time.worldTime);
    await EPtimePanel.prototype.setDateFromHeader.call(panel({ year: String(year), dayOfYear: String(dayOfYear) }));
    expect(game.time.worldTime).toEqual(5 * DAY);
  });
});

describe("editing the time of day", () => {
  test("hours and minutes keep the current day", async () => {
    game.time.worldTime = 12 * DAY;
    await EPtimePanel.prototype.setTimeOfDayFromClock.call(panel({ hour: "22", minute: "15" }));
    expect(elapsedTime(game.time.worldTime)).toMatchObject({ day: 13, hour: 22, minute: 15 });
  });

  test("in beats mode it reads the beat field instead", async () => {
    setSetting("eclipsephase", "timeFormat", BEATS);
    game.time.worldTime = 12 * DAY;
    await EPtimePanel.prototype.setTimeOfDayFromClock.call(panel({ beat: "500" }));
    expect(elapsedTime(game.time.worldTime)).toMatchObject({ day: 13, beat: 500 });
  });
});

describe("the format toggle", () => {
  test("it flips between hours and beats and re-renders", async () => {
    const instance = panel();
    await EPtimePanel._onToggleFormat.call(instance);
    expect(game.settings.get("eclipsephase", "timeFormat")).toEqual(BEATS);
    await EPtimePanel._onToggleFormat.call(instance);
    expect(game.settings.get("eclipsephase", "timeFormat")).toEqual(HOURS);
    expect(instance.renders).toEqual(2);
  });
});

describe("the auto-reset toggle", () => {
  test("it flips the setting", async () => {
    await EPtimePanel._onToggleAutoReset.call(panel());
    expect(game.settings.get("eclipsephase", "rechargeAutoReset")).toBe(false);
  });
});

describe("ending an effect from the list", () => {
  test("an actor-owned effect is deleted", async () => {
    const actor = makeActor({ type: "character", effects: [{ _id: "fx1", name: "Kick", duration: { value: 8, units: "hours" } }] });
    await EPtimePanel._onEndEffect.call(panel(), null, {
      dataset: { actorId: actor.id, parentId: actor.id, effectId: "fx1", onItem: "false" }
    });
    expect(actor.effects).toHaveLength(0);
  });

  test("an item-owned effect is deleted from its item", async () => {
    const actor = makeActor({
      type: "character",
      items: [{ _id: "it1", name: "Instinct", type: "aspect", effects: [{ _id: "fx2", name: "Boost" }] }]
    });
    await EPtimePanel._onEndEffect.call(panel(), null, {
      dataset: { actorId: actor.id, parentId: "it1", effectId: "fx2", onItem: "true" }
    });
    expect(actor.items.get("it1").effects).toHaveLength(0);
  });

  test("an actor that no longer exists is shrugged off", async () => {
    await expect(EPtimePanel._onEndEffect.call(panel(), null, {
      dataset: { actorId: "gone", parentId: "gone", effectId: "fx", onItem: "false" }
    })).resolves.toBeUndefined();
  });
});
