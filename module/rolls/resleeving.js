import * as Dice from "../rolls/dice.js"

export async function integrationTest (data, systemOptions) {
    const actorWhole = game.actors.get(data.actorid)
    const actorModel = actorWhole.system
    const dataset = {}
    console.log("This is my data passed from my button press", data)
    console.log("This is the extracted actor", actorWhole)

    dataset.name = "Integrationtest";
    dataset.rolltype = "skill"
    dataset.aptvalue = actorModel.aptitudes.som.value; 
    dataset.apttype = "som" 
    dataset.rollvalue = actorModel.aptitudes.som.roll;

    const rollResult = await Dice.RollCheck(dataset, actorModel, actorWhole, systemOptions, false, false)

    console.log("the rollResult", rollResult.outputData)
}

async function stressTest () {

}

async function result () {

}

async function stressResponse () {

}