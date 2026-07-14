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
      for(let actor of game.actors){
          for(let item of actor.items){
            let latestUpdate = "0.9";
            let updated = foundry.utils.isNewerVersion(item.system.updated, "0.9")
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
                generalUpdate["system.pools.vig.max"] = vig,
                generalUpdate["system.pools.vig.curent"] = curVig,
                generalUpdate["system.pools.flex.max"] = flex,
                generalUpdate["system.pools.flex.curent"] = curFlex
                generalUpdate["system.skills.1.name"] = game.i18n.localize("ep2e.skills.vigorSkills.fray");
                generalUpdate["system.skills.1.value"] = 30;
                generalUpdate["system.skills.2.name"] = game.i18n.localize("ep2e.skills.vigorSkills.guns");
                generalUpdate["system.skills.2.value"] = 30;
                generalUpdate["system.skills.3.name"] = game.i18n.localize('ep2e.item.additionalSkill.table.defaultHardwareLabel')+game.i18n.localize('ep2e.item.vehicle.skillFieldDefault');;
                generalUpdate["system.skills.3.value"] = 20;
                generalUpdate["system.skills.3.specname"] = item.name;
                generalUpdate["system.skills.4.name"] = game.i18n.localize("ep2e.skills.insightSkills.infosec");
                generalUpdate["system.skills.4.value"] = 20;
                generalUpdate["system.skills.5.name"] = game.i18n.localize("ep2e.skills.insightSkills.interface");
                generalUpdate["system.skills.5.value"] = 30;
                generalUpdate["system.skills.6.name"] = game.i18n.localize("ep2e.skills.insightSkills.perceive");
                generalUpdate["system.skills.6.value"] = 40;
                generalUpdate["system.skills.7.name"] = game.i18n.localize('ep2e.item.additionalSkill.table.defaultPilotLabel')+game.i18n.localize('ep2e.item.vehicle.skillFieldDefault');
                generalUpdate["system.skills.7.value"] = 60;
                generalUpdate["system.skills.7.specname"] = item.name;
                generalUpdate["system.skills.8.name"] = game.i18n.localize("ep2e.skills.insightSkills.research");
                generalUpdate["system.skills.8.value"] = 20;
                generalUpdate["system.skills.9.name"] = game.i18n.localize('ep2e.item.additionalSkill.table.defaultKnowLabel')+item.name+" Specs";
                generalUpdate["system.skills.9.value"] = 80;
                generalUpdate["system.updated"] = latestUpdate
              }

              //Migrate Morphs
              if(item.system.type === "morph"){
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

export async function migrationPre093(startMigration, endMigration){
  if (startMigration){
      let actorsInQuestion = [];
      for(let actor of game.actors){
        let actorPartial = {"_id": actor._id, "name": actor.name, "unidentifiedWeapons": []}
        let unidentifiedWeapons = actorPartial.unidentifiedWeapons
          for(let item of actor.items){
            const currentVersion = item.system.updated
            const latestUpdate = "0.9.3";
            let updated = foundry.utils.isNewerVersion(currentVersion, latestUpdate)
            if(item.type === "rangedWeapon" && updated === false){
              let itemID = item._id;
              let itemName = item.name;
              let weaponUpdate = {"_id": itemID};
              let itemUpdate = [];
              
              //Migrate Energy Weapons
              if(itemName === "Battle Laser" || item.name === "Hand Laser" || item.name === "Laser Pulser (Lethal)" || item.name === "Laser Pulser (Stun)" || item.name === "MW Agonizer (Pain)" || item.name === "MW Agonizer (Roast)" || item.name === "Particle Beam Bolter" || item.name === "Stunner"){
                weaponUpdate["system.ammoType"] = "beam";
                weaponUpdate["system.updated"] = latestUpdate
              }

              //Migrate Kinetic Weapons
              else if(itemName === "Holdout" || item.name === "Medium Pistol" || item.name === "Heavy Pistol" || item.name === "Machine Pistol" || item.name === "Submachine Gun" || item.name === "Assault Rifle" || item.name === "Battle Rifle" || item.name === "Machine Gun" || item.name === "Sniper Rifle" || item.name === "Polygun Pistol" || item.name === "Polygun Rifle" || item.name === "Pult Gun - Roast" || item.name === "Pult Gun - Stun" || item.name === "Pult Rifle - Roast" || item.name === "Pult Rifle - Stun" || itemName.includes("Pult")){
                weaponUpdate["system.ammoType"] = "kinetic";
                weaponUpdate["system.updated"] = latestUpdate
              }

              //Migrate Seeker Weapons
              else if(itemName === "Disposable Launcher" || item.name === "Seeker Armband" || item.name === "Seeker Pistol" || item.name === "Seeker Rifle" || item.name === "Underbarrel Seeker"){
                weaponUpdate["system.ammoType"] = "seeker";
                weaponUpdate["system.updated"] = latestUpdate
              }

              //Migrate Spray Weapons
              else if(itemName === "Buzzer" || item.name === "Freezer" || item.name === "Plasma Rifle" || item.name === "Shard Pistol" || item.name === "Shredder" || item.name === "Sprayer" || item.name === "Torch" || item.name === "Vortex Ring Gun"){
                weaponUpdate["system.ammoType"] = "spray";
                weaponUpdate["system.updated"] = latestUpdate
              }

              //Migrate Rail Weapons
              else if(itemName.includes("Rail")){
                weaponUpdate["system.ammoType"] = "rail";
                weaponUpdate["system.updated"] = latestUpdate
              }
              else {
                weaponUpdate["name"] = item.name;
                unidentifiedWeapons.push(weaponUpdate)
              }

              itemUpdate.push(weaponUpdate);
              actor.updateEmbeddedDocuments("Item", itemUpdate);
            }
          }
          
          let listOfUnidentifiedWeapons = actorPartial.unidentifiedWeapons
          if (listOfUnidentifiedWeapons.length){
            actorsInQuestion.push(actorPartial)
          }
      }

      if(actorsInQuestion.length){
        let catalogueWeapons = await weaponCategorization(actorsInQuestion)

        if(catalogueWeapons.cancelled){
          return
        }
  
        let weaponUpdate = catalogueWeapons.weaponUpdateList
  
        for (let itemPackage of weaponUpdate){
          let updateID = itemPackage._id;
          for(let actor of game.actors){
            let Updater = []
            if (actor._id === updateID){
              Updater.push(itemPackage[0]);
              actor.updateEmbeddedDocuments("Item", Updater);
            }
          }
        } 
      }


      game.settings.set("eclipsephase", "migrationVersion", "0.9.3");
      endMigration = true
      return {endMigration}
  }

  async function weaponCategorization(actorsInQuestion) {
    const resetButton = game.i18n.localize("ep2e.actorSheet.button.confirm");
    const dialogType = "weaponCategorization";
    const title = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const template = "systems/eclipsephase/templates/chat/list-dialog.html";

    const content = await foundry.applications.handlebars.renderTemplate(template, {
      actorsInQuestion,
      dialogType
    });

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title },
      content,
      buttons: [
        {
          action: "confirm",
          label: resetButton,
          default: true,
          callback: (event, button) => {
            return _proWeaponCategorization(button.form);
          }
        }
      ],
      modal: true,
      rejectClose: false,
      position: { width: 791 }
    });

    return result ?? { cancelled: true };
  }

  //selectChars results
  function _proWeaponCategorization(form) {
    let weaponUpdateList = [];

    for (let key of Object.entries(form)){
      let updatePackage = []
      updatePackage._id = key[1].title

      let weaponUpdateItem = {"_id": key[1].name};
      weaponUpdateItem["system.ammoType"] = key[1].value;
      weaponUpdateItem["system.updated"] = "0.9.3"

      updatePackage.push(weaponUpdateItem)
      weaponUpdateList.push(updatePackage)
    }
    return {
      weaponUpdateList
    }

}
}

export function migrationPre095(startMigration, endMigration){
  
  const latestUpdate = "0.9.5";

  if (startMigration){
    for(let actor of game.actors){
      for(let item of actor.items){
        const currentVersion = item.system.updated
        let updated = foundry.utils.isNewerVersion(currentVersion, latestUpdate)
        
        if(item.type === "rangedWeapon" && updated === false || item.type === "ccWeapon" && updated === false){
          let itemUpdate = []
          let itemID = item._id;
          let traitList = item.system.description
          let traits = traitList.split(',');
          let dv = item.system.dv;
          let firingMode = item.system.firingMode;
          let range = item.system.range;
          let number = 0;
          let weaponUpdate = {"_id": itemID};
          let itemName = item.name;
          let currentVersion = item.system.updated;

          //Convert Item Names
          let nameSplit = itemName.split(" ")
          let nameJoin = nameSplit.join("").toLowerCase()

          //Delete Duplicates & Create New Items
          if (nameJoin.includes("mwagonizer(p") || nameJoin.includes("laserpulser(s") || nameJoin.includes("pultgun-st") || nameJoin.includes("pultrifle-st")){

            itemDeletion(actor, itemID);

          }

          //Migrate Existing Weapons
          else if ( currentVersion != "0.9.5" ){
          //Migrate DV
          let d10 = 0;
          let d6 = 0;
          let bonus = 0;
          
          if(dv){         

            let dvSplit = dv.split('+');
        
            for (let object of dvSplit){
        
              let converted = Number(object)
        
              if(object.includes("d10")){
                let d10Split = object.split("d10")
                let d10Join = d10Split.join("")
                d10 = d10Join
              }
              else if(object.includes("d6")){
                let d6Split = object.split("d6")
                let d6Join = d6Split.join("")
                d6 = d6Join
              }  
              else if(converted != NaN ){
                bonus = object
              }
            }

          }
          
          //Migrate Weapon Traits
          for (let type of traits){

            if (item.system.slotType === "twoHanded"){
              weaponUpdate["system.mode1.traits.twoHanded.value"] = true;
            }

            let toSplit = traits[number].trim();
            
            let traitSplit = toSplit.split(' ');
            let traitCamelCase = "";
            let traitLength = null;

            if(traitSplit){
              traitLength = traitSplit.length
            }

            if(traitLength > 1){
              for(let word of traitSplit){
                traitCamelCase += word.toLowerCase()
              }
            }
            else if (traitLength === 1){
              traitCamelCase = traitSplit[0].toLowerCase()
            }
            
            switch (traitCamelCase){
              case 'armorpiercing':
                weaponUpdate["system.mode1.traits.armorPiercing.value"] = true;
                break;
              case 'armor-piercing':
                weaponUpdate["system.mode1.traits.armorPiercing.value"] = true;
                break;
              case 'concealable':
                weaponUpdate["system.mode1.traits.concealable.value"] = true;
                break;
              case 'entangling':
                weaponUpdate["system.mode1.traits.entangling.value"] = true;
                break;
              case 'fixed':
                weaponUpdate["system.mode1.traits.fixed.value"] = true;
                break;
              case 'knockdown':
                weaponUpdate["system.mode1.traits.knockdown.value"] = true;
                break;
              case 'long':
                weaponUpdate["system.mode1.traits.long.value"] = true;
                break;
              case 'noclose':
                weaponUpdate["system.mode1.traits.noClose.value"] = true;
                break;
              case 'nopointblank':
                weaponUpdate["system.mode1.traits.noPointBlank.value"] = true;
                break;
              case 'nosmartlink':
                weaponUpdate["system.mode1.traits.noSmartlink.value"] = true;
                break;
              case 'pain':
                weaponUpdate["system.mode1.traits.pain.value"] = true;
                break;
              case 'pain(biomorphsonly)':
                weaponUpdate["system.mode1.traits.pain.value"] = true;
                break;
              case 'shock':
                weaponUpdate["system.mode1.traits.shock.value"] = true;
                break;
              case 'single-use':
                weaponUpdate["system.mode1.traits.singleUse.value"] = true;
                break;
              case 'steady':
                weaponUpdate["system.mode1.traits.steady.value"] = true;
                break;
              case 'stun':
                weaponUpdate["system.mode1.traits.stun.value"] = true;
                break;
              case 'fragile':
                weaponUpdate["system.mode1.traits.fragile.value"] = true;
                break;
              case 'reach':
                weaponUpdate["system.mode1.traits.reach.value"] = true;
                break;
              case 'touch-only':
                weaponUpdate["system.mode1.traits.touchOnly.value"] = true;
                break;
              case 'silencer':
                weaponUpdate["system.accessories.silencer.value"] = true;
                break;
              default:
                break;
            }
            number++
          }
          
          //Migrate Ranged
          if(item.type === "rangedWeapon"){
            weaponUpdate["system.mode1.range"] = range;
            weaponUpdate["system.mode1.d10"] = d10;
            weaponUpdate["system.mode1.d6"] = d6;
            weaponUpdate["system.mode1.bonus"] = bonus;
            weaponUpdate["system.mode1.firingMode"] = firingMode;
            weaponUpdate["system.updated"] = latestUpdate;
            if (item.system.mode1.traits.noSmartlink.value === false){
              weaponUpdate["system.accessories.smartlink.value"] = true;
            }
          }

          //Migrate Melee
          if(item.type === "ccWeapon"){
            weaponUpdate["system.mode1.d10"] = d10;
            weaponUpdate["system.mode1.d6"] = d6;
            weaponUpdate["system.mode1.bonus"] = bonus;
            weaponUpdate["system.updated"] = latestUpdate;
          }

          //Migrate Microwave Agonizer
          if(nameJoin.includes("(roast)")){

            weaponUpdate["name"] = "Microwave Agonizer";
            weaponUpdate["img"] = "systems/eclipsephase/resources/icons/267_skill%20magic%20fire%20wall.png";
            weaponUpdate["system.additionalMode"] = true;
            weaponUpdate["system.description"] = "Originally developed for crowd control, the agonizer is also useful for repelling animals. The agonizer fires millimeter-wave beams that create an unpleasant burning sensation in skin (even through armor). Agonizers have two settings. The first is an active denial setting that causes extreme burning pain in biomorph targets, inflicting a pain effect and forcing them to move away from the beam. The second “roast” setting has the same effect as the first, but also actually burns the target. Synthmorphs are unaffected by the pain, but damaged by the roast.";
            weaponUpdate["system.mode1.name"] = "Roast";
            weaponUpdate["system.mode2.name"] = "Pain";
            weaponUpdate["system.mode2.firingMode"] = "sa";
            weaponUpdate["system.mode2.range"] = "15m";
            weaponUpdate["system.mode2.bonus"] = 0;
            weaponUpdate["system.mode2.d6"] = 0;
            weaponUpdate["system.mode2.d10"] = 0;
            weaponUpdate["system.mode2.traits.pain.value"] = true;
      
          }

          //Migrate Laser Pulser
          if(nameJoin.includes("(lethal)")){

            weaponUpdate["name"] = "Laser Pulser";
            weaponUpdate["img"] = "systems/eclipsephase/resources/icons/95_effect%20Slash%20damage.png";
            weaponUpdate["system.additionalMode"] = true;
            weaponUpdate["system.description"] = "The pulser emits focused beams of light that burn into the target and cause its outer surface to vaporize and expand, creating an explosive effect. The beam is pulsed in order to bite into the target before it is diffused. When fired in stun mode, it shoots a pulse at the target to create a ball of plasma, quickly followed by a second pulse that strikes the plasma and creates a flash-bang shockwave to stun and disorient the target and anyone next to them. Pulsers are vulnerable to atmospheric effects like dust, mist, smoke, or rain, however — the GM should reduce their effective range as appropriate. Laser pulses are invisible, but they can be seen with enhanced vision in atmosphere (or in the visual spectrum in smoky/polluted air) or in the shooter’s entoptics.";
            weaponUpdate["system.mode1.name"] = "Lethal";
            weaponUpdate["system.mode2.name"] = "Stun";
            weaponUpdate["system.mode2.firingMode"] = "ss";
            weaponUpdate["system.mode2.range"] = "100m (AoE 1m)";
            weaponUpdate["system.mode2.bonus"] = 0;
            weaponUpdate["system.mode2.d6"] = 1;
            weaponUpdate["system.mode2.d10"] = 0;
            weaponUpdate["system.mode2.traits.long.value"] = true;
            weaponUpdate["system.mode2.traits.twoHanded.value"] = true;
            weaponUpdate["system.mode1.traits.long.value"] = true;
            weaponUpdate["system.mode1.traits.twoHanded.value"] = true;
            
          }

          //Migrate Pult Gun
          if(nameJoin.includes("pultgun-r")){

            weaponUpdate["name"] = "Pult Gun";
            weaponUpdate["img"] = "systems/eclipsephase/resources/icons/277_skill%20magic%20chain%20lightning.png";
            weaponUpdate["system.additionalMode"] = true;
            weaponUpdate["system.description"] = "Once created out of necessity, the pult gun is one of todays's most advanced and secure weapons. It came to be that scientists of the now Jovian Republic faced the issue of devastating station break downs, due to the usage of common kinetic firearms. While the firearms themselves had multiple safety measures and where only given out to trained personel, the fact of the mostly pre-fall station architecture posed a deathly threat to anyone who missed their tagets in just the wrong angle. The pult gun was the answer to that. It shoots a small nanite-capsule, that shields it's load on it's way to the target. After a given time the capsule breaks and releases the nanintes, that now try to crawl their target and zap it. Though if the payload 'senses' that it's not within it's target's reach, it aborts the attack and brings itself back to the gun it originates from (if possible) to reload the magazine and build a new capsule for another try.";
            weaponUpdate["system.mode1.name"] = "Kill";
            weaponUpdate["system.mode2.name"] = "Zap";
            weaponUpdate["system.mode2.firingMode"] = "sa";
            weaponUpdate["system.mode2.range"] = "40m";
            weaponUpdate["system.mode2.bonus"] = 0;
            weaponUpdate["system.mode2.d6"] = 0;
            weaponUpdate["system.mode2.d10"] = 1;
            weaponUpdate["system.mode2.traits.armorPiercing.value"] = true;
            weaponUpdate["system.mode2.traits.shock.value"] = true;
            
          }

          //Migrate Pult Rifle
          if(nameJoin.includes("pultrifle-r")){

            weaponUpdate["name"] = "Pult Rifle";
            weaponUpdate["img"] = "systems/eclipsephase/resources/icons/277_skill%20magic%20chain%20lightning.png";
            weaponUpdate["system.additionalMode"] = true;
            weaponUpdate["system.description"] = "Similar to the Pult Gun, the Pult Rifle's main purpose is safeguarding it's user from being a deadly threat for a whole station by just being fired. This safetymeasure though lacks the 'punch' when it comes to any combat situation in more than 0g, which is why the Pult Rifle can also shoot traditional kinetic ammunition. Due to it's unique structure it is not capable of shooting anything else than standard amunition, making it always second choice if you're bound to an on-planet-mission. Yet the fact that you 'cannot miss as long as you're in space' is still worth mentioning";
            weaponUpdate["system.mode1.name"] = "Seek";
            weaponUpdate["system.mode2.name"] = "Destroy";
            weaponUpdate["system.mode2.firingMode"] = "saBFfa";
            weaponUpdate["system.mode2.range"] = "100m";
            weaponUpdate["system.mode2.bonus"] = 2;
            weaponUpdate["system.mode2.d6"] = 0;
            weaponUpdate["system.mode2.d10"] = 2;
            weaponUpdate["system.mode2.traits.long.value"] = true;
            weaponUpdate["system.mode2.traits.twoHanded.value"] = true;
            weaponUpdate["system.mode1.traits.long.value"] = true;
            weaponUpdate["system.mode1.traits.twoHanded.value"] = true;
            
          }

          //Migrate Vibroblade
          if(nameJoin.includes("vibroblade")){

            weaponUpdate["name"] = "Vibroblade";
            weaponUpdate["img"] = "systems/eclipsephase/resources/icons/321_weapon%20swords.png";
            weaponUpdate["system.additionalMode"] = true;
            weaponUpdate["system.description"] = "These buzzing electronic blades vibrate at a high frequency for extra cutting ability. This has little extra effect when stabbing or slashing, but can pierce armor when carefully sawing through something.";
            weaponUpdate["system.mode1.name"] = "Slicing";
            weaponUpdate["system.mode2.name"] = "Sawing";
            weaponUpdate["system.mode2.bonus"] = 0;
            weaponUpdate["system.mode2.d6"] = 1;
            weaponUpdate["system.mode2.d10"] = 3;
            weaponUpdate["system.mode2.traits.armorPiercing.value"] = true;
            weaponUpdate["system.mode1.traits.armorPiercing.value"] = true;
            
          }

          //IMPORTANT: The item will only be updated with the first viable object. All appending objects are ignored.
          itemUpdate.push(weaponUpdate);
            actor.updateEmbeddedDocuments("Item", itemUpdate);
          }
        }
      }
    }

    game.settings.set("eclipsephase", "migrationVersion", "0.9.5");
    endMigration = true
    return {endMigration}
  }
}

export function migrationPre098(startMigration, endMigration){

  const latestUpdate = "0.9.8";

  if (startMigration){        
    for (let actor of game.actors){
      for (let item of actor.items){
          const currentVersion = item.system.updated
          let updated = foundry.utils.isNewerVersion(currentVersion, latestUpdate)
          if (item.type === "rangedWeapon" && updated === false){
              let weaponUpdate = []
              let name = item.system.ammoType
              let capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
              weaponUpdate.push({
                  "_id": item._id,
                  "system.updated": latestUpdate,
                  "system.ammoSelected._id": "-",
                  "system.ammoSelected.name": capitalizedName + " (Standard)",
                  "system.ammoSelected.dvModifier": {
                    "d10": null,
                    "d6": null,
                    "bonus": null,
                    "calculated": "ep2e.item.weapon.table.noDamageValueModifier"
                  },
                  "system.ammoSelected.description": "ep2e.item.weapon.table.ammoUsed.standardDescription",
                  "system.ammoSelected.traits": { 
                    "armorPiercing": {
                      "name": "ep2e.item.weapon.table.trait.armorPiercing",
                      "value": false
                    },
                    "blinding": {
                      "name": "ep2e.item.weapon.table.trait.blinding",
                      "value": false
                    },
                    "bioMorphsOnly": {
                      "name": "ep2e.item.weapon.table.trait.bioMorphsOnly",
                      "value": false
                    },
                    "disablesRadio": {
                      "name": "ep2e.item.weapon.table.trait.disablesRadio",
                      "value": false
                    },
                    "dvHalved": {
                      "name": "ep2e.item.weapon.table.trait.dvHalved",
                      "value": false
                    },
                    "dvOnMiss": {
                      "name": "ep2e.item.weapon.table.trait.dvOnMiss",
                      "value": false,
                      "dv": {
                        "d10": null,
                        "d6": null,
                        "bonus": null
                      }
                    },
                    "indirectOrBonus": {
                      "name": "ep2e.item.weapon.table.trait.indirectOrBonus",
                      "value": false,
                      "skillMod": null
                    },
                    "knockdown": {
                      "name": "ep2e.item.weapon.table.trait.knockdown",
                      "value": false,
                      "radius": null
                    },
                    "noDamage": {
                      "name": "ep2e.item.weapon.table.trait.noDamage",
                      "value": false
                    },
                    "pain": {
                      "name": "ep2e.item.weapon.table.trait.pain",
                      "value": false
                    },
                    "steady": {
                      "name": "ep2e.item.weapon.table.trait.steady",
                      "value": false
                    },
                    "stunBiomorphs": {
                      "name": "ep2e.item.weapon.table.trait.stunBiomorphs",
                      "value": false
                    },
                    "shock": {
                      "name": "ep2e.item.weapon.table.trait.shock",
                      "value": false
                    }
                  }
              })
              actor.updateEmbeddedDocuments("Item", weaponUpdate)
          }
      }
    }
    game.settings.set("eclipsephase", "migrationVersion", "0.9.8");
    endMigration = true
    return {endMigration}
  }
}

export function migrationPre0985(startMigration, endMigration){

  const latestUpdate = "0.9.8.5";

  if (startMigration){        
    for(let actors of game.actors){
      actors.update({"system.mods.iniMod" : 0});
    }
    game.settings.set("eclipsephase", "migrationVersion", latestUpdate);
    endMigration = true
    return {endMigration}
  }
}

//Morph Movement Migration into the new integer system
export function migrationPre0992(startMigration, endMigration){

  const latestUpdate = "0.9.9.2";
  if (startMigration){        
    for(let actor of game.actors){
      let update = {}
      if(actor.type === "character"){
        let morphs = "actor.system.bodies"
        for(let morphNumber = 1; morphNumber <= 6; morphNumber++){
          let morphPath = morphs + ".morph" + morphNumber;
          for (let movNumber = 1; movNumber <= 3; movNumber++){
            let morphMovement;
            let movType;
            if(movNumber === 1){
              morphMovement = eval(morphPath + ".movement");
              movType = eval(morphPath + ".movetype");
            }
            else {
              morphMovement = eval(morphPath + ".movement" + movNumber);
              movType = eval(morphPath + ".movetype" + movNumber);
            }
            if(morphMovement){
              let movSpeed = morphMovement;
              let movSplit = movSpeed.split('/');

              let updatePath = "system.bodies.morph" + morphNumber + ".movement" + movNumber
              update[updatePath + ".base"] = movSplit[0];
              update[updatePath + ".full"] = movSplit[1];
              update[updatePath + ".type"] = movType;

            }
            else{
              break;
            }
          }
        }
      }
      else{
        let morphPath = "actor.system.bodies.morph1"
        for (let movNumber = 1; movNumber <= 3; movNumber++){
          let morphMovement;
          let movType;
          if(movNumber === 1){
            morphMovement = eval(morphPath + ".movement");
            movType = eval(morphPath + ".movetype");
          }
          else {
            morphMovement = eval(morphPath + ".movement" + movNumber);
            movType = eval(morphPath + ".movetype" + movNumber);
          }
          if(morphMovement){
            let movSpeed = morphMovement;
            let movSplit = movSpeed.split('/');

            let updatePath = "system.bodies.morph1.movement" + movNumber
          }
          else{
            break;
          }
        }

      }
      actor.update(update)
    }
    game.settings.set("eclipsephase", "migrationVersion", latestUpdate);
    endMigration = true
    return {endMigration}
  }
}

//Morph Movement Migration into the new integer system
export function migrationPre110(startMigration, endMigration){

  const latestUpdate = "1.1.0";
  if (startMigration){        
    for(let actor of game.actors){
      
      let update = {}
      if(actor.type != "character"){
        
        update["system.mods.iniMod"] = parseInt(actor.system.mods.iniMod)
        update["system.threatlevel.current"] = parseInt(actor.system.threatLevel.current)
        update["system.threatlevel.armorTotal"] = parseInt(actor.system.threatLevel.total)

      }

      if(actor.type != "goon")
        update["system.psiStrain.infection"] = parseInt(actor.system.psiStrain.infection)


      update["system.updated"] = latestUpdate

      actor.update(update)
    }
    game.settings.set("eclipsephase", "migrationVersion", latestUpdate);
    endMigration = true
    return {endMigration}
  }
}

export async function migrationPre150(startMigration, endMigration) {
  const latestUpdate = "1.5";
  if (!startMigration) return { endMigration: false };

  // Actor types we touch
  const ACTOR_TYPES = new Set(["character", "npc", "goon"]);

  // Item types to delete (both on actors AND from world Items directory)
  const DELETE_ITEM_TYPES = new Set(["morphTrait", "trait", "flaw", "morphFlaw"]);

  const actors = game.actors.filter(a => ACTOR_TYPES.has(a.type));
  const total = actors.length || 1;

  const uiBar = epCreateProgressDialog(`EP Migration ${latestUpdate}`);
  uiBar.set(0, "Preparing migration…", `0/${total}`);

  let doneCount = 0;

  // Load compendium fallback morph once
  const pack = game.packs.get("eclipsephase.morphs");
  if (!pack) {
    console.error(`[EP Migration ${latestUpdate}] Pack eclipsephase.morphs not found`);
    uiBar.fail("Migration cancelled: morph pack not found");
    return { endMigration: false };
  }

  const baseMorphDoc = await pack.getDocument("eNfxIGfFrEG2zqa9");
  if (!baseMorphDoc) {
    console.error(`[EP Migration ${latestUpdate}] Morph eNfxIGfFrEG2zqa9 not found in pack`);
    uiBar.fail("Migration cancelled: base morph not found");
    return { endMigration: false };
  }

  // -----------------------------
  // 1) Delete world Items (Items tab) of deprecated types
  // -----------------------------
  try {
    const worldDeleteIds = game.items
      .filter((i) => DELETE_ITEM_TYPES.has(i.type))
      .map((i) => i.id);

    if (worldDeleteIds.length) {
      await Item.deleteDocuments(worldDeleteIds);
      console.log(
        `[EP Migration ${latestUpdate}] World Items: deleted ${worldDeleteIds.length} deprecated items`
      );
    } else {
      console.log(`[EP Migration ${latestUpdate}] World Items: nothing to delete`);
    }
  } catch (err) {
    console.error(`[EP Migration ${latestUpdate}] World Items: deletion failed`, err);
  }

  // -----------------------------
  // Actors loop
  // -----------------------------
  for (let i = 0; i < actors.length; i++) {
    if (uiBar.state.cancelled) {
      uiBar.fail(`Migration cancelled (${doneCount}/${total})`);
      return { endMigration: false };
    }

    const actor = actors[i];

    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processing: ${actor.name}`,
      `${doneCount + 1}/${total}`
    );

    await actor.update({ "flags.eclipsephase.migrating": true });

    try {
      // -----------------------------
      // 3) Delete ALL Active Effects on actor
      // -----------------------------
      try {
        const aeIds = actor.effects?.map((e) => e.id) ?? [];
        if (aeIds.length) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", aeIds);
          console.log(
            `[EP Migration ${latestUpdate}] ${actor.name}: deleted ${aeIds.length} actor ActiveEffects`
          );
        }
      } catch (err) {
        console.error(
          `[EP Migration ${latestUpdate}] ${actor.name}: deleting ActiveEffects failed`,
          err
        );
      }

      // -----------------------------
      // 1) Delete deprecated items on actor
      // -----------------------------
      const deleteIds = actor.items
        .filter((i) => DELETE_ITEM_TYPES.has(i.type))
        .map((i) => i.id);

      if (deleteIds.length) {
        await actor.deleteEmbeddedDocuments("Item", deleteIds);
        console.log(
          `[EP Migration ${latestUpdate}] ${actor.name}: deleted ${deleteIds.length} deprecated embedded items`
        );
      }

      // -----------------------------
      // 2) Create Morph items + (for characters) remap boundTo morphX -> new morph item id
      // -----------------------------
      const result = await _ep150_createMorphsFromLegacy(actor, baseMorphDoc);

      console.log(
        `[EP Migration ${latestUpdate}] ${actor.name}: created morphs=${(result?.createdIds ?? []).join(", ")}`
      );
    } catch (err) {
      console.error(`[EP Migration ${latestUpdate}] ${actor.name}: migration failed`, err);
    }

    await actor.update({ "flags.eclipsephase.migrating": false });

    doneCount++;
    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processed: ${actor.name}`,
      `${doneCount}/${total}`
    );

    if (uiBar.state.cancelled) {
      uiBar.fail(`Migration cancelled (${doneCount}/${total})`);
      return { endMigration: false };
    }

    // give the UI a moment to repaint on very heavy loops
    await new Promise(r => setTimeout(r, 0));
  }

  await game.settings.set("eclipsephase", "migrationVersion", latestUpdate);
  uiBar.done(`Migration finished (${doneCount}/${total})`);
  return { endMigration: true };
}

/**
 * Creates morph items based on legacy actor.system.bodies data.
 * Falls back to baseMorphDoc for npc/goon missing morph.
 *
 * Returns:
 *  { createdIds: string[], keyToItemId: Record<string,string> }
 */
async function _ep150_createMorphsFromLegacy(actor, baseMorphDoc) {
  const bodies = actor.system?.bodies ?? {};

  // ---- CHARACTER: morph1..morph6, only if dur != 0
  if (actor.type === "character") {
    const activeKey = bodies.activeMorph; // e.g. "morph2"
    const morphKeys = ["morph1", "morph2", "morph3", "morph4", "morph5", "morph6"];

    const docsToCreate = [];
    const keyToIndex = new Map();

    for (const key of morphKeys) {
      const legacy = bodies[key];
      const dur = Number(legacy?.dur ?? 0);

      // only create if dur is not 0 (and legacy exists)
      if (!legacy || !dur) continue;

      const systemData = _ep150_mapLegacyMorphToItemSystem(legacy);

      keyToIndex.set(key, docsToCreate.length);
      docsToCreate.push({
        name: legacy.name || "Morph",
        type: "morph",
        img:
          legacy.img ||
          systemData.img ||
          "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg",
        system: systemData,
      });
    }

    // If no legacy morphs created, fall back to compendium morph
    if (!docsToCreate.length) {
      const [createdFallback] = await actor.createEmbeddedDocuments("Item", [
        baseMorphDoc.toObject(),
      ]);

      if (createdFallback) {
        await actor.update({ "system.activeMorph": createdFallback.id });
        return { createdIds: [createdFallback.id], keyToItemId: {} };
      }
      return { createdIds: [], keyToItemId: {} };
    }

    const created = await actor.createEmbeddedDocuments("Item", docsToCreate);
    const createdIds = created.map((d) => d.id);

    // Build key -> createdItemId mapping (for boundTo remap)
    const keyToItemId = {};
    for (const [key, idx] of keyToIndex.entries()) {
      keyToItemId[key] = createdIds[idx];
    }

    // set active morph: match old bodies.activeMorph key if possible
    let activeItemId = createdIds[0];
    if (activeKey && keyToItemId[activeKey]) {
      activeItemId = keyToItemId[activeKey];
    }
    await actor.update({ "system.activeMorph": activeItemId });

    // -----------------------------
    // 2) Remap existing items' system.boundTo morphX -> new morph item id
    // -----------------------------
    await _ep150_rebindItemsToNewMorphIds(actor, keyToItemId);

    return { createdIds, keyToItemId };
  }

  // ---- NPC/GOON: bodies.morph1 OR fallback
  if (actor.type === "npc" || actor.type === "goon") {
    const legacy = bodies.morph1;
    const dur = Number(legacy?.dur ?? 0);

    // If no valid morph -> fallback
    if (!legacy || !dur) {
      const [createdFallback] = await actor.createEmbeddedDocuments("Item", [
        baseMorphDoc.toObject(),
      ]);

      if (createdFallback) {
        await actor.update({ "system.activeMorph": createdFallback.id });
        return { createdIds: [createdFallback.id], keyToItemId: {} };
      }
      return { createdIds: [], keyToItemId: {} };
    }

    const systemData = _ep150_mapLegacyMorphToItemSystem(legacy);

    const [createdMorph] = await actor.createEmbeddedDocuments("Item", [
      {
        name: legacy.name || "Morph",
        type: "morph",
        img: legacy.img || "systems/eclipsephase/resources/img/anObjectificationByMichaelSilverRIP.jpg",
        system: systemData,
      },
    ]);

    if (createdMorph) {
      await actor.update({ "system.activeMorph": createdMorph.id });
      return { createdIds: [createdMorph.id], keyToItemId: {} };
    }
    return { createdIds: [], keyToItemId: {} };
  }

  return { createdIds: [], keyToItemId: {} };
}

/**
 * Rebinds items so that any item with system.boundTo === "morph1".."morph6"
 * gets rewritten to system.boundTo === "<created morph item id>".
 *
 * Only touches items that still exist AFTER deletions.
 */
async function _ep150_rebindItemsToNewMorphIds(actor, keyToItemId) {
  if (!keyToItemId || !Object.keys(keyToItemId).length) return;

  const updates = [];

  for (const item of actor.items) {
    const boundTo = item.system?.boundTo;

    // legacy values are strings like "morph1", "morph2", ...
    if (typeof boundTo === "string" && keyToItemId[boundTo]) {
      updates.push({
        _id: item.id,
        "system.boundTo": keyToItemId[boundTo],
      });
    }
  }

  if (!updates.length) return;

  await actor.updateEmbeddedDocuments("Item", updates);
  console.log(
    `[EP Migration 1.5] ${actor.name}: rebound ${updates.length} items from morphX -> new morph item ids`
  );
}

/**
 * Maps the old system.bodies.morphX shape to the new Item(type="morph").system model.
 */
function _ep150_mapLegacyMorphToItemSystem(legacy) {
  const sys = _ep150_emptyMorphItemSystem();

  sys.description = legacy.description ?? "";
  sys.img = legacy.img ?? "";
  sys.type = legacy.type ?? "";
  sys.dur = legacy.dur ?? null;
  sys.insight = legacy.insight ?? null;
  sys.moxie = legacy.moxie ?? null;
  sys.vigor = legacy.vigor ?? null;
  sys.flex = legacy.flex ?? null;

  // movement mapping (legacy movement1 -> move1, movement2 -> move2, movement3 -> move3)
  _ep150_applyMovement(sys, legacy.movement1, "move1", true);
  _ep150_applyMovement(sys, legacy.movement2, "move2", false);
  _ep150_applyMovement(sys, legacy.movement3, "move3", false);

  return sys;
}

function _ep150_applyMovement(sys, legacyMove, key, defaultActive) {
  if (!sys.movement?.[key]) return;

  const hasData =
    legacyMove &&
    (legacyMove.type != null || legacyMove.base != null || legacyMove.full != null);

  sys.movement[key].active = hasData ? true : defaultActive;
  sys.movement[key].type = legacyMove?.type ?? sys.movement[key].type;
  sys.movement[key].base = legacyMove?.base ?? sys.movement[key].base;
  sys.movement[key].full = legacyMove?.full ?? sys.movement[key].full;
}

function _ep150_emptyMorphItemSystem() {
  return {
    description: "",
    img: "",
    customToken: null,
    type: "",
    dur: null,
    insight: null,
    moxie: null,
    vigor: null,
    flex: null,
    movement: {
      move1: { label: "1.", active: true, type: null, base: null, full: null },
      move2: { label: "2.", active: false, type: null, base: null, full: null },
      move3: { label: "3.", active: false, type: null, base: null, full: null },
      move4: { label: "4.", active: false, type: null, base: null, full: null },
      move5: { label: "5.", active: false, type: null, base: null, full: null },
      move6: { label: "6.", active: false, type: null, base: null, full: null },
      move7: { label: "7.", active: false, type: null, base: null, full: null },
      move8: { label: "8.", active: false, type: null, base: null, full: null },
      move9: { label: "9.", active: false, type: null, base: null, full: null },
      move10: { label: "10.", active: false, type: null, base: null, full: null },
    },
    ware: {
      ware1: { label: "1.", value: "" },
      ware2: { label: "2.", value: "" },
      ware3: { label: "3.", value: "" },
      ware4: { label: "4.", value: "" },
      ware5: { label: "5.", value: "" },
      ware6: { label: "6.", value: "" },
      ware7: { label: "7.", value: "" },
      ware8: { label: "8.", value: "" },
      ware9: { label: "9.", value: "" },
      ware10: { label: "10.", value: "" },
    },
    flaws: {
      flaw1: { label: "1.", value: "" },
      flaw2: { label: "2.", value: "" },
      flaw3: { label: "3.", value: "" },
      flaw4: { label: "4.", value: "" },
      flaw5: { label: "5.", value: "" },
      flaw6: { label: "6.", value: "" },
      flaw7: { label: "7.", value: "" },
      flaw8: { label: "8.", value: "" },
      flaw9: { label: "9.", value: "" },
      flaw10: { label: "10.", value: "" },
    },
    traits: {
      trait1: { label: "1.", value: "" },
      trait2: { label: "2.", value: "" },
      trait3: { label: "3.", value: "" },
      trait4: { label: "4.", value: "" },
      trait5: { label: "5.", value: "" },
      trait6: { label: "6.", value: "" },
      trait7: { label: "7.", value: "" },
      trait8: { label: "8.", value: "" },
      trait9: { label: "9.", value: "" },
      trait10: { label: "10.", value: "" },
    },
  };
}

export async function migrationPre170(startMigration, endMigration) {
  const latestUpdate = "1.7";
  if (!startMigration) return { endMigration: false };

  // Actor types we touch
  const ACTOR_TYPES = new Set(["character"]);

  const actors = game.actors.filter(a => ACTOR_TYPES.has(a.type));
  const total = actors.length || 1;

  const uiBar = epCreateProgressDialog(`EP Migration ${latestUpdate}`);
  uiBar.set(0, "Preparing migration…", `0/${total}`);

  let doneCount = 0;

  for (let i = 0; i < actors.length; i++) {
    if (uiBar.state.cancelled) {
      uiBar.fail(`Migration cancelled (${doneCount}/${total})`);
      return { endMigration: false };
    }

    const actor = actors[i];

    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processing: ${actor.name}`,
      `${doneCount + 1}/${total}`
    );

    await actor.update({ "flags.eclipsephase.migrating": true });

    try {
      // IDs only exist on characters
      if (actor.type === "character") {
        const idResult = await _ep170_createIdsFromLegacy(actor);

        if (idResult.createdIds.length) {
          await actor.update({
            "system.activeID": idResult.createdIds[0]
          });
        }

        console.log(
          `[EP Migration ${latestUpdate}] ${actor.name}: created ids=${(idResult?.createdIds ?? []).join(", ")}`
        );

        // Delete legacy ID data after successful migration
        await _ep170_deleteLegacyIdData(actor);

        console.log(
          `[EP Migration ${latestUpdate}] ${actor.name}: deleted legacy ego.ids data`
        );
      }
    } catch (err) {
      console.error(`[EP Migration ${latestUpdate}] ${actor.name}: migration failed`, err);
    }

    await actor.update({
      "flags.eclipsephase.defaultMorphAdded": true,
      "flags.eclipsephase.defaultIdAdded": true,
      "flags.eclipsephase.migrating": false
    });

    doneCount++;

    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processed: ${actor.name}`,
      `${doneCount}/${total}`
    );

    if (uiBar.state.cancelled) {
      uiBar.fail(`Migration cancelled (${doneCount}/${total})`);
      return { endMigration: false };
    }
  }

  await game.settings.set("eclipsephase", "migrationVersion", latestUpdate);
  uiBar.done(`Migration finished (${doneCount}/${total})`);
  return { endMigration: true };
}

/**
 * Migrates legacy actor.system.ego.ids into embedded Items of type "id"
 *
 * Legacy:
 * actor.system.ego.ids.id1 ... id5
 *
 * New:
 * embedded Items of type "id"
 * and actor.system.ego.idSelected rewritten from "id1" etc. to the new embedded item id
 */
async function _ep170_createIdsFromLegacy(actor) {
  const ego = actor.system?.ego ?? {};
  const legacyIds = ego.ids ?? {};
  const selectedLegacyKey = ego.idSelected ?? null;

  const idKeys = ["id1", "id2", "id3", "id4", "id5"];
  const docsToCreate = [];
  const keyToIndex = new Map();

  for (const key of idKeys) {
    const legacyId = legacyIds[key];
    if (!legacyId) continue;

    // Skip completely empty placeholder IDs like "none"
    const rep = legacyId.rep ?? {};
    const hasAnyRepValue = Object.values(rep).some((r) => {
      const v = r?.value;
      return v !== null && v !== undefined && v !== "";
    });

    const hasMeaningfulName =
      legacyId.name &&
      legacyId.name !== "none" &&
      legacyId.name.trim() !== "";

    if (!hasMeaningfulName && !hasAnyRepValue) continue;

    const systemData = _ep170_mapLegacyIdToItemSystem(legacyId);

    keyToIndex.set(key, docsToCreate.length);
    docsToCreate.push({
      name: legacyId.name || "ID",
      type: "id",
      system: systemData
    });
  }

  if (!docsToCreate.length) {
    return { createdIds: [], keyToItemId: {} };
  }

  const created = await actor.createEmbeddedDocuments("Item", docsToCreate);
  const createdIds = created.map((d) => d.id);

  const keyToItemId = {};
  for (const [key, idx] of keyToIndex.entries()) {
    keyToItemId[key] = createdIds[idx];
  }

  // Remap selected ID from legacy key ("id1") to actual embedded item id
  if (selectedLegacyKey && keyToItemId[selectedLegacyKey]) {
    await actor.update({
      "system.ego.idSelected": keyToItemId[selectedLegacyKey]
    });
  } else if (createdIds.length) {
    // fallback: if old selected key no longer exists, pick the first created ID
    await actor.update({
      "system.ego.idSelected": createdIds[0]
    });
  }

  return { createdIds, keyToItemId };
}

/**
 * Deletes the old legacy ID structure after migration
 */
async function _ep170_deleteLegacyIdData(actor) {
  // If your system supports key deletion syntax, this fully removes ego.ids
  await actor.update({
    "system.ego.ids": foundry.data.operators.ForcedDeletion
  });
}

/**
 * Maps one legacy ego.ids.idX object to the new Item(type="id").system structure
 */
function _ep170_mapLegacyIdToItemSystem(legacyId) {
  return {
    tags: [],
    additionalSystems: {},
    description: "",
    active: true,
    displayCategory: "",
    updated: "",
    rep: _ep170_fullIdRep(legacyId.rep ?? {})
  };
}

/**
 * Creates a fully populated rep object and overlays legacy values onto it
 */
function _ep170_fullIdRep(legacyRep = {}) {
  const rep = {
    "@-rep": {
      name: "ep2e.id.repType.@rep",
      value: null,
      small1: false,
      small2: false,
      small3: false,
      med1: false,
      med2: false,
      large: false
    },
    "c-rep": {
      name: "ep2e.id.repType.crep",
      value: null,
      small1: false,
      small2: false,
      small3: false,
      med1: false,
      med2: false,
      large: false
    },
    "f-rep": {
      name: "ep2e.id.repType.frep",
      value: null,
      small1: false,
      small2: false,
      small3: false,
      med1: false,
      med2: false,
      large: false
    },
    "g-rep": {
      name: "ep2e.id.repType.grep",
      value: null,
      small1: false,
      small2: false,
      small3: false,
      med1: false,
      med2: false,
      large: false
    },
    "i-rep": {
      name: "ep2e.id.repType.irep",
      value: null,
      small1: false,
      small2: false,
      small3: false,
      med1: false,
      med2: false,
      large: false
    },
    "r-rep": {
      name: "ep2e.id.repType.rrep",
      value: null,
      small1: false,
      small2: false,
      small3: false,
      med1: false,
      med2: false,
      large: false
    },
    "x-rep": {
      name: "ep2e.id.repType.xrep",
      value: null,
      small1: false,
      small2: false,
      small3: false,
      med1: false,
      med2: false,
      large: false
    }
  };

  for (const [key, value] of Object.entries(legacyRep)) {
    if (!rep[key]) continue;
    rep[key] = {
      ...rep[key],
      ...(value ?? {})
    };
  }

  return rep;
}

//A general item deleter
function itemDeletion(actor, itemID){
  let itemDelete = [itemID]
  actor.deleteEmbeddedDocuments("Item", itemDelete);
}

/**
 * Combined 1.9.6 migration (1.9.5 and 1.9.6 ship together, so their migrations run as one pass):
 *  - Migrates actor.system.ego.languages from a comma-separated string into an array of individual
 *    language strings, for the multi-select pill widget on the Identity tab.
 *  - Replaces stale pre-jamming-update copies of Drone Rig/Drone Affinity with the current compendium
 *    version, so existing characters pick up the jamming behavior.
 *  - Harmonizes the vehicle Item schema with the morph Item schema: flattens the nested "pools" object
 *    into flat vigor/moxie/insight/flex/threat + cur* fields, migrates the old 4-slot {speed,type}
 *    movement into the new 10-slot {label,active,type,base,full} shape, renames the chassis-category
 *    field "type" to "chassisType", removes the dead autoControl/controlType fields, and converts any
 *    vehicle item that was (mis)configured with system.type === "morph" into a real Morph item.
 */
export async function migrationPre196(startMigration, endMigration) {
  const latestUpdate = "1.9.6";
  if (!startMigration) return { endMigration: false };

  const ACTOR_TYPES = new Set(["character", "npc", "goon"]);
  const actors = game.actors.filter(a => ACTOR_TYPES.has(a.type));

  const targets = [];
  for (const actor of game.actors) {
    for (const item of actor.items.filter(i => i.type === "vehicle")) {
      targets.push({ actor, item });
    }
  }
  for (const item of game.items.filter(i => i.type === "vehicle")) {
    targets.push({ actor: null, item });
  }

  const total = actors.length + targets.length || 1;
  const uiBar = epCreateProgressDialog(`EP Migration ${latestUpdate}`);
  uiBar.set(0, "Preparing migration…", `0/${total}`);

  let doneCount = 0;

  // Stale pre-jamming-update copies of these two items (missing their new Active Effect) get
  // replaced with the current compendium version, so existing characters pick up the jamming behavior.
  const JAMMING_ITEMS = [
    { type: "ware", name: "Drone Rig", packId: "eclipsephase.ware", compendiumId: "z3tPlA7ET15FGS3E", effectId: "DrRigJamPenalty1" },
    { type: "traits", name: "Drone Affinity", packId: "eclipsephase.traits", compendiumId: "MHw8AZ7y8yPoAkyQ", effectId: "DroneAffinityNoI" }
  ];

  for (const entry of JAMMING_ITEMS) {
    const pack = game.packs.get(entry.packId);
    const doc = pack ? await pack.getDocument(entry.compendiumId) : null;
    if (!doc) {
      console.error(`[EP Migration ${latestUpdate}] ${entry.name}: not found in ${entry.packId}, skipping replacement`);
      continue;
    }
    entry.sourceData = doc.toObject();
  }

  for (let i = 0; i < actors.length; i++) {
    if (uiBar.state.cancelled) {
      uiBar.fail(`Migration cancelled (${doneCount}/${total})`);
      return { endMigration: false };
    }

    const actor = actors[i];

    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processing: ${actor.name}`,
      `${doneCount + 1}/${total}`
    );

    try {
      const legacyLanguages = actor.system?.ego?.languages;

      // Only actors still on the old string format need converting; skip anyone already migrated.
      if (typeof legacyLanguages === "string") {
        const languageArray = legacyLanguages
          .split(",")
          .map(language => language.trim())
          .filter(language => language.length > 0);

        await actor.update({ "system.ego.languages": languageArray });

        console.log(
          `[EP Migration ${latestUpdate}] ${actor.name}: converted languages "${legacyLanguages}" -> [${languageArray.join(", ")}]`
        );
      }

      for (const entry of JAMMING_ITEMS) {
        if (!entry.sourceData) continue;

        const staleItems = actor.items.filter(item =>
          item.type === entry.type &&
          item.name === entry.name &&
          !item.effects.some(e => e.id === entry.effectId)
        );

        for (const staleItem of staleItems) {
          const replacement = foundry.utils.duplicate(entry.sourceData);
          replacement.sort = staleItem.sort;
          replacement.system.active = staleItem.system.active;
          if (entry.type === "ware") replacement.system.boundTo = staleItem.system.boundTo;

          await actor.deleteEmbeddedDocuments("Item", [staleItem.id]);
          await actor.createEmbeddedDocuments("Item", [replacement]);

          console.log(
            `[EP Migration ${latestUpdate}] ${actor.name}: replaced stale "${entry.name}" with the updated compendium version`
          );
        }
      }
    } catch (err) {
      console.error(`[EP Migration ${latestUpdate}] ${actor.name}: migration failed`, err);
    }

    doneCount++;

    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processed: ${actor.name}`,
      `${doneCount}/${total}`
    );

    if (uiBar.state.cancelled) {
      uiBar.fail(`Migration cancelled (${doneCount}/${total})`);
      return { endMigration: false };
    }
  }

  for (const { actor, item } of targets) {
    if (uiBar.state.cancelled) {
      uiBar.fail(`Migration cancelled (${doneCount}/${total})`);
      return { endMigration: false };
    }

    const ownerLabel = actor ? actor.name : "World Items";

    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processing: ${ownerLabel} - ${item.name}`,
      `${doneCount + 1}/${total}`
    );

    try {
      const sys = item.system;

      if (sys.type === "morph") {
        // This vehicle item was (mis)configured as a "morph" chassis - that option is being removed
        // entirely, since a vehicle-as-morph was never reachable via the jamming UI in the first place.
        // Convert it into a real Morph item instead of deleting it, preserving whatever data it can.
        const newMovement = _ep196_convertMovementSlots(sys.movement, `${ownerLabel}/${item.name}`, latestUpdate);

        const morphData = {
          name: item.name,
          type: "morph",
          img: item.img,
          system: {
            description: sys.description ?? "",
            type: "synth",
            dur: _ep196_numOrNull(sys.dur),
            insight: _ep196_numOrNull(sys.pools?.ins?.max),
            moxie: _ep196_numOrNull(sys.pools?.mox?.max),
            vigor: _ep196_numOrNull(sys.pools?.vig?.max),
            flex: _ep196_numOrNull(sys.pools?.flex?.max),
            movement: newMovement
          }
        };

        if (actor) {
          if (actor.system?.activeJam === item.id) {
            await actor.update({ "system.activeJam": null });
            console.warn(`[EP Migration ${latestUpdate}] ${ownerLabel}: cleared activeJam reference to "${item.name}" before converting it away from the vehicle type.`);
          }
          await actor.deleteEmbeddedDocuments("Item", [item.id]);
          const [created] = await actor.createEmbeddedDocuments("Item", [morphData]);
          console.warn(`[EP Migration ${latestUpdate}] ${ownerLabel}: vehicle item "${item.name}" had system.type === "morph" and was converted into a real Morph item (new id ${created?.id}). Please review it.`);
        } else {
          await item.delete();
          const created = await Item.create(morphData);
          console.warn(`[EP Migration ${latestUpdate}] World Items: vehicle item "${item.name}" had system.type === "morph" and was converted into a real Morph item (new id ${created?.id}). Please review it.`);
        }
      } else {
        const update = { _id: item.id };

        update["system.vigor"] = _ep196_numOrNull(sys.pools?.vig?.max);
        update["system.moxie"] = _ep196_numOrNull(sys.pools?.mox?.max);
        update["system.insight"] = _ep196_numOrNull(sys.pools?.ins?.max);
        update["system.flex"] = _ep196_numOrNull(sys.pools?.flex?.max);
        update["system.threat"] = _ep196_numOrNull(sys.pools?.threat?.max);
        update["system.curVigor"] = _ep196_numOrNull(sys.pools?.vig?.current);
        update["system.curMoxie"] = _ep196_numOrNull(sys.pools?.mox?.current);
        update["system.curInsight"] = _ep196_numOrNull(sys.pools?.ins?.current);
        update["system.curFlex"] = _ep196_numOrNull(sys.pools?.flex?.current);
        update["system.curThreat"] = _ep196_numOrNull(sys.pools?.threat?.current);
        update["system.pools"] = foundry.data.operators.ForcedDeletion;

        update["system.movement"] = _ep196_convertMovementSlots(sys.movement, `${ownerLabel}/${item.name}`, latestUpdate);

        update["system.chassisType"] = sys.type;
        update["system.type"] = foundry.data.operators.ForcedDeletion;

        update["system.autoControl"] = foundry.data.operators.ForcedDeletion;
        update["system.controlType"] = foundry.data.operators.ForcedDeletion;

        if (actor) {
          await actor.updateEmbeddedDocuments("Item", [update]);
        } else {
          await item.update(update);
        }

        console.log(`[EP Migration ${latestUpdate}] ${ownerLabel}: migrated vehicle item "${item.name}" to the new schema (chassisType="${sys.type}")`);
      }
    } catch (err) {
      console.error(`[EP Migration ${latestUpdate}] ${ownerLabel}: migration failed for vehicle item "${item?.name}"`, err);
    }

    doneCount++;
    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processed: ${ownerLabel}`,
      `${doneCount}/${total}`
    );

    if (uiBar.state.cancelled) {
      uiBar.fail(`Migration cancelled (${doneCount}/${total})`);
      return { endMigration: false };
    }
  }

  await game.settings.set("eclipsephase", "migrationVersion", latestUpdate);
  uiBar.done(`Migration finished (${doneCount}/${total})`);
  return { endMigration: true };
}

function _ep196_numOrNull(v) {
  return (v === null || v === undefined || v === "") ? null : Number(v);
}

// Converts an old 4-slot {speed,type} vehicle movement object into the new 10-slot
// {label,active,type,base,full} shape shared with morph items. Also used to build a real
// morph item's movement when converting away from the removed "morph" vehicleType.
function _ep196_convertMovementSlots(oldMovement, contextLabel, latestUpdate) {
  const newMovement = {};
  for (let i = 1; i <= 10; i++) {
    newMovement["move" + i] = { label: `${i}.`, active: i === 1, type: null, base: null, full: null };
  }

  if (!oldMovement) return newMovement;

  let firstMigratedKey = null;
  for (let i = 1; i <= 4; i++) {
    const oldSlot = oldMovement[String(i)];
    if (!oldSlot || !oldSlot.speed) continue;

    const key = "move" + i;
    let type = oldSlot.type || null;
    if (typeof type === "string" && type.startsWith("{{localize")) {
      type = "boat";
    }
    newMovement[key].type = type;

    const parts = String(oldSlot.speed).split("/");
    const base = parts.length === 2 ? parts[0].trim() : "";
    const full = parts.length === 2 ? parts[1].trim() : "";
    if (base !== "" && full !== "" && Number.isFinite(Number(base)) && Number.isFinite(Number(full))) {
      newMovement[key].base = Number(base);
      newMovement[key].full = Number(full);
    } else {
      newMovement[key].base = null;
      newMovement[key].full = null;
      console.warn(`[EP Migration ${latestUpdate}] ${contextLabel}: movement slot ${i} speed "${oldSlot.speed}" could not be parsed as "base/full" - left blank for manual review.`);
    }

    if (!firstMigratedKey) firstMigratedKey = key;
  }

  if (firstMigratedKey) {
    for (const key of Object.keys(newMovement)) newMovement[key].active = false;
    newMovement[firstMigratedKey].active = true;
  }

  return newMovement;
}

/**
 * Repairs an actor's active morph Item when its system.type is blank or otherwise not one of
 * "bio"/"synth"/"info", by recovering the real value from the actor's own pre-1.5 legacy data.
 * Root cause: the 1.5 migration (_ep150_mapLegacyMorphToItemSystem) mapped bodies.morphX.type
 * into the new morph Item, but for npc/goon the value that actually drove the old DR calc lived
 * in a separate field, system.bodyType.value (see EPactor.js as of commit 1d0bbdd1~1) - that
 * field was never consulted, so npc/goon morphs frequently landed on system.type === "". Nothing
 * in this codebase ever deletes system.bodies or system.bodyType after that migration, so this
 * legacy data is still sitting untouched on any actor that predates it - see
 * _ep200_resolveLegacyMorphType for exactly which field is read per actor type. That blank/wrong
 * value poisons eclipsephase.damageRatingMultiplier[type] lookups in
 * EPactor.js#_calculatePhysicalHealth, producing a NaN (or silently incorrect) Death Rating.
 * Idempotent - only the active morph is touched, and only when the recovered legacy value
 * differs from what's currently stored.
 *
 * Also fixes already-placed Aversion trait Items via _ep200_fixCollidingAversionTraits - see
 * that function's doc comment for the unrelated bug it repairs.
 */
export async function migrationPre200(startMigration, endMigration) {
  const latestUpdate = "2.0";
  if (!startMigration) return { endMigration: false };

  const ACTOR_TYPES = new Set(["character", "npc", "goon"]);
  const actors = game.actors.filter(a => ACTOR_TYPES.has(a.type));

  const total = actors.length || 1;
  const uiBar = epCreateProgressDialog(`EP Migration ${latestUpdate}`);
  uiBar.set(0, "Preparing migration…", `0/${total}`);

  let doneCount = 0;

  for (const actor of actors) {
    if (uiBar.state.cancelled) {
      uiBar.fail(`Migration cancelled (${doneCount}/${total})`);
      return { endMigration: false };
    }

    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processing: ${actor.name}`,
      `${doneCount + 1}/${total}`
    );

    try {
      const activeMorphId = actor.system?.activeMorph;
      const activeMorph = activeMorphId ? actor.items.get(activeMorphId) : null;

      if (activeMorph) {
        const legacyType = _ep200_resolveLegacyMorphType(actor);
        const currentType = activeMorph.system?.type;

        if (legacyType && legacyType !== currentType) {
          await actor.updateEmbeddedDocuments("Item", [{ _id: activeMorph.id, "system.type": legacyType }]);
          console.log(`[EP Migration ${latestUpdate}] ${actor.name}: corrected active morph "${activeMorph.name}" type "${currentType || "(blank)"}" -> "${legacyType}" (recovered from legacy data)`);
        } else if (!legacyType && !["bio", "synth", "info"].includes(currentType)) {
          console.warn(`[EP Migration ${latestUpdate}] ${actor.name}: active morph "${activeMorph.name}" has an invalid type "${currentType}" but no legacy data could be recovered to fix it - please check manually`);
        }
      }
    } catch (err) {
      console.error(`[EP Migration ${latestUpdate}] ${actor.name}: migration failed`, err);
    }

    try {
      await _ep200_fixCollidingAversionTraits(actor, latestUpdate);
    } catch (err) {
      console.error(`[EP Migration ${latestUpdate}] ${actor.name}: aversion-trait fix failed`, err);
    }

    try {
      await _ep200_migrateArmorToBoundBodies(actor, latestUpdate);
    } catch (err) {
      console.error(`[EP Migration ${latestUpdate}] ${actor.name}: armor body-binding failed`, err);
    }

    doneCount++;
    uiBar.set(
      Math.floor((doneCount / total) * 100),
      `Processed: ${actor.name}`,
      `${doneCount}/${total}`
    );
  }

  await game.settings.set("eclipsephase", "migrationVersion", latestUpdate);
  uiBar.done(`Migration finished (${doneCount}/${total})`);
  return { endMigration: true };
}

/**
 * Recovers the pre-1.5 legacy body type for whatever is now an actor's active morph, so it can
 * be cross-checked against the migrated Item's system.type. Returns null if nothing valid can be
 * recovered (e.g. the actor postdates the 1.5 migration and never had this legacy data at all).
 *  - npc/goon: the old DR calc read the separate actor.system.bodyType.value field directly;
 *    bodies.morph1.type was never the field that mattered, but is checked as a weaker fallback.
 *  - character: the old DR calc read activeMorph.type, i.e. bodies[bodies.activeMorph].type -
 *    bodies.activeMorph (old, a string key like "morph2") is the exact legacy slot that became
 *    the current Item, per _ep150_createMorphsFromLegacy's activeKey matching.
 */
function _ep200_resolveLegacyMorphType(actor) {
  const VALID_MORPH_TYPES = new Set(["bio", "synth", "info"]);
  const bodies = actor.system?.bodies;
  let legacyType = null;

  if (actor.type === "npc" || actor.type === "goon") {
    legacyType = actor.system?.bodyType?.value ?? bodies?.morph1?.type ?? null;
  } else if (actor.type === "character") {
    const activeKey = bodies?.activeMorph;
    legacyType = activeKey ? (bodies?.[activeKey]?.type ?? null) : null;
  }

  return VALID_MORPH_TYPES.has(legacyType) ? legacyType : null;
}

/**
 * Fixes Aversion trait Items (Biomorph/Synthmorph/Infomorph I-III) already placed on an actor
 * before the source compendium was corrected. The old effect wrote two changes to a shared
 * sleeving.aversion.type/.value pair; with more than one Aversion trait active at once, Foundry's
 * "add" change mode string-concatenates same-key values (e.g. "bioinfosynth"), silently breaking
 * the malus for every Aversion trait on that actor, not just the extra ones. The fix replaces the
 * old effect with one that writes to its own sleeving.aversions.<bodyType> key instead, matching
 * the corrected compendium sources. Delete-and-recreate rather than update(), since ActiveEffect's
 * changes array lives at a different schema path in v13 (top-level) vs v14 (system.changes).
 */
async function _ep200_fixCollidingAversionTraits(actor, latestUpdate) {
  const STALE_KEY = "system.additionalSystems.sleeving.aversion.type";
  const STALE_VALUE_KEY = "system.additionalSystems.sleeving.aversion.value";
  const isV14Plus = !!foundry.data?.ActiveEffectTypeDataModel;

  const staleTraits = actor.items.filter(i =>
    i.type === "traits" &&
    i.effects?.some(e => e.changes?.some(c => c.key === STALE_KEY))
  );

  for (const trait of staleTraits) {
    const staleEffect = trait.effects.find(e => e.changes?.some(c => c.key === STALE_KEY));
    if (!staleEffect) continue;

    const bodyType = staleEffect.changes.find(c => c.key === STALE_KEY)?.value;
    const malus = staleEffect.changes.find(c => c.key === STALE_VALUE_KEY)?.value;
    if (!bodyType || malus === undefined) continue;

    const newChanges = [
      { key: `system.additionalSystems.sleeving.aversions.${bodyType}`, value: malus, priority: null, type: "add" }
    ];

    const newEffectData = {
      name: staleEffect.name,
      icon: staleEffect.icon,
      origin: staleEffect.origin,
      disabled: staleEffect.disabled,
      transfer: staleEffect.transfer,
      changes: newChanges
    };
    if (isV14Plus) newEffectData.system = { changes: newChanges };

    await trait.deleteEmbeddedDocuments("ActiveEffect", [staleEffect.id]);
    await trait.createEmbeddedDocuments("ActiveEffect", [newEffectData]);

    console.log(`[EP Migration ${latestUpdate}] ${actor.name}: fixed colliding Aversion effect on "${trait.name}" -> sleeving.aversions.${bodyType} = ${malus}`);
  }
}

/**
 * Part of the 2.0 armor-becomes-body-bound redesign (see EPactor.js#_calculateArmor and
 * effects.js's Case B for the runtime side, which already treat an item with boundTo unset as
 * legacy/untouched). Pre-2.0, Armor items had no boundTo at all and just sat on the actor
 * globally; this maps every one of them into the (character-only) Stash in one shot, rather than
 * guessing at a body - the Stash exists precisely for "figure out where this goes later", so
 * there's no more "no active Morph to bind to" edge case to skip for characters either. NPCs/
 * Goons have no Stash (see stashArmor/EPactorSheet.js), so they keep the original behavior of
 * binding onto whichever Morph body they have.
 *
 * Notifying the owner: a ChatMessage created here would run on the executing GM's client, and a
 * message's AUTHOR sees their own sent messages regardless of whisper targets - confirmed live,
 * neither excluding the GM from `whisper` nor `blind:true` (which instead visibly masks content
 * as "???" for everyone) nor `author: null` stopped the GM from seeing it. The actual fix: for
 * characters, don't create the message here at all - stash a per-user pending-notice flag instead
 * (module/eclipsephase.js's dedicated "ready" hook, ungated by isGM, self-whispers it on that
 * player's own next login and clears the flag). The GM's client never runs that code, so it never
 * sees these. NPC/Goon armor (bound to a body, not the Stash) keeps the old immediate-whisper
 * behavior - a player owning an NPC/Goon is a rare edge case not worth the same treatment.
 * Skips (with a console warning, no notice sent) an NPC/Goon actor that has unbound Armor but no
 * Morph at all to bind it to - Armor could only ever be created without a boundTo pre-2.0, so
 * this should be vanishingly rare, but is left for a human to check by hand rather than guessing.
 */
async function _ep200_migrateArmorToBoundBodies(actor, latestUpdate) {
  const unboundArmor = actor.items.filter(i => i.type === "armor" && !i.system.boundTo);
  if (unboundArmor.length === 0) return;

  let bucketKey;
  let targetName;
  if (actor.type === "character") {
    bucketKey = "stash";
  } else {
    const anyMorph = actor.items.find(i => i.type === "morph");
    if (!anyMorph) {
      console.warn(`[EP Migration ${latestUpdate}] ${actor.name}: has ${unboundArmor.length} unbound Armor item(s) but no Morph body to bind them to - skipped, please check manually`);
      return;
    }
    bucketKey = "activeMorph";
    targetName = anyMorph.name;
  }

  await actor.updateEmbeddedDocuments("Item", unboundArmor.map(a => ({ _id: a.id, "system.boundTo": bucketKey })));
  console.log(`[EP Migration ${latestUpdate}] ${actor.name}: bound ${unboundArmor.length} Armor item(s) to "${actor.type === "character" ? "Stash" : targetName}"`);

  // GMs own every actor by definition (testUserPermission always passes for them), but don't need
  // a notice about their own migration run - only actual player owners do. If there's no non-GM
  // owner (e.g. a GM-only NPC), there's no one to notify.
  const playerOwners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
  if (playerOwners.length === 0) return;

  if (actor.type === "character") {
    // Deferred, self-whispered notice (see doc comment above) - one flag entry per affected
    // character, consumed and cleared by module/eclipsephase.js's dedicated "ready" hook.
    for (const user of playerOwners) {
      const pending = user.getFlag("eclipsephase", "pendingArmorStashNotices") ?? [];
      pending.push({ actorName: actor.name, count: unboundArmor.length });
      await user.setFlag("eclipsephase", "pendingArmorStashNotices", pending);
    }
    return;
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: playerOwners.map(u => u.id),
    content: game.i18n.format("ep2e.migration.armorBoundNotice", { count: unboundArmor.length, body: targetName })
  });
}

function epCreateProgressDialog(title = "Migration") {
  const state = { cancelled: false };

  const content = `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div class="ep-mig-label">Starting…</div>
      <progress class="ep-mig-progress" value="0" max="100" style="width:100%; height:18px;"></progress>
      <div class="ep-mig-sub" style="opacity:.8; font-size:12px;"></div>
    </div>
  `;

  const dlg = new foundry.applications.api.DialogV2({
    window: { title },
    content,
    buttons: [
      {
        action: "cancel",
        label: "Cancel",
        callback: () => {
          state.cancelled = true;
          return false;
        }
      }
    ],
    position: { width: 420 },
    close: () => {}
  });

  dlg.render({ force: true });

  const getEl = () => dlg.element;

  const set = (pct, label = "", sub = "") => {
    const el = getEl();
    if (!el) return;

    el.querySelector(".ep-mig-progress")?.setAttribute("value", String(pct));

    const lab = el.querySelector(".ep-mig-label");
    if (lab) lab.textContent = label || `${pct}%`;

    const s = el.querySelector(".ep-mig-sub");
    if (s) s.textContent = sub;
  };

  const done = (label = "Done") => {
    set(100, label, "");
    setTimeout(() => dlg.close(), 600);
  };

  const fail = (label = "Cancelled") => {
    set(100, label, "");
    setTimeout(() => dlg.close(), 300);
  };

  return { dlg, set, done, fail, state };
}