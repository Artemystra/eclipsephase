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

            rezMenu.addEventListener("click", async (event) => {
                let charList = getActorsWithOwners()

                let charSelect = await selectCharsToRez(charList)

                if(charSelect.cancelled){
                  return
                }
                
                let resetCount = charSelect.updateList.length;
                const generalRez = Number(charSelect?.updateList[0]?.value ?? 0);
                for (let entry=1; entry<resetCount; entry++){
                    const actor = game.actors.get(charSelect.updateList[entry].id);
                    const currentRez = actor.system.rezPoints.value;
                    const privateRez = Number(charSelect?.updateList[entry]?.value ?? 0);
                    const newRez = generalRez + privateRez + currentRez;
                    if(generalRez > 0 || privateRez > 0){
                      actor.update({"system.rezPoints.value" : newRez})
                    }
                  }
            })

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
              const html = await renderTemplate(template, {activeChars, otherChars, activeCharsCount, otherCharsCount, menuType});

              if(activeCharsCount + otherCharsCount > 0){
                return new Promise(resolve => {
                    const data = {
                        title: title,
                        content: html,
                        buttons: {
                          cancel: {
                            label: cancelButton,
                            callback: html => resolve ({cancelled: true})
                          },
                          normal: {
                              label: resetButton,
                              callback: html => resolve(_updatePlayerCharacter(html[0].querySelector("form")))
                          }
                        },
                        default: "normal",
                        render: (html) => {
                          const selectAllCheckbox = html.find('#resetRestSelectAll');
                          selectAllCheckbox.on('change', (e) => {
                            checkAllCharacters(html, (! e.target.checked));
                          });
                          const charCheckBoxes = getCharacterCheckboxes(html, charList);
                          charCheckBoxes.on('change', (e) => {
                            const checkedBoxes = charCheckBoxes.toArray().reduce((cnt, el) => (cnt + el.checked), 0);
                            selectAllCheckbox.get(0).checked = (charCheckBoxes.length === checkedBoxes);
                          });
                        },
                        close: () => resolve ({cancelled: true})
                    };
                    let options = {width:536}
                    new Dialog(data, options).render(true);
                });
              }
              else{
                return new Promise(resolve => {
                    const data = {
                        title: title,
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
                    let options = {width:536}
                    new Dialog(data, options).render(true);
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
              const html = await renderTemplate(template, {activeChars, otherChars, activeCharsCount, otherCharsCount, menuType});

              if(activeCharsCount + otherCharsCount > 0){
                return new Promise(resolve => {
                    const data = {
                        title: title,
                        content: html,
                        buttons: {
                          cancel: {
                            label: cancelButton,
                            callback: html => resolve ({cancelled: true})
                          },
                          normal: {
                              label: resetButton,
                              callback: html => resolve(_updatePlayerCharacter(html[0].querySelector("form")))
                          }
                        },
                        default: "normal",
                        close: () => resolve ({cancelled: true})
                    };
                    let options = {width:536}
                    new Dialog(data, options).render(true);
                });
              }
              else{
                return new Promise(resolve => {
                    const data = {
                        title: title,
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
                    let options = {width:536}
                    new Dialog(data, options).render(true);
                });
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
           * @param html {jQuery}
           * @param activeOnly {boolean}
           */
          function checkAllCharacters(html, activeOnly) {
            getCharacterCheckboxes(html).each((idx, el) => {
              if (! activeOnly /*|| ( !! el.getAttribute('data-owner-id'))*/) {
                el.checked = true;
              } else {
                el.checked = false;
              }
            });
          }

          /**
           * Gets the jQuery list of checkboxes for the Actors in the form.
           *
           * @param html {jQuery}
           * @returns {jQuery}
           */
          function getCharacterCheckboxes(html) {
            return html.find('input[data-checkbox-type="player-character"][data-owner-id]');
          }
        }
    }
