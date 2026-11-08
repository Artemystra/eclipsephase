import fs from "fs";
import path from "path";
import {
  CONDITIONS, conditionStatusEffects, activeConditions, replacedConditions, removeReplacedConditions,
  conditionBlockReason, rollBlockContext, registerConditions, conditionNotes, conditionSkillModifiers
} from "../../module/common/conditions.js";
import { rollBlockReason, resetRegistry } from "../../module/api/registry.js";
import { RollCheck } from "../../module/rolls/dice.js";
import { makeActor, resetWorld, seedRolls, seedDialogs } from "../setup/factories.js";

const EN = JSON.parse(fs.readFileSync(path.join(global.__ep.SYSTEM_ROOT, "lang", "en.json"), "utf8"));

/**
 * An actor under the given conditions, as Foundry reads them from its effects.
 * @param {String[]} statuses - The status ids
 * @returns {Object} The actor
 */
function under(...statuses) {
  const actor = makeActor({ type: "character", name: "Ana" });
  actor.statuses = new Set(statuses);
  return actor;
}

describe("the condition catalogue", () => {
  test("holds the conditions of Core p.226 plus Dead and Invisible, each once and named in English", () => {
    const ids = CONDITIONS.map(entry => entry.id);
    expect(ids).toEqual(["blinded", "confused", "dazed", "deafened", "grappled", "immobilized", "impaired10", "impaired20",
      "impaired30", "incapacitated", "prone", "stunned", "unconscious", "dead", "invisible"]);
    for (const id of ids) {
      expect(EN.ep2e.conditions[id].name).toBeTruthy();
      expect(EN.ep2e.conditions[id].description).toBeTruthy();
    }
  });

  test("becomes status effects that run as the system's temporary effects", () => {
    const blinded = conditionStatusEffects().find(status => status.id === "blinded");
    expect(blinded).toMatchObject({
      name: "ep2e.conditions.blinded.name",
      description: "ep2e.conditions.blinded.description",
      img: "icons/svg/blind.svg",
      flags: { eclipsephase: { effectKey: "condition" } }
    });
  });

  test("replaces Foundry's status list in place and translates the descriptions once languages load", () => {
    resetWorld();
    resetRegistry();
    const list = [{ id: "burning" }, { id: "bless" }];
    global.CONFIG.statusEffects = list;
    global.CONFIG.specialStatusEffects = { BLIND: "blind", DEFEATED: "dead" };

    registerConditions();
    Hooks.callAll("i18nInit");

    expect(global.CONFIG.statusEffects).toBe(list);
    expect(list.map(status => status.id)).toEqual(CONDITIONS.map(entry => entry.id));
    expect(list[0].description).toBe("ep2e.conditions.blinded.description");
    delete global.CONFIG.statusEffects;
    delete global.CONFIG.specialStatusEffects;
  });

  test("makes Blinded the status that blacks out a token's own sight, and keeps Dead as defeated", () => {
    resetWorld();
    resetRegistry();
    global.CONFIG.statusEffects = [];
    global.CONFIG.specialStatusEffects = { BLIND: "blind", DEFEATED: "dead" };

    registerConditions();

    expect(global.CONFIG.specialStatusEffects).toEqual({ BLIND: "blinded", DEFEATED: "dead" });
    expect(CONDITIONS.map(entry => entry.id)).toContain(global.CONFIG.specialStatusEffects.DEFEATED);
    delete global.CONFIG.statusEffects;
    delete global.CONFIG.specialStatusEffects;
  });
});

describe("the conditions an actor is under", () => {
  test("are read from its statuses, a drug's old Paralyzed and Restrained included", () => {
    expect([...activeConditions(under("prone", "paralysis", "restrain", "burning"))]).toEqual(["prone", "incapacitated", "immobilized"]);
  });

  test("allow only one Impaired level at a time", async () => {
    resetWorld();
    expect(replacedConditions("impaired20")).toEqual(["impaired10", "impaired30"]);
    expect(replacedConditions("prone")).toEqual([]);

    const actor = makeActor({ type: "character", name: "Ana", effects: [
      { _id: "low", name: "Impaired (-10)", statuses: ["impaired10"] },
      { _id: "high", name: "Impaired (-30)", statuses: ["impaired30"] },
      { _id: "down", name: "Prone", statuses: ["prone"] }
    ] });
    await removeReplacedConditions(actor, "impaired30");

    expect(actor.effects.map(effect => effect.id)).toEqual(["high", "down"]);
  });
});

describe("tests a condition refuses", () => {
  test("Incapacitated and Unconscious refuse every test, a defence and Fray included", () => {
    for (const id of ["incapacitated", "unconscious"]) {
      const actor = under(id);
      expect(conditionBlockReason(actor, "guns")).toContain(`ep2e.conditions.${id}.name`);
      expect(conditionBlockReason(actor, "fray")).toContain("ep2e.conditions.blocked");
      expect(conditionBlockReason(actor, "melee", { defence: true })).toContain("ep2e.conditions.blocked");
    }
  });

  test("a drug's Paralyzed refuses like Incapacitated", () => {
    expect(conditionBlockReason(under("paralysis"), "guns")).toContain("ep2e.conditions.incapacitated.name");
  });

  test("Dazed leaves only a defence and Fray", () => {
    const actor = under("dazed");
    expect(conditionBlockReason(actor, "guns")).toContain("ep2e.conditions.blockedDefenceOnly");
    expect(conditionBlockReason(actor, "fray")).toBeNull();
    expect(conditionBlockReason(actor, "melee", { defence: true })).toBeNull();
  });

  test("a check a card asked for stays open under any condition", () => {
    expect(conditionBlockReason(under("unconscious"), "system.aptitudes.int.value", { check: true })).toBeNull();
  });

  test("other conditions refuse nothing", () => {
    expect(conditionBlockReason(under("prone", "stunned", "grappled", "impaired30"), "guns", { scope: "body" })).toBeNull();
  });

  test("a roll's flags say whether it answers an attack or a card, and its pool whether it is physical", () => {
    expect(rollBlockContext({ contextFlags: { attackDefence: {} }, pooltype: "Vigor" })).toEqual({ defence: true, check: false, scope: "body" });
    expect(rollBlockContext({ contextFlags: { doseCheck: {} }, apttype: "wil" })).toEqual({ defence: false, check: true, scope: "mind" });
    expect(rollBlockContext({ name: "Guns" }, "rangedWeapon")).toEqual({ defence: false, check: false, scope: "body" });
  });

  test("Immobilized refuses physical actions, Fray included, and leaves mental ones and card checks", () => {
    const actor = under("immobilized");
    expect(conditionBlockReason(actor, "infiltrate", { scope: "body" })).toContain("ep2e.conditions.blockedPhysical");
    expect(conditionBlockReason(actor, "fray")).toContain("ep2e.conditions.immobilized.name");
    expect(conditionBlockReason(actor, "melee", { defence: true, scope: "body" })).toContain("ep2e.conditions.blockedPhysical");
    expect(conditionBlockReason(actor, "system.aptitudes.wil.value", { defence: true, scope: "mind" })).toBeNull();
    expect(conditionBlockReason(actor, "interface", { scope: "mind" })).toBeNull();
    expect(conditionBlockReason(actor, "system.aptitudes.som.value", { check: true, scope: "body" })).toBeNull();
  });
});

describe("a refused test in the roll pipeline", () => {
  beforeEach(() => {
    resetWorld();
    resetRegistry();
    global.CONFIG.statusEffects = [];
    global.CONFIG.specialStatusEffects = {};
    registerConditions();
  });
  afterEach(() => {
    delete global.CONFIG.statusEffects;
    delete global.CONFIG.specialStatusEffects;
  });

  const dataset = overrides => ({ name: "Infiltrate", key: "infiltrate", type: "skill", rollvalue: 55, pooltype: "Vigor", ...overrides });

  test("an Incapacitated actor rolls nothing and gets a toast naming the condition", async () => {
    const actor = under("incapacitated");
    seedDialogs({ rollMode: "public", usePool: "", globalMod: 0 });
    seedRolls([42]);

    await RollCheck(dataset(), actor.system, actor, { askForOptions: false, optionsSettings: false }, null, "skill");

    expect(global.__ep.createdMessages).toHaveLength(0);
    expect(global.__ep.notifications.warn[0]).toContain("ep2e.conditions.incapacitated.name");
  });

  test("a check a card asked for is rolled all the same", async () => {
    const actor = under("incapacitated");
    seedDialogs({ rollMode: "public", usePool: "", globalMod: 0 });
    seedRolls([42]);

    await RollCheck(dataset({ contextFlags: { doseCheck: {} } }), actor.system, actor, { askForOptions: false, optionsSettings: false }, null, "skill");

    expect(global.__ep.notifications.warn).toHaveLength(0);
    expect(global.__ep.createdMessages.length).toBeGreaterThan(0);
  });

  test("the registry hands the roll's context on to every check", () => {
    expect(rollBlockReason(under("dazed"), "melee", { defence: true })).toBeNull();
    expect(rollBlockReason(under("dazed"), "melee")).toContain("ep2e.conditions.dazed.name");
  });
});

describe("what a condition does beyond the sums", () => {
  test("every condition that reaches only some tests has a note, lit while the actor is under it", () => {
    const notes = conditionNotes(under("deafened", "stunned", "prone"));
    expect(notes.map(note => [note.id, note.active])).toEqual([["blinded", false], ["deafened", true], ["grappled", false], ["prone", true]]);
    expect(notes[1].img).toBe("icons/svg/deaf.svg");
    expect(notes[1].text).toContain("ep2e.conditions.noteText");
    expect(notes[1].text).toContain("ep2e.conditions.notes.deafened");
    expect(notes[1].text).not.toContain("ep2e.conditions.notApplied");
    expect(notes[0].text).toContain("ep2e.conditions.notApplied");
  });

  test("Deafened costs Perceive alone", () => {
    expect(conditionSkillModifiers(under("deafened"), "perceive")).toEqual([{ label: "ep2e.conditions.deafened.name", modifier: -30 }]);
    expect(conditionSkillModifiers(under("deafened"), "infiltrate")).toEqual([]);
  });

  test("each condition's modifiers are changes Foundry adds to the actor", () => {
    const stunned = conditionStatusEffects().find(status => status.id === "stunned");
    expect(stunned.changes).toEqual([
      { key: "system.mods.physicalMod", value: "-30", priority: null, type: "add" },
      { key: "system.mods.mentalMod", value: "-10", priority: null, type: "add" }
    ]);
    expect(conditionStatusEffects().find(status => status.id === "deafened").changes).toEqual([
      { key: "system.mods.iniMod", value: "-3", priority: null, type: "add" }
    ]);
  });
});
