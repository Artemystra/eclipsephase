import { JSDOM } from "jsdom";
import { eclipsephase } from "../../module/config.js";
import { multiSelectPills } from "../../module/common/general-sheet-functions.js";
import { makeItem, resetWorld } from "../setup/factories.js";

const SHEETS = {
  rangedWeapon: "systems/eclipsephase/templates/item/item-rangedWeapon-sheet.hbs",
  ccWeapon: "systems/eclipsephase/templates/item/item-ccWeapon-sheet.hbs"
};

/**
 * Renders a weapon's real sheet template.
 * @param {Item} item - The weapon
 * @returns {Promise<Element>} The rendered form
 */
async function renderSheet(item) {
  const html = await foundry.applications.handlebars.renderTemplate(SHEETS[item.type], {
    item,
    config: eclipsephase,
    tabGroups: { primary: "details" },
    cssClass: "",
    editable: true
  });
  return new JSDOM(html).window.document.querySelector("form");
}

beforeEach(() => resetWorld());

describe("a weapon's sheet", () => {
  test("a ranged weapon has its fields under labels, on the mode's own paths", async () => {
    const form = await renderSheet(makeItem({ type: "rangedWeapon", system: { additionalMode: true } }));
    const mode1 = form.querySelector('[data-tab="details"].tab');
    const mode2 = form.querySelector('[data-tab="details2"].tab');

    for (const field of ["d10", "d6", "bonus", "armorused", "range", "firingMode", "name"]) {
      expect(mode1.querySelector(`[name="system.mode1.${field}"]`)).not.toBeNull();
      expect(mode2.querySelector(`[name="system.mode2.${field}"]`)).not.toBeNull();
    }
    expect(mode1.querySelector('[name="system.mode1.range"]').closest(".ep-field").querySelector(".resource-label")).not.toBeNull();
    expect(mode1.querySelector('[name="system.ammoMax"]')).not.toBeNull();
    expect(mode1.querySelector('[name="system.cost"]')).not.toBeNull();
    expect(mode2.querySelector('[name="system.cost"]')).toBeNull();
  });

  test("a melee weapon has neither range, firing mode nor ammunition", async () => {
    const form = await renderSheet(makeItem({ type: "ccWeapon" }));

    expect(form.querySelector('[name="system.mode1.d10"]')).not.toBeNull();
    for (const name of ["system.mode1.range", "system.mode1.firingMode", "system.ammoMax", "system.ammoType"]) {
      expect(form.querySelector(`[name="${name}"]`)).toBeNull();
    }
  });

  test("without a second mode the tabs offer to add one, with one they offer to remove it", async () => {
    const single = await renderSheet(makeItem({ type: "rangedWeapon" }));
    const double = await renderSheet(makeItem({ type: "rangedWeapon", system: { additionalMode: true } }));

    expect(single.querySelector('nav [data-tab="details2"]')).toBeNull();
    expect(single.querySelector('nav a.ep-mode-add.toggleItem[data-path="system.additionalMode"]')).not.toBeNull();
    expect(double.querySelector('nav [data-tab="details2"] .toggleItem[data-path="system.additionalMode"]')).not.toBeNull();
    expect(double.querySelector("nav .ep-mode-add")).toBeNull();
  });
});

describe("a weapon's traits as a combobox", () => {
  /**
   * The rendered trait widget of a weapon's first mode, wired as the sheet wires it.
   * @param {Object} traits - Values merged into the mode's traits
   * @returns {Promise<Object>} item, widget and update (a spy on the item's update)
   */
  async function traitWidget(traits = {}) {
    const item = makeItem({ type: "rangedWeapon", system: { mode1: { traits } } });
    const form = await renderSheet(item);
    const update = jest.spyOn(item, "update").mockResolvedValue(item);
    multiSelectPills(form, item);
    return { item, update, widget: form.querySelector('[data-tab="details"].tab .multiselect-widget[data-path="system.mode1.traits"]') };
  }

  test("a trait is a pill when on and a suggestion when off, never both", async () => {
    const { widget } = await traitWidget({ armorPiercing: { value: true } });

    expect(widget.querySelector('.multiselect-pill-remove[data-key="armorPiercing"]')).not.toBeNull();
    expect(widget.querySelector('.multiselect-option[data-key="armorPiercing"]')).toBeNull();
    expect(widget.querySelectorAll(".multiselect-option").length).toBeGreaterThan(0);
  });

  test("a trait's own value is edited in its pill, on the mode's path", async () => {
    const { widget } = await traitWidget({ multiShot: { value: true, number: 3 } });
    const number = widget.querySelector('.multiselect-pill input[name="system.mode1.traits.multiShot.number"]');

    expect(number.value).toEqual("3");
  });

  test("picking a suggestion switches the trait on, removing a pill switches it off", async () => {
    const { widget, update } = await traitWidget({ armorPiercing: { value: true } });
    const option = widget.querySelector(".multiselect-option");
    const key = option.dataset.key;
    const click = element => element.dispatchEvent(new element.ownerDocument.defaultView.MouseEvent("click", { bubbles: true }));

    click(option);
    expect(update).toHaveBeenLastCalledWith({ [`system.mode1.traits.${key}.value`]: true });

    click(widget.querySelector(".multiselect-pill-remove"));
    expect(update).toHaveBeenLastCalledWith({ "system.mode1.traits.armorPiercing.value": false });
  });

  test("Enter takes the only match, and adds nothing for text that matches none or several", async () => {
    const { widget, update } = await traitWidget();
    const input = widget.querySelector(".multiselect-input");
    const view = input.ownerDocument.defaultView;
    const type = text => {
      input.value = text;
      input.dispatchEvent(new view.Event("input"));
      input.dispatchEvent(new view.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    };
    const first = widget.querySelector(".multiselect-option");

    type("no such trait");
    type("");
    expect(update).not.toHaveBeenCalled();

    type(first.dataset.value);
    expect(update).toHaveBeenCalledWith({ [`system.mode1.traits.${first.dataset.key}.value`]: true });
  });
});
