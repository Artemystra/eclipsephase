import EPtimePanel from "../../module/apps/time-panel.js";
import { elapsedTime, BEATS, HOURS } from "../../module/common/time.js";
import { makeActor, makeUnlinkedToken, resetWorld, setSetting } from "../setup/factories.js";

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
      dataset: { actorUuid: actor.uuid, parentId: actor.id, effectId: "fx1", onItem: "false" }
    });
    expect(actor.effects).toHaveLength(0);
  });

  test("an item-owned effect is deleted from its item", async () => {
    const actor = makeActor({
      type: "character",
      items: [{ _id: "it1", name: "Instinct", type: "aspect", effects: [{ _id: "fx2", name: "Boost" }] }]
    });
    await EPtimePanel._onEndEffect.call(panel(), null, {
      dataset: { actorUuid: actor.uuid, parentId: "it1", effectId: "fx2", onItem: "true" }
    });
    expect(actor.items.get("it1").effects).toHaveLength(0);
  });

  test("an unlinked token's effect is deleted from the token's copy, not from the world actor", async () => {
    const viewed = { uuid: "Scene.s1", tokens: [] };
    const copy = makeUnlinkedToken(viewed, { _id: "goon1", type: "goon", effects: [{ _id: "fx3", name: "Kick", duration: { value: 8, units: "hours" } }] });
    const world = makeActor({ _id: "goon1", type: "goon", effects: [{ _id: "fx3", name: "Kick", duration: { value: 8, units: "hours" } }] });

    await EPtimePanel._onEndEffect.call(panel(), null, {
      dataset: { actorUuid: copy.uuid, parentId: copy.id, effectId: "fx3", onItem: "false" }
    });

    expect(copy.effects).toHaveLength(0);
    expect(world.effects).toHaveLength(1);
  });

  test("an actor that no longer exists is shrugged off", async () => {
    await expect(EPtimePanel._onEndEffect.call(panel(), null, {
      dataset: { actorUuid: "Actor.gone", parentId: "gone", effectId: "fx", onItem: "false" }
    })).resolves.toBeUndefined();
  });
});

describe("the GM's list in sections", () => {
  const KICK = { name: "Kick", duration: { value: 8, units: "hours" } };

  /**
   * The panel's own context, as a GM sees it.
   * @param {EPtimePanel} instance - The panel
   * @returns {Promise<Object>} The context
   */
  async function context(instance) {
    game.user.isGM = true;
    return instance._prepareContext();
  }

  test("player characters come first, everyone else after them", async () => {
    makeActor({ type: "npc", name: "Exhuman Brute", effects: [KICK] });
    makeActor({ type: "character", name: "Hex", effects: [KICK] });
    makeActor({ type: "goon", name: "Thug", effects: [KICK] });

    const { sections } = await context(new EPtimePanel());

    expect(sections.map(section => section.label)).toEqual(["ep2e.time.sectionPlayers", "ep2e.time.sectionThreats"]);
    expect(sections[0].groups.map(group => group.name)).toEqual(["Hex"]);
    expect(sections[1].groups.map(group => group.name)).toEqual(["Exhuman Brute", "Thug"]);
  });

  test("an unlinked copy of a player character is still listed with the players", async () => {
    const viewed = { uuid: "Scene.s1", tokens: [] };
    game.scenes.viewed = viewed;
    makeUnlinkedToken(viewed, { _id: "dinah", type: "character", name: "Dinah", effects: [KICK] });

    const { sections } = await context(new EPtimePanel());

    expect(sections).toHaveLength(1);
    expect(sections[0].label).toEqual("ep2e.time.sectionPlayers");
  });

  test("only the non-player section collapses, and the players stay open", async () => {
    makeActor({ type: "character", name: "Hex", effects: [KICK] });
    makeActor({ type: "goon", name: "Thug", effects: [KICK] });
    const instance = new EPtimePanel();
    instance.render = async () => instance;

    await EPtimePanel._onToggleThreats.call(instance);
    const { sections } = await context(instance);

    expect(sections.map(section => [section.collapsible, section.open])).toEqual([[false, true], [true, false]]);
  });

  test("the template shows both headings with the actors under them", async () => {
    makeActor({ type: "character", name: "Hex", effects: [KICK] });
    makeActor({ type: "goon", name: "Thug", effects: [KICK] });
    const instance = new EPtimePanel();
    const data = { ...(await context(instance)), canControl: true };

    const html = await foundry.applications.handlebars.renderTemplate("systems/eclipsephase/templates/apps/time-panel.hbs", data);

    expect(html).toContain("ep2e.time.sectionPlayers");
    expect(html).toContain("ep2e.time.sectionThreats");
    expect(html).toContain("Hex");
    expect(html).toContain("Thug");
  });

  test("a section with nothing running is left out", async () => {
    makeActor({ type: "goon", name: "Thug", effects: [KICK] });

    const { sections } = await context(new EPtimePanel());

    expect(sections.map(section => section.label)).toEqual(["ep2e.time.sectionThreats"]);
  });
});

describe("refreshing the panel", () => {
  test("waits a tick, so a world actor's change has reached its unlinked tokens, and renders once", async () => {
    const instance = EPtimePanel.instance;
    let renders = 0;
    instance.rendered = true;
    instance.render = async () => { renders++; return instance; };

    EPtimePanel.refresh();
    EPtimePanel.refresh();
    expect(renders).toEqual(0);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(renders).toEqual(1);
  });
});
