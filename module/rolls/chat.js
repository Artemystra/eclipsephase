import { moreInfo, registerCommonHandlers } from "../common/common-sheet-functions.js";
import * as poolFunctions from "./pools.js";
import * as psiFunctions from "./psi.js";
import * as damageFunctions from "./damage.js";

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

export async function addChatListeners($html){
    const html = await bridgeJQuery($html);
    html.on('click', 'i.moreInfo', moreInfo);
    html.on('click', 'a.moreInfoDialog', moreInfo);
    html.on('click', 'button.usePool', poolFunctions.usePoolFromChat);
    html.on('click', 'button.psiEffect', psiFunctions.preparePsi);
    html.on('click', 'button.weaponDamage', damageFunctions.prepareWeapon);

    registerCommonHandlers(html);
}

/**
 * Bridges jQuery for the time being
 * @param {*} html
 */
async function bridgeJQuery(html) {
    html instanceof HTMLElement ? console.log("jQuery found - Fix needed!") : 0 ;
    return html instanceof HTMLElement ? $(html) : html;
}