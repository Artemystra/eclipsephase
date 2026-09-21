import { confirmation } from "./general-sheet-functions.js";
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

async function findTrait(trait) {
  const pack = game.packs.get(trait.pack);
  if (!pack) return null;
  const index = await pack.getIndex();
  const entry = index.find(i => i.name === trait.name);
  return entry ? fromUuid(entry.uuid) : null;
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

  const tier1Owned = traits[1] && ownedTrait(traits[1].name);
  const tier2Owned = traits[2] && ownedTrait(traits[2].name);
  const tier = requiredTier(itemData.system?.psiType);
  if (tier2Owned || (tier === 1 && tier1Owned)) return true;

  const targetTrait = traits[tier];
  if (!targetTrait) return true;
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
