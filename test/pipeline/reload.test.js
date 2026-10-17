import EPactorSheet from "../../module/actor/EPactorSheet.js";
import { reloadWeapon } from "../../module/common/weapon-functions.js";
import { makeActor, resetWorld, seedDialogs, setSetting, loadPackItem } from "../setup/factories.js";

const { createdMessages } = global.__ep;

const NO_TRAITS = { selfReplenishing: { value: false }, specialAmmoDrugs: { value: false }, specialAmmoBugs: { value: false } };

/**
 * A kinetic pistol holding some of its rounds.
 * @param {Object} [system] - Weapon fields to override
 * @returns {Object} The weapon data
 */
function pistol(system = {}) {
  return {
    _id: "gun1", name: "Pistol", type: "rangedWeapon",
    system: { active: true, ammoType: "kinetic", ammoMin: 2, ammoMax: 10, ammoSelected: { id: "" }, mode1: { traits: NO_TRAITS }, ...system }
  };
}

/**
 * A pack of kinetic rounds.
 * @param {String} id - The item id
 * @param {Number} quantity - How many packs the stack holds
 * @returns {Object} The ammo data
 */
function rounds(id, quantity = 3) {
  return { _id: id, name: `Rounds ${id}`, type: "ammo", system: { active: true, type: "kinetic", quantity, dv: { d10: 0, d6: 0, bonus: 0 } } };
}

/**
 * Presses a weapon's reload button, the way the sheet wires it: the items are sorted into the
 * sheet's buckets first, then the click handler runs.
 * @param {Actor} actor - The actor holding the weapon
 * @param {String} weaponId - The weapon's id
 * @returns {Promise<void>} Resolves once the reload has run
 */
async function pressReload(actor, weaponId = "gun1") {
  await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
  let handler = null;
  const html = { querySelectorAll: () => [{ addEventListener: (_, fn) => { handler = fn; } }] };
  await reloadWeapon(html, actor);
  await handler({ preventDefault() {}, currentTarget: { dataset: { weaponid: weaponId } } });
}

beforeEach(() => {
  resetWorld();
  setSetting("eclipsephase", "ammoRules", "default");
});

describe("reloading a weapon", () => {
  test("it fills the magazine from the only fitting pack and says so", async () => {
    const actor = makeActor({ type: "character", items: [pistol(), rounds("ammo1")] });

    await pressReload(actor);

    const gun = actor.items.get("gun1");
    expect(gun.system.ammoMin).toEqual(10);
    expect(gun.system.ammoSelected.id).toEqual("ammo1");
    expect(createdMessages).toHaveLength(1);
    expect(createdMessages[0].content).toContain("ep2e.roll.announce.combat.ranged.reloadedWeapon");
  });

  test("under the default rules the pack is not used up", async () => {
    const actor = makeActor({ type: "character", items: [pistol(), rounds("ammo1", 3)] });

    await pressReload(actor);

    expect(actor.items.get("ammo1").system.quantity).toEqual(3);
  });

  test("with several fitting packs the player picks one, and that one is loaded", async () => {
    const actor = makeActor({ type: "character", items: [pistol(), rounds("ammo1"), rounds("ammo2")] });
    seedDialogs({ selection: "ammo2" });

    await pressReload(actor);

    expect(actor.items.get("gun1").system.ammoSelected.id).toEqual("ammo2");
  });

  test("cancelling the pick leaves the weapon as it was", async () => {
    const actor = makeActor({ type: "character", items: [pistol(), rounds("ammo1"), rounds("ammo2")] });
    seedDialogs({ cancelled: true });

    await pressReload(actor);

    expect(actor.items.get("gun1").system.ammoMin).toEqual(2);
    expect(createdMessages).toHaveLength(0);
  });

  test("a full weapon with the same rounds loaded is left alone, and only the player is told", async () => {
    const actor = makeActor({ type: "character", items: [pistol({ ammoMin: 10, ammoSelected: { id: "ammo1" } }), rounds("ammo1")] });
    setSetting("eclipsephase", "ammoRules", "survival");

    await pressReload(actor);

    expect(actor.items.get("ammo1").system.quantity).toEqual(3);
    expect(createdMessages[0].content).toContain("ep2e.roll.announce.combat.ranged.weaponFull");
    expect(createdMessages[0].whisper).toEqual([game.user.id]);
  });

  test("without fitting ammunition nothing is loaded, and only the player is told", async () => {
    const actor = makeActor({ type: "character", items: [pistol()] });

    await pressReload(actor);

    expect(actor.items.get("gun1").system.ammoMin).toEqual(2);
    expect(createdMessages[0].content).toContain("ep2e.roll.announce.combat.ranged.noAmmoPresent");
    expect(createdMessages[0].whisper).toEqual([game.user.id]);
  });

  test("an NPC's reload card goes to the GMs", async () => {
    const actor = makeActor({ type: "npc", items: [pistol(), rounds("ammo1")] });

    await pressReload(actor);

    expect(Array.isArray(createdMessages[0].whisper)).toBe(true);
    expect(createdMessages[0].whisper).not.toEqual([game.user.id]);
  });
});

describe("the survival ammunition rule", () => {
  beforeEach(() => setSetting("eclipsephase", "ammoRules", "survival"));

  test("a character's reload takes one pack off the stack", async () => {
    const actor = makeActor({ type: "character", items: [pistol(), rounds("ammo1", 3)] });

    await pressReload(actor);

    expect(actor.items.get("ammo1").system.quantity).toEqual(2);
  });

  test("the last pack is taken off the sheet", async () => {
    const actor = makeActor({ type: "character", items: [pistol(), rounds("ammo1", 1)] });

    await pressReload(actor);

    expect(actor.items.get("ammo1")).toBeUndefined();
    expect(actor.items.get("gun1").system.ammoMin).toEqual(10);
  });

  test("an NPC keeps its packs, since NPCs do not count ammunition", async () => {
    const actor = makeActor({ type: "npc", items: [pistol(), rounds("ammo1", 3)] });

    await pressReload(actor);

    expect(actor.items.get("ammo1").system.quantity).toEqual(3);
  });
});

describe("loading a sprayer with a drug", () => {
  /**
   * A character holding the compendium's sprayer and one drug.
   * @param {Object} drug - Drug system fields to override
   * @returns {Actor} The prepared actor
   */
  function sprayerWith(drug) {
    const sprayer = { ...loadPackItem("weapons/Sprayer_VtPETs2TTFaeEec7.json"), _id: "gun1" };
    sprayer.system = { ...sprayer.system, active: true, ammoMin: 0, ammoSelected: { id: "" } };
    return makeActor({
      type: "character",
      items: [sprayer, {
        _id: "drug1", name: "Grin", type: "drug",
        system: { active: true, slotType: "consumable", drugType: "biochem", inhalation: true, quantity: 2, usagesUsed: 0, usagesMax: 5, duration: { value: 3, units: "hours" }, ...drug }
      }]
    });
  }

  test("a sealed pack fills the sprayer, with no damage of its own", async () => {
    const actor = sprayerWith({});

    await pressReload(actor);

    const sprayer = actor.items.get("gun1");
    expect(sprayer.system.ammoMin).toEqual(sprayer.system.ammoMax);
    expect(sprayer.system.ammoSelected.id).toEqual("drug1");
    expect(sprayer.system.ammoSelected.dvModifier).toMatchObject({ d10: 0, d6: 0, bonus: 0 });
  });

  test("under survival rules loading uses up a whole pack, however many doses it held", async () => {
    setSetting("eclipsephase", "ammoRules", "survival");
    const actor = sprayerWith({ quantity: 2 });

    await pressReload(actor);

    expect(actor.items.get("drug1").system.quantity).toEqual(1);
    expect(actor.items.get("drug1").system.usagesUsed).toEqual(0);
  });

  test("an opened pack cannot be loaded", async () => {
    const actor = sprayerWith({ usagesUsed: 1 });

    await pressReload(actor);

    expect(actor.items.get("gun1").system.ammoMin).toEqual(0);
    expect(createdMessages[0].content).toContain("ep2e.roll.announce.combat.ranged.noAmmoPresent");
  });

  test("a drug that is not at hand cannot be loaded", async () => {
    const actor = sprayerWith({ active: false });

    await pressReload(actor);

    expect(actor.items.get("gun1").system.ammoMin).toEqual(0);
  });
});

describe("the grenades-only ammunition rule", () => {
  beforeEach(() => setSetting("eclipsephase", "ammoRules", "grenadesOnly"));

  test("ordinary rounds are not counted", async () => {
    const actor = makeActor({ type: "character", items: [pistol(), rounds("ammo1", 3)] });

    await pressReload(actor);

    expect(actor.items.get("ammo1").system.quantity).toEqual(3);
  });

  test("a drug pack loaded into a sprayer is used up", async () => {
    const sprayer = { ...loadPackItem("weapons/Sprayer_VtPETs2TTFaeEec7.json"), _id: "gun1" };
    sprayer.system = { ...sprayer.system, active: true, ammoMin: 0, ammoSelected: { id: "" } };
    const actor = makeActor({
      type: "character",
      items: [sprayer, {
        _id: "drug1", name: "Grin", type: "drug",
        system: { active: true, slotType: "consumable", drugType: "biochem", inhalation: true, quantity: 2, usagesUsed: 0, usagesMax: 5, duration: { value: 3, units: "hours" } }
      }]
    });

    await pressReload(actor);

    expect(actor.items.get("drug1").system.quantity).toEqual(1);
  });
});
