export function traitAndAccessoryFinder(itemModel){
  
    let mode1TraitCounter = 0;
    let mode2TraitCounter = 0;
    let accessoryCounter = 0;
    let iterableArray1 = Object.entries(itemModel.mode1.traits)
    let iterableArray2 = Object.entries(itemModel.mode2.traits)
    let iterableAccessories = Object.entries(itemModel.accessories)
    
    for (let trait of iterableArray1){
      if(trait[1].value === true){
        mode1TraitCounter++
        break;
      }
    }
    for (let trait of iterableArray2){
      if(trait[1].value === true){
        mode2TraitCounter++
        break;
      }
    }
    for (let accessory of iterableAccessories){
      if(accessory[1].value === true){
        accessoryCounter++
        break;
      }
    }
    
    return {mode1TraitCounter, mode2TraitCounter, accessoryCounter}
  }