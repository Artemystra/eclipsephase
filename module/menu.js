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
              .click(event => {
                for (let actor of game.actors){
                    let actorType = actor.type;
                    if (actorType === "character"){
                        actor.update({"system.rest.long" : false, "system.rest.short1" : false, "system.rest.short2" : false, "system.rest.shortExtra" : false});
                    }
                }
            })
          }
}
