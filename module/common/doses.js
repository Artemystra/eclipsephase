import { drugVector, doseOnset, dosesRemaining, isAmmoPack } from "./drugs.js";
import { durationRunOut } from "./time.js";
import { sleevedNervousSystem, chainHasWareMarker, CYBERBRAIN_MARKER } from "./body-markers.js";
import { consumeDose, gmList } from "./general-sheet-functions.js";
import { RollCheck, TASK_RESULT } from "../rolls/dice.js";

const DOSE_CARD = "systems/eclipsephase/templates/chat/dose.html";
const DOSE_SOCKET = "system.eclipsephase";

// What a drug's type can act on (Core p.330): biochem and nano are substances and need a
// biological body; an electronic drug is software and needs an infomorph or a cyberbrain.
const SUBSTANCE_TYPES = ["biochem", "nano"];

/**
 * Whether a drug can act on the body the ego currently acts through, and why not when it cannot.
 * A drug with no type recorded is not gated, so a homebrew one keeps working. Guards taking only -
 * loading a sprayer is never gated, since the pack is not being used on the loader.
 * @param {Actor} actor - The actor about to take the dose
 * @param {Item} item - The drug
 * @returns {Object} allowed, plus the localization key explaining a refusal
 */
export function doseSubstrate(actor, item) {
  const type = item?.system?.drugType;
  const nervousSystem = sleevedNervousSystem(actor);

  if (type === "electronic") {
    const allowed = nervousSystem === "info" || chainHasWareMarker(actor, CYBERBRAIN_MARKER);
    return { allowed, reasonKey: allowed ? null : "ep2e.actorSheet.warnings.doseNeedsCyberbrain" };
  }

  if (SUBSTANCE_TYPES.includes(type)) {
    const allowed = nervousSystem === "bio";
    return { allowed, reasonKey: allowed ? null : "ep2e.actorSheet.warnings.doseNeedsBiomorph" };
  }

  return { allowed: true, reasonKey: null };
}

/**
 * The changes a drug's own blueprint effects describe, which a dose copies onto the actor. The
 * blueprints themselves never apply from the item.
 * @param {Item} item - The drug
 * @returns {Object[]} Every change, in blueprint order
 */
function blueprintChanges(item) {
  return item.effects.map(effect => effect.changes ?? []).flat();
}

/**
 * The effect one dose of a drug puts on the actor. Modelled on the chi push: an explicit start,
 * expiry on the world clock rather than on a combat turn, no token icon, and the drug's own
 * description so the Time Panel has something to show. A drug with no duration recorded runs until
 * somebody ends it, which is what the book's "Permanent" and "-" mean.
 * @param {Item} item - The drug
 * @returns {Object} The ActiveEffect data
 */
export function doseEffectData(item) {
  const system = item.system;
  const changes = blueprintChanges(item);
  const span = system.duration;
  const timed = Number.isFinite(span?.value) && span.value > 0 && !!span.units;

  return {
    name: item.name,
    img: item.img,
    origin: item.uuid,
    description: system.description ?? "",
    disabled: false,
    transfer: false,
    changes,
    system: { changes },
    duration: timed ? { value: span.value, units: span.units, expiry: null } : { value: null, expiry: null },
    start: ActiveEffect.getEffectStart(),
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER,
    flags: {
      eclipsephase: {
        dose: {
          itemId: item.id,
          name: item.name,
          category: system.category ?? "",
          drugType: system.drugType ?? "",
          vector: drugVector(system)?.key ?? null,
          onset: doseOnset(system),
          wearOff: system.wearOff?.sv ?? "",
          rollOptions: Array.isArray(system.rollOptions) ? system.rollOptions : [],
          blocksPsi: system.blocksPsi === true
        }
      }
    }
  };
}

/**
 * The dose of a drug already running on the actor, if there is one. Keyed on the drug's name, so a
 * pack bought in another form still counts as the same drug - the book does not stack a drug with
 * itself.
 * @param {Actor} actor - The actor to look on
 * @param {String} drugName - The drug's name
 * @returns {ActiveEffect|null} The running dose, or null
 */
export function activeDoseFor(actor, drugName) {
  return actor.effects.find(effect =>
    effect.getFlag?.("eclipsephase", "dose")?.name === drugName && !durationRunOut(effect)) ?? null;
}

/**
 * How long a dose lasts, in words, for the card. A drug with no duration recorded runs until it is
 * ended by hand.
 * @param {Object} span - The drug's {value, units} duration
 * @returns {String} The localized span
 */
function durationLabel(span) {
  const timed = Number.isFinite(span?.value) && span.value > 0 && !!span.units;
  if (!timed) return game.i18n.localize("ep2e.chat.dose.untilEnded");
  return `${span.value} ${game.i18n.localize(`ep2e.item.drug.table.durationUnits.${span.units}`)}`;
}

/**
 * Posts one of the drug cards - a dose taken or a dose worn off - in the shared dose layout: an
 * icon, a headline and an optional box of labelled rows, a row without a label reading as a note.
 * A character's card is public; anyone else's goes to the GMs, as the reload card does.
 * @param {Actor} actor - The actor the card is about
 * @param {Object} card - icon, color (a CSS variable), headline and rows of {label, value}
 * @returns {Promise<void>} Resolves once the card is posted
 */
async function postDrugCard(actor, { icon, color, headline, rows = [] }) {
  const content = await foundry.applications.handlebars.renderTemplate(DOSE_CARD, { icon, color, headline, rows });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    ...(actor.type === "character" ? {} : { whisper: gmList() })
  });
}

/**
 * The rows a dose card lists: the form, how soon it takes hold, how long it lasts and what is left
 * of the pack once this dose is out of it.
 * @param {Object} system - The drug's system data, as it is after the dose was spent
 * @param {Object} outcome - What consumeDose reported
 * @returns {Object[]} label and value per row; a row without a label reads as a note
 */
function doseRows(system, outcome) {
  const vector = drugVector(system);
  const onsetKey = doseOnset(system);
  const form = system.drugType === "electronic"
    ? game.i18n.localize("ep2e.chat.dose.app")
    : (vector ? game.i18n.localize(vector.label) : "-");

  const rows = [{ label: game.i18n.localize("ep2e.chat.dose.form"), value: form }];
  if (onsetKey) rows.push({ label: game.i18n.localize("ep2e.chat.dose.onset"), value: game.i18n.localize(onsetKey) });
  rows.push({ label: game.i18n.localize("ep2e.chat.dose.duration"), value: durationLabel(system.duration) });
  rows.push(outcome.emptied
    ? { label: "", value: game.i18n.localize("ep2e.chat.dose.lastDose") }
    : { label: game.i18n.localize("ep2e.item.drug.dosesLeft"), value: dosesRemaining(system) });
  return rows;
}

/**
 * Posts the card announcing a dose: what was taken, in which form, how soon it takes hold, how
 * long it lasts and what is left of the pack. Posted by the client that took the dose, so it
 * posts once.
 * @param {Actor} actor - The actor who took the dose
 * @param {Item} item - The drug, as it is after the dose was spent
 * @param {Object} outcome - What consumeDose reported
 * @param {Boolean} renewed - Whether the dose restarted a running one rather than starting fresh
 * @returns {Promise<void>} Resolves once the card is posted
 */
async function postDoseCard(actor, item, outcome, renewed) {
  await postDrugCard(actor, {
    icon: "fa-syringe",
    color: "--negative",
    headline: game.i18n.format(renewed ? "ep2e.chat.dose.renewed" : "ep2e.chat.dose.taken", { name: item.name }),
    rows: doseRows(item.system, outcome)
  });
}

/**
 * Posts the card for a dose that stopped acting: worn off on the clock, or ended early by hand
 * while it still had time to run. Names the wear-off stress when the drug records one.
 * @param {Actor} actor - The actor the dose was on
 * @param {ActiveEffect} effect - The dose's effect, as it was when it was removed
 * @returns {Promise<void>} Resolves once the card is posted
 */
export async function postWearOffCard(actor, effect) {
  const dose = effect.getFlag("eclipsephase", "dose");
  const timed = Number.isFinite(effect.duration?.value) && effect.duration.value > 0;
  const endedEarly = timed && !durationRunOut(effect);
  const rows = dose.wearOff ? [{ label: game.i18n.localize("ep2e.chat.dose.wearOffSv"), value: dose.wearOff }] : [];

  await postDrugCard(actor, {
    icon: "fa-syringe",
    color: "--inactive",
    headline: game.i18n.format(endedEarly ? "ep2e.chat.dose.endedEarly" : "ep2e.chat.dose.woreOff", { name: dose.name ?? effect.name }),
    rows
  });
}

/**
 * Hangs the wear-off card on the removal of a dose from an actor, however it was removed: run out
 * on the clock, ended from the Time Panel or deleted on the sheet. Only the client that removed it
 * posts, so the card appears once.
 * @returns {void}
 */
export function registerDoseHooks() {
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user.id) return;
    if (effect.getFlag?.("eclipsephase", "dose") === undefined) return;
    if (!(effect.parent instanceof Actor)) return;
    postWearOffCard(effect.parent, effect);
  });
}

/**
 * Puts a dose's effect on an actor, or - when the same drug is already running there - restarts
 * that effect's clock instead of stacking a second one. The clock starts now, not when the effect
 * data was read, so a dose handed over later still runs its full span.
 * @param {Actor} actor - The actor receiving the dose
 * @param {Object} data - The dose's effect data, as doseEffectData built it
 * @returns {Promise<Object>} The effect now running and whether it was a renewal
 */
async function putDoseOn(actor, data) {
  const running = activeDoseFor(actor, data.flags?.eclipsephase?.dose?.name ?? data.name);
  if (running) {
    await running.update({ start: ActiveEffect.getEffectStart(), "duration.expired": false });
    return { effect: running, renewed: true };
  }
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{ ...data, start: ActiveEffect.getEffectStart() }]);
  return { effect, renewed: false };
}

/**
 * Takes one dose of a drug: refuses an ammunition pack, which only loads into a weapon, refuses a
 * dose in a body it cannot act on, spends it from the pack and puts its effect on the actor. The
 * effect data is read before the dose is spent, because the last dose takes the drug itself off
 * the sheet.
 * @param {Actor} actor - The actor taking the dose
 * @param {Item} item - The drug
 * @returns {Promise<Object>} taken and emptied as consumeDose reports them, refused when the body
 *   would not take it, and the effect now running
 */
export async function takeDose(actor, item) {
  if (isAmmoPack(item.system)) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.ammoPackNotTaken", { name: item.name }));
    return { taken: false, emptied: false, refused: true, effect: null };
  }

  const substrate = doseSubstrate(actor, item);
  if (!substrate.allowed) {
    ui.notifications.warn(game.i18n.localize(substrate.reasonKey));
    return { taken: false, emptied: false, refused: true, effect: null };
  }

  const data = doseEffectData(item);
  const outcome = await consumeDose(actor, item);
  if (!outcome.taken) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.noDosesLeft", { name: item.name }));
    return { ...outcome, refused: false, effect: null };
  }

  const { effect, renewed } = await putDoseOn(actor, data);
  await postDoseCard(actor, item, outcome, renewed);
  return { ...outcome, refused: false, effect };
}

/**
 * Offers one dose of a drug to somebody else: spends it from the giver's pack and posts a public
 * card whose "use on me" button hands it to whoever claims it first. The card carries everything
 * the dose needs, since the last dose takes the drug itself off the giver's sheet.
 * @param {Actor} actor - The actor handing the dose over
 * @param {Item} item - The drug
 * @param {Object} [options] - forced: the dose got into an unwilling target through a melee hit
 * @returns {Promise<Object>} offered, and the message posted
 */
export async function offerDose(actor, item, { forced = false } = {}) {
  if (isAmmoPack(item.system)) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.ammoPackNotTaken", { name: item.name }));
    return { offered: false, message: null };
  }

  const data = doseEffectData(item);
  const drugType = item.system.drugType ?? "";
  const outcome = await consumeDose(actor, item);
  if (!outcome.taken) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.noDosesLeft", { name: item.name }));
    return { offered: false, message: null };
  }

  const card = {
    icon: "fa-syringe",
    color: "--negative",
    headline: game.i18n.format(forced ? "ep2e.chat.dose.forced" : "ep2e.chat.dose.offered", { name: item.name }),
    rows: doseRows(item.system, outcome)
  };
  const content = await foundry.applications.handlebars.renderTemplate(DOSE_CARD, { ...card, offer: true });
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { eclipsephase: { doseOffer: { data, drugType, name: item.name, card, usedBy: null } } }
  });
  return { offered: true, message };
}

/**
 * Hands an offered dose to an actor: refuses a card already used and a body the drug cannot act
 * on, puts the dose on the actor and turns the card into a record of who took it, with no button
 * left for anyone else. The used-card refusal only matters when two people click before the card
 * has re-rendered. Runs where the card may be changed - the GM's client - so two people
 * claiming at once cannot both get it.
 * @param {ChatMessage} message - The offer card
 * @param {Actor} actor - The actor claiming the dose
 * @returns {Promise<Object>} claimed, or the localization key explaining why not
 */
export async function claimDose(message, actor) {
  const offer = message?.getFlag?.("eclipsephase", "doseOffer");
  if (!offer || !actor) return { claimed: false, reasonKey: null };
  if (offer.usedBy) return { claimed: false, reasonKey: "ep2e.actorSheet.warnings.doseAlreadyUsed" };

  const substrate = doseSubstrate(actor, { system: { drugType: offer.drugType } });
  if (!substrate.allowed) return { claimed: false, reasonKey: substrate.reasonKey };

  await putDoseOn(actor, offer.data);
  const footnote = game.i18n.format("ep2e.chat.dose.usedBy", { name: actor.name });
  const content = await foundry.applications.handlebars.renderTemplate(DOSE_CARD, { ...offer.card, footnote, offer: false });
  await message.update({ content, "flags.eclipsephase.doseOffer.usedBy": actor.name });
  return { claimed: true, reasonKey: null };
}

/**
 * Who a claim click is for: the token the user has selected when they asked for the selection -
 * the GM's "use on selection" - and otherwise the user's own character.
 * @param {User} user - The clicking user
 * @param {Boolean} selection - Whether the click asked for the selected token
 * @returns {Actor|null} The actor, or null when there is none
 */
function claimantFor(user, selection) {
  if (selection) return globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? null;
  return user?.character ?? null;
}

/**
 * Answers a "use on me" or "use on selection" click. The claim itself runs on the GM's client; a
 * player's click is sent there, and a refusal comes back as a notice on the player's own screen.
 * @param {String} messageId - The offer card's id
 * @param {Object} [options] - selection: claim for the selected token instead of the own character
 * @returns {Promise<void>} Resolves once the claim is made or sent
 */
export async function requestDoseClaim(messageId, { selection = false } = {}) {
  const message = game.messages.get(messageId);
  if (!message?.getFlag?.("eclipsephase", "doseOffer")) return;

  const actor = claimantFor(game.user, selection);
  if (!actor) {
    const key = selection ? "ep2e.actorSheet.warnings.doseNoSelection" : "ep2e.actorSheet.warnings.doseNeedsClaimant";
    ui.notifications.warn(game.i18n.localize(key));
    return;
  }

  if (game.user.isGM) {
    const result = await claimDose(message, actor);
    if (result.reasonKey) ui.notifications.warn(game.i18n.localize(result.reasonKey));
    return;
  }

  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.doseNeedsGM"));
    return;
  }

  game.socket.emit(DOSE_SOCKET, { action: "claimDose", messageId, actorUuid: actor.uuid, userId: game.user.id });
}

const HIT_RESULTS = [TASK_RESULT.SUCCESS, TASK_RESULT.SUCCESS_ONE, TASK_RESULT.SUCCESS_TWO, TASK_RESULT.CRITICAL_SUCCESS, TASK_RESULT.AUTOSUCCESS];

/**
 * Whether a task result is a hit.
 * @param {Number} result - A TASK_RESULT value
 * @returns {Boolean} True for any success
 */
function isHit(result) {
  return HIT_RESULTS.includes(result);
}

/**
 * Forces a dose on an unwilling target: a melee attack first (Core p.330: a patch goes on with a
 * touch-only attack, +20 - the attacker ticks Touch only in the dialog; a coated blade or a needle
 * is an ordinary attack). Nothing is spent yet - the dose leaves the pack, and its card appears,
 * only once the attack hits.
 * @param {Actor} actor - The attacker
 * @param {Item} item - The drug
 * @param {Object} [systemOptions] - Passed on to RollCheck; tests answer the dialog through it
 * @returns {Promise<*>} Whatever the roll returned, or nothing when refused
 */
export async function forceDose(actor, item, systemOptions = {}) {
  if (isAmmoPack(item.system)) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.ammoPackNotTaken", { name: item.name }));
    return null;
  }
  if (dosesRemaining(item.system) < 1) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.noDosesLeft", { name: item.name }));
    return null;
  }

  const dataset = {
    name: game.i18n.localize("ep2e.skills.vigorSkills.melee"),
    key: "melee",
    type: "skill",
    rollvalue: actor.system.skillsVig?.melee?.roll ?? 0,
    pooltype: "Vigor",
    contextFlags: { doseAttempt: { actorUuid: actor.uuid, itemId: item.id, delivered: false } }
  };
  return RollCheck(dataset, actor.system, actor, systemOptions, null, "skill");
}

/**
 * Delivers a forced dose once its attack has hit: marks the attack's card so a later pool spend
 * cannot deliver it twice, then spends the dose and posts its card for the GM to place.
 * @param {Object} attempt - The doseAttempt the attack carried
 * @param {String} messageId - The attack's chat card
 * @returns {Promise<Object|null>} What offerDose reported, or null when nothing was delivered
 */
export async function deliverForcedDose(attempt, messageId) {
  const message = game.messages.get(messageId);
  if (!attempt || message?.getFlag?.("eclipsephase", "roll")?.doseAttempt?.delivered) return null;

  const actor = await fromUuid(attempt.actorUuid);
  const item = actor?.items?.get(attempt.itemId);
  if (!item) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.noDosesLeft", { name: "" }));
    return null;
  }

  if (message) await message.update({ "flags.eclipsephase.roll.doseAttempt.delivered": true });
  return offerDose(actor, item, { forced: true });
}

/**
 * Hangs the forced dose on the attack's outcome: a hit delivers it at once, and a miss a pool
 * spend later turns into a hit delivers it then. Both run on the client that rolled or spent.
 * @returns {void}
 */
export function registerForcedDoseHooks() {
  Hooks.on("eclipsephase.postRoll", context => {
    const attempt = context?.flags?.doseAttempt;
    if (attempt && isHit(context.outputData?.alternatives?.originalResult)) deliverForcedDose(attempt, context.message?.id);
  });
  Hooks.on("eclipsephase.poolResult", ({ context, newResult }) => {
    if (context?.doseAttempt && isHit(newResult)) deliverForcedDose(context.doseAttempt, context.messageId);
  });
}

/**
 * Registers the socket the dose claims travel on: the active GM makes a player's claim, and the
 * player who asked hears back when it was refused.
 * @returns {void}
 */
export function registerDoseSocket() {
  game.socket.on(DOSE_SOCKET, async payload => {
    if (payload?.action === "claimDose") {
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
      const message = game.messages.get(payload.messageId);
      const actor = await fromUuid(payload.actorUuid);
      const result = await claimDose(message, actor);
      if (result.reasonKey) game.socket.emit(DOSE_SOCKET, { action: "claimDoseRefused", userId: payload.userId, reasonKey: result.reasonKey });
      return;
    }
    if (payload?.action === "claimDoseRefused" && payload.userId === game.user.id) {
      ui.notifications.warn(game.i18n.localize(payload.reasonKey));
    }
  });
}

/**
 * Removes every dose whose duration has run out, called from the actor's effect-duration hook on
 * the GM's client. Foundry's expiry only marks an effect; taking it off the actor is the system's
 * job, and the wear-off card hangs on exactly that deletion.
 * @param {Actor} actor - The actor whose effects were refreshed
 * @param {ActiveEffect[]} effects - The effects whose remaining duration changed
 * @returns {Promise<void>} Resolves once every run-out dose is gone
 */
export async function endRunOutDoses(actor, effects) {
  const runOut = effects.filter(effect =>
    effect.getFlag?.("eclipsephase", "dose") !== undefined && durationRunOut(effect));

  if (runOut.length) await actor.deleteEmbeddedDocuments("ActiveEffect", runOut.map(effect => effect.id));
}
