import { moreInfo, registerCommonHandlers } from "../common/common-sheet-functions.js";
import * as poolFunctions from "./pools.js";
import * as psiFunctions from "./psi.js";

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
    let buttons = html.find(".privateChatButton")
    let actor = game.actors.get(buttons.attr("data-ownerid"))

    if(actor && !actor.isOwner){
        buttons.addClass("noShow")
    }
}

export function addChatListeners(html){
    html.on('click', 'i.moreInfo', moreInfo);
    html.on('click', 'a.moreInfoDialog', moreInfo);
    html.on('click', 'button.usePool', poolFunctions.usePoolFromChat);
    html.on('click', 'button.psiEffect', psiFunctions.preparePsi);

    registerCommonHandlers(html);
}

export function gmList(){
    let gmList = game.users.filter(user => user.isGM)
    let activeGMs = gmList.filter(user => user.active)
    let gmIDs = activeGMs.map(user => user._id)
    return gmIDs
}

