 //If test succeeded
 if(successType){
    switch (successName) {
        case 'Greater Success':
            successModifier = "+ 1d6";
            potentialRaise = true;
            break;
        case 'greatSuc' :
            successModifier = "+ 1d6";
            potentialRaise = true;
            break;
        case 'Superior Success':
            successModifier = "+ 2d6";
            break;
        case 'supSuc':
            successModifier = "+ 2d6";
            break;
        case 'Critical Success':
            criticalModifier = "2 * (";
            successModifier = ")";
            potentialRaise = true;
            break;
        case 'Greater Critical Success':
            criticalModifier = "2 * (";
            successModifier = "+ 1d6)";
            potentialRaise = true;
            break;
        case 'Superior Critical Success':
            criticalModifier = "2 * (";
            successModifier = "+ 2d6)";
            break;
        case 'Supreme Success':
            criticalModifier = "2 * (";
            successModifier = "+ 2d6)";
            break;
        default:
            successModifier = "";
            potentialRaise = true;
            break;
    }

    //Weapon damage dialog
    if (weaponType === "ranged" && swapPossible || weaponType === "ranged" && potentialRaise || weaponType === "melee" && swapPossible || weaponType === "melee" && potentialRaise){
        let checkOptions = await GetDamageOptions(weaponName, weaponDamage, modeDamage, successModifier, criticalModifier, successMessage, swipSwap, swapPossible, potentialRaise, poolValue, actorType, poolType, flexValue, weaponTraits.automatedEffects, meleeDamageMod, biomorphTarget);

        if (checkOptions.cancelled) {
            return;
        }
        usedRaise = checkOptions.raise;
        usedSwipSwap = checkOptions.swap;
        usedFlexRaise = checkOptions.flexRaise;
    }
}

let poolRAM = poolType;
if (usedSwipSwap === "pool" || usedSwipSwap === "flex") {
    if (swipSwap > 33 && swipSwap < 66){
        successModifier = "+ 1d6";
        successName = "Greater Success";
        successMessage = await successLabel("greatSuc");
    }
    if (swipSwap > 66){
        successModifier = "+ 2d6";
        successName = "Superior Success"
        successMessage = await successLabel("supSuc");
    }
    poolValue--;
    poolUpdate = poolValue;
    
    if (usedSwipSwap === "flex"){
        poolType = "Flex";
        poolValue++;
        flexValue--;
        poolUpdate = flexValue;
    }

    message = {}

    message.resultText = successMessage;
    
    message.type = "usedSwipSwap";
    message.poolName = await poolName(poolType);
    message.swipSwap = swipSwap;

    html = await renderTemplate(POOL_USAGE_OUTPUT, message)

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: this.actor}),
        flavor: html
    })

    poolUpdater(poolUpdate, poolType)
}

poolType = poolRAM;

if (rollModeSelection === "gmroll"){

    if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success" || usedFlexRaise && flexValue && successName != "Superior Success" && successName != "Superior Critical Success"){
        successModifier += "+ 1d6";
        switch (successName) {
            case 'Success':
                successName = "Greater Success";
                successMessage = await successLabel("greatSuc");
                break;
            case 'Greater Success':
                successName = "Superior Success";
                successMessage = await successLabel("supSuc");
                break;
            case 'Critical Success':
                successName = "Greater Critical Success";
                successMessage = await successLabel("greatCritSuc");
                successModifier = "+ 1d6)";
                break;
            case 'Greater Critical Success':
                successName = "Superior Critical Success";
                successMessage = await successLabel("supCritSuc");
                successModifier = "+ 2d6)";
                break;
            default:
                break;
        }

      poolType = poolRAM;

      poolUpdate = usedRaise ? poolValue-1 : flexValue-1;
      let poolUsed = usedRaise ? poolType : "Flex";

      message = {}

      message.resultText = successMessage;
      
      message.type = "usedRaise";
      message.poolName = await poolName(poolType);

      html = await renderTemplate(POOL_USAGE_OUTPUT, message)

      ChatMessage.create({
          content: html,
          whisper: ChatMessage.getWhisperRecipients("GM")
      });

      poolUpdater(poolUpdate, poolUsed)
  }

  else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){

    message = {}
    
    message.type = "beyondSuperior";
    message.poolName = await poolName(poolType);

    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    
      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          content: html,
          whisper: [game.user._id]
      })
  }

  else if (usedRaise && !poolValue){

    message = {}
    
    message.type = "cantRaise";
    message.poolName = await poolName(poolType);

    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    
      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          content: html,
          whisper: [game.user._id]
      })
  }
}
else {
  if(usedRaise && poolValue && successName != "Superior Success" && successName != "Superior Critical Success" || usedFlexRaise && flexValue && successName != "Superior Success" && successName != "Superior Critical Success"){
    successModifier += "+ 1d6";
    switch (successName) {
        case 'Success':
            successName = "Greater Success";
            successMessage = await successLabel("greatSuc");
            break;
        case 'Greater Success':
            successName = "Superior Success";
            successMessage = await successLabel("supSuc");
            break;
        case 'Critical Success':
            successName = "Greater Critical Success";
            successMessage = await successLabel("greatCritSuc");
            successModifier = "+ 1d6)";
            break;
        case 'Greater Critical Success':
            successName = "Superior Critical Success";
            successMessage = await successLabel("supCritSuc");
            successModifier = "+ 2d6)";
            break;
        default:
            break;
    }

      poolType = poolRAM;
      
      poolUpdate = usedRaise ? poolValue-1 : flexValue-1;
      let poolUsed = usedRaise ? poolType : "Flex";

      message = {}

      message.resultText = successMessage;
      
      message.type = "usedRaise";
      message.poolName = await poolName(poolType);

      html = await renderTemplate(POOL_USAGE_OUTPUT, message)

      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          flavor: html
      })

      poolUpdater(poolUpdate, poolUsed)
  }

  else if (usedRaise && successName === "Superior Success" || usedRaise && successName === "Superior Critical Success"){

    message = {}
    
    message.type = "beyondSuperior";
    message.poolName = await poolName(poolType);

    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    
      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          content: html,
          whisper: [game.user._id]
      })
  }

  else if (usedRaise && !poolValue){

    message = {}
    
    message.type = "cantRaise";
    message.poolName = await poolName(poolType);

    html = await renderTemplate(POOL_USAGE_OUTPUT, message)
    
      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this.actor}),
          content: html,
          whisper: [game.user._id]
      })
  }
}