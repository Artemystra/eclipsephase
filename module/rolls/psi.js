import { eclipsephase } from "../config.js";
import { TaskRollModifier, TaskRoll, TASK_RESULT, TASK_RESULT_TEXT, rollCalc, TASK_RESULT_OUTPUT, PSI_INFLUENCE_OUTPUT, WEAPON_DAMAGE_OUTPUT, rollToChat} from "./dice.js";
import * as pools from "./pools.js";
import { gmList } from "../common/common-sheet-functions.js";

export function preparePsi(data){

    const dataset = data.currentTarget.dataset;
    const actorWhole = game.actors.get(dataset.actorid);
    const psiOwner = dataset.userid
    const push = dataset.psipush === "false" ? false : dataset.psipush;
    rollPsiEffect(actorWhole, psiOwner, push)
}

export async function infectionUpdate(actorWhole, options){

    const raiseInfection = parseInt(options.raiseInfection);
    const actorModel = actorWhole.system;
    let infectionMod = actorModel.psiStrain.infection + (options.push ? raiseInfection * 2 : raiseInfection)

    if (infectionMod <= 100)
        actorWhole.update({"system.psiStrain.infection" : infectionMod});

    else if (infectionMod > 100)
        actorWhole.update({"system.psiStrain.infection" : 100});
    

    return infectionMod
}

export async function rollPsiEffect(actorWhole, psiOwner, push){
    //Infection (only relevant for psi checks)

    const actorModel = actorWhole.system;
    const recipientList = gmList();
    if(!recipientList.includes(psiOwner))
        recipientList.push(psiOwner)

    const actingPerson = game.i18n.localize("ep2e.roll.dialog.push.infectionTries");

    let infectionMod = actorModel.psiStrain.infection;
    let physicalDamageRoll = null;
    let durUpdate = actorWhole.system.health.physical.value;
    let woundUpdate = actorWhole.system.physical.wounds;
    let death = actorWhole.system.health.death.max + actorWhole.system.health.physical.max
    let woundThreshold = actorWhole.system.physical.wt
    let d6 = {}

    //Success check of the virus
    let task = new TaskRoll(game.i18n.localize("ep2e.roll.dialog.push.infectionTakeover"), infectionMod, false)

    await task.performRoll()

    let outputData = task.outputData(false, actorWhole, false, false, false)
    outputData.result = rollCalc(outputData.rollResult, outputData.targetNumber)
    let roll = await task.roll

    let message = {
        "resultText": outputData.resultText,
        "result": outputData.result,
        "resultClass": outputData.resultClass === "success" ? "fail" : "success",
        "resultLabel": outputData.resultLabel,
        "resultText": outputData.resultText,
        "targetNumber": outputData.targetNumber,
        "taskName": outputData.taskName,
    }

    

    await rollToChat(message, TASK_RESULT_OUTPUT, roll, actingPerson, recipientList, false)


    //Effect in case virus was successful
    if(outputData.resultClass === "success"){
        let virusMod = "";
        if(outputData.result === 5 || outputData.result === 7 || outputData.result === 9){
            virusMod = "";
        }
        else if(outputData.result === 4){
            virusMod = " + 1"
        }
        else {
            virusMod = " + 2"
        }

        let rollFormula = "1d6"

        d6 = await new Roll(rollFormula+virusMod).evaluate({async: true});

        let message = {};
        let result = d6.total > 6 ? 6 : d6.total;
        let psiLabel = "";
        let psiCopy = "";

        if(actorModel.subStrain.label != "custom"){
            if(result === 1){
                message.influenceLabel = "ep2e.psi.effect.physicalDamage";
                message.influenceCopy = "ep2e.psi.effect.takeDamage";
            }
            else if (result > 1 && result <=3) {   
                psiLabel = eval("actorModel.subStrain.influence" + result + ".label");
                psiCopy = eval("actorModel.subStrain.influence" + result + ".description");
                if(psiLabel === "restrictedBehaviour" && actorModel.subStrain.label === "architect"){
                    message.influenceLabel = eval("eclipsephase.psiStrainLabels." + psiLabel);
                    message.influenceCopy = "ep2e.psi.effect.restrictedBehaviour.relaxation";
                }
                else if(psiLabel === "restrictedBehaviour" && actorModel.subStrain.label === "haunter"){
                    message.influenceLabel = eval("eclipsephase.psiStrainLabels." + psiLabel);
                    message.influenceCopy = "ep2e.psi.effect.restrictedBehaviour.empathy";
                }
                else if(actorModel.subStrain.label === "xenomorph"){
                    message.influenceLabel = eval("eclipsephase.psiStrainLabels.enhancedBehaviour");
                    message.influenceCopy = "ep2e.psi.effect." + psiLabel + "." + psiCopy; 
                }
                else {
                    message.influenceLabel = eval("eclipsephase.psiStrainLabels." + psiLabel);
                    message.influenceCopy = "ep2e.psi.effect." + psiLabel + "." + psiCopy; 
                }
            }
            else if (result > 3 && actorModel.subStrain.label != "beast" && actorModel.subStrain.label != "haunter") {
                psiCopy = eval("actorModel.subStrain.influence" + result + ".description");
                message.influenceLabel = "ep2e.psi.effect.motivation.label";
                message.influenceCopy = "ep2e.psi.effect.motivation." + psiCopy;
            }
            else if (result > 3 && result <=5){
                psiCopy = eval("actorModel.subStrain.influence" + result + ".description");
                message.influenceLabel = "ep2e.psi.effect.motivation.label";
                message.influenceCopy = "ep2e.psi.effect.motivation." + psiCopy;
            }
            else if (result === 6 && actorModel.subStrain.label === "beast"){
                message.influenceCopy = "ep2e.psi.effect.frenzy"
            }
            else if (result === 6 && actorModel.subStrain.label === "haunter"){
                message.influenceCopy = "ep2e.psi.effect.hallucination"
            }
        }
        else{   
            message.influenceLabel = eclipsephase.psiCustomLabels + "." + actorModel.strainInfluence.influence + result + ".label";
            message.influenceCopy = actorModel.strainInfluence.influence + result + ".description";
        }

        let actingPerson = game.i18n.localize("ep2e.roll.dialog.push.infectionInfluence");        
    
        await rollToChat(message, PSI_INFLUENCE_OUTPUT, d6, actingPerson, recipientList, false)

    }
    
    if (push && d6.total === 1){
        physicalDamageRoll += "2d6";
    }
    else if (d6.total === 1 || push){
        physicalDamageRoll = "1d6";
    }

    if (physicalDamageRoll && actorWhole.type === "character"){
        
        const physicalDamage = await new Roll(physicalDamageRoll).evaluate({async: true});
        const actingPerson = game.i18n.localize("ep2e.roll.dialog.push.infectionDamage");

        let message = {
            "psiDamageValue": physicalDamage.total,
            "type": "psiDamage"
        }

        await rollToChat(message, WEAPON_DAMAGE_OUTPUT, physicalDamage, actingPerson, recipientList, false)

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