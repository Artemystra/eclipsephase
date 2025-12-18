class EPmenuLayer extends PlaceablesLayer {
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

            const menuItem = document.createElement("button");
            menuItem.classList.add("scene-control", "ep-menu", "ep-restore-rest", "control", "ui-control", "layer", "icon", "fa-regular", "fa-battery-bolt");
            menuItem.title = "Restore Rest (All Players)";
            menuItem.role = "tab"
            
            if (!isGM) return;

            if (html.querySelector('ep-menu.ep-restore-rest')) return;

            EPmenu.insertAdjacentElement("afterend", menuItem)

            menuItem.addEventListener("click", async (event) => {
                let charList = getActorsWithOwners()

                let charSelect = await selectChars(charList)

                if(charSelect.cancelled){
                  return
                }

                let resetCount = charSelect.resetList.length

                if (resetCount > 0){
                  for (let actor of game.actors){
                    let actorID = actor._id;
                    for (let id of charSelect.resetList){
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

            async function selectChars(charList){
              let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
              let resetButton = game.i18n.localize('ep2e.actorSheet.button.reset');
              let closeButton = game.i18n.localize('ep2e.actorSheet.button.close');
              let title = game.i18n.localize('ep2e.systemMessage.resetRest.title');
              const activeChars = charList[0];
              const otherChars = charList[1];
              const activeCharsCount = charList[0].length;
              const otherCharsCount = charList[1].length;
              const template = "systems/eclipsephase/templates/menu/menu-list-dialog.html";
              const html = await renderTemplate(template, {activeChars, otherChars, activeCharsCount, otherCharsCount});

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
                              callback: html => resolve(_proResetPlayerList(html[0].querySelector("form")))
                          }
                        },
                        default: "normal",
                        render: (html) => {
                          const selectAllCheckbox = html.find('#resetRestSelectAll');
                          selectAllCheckbox.on('change', (e) => {
                            checkAllCharacters(html, (! e.target.checked));
                          });
                          const charCheckBoxes = getCharacterCheckboxes(html);
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

            //selectChars results
            function _proResetPlayerList(form) {
              let resetList = [];
              for (let key of Object.entries(form)){
                if(key[1].checked === true){
                    resetList.push(key[1].name)
                }
              }
              return {
                  resetList
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
