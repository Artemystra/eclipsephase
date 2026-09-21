import { preparePsi } from "../../module/rolls/psi.js";
import { resetStrainFamilies, registerCoreStrainFamilies } from "../../module/rolls/strain-families.js";
import { makeActor, resetWorld, seedRolls } from "../setup/factories.js";

/**
 * A stand-in for a clicked Infection Test button on a chat card.
 * @param {Object} dataset - The button's data attributes
 * @param {String} [messageId] - The id of the message the button sits in
 * @returns {Object} An object shaped like the click data the handler receives
 */
function clickOn(dataset, messageId) {
  return {
    currentTarget: {
      dataset,
      closest: selector => (selector === "[data-message-id]" && messageId ? { dataset: { messageId } } : null)
    }
  };
}

/**
 * A Psi character able to roll an Infection Test, with the originating card already in the log.
 * @param {String} rollMode - The visibility the original roll was made with
 * @returns {Promise<Object>} The actor and the id of the origin message
 */
async function setUpInfectionTest(rollMode) {
  const actor = makeActor({
    type: "character",
    name: "Sleight User",
    system: {
      subStrain: { label: "architect", byArchetype: { architect: Object.fromEntries([2, 3, 4, 5, 6].map(n => [`influence${n}`, { label: "none", description: "none" }])) } },
      activeMorph: "morph1",
      psiStrain: { infection: 90 },
      aptitudes: { wil: { value: 15 }, cog: { value: 15 }, int: { value: 15 }, sav: { value: 15 }, som: { value: 15 }, ref: { value: 15 } }
    },
    items: [
      { _id: "morph1", name: "Body", type: "morph", system: { type: "bio" } },
      { _id: "sleight1", name: "Sleight", type: "aspect", system: { strainFamily: "psi", psiType: "chi" } }
    ]
  });

  const message = await ChatMessage.create({
    flags: { eclipsephase: { roll: { actorUuid: actor.uuid, userId: game.user._id, messageId: null, options: { push: false, rollMode } } } }
  });
  return { actor, messageId: message.id };
}

/**
 * The whisper list of the last chat message created.
 * @returns {String[]} The recipients
 */
function lastWhisper() {
  return global.__ep.createdMessages.at(-1)?.whisper ?? [];
}

beforeEach(() => {
  resetWorld();
  resetStrainFamilies();
  registerCoreStrainFamilies();
  seedRolls([1, 3]);
});

describe("the Infection Test inherits the visibility of the roll that triggered it", () => {
  test("a private roll stays private, reaching the GM and the roller", async () => {
    const { messageId } = await setUpInfectionTest("gmroll");

    await preparePsi(clickOn({}, messageId));

    expect(lastWhisper()).toContain(game.user._id);
    expect(lastWhisper().length).toBeGreaterThan(0);
  });

  test("a public roll stays public, whispered to nobody", async () => {
    const { messageId } = await setUpInfectionTest("public");

    await preparePsi(clickOn({}, messageId));

    expect(lastWhisper()).toEqual([]);
  });

  test("a blind roll stays blind", async () => {
    const { messageId } = await setUpInfectionTest("blindroll");

    await preparePsi(clickOn({}, messageId));

    expect(global.__ep.createdMessages.at(-1)?.blind).toBe(true);
  });
});

describe("an Infection Test whose actor is gone", () => {
  test("it gives up quietly instead of failing inside the roll", async () => {
    const { actor, messageId } = await setUpInfectionTest("public");
    game.actors.delete(actor.id);
    global.__ep.uuidRegistry.delete(actor.uuid);
    const before = global.__ep.createdMessages.length;

    await expect(preparePsi(clickOn({}, messageId))).resolves.toBeUndefined();

    expect(global.__ep.createdMessages.length).toEqual(before);
  });
});
