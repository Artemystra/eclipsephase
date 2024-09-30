/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export default class EPvehicleSheet extends ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["eclipsephase", "sheet", "item"],
      resizable: false,
      width: 1010,
      height: 505,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".item-sheet-body", initial: "description" }]
    });
  }

  /** @override */
  get template() {
    const path = "systems/eclipsephase/templates/item";
    // Return a single sheet for all item types.
    // return `${path}/item-sheet.html`;

    // Alternatively, you could use the following return statement to do a
    // unique item sheet by type, like `weapon-sheet.html`.
    return `${path}/item-${this.item.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {
    const sheetData = super.getData()

    sheetData.config = CONFIG.eclipsephase

    console.log("*** vehicle-sheet")
    console.log(sheetData)
    return sheetData
  }

  /* -------------------------------------------- */

  /** @override 
  setPosition(options = {}) {
    const position = super.setPosition(options);
    const sheetBody = this.element.find(".item-sheet-body");
    const bodyHeight = position.height - 192;
    sheetBody.css("height", bodyHeight);
    return position;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Roll handlers, click handlers, etc. would go here.
    html.find('.autoBot').click(async f => {
      let askForOptions = f.shiftKey;
      const element = f.currentTarget;
      const dataset = element.dataset;
      const itemID = dataset.id
      const itemName = dataset.name;
      let itemWhole = null;
      let actorWhole = null;

      let targetItem = await ownerCheck(itemID);
      
      const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
      const popUpHeadline = game.i18n.localize("ep2e.actorSheet.button.confirm");
      const popUpCopy = "ep2e.actorSheet.popUp.autoBotCopyGeneral";
      const popUpInfo = "ep2e.actorSheet.popUp.autoBotAdditionalInfo";
      let itemType = null;
      let popUp = null;

      if (!askForOptions){
        popUp = await autoBot(popUpTitle, popUpHeadline, popUpCopy, popUpInfo);

        if (popUp.confirm === false){
          return
        }
        if (popUp.type != "none"){
          itemType = game.i18n.localize('ep2e.item.vehicle.table.habitat.' + popUp.type);
        }
        else {
          itemType = game.i18n.localize('ep2e.item.vehicle.skillFieldDefault');
        }
      }
      else {
        itemType = game.i18n.localize('ep2e.item.vehicle.table.habitat.none');
      }

      let hardware = game.i18n.localize('ep2e.item.additionalSkill.table.defaultHardwareLabel')+itemType;
      let pilotType = ""
      if (popUp.type === "air" || popUp.type === "space"){
        pilotType = game.i18n.localize('ep2e.item.vehicle.table.habitat.aerospace');
      }
      else if (popUp.type != "none"){
        pilotType = game.i18n.localize('ep2e.item.vehicle.table.habitat.'+popUp.type);
      }
      else {
        pilotType = game.i18n.localize('ep2e.item.vehicle.skillFieldDefault');
      }
      let pilot = (game.i18n.localize('ep2e.item.additionalSkill.table.defaultPilotLabel'))+pilotType;
      let know = (game.i18n.localize('ep2e.item.additionalSkill.table.defaultKnowLabel'))+itemName+" Specs";

      let autoBotUpdate = {};
      
      autoBotUpdate["system.skills.1.name"] = game.i18n.localize("ep2e.skills.vigorSkills.fray");
      autoBotUpdate["system.skills.1.value"] = 30;
      autoBotUpdate["system.skills.2.name"] = game.i18n.localize("ep2e.skills.vigorSkills.guns");
      autoBotUpdate["system.skills.2.value"] = 30;
      autoBotUpdate["system.skills.3.name"] = hardware;
      autoBotUpdate["system.skills.3.value"] = 20;
      autoBotUpdate["system.skills.3.specname"] = itemName;
      autoBotUpdate["system.skills.4.name"] = game.i18n.localize("ep2e.skills.insightSkills.infosec");
      autoBotUpdate["system.skills.4.value"] = 20;
      autoBotUpdate["system.skills.5.name"] = game.i18n.localize("ep2e.skills.insightSkills.interface");
      autoBotUpdate["system.skills.5.value"] = 30;
      autoBotUpdate["system.skills.6.name"] = game.i18n.localize("ep2e.skills.insightSkills.perceive");
      autoBotUpdate["system.skills.6.value"] = 40;
      autoBotUpdate["system.skills.7.name"] = pilot;
      autoBotUpdate["system.skills.7.value"] = 60;
      autoBotUpdate["system.skills.7.specname"] = itemName;
      autoBotUpdate["system.skills.8.name"] = game.i18n.localize("ep2e.skills.insightSkills.research");
      autoBotUpdate["system.skills.8.value"] = 20;
      autoBotUpdate["system.skills.9.name"] = know;
      autoBotUpdate["system.skills.9.value"] = 80;

      if (targetItem.isOwned){
        actorWhole = this.actor
        autoBotUpdate["_id"] = itemID;
        actorWhole.updateEmbeddedDocuments("Item", [autoBotUpdate])
      }
      else{
        itemWhole = game.items.get(itemID);
        itemWhole.update(autoBotUpdate);
      }
    })
  }
}

async function autoBot(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, popUpTarget) {
  let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
  let deleteButton = game.i18n.localize('ep2e.actorSheet.button.confirm');
  const dialogType = "autoBot"
  const template = "systems/eclipsephase/templates/chat/pop-up.html";
  const html = await renderTemplate(template, {popUpHeadline, popUpCopy, dialogType, popUpInfo, popUpTarget});

  return new Promise(resolve => {
      const data = {
          title: popUpTitle,
          content: html,
          buttons: {
              cancel: {
                label: cancelButton,
                callback: html => resolve ({confirm: false})
              },
              normal: {
                  label: deleteButton,
                  callback: html => resolve (_autoBotResults(html[0].querySelector("form")))
              }
          },
          default: "normal",
          close: () => resolve ({confirm: false})
      };
      let options = {width:250}
      new Dialog(data, options).render(true);
  });
}

//Auto Bot results
function _autoBotResults(form) {
  return {
      type: form.type.value
  }
}

async function ownerCheck(itemID){
  let isOwned = false;
  for (let character of game.actors){
    for (let item of character.items)
        if (item._id === itemID){
            isOwned = true;
            return {isOwned}
        }
  }
  return {isOwned}
}