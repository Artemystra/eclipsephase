import { moreInfo, registerCommonHandlers } from "../common/general-sheet-functions.js";
import * as poolFunctions from "./pools.js";
import * as psiFunctions from "./psi.js";
import * as damageFunctions from "./damage.js";
import * as resleeving from "./resleeving.js";

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
    const button = html.querySelector(".privateChatButton")
    
    if(!button) {
        return;
    }
    const actor = game.actors.get(html.querySelector(".privateChatButton").getAttribute("data-ownerid"))

    if(actor && !actor.isOwner){
        button.classList.add("noShow")
    }
}

export async function addChatListeners(html){
    html.addEventListener("click", event => {
        const moreInfoIcon = event.target.closest("i.moreInfo");
        if (moreInfoIcon) {
            moreInfo(event);
            return;
        }

        const moreInfoDialog = event.target.closest("a.moreInfoDialog");
        if (moreInfoDialog) {
            moreInfo(event);
            return;
        }

        const usePool = event.target.closest("button.usePool");
        if (usePool) {
            poolFunctions.usePoolFromChat(event);
            return;
        }

        const psiEffect = event.target.closest("button.psiEffect");
        if (psiEffect) {
            psiFunctions.preparePsi(event);
            return;
        }

        const weaponDamage = event.target.closest("button.weaponDamage");
        if (weaponDamage) {
            damageFunctions.prepareWeapon(event);
            return;
        }

        const resleeve = event.target.closest("button.resleeve");
        if (resleeve) {
            resleeving.sleevingTest(event);
            return;
        }

        const resleeveResult = event.target.closest("button.resleeveResult");
        if (resleeveResult) {
            resleeving.result(event);
        }
    });

    registerCommonHandlers(html);
}
