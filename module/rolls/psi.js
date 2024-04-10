
import { TaskRollModifier, TaskRoll, rollCalc, TASK_RESULT, TASK_RESULT_TEXT } from "./dice.js";
import * as pools from "./pools.js";

export async function infectionUpdate(actorWhole, options, pool){

    const infectionRaise = parseInt(options.aspectNumber);
    const actorModel = actorWhole.system;

    if(options.ignoreInfection)
        options["ignoreInfection"] = await pools.update(options, pool, null, actorWhole)
    console.log("options: ", options)
    if(!options.ignoreInfection){
        let infectionMod = options.push ? infectionRaise * 2 : infectionRaise;
        infectionMod += parseInt(actorModel.psiStrain.infection)
        if (infectionMod <= 100){
            actorWhole.update({"system.psiStrain.infection" : infectionMod});
        }
        else if (infectionMod > 100){
            actorWhole.update({"system.psiStrain.infection" : 100});
        }
    }
}

export async function rollPsiEffect(actorWhole){
    //Infection (only relevant for psi checks)
    if (skillKey === "psi" && !ignoreInfection && actorWhole.type != "goon"){

        let physicalDamageRoll = null;
        let durUpdate = actorWhole.system.health.physical.value;
        let woundUpdate = actorWhole.system.physical.wounds;
        let death = actorWhole.system.health.death.max + actorWhole.system.health.physical.max
        let woundThreshold = actorWhole.system.physical.wt
        let d6 = {total: null};

        //Success check of the virus
        let infectionRoll = await new Roll(rollFormula).evaluate({async: true});
        let rollCheck = infectionRoll.total;

        let rollResult = await successCheck(rollCheck, infectionMod)

        success = rollResult["success"]
        critical = rollResult["critical"]
        autoSuccess = rollResult["autoSuccess"]
        autoFail = rollResult["autoFail"]
        doubleSuperior = rollResult["doubleSuperior"]
        superior = rollResult["superior"]

        //Success messages
        let successContent = await successTranslation(success,critical,autoSuccess,autoFail,doubleSuperior,superior)

        successMessage = successContent["successMessage"];
        successClass = successContent["successClass"];
        successName = successContent["successName"];
        successType = successContent["successType"];

        if (successClass === "fail"){
            successClass = "success"
        }
        else {
            successClass = "fail"
        }

        let message = {}
        
        message.resultText = successMessage;
        message.resultClass = successClass;
    
        message.targetNumber = infectionMod;

        message.visibility = activeRollTarget;

        let html = await renderTemplate(TASK_RESULT_OUTPUT, message)
        let alias = game.i18n.localize("ep2e.roll.dialog.push.infectionTries");


        //Viruses Skill check printed to the chat
        msg = await infectionRoll.toMessage({
            speaker: ChatMessage.getSpeaker({alias: alias}),
            flavor: html
        },{
            rollMode: rollModeSelection
        });

        if (game.dice3d){
            await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
        }

        //Effect in case virus was successful
        if(success || autoSuccess){
            let virusMod = "";
            if(success && !superior && !doubleSuperior && !critical && !autoSuccess){
                virusMod = "";
            }
            else if(success && superior && !doubleSuperior && !critical && !autoSuccess){
                virusMod = " + 1"
            }
            else {
                virusMod = " + 2"
            }

            rollFormula = "1d6"

            d6 = await new Roll(rollFormula+virusMod).evaluate({async: true});

            let message = {};
            let result = d6.total > 6 ? 6 : d6.total;
            let psiLabel = "";
            let psiCopy = "";

            if(actorData.subStrain.label != "custom"){
                if(result === 1){
                    message.influenceLabel = "ep2e.psi.effect.physicalDamage";
                    message.influenceCopy = "ep2e.psi.effect.takeDamage";
                }
                else if (result > 1 && result <=3) {   
                    psiLabel = eval("actorData.subStrain.influence" + result + ".label");
                    psiCopy = eval("actorData.subStrain.influence" + result + ".description");
                    if(psiLabel === "restrictedBehaviour" && actorData.subStrain.label === "architect"){
                        message.influenceLabel = eval("eclipsephase.psiStrainLabels." + psiLabel);
                        message.influenceCopy = "ep2e.psi.effect.restrictedBehaviour.relaxation";
                    }
                    else if(psiLabel === "restrictedBehaviour" && actorData.subStrain.label === "haunter"){
                        message.influenceLabel = eval("eclipsephase.psiStrainLabels." + psiLabel);
                        message.influenceCopy = "ep2e.psi.effect.restrictedBehaviour.empathy";
                    }
                    else if(actorData.subStrain.label === "xenomorph"){
                        message.influenceLabel = eval("eclipsephase.psiStrainLabels.enhancedBehaviour");
                        message.influenceCopy = "ep2e.psi.effect." + psiLabel + "." + psiCopy; 
                    }
                    else {
                        message.influenceLabel = eval("eclipsephase.psiStrainLabels." + psiLabel);
                        message.influenceCopy = "ep2e.psi.effect." + psiLabel + "." + psiCopy; 
                    }
                }
                else if (result > 3 && actorData.subStrain.label != "beast" && actorData.subStrain.label != "haunter") {
                    psiCopy = eval("actorData.subStrain.influence" + result + ".description");
                    message.influenceLabel = "ep2e.psi.effect.motivation.label";
                    message.influenceCopy = "ep2e.psi.effect.motivation." + psiCopy;
                }
                else if (result > 3 && result <=5){
                    psiCopy = eval("actorData.subStrain.influence" + result + ".description");
                    message.influenceLabel = "ep2e.psi.effect.motivation.label";
                    message.influenceCopy = "ep2e.psi.effect.motivation." + psiCopy;
                }
                else if (result === 6 && actorData.subStrain.label === "beast"){
                    message.influenceCopy = "ep2e.psi.effect.frenzy"
                }
                else if (result === 6 && actorData.subStrain.label === "haunter"){
                    message.influenceCopy = "ep2e.psi.effect.hallucination"
                }
            }
            else{   
                message.influenceLabel = eclipsephase.psiCustomLabels + "." + actorData.strainInfluence.influence + result + ".label";
                message.influenceCopy = actorData.strainInfluence.influence + result + ".description";
            }

            let html = await renderTemplate(PSI_INFLUENCE_OUTPUT, message)
            let alias = game.i18n.localize("ep2e.roll.dialog.push.infectionInfluence");

            msg = await d6.toMessage({
                speaker: ChatMessage.getSpeaker({alias: alias}),
                flavor: html
            },{
                rollMode: rollModeSelection
            });

            if (game.dice3d){
                await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
            }
        }
        
        if (aspectPushed != "none" && d6.total === 1){
            physicalDamageRoll += "2d6";
        }
        else if (d6.total === 1 || aspectPushed != "none"){
            physicalDamageRoll = "1d6";
        }

        if (physicalDamageRoll && actorWhole.type === "character"){
            
            let physicalDamage = await new Roll(physicalDamageRoll).evaluate({async: true});
            let alias = game.i18n.localize("ep2e.roll.dialog.push.infectionDamage");

            msg = await physicalDamage.toMessage({
                speaker: ChatMessage.getSpeaker({alias: alias})
            },{
                rollMode: rollModeSelection
            });

            if (game.dice3d){
                await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
            }

            durUpdate += physicalDamage.total;

            if (physicalDamage.total >= woundThreshold){
                woundUpdate += Math.floor(physicalDamage.total/woundThreshold);
            }

            if (durUpdate > death){
                durUpdate = death
            }

            actorWhole.update({"system.health.physical.value" : durUpdate, "system.physical.wounds" : woundUpdate})
        }
    }
}