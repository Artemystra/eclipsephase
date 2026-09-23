import { rollPsiEffect } from "../../module/rolls/psi.js";
import { resetStrainFamilies, registerCoreStrainFamilies } from "../../module/rolls/strain-families.js";
import { resetRegistry } from "../../module/api/registry.js";
import { makeActor, resetWorld, seedRolls } from "../setup/factories.js";

const PSI_ARCHETYPES = ["architect", "beast", "haunter", "stranger", "xenomorph"];
const RESULTS = [1, 2, 3, 4, 5, 6];
const PSI_LABELS = ["restrictedBehaviour", "enhancedBehaviour", "none"];

/**
 * The influence choices one archetype carries. Every slot gets the same label so a single case can
 * pin how that label is resolved per archetype and per result.
 * @param {String} label - What the player picked in the label column
 * @param {String} description - What the player picked in the description column
 * @returns {Object} The influence fields
 */
function influenceSlots(label, description) {
  return Object.fromEntries(RESULTS.map(n => [`influence${n}`, { label, description }]));
}

/**
 * A Psi sleight user, sleeved so the roll is never blocked.
 * @param {Object} options - archetype, and the stored label/description
 * @returns {Object} The prepared actor
 */
function makeStrainUser({ archetype, label = "none", description = "none" }) {
  const family = "psi";
  const slots = influenceSlots(label, description);
  const system = {
    subStrain: { label: archetype, byArchetype: { [archetype]: slots } },
    strainInfluence: slots,
    activeMorph: "morph1",
    psiStrain: { infection: 90 },
    aptitudes: { wil: { value: 15 }, cog: { value: 15 }, int: { value: 15 }, sav: { value: 15 }, som: { value: 15 }, ref: { value: 15 } }
  };
  const items = [
    { _id: "morph1", name: "Body", type: "morph", system: { type: "bio" } },
    { _id: "sleight1", name: "Sleight", type: "aspect", system: { strainFamily: family, psiType: "chi" } }
  ];
  return makeActor({ type: "character", name: "Strain User", system, items });
}

/**
 * Runs one Infection Test to the influence card and reports what that card was given.
 * @param {Object} actor - The sleight user
 * @param {Number} result - The influence d6 result to force
 * @returns {Promise<Object>} The label, copy and rule the card received
 */
async function influenceCardFor(actor, result) {
  const captured = [];
  const realRender = foundry.applications.handlebars.renderTemplate;
  foundry.applications.handlebars.renderTemplate = async (template, data = {}) => {
    if (String(template).includes("psi-influence")) captured.push(data);
    return realRender(template, data);
  };
  seedRolls([1, result]);
  try {
    await rollPsiEffect(actor, game.user._id, false, {}, null, "public");
  } finally {
    foundry.applications.handlebars.renderTemplate = realRender;
  }
  const card = captured.at(-1) ?? {};
  return { label: card.influenceLabel ?? null, copy: card.influenceCopy ?? null, rule: card.influenceRule ?? null };
}

beforeEach(() => {
  resetWorld();
  resetRegistry();
  resetStrainFamilies();
  registerCoreStrainFamilies();
});

describe("what the Psi influence card says", () => {
  for (const archetype of PSI_ARCHETYPES) {
    for (const label of PSI_LABELS) {
      test(`${archetype} with ${label} across every result`, async () => {
        const rows = {};
        for (const result of RESULTS) {
          const actor = makeStrainUser({ archetype, label, description: "none" });
          rows[result] = await influenceCardFor(actor, result);
        }
        expect(rows).toMatchSnapshot();
      });
    }
  }

  test("a custom virus reads its own influence table", async () => {
    const rows = {};
    for (const result of RESULTS) {
      const actor = makeStrainUser({ archetype: "custom", label: "restrictedBehaviour", description: "none" });
      rows[result] = await influenceCardFor(actor, result);
    }
    expect(rows).toMatchSnapshot();
  });
});
