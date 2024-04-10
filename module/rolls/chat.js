import { moreInfo, registerCommonHandlers } from "../common/common-sheet-functions.js";
import * as poolFunctions from "./pools.js";

/**
 * Hides GM info from players
 * @param {*} html 
 */
export async function GMvision(html){
    let GMvision = game.user.isGM
    let GMinfo = html.find(".GMinfo")
    
    if(!GMvision){
        for (let entry of GMinfo){
            entry.classList.add("noShow");
        }
    }
}

/**
 * Hides Owner info from other players
 * @param {*} html 
 */
export async function ownerVision(html){ 
    let buttons = html.find(".poolButtons")
    let actor = game.actors.get(buttons.attr("data-ownerid"))

    if(actor && !actor.isOwner){
        buttons.addClass("noShow")
    }
}

export function addChatListeners(html){
    html.on('click', 'i.moreInfo', moreInfo);
    html.on('click', 'a.moreInfoDialog', moreInfo);
    html.on('click', 'button.usePool', poolFunctions.usePoolFromChat);

    registerCommonHandlers(html);
}

