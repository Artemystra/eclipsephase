import { tempEffectDeletion } from "../common/general-sheet-functions.js";
import * as DICE from "./dice.js";

const REST_DISTRIBUTION_TEMPLATE = "systems/eclipsephase/templates/chat/rest-distribution.html";

/**
 * Registers all resting-related event listeners on the actor sheet.
 * @param {HTMLElement} html   - The rendered sheet HTML
 * @param {Actor}       actor  - The actor document
 */
export function restingListeners(html, actor) {
  _restCheckboxListener(html, actor);
  _restResetListener(html, actor);
}

async function _restCheckboxListener(html, actor) {
  html.querySelectorAll(".rest").forEach(element => {
    element.addEventListener("click", async func => {
      const dataset = func.currentTarget.dataset;
      const brewStatus = false;
      //const brewStatus = game.settings.get("eclipsephase", "superBrew"); -> Out of order for the time being (25.07.2025)
      const restReset = game.settings.get("eclipsephase", "restReset");
      const actorWhole = actor;
      const actorModel = actor.system;
      const restType = dataset.resttype;
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
      let poolSpend = null;

      await actorWhole.update({
        "system.pools.update.insight": null,
        "system.pools.update.vigor": null,
        "system.pools.update.moxie": null,
        "system.pools.update.flex": null
      });

      if (!restReset && restType === "long") {
        await tempEffectDeletion(actorWhole, "eclipsephase", "effectKey", ["woundIgnore", "traumaIgnore"]);
      }
      else if (restReset) {
        await tempEffectDeletion(actorWhole, "eclipsephase", "effectKey", ["woundIgnore", "traumaIgnore"]);
      }

      if (!brewStatus) {
        poolSpend = (maxInsight - curInsight) + (maxVigor - curVigor) + (maxMoxie - curMoxie) + (maxFlex - curFlex);
      }
      else {
        poolSpend = (maxInsight - curInsight) + (maxVigor - curVigor) + (maxMoxie - curMoxie);
      }

      let rollFormula = "1d6" + (actorModel.additionalSystems.restChiMod ? " + " + eval(actorModel.additionalSystems.restChiMod) * actorModel.mods.psiMultiplier : "") + (actorModel.mods.recoverBonus ? " + " + eval(actorModel.mods.recoverBonus) : "");
      let roll = await new Roll(rollFormula).evaluate();
      let restValue = null;

      if (restType === "short") {
        let message = {};

        message.rollTitle = "ep2e.roll.announce.total";
        message.mainMessage = "ep2e.roll.announce.rest.short";

        await DICE.rollToChat(null, message, DICE.DEFAULT_ROLL, roll, actorWhole.name, null, false, "rollOutput");

        restValue = roll.total;
      }

      if (restType === "long" && !brewStatus) {
        let label = game.i18n.localize("ep2e.roll.announce.rest.long");
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: label
        });
        return actorWhole.update({
          "system.pools.insight.value": maxInsight,
          "system.pools.vigor.value": maxVigor,
          "system.pools.moxie.value": maxMoxie,
          "system.pools.flex.value": maxFlex,
          "system.rest.restValue": null,
          "system.psiStrain.infection": resetInfection
        });
      }
      else if (restType === "long" && brewStatus) {
        let label = game.i18n.localize("ep2e.roll.announce.rest.long");
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: label
        });
        return actorWhole.update({
          "system.pools.insight.value": maxInsight,
          "system.pools.vigor.value": maxVigor,
          "system.pools.moxie.value": maxMoxie,
          "system.rest.restValue": null,
          "system.psiStrain.infection": resetInfection
        });
      }
      else if (restValue >= poolSpend && !brewStatus) {
        return actorWhole.update({
          "system.pools.insight.value": maxInsight,
          "system.pools.vigor.value": maxVigor,
          "system.pools.moxie.value": maxMoxie,
          "system.pools.flex.value": maxFlex,
          "system.rest.restValue": null,
          "system.psiStrain.infection": easeInfection
        });
      }
      else if (restValue >= poolSpend && brewStatus) {
        return actorWhole.update({
          "system.pools.insight.value": maxInsight,
          "system.pools.vigor.value": maxVigor,
          "system.pools.moxie.value": maxMoxie,
          "system.rest.restValue": null,
          "system.psiStrain.infection": easeInfection
        });
      }
      else {
        await actorWhole.update({
          "system.psiStrain.infection": easeInfection
        });
        await _showDistributionDialog(actorWhole, restValue, maxInsight, maxVigor, maxMoxie, maxFlex, curInsight, curVigor, curMoxie, curFlex);
      }
    });
  });
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
