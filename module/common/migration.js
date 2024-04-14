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

  async function weaponCategorization(actorsInQuestion){
    let resetButton = game.i18n.localize('ep2e.actorSheet.button.confirm');
    let dialogType = "weaponCategorization";
    let title = game.i18n.localize('ep2e.actorSheet.dialogHeadline.confirmationNeeded');
    const template = "systems/eclipsephase/templates/chat/list-dialog.html";
    const html = await renderTemplate(template, {actorsInQuestion, dialogType});

    
    return new Promise(resolve => {
        const data = {
            title: title,
            content: html,
            buttons: {
              normal: {
                  label: resetButton,
                  callback: html => resolve(_proWeaponCategorization(html[0].querySelector("form")))
              }
            },
            default: "normal",
            close: () => resolve ({cancelled: true})
        };
        let options = {width:791}
        new Dialog(data, options).render(true);
    });
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
        
        let oldIniMod = parseInt(actor.system.mods.iniMod)
        let oldThreatCurrent = parseInt(actor.system.threatLevel.current)
        let oldThreatMax = parseInt(actor.system.threatLevel.total)

        update["system.mods.iniMod"] = oldIniMod
        update["system.threatlevel.current"] = oldThreatCurrent
        update["system.threatlevel.armorTotal"] = oldThreatMax

      }
      actor.update(update)
    }
    game.settings.set("eclipsephase", "migrationVersion", latestUpdate);
    endMigration = true
    return {endMigration}
  }
}

//A general item deleter
function itemDeletion(actor, itemID){
  let itemDelete = [itemID]
  actor.deleteEmbeddedDocuments("Item", itemDelete);
}