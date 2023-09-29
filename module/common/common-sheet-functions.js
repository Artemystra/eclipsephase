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

export async function _tempEffectCreation(callerobj, numberOfRuns, tempEffLabel, tempEffIcon, tempEffTar, tempEffMode, tempEffVal){
    return callerobj.createEmbeddedDocuments('ActiveEffect', [{
      label: tempEffLabel,
      icon: tempEffIcon,
      changes: [{key : tempEffTar, mode : tempEffMode, value : -1*numberOfRuns}]
    }]);
}

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

//Standard Dialogs

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

export async function moreInfo(event){
  const element = event.currentTarget;
  const dataset = element.dataset;
  const template = 'systems/eclipsephase/templates/chat/pop-up.html'
  let dialogData = {}
  dialogData.dialogType = "information";
  console.log("**", dialogData)

  //This builds the dataset if objects are needed from the item
  if(dataset.contructdataset){
    let item = ""
    for(let actor of game.actors){
      let fetchedItem = Boolean(actor.items.get(dataset.contructdataset))
          if(fetchedItem){
              item = actor.items.get(dataset.contructdataset);
      };
    };
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

//Item Toggles

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

//List dialog constructor
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