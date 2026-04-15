class EPmenuLayer extends foundry.canvas.layers.PlaceablesLayer {
  constructor () {
    super()
    this.objects = {}
  }

  static get layerOptions () {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: 'EPmenu',
      class: 'testclass',
      zIndex: 60
    })
  }

  static get documentName () {
    return 'Token'
  }

  get placeables () {
    return []
  }
}

export class EPmenu {
  //This is helpful in case of us wanting to implement a subnavigation for our GM menu
  /*static getButtons (controls) {
  canvas.EPgmtools = new EPmenuLayer() 
  const isKeeper = game.user.isGM
  controls.push({
      name: 'EPmenu',
      title: 'EP GM Tools',
      layer: 'EPgmtools',
      icon: 'EPicon ep-gm-icon',
      class: 'testor',
      visible: isKeeper,
      tools:  [
                  {
                      button: true,
                      icon: 'fas fa-moon',
                      name: 'startrest',
                      title: 'CoC7.startRest',
                      onClick:    (event => {
                                      for (let actor of game.actors){
                                          let actorType = actor.type;
                                          if (actorType === "character"){
                                              actor.update({"system.rest.long" : false, "system.rest.short1" : false, "system.rest.short2" : false});
                                          }
                                      }
                                  })
                  }
              ]
  })
  const EPmenu = html.find('.ep-gm-icon').parent()
  EPmenu.addClass('ep-menu')
  }*/

  static renderControls (app, html, data) {
    const isGM = game.user.isGM
    const active = game.settings.get("eclipsephase", "GMmenu")
    const EPmenu = html.querySelector('.fa-bookmark').parentElement

    //Defines the rest menu item
    const restMenu = document.createElement("button");
    restMenu.classList.add("scene-control", "ep-menu", "ep-restore-rest", "control", "ui-control", "layer", "icon", "fa-regular", "fa-battery-bolt");
    restMenu.title = game.i18n.localize('ep2e.systemMessage.resetRest.title');
    restMenu.role = "tab"
    
    //Defines the rez menu item
    const rezMenu = document.createElement("button");
    rezMenu.classList.add("scene-control", "ep-menu", "ep-provide-rez", "control", "ui-control", "layer", "icon", "fa-regular", "fa-circle-up");
    rezMenu.title = game.i18n.localize('ep2e.systemMessage.addRez.title');
    rezMenu.role = "tab"
    
    if (!isGM) return;

    const controlsRoot = html instanceof HTMLElement ? html : html[0] ?? html;
    const bookmarkButton = controlsRoot.querySelector('.fa-bookmark')?.parentElement;
    if (!bookmarkButton) return;

    // Prevent duplicates
    if (controlsRoot.querySelector('.ep-restore-rest') || controlsRoot.querySelector('.ep-provide-rez')) {
      return;
    }

    EPmenu.insertAdjacentElement("afterend", restMenu)
    EPmenu.insertAdjacentElement("afterend", rezMenu)

    restMenu.addEventListener("click", async (event) => {
      let charList = getActorsWithOwners()

      let charSelect = await selectCharsToRest(charList)

      if(charSelect.cancelled){
        return
      }

      let resetCount = charSelect.updateList.length

      if (resetCount > 0){
        for (let actor of game.actors){
          let actorID = actor.id;
          for (let id of charSelect.updateList){
            if (actorID === id){
              actor.update({"system.rest.long" : false, "system.rest.short1" : false, "system.rest.short2" : false, "system.rest.shortExtra" : false});
              for (let effect of actor.effects){
                if (effect.name === "Temp Ignore Trauma" || effect.name === "Temp Ignore Wound"){
                  let effectID = effect._id;
                  actor.deleteEmbeddedDocuments('ActiveEffect', [effectID]);
                }
              }
            }
          }
        }
      }
    })

    rezMenu.addEventListener("click", async event => {
      const charList = getActorsWithOwners();
      const charSelect = await selectCharsToRez(charList);

      if (charSelect.cancelled) return;

      const generalRez = Number(charSelect?.updateList?.[0]?.value ?? 0);

      for (const row of charSelect.updateList.slice(1)) {

        if (!row?.id) continue;

        const actor = game.actors.get(row.id);
        if (!actor) continue;

        const currentRez = Number(actor.system?.rezPoints?.value ?? 0);
        const privateRez = Number(row.value ?? 0);
        const newRez = generalRez + privateRez + currentRez;

        if (generalRez > 0 || privateRez > 0) {
          await actor.update({ "system.rezPoints.value": newRez });
        }
      }
    });

    async function selectCharsToRest(charList){
      let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
      let resetButton = game.i18n.localize('ep2e.actorSheet.button.reset');
      let closeButton = game.i18n.localize('ep2e.actorSheet.button.close');
      let title = game.i18n.localize('ep2e.systemMessage.resetRest.title');
      const menuType = "restMenu";
      const activeChars = charList[0];
      const otherChars = charList[1];
      const activeCharsCount = charList[0].length;
      const otherCharsCount = charList[1].length;
      const template = "systems/eclipsephase/templates/menu/menu-list-dialog.html";
      const html = await foundry.applications.handlebars.renderTemplate(template, {activeChars, otherChars, activeCharsCount, otherCharsCount, menuType});

      if (activeCharsCount + otherCharsCount > 0) {
        const result = await foundry.applications.api.DialogV2.wait({
          window: { title },
          content: html,
          buttons: [
            {
              action: "cancel",
              label: cancelButton,
              callback: () => ({ cancelled: true })
            },
            {
              action: "confirm",
              label: resetButton,
              default: true,
              callback: (event, button) => _updatePlayerCharacter(button.form)
            }
          ],
          position: { width: 536 },
          modal: true,
          rejectClose: false,
          render: (event, dialog) => {
            const root = dialog.element;
            if (!root) return;

            const selectAllCheckbox = root.querySelector("#resetRestSelectAll");
            const charCheckBoxes = getCharacterCheckboxes(root);

            if (selectAllCheckbox) {
              selectAllCheckbox.addEventListener("change", e => {
                checkAllCharacters(root, !e.currentTarget.checked);
              });
            }

            charCheckBoxes.forEach(box => {
              box.addEventListener("change", () => {
                const checkedBoxes = charCheckBoxes.reduce((cnt, el) => {
                  return cnt + (el.checked ? 1 : 0);
                }, 0);

                if (selectAllCheckbox) {
                  selectAllCheckbox.checked = charCheckBoxes.length === checkedBoxes;
                }
              });
            });
          }
        });

        return result ?? { cancelled: true };
      }
      else {
        const result = await foundry.applications.api.DialogV2.wait({
          window: { title },
          content: html,
          buttons: [
            {
              action: "close",
              label: closeButton,
              default: true,
              callback: () => ({ cancelled: true })
            }
          ],
          position: { width: 536 },
          modal: true,
          rejectClose: false
        });

        return result ?? { cancelled: true };
      }

      function checkAllCharacters(root, inverseCheckedState) {
        const checkboxes = getCharacterCheckboxes(root);

        checkboxes.forEach(box => {
          box.checked = !inverseCheckedState;
        });
      }
    }

    async function selectCharsToRez(charList){
      let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
      let resetButton = game.i18n.localize('ep2e.systemMessage.addRez.confirm');
      let closeButton = game.i18n.localize('ep2e.actorSheet.button.close');
      let title = game.i18n.localize('ep2e.systemMessage.addRez.title');
      const menuType = "rezMenu";
      const activeChars = charList[0];
      const otherChars = charList[1];
      const activeCharsCount = charList[0].length;
      const otherCharsCount = charList[1].length;
      const template = "systems/eclipsephase/templates/menu/menu-list-dialog.html";
      const html = await foundry.applications.handlebars.renderTemplate(template, {activeChars, otherChars, activeCharsCount, otherCharsCount, menuType});

      if (activeCharsCount + otherCharsCount > 0) {
        const result = await foundry.applications.api.DialogV2.wait({
          window: { title },
          content: html,
          buttons: [
            {
              action: "cancel",
              label: cancelButton,
              callback: () => ({ cancelled: true })
            },
            {
              action: "confirm",
              label: resetButton,
              default: true,
              callback: (event, button) => _updatePlayerCharacter(button.form)
            }
          ],
          position: { width: 536 },
          modal: true,
          rejectClose: false
        });

        return result ?? { cancelled: true };
      }
      else {
        const result = await foundry.applications.api.DialogV2.wait({
          window: { title },
          content: html,
          buttons: [
            {
              action: "close",
              label: closeButton,
              default: true,
              callback: () => ({ cancelled: true })
            }
          ],
          position: { width: 536 },
          modal: true,
          rejectClose: false
        });

        return result ?? { cancelled: true };
      }
    }

    //selectChars results
    function _updatePlayerCharacter(form) {
      let updateList = [];
      for (let key of Object.entries(form)){
        if(key[1].checked === true){
          updateList.push(key[1].name)
        }
        else{
          updateList.push({"value" : key[1].value, "id" : key[1].name})
        }
      }
      return {
        updateList
      }
    }

    /**
     * Gets Actors that are player characters and which user (player) they are assigned to, if any.
     *
     * @returns {Array<{actor: Actor, ownedByPlayer: User}>}
     */
    function getActorsWithOwners() {
      const playerCharacterActors = [];
      const activePlayerCharacterActors = [];
      const characterUsers = [];
      for (const user of game.users){
        if (user.character){
          characterUsers.push({ user, charId: user.character._id } );
        }
      }
      for (const a of game.actors){
        if (a.type === "character"){
          const ownedByPlayer = characterUsers.find((characterUser) => (characterUser.charId === a._id));
          if (ownedByPlayer){
            activePlayerCharacterActors.push({actor: a, ownedByPlayer: ownedByPlayer.user});
          }
          else {
            playerCharacterActors.push({actor: a, ownedByPlayer: false});
          }
        }
      }
      return [activePlayerCharacterActors, playerCharacterActors];
    }

    /**
     * Checks Actor checkboxes in form, either the ones that are active, or all of them.
     *
     * @param root {HTMLElement}
     * @param activeOnly {boolean}
     */
    function checkAllCharacters(root, activeOnly) {
      getCharacterCheckboxes(root).forEach((el) => {
        if (!activeOnly /*|| ( !! el.getAttribute('data-owner-id'))*/) {
          el.checked = true;
        } else {
          el.checked = false;
        }
      });
    }

    /**
     * Gets the list of checkboxes for the Actors in the form.
     *
     * @param root {HTMLElement}
     * @returns {HTMLInputElement[]}
     */
    function getCharacterCheckboxes(root) {
      return Array.from(
        root.querySelectorAll('input[data-checkbox-type="player-character"][data-owner-id]')
      );
    }
  }
}