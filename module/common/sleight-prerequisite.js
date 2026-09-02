import { confirmation } from "./general-sheet-functions.js";

const TIER_TRAIT_NAMES = {
  psi: { 1: "Psi I", 2: "Psi II" },
  ki: { 1: "Ki I", 2: "Ki II" }
};

function requiredTier(psiType) {
  return psiType === "chi" ? 1 : 2;
}

async function findTraitByName(name) {
  const pack = game.packs.get("eclipsephase.traits");
  const index = await pack.getIndex();
  const entry = index.find(i => i.name === name);
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
  const opposite = family === "psi" ? "ki" : "psi";
  const traitNames = TIER_TRAIT_NAMES[family];
  const oppositeTraitNames = TIER_TRAIT_NAMES[opposite];

  const ownedTrait = (name) => actor.items.find(i => i.type === "traits" && i.name === name);
  const hasOpposite = ownedTrait(oppositeTraitNames[1]) || ownedTrait(oppositeTraitNames[2]);
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

  const tier1Owned = ownedTrait(traitNames[1]);
  const tier2Owned = ownedTrait(traitNames[2]);
  const tier = requiredTier(itemData.system?.psiType);
  if (tier2Owned || (tier === 1 && tier1Owned)) return true;

  const targetName = traitNames[tier];
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

  const traitDoc = await findTraitByName(targetName);
  if (!traitDoc) {
    ui.notifications.warn(game.i18n.format("ep2e.psi.popUp.prerequisiteMissing", { trait: targetName }));
    return true;
  }

  await actor.createEmbeddedDocuments("Item", [traitDoc.toObject()]);
  if (tier1Owned) await actor.deleteEmbeddedDocuments("Item", [tier1Owned.id]);
  return true;
}
