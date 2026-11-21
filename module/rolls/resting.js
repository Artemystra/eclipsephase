import { tempEffectDeletion, prepareRecipients } from "../common/general-sheet-functions.js";
import * as DICE from "./dice.js";
import { endAllChiPushes } from "./psi.js";
import { rechargeDurationKey } from "../common/recharge.js";

const REST_DISTRIBUTION_TEMPLATE = "systems/eclipsephase/templates/chat/rest-distribution.html";

const RECHARGE_DIALOG_TEMPLATE = "systems/eclipsephase/templates/chat/recharge-dialog.html";
// The short recharges in the order they are used; the third only with the extra recharge.
const SHORT_SLOTS = ["short1", "short2", "shortExtra"];

/**
 * Registers all resting-related event listeners on the actor sheet.
 * @param {HTMLElement} html   - The rendered sheet HTML
 * @param {Actor}       actor  - The actor document
 */
export function restingListeners(html, actor) {
  html.querySelectorAll(".rechargeButton").forEach(element => {
    element.addEventListener("click", () => openRechargeDialog(actor));
  });
  html.querySelectorAll(".ep-recharge-info").forEach(anchor => {
    anchor.addEventListener("mouseenter", () => placeRechargeFlyout(anchor));
  });
  _restResetListener(html, actor);
}

/**
 * Puts the recharge flyout right below the battery, flush with its left edge and without a gap, so
 * the pointer can move into it. The flyout is fixed so the sheet's edge does not cut it off; in a
 * window Foundry scales, fixed places it within the window, so the window's offset and scale are
 * taken out.
 * @param {HTMLElement} anchor - The battery the flyout belongs to
 * @returns {void}
 */
export function placeRechargeFlyout(anchor) {
  const flyout = anchor.querySelector("div[role=tooltip]");
  if (!flyout) return;
  const rect = anchor.getBoundingClientRect();
  const frame = anchor.closest(".application");
  const scaled = frame && getComputedStyle(frame).transform !== "none";
  const origin = scaled ? frame.getBoundingClientRect() : { left: 0, top: 0, width: 1 };
  const scale = scaled && frame.offsetWidth ? origin.width / frame.offsetWidth : 1;
  flyout.style.left = `${(rect.left - origin.left) / scale}px`;
  flyout.style.top = `${(rect.bottom - origin.top) / scale}px`;
}

/**
 * Fires the rest hook so a feature can extend the payload, then writes it to the actor.
 * @param {Actor} actorWhole - The resting actor
 * @param {String} restType - Either "short" or "long"
 * @param {Object} updates - The update payload the rest branch assembled
 * @returns {Promise} The actor update
 */
async function applyRest(actorWhole, restType, updates) {
  Hooks.callAll("eclipsephase.postRest", actorWhole, restType, updates);
  return actorWhole.update(updates);
}

/**
 * The recharges an actor still has this cycle (Core p.35: two short and one long per 24 hours, a
 * third short one with the extra recharge).
 * @param {Actor} actor - The actor
 * @returns {Object} long (Boolean), short (how many are left) and shortSlot (the next one's field)
 */
export function rechargesLeft(actor) {
  const rest = actor.system.rest ?? {};
  const slots = SHORT_SLOTS.filter(slot => slot !== "shortExtra" || actor.system.additionalSystems?.extraRest);
  const free = slots.filter(slot => !rest[slot]);
  return { long: !rest.long, short: free.length, shortSlot: free[0] ?? null };
}

/**
 * The battery's segments, for the sheet: the long recharge half as wide as the battery, the short
 * ones sharing the other half. Those still to be had come first, so the battery is full from the
 * left and empty from the right, and each keeps its size, so its kind still shows.
 * @param {Actor} actor - The actor
 * @returns {Object[]} flex (its share of the width) and used, left to right
 */
export function rechargeSegments(actor) {
  const rest = actor.system.rest ?? {};
  const shorts = SHORT_SLOTS.filter(slot => slot !== "shortExtra" || actor.system.additionalSystems?.extraRest);
  const long = { flex: shorts.length, used: !!rest.long };
  const short = shorts.map(slot => ({ flex: 1, used: !!rest[slot] }));
  return [long, ...short].filter(entry => !entry.used).concat([...short, long].filter(entry => entry.used));
}

/**
 * Asks which recharge to take and who sees it, in the style of a roll dialog, and takes it.
 * @param {Actor} actor - The resting actor
 * @returns {Promise<Boolean>} True when a recharge was taken
 */
export async function openRechargeDialog(actor) {
  const left = rechargesLeft(actor);
  if (!left.long && !left.short) {
    ui.notifications.warn(game.i18n.localize("ep2e.skills.restingMenu.warnings.noneLeft"));
    return false;
  }
  const option = (type, count) => ({
    type,
    available: count > 0,
    label: game.i18n.localize(type === "long" ? "ep2e.skills.restingMenu.restInfo.subheadline3" : "ep2e.skills.restingMenu.restInfo.subheadline2"),
    detail: game.i18n.format("ep2e.skills.restingMenu.dialog.detail", { time: game.i18n.localize(rechargeDurationKey(actor, type)), count })
  });
  const options = [option("long", left.long ? 1 : 0), option("short", left.short)];
  options.find(entry => entry.available).checked = true;
  const content = await foundry.applications.handlebars.renderTemplate(RECHARGE_DIALOG_TEMPLATE, { options });
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("ep2e.skills.restingMenu.dialog.title", { name: actor.name }) },
    classes: ["ep2e-primary-right"],
    content,
    buttons: [
      { action: "recharge", label: game.i18n.localize("ep2e.skills.restingMenu.button.recharge"), default: true, callback: (event, button) => ({ restType: button.form.elements.restType.value, rollMode: button.form.elements.rollMode.value }) },
      { action: "cancel", label: game.i18n.localize("ep2e.roll.dialog.button.cancel"), callback: () => null }
    ],
    modal: true,
    rejectClose: false
  });
  if (!choice?.restType) return false;
  await takeRecharge(actor, choice.restType, { rollMode: choice.rollMode });
  return true;
}

/**
 * Takes a recharge: marks it used, ends what a recharge ends and recovers the pools - all of them on
 * a long one, 1d6 points on a short one, to be spread when they do not fill every pool. Its card is
 * seen as the roll mode says.
 * @param {Actor} actorWhole - The resting actor
 * @param {String} restType - "short" or "long"
 * @param {Object} [options] - rollMode: "public", "private" or "blind"
 * @returns {Promise<Boolean>} False when no such recharge is left
 */
export async function takeRecharge(actorWhole, restType, { rollMode = "public" } = {}) {
  const left = rechargesLeft(actorWhole);
  const slot = restType === "long" ? (left.long ? "long" : null) : left.shortSlot;
  if (!slot) return false;
  const restReset = game.settings.get("eclipsephase", "restReset");
  const actorModel = actorWhole.system;
  const blind = rollMode === "blind";
  const recipientList = prepareRecipients(rollMode);
  const curInsight = actorModel.pools.insight.value;
  const curVigor = actorModel.pools.vigor.value;
  const curMoxie = actorModel.pools.moxie.value;
  const curFlex = actorModel.pools.flex.value;
  const maxInsight = actorModel.pools.insight.totalInsight;
  const maxVigor = actorModel.pools.vigor.totalVigor;
  const maxMoxie = actorModel.pools.moxie.totalMoxie;
  const maxFlex = actorModel.pools.flex.totalFlex;
  const easeInfection = actorModel.psiStrain.infection - 10;
  const resetInfection = actorModel.psiStrain.minimumInfection;
  const used = { [`system.rest.${slot}`]: true };

  await endAllChiPushes(actorWhole);

  await actorWhole.update({
    ...used,
    "system.pools.update.insight": null,
    "system.pools.update.vigor": null,
    "system.pools.update.moxie": null,
    "system.pools.update.flex": null
  });

  if (restReset || restType === "long") {
    await tempEffectDeletion(actorWhole, "eclipsephase", "effectKey", ["woundIgnore", "traumaIgnore"]);
  }

  if (restType === "long") {
    const label = game.i18n.format("ep2e.roll.announce.rest.long", {
      time: game.i18n.localize(rechargeDurationKey(actorWhole, "long"))
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actorWhole }),
      flavor: label,
      ...(recipientList.length ? { whisper: recipientList } : {}),
      blind
    });
    await applyRest(actorWhole, restType, {
      "system.pools.insight.value": maxInsight,
      "system.pools.vigor.value": maxVigor,
      "system.pools.moxie.value": maxMoxie,
      "system.pools.flex.value": maxFlex,
      "system.rest.restValue": null,
      "system.psiStrain.infection": resetInfection
    });
    return true;
  }

  const poolSpend = (maxInsight - curInsight) + (maxVigor - curVigor) + (maxMoxie - curMoxie) + (maxFlex - curFlex);
  const rollFormula = "1d6" + (actorModel.additionalSystems.restChiMod ? " + " + eval(actorModel.additionalSystems.restChiMod) * actorModel.mods.psiMultiplier : "") + (actorModel.mods.recoverBonus ? " + " + eval(actorModel.mods.recoverBonus) : "");
  const roll = await new Roll(rollFormula).evaluate();
  const message = {
    rollTitle: "ep2e.roll.announce.total",
    mainMessage: game.i18n.format("ep2e.roll.announce.rest.short", {
      time: game.i18n.localize(rechargeDurationKey(actorWhole, "short"))
    })
  };
  await DICE.rollToChat(null, message, DICE.DEFAULT_ROLL, roll, actorWhole.name, recipientList, blind, "rollOutput");
  const restValue = roll.total;

  if (restValue >= poolSpend) {
    await applyRest(actorWhole, restType, {
      "system.pools.insight.value": maxInsight,
      "system.pools.vigor.value": maxVigor,
      "system.pools.moxie.value": maxMoxie,
      "system.pools.flex.value": maxFlex,
      "system.rest.restValue": null,
      "system.psiStrain.infection": easeInfection
    });
    return true;
  }
  await applyRest(actorWhole, restType, {
    "system.psiStrain.infection": easeInfection
  });
  await _showDistributionDialog(actorWhole, restValue, maxInsight, maxVigor, maxMoxie, maxFlex, curInsight, curVigor, curMoxie, curFlex);
  return true;
}

function _restResetListener(html, actor) {
  html.querySelectorAll(".restReset").forEach(element => {
    element.addEventListener("click", async func => {
      return actor.update({
        "system.rest.short1": false,
        "system.rest.short2": false,
        "system.rest.shortExtra": false,
        "system.rest.long": false
      });
    });
  });
}

async function _showDistributionDialog(actor, restValue, maxInsight, maxVigor, maxMoxie, maxFlex, curInsight, curVigor, curMoxie, curFlex) {
  const distributeLabel = game.i18n.localize("ep2e.skills.restingMenu.button.distribute");
  const msgAvailable = game.i18n.localize("ep2e.skills.restingMenu.messages.pointsAvailable");
  const msgOverspent = game.i18n.localize("ep2e.skills.restingMenu.messages.pointsOverspent");
  const msgDone = game.i18n.localize("ep2e.skills.restingMenu.messages.distributionDone");

  const content = await foundry.applications.handlebars.renderTemplate(REST_DISTRIBUTION_TEMPLATE, {});

  const maxGains = {
    insight: maxInsight - curInsight,
    vigor: maxVigor - curVigor,
    moxie: maxMoxie - curMoxie,
    flex: maxFlex - curFlex
  };

  const hookId = Hooks.on("renderDialogV2", (app, html) => {
    Hooks.off("renderDialogV2", hookId);

    const statusLabel = html.querySelector(".rest-dist-status");
    const distributeBtn = html.querySelector('[data-action="distribute"]');

    const updateStatus = () => {
      // Clamp each input to its pool's maximum gain before reading
      for (const [pool, maxGain] of Object.entries(maxGains)) {
        const input = html.querySelector(`[name="${pool}"]`);
        const val = Math.max(0, parseInt(input.value) || 0);
        if (val > maxGain) input.value = maxGain;
      }

      const insight = Math.max(0, parseInt(html.querySelector('[name="insight"]').value) || 0);
      const vigor = Math.max(0, parseInt(html.querySelector('[name="vigor"]').value) || 0);
      const moxie = Math.max(0, parseInt(html.querySelector('[name="moxie"]').value) || 0);
      const flex = Math.max(0, parseInt(html.querySelector('[name="flex"]').value) || 0);
      const total = insight + vigor + moxie + flex;
      const remaining = restValue - total;

      if (remaining > 0) {
        statusLabel.innerHTML = `<strong style="color: var(--positive);">${remaining}</strong> ${msgAvailable}`;
        distributeBtn.disabled = true;
      } else if (remaining < 0) {
        statusLabel.innerHTML = `${msgOverspent} <strong style="color: var(--negative);">${Math.abs(remaining)}</strong>`;
        distributeBtn.disabled = true;
      } else {
        statusLabel.textContent = msgDone;
        distributeBtn.disabled = false;
      }
    };

    // Set initial state: all restValue points still to distribute
    statusLabel.innerHTML = `<strong style="color: var(--positive);">${restValue}</strong> ${msgAvailable}`;
    if (distributeBtn) distributeBtn.disabled = true;

    html.querySelectorAll(".rest-dist-input").forEach(input => {
      input.addEventListener("focus", () => input.select());
      input.addEventListener("input", updateStatus);
    });
  });

  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("ep2e.skills.restingMenu.headline") },
    content,
    buttons: [
      {
        action: "distribute",
        label: distributeLabel,
        default: true,
        callback: (event, button) => {
          const html = button.closest(".dialog-content") ?? button.closest("form") ?? button.form;
          const getVal = name => Math.max(0, parseInt(button.closest(".application")?.querySelector(`[name="${name}"]`)?.value) || 0);
          const insight = getVal("insight");
          const vigor = getVal("vigor");
          const moxie = getVal("moxie");
          const flex = getVal("flex");
          actor.update({
            "system.pools.insight.value": Math.min(curInsight + insight, maxInsight),
            "system.pools.vigor.value": Math.min(curVigor + vigor, maxVigor),
            "system.pools.moxie.value": Math.min(curMoxie + moxie, maxMoxie),
            "system.pools.flex.value": Math.min(curFlex + flex, maxFlex)
          });
        }
      }
    ],
    position: { width: 315 },
    modal: true,
    rejectClose: false
  });
}
