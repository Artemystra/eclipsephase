import { attackArmorUsed, defaultArmorUsed } from "../../module/common/weapon-functions.js";
import { makeItem, resetWorld } from "../setup/factories.js";

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
