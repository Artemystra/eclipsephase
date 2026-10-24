import { RollCheck, isHit } from "./dice.js";
import { postCard, ownersAndGMs, CARD_TEMPLATE } from "../common/general-sheet-functions.js";
import { relayToActiveGM } from "../common/general-helper-functions.js";

// A check asked for on a chat card: the card carries a button, the owner rolls from it - spending
// pool if they like - and once the roll lands the outcome is settled, then settled again should a
// pool spend turn it around. Drugs' checks on taking, toxin filters and addiction all run this way;
// each brings only what the check is for and what its outcome does. Modelled on pools.js, where a
// chat button likewise carries the roll on.

/**
 * Posts a check card for the owners of an actor and every GM.
 * @param {Actor} actor - Who makes the check
 * @param {String} key - The flag the card keeps its request under
 * @param {Object} options - card ({icon, color, headline, rows}), button ({action, label}) and
 *   payload, what the check needs once rolled
 * @returns {Promise<ChatMessage>} The card
 */
export function postCheckCard(actor, key, { card, button, payload = {} }) {
  return postCard(actor, { ...card, button, actorUuid: actor.uuid },
    { eclipsephase: { [key]: { actorUuid: actor.uuid, card, rolled: false, ...payload } } }, ownersAndGMs(actor));
}

/**
 * Turns a check card into a record once it is rolled: the button gives way to a note. Done where
 * the card may be changed; a player rolling from someone else's card asks the active GM.
 * @param {ChatMessage} message - The card
 * @param {String} key - The flag the card keeps its request under
 * @param {String} relayAction - The socket action the GM marks it under
 * @returns {Promise<void>} Resolves once marked or asked
 */
export async function markCardRolled(message, key, relayAction) {
  const request = message?.getFlag?.("eclipsephase", key);
  if (!request) return;
  if (!message.isOwner && !game.user.isGM) {
    relayToActiveGM(relayAction, { messageId: message.id }, { warn: false });
    return;
  }
  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, { ...request.card, footnote: game.i18n.localize("ep2e.chat.dose.checkRolled") });
  await message.update({ content, [`flags.eclipsephase.${key}.rolled`]: true });
}

/**
 * Rolls an aptitude check through the roll pipeline, carrying what it is for on the roll.
 * @param {Actor} actor - Who rolls
 * @param {String} aptitude - The aptitude key, e.g. "wil"
 * @param {Object} contextFlags - What the roll carries to postRoll and to a later pool spend
 * @param {Object} [systemOptions] - Passed on to RollCheck; tests answer the dialog through it
 * @returns {Promise<*>} Whatever the roll returned
 */
export function rollAptitudeCheck(actor, aptitude, contextFlags, systemOptions = {}) {
  const dataset = {
    type: "skill",
    name: game.i18n.localize(actor.system.aptitudes?.[aptitude]?.name ?? aptitude.toUpperCase()),
    key: `system.aptitudes.${aptitude}.value`,
    apttype: aptitude,
    rollvalue: actor.system.aptitudes?.[aptitude]?.roll ?? 0,
    contextFlags
  };
  return RollCheck(dataset, actor.system, actor, systemOptions, null, "skill");
}

/**
 * Settles a check's outcome from the roll pipeline: once when the roll lands, and again when a
 * pool spend changes its result.
 * @param {String} key - The roll flag the check travels under
 * @param {Function} settle - settle(payload, passed, { byPool, message, context }); message is the
 *   roll's chat card
 * @returns {void}
 */
export function settleOnRoll(key, settle) {
  Hooks.on("eclipsephase.postRoll", async context => {
    const payload = context?.flags?.[key];
    if (payload) await settle(payload, isHit(context.outputData?.alternatives?.originalResult), { byPool: false, message: context.message, context });
  });
  Hooks.on("eclipsephase.poolResult", async ({ context, newResult }) => {
    const payload = context?.[key];
    if (payload) await settle(payload, isHit(newResult), { byPool: true, message: game.messages.get(context.messageId), context });
  });
}

/**
 * Adds a check's own modifiers to its roll.
 * @param {String} key - The roll flag the check travels under
 * @param {Function} modifiersOf - modifiersOf(payload) returning modifiers for RollCheck
 * @returns {void}
 */
export function modifiersOnRoll(key, modifiersOf) {
  Hooks.on("eclipsephase.preRoll", context => {
    const payload = context?.flags?.[key];
    if (payload) context.modifiers.push(...(modifiersOf(payload) ?? []).filter(Boolean));
  });
}
