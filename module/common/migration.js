export async function migrationLegacy(startMigration, endMigration){
    if (startMigration){
  
        for (let actor of game.actors){
      
          //Item migration script
          for(let item of actor.items) {
            let itemID = item._id;
            let itemType = item.type;
            let itemUpdated = item.system.updated
            let updateCost = "";
            let updateSlot = "";
            let updateMode = "";
            let updateWare = "";
            let updateSize = "";
            let updateVehicleType = "";
            let updateApt = "";
            let updatePsiType = "";
            let updateDuration = "";
            let updateAction = "";
            let updateProgram = "";
            let updateArmorUsed = "";
            let itemUpdate = [];
            let skillApt = item.system.aptitude;
            let psiType = item.system.psiType;
            let psiDuration = item.system.duration;
            let psiAction = item.system.actionType;
            let slotType = item.system.slotType;
            let costType = item.system.cost;
            let firingMode = item.system.firingMode;
            let armorUsed = item.system.armorused;
            let programLevel = item.system.programLevel;
            let vehicleType = item.system.type;
            let wareType = item.system.wareType;
      
            if (itemType === "gear" && !itemUpdated){
              switch (costType) {
                case 'Minor':
                  updateCost = "minor"
                  break;
                case 'Moderate':
                  updateCost = "moderate"
                  break;
                case 'Major':
                  updateCost = "major"
                  break;
                case 'Rare':
                  updateCost = "rare"
                  break;
                default:
                  break;
              }
      
              switch (slotType) {
                case 'Bulky':
                  updateSlot = "bulky"
                  break;
                case 'Consumable':
                  updateSlot = "consumable"
                  break;
                case 'Accessory':
                  updateSlot = "accessory"
                  break;
                case 'Not Mobile':
                  updateSlot = "notMobile"
                  break;
                default:
                  break;
              }
              itemUpdate.push({
                "_id" : itemID,
                "system.updated": true,
                "system.slotType": updateSlot,
                "system.cost": updateCost
              });
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
      
            if (itemType === "rangedWeapon" && !itemUpdated){
              if (firingMode){
                switch (firingMode) {
                  case 'SS':
                    updateMode = "ss"
                    break;
                  case 'SA':
                    updateMode = "sa"
                    break;
                  case 'SA/BF':
                    updateMode = "saBF"
                    break;
                  case 'BF/FA':
                    updateMode = "bfFA"
                    break;
                  case 'SA/BF/FA':
                    updateMode = "saBFfa"
                    break;
                  default:
                    break;
                }
              }
      
              switch (costType) {
                case 'Minor':
                  updateCost = "minor"
                  break;
                case 'Moderate':
                  updateCost = "moderate"
                  break;
                case 'Major':
                  updateCost = "major"
                  break;
                case 'Rare':
                  updateCost = "rare"
                  break;
                default:
                  break;
              }
      
              switch (slotType) {
                case 'Integrated':
                  updateSlot = "integrated"
                  break;
                case 'Sidearm':
                  updateSlot = "sidearm"
                  break;
                case 'One Handed':
                  updateSlot = "oneHanded"
                  break;
                case 'Two Handed':
                  updateSlot = "twoHanded"
                  break;
                case 'Bulky':
                  updateSlot = "bulky"
                  break;
                default:
                  break;
              }
              itemUpdate.push({
                "_id" : itemID,
                "system.updated": true,
                "system.firingMode": updateMode,
                "system.slotType": updateSlot,
                "system.cost": updateCost
              });
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
      
            if (itemType === "ccWeapon" && !itemUpdated){
              switch (costType) {
                case 'Minor':
                  updateCost = "minor"
                  break;
                case 'Moderate':
                  updateCost = "moderate"
                  break;
                case 'Major':
                  updateCost = "major"
                  break;
                case 'Rare':
                  updateCost = "rare"
                  break;
                default:
                  break;
              }
      
              switch (slotType) {
                case 'Integrated':
                  updateSlot = "integrated"
                  break;
                case 'Sidearm':
                  updateSlot = "sidearm"
                  break;
                case 'One Handed':
                  updateSlot = "oneHanded"
                  break;
                case 'Two Handed':
                  updateSlot = "twoHanded"
                  break;
                case 'Bulky':
                  updateSlot = "bulky"
                  break;
                default:
                  break;
              }
              itemUpdate.push({
                "_id" : itemID,
                "system.updated": true,
                "system.slotType": updateSlot,
                "system.cost": updateCost
              });
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
      
            if (itemType === "armor" && !itemUpdated){
              switch (costType) {
                case 'Minor':
                  updateCost = "minor"
                  break;
                case 'Moderate':
                  updateCost = "moderate"
                  break;
                case 'Major':
                  updateCost = "major"
                  break;
                case 'Rare':
                  updateCost = "rare"
                  break;
                default:
                  break;
              }
      
              switch (slotType) {
                case 'Main Armor':
                  updateSlot = "main"
                  break;
                case 'Additional Armor':
                  updateSlot = "additional"
                  break;
                default:
                  break;
              }
              itemUpdate.push({
                "_id" : itemID,
                "system.updated": true,
                "system.slotType": updateSlot,
                "system.cost": updateCost
              });
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
      
            if (itemType === "ware" && !itemUpdated){
              switch (costType) {
                case 'Minor':
                  updateCost = "minor"
                  break;
                case 'Moderate':
                  updateCost = "moderate"
                  break;
                case 'Major':
                  updateCost = "major"
                  break;
                case 'Rare':
                  updateCost = "rare"
                  break;
                default:
                  break;
              }
      
              switch (wareType) {
                case 'B':
                  updateWare = "b"
                  break;
                case 'BCH':
                  updateWare = "bch"
                  break;
                case 'BH':
                  updateWare = "bh"
                  break;
                case 'BHM':
                  updateWare = "bhm"
                  break;
                case 'BM':
                  updateWare = "bm"
                  break;
                case 'C':
                  updateWare = "c"
                  break;
                case 'CH':
                  updateWare = "ch"
                  break;
                case 'CHN':
                  updateWare = "chn"
                  break;
                case 'CHM':
                  updateWare = "chm"
                  break;
                case 'H':
                  updateWare = "h"
                  break;
                case 'HN':
                  updateWare = "hn"
                  break;
                case 'HMN':
                  updateWare = "hmn"
                  break;
                case 'N':
                  updateWare = "n"
                  break;
                case 'NH':
                  updateWare = "nh"
                  break;
                case 'MN':
                  updateWare = "mn"
                  break;
                default:
                  break;
              }
      
              itemUpdate.push({
                "_id" : itemID,
                "system.updated": true,
                "system.wareType": updateWare,
                "system.cost": updateCost
              });
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
      
            if (itemType === "vehicle" && !itemUpdated){
              switch (costType) {
                case 'Minor':
                  updateCost = "minor"
                  break;
                case 'Moderate':
                  updateCost = "moderate"
                  break;
                case 'Major':
                  updateCost = "major"
                  break;
                case 'Rare':
                  updateCost = "rare"
                  break;
                default:
                  break;
              }
      
              switch (vehicleType) {
                case 'Robot':
                  updateVehicleType = "robot"
                  break;
                case 'Vehicle':
                  updateVehicleType = "vehicle"
                  break;
                case 'Morph':
                  updateVehicleType = "morph"
                  break;
                case 'Smart-Animal':
                  updateVehicleType = "animal"
                  break;
                default:
                  break;
              }
              
              switch (slotType) {
                case 'Very Small':
                  updateSize = "vs"
                  break;
                case 'Small':
                  updateSize = "s"
                  break;
                case 'Medium':
                  updateSize = "m"
                  break;
                case 'Large':
                  updateSize = "l"
                  break;
                case 'Very Large':
                  updateSize = "vl"
                  break;
                default:
                  break;
              }
      
              itemUpdate.push({
                "_id" : itemID,
                "system.updated": true,
                "system.type": updateVehicleType,
                "system.slotType": updateSize,
                "system.cost": updateCost
              });
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
      
            if (itemType === "grenade" && !itemUpdated){
              switch (costType) {
                case 'Minor':
                  updateCost = "minor"
                  break;
                case 'Moderate':
                  updateCost = "moderate"
                  break;
                case 'Major':
                  updateCost = "major"
                  break;
                case 'Rare':
                  updateCost = "rare"
                  break;
                default:
                  break;
              }
              
              switch (slotType) {
                case 'Consumable':
                  updateSize = "consumable"
                  break;
                default:
                  break;
              }
      
              switch (armorUsed) {
                case 'None':
                  updateArmorUsed = "none"
                  break;
                case 'Kinetic':
                  updateArmorUsed = "kinetic"
                  break;
                case 'Energy':
                  updateArmorUsed = "energy"
                  break;
                default:
                  break;
              }
      
              itemUpdate.push({
                "_id" : itemID,
                "system.updated": true,
                "system.armorUsed": updateArmorUsed,
                "system.slotType": updateSize,
                "system.cost": updateCost
              });
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
      
            if (itemType === "program" && !itemUpdated){
              switch (programLevel) {
                case 'Intruder':
                  updateProgram = "intruder"
                  break;
                case 'User':
                  updateProgram = "user"
                  break;
                case 'Admin':
                  updateProgram = "admin"
                  break;
                case 'Owner':
                  updateProgram = "owner"
                  break;
                default:
                  break;
              }
      
              itemUpdate.push({
                "_id" : itemID,
                "system.updated": true,
                "system.programLevel": updateProgram
              });
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
            
            if (item.type === "knowSkill" && !itemUpdated || item.type === "specialSkill" && !itemUpdated){
              switch (skillApt) {
                case 'Intuition':
                  updateApt = "int"
                  break;
                case 'Cognition':
                  updateApt = "cog"
                  break;
                case 'Reflexes':
                  updateApt = "ref"
                  break;
                case 'Savvy':
                  updateApt = "sav"
                  break;
                case 'Somatics':
                  updateApt = "som"
                  break;
                case 'Willpower':
                  updateApt = "wil"
                  break;
                default:
                  break;
              }
                itemUpdate.push({
                  "_id" : itemID,
                  "system.updated": true,
                  "system.aptitude": updateApt
                });
                actor.updateEmbeddedDocuments("Item", itemUpdate);
              }
            
      
            if (item.type === "aspect" && !itemUpdated){
              switch (psiType) {
                case '':
                  updatePsiType = "gamma"
                  break;
                case 'none':
                  updatePsiType = "gamma"
                  break;
                case 'Gamma':
                  updatePsiType = "gamma"
                  break;
                case 'Chi':
                  updatePsiType = "chi"
                  break;
                case 'Epsilon':
                  updatePsiType = "epsilon"
                  break;
                default:
                  break;
              }
      
              switch (psiDuration) {
                case 'Instant':
                  updateDuration = "instant"
                  break;
                case 'Actions Turns':
                  updateDuration = "action"
                  break;
                case 'Minutes':
                  updateDuration = "minutes"
                  break;
                case 'Hours':
                  updateDuration = "hours"
                  break;
                case 'Sustained':
                  updateDuration = "sustained"
                  break;
                default:
                  break;
              }
      
              switch (psiAction) {
                case 'Quick':
                  updateAction = "quick"
                  break;
                case 'Task':
                  updateAction = "task"
                  break;
                case 'Complex':
                  updateAction = "complex"
                  break;
                default:
                  break;
              }
      
              itemUpdate.push({
                "_id" : itemID,
                "system.updated": true,
                "system.psiType": updatePsiType,
                "system.actionType": updateAction,
                "system.duration": updateDuration
              });
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
          }
      
          if (actor.system.mods.woundMultiplier < 1){
            actor.update({"system.mods.woundMultiplier" : 1})
          }
      
          //Ego Details migration (only player characters)
          if (actor.type === "character"){
            let genderSelection = actor.system.ego.gender;
            let originSelection = actor.system.ego.origin;
            let sexSelection = actor.system.ego.sex;
            let updateGender = "";
            let updateOrigin = "";
            let updateSex = "";
            switch (originSelection) {
              case 'Anarchist':
                updateOrigin = "anarchist"
                break;
              case 'Argonaut':
                updateOrigin = "argonaut"
                break;
              case 'Barsoomian':
                updateOrigin = "barsoomian"
                break;
              case 'Brinker':
                updateOrigin = "brinker"
                break;
              case 'Criminal':
                updateOrigin = "criminal"
                break;
              case 'Extropian':
                updateOrigin = "extropian"
                break;
              case 'Hypercorps':
                updateOrigin = "hypercorps"
                break;
              case 'Jovian':
                updateOrigin = "jovian"
                break;
              case 'Lunar/Orbital':
                updateOrigin = "lunar"
                break;
              case 'Mercurial':
                updateOrigin = "mercurial"
                break;
              case 'Reclaimer':
                updateOrigin = "reclaimer"
                break;
              case 'Scum':
                updateOrigin = "scum"
                break;
              case 'Socialite':
                updateOrigin = "socialite"
                break;
              case 'Titanian':
                updateOrigin = "titanian"
                break;
              case 'Venusian':
                updateOrigin = "venusian"
                break;
              case 'Regional':
                updateOrigin = "regional"
                break;
              default:
                break;
            }
        
            switch (genderSelection) {
              case 'Cisgender':
                updateGender = "cis"
                break;
              case 'Transgender':
                updateGender = "trans"
                break;
              case 'Non-Binary':
                updateGender = "nonBi"
                break;
              case 'Genderfluid':
                updateGender = "fluid"
                break;
              case 'Agender':
                updateGender = "aGen"
                break;
              case 'Bigender':
                updateGender = "biGen"
                break;
              case 'Polygender':
                updateGender = "polGen"
                break;
              case 'Neutrois':
                updateGender = "neu"
                break;
              case 'Gender Apathetic':
                updateGender = "genAp"
                break;
              case 'Intergender':
                updateGender = "inter"
                break;
              case 'Demigender':
                updateGender = "demi"
                break;
              case 'Greygender':
                updateGender = "grey"
                break;
              case 'Aporgender':
                updateGender = "apora"
                break;
              case 'Maverique':
                updateGender = "mav"
                break;
              case 'Novigender':
                updateGender = "novi"
                break;
              default:
                break;
            }
        
            switch (sexSelection) {
              case 'Male':
                updateSex = "male"
                break;
              case 'Female':
                updateSex = "female"
                break;
              case 'Intersex':
                updateSex = "inter"
                break;
              case 'Dyadic':
                updateSex = "dyadic"
                break;
              default:
                break;
            }
      
            if (updateGender || updateOrigin || updateSex){
              actor.update({"system.ego.gender" : updateGender,"system.ego.origin" : updateOrigin,"system.ego.sex" : updateSex});
            }
          }
          
          //Update aptitude Names 
            
            actor.update({"system.aptitudes.cog.name" : "ep2e.actorSheet.aptitudes.cog", "system.aptitudes.int.name" : "ep2e.actorSheet.aptitudes.int","system.aptitudes.ref.name" : "ep2e.actorSheet.aptitudes.ref","system.aptitudes.sav.name" : "ep2e.actorSheet.aptitudes.sav","system.aptitudes.som.name" : "ep2e.actorSheet.aptitudes.som","system.aptitudes.wil.name" : "ep2e.actorSheet.aptitudes.wil", "system.aptitudes.cog.label" : "ep2e.actorSheet.aptitudes.cognition", "system.aptitudes.int.label" : "ep2e.actorSheet.aptitudes.intuition", "system.aptitudes.ref.label" : "ep2e.actorSheet.aptitudes.reflexes", "system.aptitudes.sav.label" : "ep2e.actorSheet.aptitudes.savvy", "system.aptitudes.som.label" : "ep2e.actorSheet.aptitudes.somatics", "system.aptitudes.wil.label" : "ep2e.actorSheet.aptitudes.willpower"});
          
        }
      
        game.settings.set("eclipsephase", "migrationVersion", "0.8.1");
        endMigration = true
        return {endMigration}
      }
}

export async function migrationPre0861(startMigration, endMigration){
    if (startMigration){
        for(let actor of game.actors){
            for(let item of actor.items){
                let itemID = item._id;
                let latestUpdate = "0.8.6.1";
                let itemUpdate = []

                itemUpdate.push({
                    "_id" : itemID,
                    "system.updated": latestUpdate
                  });
                  actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
        }

        game.settings.set("eclipsephase", "migrationVersion", "0.8.6.1");
        endMigration = true
        return {endMigration}
    }
}

export async function migrationPre09(startMigration, endMigration){
  if (startMigration){
    console.log("0.9 Migration triggered!")
      for(let actor of game.actors){
          for(let item of actor.items){
            let latestUpdate = "0.9";
            let updated = foundry.utils.isNewerVersion(item.system.updated, "0.9")
            console.log("This item is on version: ", item.system.updated, " that is newer than 0.9! That's ", updated)
            if(item.system.type === "animal" && !updated || item.system.type === "vehicle" && !updated || item.system.type === "robot" && !updated || item.system.type === "morph" && !updated){
              let itemID = item._id;
              let vig = item.system.vig;
              let mox = item.system.mox;
              let ins = item.system.ins;
              let flex = item.system.flex;
              let threat = item.system.threat;
              let cog = item.system.cog;
              let int = item.system.int;
              let ref = item.system.ref;
              let sav = item.system.sav;
              let som = item.system.som;
              let wil = item.system.wil;
              let curIns = item.system.curIns;
              let curMox = item.system.curMox;
              let curVig = item.system.curVig;
              let curFlex = item.system.curFlex;
              let curThreat = item.system.curThreat;
              let itemUpdate = [];
              let armorTotal = item.system.armor
              let movementType = item.system.mov
              let movementTypes = movementType.split(',');
              let number = 0;
              let animalUpdate = {"_id": itemID};
              let morphUpdate = {"_id": itemID};
              let generalUpdate = {"_id": itemID};
              let armor = {"_id": itemID};
              let movement = {"_id": itemID};
              
              //Migrate Vehicles & Robots
              if(item.system.type === "vehicle" || item.system.type === "robot"){
                console.log("I am ", item.name, " and being currently updated!")
                generalUpdate["system.pools.vig.max"] = vig,
                generalUpdate["system.pools.vig.curent"] = curVig,
                generalUpdate["system.pools.flex.max"] = flex,
                generalUpdate["system.pools.flex.curent"] = curFlex
                generalUpdate["system.skills.1.name"] = "Fray"
                generalUpdate["system.skills.1.value"] = 30
                generalUpdate["system.skills.2.name"] = "Guns"
                generalUpdate["system.skills.2.value"] = 30
                generalUpdate["system.skills.3.name"] = "Hardware:[appropriate field]"
                generalUpdate["system.skills.3.value"] = 20
                generalUpdate["system.skills.3.specname"] = "specific bot/vehicle"
                generalUpdate["system.skills.4.name"] = "Infosec"
                generalUpdate["system.skills.4.value"] = 20
                generalUpdate["system.skills.5.name"] = "Interface"
                generalUpdate["system.skills.5.value"] = 30
                generalUpdate["system.skills.6.name"] = "Perceive"
                generalUpdate["system.skills.6.value"] = 40
                generalUpdate["system.skills.7.name"] = "Pilot:[appropriate field]"
                generalUpdate["system.skills.7.value"] = 60
                generalUpdate["system.skills.7.name"] = "specific bot/vehicle"
                generalUpdate["system.skills.8.name"] = "Research"
                generalUpdate["system.skills.8.value"] = 20
                generalUpdate["system.skills.9.name"] = "Know:[bot/vehicle] Specs"
                generalUpdate["system.skills.9.value"] = 80
                generalUpdate["system.updated"] = latestUpdate
              }

              //Migrate Morphs
              if(item.system.type === "morph"){
                console.log("I am ", item.name, " and being currently updated!")
                morphUpdate["system.aptitudes.cog.value"] = cog,
                morphUpdate["system.aptitudes.int.value"] = int,
                morphUpdate["system.aptitudes.ref.value"] = ref,
                morphUpdate["system.aptitudes.sav.value"] = sav,
                morphUpdate["system.aptitudes.som.value"] = som,
                morphUpdate["system.aptitudes.wil.value"] = wil,
                morphUpdate["system.pools.vig.max"] = vig,
                morphUpdate["system.pools.vig.curent"] = curVig,
                morphUpdate["system.pools.mox.max"] = mox,
                morphUpdate["system.pools.mox.curent"] = curMox,
                morphUpdate["system.pools.ins.max"] = ins,
                morphUpdate["system.pools.ins.curent"] = curIns,
                morphUpdate["system.pools.flex.max"] = flex,
                morphUpdate["system.pools.flex.curent"] = curFlex
                morphUpdate["system.updated"] = latestUpdate
              }

              //Migrate Smart Animals
              if(item.system.type === "animal"){
                console.log("I am ", item.name, " and being currently updated!")
                animalUpdate["system.aptitudes.cog.value"] = cog,
                animalUpdate["system.aptitudes.int.value"] = int,
                animalUpdate["system.aptitudes.ref.value"] = ref,
                animalUpdate["system.aptitudes.sav.value"] = sav,
                animalUpdate["system.aptitudes.som.value"] = som,
                animalUpdate["system.aptitudes.wil.value"] = wil,
                animalUpdate["system.pools.threat.max"] = threat,
                animalUpdate["system.pools.threat.curent"] = curThreat
                animalUpdate["system.updated"] = latestUpdate
                
              }
              
              //Migrate Vehicles Movement
              for (let type of movementTypes){
                let toSplit = movementTypes[number].trim();
                
                let movementSplit = toSplit.split(' ');
                let speedKey = "system.movement."+(number+1)+".speed";
                let typeKey = "system.movement."+(number+1)+".type";
                movement[speedKey] = movementSplit[0];
                movement[typeKey] = movementSplit[1].toLowerCase();
                number++
              }

              //Migrate Vehicles Armor

              if(armorTotal === "-" || !armorTotal){
                armor["system.armor.energy"] = 0;
                armor["system.armor.kinetic"] = 0;
              }
              else{
                let armorSplit =  armorTotal.split('/');
                armor["system.armor.energy"] = armorSplit[0];
                armor["system.armor.kinetic"] = armorSplit[1];
              }

              itemUpdate.push(generalUpdate, morphUpdate, animalUpdate, movement, armor);
                actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
          }
      }

      game.settings.set("eclipsephase", "migrationVersion", "0.9");
      endMigration = true
      return {endMigration}
  }
}
