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

async function moreInfo(event){
    const element = event.currentTarget;
    const dataset = element.dataset;
    const template = 'systems/eclipsephase/templates/chat/pop-up.html'
    let dialogData = {}
    dialogData.dialogType = "information";
    dialogData.resource = dataset.resource ? dataset.resource : null;
    dialogData.rolledFrom = dataset.rolledfrom ? dataset.rolledfrom : null;

    //Psi - I don't think this is used by anything else
    dialogData.action = dataset.action ? dataset.action : null;
    dialogData.duration = dataset.duration ? dataset.duration : null;

    dialogData.subtitle = dataset.title;
    dialogData.copy = dataset.description;

    let html = await renderTemplate(template, dialogData);
    let dialog = await moreInformation(html)
}

async function moreInformation(html) {
    let dialogName = game.i18n.localize('ep2e.actorSheet.dialogHeadline.information');
    let closeButton = game.i18n.localize('ep2e.actorSheet.button.close');
  
    return new Promise(resolve => {
        const data = {
            title: dialogName,
            content: html,
            buttons: {
                cancel: {
                    label: closeButton,
                    callback: html => resolve ({cancelled: true})
                }
            },
            default: "normal",
            close: () => resolve ({cancelled: true})
        };
        let options = {width:325}
        new Dialog(data, options).render(true);
    });
  }