import { RollCheck, rollToChat, TaskRoll, TaskRollModifier, rollCalc } from "../rolls/dice.js";
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
import {
  bodyBindingKey,
  bodyHasWareMarker,
  chainHasWareMarker,
  bodyNervousSystem,
  sleevedNervousSystem,
  CYBERBRAIN_MARKER
} from "../common/body-markers.js";

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
 * The full game.eclipsephase.api surface, grouped by area.
 * @since 2.5
 */
export const api = { rolls, actors, ui, chat };
