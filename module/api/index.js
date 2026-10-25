import { RollCheck, rollToChat, TaskRoll, TaskRollModifier, rollCalc } from "../rolls/dice.js";
import { usePoolFromChat } from "../rolls/pools.js";
import { applySuccessTierBonus } from "../rolls/damage.js";
import {
  prepareRecipients,
  gmList,
  inheritChatVisibility,
  damageValueCalc,
  confirmation,
  selectBody,
  moreInfo,
  systemMessage,
  addWindowControls,
  addDragSupport,
  addMinimizeSupport,
  registerCommonHandlers,
  itemTypeFilterPills,
  selectFromSearchableList,
  selectedTokenActor,
  pickActorFromList,
  readRollContext,
  transferItemBetweenActors,
  tempEffectCreation,
  tempEffectDeletion,
  mergeOrCreateItem
} from "../common/general-sheet-functions.js";
import { needsVectorChoice, drugVector, isAmmoPack, chooseDrugForm } from "../common/drugs.js";
import { requestGMItemTransfer, slideToggleVisibility } from "../common/general-helper-functions.js";
import { epCreateProgressDialog, forEachActor, forEachItem, postNotice } from "../common/migration.js";
import {
  bodyBindingKey,
  bodyHasWareMarker,
  chainHasWareMarker,
  bodyNervousSystem,
  sleevedNervousSystem,
  CYBERBRAIN_MARKER,
  targetKinds,
  getBodyBindingInfo,
  resolveBodyForItem,
  applyStandardEnhancements,
  applyFrame
} from "../common/morp-functions.js";
import {
  registerRollSource,
  registerPoolOption,
  registerSlot,
  registerRezSpendOptions,
  registerTaskResultText,
  registerPayloadSource,
  listPayloadSources
} from "./registry.js";
import { registerStrainFamily, getStrainFamily, listStrainFamilies, hasStrainFamily } from "../rolls/strain-families.js";
import { takeDose, offerDose, forceDose, activeDoseFor, doseSubstrate, doseEffectData, chemicalPayload } from "../common/doses.js";
import { registerAttackEffect, applyTargetedAttack, postDefenceCards, rollDefence, defenceOutcome, followUpVisibility, yieldDefence, unsuitableTarget, blastTargets } from "../rolls/attacks.js";
import { tokenAt, pickTokensOnCanvas, attackerToken, drawTargetMarker, placeArea, areaPolygon, tokensInArea, scatterPoint, wallBetween, createAreaRegion, createShadowedArea, areaSquares, squareShapes, clearAreas } from "../common/targeting.js";
import { chemicalDoses, chooseMunition, needsMunitionChoice, munitionLabel } from "../common/weapon-functions.js";
import { runningDoses, drugBlockingPsi, drugPsiPenalties } from "../rolls/modifiers.js";
import { registerCard, renderCard, updateCard } from "../common/chat-cards.js";

/**
 * The task-roll pipeline: dialog, resolution and chat output.
 * @since 2.5
 */
export const rolls = {
  RollCheck,
  rollToChat,
  TaskRoll,
  TaskRollModifier,
  rollCalc,
  usePoolFromChat,
  prepareRecipients,
  gmList,
  inheritChatVisibility,
  damageValueCalc,
  applySuccessTierBonus
};

/**
 * Body-bound item lookups and cross-actor item transfers.
 * @since 2.5
 */
export const actors = {
  bodyBindingKey,
  bodyHasWareMarker,
  chainHasWareMarker,
  bodyNervousSystem,
  sleevedNervousSystem,
  CYBERBRAIN_MARKER,
  targetKinds,
  getBodyBindingInfo,
  resolveBodyForItem,
  applyStandardEnhancements,
  applyFrame,
  transferItemBetweenActors,
  mergeOrCreateItem,
  chooseMunition,
  needsMunitionChoice,
  munitionLabel,
  requestGMItemTransfer,
  tempEffectCreation,
  tempEffectDeletion
};

/**
 * Shared dialogs and sheet interaction helpers.
 * @since 2.5
 */
export const ui = {
  confirmation,
  selectBody,
  moreInfo,
  systemMessage,
  addWindowControls,
  addDragSupport,
  addMinimizeSupport,
  registerCommonHandlers,
  itemTypeFilterPills,
  slideToggleVisibility,
  selectFromSearchableList,
  tokenAt,
  pickTokensOnCanvas,
  attackerToken,
  placeArea,
  areaPolygon,
  tokensInArea,
  scatterPoint,
  wallBetween,
  createAreaRegion,
  createShadowedArea,
  blastTargets,
  areaSquares,
  squareShapes,
  clearAreas,
  drawTargetMarker,
  selectedTokenActor,
  pickActorFromList
};

/**
 * Reads the roll context a chat card carries in its message flags, and changes cards that keep
 * their own state.
 * @since 2.5
 */
export const chat = {
  readRollContext,
  registerCard,
  renderCard,
  updateCard
};

/**
 * Migration helpers a module can run its own data updates through, in the same style the system's
 * own migrations use: a cancellable progress dialog, one document at a time, one broken document
 * isolated from the rest.
 * @since 2.5
 */
export const migration = {
  createProgressDialog: epCreateProgressDialog,
  forEachActor,
  forEachItem,
  postNotice
};

/**
 * Registration functions for a module's own roll sources, pool options, template slots, Rez-spend
 * table and result-text table - the mutating counterpart to the read-only state in `registry`.
 * @since 2.5
 */
export const registry = {
  registerRollSource,
  registerPayloadSource,
  listPayloadSources,
  registerPoolOption,
  registerSlot,
  registerRezSpendOptions,
  registerTaskResultText,
  registerStrainFamily,
  getStrainFamily,
  listStrainFamilies,
  hasStrainFamily
};

/**
 * Taking, giving and forcing a dose of a drug, and reading the doses running on an actor.
 * @since 2.7
 */
export const drugs = {
  takeDose,
  offerDose,
  forceDose,
  activeDoseFor,
  doseSubstrate,
  doseEffectData,
  chemicalPayload,
  chooseDrugForm,
  needsVectorChoice,
  drugVector,
  isAmmoPack,
  runningDoses,
  drugBlockingPsi,
  drugPsiPenalties
};

/**
 * Attacks on targets: picked before the roll or after the hit, each target defending from a card
 * of its own (2.7); follow-up visibility, not resisting and unsuitable targets (2.8).
 * @since 2.7
 */
export const attacks = {
  registerAttackEffect,
  applyTargetedAttack,
  postDefenceCards,
  rollDefence,
  defenceOutcome,
  chemicalDoses,
  followUpVisibility,
  yieldDefence,
  unsuitableTarget
};

/**
 * The full game.eclipsephase.api surface, grouped by area.
 * @since 2.5
 */
export const api = { rolls, actors, ui, chat, migration, registry, drugs, attacks };
