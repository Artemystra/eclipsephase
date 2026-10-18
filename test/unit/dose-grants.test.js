import { takeDose } from "../../module/common/doses.js";
import { grantPackages, folderTree, rowCandidates, resolveGrant, alreadyHas, placeGrant, grantTemporaryItems, registerGrantHooks, RANDOM } from "../../module/common/dose-grants.js";
import { registerCoreStrainFamilies, resetStrainFamilies } from "../../module/rolls/strain-families.js";
import { JSDOM } from "jsdom";
import { makeActor, resetWorld, registerSystemPacks } from "../setup/factories.js";

const TRAITS = "eclipsephase.traits";
const SLEIGHTS = "eclipsephase.psi-sleights";
const ENHANCED_BEHAVIOR_II = "xGMEXPrvbypAfXKI";
const SCHIZOPHRENIA = "VsY65vOoV93wgFbG";
const CHI = "7VpBcB8nysG3tqmh";
const NEGATIVE = "DaSyiLnSD2LzihV0";

/**
 * A grant row as the drug sheet writes it.
 * @param {Object} fields - The fields to set
 * @returns {Object} The row
 */
function row(fields) {
  return { pack: TRAITS, folder: "", item: RANDOM, title: "", description: "", or: false, ...fields };
}

/**
 * A character sleeved in one biomorph, carrying a drug with the given grants.
 * @param {Object[]} grants - The drug's Temporary Traits rows
 * @returns {Actor} The prepared actor
 */
function carrying(grants) {
  return makeActor({
    type: "character",
    system: { activeMorph: "morph1" },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio", dur: 30 } },
      { _id: "drug1", name: "Fokus", type: "drug", system: { active: true, drugType: "biochem", oral: true, quantity: 1, usagesUsed: 0, usagesMax: 5, duration: { value: 12, units: "hours" }, grants } }
    ]
  });
}

/**
 * Takes the drug and returns its dose.
 * @param {Actor} actor - The actor
 * @returns {Promise<ActiveEffect>} The running dose
 */
async function dosed(actor) {
  await takeDose(actor, actor.items.get("drug1"));
  return actor.effects.find(effect => effect.getFlag("eclipsephase", "dose"));
}

/**
 * The items the dose lent the actor.
 * @param {Actor} actor - The actor
 * @param {ActiveEffect} dose - The dose
 * @returns {Item[]} The granted items
 */
function grantedBy(actor, dose) {
  return actor.items.filter(item => item.getFlag("eclipsephase", "grantedBy") === dose.id);
}

beforeEach(() => {
  resetWorld();
  resetStrainFamilies();
  registerCoreStrainFamilies();
  registerSystemPacks();
  game.users.activeGM = { isSelf: false };
  jest.spyOn(ui.notifications, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("packages", () => {
  test("rows are granted together until an OR row starts the next package", () => {
    const rows = [row({ item: "a" }), row({ item: "b" }), row({ item: "c" }), row({ item: "d", or: true }), row({ item: "e" }), row({ item: "f", or: true })];

    expect(grantPackages(rows).map(rows => rows.map(entry => entry.item))).toEqual([["a", "b", "c"], ["d", "e"], ["f"]]);
  });

  test("a row without a compendium does not count, and an OR on the first row starts nothing", () => {
    expect(grantPackages([row({ item: "a", or: true }), row({ pack: "" }), row({ item: "b" })]).map(rows => rows.length)).toEqual([2]);
  });

  test("one package is picked at even odds, and only its rows are granted", async () => {
    const actor = carrying([]);
    const dose = await dosed(actor);
    await dose.update({ "flags.eclipsephase.dose.grants": [row({ item: ENHANCED_BEHAVIOR_II }), row({ item: SCHIZOPHRENIA, or: true })] });

    await grantTemporaryItems(actor, dose, () => 0.75);

    expect(grantedBy(actor, dose).map(item => item.name)).toEqual(["Reiterative Schizophrenia"]);
  });
});

describe("folders and Random", () => {
  test("every folder level is listed, in tree order", async () => {
    const tree = folderTree(game.packs.get(TRAITS).folders);

    expect(tree.find(folder => folder.name === "Mental Disorders")).toMatchObject({ depth: 1 });
    expect(tree.findIndex(folder => folder.name === "Mental Disorders")).toBe(tree.findIndex(folder => folder.id === NEGATIVE) + 1);
  });

  test("Random in a folder draws from it and every folder beneath it", async () => {
    const pack = game.packs.get(TRAITS);
    const reach = rowCandidates(await pack.getIndex(), pack.folders, NEGATIVE).map(entry => entry.name);

    expect(reach).toContain("Enhanced Behavior II");
    expect(reach).toContain("Reiterative Schizophrenia");
  });

  test("Random without a folder draws from the whole compendium", async () => {
    const pack = game.packs.get(SLEIGHTS);
    const whole = rowCandidates(await pack.getIndex(), pack.folders, "");
    const chi = rowCandidates(await pack.getIndex(), pack.folders, CHI);

    expect(whole.length).toBeGreaterThan(chi.length);
    expect(chi.length).toBeGreaterThan(0);
  });

  test("a random row only draws what the actor does not have yet", async () => {
    const pack = game.packs.get(SLEIGHTS);
    const chi = rowCandidates(await pack.getIndex(), pack.folders, CHI);
    const actor = carrying([]);
    await actor.createEmbeddedDocuments("Item", chi.slice(1).map(entry => ({ name: entry.name, type: entry.type, system: {} })));

    const data = await resolveGrant(row({ pack: SLEIGHTS, folder: CHI }), () => 0.99, actor);

    expect(data.name).toBe(chi[0].name);
  });

  test("a random row hands over one of the items in reach", async () => {
    const pack = game.packs.get(SLEIGHTS);
    const chiNames = rowCandidates(await pack.getIndex(), pack.folders, CHI).map(entry => entry.name);

    const data = await resolveGrant(row({ pack: SLEIGHTS, folder: CHI }), () => 0.5);

    expect(chiNames).toContain(data.name);
  });
});

describe("what lands on the sheet", () => {
  test("the GM's additional title stands in brackets after the item's name", async () => {
    const data = await resolveGrant(row({ item: ENHANCED_BEHAVIOR_II, title: "Obsessive" }));

    expect(data.name).toBe("Enhanced Behavior II (Obsessive)");
  });

  test("the GM's prepared text stands above the item's own description", async () => {
    const data = await resolveGrant(row({ item: ENHANCED_BEHAVIOR_II, description: "Obsessive" }));

    expect(data.system.description.startsWith("<p>Obsessive</p>")).toBe(true);
    expect(data.system.description.length).toBeGreaterThan("<p>Obsessive</p>".length);
  });

  test("a trait goes to the sleeved body, even one that could be an ego trait", async () => {
    const actor = carrying([]);
    const data = placeGrant(actor, await resolveGrant(row({ item: ENHANCED_BEHAVIOR_II })));

    expect(data.system).toMatchObject({ ego: false, morph: true, boundTo: "morph1" });
  });

  test("a trait that can only be an ego trait goes to the ego", async () => {
    const actor = carrying([]);
    const data = placeGrant(actor, await resolveGrant(row({ item: SCHIZOPHRENIA })));

    expect(data.system).toMatchObject({ ego: true, morph: false });
  });

  test("an item the actor already has word for word is skipped; one that differs is granted", async () => {
    const actor = carrying([]);
    const plain = await resolveGrant(row({ item: ENHANCED_BEHAVIOR_II }));
    await actor.createEmbeddedDocuments("Item", [plain]);

    expect(alreadyHas(actor, plain)).toBe(true);
    expect(alreadyHas(actor, await resolveGrant(row({ item: ENHANCED_BEHAVIOR_II, description: "Obsessive" })))).toBe(false);
  });
});

describe("psi drugs and the tier they need", () => {
  /**
   * The psi sleights of one folder.
   * @param {String} folder - The folder id
   * @returns {Promise<Object[]>} Index entries
   */
  async function sleights(folder) {
    const pack = game.packs.get(SLEIGHTS);
    return rowCandidates(await pack.getIndex(), pack.folders, folder);
  }

  test("a chi sleight brings Psi I along to someone without psi, and both go with the dose", async () => {
    const actor = carrying([]);
    const dose = await dosed(actor);
    await dose.update({ "flags.eclipsephase.dose.grants": [row({ pack: SLEIGHTS, folder: CHI })] });

    await grantTemporaryItems(actor, dose, () => 0);

    expect(grantedBy(actor, dose).map(item => item.type).sort()).toEqual(["aspect", "traits"]);
    expect(grantedBy(actor, dose).find(item => item.type === "traits").name).toBe("Psi I");
  });

  test("a gamma sleight brings Psi II, even to someone who has Psi I", async () => {
    const actor = carrying([]);
    await actor.createEmbeddedDocuments("Item", [{ name: "Psi I", type: "traits", system: { ego: true } }]);
    const dose = await dosed(actor);
    await dose.update({ "flags.eclipsephase.dose.grants": [row({ pack: SLEIGHTS, folder: "kp6gA22jUj1D588w" })] });

    await grantTemporaryItems(actor, dose, () => 0);

    expect(grantedBy(actor, dose).filter(item => item.type === "traits").map(item => item.name)).toEqual(["Psi II"]);
  });

  test("someone who already has the tier, or a higher one, gets the sleight alone", async () => {
    const actor = carrying([]);
    await actor.createEmbeddedDocuments("Item", [{ name: "Psi II", type: "traits", system: { ego: true } }]);
    const dose = await dosed(actor);
    await dose.update({ "flags.eclipsephase.dose.grants": [row({ pack: SLEIGHTS, folder: CHI })] });

    await grantTemporaryItems(actor, dose, () => 0);

    expect(grantedBy(actor, dose).map(item => item.type)).toEqual(["aspect"]);
  });

  test("two sleights needing the same tier bring it once", async () => {
    const actor = carrying([]);
    const dose = await dosed(actor);
    const [first, second] = await sleights(CHI);
    await dose.update({ "flags.eclipsephase.dose.grants": [row({ pack: SLEIGHTS, item: first._id }), row({ pack: SLEIGHTS, item: second._id })] });

    await grantTemporaryItems(actor, dose, () => 0);

    expect(grantedBy(actor, dose).filter(item => item.type === "traits")).toHaveLength(1);
  });
});

describe("the life of a grant", () => {
  test("the active GM grants as the dose takes hold, and the grant goes when the dose ends", async () => {
    game.users.activeGM = { isSelf: true };
    registerGrantHooks();
    const actor = carrying([row({ item: ENHANCED_BEHAVIOR_II, title: "Obsessive" })]);

    const dose = await dosed(actor);
    for (let wait = 0; wait < 50 && !grantedBy(actor, dose).length; wait++) await new Promise(resolve => setTimeout(resolve, 0));
    const whileRunning = grantedBy(actor, dose).map(item => item.name);
    await actor.deleteEmbeddedDocuments("ActiveEffect", [dose.id]);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(whileRunning).toEqual(["Enhanced Behavior II (Obsessive)"]);
    expect(actor.items.filter(item => item.name.startsWith("Enhanced Behavior II"))).toHaveLength(0);
  });

  test("a renewed dose keeps what it granted and grants nothing more", async () => {
    game.users.activeGM = { isSelf: true };
    registerGrantHooks();
    const actor = carrying([row({ item: ENHANCED_BEHAVIOR_II })]);
    const dose = await dosed(actor);
    for (let wait = 0; wait < 50 && !grantedBy(actor, dose).length; wait++) await new Promise(resolve => setTimeout(resolve, 0));

    await takeDose(actor, actor.items.get("drug1"));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(grantedBy(actor, dose)).toHaveLength(1);
  });
});

describe("editing a row's title and description", () => {
  /**
   * Opens the edit dialog with a DOM to build it in, answering it with the given result.
   * @param {Object} row - The row
   * @param {*} answer - What the dialog returns
   * @returns {Promise<Object>} result and the content the dialog was given
   */
  async function editWith(row, answer) {
    const { default: EPitemSheet } = await import("../../module/item/EPitemSheet.js");
    const realDocument = global.document;
    global.document = new JSDOM("").window.document;
    let content = null;
    jest.spyOn(foundry.applications.api.DialogV2, "wait").mockImplementation(async options => {
      content = options.content;
      return answer;
    });
    try {
      return { result: await EPitemSheet.prototype._editGrantText.call({}, row), content };
    } finally {
      global.document = realDocument;
    }
  }

  test("cancelling saves nothing, even though Foundry answers a cancel with the button's name", async () => {
    expect((await editWith({ title: "Obsessive" }, "cancel")).result).toBeNull();
  });

  test("confirming hands back both texts", async () => {
    expect((await editWith({}, { title: "Violent", description: "" })).result).toEqual({ title: "Violent", description: "" });
  });

  test("the dialog gets its content as an element, so the description keeps its placeholder", async () => {
    const { content } = await editWith({}, { cancelled: true });

    expect(typeof content).not.toBe("string");
    expect(content.querySelector("textarea").getAttribute("placeholder")).toBe("ep2e.item.drug.mechanics.grantDescriptionPlaceholder");
  });
});
