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
            const EPmenu = html.find('.fa-bookmark').parent()
            if (isGM && active) {
              EPmenu.after(
                '<li class="scene-control ep-menu ep-restore-rest" title="Restore Rest (All Players)"><i class="fa-regular fa-battery-bolt"></i></li>'
              )
            }
            html
              .find('.ep-menu.ep-restore-rest')
              .click(async event => {
                let charList = await identifyChars()

                let charCount = charList.length

                let charSelect = await selectChars(charList, charCount)

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

            async function selectChars(charList, charCount){
              let cancelButton = game.i18n.localize('ep2e.roll.dialog.button.cancel');
              let resetButton = game.i18n.localize('ep2e.actorSheet.button.reset');
              let closeButton = game.i18n.localize('ep2e.actorSheet.button.close');
              let title = game.i18n.localize('ep2e.systemMessage.resetRest.title');
              const template = "systems/eclipsephase/templates/chat/list-dialog.html";
              const html = await renderTemplate(template, {charList, charCount});

              
              if(charCount > 0){
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

            //Guns skill check results
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

            async function identifyChars() {
              let ownedChars = [];
              let charIDs = [];
              for (let u of game.users){
                  if (u.character){
                      charIDs.push(u.character._id);
                  }
              }
    
              for (let a of game.actors){
                  for (let o of charIDs){
                      if (a._id === o){
                        ownedChars.push(a);
                      }
                  }
              }
              return ownedChars
            }
          }

          
}
