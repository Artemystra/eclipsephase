import EPactorSheet from "../../module/actor/EPactorSheet.js";
import { makeActor, resetWorld } from "../setup/factories.js";

/**
 * An actor of the given type carrying one drug whose stored active flag is off, the way a drug
 * dropped on an NPC or Goon sheet arrives - those sheets have no toggle to switch it on.
 * @param {String} type - The actor type
 * @returns {Actor} The prepared actor
 */
function carrying(type) {
  return makeActor({
    type,
    system: { activeMorph: "morph1" },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio" } },
      {
        _id: "grin1", name: "Grin", type: "drug",
        system: { active: false, slotType: "consumable", drugType: "biochem", oral: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 3, units: "hours" } }
      }
    ]
  });
}

/**
 * Sorts an actor's items into the sheet's buckets, as the sheet does before every render.
 * @param {Actor} actor - The actor
 * @returns {Promise<Actor>} The actor, carrying the buckets
 */
async function sorted(actor) {
  await EPactorSheet.prototype._prepareCharacterItems.call({ document: actor }, {});
  return actor;
}

beforeEach(() => resetWorld());

describe("drugs on an NPC or Goon", () => {
  test.each(["npc", "goon"])("a %s has its drug at hand without a toggle", type => {
    expect(carrying(type).system.additionalSystems.consumableEquipped).toBe(true);
  });

  test("a character still needs the drug switched on to have it at hand", () => {
    expect(carrying("character").system.additionalSystems.consumableEquipped).toBe(false);
  });

  test.each(["npc", "goon"])("a %s lists the drug where the take control lives", async type => {
    const actor = await sorted(carrying(type));

    expect(actor.consumableActive.map(item => item.name)).toEqual(["Grin"]);
    expect(actor.consumableActive[0].system.canTakeDose).toBe(true);
    expect(actor.consumable.map(item => item.name)).toEqual(["Grin"]);
  });

  test("a character's list still leaves out a drug that is switched off", async () => {
    const actor = await sorted(carrying("character"));

    expect(actor.consumableActive).toEqual([]);
  });
});

describe("the sheet templates", () => {
  test.each(["npc", "goon", "character"])("a %s's sidebar offers the take control for a drug at hand", async type => {
    const actor = carrying(type);
    if (type === "character") await actor.items.get("grin1").update({ "system.active": true });
    await sorted(actor);

    const html = await foundry.applications.handlebars.renderTemplate(
      "systems/eclipsephase/templates/actor/partials/currentStatus/sideCar.html", { actor });

    expect(html).toContain("drug-use");
  });

  test("the NPC gear tab lists consumables with their form", async () => {
    const actor = await sorted(carrying("npc"));

    const html = await foundry.applications.handlebars.renderTemplate(
      "systems/eclipsephase/templates/actor/partials/tabs/npcgear.html", { actor, tabs: { primary: { weapons: { active: true } } } });

    expect(html).toContain("ep2e.inventory.consumablesLabel");
    expect(html).toContain("Grin");
    expect(html).toContain("ep2e.item.drug.table.applicationVectors.oralLabel");
  });
});
