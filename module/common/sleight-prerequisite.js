import { confirmation, findCompendiumItem } from "./general-sheet-functions.js";
import { getStrainFamily, listStrainFamilies } from "../rolls/strain-families.js";

function requiredTier(psiType) {
  return psiType === "chi" ? 1 : 2;
}

// The tier traits of one family, by tier, as plain names.
export function tierTraitNames(family) {
  const traits = getStrainFamily(family).tierTraits;
  return Object.fromEntries(Object.entries(traits).map(([tier, trait]) => [tier, trait.name]));
}

// Every registered family other than the given one.
function otherFamilies(family) {
  return listStrainFamilies().filter(entry => entry.id !== family);
}

/**
 * The tier trait a sleight needs and the actor lacks - Psi I for a chi sleight, Psi II for a gamma
 * one; an actor with the higher tier needs nothing.
 * @param {Actor} actor - The actor
 * @param {Object} itemData - The sleight's data
 * @returns {Object|null} trait ({name, pack}) and the tier-1 trait the actor owns, or null when none is needed
 */
export function neededTierTrait(actor, itemData) {
  const traits = getStrainFamily(itemData.system?.strainFamily ?? "psi").tierTraits;
  const ownedTrait = (name) => actor.items.find(i => i.type === "traits" && i.name === name);
  const tier1Owned = traits[1] && ownedTrait(traits[1].name);
  const tier2Owned = traits[2] && ownedTrait(traits[2].name);
  const tier = requiredTier(itemData.system?.psiType);
  if (tier2Owned || (tier === 1 && tier1Owned)) return null;
  return traits[tier] ? { trait: traits[tier], tier1Owned: tier1Owned ?? null } : null;
}

/**
 * Whether the actor carries a tier trait of a strain family other than the given one - Ki for a
 * psi sleight.
 * @param {Actor} actor - The actor
 * @param {String} family - The sleight's strain family
 * @returns {Boolean} True when a trait of another family is owned
 */
export function ownsOtherFamily(actor, family = "psi") {
  return otherFamilies(family)
    .flatMap(entry => Object.values(entry.tierTraits))
    .some(trait => actor.items.find(i => i.type === "traits" && i.name === trait.name));
}

/**
 * The compendium document of a tier trait.
 * @param {Object} trait - {name, pack}
 * @returns {Promise<Item|null>} The trait, or null when the compendium lacks it
 */
export function findTrait(trait) {
  return findCompendiumItem(trait.pack, trait.name);
}

/**
 * Prompts to add or upgrade the prerequisite Psi/Ki trait for a sleight being dropped onto an
 * actor. Blocks the drop if the actor already carries a trait from the opposite family.
 * @param {Actor} actor
 * @param {Object} itemData
 * @returns {Promise<boolean>} false if the drop should be cancelled, true otherwise
 */
export async function checkSleightPrerequisite(actor, itemData) {
  const family = itemData.system?.strainFamily ?? "psi";
  const traits = getStrainFamily(family).tierTraits;

  const ownedTrait = (name) => actor.items.find(i => i.type === "traits" && i.name === name);
  const hasOpposite = otherFamilies(family)
    .flatMap(entry => Object.values(entry.tierTraits))
    .some(trait => ownedTrait(trait.name));
  if (hasOpposite) {
    await confirmation(
      game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded"),
      game.i18n.localize("ep2e.psi.popUp.prerequisiteConflictHeadline"),
      "ep2e.psi.popUp.prerequisiteConflictCopy",
      undefined,
      "",
      "ep2e.actorSheet.button.confirm",
      true
    );
    return false;
  }

  const needed = neededTierTrait(actor, itemData);
  if (!needed) return true;
  const { trait: targetTrait, tier1Owned } = needed;
  const targetName = targetTrait.name;
  const { confirm } = await confirmation(
    game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded"),
    game.i18n.localize("ep2e.psi.popUp.prerequisiteHeadline"),
    tier1Owned ? "ep2e.psi.popUp.prerequisiteUpgradeCopy" : "ep2e.psi.popUp.prerequisiteAddCopy",
    undefined,
    "",
    "ep2e.actorSheet.button.confirm",
    false,
    false,
    "ep2e.psi.popUp.prerequisiteBoxLabel",
    targetName
  );
  if (!confirm) return true;

  const traitDoc = await findTrait(targetTrait);
  if (!traitDoc) {
    ui.notifications.warn(game.i18n.format("ep2e.psi.popUp.prerequisiteMissing", { trait: targetName }));
    return true;
  }

  await actor.createEmbeddedDocuments("Item", [traitDoc.toObject()]);
  if (tier1Owned) await actor.deleteEmbeddedDocuments("Item", [tier1Owned.id]);
  return true;
}
