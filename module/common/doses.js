import { drugVector, doseOnset, dosesRemaining, isAmmoPack, consumeDose, parseAddictionMod } from "./drugs.js";
import { durationRunOut, isTimedSpan, SECONDS_PER } from "./time.js";
import { sleevedNervousSystem, chainHasWareMarker, CYBERBRAIN_MARKER } from "./body-markers.js";
import { diceFormula, actorAudience, postCard, CARD_TEMPLATE, selectedTokenActor, pickActorFromList, timedEffectData, deleteRunOutEffects, cloneCompendiumItem, findCompendiumItem } from "./general-sheet-functions.js";
import { SYSTEM_SOCKET, registerSocketActions, relayToActiveGM, runOrRelay } from "./general-helper-functions.js";
import { RollCheck, rollToChat, WEAPON_DAMAGE_OUTPUT, TaskRollModifier, signed, DEFAULT_ROLL } from "../rolls/dice.js";
import { settleOnRoll, postCheckCard, markCardRolled, rollAptitudeCheck, modifiersOnRoll, registerCheckCard } from "../rolls/cards.js";
import { GLOBAL_MOD_KEY } from "../rolls/modifiers.js";
import { getBodyBindingInfo } from "./morp-functions.js";
import { neededTierTrait, ownsOtherFamily, findTrait } from "./sleight-prerequisite.js";
import { chemicalDoses, attackTargetCount } from "./weapon-functions.js";
import { registerCard, renderCard, updateCard } from "./chat-cards.js";
import { registerAttackEffect } from "../rolls/attacks.js";
import { pickTokensOnCanvas } from "./targeting.js";
import { damageFormula } from "../rolls/damage-formula.js";
import { applyDamage, damageLine, appendDamageLines } from "../rolls/damage.js";

for (const key of ["doseCheck", "doseFilter", "addictionCheck"]) registerCheckCard(key);
registerCard("doseOffer", { render: renderOfferCard, mutations: { claim: (state, { usedBy, addiction }) => ({ ...state, usedBy, addiction }) } });
registerCard("wearOff", { render: renderWearOffCard });

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
  return timedEffectData({
    name: item.name,
    img: item.img,
    origin: item.uuid,
    description: system.description ?? "",
    changes,
    span: system.duration,
    flags: {
        dose: {
          itemId: item.id,
          name: item.name,
          category: system.category ?? "",
          drugType: system.drugType ?? "",
          vector: drugVector(system)?.key ?? null,
          onset: doseOnset(system),
          wearOff: diceFormula(system.wearOff),
          rollOptions: Array.isArray(system.rollOptions) ? system.rollOptions : [],
          useCheck: system.useCheck?.aptitude ? foundry.utils.deepClone(system.useCheck) : null,
          checkOutcome: null,
          psiPenalty: 0,
          blocksPsi: system.blocksPsi === true,
          overTime: system.overTime ? foundry.utils.deepClone(system.overTime) : null,
          overTimeState: { ticks: 0, steps: 0 },
          healingAddition: system.healingAddition ?? "",
          grants: Array.isArray(system.grants) ? foundry.utils.deepClone(system.grants) : [],
          addiction: drugAddiction(system)
        }
    }
  });
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
  const timed = isTimedSpan(span);
  if (!timed) return game.i18n.localize("ep2e.chat.dose.untilEnded");
  return `${span.value} ${game.i18n.localize(`ep2e.item.drug.table.durationUnits.${span.units}`)}`;
}


/**
 * The rows a dose card lists: the form, how soon it takes hold, how long it lasts and what is left
 * of the pack once this dose is out of it.
 * @param {Object} system - The drug's system data, as it is after the dose was spent
 * @param {Object|null} outcome - What consumeDose reported; without one, nothing is said about the
 *   pack
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
  if (!outcome) return rows;
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
  await postCard(actor, {
    icon: "fa-syringe",
    color: "--negative",
    headline: game.i18n.format(renewed ? "ep2e.chat.dose.renewed" : "ep2e.chat.dose.taken", { name: item.name }),
    rows: doseRows(item.system, outcome),
    addiction: addictionControls(actor, { name: item.name, addiction: drugAddiction(item.system) })
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
  const timed = isTimedSpan({ units: "seconds", ...effect.duration });
  const endedEarly = timed && !durationRunOut(effect);
  if (dose.filteredOut) return;
  const sv = defendedFormula(dose.wearOff || "", dose);
  const name = dose.name ?? effect.name;
  const card = {
    icon: "fa-syringe",
    color: "--inactive",
    headline: game.i18n.format(endedEarly ? "ep2e.chat.dose.endedEarly" : "ep2e.chat.dose.woreOff", { name }),
    rows: sv ? [{ label: game.i18n.localize("ep2e.chat.dose.wearOffSv"), value: sv }] : []
  };
  const flags = sv ? { eclipsephase: { wearOff: { actorUuid: actor.uuid, sv, name, card, rolled: false } } } : {};

  const button = sv ? { action: "rollWearOff", label: game.i18n.localize("ep2e.chat.dose.rollWearOff") } : null;
  await postCard(actor, { ...card, button, actorUuid: actor.uuid }, flags);
}

/**
 * Draws a wear-off card: its stress button until the stress is rolled.
 * @param {Object} state - The card's wearOff flag
 * @returns {Promise<String>} The card's HTML
 */
function renderWearOffCard(state) {
  const button = state.rolled ? null : { action: "rollWearOff", label: game.i18n.localize("ep2e.chat.dose.rollWearOff") };
  return foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, { ...state.card, button, actorUuid: state.actorUuid });
}

/**
 * Rolls the harm a drug does - stress or damage - through the system's roll output, so the 3D dice
 * play before the result shows, and applies it through the ordinary damage path, trauma and wounds
 * included.
 * @param {Actor} actor - The actor harmed
 * @param {Object} harm - formula, target ("mental" or "physical") and copy, the card's localized line
 * @returns {Promise<Number>} The stress or damage taken
 */
export async function rollDrugHarm(actor, { formula, target, copy }) {
  const roll = await new Roll(formula).evaluate();
  const output = { type: "defaultDamage", copy, rollTitle: "ep2e.roll.announce.total" };
  const posted = await rollToChat(null, output, WEAPON_DAMAGE_OUTPUT, roll, actor.name, actorAudience(actor), false, "rollOutput");
  const result = await applyDamage(actor, roll.total, { target });
  await appendDamageLines(posted, [damageLine(actor, result, target)]);
  return roll.total;
}

/**
 * Rolls the stress a drug leaves behind as it wears off and applies it. The card loses its button.
 * Runs where the card may be changed - its author or a GM - so the stress is rolled once.
 * @param {ChatMessage} message - The wear-off card
 * @returns {Promise<Number|null>} The stress taken, or null when nothing was rolled
 */
export async function rollWearOffStress(message) {
  const wearOff = message?.getFlag?.("eclipsephase", "wearOff");
  if (!wearOff || wearOff.rolled) return null;
  const actor = await fromUuid(wearOff.actorUuid);
  if (!actor) return null;

  await updateCard(message, "wearOff", "merge", { rolled: true });
  return rollDrugHarm(actor, { formula: wearOff.sv, target: "mental", copy: game.i18n.format("ep2e.chat.dose.wearOffFlavor", { name: wearOff.name }) });
}

/**
 * Answers a "roll stress" click: rolled at once where the card may be changed, otherwise sent to
 * the active GM.
 * @param {String} messageId - The wear-off card's id
 * @returns {Promise<void>} Resolves once the roll is made or sent
 */
export async function requestWearOffRoll(messageId) {
  const message = game.messages.get(messageId);
  if (!message?.getFlag?.("eclipsephase", "wearOff")) return;
  await runOrRelay(message, "rollWearOff", () => rollWearOffStress(message));
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
    endDoseRemnants(effect.parent, effect);
  });
}

/**
 * Takes off what a dose left on the actor for as long as it ran: the conditions its check or its
 * growing penalty caused, and the items it lent.
 * @param {Actor} actor - The actor the dose was on
 * @param {ActiveEffect} effect - The dose, as it was when removed
 * @returns {Promise<void>} Resolves once everything is gone
 */
async function endDoseRemnants(actor, effect) {
  const conditions = Array.from(actor.effects ?? []).filter(entry => entry.getFlag?.("eclipsephase", "incapacitatedBy") === effect.id);
  const items = Array.from(actor.items ?? []).filter(item => item.getFlag?.("eclipsephase", "grantedBy") === effect.id);
  if (conditions.length) await actor.deleteEmbeddedDocuments("ActiveEffect", conditions.map(entry => entry.id));
  if (items.length) await actor.deleteEmbeddedDocuments("Item", items.map(item => item.id));
}

/**
 * Puts a dose's effect on an actor, or - when the same drug is already running there - restarts
 * that effect's clock instead of stacking a second one. The clock starts now, not when the effect
 * data was read, so a dose handed over later still runs its full span. A renewal takes the new
 * dose's data - its changes, options, check and duration as the pack now has them - and clears
 * the outcome of the drug's check, since every dose calls for it again.
 * @param {Actor} actor - The actor receiving the dose
 * @param {Object} data - The dose's effect data, as doseEffectData built it
 * @returns {Promise<Object>} The effect now running and whether it was a renewal
 */
async function putDoseOn(actor, data) {
  const running = activeDoseFor(actor, data.flags?.eclipsephase?.dose?.name ?? data.name);
  if (running) {
    await running.update({
      start: ActiveEffect.getEffectStart(),
      duration: { ...data.duration, expired: false },
      "system.changes": data.system?.changes ?? [],
      "flags.eclipsephase.dose": foundry.utils.deepClone(data.flags?.eclipsephase?.dose ?? {})
    });
    return { effect: running, renewed: true };
  }
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{ ...data, start: ActiveEffect.getEffectStart() }]);
  return { effect, renewed: false };
}

/**
 * Asks whoever takes a drug willingly whether their defensive ware should weaken it. The full
 * effect is the primary choice - shown on the right by the dialog's class, first in the list.
 * @param {Object} defense - What doseDefense reported
 * @param {String} name - The drug's name
 * @returns {Promise<Boolean>} True when the ware should work on it
 */
async function letWareWork(defense, name) {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("ep2e.dialog.doseDefense.header") },
    classes: ["ep2e-primary-right"],
    content: `<p>${game.i18n.format("ep2e.dialog.doseDefense.copy", { name, ware: wareNames(defense) })}</p>`,
    buttons: [
      { action: "full", label: game.i18n.localize("ep2e.dialog.doseDefense.full"), default: true, callback: () => ({ filter: false }) },
      { action: "weak", label: game.i18n.localize("ep2e.dialog.doseDefense.filter"), callback: () => ({ filter: true }) }
    ],
    position: { width: 340 },
    modal: true,
    rejectClose: false
  });
  return result?.filter === true;
}

/**
 * Puts defensive ware to work on a dose about to take hold: a toxin always, a drug only when its
 * taker wants it - an unwilling target always. Returns the data to put on, or none at all when the
 * ware nullifies the substance.
 * @param {Actor} actor - The actor the dose is for
 * @param {Object} data - The dose's effect data
 * @param {Object} [options] - willing: taken by choice; ask: whether a willing taker may be asked
 * @returns {Promise<Object>} data (null when nullified), defense, whether the ware worked, and
 *   wanted - whether the actor's defences are to act on it at all, immunizers included
 */
export async function defendDose(actor, data, { willing = true, ask = true } = {}) {
  const dose = data.flags?.eclipsephase?.dose ?? {};
  const defense = doseDefense(actor, dose);
  const forced = dose.category === "toxin" || !willing;
  if (!defenseApplies(defense)) return { data, defense, working: false, wanted: forced };
  const working = defense.immune || forced || (ask && await letWareWork(defense, dose.name));
  if (!working) return { data, defense, working: false, wanted: false };
  if (defense.by.includes(WARE.nanophages)) await actor.setFlag("eclipsephase", "nanophagesUsedAt", game.time.worldTime);
  if (defense.nullify) return { data: null, defense, working: true, wanted: true };
  return { data: defendedDoseData(data, defense), defense, working: true, wanted: true };
}

/**
 * The card a dose leaves when defensive ware nullifies it outright.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {Object} defense - What doseDefense reported
 * @returns {Promise<ChatMessage>} The card
 */
function postNullifiedCard(actor, name, defense) {
  const key = defense.immune ? "ep2e.chat.dose.immune" : "ep2e.chat.dose.nullified";
  return postCard(actor, { icon: "fa-shield-virus", color: "--positive", headline: game.i18n.format(key, { name, ware: wareNames(defense) }) });
}

/**
 * Lets a dose take hold, in the order the book has it: the immunizers test the substance first,
 * then its effect lands and the drug's own check is asked for.
 * @param {Actor} actor - The actor
 * @param {Object} data - The dose's effect data, defended where ware is at work
 * @param {Boolean} wanted - Whether the actor's defences act on it, immunizers included
 * @returns {Promise<Object>} The effect now running and whether it was a renewal
 */
export async function applyDose(actor, data, wanted) {
  if (wanted) await rollImmunizers(actor, data.flags?.eclipsephase?.dose);
  const result = await putDoseOn(actor, data);
  await postUseCheckCard(actor, result.effect);
  return result;
}

/**
 * What follows once a dose is spent on an actor: nothing when ware nullifies it, the filters' SOM
 * Check first where they may keep it out - the dose takes hold only if that fails - and otherwise
 * the dose at once.
 * @param {Actor} actor - The actor
 * @param {Object} defended - What defendDose reported
 * @returns {Promise<Object>} effect (null while a filter check is pending or when nullified),
 *   pending and nullified
 */
async function letDoseIn(actor, defended) {
  await logDose(actor, defended.name);
  if (!defended.data) {
    await postNullifiedCard(actor, defended.name, defended.defense);
    return { effect: null, nullified: true, pending: false };
  }
  if (defended.working && defended.defense.filterCheck) {
    await postFilterCheckCard(actor, defended.data, defended.defense, defended.wanted);
    return { effect: null, nullified: false, pending: true };
  }
  const { effect } = await applyDose(actor, defended.data, defended.wanted);
  return { effect, nullified: false, pending: false };
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

  const defended = await defendDose(actor, data, { willing: true });
  await postDoseCard(actor, item, outcome, !!activeDoseFor(actor, item.name));
  const { effect, nullified, pending } = await letDoseIn(actor, { ...defended, name: item.name });
  return { ...outcome, refused: false, effect, nullified, pending };
}

/**
 * Offers one dose of a drug to somebody else: posts a public card whose buttons hand it to whoever
 * claims it first. Nothing leaves the pack yet - the dose is spent when somebody actually gets it.
 * The card carries the dose's effect data, read now, so the effect does not depend on the drug
 * still being on the sheet.
 * @param {Actor} actor - The actor handing the dose over
 * @param {Item} item - The drug
 * @returns {Promise<Object>} offered, and the message posted
 */
export async function offerDose(actor, item) {
  if (isAmmoPack(item.system)) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.ammoPackNotTaken", { name: item.name }));
    return { offered: false, message: null };
  }

  if (dosesRemaining(item.system) < 1) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.noDosesLeft", { name: item.name }));
    return { offered: false, message: null };
  }

  const data = doseEffectData(item);
  const drugType = item.system.drugType ?? "";
  const card = {
    icon: "fa-syringe",
    color: "--negative",
    headline: game.i18n.format("ep2e.chat.dose.offered", { name: item.name }),
    rows: doseRows(item.system, null)
  };
  const state = { data, drugType, name: item.name, card, usedBy: null, addiction: null, giverUuid: actor.uuid, itemId: item.id };
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: await renderCard("doseOffer", state),
    flags: { eclipsephase: { doseOffer: state } }
  });
  return { offered: true, message };
}

/**
 * Draws a dose offer card: its buttons while nobody has taken the dose, then who took it and, for
 * an addictive drug, the GM's controls for that person.
 * @param {Object} state - The card's doseOffer flag
 * @returns {Promise<String>} The card's HTML
 */
function renderOfferCard(state) {
  const taken = !!state.usedBy;
  return foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    ...state.card,
    offer: !taken,
    actorUuid: state.giverUuid,
    footnote: taken ? game.i18n.format("ep2e.chat.dose.usedBy", { name: state.usedBy }) : "",
    addiction: taken ? state.addiction : null
  });
}

/**
 * Hands an offered dose to an actor: refuses a card already used and a body the drug cannot act
 * on, spends the dose from the giver's pack - refusing when that pack is gone or empty by now -
 * puts it on the actor and turns the card into a record of who took it, with no button left for
 * anyone else. The used-card refusal only matters when two people click before the card
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

  const giver = offer.giverUuid ? await fromUuid(offer.giverUuid) : null;
  const pack = giver?.items?.get?.(offer.itemId);
  const spent = pack ? await consumeDose(giver, pack) : { taken: false };
  if (!spent.taken) return { claimed: false, reasonKey: "ep2e.actorSheet.warnings.offerPackEmpty" };

  const defended = await defendDose(actor, offer.data, { willing: true, ask: false });
  const addiction = addictionControls(actor, offer.data?.flags?.eclipsephase?.dose) ?? null;
  await updateCard(message, "doseOffer", "claim", { usedBy: actor.name, addiction });
  await letDoseIn(actor, { ...defended, name: offer.name });
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
  if (selection) return selectedTokenActor();
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
  if (!selection && actor.uuid === message.getFlag("eclipsephase", "doseOffer").giverUuid) return;

  if (game.user.isGM) {
    const result = await claimDose(message, actor);
    if (result.reasonKey) ui.notifications.warn(game.i18n.localize(result.reasonKey));
    return;
  }

  relayToActiveGM("claimDose", { messageId, actorUuid: actor.uuid, userId: game.user.id });
}

/**
 * Forces a dose on an unwilling target: a melee attack first (Core p.330: a patch goes on with a
 * touch-only attack, +20 - the attacker ticks Touch only in the dialog; a coated blade or a needle
 * is an ordinary attack). A hit offers the attacker the target button; the dose leaves the pack
 * once the target is picked, and goes in unless the target dodges or parries.
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
    contextFlags: {
      targetedAttack: {
        effect: "dose",
        targets: 1,
        area: false,
        labelKey: "ep2e.chat.attack.applyDose",
        weaponName: item.name,
        effectLabel: game.i18n.format("ep2e.chat.defence.doseLabel", { name: item.name }),
        cursor: DOSE_CURSOR,
        payload: { ...chemicalPayload(item), giverUuid: actor.uuid, itemId: item.id, spend: true }
      }
    }
  };
  return RollCheck(dataset, actor.system, actor, systemOptions, null, "skill");
}

/**
 * The dose a chemical weapon or a forced drug carries, read off the drug now, so a hit still knows
 * what it delivers once the pack is gone.
 * @param {Item} item - The drug
 * @returns {Object} data (the dose's effect data), drugType and name
 */
export function chemicalPayload(item) {
  return { data: doseEffectData(item), drugType: item.system.drugType ?? "", name: item.name };
}

/**
 * The dose a weapon is loaded with: the copy taken at loading, or for a weapon loaded before that
 * copy existed, the pack it names if the actor still carries it.
 * @param {Actor} actor - The weapon's owner
 * @param {Item} weapon - The weapon
 * @returns {Object|null} The payload, or null when it is not known
 */
export function weaponPayload(actor, weapon) {
  const stored = weapon?.system?.ammoSelected?.dose;
  if (stored?.data) return stored;
  const pack = actor?.items?.get?.(weapon?.system?.ammoSelected?.id);
  return pack?.type === "drug" ? chemicalPayload(pack) : null;
}

/**
 * Takes back the dose an attack put on a target, when a pool spend turns the defence around. It
 * goes without a wear-off card, as it never took hold.
 * @param {Actor} actor - The target
 * @param {String} defenceId - The defence the dose came through
 * @returns {Promise<void>} Resolves once it is gone
 */
async function undoAttackDose(actor, defenceId) {
  const effect = Array.from(actor.effects ?? []).find(entry => defenceId && entry.getFlag?.("eclipsephase", "dose")?.defenceId === defenceId);
  if (!effect) return;
  await effect.update({ "flags.eclipsephase.dose.filteredOut": true });
  await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
}

/**
 * Carries out what an attack's dose does to one target after their defence: the full dose on a
 * hit, half of it when they only partly dodged, nothing when they got away. The dose meets the
 * target's body and their defensive ware as any unwilling dose does.
 * @param {Object} attack - The attack, with its payload
 * @param {Actor} target - The target
 * @param {String} outcome - "hit", "half" or "none"
 * @param {Object} [options] - byPool: a pool spend changed the defence, so the earlier dose goes;
 *   defenceId: the defence it comes through
 * @returns {Promise<Object|null>} What letting the dose in reported, or null when none went in
 */
export async function doseFromAttack(attack, target, outcome, { byPool = false, defenceId = null } = {}) {
  if (byPool) await undoAttackDose(target, defenceId);
  const payload = attack.payload;
  if (outcome === "none" || !payload?.data) return null;
  const substrate = doseSubstrate(target, { system: { drugType: payload.drugType } });
  if (!substrate.allowed) {
    await postCard(target, { icon: "fa-shield-virus", color: "--positive", headline: game.i18n.format("ep2e.chat.dose.unaffected", { name: target.name, drug: payload.name }) });
    return null;
  }
  let data = foundry.utils.deepClone(payload.data);
  data.flags.eclipsephase.dose.defenceId = defenceId;
  if (outcome === "half") data = defendedDoseData(data, { halve: true, by: [], checkBonus: false });
  const defended = await defendDose(target, data, { willing: false, ask: false });
  return letDoseIn(target, { ...defended, name: payload.name });
}

/**
 * Lets attacks carry doses: a weapon that fires chemicals keeps a copy of the drug it is loaded
 * with, its hits and a forced dose's hit deliver it to the targets the attacker picks.
 * @returns {void}
 */
export function registerChemicalAttacks() {
  Hooks.on("eclipsephase.weaponLoaded", ({ ammo, ammoType, update }) => {
    if (ammoType === "chemical" && ammo?.type === "drug") update["system.ammoSelected.dose"] = chemicalPayload(ammo);
  });
  registerAttackEffect("dose", {
    detect(context) {
      if (context.rolledFrom !== "rangedWeapon") return null;
      const doses = chemicalDoses(context.weapon?.weaponTraits);
      if (!doses) return null;
      const payload = weaponPayload(context.actor, context.weapon?.weapon);
      const effectLabel = payload ? game.i18n.format("ep2e.chat.defence.doseLabel", { name: payload.name }) : "";
      const targets = attackTargetCount(context.weapon?.weapon, context.options ?? {});
      return { targets, area: true, within: targets > 1 ? 1 : null, payload, labelKey: "ep2e.chat.attack.applyDose", effectLabel };
    },
    ready(attack) {
      if (attack.payload?.data) return true;
      ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.attackNoPayload"));
      return false;
    },
    async beforeDelivery(attack) {
      if (!attack.payload?.spend) return true;
      const giver = await fromUuid(attack.payload.giverUuid);
      const pack = giver?.items?.get?.(attack.payload.itemId);
      const spent = pack ? await consumeDose(giver, pack) : { taken: false };
      if (!spent.taken) ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.offerPackEmpty"));
      return spent.taken;
    },
    resolve: doseFromAttack
  });
}

/**
 * Registers the socket the dose claims travel on: the active GM makes a player's claim, and the
 * player who asked hears back when it was refused.
 * @returns {void}
 */
export function registerDoseSocket() {
  const card = payload => game.messages.get(payload.messageId);
  registerSocketActions({
    claimDose: async payload => {
      const result = await claimDose(card(payload), await fromUuid(payload.actorUuid));
      if (result.reasonKey) game.socket.emit(SYSTEM_SOCKET, { action: "claimDoseRefused", userId: payload.userId, reasonKey: result.reasonKey });
    },
    rollWearOff: payload => rollWearOffStress(card(payload)),
    rollDoseHarm: payload => rollDoseHarm(card(payload))
  });
  registerSocketActions({
    claimDoseRefused: payload => {
      if (payload.userId === game.user.id) ui.notifications.warn(game.i18n.localize(payload.reasonKey));
    }
  }, { gmOnly: false });
}

/**
 * Removes every dose whose duration has run out, called once Foundry marked it expired on the GM's
 * client. Foundry's expiry only marks an effect; taking it off the actor is the system's job, and
 * the wear-off card hangs on exactly that deletion. The ticks still due up to the dose's end are
 * dealt first: a clock jump past the end drops the dose from Foundry's tracking before the clock
 * hook runs, so for an unlinked token nothing else would deal them.
 * @param {Actor} actor - The actor whose effects were refreshed
 * @param {ActiveEffect[]} effects - The effects whose remaining duration changed
 * @returns {Promise<void>} Resolves once every run-out dose is gone
 */
export async function endRunOutDoses(actor, effects) {
  for (const effect of effects) {
    if (effect.getFlag?.("eclipsephase", "dose") && durationRunOut(effect)) await settleInTurn(actor, effect);
  }
  return deleteRunOutEffects(actor, effects, "dose");
}

// Whoever picks who receives a dose - the GM placing an offered one, an attacker forcing one - does
// so with the syringe the dose cards show, in the system's picking colours.
export const DOSE_CURSOR = { icon: "fa-syringe" };

/**
 * The actors a GM may hand a dose to from the NPC list: the world's NPCs. Goons are left out -
 * they are unlinked tokens whose doses rarely matter beyond the scene, and they are reached on the
 * canvas instead.
 * @returns {Actor[]} The NPCs, sorted by name
 */
export function doseTargetCandidates() {
  return game.actors.filter(actor => actor.type === "npc").sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Asks the GM which NPC receives a dose, from a list they can filter by typing.
 * @returns {Promise<Actor|null>} The NPC, or null when cancelled
 */
function pickNpc() {
  return pickActorFromList(doseTargetCandidates(), "ep2e.dialog.selectDoseNpc.header", "ep2e.dialog.selectDoseNpc.copy");
}

/**
 * Hands an offered dose to a target the GM picks on the card: a token on the canvas, or an NPC
 * from the list.
 * @param {String} messageId - The offer card's id
 * @param {String} mode - "canvas" or "npc"
 * @param {Object} [pickers] - Replacements for the two pickers, for tests
 * @returns {Promise<Object>} What claimDose reported, or cancelled
 */
export async function chooseDoseTarget(messageId, mode, pickers = {}) {
  const message = game.messages.get(messageId);
  const offer = message?.getFlag?.("eclipsephase", "doseOffer");
  if (!offer) return { claimed: false, cancelled: true };
  if (!game.user.isGM) return { claimed: false, cancelled: true };

  let actor = null;
  if (mode === "canvas") {
    if (!globalThis.canvas?.ready) {
      ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.doseNoScene"));
      return { claimed: false, cancelled: true };
    }
    const token = await (pickers.canvas ?? (async () => (await pickTokensOnCanvas(DOSE_CURSOR))?.[0] ?? null))();
    actor = token?.actor ?? null;
  }
  else if (mode === "npc") {
    actor = await (pickers.npc ?? pickNpc)();
  }
  if (!actor) return { claimed: false, cancelled: true };

  const result = await claimDose(message, actor);
  if (result.reasonKey) ui.notifications.warn(game.i18n.localize(result.reasonKey));
  return result;
}

// Some drugs call for a check the moment they take hold (Core p.330-335): Inhibitor's WIL -20,
// Flight's WIL against panic, the SOM or WIL against incapacitation of Twitch, Nervex and
// Neuropath. The check is offered on a card, rolled by whoever owns the actor - so they can
// spend pool on it - and its outcome is applied by the system.

const CONDITION_KEY = "incapacitated";

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
  const shown = modifier ? ` (${signed(modifier)})` : "";
  return game.i18n.format("ep2e.chat.dose.checkLabel", { aptitude: String(useCheck.aptitude).toUpperCase() }) + shown;
}

/**
 * The harm a failed check does and how much, for the roll card to carry: stress to the mind or
 * damage to the body, both rolled from the check's single dice field - halved when defensive ware
 * halves the dose.
 * @param {Object} useCheck - The drug's check
 * @param {Object} dose - The dose flag
 * @returns {Object} harm ("stress", "damage" or null) and formula
 */
function harmOf(useCheck, dose) {
  const formula = diceFormula(useCheck?.stress);
  const harm = ["stress", "damage"].includes(useCheck?.failure) && formula ? useCheck.failure : null;
  return { harm, formula: harm ? defendedFormula(formula, dose) : "" };
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
  return postCheckCard(actor, "doseCheck", {
    card: { icon: "fa-syringe", color: "--negative", headline: game.i18n.format("ep2e.chat.dose.checkNeeded", { name: dose.name, check: label }) },
    button: { action: "rollDoseCheck", label: game.i18n.format("ep2e.chat.dose.rollCheck", { check: label }) },
    payload: { effectId: effect.id }
  });
}

/**
 * Turns a check card into a record once its check is rolled: the button gives way to a note.
 * Done where the card may be changed; anyone else asks the active GM.
 * @param {ChatMessage} message - The check card
 * @returns {Promise<void>} Resolves once marked or asked
 */
export function markCheckCardRolled(message) {
  return markCardRolled(message, "doseCheck");
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
  const check = { actorUuid: actor.uuid, effectId: effect.id, name: dose.name, modifier: Number(dose.useCheck.modifier) || 0, ...harmOf(dose.useCheck, dose), filterBonus: dose.defense?.checkBonus === true };
  return rollAptitudeCheck(actor, dose.useCheck.aptitude, { doseCheck: check }, systemOptions);
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
  return timedEffectData({
    name: game.i18n.format(condition.nameKey, { name: drugName }),
    img: condition.img,
    statuses: [condition.status],
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    span,
    flags: { effectKey: CONDITION_KEY, incapacitatedBy: effect.id }
  });
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
  return postCard(actor, { icon: "fa-syringe", color: "--negative", headline: game.i18n.format(key, { name }) });
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
  await runOrRelay(message, "rollDoseHarm", () => rollDoseHarm(message));
}

/**
 * Hangs the checks on the roll pipeline: the drug's own modifier lands on the check, the result
 * settles the outcome, and a pool spend that turns the check around settles it again. Also ends an
 * incapacitation when the dose behind it goes.
 * @returns {void}
 */
export function registerUseCheckHooks() {
  modifiersOnRoll("doseCheck", check => [
    check.modifier && new TaskRollModifier(check.name, check.modifier),
    check.filterBonus && { text: game.i18n.localize(WARE.toxinFilters), value: FILTER_CHECK_BONUS }
  ]);
  settleOnRoll("doseCheck", async (check, passed, { byPool, message, context }) => {
    if (byPool) {
      if (passed) {
        await settleUseCheck(check, true);
        await message?.update?.({ "flags.eclipsephase.doseHarm.rolled": true });
      }
      else if (check.harm) await rollDoseHarm(message);
      return;
    }
    await settleUseCheck(check, passed);
    if (!passed && check.harm && !context.outputData?.alternatives?.options?.available) await rollDoseHarm(message);
  });
}

// Defensive ware against drugs and toxins (Core p.322-323, 330; Character Options p.130). Toxin
// filters - and digestive symbiotes, for oral doses - let a SOM Check ignore a biochem substance and
// add +30 to any check it calls for; they or medichines halve its effects and duration, both
// together nullify it. Nanophages do the same for one nano dose per 8 hours. Immunizers make the
// actor immune to a biochem substance once they beat it. A toxin is always filtered, a drug taken
// willingly only when its taker asks.

const UNITS_LARGEST_FIRST = ["days", "hours", "minutes", "seconds"];
const NANOPHAGE_PERIOD = 8 * SECONDS_PER.hours;
export const FILTER_CHECK_BONUS = 30;
export const IMMUNIZER_TARGET = 60;
const IMMUNIZER_KEY = "system.additionalSystems.immunizers";
export const WARE = {
  toxinFilters: "ep2e.chat.dose.ware.toxinFilters",
  medichines: "ep2e.chat.dose.ware.medichines",
  nanophages: "ep2e.chat.dose.ware.nanophages",
  digestiveSymbiotes: "ep2e.chat.dose.ware.digestiveSymbiotes",
  immunizers: "ep2e.chat.dose.ware.immunizers"
};

/**
 * The defensive ware working in the body the actor acts through, as their effects report it.
 * @param {Actor} actor - The actor
 * @returns {Object} toxinFilters, medichines, nanophages, digestiveSymbiotes and immunizers, each true or false
 */
export function defensiveWare(actor) {
  const systems = actor?.system?.additionalSystems ?? {};
  return {
    toxinFilters: systems.toxinFilters === true,
    medichines: systems.healing?.medichines === true,
    nanophages: systems.nanophages === true,
    digestiveSymbiotes: systems.digestiveSymbiotes === true,
    immunizers: systems.immunizers === true
  };
}

/**
 * The immunizers working in the body the actor acts through: ware whose immunizer effect applies
 * right now. Ware in another body, or taken out, does not count.
 * @param {Actor} actor - The actor
 * @returns {Item[]} The immunizer ware items
 */
export function workingImmunizers(actor) {
  return Array.from(actor?.items ?? []).filter(item => item.type === "ware" && Array.from(item.effects ?? []).some(effect =>
    !effect.disabled && effect.active !== false && (effect.changes ?? []).some(change => change.key === IMMUNIZER_KEY)));
}

/**
 * The drugs and toxins an immunizer has learned, kept on the ware itself.
 * @param {Item} item - The immunizer ware
 * @returns {String[]} Drug names
 */
export function learnedBy(item) {
  const list = item?.getFlag?.("eclipsephase", "immunities");
  return Array.isArray(list) ? list : [];
}

/**
 * The drugs and toxins the actor is immune to right now: what the immunizers working in their body
 * have learned. The immunity goes with the ware - out of the body, it protects no one.
 * @param {Actor} actor - The actor
 * @returns {String[]} Drug names
 */
export function immunities(actor) {
  return [...new Set(workingImmunizers(actor).flatMap(learnedBy))];
}

/**
 * Whether the actor's nanophages are still busy with a dose from the last 8 hours - they only
 * take on one nano dose per 8-hour period.
 * @param {Actor} actor - The actor
 * @param {Number} [now] - The world time
 * @returns {Boolean} True while they are busy
 */
export function nanophagesBusy(actor, now = game.time.worldTime) {
  const last = Number(actor?.getFlag?.("eclipsephase", "nanophagesUsedAt"));
  return Number.isFinite(last) && now - last < NANOPHAGE_PERIOD;
}

/**
 * What the actor's defensive ware does to one dose. A biochem substance meets toxin filters - or
 * digestive symbiotes, for one taken orally - and medichines; a nano one meets nanophages, unless
 * they took on another dose in the last 8 hours. A substance the immunizers made the actor immune
 * to does nothing at all.
 * @param {Actor} actor - The actor
 * @param {Object} dose - The dose flag: name, drugType and vector
 * @returns {Object} halve, nullify, filterCheck (the SOM Check that keeps it out), checkBonus
 *   (+30 on the dose's own check), immune, by (localization keys of the ware at work) and filterBy
 *   (the ware making the SOM Check)
 */
export function doseDefense(actor, dose = {}) {
  const ware = defensiveWare(actor);
  const none = { halve: false, nullify: false, filterCheck: false, checkBonus: false, immune: false, by: [], filterBy: [] };
  if (dose.drugType === "biochem") {
    if (immunities(actor).includes(dose.name)) return { ...none, nullify: true, immune: true, by: [WARE.immunizers] };
    const filter = ware.toxinFilters ? WARE.toxinFilters : (ware.digestiveSymbiotes && dose.vector === "oral" ? WARE.digestiveSymbiotes : null);
    const by = [filter, ware.medichines && WARE.medichines].filter(Boolean);
    const nullify = !!filter && ware.medichines;
    return { ...none, halve: by.length === 1, nullify, filterCheck: !!filter && !nullify, checkBonus: !!filter, by, filterBy: filter ? [filter] : [] };
  }
  if (dose.drugType === "nano" && ware.nanophages && !nanophagesBusy(actor)) {
    return { ...none, halve: true, filterCheck: true, by: [WARE.nanophages], filterBy: [WARE.nanophages] };
  }
  return none;
}

/**
 * Whether defensive ware does anything to this substance.
 * @param {Object} defense - What doseDefense reported
 * @returns {Boolean} True when it halves, nullifies or offers a check
 */
export function defenseApplies(defense) {
  return !!(defense?.halve || defense?.nullify || defense?.filterCheck);
}

/**
 * Half of a number, rounded up in size, so nothing vanishes by being halved: +1 stays +1, -20 is
 * -10, 17 is 9.
 * @param {Number} value - The number
 * @returns {Number} Its half
 */
export function halveUp(value) {
  const number = Number(value) || 0;
  return Math.sign(number) * Math.ceil(Math.abs(number) / 2);
}

/**
 * Half of a duration, in the largest unit that holds it exactly: an hour halves to 30 minutes, a
 * day to 12 hours. Rounds stay rounds, rounded up.
 * @param {Object} duration - {value, units}, as a dose carries it
 * @returns {Object} The halved duration; one without a value is left as it is
 */
export function halvedDuration(duration = {}) {
  const value = Number(duration.value);
  if (!Number.isFinite(value) || value <= 0) return { ...duration };
  if (!SECONDS_PER[duration.units]) return { ...duration, value: Math.ceil(value / 2) };
  const seconds = Math.ceil((value * SECONDS_PER[duration.units]) / 2);
  const units = UNITS_LARGEST_FIRST.find(unit => seconds % SECONDS_PER[unit] === 0);
  return { ...duration, value: seconds / SECONDS_PER[units], units };
}

/**
 * A change's value halved when it is a number; a switch or a key is left alone.
 * @param {*} value - The change's value
 * @returns {*} The halved value
 */
function halvedChangeValue(value) {
  if (typeof value === "number") return halveUp(value);
  if (typeof value !== "string" || !/^[+-]?\d+(\.\d+)?$/.test(value.trim())) return value;
  const half = halveUp(Number(value));
  return value.trim().startsWith("+") && half > 0 ? `+${half}` : String(half);
}

/**
 * A dose's effect data with defensive ware at work: duration, modifiers, roll options and a
 * growing modifier halved, and the dose marked halved so its damage and stress are too.
 * @param {Object} data - The dose's effect data
 * @param {Object} defense - What doseDefense reported
 * @returns {Object} The defended data, a copy
 */
export function defendedDoseData(data, defense) {
  const defended = foundry.utils.deepClone(data);
  if (!defense?.halve) return defended;
  const dose = defended.flags.eclipsephase.dose;
  defended.duration = { ...halvedDuration(defended.duration), expiry: defended.duration?.expiry ?? null };
  const changes = (defended.system?.changes ?? defended.changes ?? []).map(change => ({ ...change, value: halvedChangeValue(change.value) }));
  defended.changes = changes;
  defended.system = { ...(defended.system ?? {}), changes };
  dose.rollOptions = (dose.rollOptions ?? []).map(option => ({ ...option, value: halveUp(option.value) }));
  if (dose.overTime) dose.overTime = { ...dose.overTime, modifier: halveUp(dose.overTime.modifier) };
  dose.defense = { halved: true, by: defense.by, checkBonus: defense.checkBonus };
  return defended;
}

/**
 * A roll formula halved, rounded up, as the dice tray rolls it: the dice stay visible.
 * @param {String} formula - The formula
 * @param {Object} dose - The dose flag
 * @returns {String} The formula, halved when the dose is
 */
export function defendedFormula(formula, dose) {
  return dose?.defense?.halved && formula ? damageFormula({ base: formula, halved: true }) : formula;
}

/**
 * The names of the ware at work, for a card.
 * @param {Object} defense - What doseDefense reported, or a dose's defense flag
 * @returns {String} e.g. "Toxin Filters and Medichines"
 */
export function wareNames(defense) {
  const names = (defense?.by ?? []).map(key => game.i18n.localize(key));
  return names.length > 1 ? game.i18n.format("ep2e.chat.dose.ware.both", { first: names[0], second: names[1] }) : names[0] ?? "";
}

/**
 * Posts the card offering the filters' SOM Check, for the actor's owners. The dose waits on the
 * card: it takes hold only if the check fails.
 * @param {Actor} actor - The actor
 * @param {Object} data - The dose's effect data, already halved
 * @param {Object} defense - What doseDefense reported
 * @param {Boolean} wanted - Whether the actor's defences act on it, immunizers included
 * @returns {Promise<ChatMessage>} The card
 */
export function postFilterCheckCard(actor, data, defense, wanted = true) {
  const name = data.flags.eclipsephase.dose.name;
  const ware = wareNames({ by: defense?.filterBy ?? [] });
  return postCheckCard(actor, "doseFilter", {
    card: { icon: "fa-shield-virus", color: "--negative", headline: game.i18n.format("ep2e.chat.dose.filterCheckNeeded", { name, ware }) },
    button: { action: "rollFilterCheck", label: game.i18n.format("ep2e.chat.dose.rollFilterCheck", { ware }) },
    payload: { name, ware, data, wanted }
  });
}

/**
 * Turns a filter card into a record once its check is rolled. Done where the card may be changed;
 * anyone else asks the active GM.
 * @param {ChatMessage} message - The filter card
 * @returns {Promise<void>} Resolves once marked or asked
 */
export function markFilterCardRolled(message) {
  return markCardRolled(message, "doseFilter");
}

/**
 * Rolls the filters' SOM Check from its card, once. The dose waiting on the card rides along with
 * the roll, so its outcome can let the dose in - or take it out again after a pool spend.
 * @param {String} messageId - The filter card
 * @param {Object} [systemOptions] - Passed on to RollCheck; tests answer the dialog through it
 * @returns {Promise<*>} Whatever the roll returned, or null when nothing was rolled
 */
export async function requestFilterCheck(messageId, systemOptions = {}) {
  const message = game.messages.get(messageId);
  const request = message?.getFlag?.("eclipsephase", "doseFilter");
  if (!request || request.rolled) return null;
  const actor = await fromUuid(request.actorUuid);
  if (!actor) return null;

  await markFilterCardRolled(message);
  const filter = { actorUuid: actor.uuid, cardId: messageId, name: request.name, ware: request.ware, data: request.data, wanted: request.wanted };
  return rollAptitudeCheck(actor, "som", { doseFilter: filter }, systemOptions);
}

/**
 * The dose a failed filter check let in, if it is still running.
 * @param {Actor} actor - The actor
 * @param {String} cardId - The filter card
 * @returns {ActiveEffect|null} The dose
 */
function doseLetInBy(actor, cardId) {
  return Array.from(actor?.effects ?? []).find(effect => effect.getFlag?.("eclipsephase", "dose")?.filterCard === cardId) ?? null;
}

/**
 * Lets the dose in after a failed filter check: halved, as the card prepared it.
 * @param {Object} filter - The doseFilter the roll carried
 * @returns {Promise<ActiveEffect|null>} The dose, or null when it was already let in
 */
export async function letInPastFilter(filter) {
  const actor = filter ? await fromUuid(filter.actorUuid) : null;
  if (!actor || doseLetInBy(actor, filter.cardId)) return null;
  const data = foundry.utils.deepClone(filter.data);
  data.flags.eclipsephase.dose.filterCard = filter.cardId;
  const { effect } = await applyDose(actor, data, filter.wanted);
  return effect;
}

/**
 * Keeps a dose out after a passed filter check. A dose a failed check already let in - a pool spend
 * turned it around - is taken off again, its own check card with it.
 * @param {Object} filter - The doseFilter the roll carried
 * @returns {Promise<Boolean>} True once the card saying so is posted
 */
export async function filterOut(filter) {
  const actor = filter ? await fromUuid(filter.actorUuid) : null;
  if (!actor) return false;
  const effect = doseLetInBy(actor, filter.cardId);
  if (effect) {
    const checkCards = game.messages.filter(message => message.getFlag?.("eclipsephase", "doseCheck")?.effectId === effect.id && message.isOwner);
    for (const card of checkCards) await card.delete();
    await effect.update({ "flags.eclipsephase.dose.filteredOut": true });
    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  }
  await postCard(actor, { icon: "fa-shield-virus", color: "--positive", headline: game.i18n.format("ep2e.chat.dose.filteredOut", { name: filter.name, ware: filter.ware ?? "" }) });
  return true;
}

/**
 * Rolls the immunizers' Medicine: Pharmacology 60 Test against a biochem substance that took hold
 * - the nanobots' own test, so no pool and none of the actor's modifiers. A success makes the
 * actor immune to it from now on.
 * @param {Actor} actor - The actor
 * @param {Object} dose - The dose flag
 * @returns {Promise<Boolean|null>} Whether it succeeded, or null when nothing was rolled
 */
export async function rollImmunizers(actor, dose) {
  if (dose?.drugType !== "biochem" || !workingImmunizers(actor).length || immunities(actor).includes(dose.name)) return null;
  const roll = await new Roll("1d100").evaluate();
  const value = roll.total % 100;
  const success = value <= IMMUNIZER_TARGET;
  const message = {
    mainMessage: game.i18n.format("ep2e.chat.dose.immunizerTest", { name: dose.name, target: IMMUNIZER_TARGET }),
    focusMessage: game.i18n.localize(success ? "ep2e.chat.dose.immunizerSuccess" : "ep2e.chat.dose.immunizerFailure"),
    rollTitle: "ep2e.roll.announce.total"
  };
  await rollToChat(null, message, DEFAULT_ROLL, roll, actor.name, actorAudience(actor), false, "rollOutput");
  if (success) await becomeImmune({ actorUuid: actor.uuid, name: dose.name });
  return success;
}

/**
 * Writes a drug the immunizers beat into the immunizer ware working in the actor's body.
 * @param {Object} immunizer - actorUuid and the drug's name
 * @returns {Promise<Boolean>} True when the immunity is new
 */
export async function becomeImmune(immunizer) {
  const actor = immunizer ? await fromUuid(immunizer.actorUuid) : null;
  const ware = workingImmunizers(actor)[0];
  if (!ware || immunities(actor).includes(immunizer.name)) return false;
  await ware.setFlag("eclipsephase", "immunities", [...learnedBy(ware), immunizer.name]);
  await postCard(actor, { icon: "fa-shield-virus", color: "--positive", headline: game.i18n.format("ep2e.chat.dose.becameImmune", { name: immunizer.name }) });
  return true;
}

/**
 * Hangs the toxin filters on the roll pipeline: a passed SOM Check ends the dose, so does a pool
 * spend that turns it into a pass; a check the dose itself calls for gets the filters' +30.
 * @returns {void}
 */
export function registerDefenseHooks() {
  settleOnRoll("doseFilter", async (filter, passed, { byPool }) => {
    if (passed) await filterOut(filter);
    else if (!byPool) await letInPastFilter(filter);
  });
}

// Toxins that keep working while they run (Core p.334-335): Necrosis's DV 1d6 every action turn,
// BTX2's DV 2d10 + 10 for three turns, CR Gas's single DV 1d6, Disruptor's -5 to all actions that
// grows every hour. Everything is counted from the world time elapsed since the dose took hold,
// so a jump of the clock settles every tick it skipped at once.

const settling = new Map();

/**
 * How many seconds one tick of an effect over time lasts.
 * @param {String} interval - "turn" or "hour"
 * @returns {Number} Seconds per tick
 */
function intervalSeconds(interval) {
  if (interval === "hour") return SECONDS_PER.hours;
  return Number(CONFIG.time?.roundTime) || 3;
}

/**
 * How long a dose runs, in seconds, or Infinity for one that runs until ended.
 * @param {ActiveEffect} effect - The dose
 * @returns {Number} The span
 */
function doseSeconds(effect) {
  const { value, units } = effect?.duration ?? {};
  if (!Number.isFinite(value) || value <= 0) return Infinity;
  const unit = units === "rounds" || units === "turns" ? intervalSeconds("turn") : SECONDS_PER[units];
  return unit ? value * unit : Infinity;
}

/**
 * Seconds since the dose took hold.
 * @param {ActiveEffect} effect - The dose
 * @param {Number} now - The world time
 * @returns {Number} Elapsed seconds, never negative
 */
function elapsedSeconds(effect, now) {
  const start = Number(effect?.start?.time);
  return Number.isFinite(start) ? Math.max(0, now - start) : 0;
}

/**
 * Whether a drug does anything over time.
 * @param {Object} overTime - The drug's or the dose's overTime
 * @returns {Boolean} True for damage per tick or a growing modifier
 */
export function hasOverTime(overTime) {
  return !!diceFormula(overTime?.damage) || !!Number(overTime?.modifier);
}

/**
 * How many damage ticks are due by now. The first lands when the dose takes hold, then one per
 * interval, up to the drug's count or, without one, for as long as the dose runs.
 * @param {Object} overTime - The dose's overTime
 * @param {ActiveEffect} effect - The dose
 * @param {Number} now - The world time
 * @returns {Number} Ticks due in total
 */
export function damageTicksDue(overTime, effect, now) {
  if (!diceFormula(overTime?.damage)) return 0;
  const step = intervalSeconds(overTime.interval);
  const cap = Number(overTime.ticks) > 0 ? Number(overTime.ticks) : Math.floor(doseSeconds(effect) / step);
  return Math.min(Math.floor(elapsedSeconds(effect, now) / step) + 1, cap);
}

/**
 * How many steps a growing modifier has taken by now: one per full interval since the dose took
 * hold, the first after one interval (Core p.335: "every hour"), up to the dose's span.
 * @param {Object} overTime - The dose's overTime
 * @param {ActiveEffect} effect - The dose
 * @param {Number} now - The world time
 * @returns {Number} Steps in total
 */
export function modifierStepsDue(overTime, effect, now) {
  if (!Number(overTime?.modifier)) return 0;
  const step = intervalSeconds(overTime.interval);
  const cap = Math.max(1, Math.floor(doseSeconds(effect) / step));
  return Math.min(Math.floor(elapsedSeconds(effect, now) / step), cap);
}

/**
 * The damage of several ticks as one formula, e.g. 20d6 for twenty turns of Necrosis.
 * @param {Object} damage - {d10, d6, bonus} of one tick
 * @param {Number} ticks - How many ticks
 * @returns {String} The combined formula
 */
export function combinedDamage(damage, ticks) {
  return diceFormula({ d10: (Number(damage?.d10) || 0) * ticks, d6: (Number(damage?.d6) || 0) * ticks, bonus: (Number(damage?.bonus) || 0) * ticks });
}

/**
 * Splits one roll for several ticks back into the ticks it stands for: each takes its own dice, in
 * the order they were rolled, plus the flat bonus of one tick.
 * @param {Roll} roll - The evaluated combined roll
 * @param {Object} damage - {d10, d6, bonus} of one tick
 * @param {Number} ticks - How many ticks the roll covers
 * @returns {Object[]} One dice breakdown per tick: tens, sixes, bonus as shown, total and its number
 */
export function tickBreakdowns(roll, damage, ticks) {
  const per = { 10: Number(damage?.d10) || 0, 6: Number(damage?.d6) || 0 };
  const bonus = Number(damage?.bonus) || 0;
  const pools = { 10: [], 6: [] };
  for (const die of roll?.dice ?? []) {
    if (pools[die.faces]) pools[die.faces].push(...(die.results ?? []).filter(result => result.active !== false));
  }
  if (!pools[10].length && !pools[6].length) return [{ tens: [], sixes: [], hundreds: [], bonus: "", total: roll.total, rollNumber: 1, rollType: "rollOutput" }];

  return Array.from({ length: ticks }, (_, tick) => {
    const tens = pools[10].slice(tick * per[10], (tick + 1) * per[10]);
    const sixes = pools[6].slice(tick * per[6], (tick + 1) * per[6]);
    const total = [...tens, ...sixes].reduce((sum, result) => sum + result.result, 0) + bonus;
    return { tens, sixes, hundreds: [], bonus: bonus ? signed(bonus) : "", total, rollNumber: tick + 1, rollType: "rollOutput" };
  });
}

/**
 * Rolls the damage of the ticks that came due in one roll, then deals it tick by tick, so each
 * tick is measured against the Wound Threshold on its own. Armour does not stop a toxin; defensive
 * ware that halves the dose halves each tick, rounded up.
 * @param {Actor} actor - The actor the dose is on
 * @param {Object} dose - The dose flag
 * @param {Number} ticks - How many ticks to roll
 * @returns {Promise<Number[]>} The damage of each tick
 */
async function dealTickDamage(actor, dose, ticks) {
  const roll = await new Roll(combinedDamage(dose.overTime.damage, ticks)).evaluate();
  const perTick = tickBreakdowns(roll, dose.overTime.damage, ticks).map(tick => dose.defense?.halved ? { ...tick, total: halveUp(tick.total) } : tick);
  const output = {
    type: "defaultDamage",
    copy: game.i18n.format("ep2e.chat.dose.overTimeFlavor", { name: dose.name, count: ticks }),
    rollTitle: "ep2e.roll.announce.total",
    diceArray: perTick.length > 1 ? perTick : null
  };
  const posted = await rollToChat(null, output, WEAPON_DAMAGE_OUTPUT, roll, actor.name, actorAudience(actor), false, "rollOutput");
  const result = await applyDamage(actor, perTick.map(tick => tick.total));
  await appendDamageLines(posted, [damageLine(actor, result)]);
  return perTick.map(tick => tick.total);
}

/**
 * Sets a growing modifier on the dose: one change on the modifier to all actions, kept apart from
 * the drug's own changes by its index, rewritten as it grows.
 * @param {ActiveEffect} effect - The dose
 * @param {Object} state - The dose's overTimeState
 * @param {Number} value - The modifier now
 * @returns {Promise<Number>} The index of the change
 */
async function setGrowingModifier(effect, state, value) {
  const changes = foundry.utils.deepClone(effect.system?.changes ?? effect.changes ?? []);
  const change = { key: GLOBAL_MOD_KEY, value: String(value), priority: null, type: "add" };
  let index = Number.isInteger(state.changeIndex) ? state.changeIndex : -1;
  if (index >= 0 && index < changes.length) changes[index] = change;
  else index = changes.push(change) - 1;
  await effect.update({ "system.changes": changes, "flags.eclipsephase.dose.overTimeState.changeIndex": index });
  return index;
}

/**
 * Incapacitates the actor once a growing penalty reaches their Durability - Disruptor's paralysis.
 * Lasts as long as the dose and goes with it.
 * @param {Actor} actor - The actor
 * @param {ActiveEffect} effect - The dose
 * @param {Object} dose - The dose flag
 * @param {Number} value - The penalty now
 * @returns {Promise<Boolean>} True when the condition was put on
 */
async function incapacitateAtDurability(actor, effect, dose, value) {
  const durability = Number(actor.system?.health?.physical?.max) || 0;
  if (!dose.overTime.incapacitates || !durability || Math.abs(value) < durability) return false;
  const already = Array.from(actor.effects ?? []).some(entry => entry.getFlag?.("eclipsephase", "incapacitatedBy") === effect.id);
  if (already) return false;
  await actor.createEmbeddedDocuments("ActiveEffect", [conditionData(dose.name, effect, "incapacitated", null)]);
  await postCard(actor, { icon: "fa-syringe", color: "--negative", headline: game.i18n.format("ep2e.chat.dose.outcomeIncapacitated", { name: dose.name }) });
  return true;
}

/**
 * Whether the dose on an unlinked token is only the world actor's own dose shown on it. The world
 * actor's dose does the work; its copies on the tokens would deal every tick once more.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The dose
 * @returns {Boolean} True for an inherited copy
 */
function inheritedCopy(actor, effect) {
  return actor?.isToken === true && Array.from(actor.token?.baseActor?.effects ?? []).some(entry => entry.id === effect.id);
}

/**
 * Brings one dose's effects over time up to the world time: deals the damage of every tick due
 * and not yet dealt, grows the modifier to the steps due. The progress is written to the dose
 * before anything is rolled, so a second call cannot deal the same tick twice. A dose Foundry has
 * marked expired no longer applies, but is still settled up to its end - the ticks are capped by
 * its span - so a clock jump past the end deals what fell due before it.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The dose
 * @param {Number} [now] - The world time
 * @returns {Promise<Object|null>} ticks and steps settled, or null when nothing was due
 */
export async function settleOverTime(actor, effect, now = game.time.worldTime) {
  const dose = effect?.getFlag?.("eclipsephase", "dose");
  if (!dose || !hasOverTime(dose.overTime) || effect.disabled || inheritedCopy(actor, effect)) return null;
  const state = dose.overTimeState ?? {};
  const ticks = damageTicksDue(dose.overTime, effect, now) - (Number(state.ticks) || 0);
  const steps = modifierStepsDue(dose.overTime, effect, now);
  const grew = steps !== (Number(state.steps) || 0);
  if (ticks <= 0 && !grew) return null;

  await effect.update({
    "flags.eclipsephase.dose.overTimeState.ticks": (Number(state.ticks) || 0) + Math.max(0, ticks),
    "flags.eclipsephase.dose.overTimeState.steps": steps
  });
  if (grew) {
    const value = Number(dose.overTime.modifier) * steps;
    await setGrowingModifier(effect, state, value);
    await incapacitateAtDurability(actor, effect, dose, value);
  }
  if (ticks > 0) await dealTickDamage(actor, dose, ticks);
  return { ticks: Math.max(0, ticks), steps };
}

/**
 * Settles a dose one call at a time: a call arriving while the dose is still being settled runs
 * once more after it, never alongside it, and resolves only once that run is done.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The dose
 * @returns {Promise<void>} Resolves once settled
 */
function settleInTurn(actor, effect) {
  const key = effect.uuid ?? effect.id;
  const running = settling.get(key);
  if (running) {
    running.again = true;
    return running.done;
  }
  const entry = { again: false, done: null };
  settling.set(key, entry);
  entry.done = (async () => {
    try {
      do {
        entry.again = false;
        await settleOverTime(actor, effect);
      } while (entry.again && Array.from(actor.effects ?? []).some(candidate => candidate.id === effect.id));
    } finally {
      settling.delete(key);
    }
  })();
  return entry.done;
}

/**
 * Every dose with effects over time that is running anywhere: on the world's actors, and on the
 * unlinked tokens whose effects Foundry tracks.
 * @returns {Object[]} actor and effect per dose
 */
function dosesOverTime() {
  const found = new Map();
  const consider = effect => {
    const actor = effect?.parent;
    if (!actor || !(actor instanceof Actor) || effect.getFlag?.("eclipsephase", "dose") === undefined) return;
    if (!hasOverTime(effect.getFlag("eclipsephase", "dose").overTime)) return;
    found.set(effect.uuid ?? `${actor.uuid}.${effect.id}`, { actor, effect });
  };
  for (const actor of game.actors ?? []) for (const effect of actor.effects ?? []) consider(effect);
  for (const effect of foundry.documents.ActiveEffect?.registry ?? []) consider(effect);
  return [...found.values()];
}

/**
 * Runs the effects over time on the active GM's client: when a dose takes hold or is renewed, so a
 * first tick lands at once, and whenever the world time moves - the clock, or a new combat round.
 * Foundry's own duration report is not enough: it only fires when the remaining time changes in
 * the dose's own unit, so an hour-long BTX2 would report nothing until its hour ran out.
 * @returns {void}
 */
export function registerOverTimeHooks() {
  Hooks.on("createActiveEffect", effect => {
    if (!game.users.activeGM?.isSelf || effect.getFlag?.("eclipsephase", "dose") === undefined) return;
    const actor = effect.parent;
    if (actor) settleInTurn(actor, effect);
  });
  Hooks.on("updateActiveEffect", (effect, changes) => {
    if (!game.users.activeGM?.isSelf || changes?.start === undefined || effect.getFlag?.("eclipsephase", "dose") === undefined) return;
    const actor = effect.parent;
    if (actor) settleInTurn(actor, effect);
  });
  Hooks.on("updateWorldTime", () => {
    if (!game.users.activeGM?.isSelf) return;
    for (const { actor, effect } of dosesOverTime()) settleInTurn(actor, effect);
  });
}

// Traits, sleights and the like a dose lends for as long as it runs - Fokus's Enhanced Behavior:
// Obsessive, Schizo's Schizophrenia, Psi-Opener's chi sleight. Authored on the drug as rows of
// { pack, folder, item, title, description, or }: a row names a compendium, optionally a folder in
// it, and an item or "random". Rows are granted together unless an "or" row starts a new package;
// one package is then picked at even odds.

export const RANDOM = "random";

/**
 * The id of the folder a folder sits in, whether Foundry hands the parent as a document or an id.
 * @param {Object} folder - A compendium folder
 * @returns {String|null} The parent's id
 */
function parentId(folder) {
  if (!folder?.folder) return null;
  return typeof folder.folder === "string" ? folder.folder : folder.folder.id ?? null;
}

/**
 * A compendium's folders as a flat list in tree order, each with its depth.
 * @param {Object[]} folders - The pack's folders
 * @returns {Object[]} id, name and depth per folder
 */
export function folderTree(folders = []) {
  const list = Array.from(folders);
  const out = [];
  const walk = (parent, depth) => {
    list.filter(folder => parentId(folder) === parent)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(folder => {
        out.push({ id: folder.id, name: folder.name, depth });
        walk(folder.id, depth + 1);
      });
  };
  walk(null, 0);
  return out;
}

/**
 * A folder and every folder below it.
 * @param {Object[]} folders - The pack's folders
 * @param {String} folderId - The folder
 * @returns {Set<String>} Its id and the ids beneath it
 */
export function folderSubtree(folders = [], folderId) {
  const list = Array.from(folders);
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of list) {
      if (!ids.has(folder.id) && ids.has(parentId(folder))) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * The items a row can draw from: everything in its folder and the folders beneath, or the whole
 * compendium when no folder is set.
 * @param {Object[]} index - The pack's index entries
 * @param {Object[]} folders - The pack's folders
 * @param {String} folderId - The row's folder, or "" for the whole pack
 * @returns {Object[]} The index entries, by name
 */
export function rowCandidates(index = [], folders = [], folderId = "") {
  const entries = Array.from(index);
  const inScope = folderId ? folderSubtree(folders, folderId) : null;
  return entries
    .filter(entry => !inScope || inScope.has(typeof entry.folder === "string" ? entry.folder : entry.folder?.id ?? null))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The rows split into the packages one of which a dose grants: a row marked "or" starts a new
 * package, every other row joins the one before it. Rows without a compendium are ignored.
 * @param {Object[]} grants - The drug's rows
 * @returns {Object[][]} The packages
 */
export function grantPackages(grants = []) {
  const packages = [];
  for (const row of grants) {
    if (!row?.pack) continue;
    if (!packages.length || row.or === true) packages.push([]);
    packages.at(-1).push(row);
  }
  return packages;
}

/**
 * Picks one entry at even odds.
 * @param {Array} list - What to pick from
 * @param {Function} random - Returns a number in [0, 1)
 * @returns {*} The entry, or undefined for an empty list
 */
function pick(list, random) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/**
 * The item a row stands for, as source data ready to be put on a sheet: the GM's additional title
 * in brackets after its name, their additional description above its own. A random row draws only
 * from what the actor does not have yet.
 * @param {Object} row - The row
 * @param {Function} [random] - Returns a number in [0, 1)
 * @param {Actor} [actor] - The actor it is for
 * @returns {Promise<Object|null>} The item data, or null when the row finds nothing
 */
export async function resolveGrant(row, random = Math.random, actor = null) {
  const pack = game.packs.get(row.pack);
  if (!pack) return null;
  let id = row.item && row.item !== RANDOM ? row.item : null;
  if (!id) {
    const owned = entry => Array.from(actor?.items ?? []).some(item => item.type === entry.type && item.name === entry.name);
    const candidates = rowCandidates(await pack.getIndex({ fields: ["folder"] }), pack.folders, row.folder).filter(entry => !owned(entry));
    id = pick(candidates, random)?._id ?? null;
  }
  const document = id ? await pack.getDocument(id) : null;
  if (!document) return null;

  const data = cloneCompendiumItem(document);
  const title = String(row.title ?? "").trim();
  if (title) data.name = `${data.name} (${title})`;
  const prepared = String(row.description ?? "").trim();
  if (prepared) data.system.description = `<p>${prepared}</p>${data.system.description ?? ""}`;
  return data;
}

/**
 * Whether the actor already has exactly this item: the same name and type and, word for word, the
 * same description. One that differs at all is granted as well.
 * @param {Actor} actor - The actor
 * @param {Object} data - The item data
 * @returns {Boolean} True for an exact match
 */
export function alreadyHas(actor, data) {
  return Array.from(actor.items ?? []).some(item =>
    item.type === data.type && item.name === data.name && (item.system?.description ?? "") === (data.system?.description ?? ""));
}

/**
 * Settles where a granted item sits: a trait goes to the body the ego is sleeved in, unless it can
 * only be an ego trait. Anything else is put on as it comes.
 * @param {Actor} actor - The actor
 * @param {Object} data - The item data, changed in place
 * @returns {Object} The data
 */
export function placeGrant(actor, data) {
  if (data.type !== "traits") return data;
  const system = data.system;
  const { bodies, boundToFor } = getBodyBindingInfo(actor);
  const body = bodies.find(entry => entry.id === actor.system?.activeMorph) ?? bodies[0];
  if (system.morph === true && (body || actor.type !== "character")) {
    system.ego = false;
    system.boundTo = body ? boundToFor(body) : "activeMorph";
  }
  else if (system.ego === true) {
    system.morph = false;
  }
  return data;
}

/**
 * The Psi or Ki trait a granted sleight needs and the actor lacks, as the drop of a sleight would
 * offer it: Psi I for a chi sleight, Psi II for a gamma one. Nothing when the actor already has
 * the tier or a higher one, when the same grant brings it, or when the actor follows another
 * strain family.
 * @param {Actor} actor - The actor
 * @param {Object} data - The granted item's data
 * @param {Object[]} incoming - What the grant brings so far
 * @returns {Promise<Object|null>} The trait's data, or null when none is needed
 */
async function missingTierTrait(actor, data, incoming) {
  if (data.type !== "aspect") return null;
  const family = data.system?.strainFamily ?? "psi";
  if (ownsOtherFamily(actor, family)) return null;
  const needed = neededTierTrait(actor, data);
  if (!needed || incoming.some(entry => entry.type === "traits" && entry.name === needed.trait.name)) return null;
  const trait = await findTrait(needed.trait);
  if (!trait) return null;
  return cloneCompendiumItem(trait);
}

/**
 * Puts what a dose grants on the actor: one package of its rows, each row's item placed and marked
 * as lent by the dose, so it goes again with it. Posts a card naming what was granted.
 * @param {Actor} actor - The actor the dose is on
 * @param {ActiveEffect} effect - The running dose
 * @param {Function} [random] - Returns a number in [0, 1)
 * @returns {Promise<Item[]>} The items granted
 */
export async function grantTemporaryItems(actor, effect, random = Math.random) {
  const dose = effect?.getFlag?.("eclipsephase", "dose");
  const packages = grantPackages(dose?.grants);
  if (!packages.length) return [];

  const rows = pick(packages, random);
  const incoming = [];
  const lend = data => {
    foundry.utils.setProperty(data, "flags.eclipsephase.grantedBy", effect.id);
    incoming.push(placeGrant(actor, data));
  };
  for (const row of rows) {
    const data = await resolveGrant(row, random, actor);
    if (!data || alreadyHas(actor, data)) continue;
    lend(data);
    const tierTrait = await missingTierTrait(actor, data, incoming);
    if (tierTrait) lend(tierTrait);
  }
  if (!incoming.length) return [];

  const created = await actor.createEmbeddedDocuments("Item", incoming);
  await postCard(actor, {
    icon: "fa-syringe",
    color: "--negative",
    headline: game.i18n.format("ep2e.chat.dose.granted", { name: dose.name, items: created.map(item => item.name).join(", ") })
  });
  return created;
}

/**
 * Hangs the grants on the dose: granted on the active GM's client when a dose takes hold - a
 * renewal keeps what was granted - and taken off again, by whoever removed it, when the dose ends.
 * @returns {void}
 */
export function registerGrantHooks() {
  Hooks.on("createActiveEffect", effect => {
    if (!game.users.activeGM?.isSelf) return;
    const dose = effect.getFlag?.("eclipsephase", "dose");
    const actor = effect.parent;
    if (dose?.grants?.length && actor instanceof Actor) grantTemporaryItems(actor, effect);
  });
}

// Addiction (Core p.330, trait p.76). Whether a character over-uses a drug is the GM's call, so the
// system only keeps count and puts the WIL Check one click away on every dose card, for the GM.
// A failed check acquires the Addiction trait for that drug - level I, then one level more with
// every further failure - on the ego for a mental addiction, on the morph for a physical one.
// Withdrawal is left to the table.

const DAY = SECONDS_PER.days;
const WEEK = 7 * DAY;
const TRAITS = "eclipsephase.traits";
const ADDICTION_I = "Addiction I";

/**
 * A drug's addiction as its sheet records it: the type and the modifier for the WIL Check.
 * @param {Object} system - The drug's system data
 * @returns {Object|null} type ("physical", "mental" or "both") and modifier, or null for a drug that is not addictive
 */
export function drugAddiction(system) {
  const type = system?.addictionType;
  if (!["physical", "mental", "both"].includes(type)) return null;
  const raw = system.addictionMod;
  const modifier = typeof raw === "number" ? raw : parseAddictionMod(raw) ?? 0;
  return { type, modifier };
}

/**
 * The times an actor took each drug in the last week, by drug name.
 * @param {Actor} actor - The actor
 * @returns {Object} Drug name to world times
 */
function doseLog(actor) {
  const log = actor?.getFlag?.("eclipsephase", "doseLog");
  return log && typeof log === "object" ? log : {};
}

/**
 * Notes that the actor took a dose of a drug now, forgetting what is older than a week.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {Number} [now] - The world time
 * @returns {Promise<void>} Resolves once noted
 */
export async function logDose(actor, name, now = game.time.worldTime) {
  if (!actor || !name) return;
  const log = Object.fromEntries(Object.entries(doseLog(actor))
    .map(([drug, times]) => [drug, (times ?? []).filter(time => now - time < WEEK)])
    .filter(([, times]) => times.length));
  log[name] = [...(log[name] ?? []), now];
  await actor.setFlag("eclipsephase", "doseLog", log);
}

/**
 * How often the actor took a drug in the last 24 hours and the last 7 days.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {Number} [now] - The world time
 * @returns {Object} day and week counts
 */
export function doseCounts(actor, name, now = game.time.worldTime) {
  const times = doseLog(actor)[name] ?? [];
  return { day: times.filter(time => now - time < DAY).length, week: times.filter(time => now - time < WEEK).length };
}

/**
 * The GM's controls a dose card carries for an addictive drug: the actor and the drug they took.
 * @param {Actor} actor - Who took it
 * @param {Object} dose - The dose flag
 * @returns {Object|null} What the card template needs, or null for a drug that is not addictive
 */
export function addictionControls(actor, dose) {
  return dose?.addiction ? { actorUuid: actor.uuid, name: dose.name } : null;
}

/**
 * Shows the GM how often the actor took the drug recently.
 * @param {String} actorUuid - The actor
 * @param {String} name - The drug's name
 * @returns {Promise<void>} Resolves once the dialog is closed
 */
export async function showDoseHistory(actorUuid, name) {
  const actor = await fromUuid(actorUuid);
  if (!actor) return;
  const { day, week } = doseCounts(actor, name);
  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("ep2e.dialog.doseHistory.header") },
    classes: ["ep2e-primary-right"],
    content: `<p>${game.i18n.format("ep2e.dialog.doseHistory.copy", { actor: actor.name, name, day, week })}</p>`,
    buttons: [{ action: "ok", label: game.i18n.localize("ep2e.actorSheet.button.confirm"), default: true, callback: () => ({ ok: true }) }],
    position: { width: 340 },
    modal: true,
    rejectClose: false
  });
}

/**
 * The drug's addiction, read from the dose the actor last took of it or from a pack they carry.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {Object} [fallback] - The addiction a card already knows
 * @returns {Object|null} type and modifier
 */
function knownAddiction(actor, name, fallback = null) {
  if (fallback) return fallback;
  const dose = Array.from(actor?.effects ?? []).map(effect => effect.getFlag?.("eclipsephase", "dose")).find(entry => entry?.name === name);
  if (dose?.addiction) return dose.addiction;
  const pack = Array.from(actor?.items ?? []).find(item => item.type === "drug" && item.name === name);
  return pack ? drugAddiction(pack.system) : null;
}

/**
 * The GM demands the WIL Check: a card for the actor's owners to roll it from.
 * @param {String} actorUuid - The actor
 * @param {String} name - The drug's name
 * @param {Object} [addiction] - type and modifier, when the caller knows them
 * @returns {Promise<ChatMessage|null>} The card, or null when the drug is not addictive
 */
export async function demandWillpower(actorUuid, name, addiction = null) {
  const actor = await fromUuid(actorUuid);
  const known = knownAddiction(actor, name, addiction);
  if (!actor || !known) return null;
  return postCheckCard(actor, "addictionCheck", {
    card: { icon: "fa-brain", color: "--negative", headline: game.i18n.format("ep2e.chat.dose.addictionCheckNeeded", { name, modifier: signed(known.modifier) }) },
    button: { action: "rollAddictionCheck", label: game.i18n.format("ep2e.chat.dose.rollAddictionCheck", { modifier: signed(known.modifier) }) },
    payload: { name, ...known }
  });
}

/**
 * Turns an addiction check card into a record once it is rolled. Done where the card may be
 * changed; a player rolling from the GM's card asks the active GM.
 * @param {ChatMessage} message - The card
 * @returns {Promise<void>} Resolves once marked or asked
 */
export function markAddictionCardRolled(message) {
  return markCardRolled(message, "addictionCheck");
}

/**
 * Rolls the WIL Check from its card, once; the card keeps a note instead of its button.
 * @param {String} messageId - The card
 * @param {Object} [systemOptions] - Passed on to RollCheck; tests answer the dialog through it
 * @returns {Promise<*>} Whatever the roll returned, or null when nothing was rolled
 */
export async function requestAddictionCheck(messageId, systemOptions = {}) {
  const message = game.messages.get(messageId);
  const request = message?.getFlag?.("eclipsephase", "addictionCheck");
  if (!request || request.rolled) return null;
  const actor = await fromUuid(request.actorUuid);
  if (!actor) return null;

  await markAddictionCardRolled(message);
  const check = { actorUuid: actor.uuid, name: request.name, type: request.type, modifier: request.modifier, checkId: messageId };
  return rollAptitudeCheck(actor, "wil", { addictionCheck: check }, systemOptions);
}

/**
 * The addiction trait the actor has to this drug on the ego (mental) or on a body (physical), and
 * its level.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {String} kind - "mental" or "physical"
 * @returns {Object|null} item and level (1-3), or null when there is none
 */
export function addictionOf(actor, name, kind) {
  for (const item of actor?.items ?? []) {
    const match = item.type === "traits" && item.name.match(/^Addiction (I{1,3}) \((.+)\)$/);
    if (!match || match[2] !== name) continue;
    if ((kind === "mental") !== (item.system?.ego === true)) continue;
    return { item, level: match[1].length };
  }
  return null;
}

/**
 * Whether the actor already has an addiction to this drug, at any level.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @returns {Boolean} True when one is on the sheet
 */
export function addictedTo(actor, name) {
  return !!(addictionOf(actor, name, "mental") || addictionOf(actor, name, "physical"));
}

/**
 * The Addiction trait of one level for one drug, from the compendium: titled with the drug, on the
 * ego for a mental addiction, on the sleeved biomorph for a physical one.
 * @param {Actor} actor - The actor
 * @param {String} name - The drug's name
 * @param {String} kind - "mental" or "physical"
 * @param {Number} level - 1 to 3
 * @param {String} checkId - The check that caused it
 * @returns {Promise<Object|null>} The trait data, or null when it cannot be placed
 */
async function addictionTrait(actor, name, kind, level, checkId) {
  const traitName = `Addiction ${"I".repeat(level)}`;
  const document = await findCompendiumItem(TRAITS, traitName);
  if (!document) return null;
  const data = cloneCompendiumItem(document);
  data.name = `${traitName} (${name})`;
  foundry.utils.setProperty(data, "flags.eclipsephase.addictionFrom", checkId);
  if (kind === "mental") {
    data.system.ego = true;
    data.system.morph = false;
    return data;
  }
  const { bodies, boundToFor } = getBodyBindingInfo(actor);
  const body = bodies.find(item => item.id === actor.system?.activeMorph);
  if (actor.type === "character" && body?.system?.type !== "bio") return null;
  data.system.ego = false;
  data.system.morph = true;
  data.system.boundTo = body ? boundToFor(body) : "activeMorph";
  return data;
}

/**
 * Gives the actor the addiction a failed check earned: Addiction I to start with, and one level
 * more each time after - the new level replacing the old - up to Addiction III. A drug that is
 * both mental and physical hooks ego and body each on its own.
 * @param {Object} check - The addictionCheck the roll carried
 * @returns {Promise<Item[]>} The traits added
 */
export async function becomeAddicted(check) {
  const actor = check ? await fromUuid(check.actorUuid) : null;
  if (!actor) return [];
  const kinds = check.type === "both" ? ["mental", "physical"] : [check.type];
  const incoming = [];
  const replaced = [];
  let level = 0;
  for (const kind of kinds) {
    const current = addictionOf(actor, check.name, kind);
    const next = (current?.level ?? 0) + 1;
    if (next > 3) continue;
    const data = await addictionTrait(actor, check.name, kind, next, check.checkId);
    if (!data) continue;
    if (current) {
      foundry.utils.setProperty(data, "flags.eclipsephase.addictionReplaced", current.item.toObject());
      replaced.push(current.item.id);
    }
    incoming.push(data);
    level = Math.max(level, next);
  }
  if (!incoming.length) return [];

  if (replaced.length) await actor.deleteEmbeddedDocuments("Item", replaced);
  const created = await actor.createEmbeddedDocuments("Item", incoming);
  const where = incoming.length > 1 ? "Both" : incoming[0].system.ego ? "Ego" : "Body";
  const key = level > 1 ? `ep2e.chat.dose.addictionRaised${where}` : `ep2e.chat.dose.addicted${where}`;
  await postCard(actor, { icon: "fa-brain", color: "--negative", headline: game.i18n.format(key, { name: check.name, level: "I".repeat(level) }) });
  return created;
}

/**
 * Takes back an addiction a pool spend turned into a pass, bringing back the level it replaced.
 * @param {Object} check - The addictionCheck the roll carried
 * @returns {Promise<void>} Resolves once undone
 */
async function undoAddiction(check) {
  const actor = check ? await fromUuid(check.actorUuid) : null;
  const traits = Array.from(actor?.items ?? []).filter(item => item.getFlag?.("eclipsephase", "addictionFrom") === check.checkId);
  if (!traits.length) return;
  const restore = traits.map(item => item.getFlag("eclipsephase", "addictionReplaced")).filter(Boolean);
  await actor.deleteEmbeddedDocuments("Item", traits.map(item => item.id));
  if (restore.length) await actor.createEmbeddedDocuments("Item", restore.map(({ _id, ...data }) => data));
}

/**
 * Hangs the addiction check on the roll pipeline: the drug's addiction modifier lands on it, a
 * failure adds the trait, and a pool spend that turns it into a pass takes the trait back.
 * @returns {void}
 */
export function registerAddictionHooks() {
  modifiersOnRoll("addictionCheck", check => [check.modifier && new TaskRollModifier(game.i18n.format("ep2e.chat.dose.addictionModifier", { name: check.name }), check.modifier)]);
  settleOnRoll("addictionCheck", async (check, passed, { byPool }) => {
    if (byPool && passed) await undoAddiction(check);
    else if (!byPool && !passed) await becomeAddicted(check);
  });
}

/**
 * Hangs everything a dose does on Foundry's and the roll pipeline's hooks: the wear-off card and
 * what a dose leaves behind, doses from attacks, the checks on taking, effects over time, lent
 * items, defensive ware and addiction.
 * @returns {void}
 */
export function registerDrugHooks() {
  registerDoseHooks();
  registerChemicalAttacks();
  registerUseCheckHooks();
  registerOverTimeHooks();
  registerGrantHooks();
  registerDefenseHooks();
  registerAddictionHooks();
}
