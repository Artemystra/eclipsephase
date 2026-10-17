import { moreInfo, registerCommonHandlers } from "../common/general-sheet-functions.js";
import * as poolFunctions from "./pools.js";
import * as psiFunctions from "./psi.js";
import * as damageFunctions from "./damage.js";
import * as resleeving from "./resleeving.js";
import { requestDoseClaim } from "../common/doses.js";
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

    const pickTarget = event.target.closest("button.pickDoseTarget, button.pickDoseNpc");
    if (pickTarget) {
      const messageId = pickTarget.closest("[data-message-id]")?.dataset.messageId;
      if (messageId) chooseDoseTarget(messageId, pickTarget.classList.contains("pickDoseNpc") ? "npc" : "canvas");
    }
  });

  registerCommonHandlers(html);
}
