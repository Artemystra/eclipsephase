import { escapeText } from "./general-sheet-functions.js";
import { registerCard, renderCard, updateCard } from "./chat-cards.js";

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
