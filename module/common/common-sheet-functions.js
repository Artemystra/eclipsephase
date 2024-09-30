/**
 * Foundry VTTs item creation & deletion functions
 * @param {Object} html - The HTML object to which the event listeners are added
 * @param {*} callerobj 
 * @param {*} caller 
 */
export function registerItemHandlers(html,callerobj,caller){
      // Add Inventory Item
      html.find('.item-create').click(caller._onItemCreate.bind(this));

      // Update Inventory Item
      html.find('.item-edit').click(ev => {
        const li = $(ev.currentTarget).parents(".item");
        const item = callerobj.items.get(li.data("itemId"));
        item.sheet.render(true);
      });

          // Delete Inventory Item
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      callerobj.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
      li.slideUp(200, () => this.render(false));
    });
}

/**
 * Foundry VTTs active effect creation & deletion functions
 * @param {Object} html - The HTML object to which the event listeners are added
 * @param {*} callerobj 
 */
export function registerEffectHandlers(html,callerobj){
    html.find('.effect-create').click(ev => {
        callerobj.createEmbeddedDocuments('ActiveEffect', [{
          label: 'Active Effect',
          icon: '/icons/svg/mystery-man.svg'
        }]);
        
      });
  
      html.find('.effect-edit').click(ev => {
        const li = $(ev.currentTarget).parents(".effect");
        const effect = callerobj.getEmbeddedDocument('ActiveEffect',li.data("itemId"));
        effect.sheet.render(true);
      });
  
      html.find('.effect-delete').click(async ev => {
        let askForOptions = ev.shiftKey;

        if (!askForOptions){

        const li = $(ev.currentTarget).parents(".effect");
        const itemName = [li.data("itemName")] ? [li.data("itemName")] : null;
        const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
        const popUpHeadline = (game.i18n.localize("ep2e.actorSheet.button.delete"))+ " " +(itemName?itemName:"");
        const popUpCopy = "ep2e.actorSheet.popUp.deleteCopyGeneral";
        const popUpInfo = "ep2e.actorSheet.popUp.deleteAdditionalInfo";

        let popUp = await confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo);
        
        if(popUp.confirm === true){
          callerobj.deleteEmbeddedDocuments('ActiveEffect', [li.data("itemId")]);
          }
          else{
            return
          }
        }
        else {
          callerobj.deleteEmbeddedDocuments('ActiveEffect', [li.data("itemId")]);
        }
      });
  
}

/**
 * Function to create temporary effects. These effects are used to be automatically 
 * deleted under certain circumstances. Therefore they're marked accordingly
 * @param {Object} actor - The actor object effects are added to
 * @param {Number} numberOfRuns - Defines how many times the effect is deleted
 * @param {String} tempEffLabel - The label of the temporary effect
 * @param {String} tempEffIcon - The icon of the temporary effect
 * @param {String} tempEffTar - The target value of the temporary effect
 * @param {String} tempEffMode - The mode of the temporary effect
 * @param {*} tempEffVal - The value of the temporary effect
 * @returns 
 */
export async function _tempEffectCreation(actor, numberOfRuns, tempEffLabel, tempEffIcon, tempEffTar, tempEffMode, tempEffVal){
    return actor.createEmbeddedDocuments('ActiveEffect', [{
      label: tempEffLabel,
      icon: tempEffIcon,
      changes: [{key : tempEffTar, mode : tempEffMode, value : -10*numberOfRuns}]
    }]);
}

/**
 * Animation handlers for character sheets
 * @param {Object} html 
 * @param {Object} callerobj 
 */
export function registerCommonHandlers(html,callerobj){
    
    //Open/Close items (gear/weapons/flaws/traits etc.)

    html.find(".slideShow").click(ev => {
        const current = $(ev.currentTarget);
        const first = current.children().first();
        const last = current.children().last();
        const target = current.closest(".item").children().last();
        first.toggleClass("noShow").toggleClass("showFlex");
        last.toggleClass("noShow").toggleClass("showFlex");
        target.slideToggle(200).toggleClass("showFlex");
    });

    
    //Auto-close parent item
    html.find(".autoClose").click(ev => {
      const current = $(ev.currentTarget);
      const parent = current.closest(".showMore").toggleClass("showFlex").toggleClass("noShow");
      parent.slideToggle(200);
  });
    
    // Custom Droplists (for pools)
    
    const dropdownBtns = html.find(".dropdown");
    const closeBtns = html.find(".closeButton");

    // Close the dropdown menu if the user clicks outside of it
    
    //This part needs further investigation as it triggers AFTER the button is clicked, leading to directly closing the just opened dropdown.
    /*document.addEventListener("click", function(event) {
      console.log("My event target matches .dropdown: ",event.target.matches(".dropdown"))
      console.log("this is because my event target is: ",event.target)
      if (!event.target.matches(".dropdown")) {
        console.log("Now I trigger closeAll")
        closeAllDropdowns();
      }
    });*/

    document.addEventListener("click", function(event) {
      if (event.target.matches(".droplistBackground") || event.target.matches(".droplistElement")) {
        closeAllDropdowns();
      }
    });

    closeBtns.click(ev => {
      closeAllDropdowns();
    });

    for (const btn of dropdownBtns) {
      btn.addEventListener("click", function() {
        const dropdownContainer = this.nextElementSibling;
        const open = dropdownContainer.style.display === "grid";
        closeAllDropdowns();
        if (!open) {
          dropdownContainer.style.display = "grid";
        }
      });
    }

    function closeAllDropdowns() {
      const dropdownContainers = document.querySelectorAll(".poolDroplist");
      for (const container of dropdownContainers) {
          container.style.display = "none";
      }
    }
    
}

/**
 * Create special & know skills
 * @param {Object} event - The event starting the function (default: click)
 * @param {Object} callerobj - The object the function is called from (default: actor)
 * @returns 
 */
export function itemCreate(event,callerobj){
      event.preventDefault();
      const header = event.currentTarget;
      const type = header.dataset.type;
      const data = duplicate(header.dataset);
      const name = `New ${type.capitalize()}`;
      const itemData = {
        name: name,
        type: type,
        data: data
      };
      delete itemData.data["type"];
      if (itemData.type === "specialSkill" || itemData.type === "knowSkill") {
        itemData.name = "New Skill";
      }
      return callerobj.createEmbeddedDocuments("Item", [itemData]);
}

/**
 * Deletes a given number of items from the actor's inventory
 * @param {Object} actor - The actor object the items are deleted from
 * @param {String} itemID - The ID of the item to be deleted
 * @param {Number} itemQuantity - The quantity of the items to be deleted
 */
export async function itemReduction(actor, itemID, itemQuantity){
  let quantity = Number(itemQuantity) - 1;
  let ammoUpdate = [];

  if(quantity >= 1){
    ammoUpdate.push({
      "_id" : itemID,
      "system.quantity": quantity,
    });
    await actor.updateEmbeddedDocuments("Item", ammoUpdate);
  }
  else{
    await actor.deleteEmbeddedDocuments("Item", [itemID])
  }
}

//Standard Dialogs
/**
 * Confirmation dialogs for any kind of content. (informations, warning, error messages)
 * Cancelling the dialog will return false, confirming will return true.
 * @param {String} popUpTitle - The title of the pop-up showed in the top left corner
 * @param {String} popUpHeadline - The headline of the pop-up very prominently displayed
 * @param {String} popUpCopy - The copy of the pop-up, explaining what happened
 * @param {String} popUpInfo - Additional information to be displayed (showed smaller and in italics)
 * @param {String} popUpTarget - The target of the pop-up (e.g. the item that is deleted)
 * @returns - Returns a promise that resolves to true if the user confirms the dialog, false if the user cancels it.
 */
export async function confirmation(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, popUpTarget) {
  let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
  let deleteButton = game.i18n.localize('ep2e.actorSheet.button.delete');
  const dialogType = "confirmation"
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
                  callback: html => resolve ({confirm: true})
              }
          },
          default: "normal",
          close: () => resolve ({confirm: false})
      };
      let options = {width:250}
      new Dialog(data, options).render(true);
  });
}

/**
 * A simple dialog with only the option to confirm. This is used for simple information messages.
 * @param {*} event 
 */
export async function moreInfo(event){
  const element = event.currentTarget;
  const dataset = element.dataset;
  const template = 'systems/eclipsephase/templates/chat/pop-up.html'
  let dialogData = {}
  dialogData.dialogType = "information";

  //This builds the dataset if objects are needed from the item (I'm not entirely sure why item is needed, but a smarter me figured this out at some point in time...)
  if(dataset.uuid){
    let item = await fromUuid(dataset.uuid);
    let path = eval("item." + dataset.datapath);

    for (let item in path){
      dialogData[item] = path[item];
    }
    
    dialogData.rolledfrom = dataset.rolledfrom;
  }
  
  //This uses the data provided by handlebars datasets
  else{
    for (let item in dataset){
        dialogData[item] = dataset[item];
    }
  }

  let dialog = await moreInformation(template, dialogData)

  async function moreInformation(template, dialogData) {
      let dialogName = game.i18n.localize('ep2e.actorSheet.dialogHeadline.information');
      let closeButton = game.i18n.localize('ep2e.actorSheet.button.close');
      let html = await renderTemplate(template, dialogData);
    
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
}

/**
 * Toggles the active state of an item and its effects.
 * This is the main function to handle automatic active effect
 * toggle on morph switch.
 * @param {Object} html - The html object of the actor sheet
 * @param {Object} actor - The actor object
 * @param {Array} allEffects - An array of the actor's active effects
 */
export function embeddedItemToggle(html, actor, allEffects){
  html.find('.equipped.checkBox').click(async ev => {
    const itemId = ev.currentTarget.closest(".equipped.checkBox").dataset.itemId;
    const item = actor.items.get(itemId);
    let toggle = !item.system.active;
    const updateData = {
        "system.active": toggle
    };
    const updated = item.update(updateData);
    
    //handles activation/deactivation of values provided by effects inherited from items
    let effUpdateData=[];
    for(let effectScan of allEffects){
  
      if (effectScan.origin){
        let parentItem = await fromUuid(effectScan.origin);
        if (itemId === parentItem._id){
  
          effUpdateData.push({
            "_id" : effectScan._id,
            disabled: !toggle
          });
  
        }
      }
    }
    actor.updateEmbeddedDocuments("ActiveEffect", effUpdateData);
  });
}

/**
 * Simple toggle for items active state
 * @param {Object} html - The html object passeed in click on a button of the actor sheet
 * @param {Object} item - The item to be toggled
 */
export function itemToggle(html, item){
  html.find('.toggleItem').click(async ev => {
    const element = ev.currentTarget;
    const dataset = element.dataset;
    const path = dataset.path;
    let toggle = !eval("item." + path);
    const updateData = {
        [path]: toggle
    };
    item.update(updateData);
  });
}

/**
 * The standard constructor for lists throughout the system (e.g. weapon selection)
 * @param {Array} objectList - An array with objects to be listed
 * @param {String} dialogType - The type of dialog to be displayed. This defines which part of the list-dialog.html is displayed
 * @param {String} headline - The headline of the dialog
 * @returns 
 */
export async function listSelection(objectList, dialogType, headline){
  let dialogName = game.i18n.localize('ep2e.actorSheet.dialogHeadline.confirmationNeeded');
  let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
  let useButton = game.i18n.localize('ep2e.actorSheet.button.select');
  const template = "systems/eclipsephase/templates/chat/list-dialog.html";
  const html = await renderTemplate(template, {objectList, dialogType, headline});
  return new Promise(resolve => {
      const data = {
          title: dialogName,
          content: html,
          buttons: {
              cancel: {
                  label: cancelButton,
                  callback: html => resolve ({cancelled: true})
              },
              normal: {
                  label: useButton,
                  callback: html => resolve(_proListSelection(html[0].querySelector("form")))
              }
          },
          default: "normal",
          close: () => resolve ({cancelled: true})
      };
      let options = {width:536}
      new Dialog(data, options).render(true);
  });
}
function _proListSelection(form) {
  return {
      selection: form.WeaponSelect.value
  }
}

/**
 * A powerful constructor of joined rolls for the chat.
 * Use this in case you need to make a series of rolls and want to display them into
 * one singular chat message.
 * @param {Array} rollsArray - The array of rolls to be displayed
 * @param {Object} messageData - Object with the chat message data
 * @param {*} param2 
 * @returns - An object to be displayed in the chat
 */
async function joinDiceRollMessage(rollsArray, messageData={}, {rollMode, create=true}={}) {
  for ( const roll of rollsArray ) {
      if ( !roll._evaluated ) await roll.evaluate({async: true});
  }

  // Prepare chat data
  messageData = foundry.utils.mergeObject({
      user: game.user.id,
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      sound: CONFIG.sounds.dice
  }, messageData);
  messageData.rolls = rollsArray;

  // Either create the message or just return the chat data
  const cls = getDocumentClass("ChatMessage");
  const msg = new cls(messageData);

  // Either create or return the data
  if ( create ) return cls.create(msg.toObject(), { rollMode });
  else {
      if ( rollMode ) msg.applyRollMode(rollMode);
      return msg.toObject();
  }
}

/**
 * Creator for GM lists
 * @returns - a list of all currently active (in the sense of being online) GMs
 */
export function gmList(){
  let gmList = game.users.filter(user => user.isGM)
  let activeGMs = gmList.filter(user => user.active)
  let gmIDs = activeGMs.map(user => user._id)
  return gmIDs
}

/**
 * Creator for recipient lists. This function is the basis for
 * GMs whispering rolls to players instead of the other way around.
 * It is also usable for simple blind and gmrolls.
 * @param {*} rollMode - The roll mode of the roll (e.g. blind, gmroll, private)
 * @returns - A list of recipients
 */
export function prepareRecipients(rollMode){
  let recipientList = []
  
  if(rollMode === "blind" || rollMode === "blindroll")
  recipientList = gmList()

  if(rollMode === "private" || rollMode === "gmroll"){
    recipientList = gmList()
    let owner = game.user._id
    if(!recipientList.includes(owner))
        recipientList.push(owner)
  }

  return recipientList
}

//DV calculator (this translates the three given integers into a human readable roll formula)
export async function damageValueCalc (object, dvPath, traits, calcType){
  let dv = "";
  
  if(calcType === "ammo"){
    //Ammo Damage Calculation
    dv = "ep2e.item.weapon.table.noDamageValueModifier"
    const d10 = object.type != "drug" ? dvPath.d10 : 0;
    const d6 = object.type != "drug" ? dvPath.d6 : 0;
    const bonus = object.type != "drug" ? dvPath.bonus : 0;
    let bonusValue = bonus ? "+"  + bonus : "";
  
    if (d10 && d6){
      dv = d10 + "d10+" + d6 + "d6" + bonusValue;
    }
    else if (d10 && !d6){
      dv = d10 + "d10" + bonusValue;
    }
    else if (!d10 && d6){
      dv = d6 + "d6" + bonusValue;
    }
    
  }
  else if (calcType === "weapon"){
    //if the weapon has the noDamage Trait the calculation is skipped
    if (traits.noDamage){
      dv = "ep2e.item.weapon.table.noDamageAmmo"
    }
    //Weapon Damage Calculation
    else {
      let d10 = Number(dvPath.d10);
      let d6 = Number(dvPath.d6);
      let bonus = Number(dvPath.bonus);
      //Ammo damage modifier
      if (object.type != "ccWeapon"){
        if (!object.system.ammoSelected.traits.bioMorphsOnly.value && !object.system.ammoSelected.traits.dvOnMiss.value){
          d10 += Number(object.system.ammoSelected.dvModifier.d10);
          d6 += Number(object.system.ammoSelected.dvModifier.d6);
          bonus += Number(object.system.ammoSelected.dvModifier.bonus);
        }
      }
      if (!d10 && !d6 && !bonus){
        dv = "ep2e.item.weapon.table.noDamage"
      }
      /*else if(object.system.ammoSelected.traits){
  
      }*/
      else {
        let bonusValue = bonus ? "+"  + bonus : "";
      
        if (d10 && d6){
          dv = d10 + "d10+" + d6 + "d6" + bonusValue;
        }
        else if (d10 && !d6){
          dv = d10 + "d10" + bonusValue;
        }
        else if (!d10 && d6){
          dv = d6 + "d6" + bonusValue;
        }
      }
    }
  }

  return {dv};
}