import { registerSlot, resetRegistry } from "../../module/api/registry.js";
import { resetWorld } from "../setup/factories.js";

const SHEET_SLOTS = {
  "actor.statusSummary": "systems/eclipsephase/templates/actor/partials/currentStatus/statusSummary.html",
  "actor.gearTab.footer": "systems/eclipsephase/templates/actor/partials/tabs/gear-tab.html",
  "actor.gmInfo.rezLedger": "systems/eclipsephase/templates/actor/partials/tabs/gm-info-tab.html",
  "actor.headerBadges": "systems/eclipsephase/templates/actor/partials/headerblock.html"
};

/**
 * A render context complete enough for the sheet partials to render without throwing.
 * @returns {Object} The context
 */
function sheetContext() {
  return {
    actor: {
      type: "character",
      name: "Slot Tester",
      img: "",
      system: {
        homebrew: false,
        currentStatus: { specialModifiers: [], statusPresent: false },
        rezPoints: { value: 0, spent: 0, ledger: [] },
        additionalSystems: { hasGear: true, hasAmmo: true },
        physical: {},
        mental: {},
        health: { physical: {}, mental: {}, death: {}, insanity: {} }
      }
    },
    config: {}
  };
}

describe("sheet slots", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); });

  for (const [name, template] of Object.entries(SHEET_SLOTS)) {
    test(`${name} renders a registered fragment`, async () => {
      Handlebars.registerPartial("spike-fragment.html", "<span>SPIKE-MARKER</span>");
      registerSlot(name, { template: "spike-fragment.html" });

      const html = await foundry.applications.handlebars.renderTemplate(template, sheetContext());

      expect(html).toContain("SPIKE-MARKER");
      Handlebars.unregisterPartial("spike-fragment.html");
    });

    test(`${name} renders nothing while no fragment is registered`, async () => {
      const html = await foundry.applications.handlebars.renderTemplate(template, sheetContext());
      expect(html).not.toContain("SPIKE-MARKER");
    });
  }

  test("two fragments in one slot render in their given order", async () => {
    Handlebars.registerPartial("spike-first.html", "<i>FIRST</i>");
    Handlebars.registerPartial("spike-second.html", "<i>SECOND</i>");
    registerSlot("actor.headerBadges", { template: "spike-second.html", order: 10 });
    registerSlot("actor.headerBadges", { template: "spike-first.html", order: 1 });

    const html = await foundry.applications.handlebars.renderTemplate(SHEET_SLOTS["actor.headerBadges"], sheetContext());

    expect(html.indexOf("FIRST")).toBeLessThan(html.indexOf("SECOND"));
    Handlebars.unregisterPartial("spike-first.html");
    Handlebars.unregisterPartial("spike-second.html");
  });

  test("a fragment can read the actor from the render context", async () => {
    Handlebars.registerPartial("spike-context.html", "<b>{{actor.name}}</b>");
    registerSlot("actor.headerBadges", { template: "spike-context.html" });

    const html = await foundry.applications.handlebars.renderTemplate(SHEET_SLOTS["actor.headerBadges"], sheetContext());

    expect(html).toContain("<b>Slot Tester</b>");
    Handlebars.unregisterPartial("spike-context.html");
  });

  test("a fragment whose visibility check says no is left out", async () => {
    Handlebars.registerPartial("spike-hidden.html", "<span>SPIKE-MARKER</span>");
    registerSlot("actor.headerBadges", { template: "spike-hidden.html", when: context => context.actor?.type === "npc" });

    const html = await foundry.applications.handlebars.renderTemplate(SHEET_SLOTS["actor.headerBadges"], sheetContext());

    expect(html).not.toContain("SPIKE-MARKER");
    Handlebars.unregisterPartial("spike-hidden.html");
  });
});
