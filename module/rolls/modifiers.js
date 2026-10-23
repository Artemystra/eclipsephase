import { signed } from "./dice.js";
import { boundToActiveBody } from "../common/morp-functions.js";
import { isChecked, escapeText } from "../common/general-sheet-functions.js";
import { registerCard, renderCard, updateCard } from "../common/chat-cards.js";

// What an actor's items and effects contribute to a roll beyond its skill and aptitude, in one
// place for the roll pipeline:
// - situational options: conditional modifiers the player ticks when the situation applies - a
//   drug's Juice +30 against fear, a ware's Grip Pads +30 when climbing. Authored as { id, label,
//   value, appliesTo, replacesGlobal?, replacesFlat?, random?, automatic?, specialSkill? }; on a
//   drug they travel on the dose's flag while it runs, on ware they are read off the ware while it
//   sits in the active body;
// - standing modifiers "to all actions" - Twitch's -20 - summed into one intoxicated line;
// - what running doses do beyond their changes - a drug blocking psi, a psi penalty, a healing
//   addition.
// This file must never import doses.js: doses.js imports the roll pipeline, which imports this.

const FALLBACK_LABEL = "ep2e.roll.announce.globalEffects";
const INTOXICATED_LABEL = "ep2e.roll.announce.intoxicated";

/**
 * What a check is, for matching options against it: the skill key, the aptitude it is made with,
 * and "know" for a Know skill.
 * @param {Actor} actor - The rolling actor
 * @param {Object} dataset - The roll's dataset as the sheet hands it to RollCheck
 * @returns {Set<String>} Lower-case keys the check answers to
 */
export function checkKeys(actor, dataset = {}) {
  const keys = new Set();
  if (dataset.apttype) keys.add(String(dataset.apttype).toLowerCase());
  if (dataset.key) keys.add(String(dataset.key).toLowerCase());
  const isKnow = actor?.items?.some?.(item => item.type === "knowSkill" && item.name === dataset.key);
  if (isKnow) keys.add("know");
  return keys;
}

/**
 * An option's value as the dialog shows it: signed, or "±" for one decided by chance.
 * @param {Object} option - The option
 * @returns {String} e.g. "+30", "-30" or "±10"
 */
function shownValue(option) {
  const value = Number(option.value) || 0;
  if (option.random) return `±${Math.abs(value)}`;
  return signed(value);
}

/**
 * The conditional modifiers the actor's running doses offer for this check. An option without an
 * appliesTo list is offered on every check.
 * @param {Actor} actor - The rolling actor
 * @param {Object} dataset - The roll's dataset
 * @returns {Object[]} One entry per option: field (the dialog's checkbox name), drug, the option
 *   itself and its value as shown
 */
export function doseRollOptions(actor, dataset) {
  const keys = checkKeys(actor, dataset);
  const offered = [];
  for (const effect of actor?.effects ?? []) {
    const dose = effect.getFlag?.("eclipsephase", "dose");
    if (!dose || !effect.active) continue;
    for (const option of dose.rollOptions ?? []) {
      const applies = !option.appliesTo?.length || option.appliesTo.some(key => keys.has(String(key).toLowerCase()));
      if (!applies) continue;
      offered.push({ field: `doseOption-${effect.id}-${option.id}`, drug: dose.name ?? effect.name, option, shown: shownValue(option) });
    }
  }
  return offered;
}

/**
 * Whether an option fits this check. A special-skill option - Hardware, Exotic Skill: Disguise -
 * fits the special skills the player picked for it on the ware, whatever they are called.
 * @param {Object} option - The option
 * @param {Set<String>} keys - What the check answers to
 * @param {Object} dataset - The roll's dataset
 * @returns {Boolean} True when it is offered
 */
function optionFits(option, keys, dataset) {
  const picked = (option.specialSkills ?? []).map(name => String(name).toLowerCase());
  if (option.specialSkill && picked.includes(String(dataset?.key ?? "").toLowerCase())) return true;
  if (option.specialSkill && !option.appliesTo?.length) return false;
  return !option.appliesTo?.length || option.appliesTo.some(key => keys.has(String(key).toLowerCase()));
}

/**
 * The conditional modifiers the ware working in the actor's body offers for this check.
 * @param {Actor} actor - The rolling actor
 * @param {Object} dataset - The roll's dataset
 * @returns {Object[]} One entry per option, as doseRollOptions gives them, with source "ware"
 */
export function wareRollOptions(actor, dataset) {
  const keys = checkKeys(actor, dataset);
  const offered = [];
  for (const item of actor?.items ?? []) {
    if (item.type !== "ware" || !Array.isArray(item.system?.rollOptions) || !boundToActiveBody(actor, item)) continue;
    for (const option of item.system.rollOptions) {
      if (!optionFits(option, keys, dataset)) continue;
      offered.push({ field: `wareOption-${item.id}-${option.id}`, drug: item.name, option, shown: shownValue(option), source: "ware" });
    }
  }
  return offered;
}

/**
 * The options the dialog came back with ticked, plus those that apply on their own whenever they
 * fit - Randomizer's coin flip on every social test - which the dialog never offers.
 * @param {Object[]} offered - What doseRollOptions offered
 * @param {Object} values - The dialog's answer, by field name
 * @returns {Object[]} The entries that apply to this roll
 */
export function chosenRollOptions(offered, values = {}) {
  return offered.filter(entry => entry.option.automatic || isChecked(values[entry.field]));
}

/**
 * The options the roll dialog shows as checkboxes: every offered one that does not apply on its own.
 * @param {Object[]} offered - What doseRollOptions offered
 * @returns {Object[]} The entries to show
 */
export function tickableRollOptions(offered) {
  return offered.filter(entry => !entry.option.automatic);
}

/**
 * The value a ticked option adds to the roll. A random option - Randomizer's coin flip - rolls its
 * sign: a d2 of 1 is a penalty, a 2 a bonus. One that replaces a flat bonus the roll already holds -
 * Mimicry's +30 instead of its +10 - adds only the difference.
 * @param {Object} option - The option
 * @returns {Promise<Number>} The modifier
 */
export async function optionValue(option) {
  if (!option.random) return (Number(option.value) || 0) - (Number(option.replacesFlat) || 0);
  const flip = await new Roll("1d2").evaluate();
  const size = Math.abs(Number(option.value) || 0);
  return flip.total === 1 ? -size : size;
}

/**
 * The drugs whose penalty to all actions a set of ticked options replaces for this roll.
 * @param {Object[]} chosen - The ticked entries
 * @returns {Set<String>} Drug names
 */
export function replacedDrugs(chosen) {
  return new Set(chosen.filter(entry => entry.option.replacesGlobal).map(entry => entry.drug));
}

export const GLOBAL_MOD_KEY = "system.mods.globalMod";

/**
 * The number a modifier value stands for. Foundry hands a change on a field without a default
 * through as written, so two string changes can arrive concatenated, "-20-20"; every signed number
 * in it counts.
 * @param {Number|String|null} value - The value as stored or as an effect change carries it
 * @returns {Number} The modifier, 0 when there is none
 */
export function modifierValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parts = String(value ?? "").match(/[+-]?\d+(?:\.\d+)?/g) ?? [];
  return parts.reduce((sum, part) => sum + Number(part), 0);
}

/**
 * A modifier as it reads in a breakdown, with its sign.
 * @param {String} name - What the modifier comes from
 * @param {Number} modifier - The modifier
 * @returns {String} e.g. "Twitch (-20)"
 */
function breakdownEntry(name, modifier) {
  return `${name} (${signed(modifier)})`;
}

/**
 * What the doses left out of a roll contribute to the actor's total, so the remainder line does
 * not bring them back.
 * @param {Actor} actor - The actor
 * @param {Set<String>} exclude - Drug names left out
 * @returns {Number} Their combined modifier
 */
function excludedTotal(actor, exclude) {
  if (!exclude.size) return 0;
  let total = 0;
  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    if (!effect.active || !exclude.has(effect.name) || effect.getFlag?.("eclipsephase", "dose") === undefined) continue;
    for (const change of effect.changes ?? []) if (change.key === GLOBAL_MOD_KEY) total += modifierValue(change.value);
  }
  return total;
}

/**
 * Every modifier to all actions currently on the actor. The running doses of drugs and toxins are
 * summed into one line labelled intoxicated, with the drugs it is made of as its comment, one per
 * line; any other effect keeps a line of its own, so the label never claims a drug where there is
 * none.
 * Whatever part of the actor's total no active effect explains - a value a module wrote straight
 * into the field - is listed once more under a general label, so the sum always matches.
 * @param {Actor} actor - The actor
 * @param {Object} [options] - exclude: drug names whose penalty a ticked roll option replaces
 * @returns {Object[]} label, modifier and, for the intoxicated line, comment; without zero entries
 */
export function globalModifiers(actor, { exclude = new Set() } = {}) {
  const doses = new Map();
  const others = new Map();
  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    if (!effect.active) continue;
    const isDose = effect.getFlag?.("eclipsephase", "dose") !== undefined;
    if (isDose && exclude.has(effect.name)) continue;
    const bucket = isDose ? doses : others;
    for (const change of effect.changes ?? []) {
      if (change.key !== GLOBAL_MOD_KEY) continue;
      bucket.set(effect.name, (bucket.get(effect.name) ?? 0) + modifierValue(change.value));
    }
  }

  const sources = [];
  const drugs = [...doses].filter(([, modifier]) => modifier);
  if (drugs.length) {
    sources.push({
      label: INTOXICATED_LABEL,
      modifier: drugs.reduce((sum, [, modifier]) => sum + modifier, 0),
      comment: drugs.map(([name, modifier]) => breakdownEntry(name, modifier)).join("\n")
    });
  }
  for (const [label, modifier] of others) if (modifier) sources.push({ label, modifier });

  const counted = sources.reduce((sum, entry) => sum + entry.modifier, 0);
  const total = modifierValue(actor?.system?.mods?.globalMod) - excludedTotal(actor, exclude);
  if (total !== counted) sources.push({ label: FALLBACK_LABEL, modifier: total - counted });
  return sources;
}

/**
 * The dose flags of every dose currently acting on the actor.
 * @param {Actor} actor - The actor
 * @returns {Object[]} One dose flag per running dose
 */
export function runningDoses(actor) {
  const doses = [];
  for (const effect of actor?.effects ?? []) {
    const dose = effect.getFlag?.("eclipsephase", "dose");
    if (dose && effect.active) doses.push(dose);
  }
  return doses;
}

/**
 * The drug blocking the actor's psi, if any - Inhibitor after a failed WIL Check.
 * @param {Actor} actor - The actor
 * @returns {String|null} The drug's name, or null when nothing blocks
 */
export function drugBlockingPsi(actor) {
  return runningDoses(actor).find(dose => dose.blocksPsi === true)?.name ?? null;
}

/**
 * The healing addition a running dose stands for - Meds - which the healing dialog starts on.
 * @param {Actor} actor - The actor
 * @returns {String} The addition's key, or "" when no dose stands for one
 */
export function drugHealingAddition(actor) {
  return runningDoses(actor).find(dose => dose.healingAddition)?.healingAddition ?? "";
}

/**
 * The penalties running doses put on Psi Tests - Inhibitor's -30 after a passed WIL Check.
 * @param {Actor} actor - The actor
 * @returns {Object[]} name and modifier per drug
 */
export function drugPsiPenalties(actor) {
  return runningDoses(actor)
    .filter(dose => Number(dose.psiPenalty))
    .map(dose => ({ name: dose.name, modifier: Number(dose.psiPenalty) }));
}

// Ware whose bonus applies to a special skill - Fractal Digits to Hardware, Skinflex to Exotic
// Skill: Disguise. Special skills are named freely ("HW: Robotics"), so the player says once, per
// ware, which of their special skills are meant; the choice is kept on the ware's options.

const SETUP_CARD = "systems/eclipsephase/templates/chat/ware-setup.html";

/**
 * Whether a ware item has a bonus for a kind of special skill.
 * @param {Item} item - The item
 * @returns {Boolean} True for ware with at least one such option
 */
export function hasSkillOptions(item) {
  return item?.type === "ware" && (item.system?.rollOptions ?? []).some(option => option.specialSkill);
}

/**
 * Whether the player still has to say which special skills a ware's bonus is for.
 * @param {Item} item - The item
 * @returns {Boolean} True until the choice was made once
 */
export function needsSkillSetup(item) {
  return hasSkillOptions(item) && item.getFlag?.("eclipsephase", "specialSkillsSet") !== true;
}

/**
 * The ware on an actor still waiting for that choice.
 * @param {Actor} actor - The actor
 * @returns {Item[]} The ware items
 */
export function wareAwaitingSetup(actor) {
  return Array.from(actor?.items ?? []).filter(needsSkillSetup);
}

/**
 * Writes the player's choice into the ware: each special-skill option gets the names of the
 * special skills it applies to, and the ware is marked as set up.
 * @param {Item} item - The ware
 * @param {Object} picks - Option id to the chosen special skill names
 * @returns {Promise<Item>} The ware
 */
export async function applySkillPicks(item, picks) {
  const rollOptions = (item.system.rollOptions ?? []).map(option =>
    option.specialSkill ? { ...option, specialSkills: picks[option.id] ?? [] } : option);
  await item.update({ "system.rollOptions": rollOptions, "flags.eclipsephase.specialSkillsSet": true });
  return item;
}

/**
 * The dialog's content: per special-skill option, a line saying what kind is meant, then a
 * checkbox for each of the actor's special skills.
 * @param {Actor} actor - The actor
 * @param {Item} item - The ware
 * @returns {HTMLElement} The content
 */
function setupContent(actor, item) {
  const skills = Array.from(actor.items ?? []).filter(entry => entry.type === "specialSkill").map(entry => entry.name).sort();
  const sections = item.system.rollOptions.filter(option => option.specialSkill).map(option => {
    const chosen = new Set(option.specialSkills ?? []);
    const boxes = skills.map((name, index) => {
      const id = `ware-skill-${escapeText(option.id)}-${index}`;
      return `<div class="form-group"><input type="checkbox" class="sheet" id="${id}" name="${escapeText(option.id)}" value="${escapeText(name)}"${chosen.has(name) ? " checked" : ""}/><label class="resource-label" for="${id}">${escapeText(name)}</label></div>`;
    }).join("");
    return `<p class="hint">${game.i18n.format(`ep2e.dialog.wareSkills.kind.${option.specialSkill}`, { ware: escapeText(item.name), bonus: game.i18n.localize(option.label) })}</p>${boxes}`;
  });
  const element = document.createElement("div");
  element.innerHTML = skills.length ? sections.join("") : `<p>${game.i18n.localize("ep2e.dialog.wareSkills.noSkills")}</p>`;
  return element;
}

/**
 * Asks which of the actor's special skills a ware's bonus applies to, and keeps the answer on the
 * ware. An actor without special skills is not asked; the ware is still marked, and the choice can
 * be made later from its sheet.
 * @param {Actor} actor - The actor
 * @param {Item} item - The ware
 * @returns {Promise<Boolean>} True once the choice is kept, false when cancelled
 */
export async function pickSpecialSkills(actor, item) {
  if (!hasSkillOptions(item)) return false;
  const skills = Array.from(actor.items ?? []).filter(entry => entry.type === "specialSkill");
  if (!skills.length) {
    await applySkillPicks(item, {});
    return true;
  }
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("ep2e.dialog.wareSkills.header", { ware: item.name }) },
    classes: ["ep2e-primary-right"],
    content: setupContent(actor, item),
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("ep2e.actorSheet.button.confirm"),
        default: true,
        callback: (event, button) => {
          const picks = {};
          for (const box of button.form.querySelectorAll("input[type=checkbox]:checked")) (picks[box.name] ??= []).push(box.value);
          return { picks };
        }
      },
      { action: "cancel", label: game.i18n.localize("ep2e.roll.dialog.button.cancel"), callback: () => ({ cancelled: true }) }
    ],
    position: { width: 380 },
    modal: true,
    rejectClose: false
  });
  if (!result?.picks) return false;
  await applySkillPicks(item, result.picks);
  return true;
}

/**
 * The entries a setup card lists for one user: every ware still waiting on the characters they own.
 * @param {User} user - The user
 * @returns {Object[]} actorUuid, itemId and label per ware
 */
export function setupEntries(user) {
  return game.actors.filter(actor => actor.type === "character" && actor.testUserPermission?.(user, "OWNER"))
    .flatMap(actor => wareAwaitingSetup(actor).map(item => ({ actorUuid: actor.uuid, itemId: item.id, label: `${actor.name}: ${item.name}` })));
}

registerCard("wareSetup", { render: state => setupCardContent(state.entries) });

/**
 * Renders a setup card: a button for each ware still waiting, or the note that all is done.
 * @param {Object[]} entries - What setupEntries listed
 * @returns {Promise<String>} The card's content
 */
async function setupCardContent(entries) {
  const open = [];
  for (const entry of entries) {
    const actor = fromUuidSync?.(entry.actorUuid);
    const item = actor?.items?.get?.(entry.itemId);
    if (item && needsSkillSetup(item)) open.push(entry);
  }
  return foundry.applications.handlebars.renderTemplate(SETUP_CARD, { entries: open, done: !open.length });
}

/**
 * Posts the card asking a user to set up the ware their characters carried into this version,
 * whispered to that user alone.
 * @param {User} [user] - The user, the current one by default
 * @returns {Promise<ChatMessage|null>} The card, or null when nothing waits
 */
export async function postWareSetupCard(user = game.user) {
  const entries = setupEntries(user);
  if (!entries.length) return null;
  return ChatMessage.create({
    speaker: { alias: "System" },
    whisper: [user.id],
    content: await renderCard("wareSetup", { entries }),
    flags: { eclipsephase: { wareSetup: { entries } } }
  });
}

/**
 * Answers a setup button: asks for the special skills, then redraws every setup card of the user,
 * so the button is gone - and "all done" shows once nothing is left.
 * @param {String} actorUuid - The actor
 * @param {String} itemId - The ware
 * @returns {Promise<void>} Resolves once the choice is kept and the cards redrawn
 */
export async function setupFromCard(actorUuid, itemId) {
  const actor = await fromUuid(actorUuid);
  const item = actor?.items?.get(itemId);
  if (!item || !(await pickSpecialSkills(actor, item))) return;
  for (const message of game.messages.filter(entry => entry.getFlag?.("eclipsephase", "wareSetup") && entry.isOwner)) {
    await updateCard(message, "wareSetup");
  }
}
