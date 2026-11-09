import { JSDOM } from "jsdom";
import { eclipsephase } from "../../module/config.js";
import { inducedChanges } from "../../module/common/general-sheet-functions.js";
import { makeItem, resetWorld } from "../setup/factories.js";

/**
 * Renders an item's real sheet template.
 * @param {Item} item - The item
 * @param {Object} [context] - Further context for the template
 * @returns {Promise<Element>} The rendered form
 */
async function renderSheet(item, context = {}) {
  const html = await foundry.applications.handlebars.renderTemplate(`systems/eclipsephase/templates/item/item-${item.type}-sheet.hbs`, {
    item,
    config: eclipsephase,
    tabGroups: { primary: "details" },
    tabs: { primary: [{ id: "details", label: "details" }, { id: "description", label: "description" }] },
    itemList: {},
    cssClass: "",
    editable: true,
    ...context
  });
  return new JSDOM(html).window.document.querySelector("form");
}

beforeEach(() => resetWorld());

describe("item sheets on the raster", () => {
  const TYPES = ["ammo", "armor", "aspect", "ccWeapon", "drug", "gear", "grenade", "id", "knowSkill", "morph", "program", "rangedWeapon", "specialSkill", "traits", "vehicle", "ware"];

  test.each(TYPES)("%s renders its fields in the grid or a strip, without layout tables", async type => {
    const form = await renderSheet(makeItem({ type }));

    expect(form).not.toBeNull();
    expect(form.querySelector("table")).toBeNull();
    expect(form.querySelector(".ep-sheet-grid, .ep-sheet-strip")).not.toBeNull();
  });

  test("every text and number input selects on focus", async () => {
    for (const type of TYPES) {
      const form = await renderSheet(makeItem({ type, system: { additionalMode: true } }));
      const missing = [...form.querySelectorAll('.item-sheet-body input[type="text"], .item-sheet-body input[type="number"]')]
        .filter(input => !input.hasAttribute("onfocus") && !input.classList.contains("multiselect-input"))
        .map(input => `${type}: ${input.name}`);
      expect(missing).toEqual([]);
    }
  });

  test("a seeker and a grenade share area and payload, a plain round has no area", async () => {
    const grenade = await renderSheet(makeItem({ type: "grenade" }));
    const seeker = await renderSheet(makeItem({ type: "ammo", system: { type: "seeker" } }));
    const round = await renderSheet(makeItem({ type: "ammo", system: { type: "standard" } }));

    for (const form of [grenade, seeker]) {
      expect(form.querySelector('[name="system.area.kind"]')).not.toBeNull();
      expect(form.querySelector('[name="system.payload.enabled"]')).not.toBeNull();
      expect(form.querySelector('.multiselect-widget[data-path="system.traits"]')).not.toBeNull();
    }
    expect(round.querySelector('[name="system.area.kind"]')).toBeNull();
    expect(round.querySelector('[name="system.payload.enabled"]')).not.toBeNull();
    expect(round.querySelector('.multiselect-widget[data-path="system.traits"]')).not.toBeNull();
    expect(seeker.querySelector('[name="system.size"]')).not.toBeNull();
    expect(grenade.querySelector('[name="system.size"]')).toBeNull();
    expect(grenade.querySelector('[name="system.trigger"]')).not.toBeNull();
  });

  test("a munition's trait keeps its own values in its pill", async () => {
    const form = await renderSheet(makeItem({ type: "grenade", system: { traits: { dvOnMiss: { value: true, dv: { d10: 2 } }, knockdown: { value: true, radius: "3m" } } } }));

    expect(form.querySelector('.multiselect-pill [name="system.traits.dvOnMiss.dv.d10"]').value).toEqual("2");
    expect(form.querySelector('.multiselect-pill [name="system.traits.knockdown.radius"]').value).toEqual("3m");
  });

  test("a vehicle's aptitudes sit above the tabs for smart animals only, and its skills have their own tab", async () => {
    const animal = await renderSheet(makeItem({ type: "vehicle", system: { chassisType: "animal", aptitudes: { cog: { label: "COG", value: 5 } } } }));
    const bot = await renderSheet(makeItem({ type: "vehicle", system: { chassisType: "robot" } }));

    expect(animal.querySelector('.item-sheet-body > .ep-vehicle-aptitudes [name="system.aptitudes.cog.value"]')).not.toBeNull();
    expect(bot.querySelector(".ep-vehicle-aptitudes")).toBeNull();
    expect(bot.querySelector('[data-tab="aptitudes"].tab .autoBot')).not.toBeNull();
    expect(animal.querySelector('[data-tab="aptitudes"].tab .autoBot')).toBeNull();
  });

  test("a chi sleight's mechanics show only its changes, a gamma sleight its fields", async () => {
    const chi = await renderSheet(makeItem({ type: "aspect", system: { psiType: "chi" } }), { inducedChanges: ["+10 Perceive"], sleightDamageMode: "none" });
    const gamma = await renderSheet(makeItem({ type: "aspect", system: { psiType: "gamma" } }), { inducedChanges: [], sleightDamageMode: "damage" });

    expect(chi.querySelector(".ep-induced-changes li").textContent).toEqual("+10 Perceive");
    expect(chi.querySelector('[name="system.targetRule"]')).toBeNull();
    expect(gamma.querySelector(".ep-induced-changes")).toBeNull();
    for (const name of ["targetRule", "affects", "repeatPerSuperior", "landingRule", "damage.mode", "damage.d10", "damage.armorUsed"]) {
      expect(gamma.querySelector(`[data-tab="mechanics"].tab [name="system.${name}"]`)).not.toBeNull();
    }
  });
});

describe("induced changes", () => {
  /**
   * The lines for an item with one effect.
   * @param {Object[]} changes - The effect's changes
   * @returns {String[]} The lines
   */
  const lines = changes => inducedChanges({ effects: [{ name: "Blueprint", changes }] });

  test("a change reads as its amount and what it changes", () => {
    expect(lines([{ key: "system.mods.globalMod", value: "-20" }])).toEqual(["-20 ep2e.item.inducedChanges.allActions"]);
    expect(lines([{ key: "system.skillsIns.perceive.mod", value: "+10" }])).toEqual(["+10 ep2e.skills.insightSkills.perceive"]);
    expect(lines([{ key: "system.skillsVig.free fall.chiMod", value: 10 }])).toEqual(["+10 ep2e.skills.vigorSkills.free fall"]);
    expect(lines([{ key: "system.pools.vigor.mod", value: "+1" }])).toEqual(["+1 ep2e.morph.currentMorph.vigorLabel"]);
    expect(lines([{ key: "system.aptitudes.wil.chiMod", value: "+10" }])).toEqual(["+10 ep2e.actorSheet.aptitudes.wil"]);
    expect(lines([{ key: "system.mods.mentalArmorMod", value: "1d6" }])).toEqual(["+1d6 ep2e.item.inducedChanges.mentalArmor"]);
  });

  test("ignoring wounds and trauma counts them, a flag has no amount", () => {
    const format = jest.spyOn(game.i18n, "format").mockImplementation((key, data) => `${key}:${data.count}`);

    expect(lines([{ key: "system.mods.woundMod", value: -1 }])).toEqual(["ep2e.item.inducedChanges.ignoreWounds:1"]);
    expect(lines([{ key: "system.mods.traumaChiMod", value: -2 }])).toEqual(["ep2e.item.inducedChanges.ignoreTrauma:2"]);
    expect(lines([{ key: "system.mods.psiArmor", value: "true" }])).toEqual(["ep2e.item.inducedChanges.psiArmor"]);
    format.mockRestore();
  });

  test("an effect with a change without wording reads as its name, and an item without effects has no lines", () => {
    expect(lines([{ key: "system.mods.globalMod", value: "-10" }, { key: "flags.module.unknown", value: 1 }])).toEqual(["Blueprint"]);
    expect(inducedChanges({ effects: [] })).toEqual([]);
    expect(inducedChanges({})).toEqual([]);
  });
});
