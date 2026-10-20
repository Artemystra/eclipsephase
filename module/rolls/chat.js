import { moreInfo, registerCommonHandlers } from "../common/general-sheet-functions.js";
import * as poolFunctions from "./pools.js";
import * as psiFunctions from "./psi.js";
import * as damageFunctions from "./damage.js";
import * as resleeving from "./resleeving.js";
import { requestDoseClaim, requestWearOffRoll } from "../common/doses.js";
import { requestUseCheck, requestDoseHarm } from "../common/dose-checks.js";
import { requestFilterCheck } from "../common/dose-defense.js";
import { setupFromCard } from "../common/ware-skills.js";
import { chooseDoseTarget } from "../common/dose-targeting.js";

/**
 * Hides GM info from players
 * @param {*} html 
 */
export async function GMvision(html){
    
    let GMvision = game.user.isGM
    let GMinfo = html.querySelector(".GMinfo")
    if(!GMvision && GMinfo){
            GMinfo.classList.add("noShow");
    }
    const hidden = GMvision ? ".playerOnlyControl" : ".gmOnlyControl";
    for (const control of html.querySelectorAll(hidden)) control.classList.add("noShow");
}

/**
 * Hides a check card's harm button once the harm was rolled, or once a pool spend turned the
 * check into a pass.
 * @param {ChatMessage} message - The rendered message
 * @param {HTMLElement} html - Its markup
 * @returns {void}
 */
export function doseHarmVision(message, html) {
  if (!message?.getFlag?.("eclipsephase", "doseHarm")?.rolled) return;
  for (const button of html.querySelectorAll("button.doseHarm")) button.closest(".chatControls")?.classList.add("noShow");
}

/**
 * Hides player info from GM
 */
export async function playerVision(html){
    let GMvision = game.user.isGM
    let GMinfo = html.querySelector(".playerInfo")
    
    if(GMvision && GMinfo){
        for (let entry of GMinfo){
            entry.classList.add("noShow");
        }
    }
}

/**
 * Hides Buttons & Owner info from other players that are restricte from using them
 * @param {*} html 
 */
export async function ownerVision(html){ 
    for(const button of html.querySelectorAll(".privateChatButton")){
        const actor = game.actors.get(button.getAttribute("data-ownerid"))

        if(actor && !actor.isOwner){
            button.classList.add("noShow")
        }
    }
    for(const control of html.querySelectorAll(".ownerOnlyControl")){
        const actor = fromUuidSync(control.dataset.actorUuid ?? "")
        if(!actor?.isOwner) control.classList.add("noShow")
    }
    for(const control of html.querySelectorAll(".notForOwnerControl")){
        const actor = fromUuidSync(control.dataset.actorUuid ?? "")
        if(actor?.isOwner) control.classList.add("noShow")
    }
}

export async function addChatListeners(html) {
  html.addEventListener("click", event => {
    const moreInfoIcon = event.target.closest("i.moreInfo");
    if (moreInfoIcon) {
      moreInfo({ currentTarget: moreInfoIcon });
      return;
    }

    const moreInfoDialog = event.target.closest("a.moreInfoDialog");
    if (moreInfoDialog) {
      moreInfo({ currentTarget: moreInfoDialog });
      return;
    }

    const usePool = event.target.closest("button.usePool");
    if (usePool) {
      poolFunctions.usePoolFromChat({ currentTarget: usePool });
      return;
    }

    const psiEffect = event.target.closest("button.psiEffect");
    if (psiEffect) {
      psiFunctions.preparePsi({ currentTarget: psiEffect });
      return;
    }

    const weaponDamage = event.target.closest("button.weaponDamage");
    if (weaponDamage) {
      damageFunctions.prepareWeapon({ currentTarget: weaponDamage });
      return;
    }

    const psiDamage = event.target.closest("button.psiDamage");
    if (psiDamage) {
      damageFunctions.preparePsiDamage({ currentTarget: psiDamage });
      return;
    }

    const resleeve = event.target.closest("button.resleeve");
    if (resleeve) {
      resleeving.sleevingTest({ currentTarget: resleeve });
      return;
    }

    const resleeveResult = event.target.closest("button.resleeveResult");
    if (resleeveResult) {
      resleeving.result({ currentTarget: resleeveResult });
      return;
    }

    const useDose = event.target.closest("button.useDose");
    if (useDose) {
      const messageId = useDose.closest("[data-message-id]")?.dataset.messageId;
      if (messageId) requestDoseClaim(messageId, { selection: useDose.dataset.selection === "true" });
      return;
    }

    const rollDoseCheck = event.target.closest("button.rollDoseCheck");
    if (rollDoseCheck) {
      const messageId = rollDoseCheck.closest("[data-message-id]")?.dataset.messageId;
      if (messageId) requestUseCheck(messageId);
      return;
    }

    const wareSkillSetup = event.target.closest("button.wareSkillSetup");
    if (wareSkillSetup) {
      setupFromCard(wareSkillSetup.dataset.actorUuid, wareSkillSetup.dataset.itemId);
      return;
    }

    const rollFilterCheck = event.target.closest("button.rollFilterCheck");
    if (rollFilterCheck) {
      const messageId = rollFilterCheck.closest("[data-message-id]")?.dataset.messageId;
      if (messageId) requestFilterCheck(messageId);
      return;
    }

    const doseHarm = event.target.closest("button.doseHarm");
    if (doseHarm) {
      const messageId = doseHarm.closest("[data-message-id]")?.dataset.messageId;
      if (messageId) requestDoseHarm(messageId);
      return;
    }

    const rollWearOff = event.target.closest("button.rollWearOff");
    if (rollWearOff) {
      const messageId = rollWearOff.closest("[data-message-id]")?.dataset.messageId;
      if (messageId) requestWearOffRoll(messageId);
      return;
    }

    const pickTarget = event.target.closest("button.pickDoseTarget, button.pickDoseNpc");
    if (pickTarget) {
      const messageId = pickTarget.closest("[data-message-id]")?.dataset.messageId;
      if (messageId) chooseDoseTarget(messageId, pickTarget.classList.contains("pickDoseNpc") ? "npc" : "canvas");
    }
  });

  registerCommonHandlers(html);
}
