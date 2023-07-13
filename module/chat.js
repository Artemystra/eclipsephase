import { moreInfo } from "./common/common-sheet-functions.js";

export async function GMvision(html){
    let GMvision = game.user.isGM
    let GMinfo = html.find(".GMinfo")
    
    if(!GMvision){
        for (let entry of GMinfo){
            entry.classList.add("noShow");
        }
    }
}

export async function addChatListeners(html){
    html.on('click', 'i.moreInfo', moreInfo);
}

