import { JSDOM } from "jsdom";
import { needsSkillSetup, applySkillPicks, pickSpecialSkills, postWareSetupCard, setupFromCard, wareAwaitingSetup } from "../../module/common/ware-skills.js";
import { wareRollOptions } from "../../module/rolls/modifiers.js";
import { makeActor, resetWorld, seedDialogs } from "../setup/factories.js";

const { createdMessages } = global.__ep;
const MICRO = { id: "micro", label: "ep2e.item.ware.rollOptions.microManipulation", value: 10, appliesTo: [], specialSkill: "hardware", specialSkills: [] };

/**
 * A character sleeved in morph1 with Fractal Digits and the given special skills.
 * @param {String[]} skills - Special skill names
 * @returns {Actor} The prepared actor
 */
function tinkerer(skills = ["HW: Robotics", "Pilot: Air"]) {
  return makeActor({
    type: "character",
    system: { activeMorph: "morph1" },
    items: [
      { _id: "morph1", name: "Morph", type: "morph", system: { type: "bio" } },
      { _id: "fd1", name: "Fractal Digits", type: "ware", system: { boundTo: "morph1", rollOptions: [MICRO] } },
      ...skills.map((name, index) => ({ _id: `sk${index}`, name, type: "specialSkill", system: {} }))
    ]
  });
}

let realDocument;
beforeEach(() => {
  resetWorld();
  realDocument = global.document;
  global.document = new JSDOM("").window.document;
});

afterEach(() => {
  global.document = realDocument;
  jest.restoreAllMocks();
});

describe("saying which special skills a ware's bonus is for", () => {
  test("ware with a special-skill bonus waits for the choice until it is made once", async () => {
    const actor = tinkerer();
    const ware = actor.items.get("fd1");

    expect(needsSkillSetup(ware)).toBe(true);
    await applySkillPicks(ware, { micro: ["HW: Robotics"] });
    expect(needsSkillSetup(ware)).toBe(false);
  });

  test("the picked special skills are the ones the bonus is offered on", async () => {
    const actor = tinkerer();
    seedDialogs({ picks: { micro: ["HW: Robotics"] } });

    expect(await pickSpecialSkills(actor, actor.items.get("fd1"))).toBe(true);
    expect(wareRollOptions(actor, { key: "HW: Robotics" }).map(entry => entry.field)).toEqual(["wareOption-fd1-micro"]);
    expect(wareRollOptions(actor, { key: "Pilot: Air" })).toEqual([]);
  });

  test("every checkbox has its own label, so clicking the name ticks it", async () => {
    const actor = tinkerer();
    let content = null;
    jest.spyOn(foundry.applications.api.DialogV2, "wait").mockImplementation(async options => {
      content = options.content;
      return { cancelled: true };
    });

    await pickSpecialSkills(actor, actor.items.get("fd1"));

    const boxes = Array.from(content.querySelectorAll("input[type=checkbox]"));
    expect(boxes).toHaveLength(2);
    expect(boxes.every(box => box.id && content.querySelector(`label[for="${box.id}"]`))).toBe(true);
  });

  test("cancelling keeps nothing, so the ware still waits", async () => {
    const actor = tinkerer();
    seedDialogs({ cancelled: true });

    expect(await pickSpecialSkills(actor, actor.items.get("fd1"))).toBe(false);
    expect(needsSkillSetup(actor.items.get("fd1"))).toBe(true);
  });

  test("a character without special skills is not asked, and the ware is marked so it does not nag", async () => {
    const actor = tinkerer([]);
    const wait = jest.spyOn(foundry.applications.api.DialogV2, "wait");

    expect(await pickSpecialSkills(actor, actor.items.get("fd1"))).toBe(true);
    expect(wait).not.toHaveBeenCalled();
    expect(needsSkillSetup(actor.items.get("fd1"))).toBe(false);
  });
});

describe("the setup card after the migration", () => {
  test("lists a button per waiting ware, and says all is done once the last one is set", async () => {
    const actor = tinkerer();
    actor.testUserPermission = () => true;
    const card = await postWareSetupCard(game.user);
    const before = card.content;
    seedDialogs({ picks: { micro: ["HW: Robotics"] } });

    await setupFromCard(actor.uuid, "fd1");

    expect(before).toContain("wareSkillSetup");
    expect(card.content).not.toContain("wareSkillSetup");
    expect(card.content).toContain("ep2e.chat.wareSetup.done");
  });

  test("nothing waiting, nothing posted", async () => {
    const actor = tinkerer();
    actor.testUserPermission = () => true;
    await applySkillPicks(actor.items.get("fd1"), {});

    expect(wareAwaitingSetup(actor)).toEqual([]);
    expect(await postWareSetupCard(game.user)).toBeNull();
    expect(createdMessages).toEqual([]);
  });
});
