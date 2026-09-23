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
  readRollContext,
  transferItemBetweenActors,
  tempEffectCreation,
  tempEffectDeletion
} from "../common/general-sheet-functions.js";
import { requestGMItemTransfer, slideToggleVisibility } from "../common/general-helper-functions.js";
import { epCreateProgressDialog, forEachActor, forEachItem, postNotice } from "../common/migration.js";
import {
  bodyBindingKey,
  bodyHasWareMarker,
  chainHasWareMarker,
  bodyNervousSystem,
  sleevedNervousSystem,
  CYBERBRAIN_MARKER
} from "../common/body-markers.js";
import { getBodyBindingInfo, resolveBodyForItem, applyStandardEnhancements, applyFrame } from "../common/morp-functions.js";
import {
  registerRollSource,
  registerPoolOption,
  registerSlot,
  registerRezSpendOptions,
  registerTaskResultText
} from "./registry.js";
import { registerStrainFamily, getStrainFamily, listStrainFamilies, hasStrainFamily } from "../rolls/strain-families.js";

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
  getBodyBindingInfo,
  resolveBodyForItem,
  applyStandardEnhancements,
  applyFrame,
  transferItemBetweenActors,
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
  slideToggleVisibility
};

/**
 * Reads the roll context a chat card carries in its message flags.
 * @since 2.5
 */
export const chat = {
  readRollContext
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
 * The full game.eclipsephase.api surface, grouped by area.
 * @since 2.5
 */
export const api = { rolls, actors, ui, chat, migration, registry };
