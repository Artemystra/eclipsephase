import { RollCheck, TaskRollModifier, TASK_RESULT } from "../rolls/dice.js";
import { postDrugCard, DOSE_CARD, rollDrugHarm } from "./doses.js";
import { diceFormula } from "./general-sheet-functions.js";

// Some drugs call for a check the moment they take hold (Core p.330-335): Inhibitor's WIL -20,
// Flight's WIL against panic, the SOM or WIL against incapacitation of Twitch, Nervex and
// Neuropath. The check is offered on a card, rolled by whoever owns the actor - so they can
// spend pool on it - and its outcome is applied by the system.

const HITS = [TASK_RESULT.SUCCESS, TASK_RESULT.SUCCESS_ONE, TASK_RESULT.SUCCESS_TWO, TASK_RESULT.CRITICAL_SUCCESS, TASK_RESULT.AUTOSUCCESS];
const INCAPACITATED_KEY = "incapacitated";

// The conditions a failed check can leave, each shown with a core status icon on the token.
const CONDITIONS = {
  incapacitated: { status: "paralysis", img: "icons/svg/paralysis.svg", nameKey: "ep2e.chat.dose.incapacitatedEffect", outcomeKey: "ep2e.chat.dose.outcomeIncapacitated" },
  immobilized: { status: "restrain", img: "icons/svg/net.svg", nameKey: "ep2e.chat.dose.immobilizedEffect", outcomeKey: "ep2e.chat.dose.outcomeImmobilized" }
};

/**
 * The check as a card names it, e.g. "WIL Check (-20)".
 * @param {Object} useCheck - The drug's check
 * @returns {String} The label
 */
function checkLabel(useCheck) {
  const modifier = Number(useCheck.modifier) || 0;
  const shown = modifier ? ` (${modifier > 0 ? "+" : ""}${modifier})` : "";
  return game.i18n.format("ep2e.chat.dose.checkLabel", { aptitude: String(useCheck.aptitude).toUpperCase() }) + shown;
}

/**
 * The harm a failed check does and how much, for the roll card to carry: stress to the mind or
 * damage to the body, both rolled from the check's single dice field.
 * @param {Object} useCheck - The drug's check
 * @returns {Object} harm ("stress", "damage" or null) and formula
 */
function harmOf(useCheck) {
  const formula = diceFormula(useCheck?.stress);
  const harm = ["stress", "damage"].includes(useCheck?.failure) && formula ? useCheck.failure : null;
  return { harm, formula: harm ? formula : "" };
}

/**
 * Whether a drug calls for a check when it takes hold.
 * @param {Object} useCheck - The drug's check, as the dose carries it
 * @returns {Boolean} True when there is an aptitude to roll against
 */
export function needsUseCheck(useCheck) {
  return !!useCheck?.aptitude;
}

/**
 * Posts the card asking for a dose's check, for the owners of the actor it is on.
 * @param {Actor} actor - The actor the dose took hold on
 * @param {ActiveEffect} effect - The running dose
 * @returns {Promise<ChatMessage|null>} The card, or null when the drug calls for no check
 */
export async function postUseCheckCard(actor, effect) {
  const dose = effect?.getFlag?.("eclipsephase", "dose");
  if (!needsUseCheck(dose?.useCheck)) return null;
  const label = checkLabel(dose.useCheck);
  const card = {
    icon: "fa-syringe",
    color: "--negative",
    headline: game.i18n.format("ep2e.chat.dose.checkNeeded", { name: dose.name, check: label })
  };
  return postDrugCard(actor, {
    ...card,
    button: { action: "rollDoseCheck", label: game.i18n.format("ep2e.chat.dose.rollCheck", { check: label }) },
    actorUuid: actor.uuid
  }, { eclipsephase: { doseCheck: { actorUuid: actor.uuid, effectId: effect.id, card } } }, ownersAndGMs(actor));
}

/**
 * The users who may see a card only an actor's owners act on: its owners and every GM.
 * @param {Actor} actor - The actor
 * @returns {String[]} User ids
 */
function ownersAndGMs(actor) {
  return game.users.filter(user => user.isGM || actor.testUserPermission?.(user, "OWNER")).map(user => user.id);
}

/**
 * Turns a check card into a record once its check is rolled: the button gives way to a note.
 * Done where the card may be changed; anyone else asks the active GM.
 * @param {ChatMessage} message - The check card
 * @returns {Promise<void>} Resolves once marked or asked
 */
export async function markCheckCardRolled(message) {
  const request = message?.getFlag?.("eclipsephase", "doseCheck");
  if (!request) return;
  if (!message.isOwner && !game.user.isGM) {
    if (game.users.activeGM) game.socket.emit("system.eclipsephase", { action: "markDoseCheckRolled", messageId: message.id });
    return;
  }
  const footnote = game.i18n.localize("ep2e.chat.dose.checkRolled");
  const content = await foundry.applications.handlebars.renderTemplate(DOSE_CARD, { ...request.card, footnote });
  await message.update({ content });
}

/**
 * Rolls a dose's check on the clicking client, which owns the actor. The check carries what it is
 * for, so its outcome can be applied once the roll lands - and undone or redone if a pool spend
 * turns it around. A check already rolled for this dose is not rolled again.
 * @param {String} messageId - The check card's id
 * @param {Object} [systemOptions] - Passed on to RollCheck; tests answer the dialog through it
 * @returns {Promise<*>} Whatever the roll returned, or null when nothing was rolled
 */
export async function requestUseCheck(messageId, systemOptions = {}) {
  const request = game.messages.get(messageId)?.getFlag?.("eclipsephase", "doseCheck");
  const actor = request ? await fromUuid(request.actorUuid) : null;
  const effect = Array.from(actor?.effects ?? []).find(entry => entry.id === request?.effectId);
  const dose = effect?.getFlag?.("eclipsephase", "dose");
  if (!dose) return null;
  if (dose.checkOutcome) {
    ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.doseCheckRolled"));
    return null;
  }

  await markCheckCardRolled(game.messages.get(messageId));
  const aptitude = dose.useCheck.aptitude;
  const dataset = {
    type: "skill",
    name: game.i18n.localize(actor.system.aptitudes?.[aptitude]?.name ?? aptitude.toUpperCase()),
    key: `system.aptitudes.${aptitude}.value`,
    apttype: aptitude,
    rollvalue: actor.system.aptitudes?.[aptitude]?.roll ?? 0,
    contextFlags: { doseCheck: { actorUuid: actor.uuid, effectId: effect.id, name: dose.name, modifier: Number(dose.useCheck.modifier) || 0, ...harmOf(dose.useCheck) } }
  };
  return RollCheck(dataset, actor.system, actor, systemOptions, null, "skill");
}

/**
 * The running dose a check was rolled for, and its actor.
 * @param {Object} check - The doseCheck the roll carried
 * @returns {Promise<Object>} actor, effect and dose; each null when gone
 */
async function checkedDose(check) {
  const actor = check ? await fromUuid(check.actorUuid) : null;
  const effect = Array.from(actor?.effects ?? []).find(entry => entry.id === check?.effectId) ?? null;
  return { actor, effect, dose: effect?.getFlag?.("eclipsephase", "dose") ?? null };
}

/**
 * The condition a dose leaves: an effect showing its status on the token - Paralyzed for
 * incapacitated, Restrained for immobilized - running for the given span or, without one, for as
 * long as the dose does. Removed together with the dose. Its icon always shows: Foundry would hide
 * it on a condition without a span of its own.
 * @param {String} drugName - The drug's name, for the condition's own name
 * @param {ActiveEffect} effect - The running dose
 * @param {String} key - The CONDITIONS key
 * @param {Object} [span] - {value, units}; none means as long as the dose
 * @returns {Object} The ActiveEffect data
 */
export function conditionData(drugName, effect, key, span) {
  const condition = CONDITIONS[key] ?? CONDITIONS.incapacitated;
  const timed = Number.isFinite(span?.value) && span.value > 0 && !!span.units;
  return {
    name: game.i18n.format(condition.nameKey, { name: drugName }),
    img: condition.img,
    statuses: [condition.status],
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    duration: timed ? { value: span.value, units: span.units, expiry: null } : { value: null, expiry: null },
    start: ActiveEffect.getEffectStart(),
    flags: { eclipsephase: { effectKey: INCAPACITATED_KEY, incapacitatedBy: effect.id } }
  };
}

/**
 * Applies what a failed check costs.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The running dose
 * @param {Object} dose - Its flag
 * @returns {Promise<void>} Resolves once applied
 */
async function applyFailure(actor, effect, dose) {
  const failure = dose.useCheck.failure;
  if (CONDITIONS[failure]) {
    await actor.createEmbeddedDocuments("ActiveEffect", [conditionData(dose.name, effect, failure, dose.useCheck.duration)]);
    await postOutcomeCard(actor, CONDITIONS[failure].outcomeKey, dose.name);
  }
  else if (failure === "blocksPsi") {
    await effect.update({ "flags.eclipsephase.dose.blocksPsi": true, "flags.eclipsephase.dose.psiPenalty": 0 });
    await postOutcomeCard(actor, "ep2e.chat.dose.outcomePsiBlocked", dose.name);
  }
}

/**
 * Applies what a passed check still costs - Inhibitor's -30 to Psi Tests.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The running dose
 * @param {Object} dose - Its flag
 * @returns {Promise<void>} Resolves once applied
 */
async function applySuccess(actor, effect, dose) {
  const penalty = Number(dose.useCheck.successPsiPenalty) || 0;
  if (!penalty) return;
  await effect.update({ "flags.eclipsephase.dose.blocksPsi": false, "flags.eclipsephase.dose.psiPenalty": penalty });
}

/**
 * Takes back what a failed check cost, when a pool spend turns it into a pass. A panic's stress is
 * the player's to roll from its card and is not undone here.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The running dose
 * @returns {Promise<void>} Resolves once undone
 */
async function undoFailure(actor, effect) {
  const incapacitations = Array.from(actor.effects).filter(entry => entry.getFlag?.("eclipsephase", "incapacitatedBy") === effect.id);
  if (incapacitations.length) await actor.deleteEmbeddedDocuments("ActiveEffect", incapacitations.map(entry => entry.id));
  await effect.update({ "flags.eclipsephase.dose.blocksPsi": false });
}

/**
 * Settles a check's outcome on the dose, once: the first result, or a pool spend that turns a
 * failure into a pass.
 * @param {Object} check - The doseCheck the roll carried
 * @param {Boolean} passed - Whether the check now passes
 * @returns {Promise<String|null>} "passed" or "failed", or null when nothing changed
 */
export async function settleUseCheck(check, passed) {
  const { actor, effect, dose } = await checkedDose(check);
  if (!dose) return null;
  const outcome = passed ? "passed" : "failed";
  if (dose.checkOutcome === outcome || dose.checkOutcome === "passed") return null;

  if (dose.checkOutcome === "failed" && passed) await undoFailure(actor, effect);
  await effect.update({ "flags.eclipsephase.dose.checkOutcome": outcome });
  const current = effect.getFlag("eclipsephase", "dose");
  if (passed) await applySuccess(actor, effect, current);
  else await applyFailure(actor, effect, current);
  return outcome;
}

/**
 * A short card stating what a failed check did.
 * @param {Actor} actor - The actor
 * @param {String} key - The localization key of the outcome
 * @param {String} name - The drug's name
 * @returns {Promise<ChatMessage>} The card
 */
function postOutcomeCard(actor, key, name) {
  return postDrugCard(actor, { icon: "fa-syringe", color: "--negative", headline: game.i18n.format(key, { name }) });
}

/**
 * Rolls the harm a failed check does - Flight's stress, or a drug's damage - once per check card.
 * The card is marked first, so a second click or a pool spend afterwards cannot roll it again.
 * @param {ChatMessage} message - The check's roll card
 * @returns {Promise<Number|null>} What was taken, or null when nothing was rolled
 */
export async function rollDoseHarm(message) {
  const check = message?.getFlag?.("eclipsephase", "roll")?.doseCheck;
  if (!check?.harm || message.getFlag("eclipsephase", "doseHarm")?.rolled) return null;
  const actor = await fromUuid(check.actorUuid);
  if (!actor) return null;

  await message.update({ "flags.eclipsephase.doseHarm.rolled": true });
  const copy = game.i18n.format(check.harm === "damage" ? "ep2e.chat.dose.damageFlavor" : "ep2e.chat.dose.panicFlavor", { name: check.name });
  return rollDrugHarm(actor, { formula: check.formula, target: check.harm === "damage" ? "physical" : "mental", copy });
}

/**
 * Answers a click on a check card's harm button: rolled at once where the card may be changed,
 * otherwise sent to the active GM.
 * @param {String} messageId - The check's roll card
 * @returns {Promise<void>} Resolves once rolled or sent
 */
export async function requestDoseHarm(messageId) {
  const message = game.messages.get(messageId);
  if (!message) return;
  if (message.isOwner || game.user.isGM) {
    await rollDoseHarm(message);
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.doseNeedsGM"));
    return;
  }
  game.socket.emit("system.eclipsephase", { action: "rollDoseHarm", messageId });
}

/**
 * Hangs the checks on the roll pipeline: the drug's own modifier lands on the check, the result
 * settles the outcome, and a pool spend that turns the check around settles it again. Also ends an
 * incapacitation when the dose behind it goes.
 * @returns {void}
 */
export function registerUseCheckHooks() {
  Hooks.on("eclipsephase.preRoll", context => {
    const check = context?.flags?.doseCheck;
    if (check?.modifier) context.modifiers.push(new TaskRollModifier(check.name, check.modifier));
  });
  Hooks.on("eclipsephase.postRoll", async context => {
    const check = context?.flags?.doseCheck;
    if (!check) return;
    const passed = HITS.includes(context.outputData?.alternatives?.originalResult);
    await settleUseCheck(check, passed);
    if (!passed && check.harm && !context.outputData?.alternatives?.options?.available) await rollDoseHarm(context.message);
  });
  Hooks.on("eclipsephase.poolResult", async ({ context, newResult }) => {
    if (!context?.doseCheck) return;
    if (HITS.includes(newResult)) {
      await settleUseCheck(context.doseCheck, true);
      await game.messages.get(context.messageId)?.update?.({ "flags.eclipsephase.doseHarm.rolled": true });
    }
    else if (context.doseCheck.harm) await rollDoseHarm(game.messages.get(context.messageId));
  });
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user.id || effect.getFlag?.("eclipsephase", "dose") === undefined) return;
    const actor = effect.parent;
    const left = Array.from(actor?.effects ?? []).filter(entry => entry.getFlag?.("eclipsephase", "incapacitatedBy") === effect.id);
    if (left.length) actor.deleteEmbeddedDocuments("ActiveEffect", left.map(entry => entry.id));
  });
}

