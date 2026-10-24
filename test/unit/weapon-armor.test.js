import { attackArmorUsed, defaultArmorUsed, parseRangeText, parseRangeArea, parseAreaText, munitionArea, weaponDataRepairs, needsMunitionChoice, sameMunition, munitionLabel, chooseMunition, rangeBand, beyondRangeDamage, rangeRefusal, weaponRange } from "../../module/common/weapon-functions.js";
import { mergeOrCreateItem } from "../../module/common/general-sheet-functions.js";
import { registerPayloadSource, resetRegistry } from "../../module/api/registry.js";
import { makeActor, makeItem, registerSystemPacks, resetWorld } from "../setup/factories.js";

beforeEach(() => resetWorld());

describe("the armour a weapon's damage meets", () => {
  test("a weapon mode that names none shows the default, without storing it", () => {
    const laser = makeItem({ type: "rangedWeapon", system: { ammoType: "beam" } });
    const rifle = makeItem({ type: "rangedWeapon", system: { ammoType: "kinetic" } });
    const knife = makeItem({ type: "ccWeapon" });

    expect([laser.system.mode1.armorused, laser.system.mode2.armorused]).toEqual(["energy", "energy"]);
    expect(rifle.system.mode1.armorused).toBe("kinetic");
    expect(knife.system.mode1.armorused).toBe("kinetic");
    expect(laser._source.system.mode1.armorused).toBe("");
  });

  test("a mode that names one keeps it", () => {
    const freezer = makeItem({ type: "rangedWeapon", system: { ammoType: "spray", mode1: { armorused: "none" } } });

    expect(freezer.system.mode1.armorused).toBe("none");
  });

  test("an attack meets the fired mode's armour", () => {
    const pulsar = makeItem({ type: "rangedWeapon", system: { ammoType: "beam", mode1: { armorused: "energy" }, mode2: { armorused: "none" } } });

    expect(attackArmorUsed(pulsar, "1")).toBe("energy");
    expect(attackArmorUsed(pulsar, "2")).toBe("none");
  });

  test("loaded ammunition that names an armour overrides the mode's", () => {
    const gun = makeItem({ type: "rangedWeapon", system: { ammoType: "kinetic", mode1: { armorused: "kinetic" }, ammoSelected: { armorused: "energy" } } });

    expect(attackArmorUsed(gun, "1")).toBe("energy");
  });

  test("a beam weapon defaults to energy, anything else to kinetic", () => {
    expect(defaultArmorUsed({ type: "rangedWeapon", system: { ammoType: "beam" } })).toBe("energy");
    expect(defaultArmorUsed({ type: "rangedWeapon", system: { ammoType: "rail" } })).toBe("kinetic");
    expect(defaultArmorUsed({ type: "ccWeapon", system: {} })).toBe("kinetic");
  });
});


describe("ranges and areas read from the text older items carry", () => {
  test("every range spelling in the compendiums reads as metres, and what is not a range reads as none", () => {
    expect(["15m", "75m", "100m (AoE 1m)", "80", " 30 m ", "2,5m", 45].map(parseRangeText)).toEqual([15, 75, 100, 80, 30, 2.5, 45]);
    expect(["", null, undefined, "SOM", "LOS", "medium", 0, -5].map(parseRangeText)).toEqual([null, null, null, null, null, null, null, null]);
  });

  test("the area a range text names after AoE is a uniform blast", () => {
    expect(parseRangeArea("100m (AoE 1m)")).toEqual({ kind: "uniform", radius: 1, reduction: null });
    expect(parseRangeArea("100m")).toBeNull();
  });

  test("every area spelling in the compendiums reads as its kind, radius and reduction", () => {
    for (const text of ["Uniform (50 m)", "Uniform (50m)", "Uniform (50)", "uniform(50 m)"]) expect(parseAreaText(text)).toEqual({ kind: "uniform", radius: 50, reduction: null });
    for (const text of ["Centered (-2 DV/m)", "Centered (-2DV/m)", "Centred (–2 DV/m)"]) expect(parseAreaText(text)).toEqual({ kind: "centered", radius: null, reduction: 2 });
    for (const text of ["", "-", null, "HEAP"]) expect(parseAreaText(text).kind).toBe("none");
  });

  test("a bigger munition doubles a uniform radius, and adds a die or doubles the damage of a centred blast", () => {
    const uniform = { kind: "uniform", radius: 10, reduction: null };
    const centered = { kind: "centered", radius: null, reduction: 2 };

    expect(munitionArea({ area: uniform, size: "baseline" })).toMatchObject({ radius: 10, damage: "", damageMultiplier: 1 });
    expect(munitionArea({ area: uniform, size: "standard" })).toMatchObject({ radius: 20, damage: "" });
    expect(munitionArea({ area: uniform, size: "missile" })).toMatchObject({ radius: 20, damageMultiplier: 1 });
    expect(munitionArea({ area: centered, size: "standard" })).toMatchObject({ reduction: 2, damage: "+1d10", damageMultiplier: 1 });
    expect(munitionArea({ area: centered, size: "missile" })).toMatchObject({ damage: "", damageMultiplier: 2 });
    expect(uniform.radius).toBe(10);
  });

  test("an old weapon, ammunition or grenade is repaired, and one that already fits needs nothing", () => {
    expect(weaponDataRepairs("rangedWeapon", { mode1: { range: "100m (AoE 1m)", area: { kind: "none" } }, mode2: { range: "" } })).toEqual({
      "mode1.range": 100, "mode1.area": { kind: "uniform", radius: 1, reduction: null }, "mode2.range": null
    });
    expect(weaponDataRepairs("rangedWeapon", { mode1: { range: 30 }, mode2: { range: null } })).toEqual({});
    expect(weaponDataRepairs("ammo", { areaeffect: "Uniform (10 m)", area: { kind: "none" } })).toEqual({ area: { kind: "uniform", radius: 10, reduction: null } });
    expect(weaponDataRepairs("ammo", { areaeffect: "Uniform (10 m)", area: { kind: "uniform", radius: 5 } })).toEqual({});
    expect(weaponDataRepairs("grenade", { armorused: ["none", "none"], armorUsed: "energy", area: { kind: "centered", reduction: 2 } })).toEqual({ armorused: "energy" });
    expect(weaponDataRepairs("grenade", { armorused: null, area: { kind: "none" } })).toEqual({ armorused: "none" });
    expect(weaponDataRepairs("ammo", { type: "seeker", armorused: null, armorUsed: "energy", area: { kind: "none" } })).toEqual({ armorused: "energy" });
    expect(weaponDataRepairs("ammo", { type: "kinetic", armorused: null, area: { kind: "none" } })).toEqual({});
  });

  test("a weapon or grenade read from old data shows the repaired values, while its stored data stays as it was", () => {
    const rifle = makeItem({ type: "rangedWeapon", system: { mode1: { range: "150m" } } });
    const grenade = makeItem({ type: "grenade", system: { areaeffect: "Centered (-2DV/m)", armorused: ["none", "none"], armorUsed: "kinetic" } });

    expect(rifle.system.mode1.range).toBe(150);
    expect(rifle._source.system.mode1.range).toBe("150m");
    expect(grenade.system.area).toEqual({ kind: "centered", radius: null, reduction: 2 });
    expect(grenade.system.armorused).toBe("kinetic");
  });
});


describe("a munition arriving on a sheet", () => {
  const seeker = (size, payload = {}) => ({ name: "Splash", type: "ammo", system: { type: "seeker", size, payload: { enabled: false, delivery: "contact", loaded: [], ...payload } } });

  /**
   * Answers the next munition dialog and records what it offered.
   * @param {Object|null} answer - What the dialog returns
   * @returns {Object} offered option values and whether a size select was shown, filled once it ran
   */
  function answerDialog(answer) {
    const seen = { options: [], sizeSelect: false };
    jest.spyOn(foundry.applications.api.DialogV2, "wait").mockImplementation(async ({ content }) => {
      seen.options = Array.from(String(content).matchAll(/<option value="([^"]+)">/g), match => match[1]);
      seen.sizeSelect = String(content).includes('name="SizeSelect"');
      return answer;
    });
    return seen;
  }

  beforeEach(() => { resetRegistry(); game.packs.clear(); });
  afterEach(() => jest.restoreAllMocks());

  test("what is still open: a seeker set to select, and a payload switched on without a substance", () => {
    expect(needsMunitionChoice("ammo", seeker("select").system)).toEqual({ size: true, payload: false });
    expect(needsMunitionChoice("ammo", seeker("baseline", { enabled: true }).system)).toEqual({ size: false, payload: true });
    expect(needsMunitionChoice("ammo", seeker("baseline", { enabled: true, loaded: [{ uuid: "x", name: "Grin" }] }).system)).toEqual({ size: false, payload: false });
    expect(needsMunitionChoice("ammo", { type: "kinetic", size: "select" })).toEqual({ size: false, payload: false });
    expect(needsMunitionChoice("grenade", { payload: { enabled: true, loaded: [] } })).toEqual({ size: false, payload: true });
    expect(needsMunitionChoice("drug", { payload: { enabled: true } })).toEqual({ size: false, payload: false });
  });

  test("munitions stack only with the same size and payload; no size counts as the baseline, and a switched-off payload as none", () => {
    const grin = { enabled: true, loaded: [{ uuid: "Compendium.grin", name: "Grin" }] };
    expect(sameMunition({ size: "baseline" }, {})).toBe(true);
    expect(sameMunition({ size: "standard" }, { size: "baseline" })).toBe(false);
    expect(sameMunition({ payload: grin }, { payload: { ...grin, loaded: [{ uuid: "Compendium.mono", name: "Mono" }] } })).toBe(false);
    expect(sameMunition({ payload: { ...grin, enabled: false } }, { payload: { enabled: false, loaded: [] } })).toBe(true);
  });

  test("a row names a seeker's size and the payload it carries", () => {
    expect(munitionLabel("ammo", seeker("standard", { enabled: true, loaded: [{ uuid: "x", name: "Grin" }] }).system)).toBe("ep2e.item.weapon.table.size.standard · Grin");
    expect(munitionLabel("ammo", seeker("select").system)).toBe("");
    expect(munitionLabel("grenade", { payload: { enabled: false, loaded: [{ name: "Grin" }] } })).toBe("");
  });

  test("size and payload are asked in one dialog, which offers only fitting substances and no payload", async () => {
    registerSystemPacks();
    registerPayloadSource("eclipsephase.drugs-and-toxins");
    const dermal = (await game.packs.get("eclipsephase.drugs-and-toxins").getDocuments()).filter(entry => entry.type === "drug" && entry.system.dermal === true && entry.system.drugType !== "electronic");
    const data = seeker("select", { enabled: true });
    const seen = answerDialog({ selection: dermal[0].uuid, size: "standard" });

    expect(await chooseMunition(data)).toBe(true);

    expect(seen.sizeSelect).toBe(true);
    expect(new Set(seen.options)).toEqual(new Set(["baseline", "standard", "missile", "none", ...dermal.map(entry => entry.uuid)]));
    expect(data.system.size).toBe("standard");
    expect(data.system.payload.loaded).toEqual([{ uuid: dermal[0].uuid, name: dermal[0].name }]);
  });

  test("choosing no payload switches it off, cancelling stops the drop, and a munition with nothing open is not asked", async () => {
    const none = seeker("baseline", { enabled: true });
    answerDialog({ selection: "none" });
    expect(await chooseMunition(none)).toBe(true);
    expect(none.system.payload.enabled).toBe(false);

    answerDialog({ cancelled: true });
    expect(await chooseMunition(seeker("select"))).toBe(false);

    jest.restoreAllMocks();
    answerDialog({ selection: "none" });
    expect(await chooseMunition(seeker("baseline"))).toBe(true);
    expect(await chooseMunition({ name: "Knife", type: "ccWeapon", system: {} })).toBe(true);
    expect(foundry.applications.api.DialogV2.wait).not.toHaveBeenCalled();
  });

  test("a sheet keeps munitions with different payloads apart and stacks the same one", async () => {
    const actor = makeActor({ type: "character" });
    const withPayload = name => ({ name: "Capsule (Kinetic)", type: "ammo", system: { type: "kinetic", quantity: 1, payload: { enabled: true, delivery: "inside", loaded: [{ uuid: `Compendium.${name}`, name }] } } });

    await mergeOrCreateItem(actor, withPayload("Grin"));
    await mergeOrCreateItem(actor, withPayload("Grin"));
    await mergeOrCreateItem(actor, withPayload("Mono"));

    expect(actor.items.filter(item => item.type === "ammo").map(item => [item.system.payload.loaded[0].name, item.system.quantity])).toEqual([["Grin", 2], ["Mono", 1]]);
  });
});


describe("the range a weapon is fired at (Core p.207)", () => {
  test("each distance falls into its category, beyond range costing -10 per multiple of the range with no cap", () => {
    const at = (distance, range, traits) => { const band = rangeBand(distance, range, traits); return [band.band, band.modifier, band.select]; };

    expect(at(1, 50)).toEqual(["pointBlank", 10, "pointBlank"]);
    expect(at(2, 50)).toEqual(["pointBlank", 10, "pointBlank"]);
    expect(at(5, 50)).toEqual(["close", 0, "none"]);
    expect(at(30, 50)).toEqual(["range", -10, "range"]);
    expect(at(51, 50)).toEqual(["beyond", -20, "beyond"]);
    expect(at(101, 50)).toEqual(["beyond", -30, "beyond+"]);
    expect(at(200, 50)).toEqual(["beyond", -40, "beyond+"]);
  });

  test("a long weapon gains nothing at point-blank, a short one is beyond range before close ends, and one without a rating never is", () => {
    expect(rangeBand(1, 50, { long: { value: true } }).modifier).toBe(0);
    expect(rangeBand(8, 5)).toMatchObject({ band: "beyond", modifier: -20 });
    expect(rangeBand(500, null)).toMatchObject({ band: "range", modifier: -10 });
  });

  test("kinetic and rail weapons lose a d10 beyond range, unless in vacuum; beams and seekers never do", () => {
    const of = ammoType => ({ system: { ammoType } });

    expect([beyondRangeDamage(of("kinetic"), "beyond", false), beyondRangeDamage(of("rail"), "beyond+", false)]).toEqual(["-1d10", "-1d10"]);
    expect([beyondRangeDamage(of("kinetic"), "beyond", true), beyondRangeDamage(of("kinetic"), "range", false)]).toEqual(["", ""]);
    expect([beyondRangeDamage(of("beam"), "beyond", false), beyondRangeDamage(of("seeker"), "beyond", false)]).toEqual(["", ""]);
  });

  test("a weapon that cannot fire at point-blank or close refuses targets that near", () => {
    expect(rangeRefusal(2, { noPointBlank: { value: true } })).toBe("ep2e.item.weapon.table.trait.noPointBlank");
    expect(rangeRefusal(3, { noPointBlank: { value: true } })).toBeNull();
    expect(rangeRefusal(10, { noClose: { value: true } })).toBe("ep2e.item.weapon.table.trait.noCloseAndPointBlank");
    expect(rangeRefusal(11, { noClose: { value: true } })).toBeNull();
  });

  test("the range rating comes from the mode fired, read as metres", () => {
    const weapon = { system: { mode1: { range: 30 }, mode2: { range: "150m" } } };

    expect([weaponRange({ weapon, weaponMode: "1" }), weaponRange({ weapon, weaponMode: "2" }), weaponRange(null)]).toEqual([30, 150, null]);
  });
});
