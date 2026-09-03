import { eclipsephase } from "../config.js";
import { TaskRollModifier, TaskRoll, TASK_RESULT, TASK_RESULT_TEXT, rollCalc, TASK_RESULT_OUTPUT, PSI_INFLUENCE_OUTPUT, WEAPON_DAMAGE_OUTPUT, rollToChat} from "./dice.js";
import * as pools from "./pools.js";
import { gmList, prepareRecipients } from "../common/general-sheet-functions.js";
import { effectRuleKey } from "../common/general-helper-functions.js";
import { TIER_TRAIT_NAMES } from "../common/sleight-prerequisite.js";

const CHI_PUSH_OUTPUT = "systems/eclipsephase/templates/chat/chi-push.html";

/**
 * The strain family ("psi" or "ki") an actor belongs to. Taken from their sleights, falling back
 * to the family's tier traits for characters who own the discipline but no sleight yet.
 * @param {Actor} actorWhole
 * @returns {string}
 */
export function actorStrainFamily(actorWhole){
    const sleights = actorWhole?.items?.filter(i => i.type === "aspect") ?? [];
    const primary = sleights.find(i => i.system?.psiType === "gamma") ?? sleights.find(i => i.system?.psiType === "chi") ?? sleights[0];
    if (primary?.system?.strainFamily) return primary.system.strainFamily;
    const kiTraits = Object.values(TIER_TRAIT_NAMES.ki);
    const hasKiTrait = actorWhole?.items?.some(i => i.type === "traits" && kiTraits.includes(i.name));
    return hasKiTrait ? "ki" : "psi";
}

/**
 * Formula for the psi-feedback physical damage roll, or null if none applies. A manual push
 * always costs at least 1d6 (doubled on a virus result of 1); a free gamma auto-push only
 * doubles damage that was already going to happen on a virus result of 1, never causing damage
 * by itself.
 * @param {boolean} manualPush - whether the psi check was manually pushed this roll
 * @param {boolean} autoPushed - whether a free Infection-66+ gamma auto-push is active
 * @param {boolean} virusResultIsOne - whether the infection-influence d6 landed on 1
 * @returns {string|null}
 */
export function resolvePhysicalDamageFormula(manualPush, autoPushed, virusResultIsOne){
    if (virusResultIsOne) return (manualPush || autoPushed) ? "2d6" : "1d6";
    if (manualPush) return "1d6";
    return null;
}

/**
 * What each RAW gamma push effect automates, keyed by the same values used in the push-effect
 * dropdowns (general-modifiers.html, pop-up.html's selectAutoPush block). Only "effect" has a
 * mechanical hook today (gamma/epsilon aspect damage, itself only built for a few sleights) -
 * range/power/penetration/duration/target have no automatable system to hook into yet and are
 * intentionally left out rather than stubbed, so any future addition is one new entry here, not
 * a new branch at every consultation site.
 */
export const GAMMA_PUSH_EFFECTS = {
    effect: { damageMultiplier: 2 }
};

/**
 * The damage multiplier from a gamma-boosted (Infection 66+) actor's currently selected free
 * push effect, or 1 if none applies.
 * @param {Actor} actorWhole
 * @returns {number}
 */
export function gammaAutoPushDamageMultiplier(actorWhole){
    const selection = actorWhole.system.additionalSystems?.autoPushSelection;
    return GAMMA_PUSH_EFFECTS[selection]?.damageMultiplier ?? 1;
}

export async function preparePsi(data){
    const dataset = data.currentTarget.dataset;
    const actorWhole = await fromUuid(dataset.actorid)
    const psiOwner = dataset.userid
    const push = dataset.psipush === "false" ? false : dataset.psipush;
    const systemOptions = {"brewStatus" : game.settings.get("eclipsephase", "superBrew")}
    rollPsiEffect(actorWhole, psiOwner, push, systemOptions)
}

const POOL_CHIMOD_KEYS = {
    "system.pools.insight.chiMod": { pool: "insight", total: "totalInsight" },
    "system.pools.moxie.chiMod": { pool: "moxie", total: "totalMoxie" },
    "system.pools.vigor.chiMod": { pool: "vigor", total: "totalVigor" },
    "system.pools.flex.chiMod": { pool: "flex", total: "totalFlex" }
};

/**
 * Moves each pool's current value by the same amount a set of chi-push ActiveEffect changes
 * moved its max, mirroring EPactor.js's _applyChiBoostToPoolValues but scoped to one sleight.
 * @param {Actor} actorWhole
 * @param {Array} changes
 * @param {number} sign - 1 when the boost was just gained, -1 when it was just lost
 */
async function _adjustPoolValuesForChiPush(actorWhole, changes, sign){
    const updates = {};
    for (const change of changes) {
        const mapping = POOL_CHIMOD_KEYS[change.key];
        if (!mapping) continue;
        const pool = actorWhole.system.pools[mapping.pool];
        const delta = eval(change.value) * sign;
        updates[`system.pools.${mapping.pool}.value`] = Math.clamp((pool.value ?? 0) + delta, 0, pool[mapping.total]);
    }
    if (Object.keys(updates).length) await actorWhole.update(updates);
}

/**
 * Duplicates a chi sleight's own ActiveEffect(s) onto itself, flagged as a temporary push boost,
 * moves any boosted pool's current value in step, and marks the item pushed. No-ops entirely if
 * the actor is already Infection-33+ boosted (that already doubles the sleight's bonus globally,
 * so pushing it individually would double-count) or if the item is already pushed.
 * @param {Actor} actorWhole
 * @param {string} itemId
 */
export async function pushChiSleight(actorWhole, itemId){
    const item = actorWhole.items.get(itemId);
    if (!item || item.system.pushed) return;
    if (actorWhole.system.additionalSystems?.psiChiBoosted === true) return;

    const sourceEffect = item.effects.find(e => e.changes?.length);
    if (sourceEffect) {
        const changes = sourceEffect.changes;
        const isV14Plus = !!foundry.data?.ActiveEffectTypeDataModel;
        const newEffectData = {
            name: `${item.name} (${game.i18n.localize("ep2e.item.aspect.pushedBadge")})`,
            icon: sourceEffect.icon,
            origin: sourceEffect.origin,
            disabled: false,
            transfer: true,
            changes,
            flags: { eclipsephase: { chiPushBoost: true } }
        };
        if (isV14Plus) newEffectData.system = { changes };
        await item.createEmbeddedDocuments("ActiveEffect", [newEffectData]);
        await _adjustPoolValuesForChiPush(actorWhole, changes, 1);
    }

    await item.update({ "system.pushed": true });
}

/**
 * Ends a chi sleight's temporary push boost: deletes the duplicated effect (reverting any pool
 * current-value bump it caused) and clears the flag.
 * @param {Actor} actorWhole
 * @param {string} itemId
 */
export async function endChiPush(actorWhole, itemId){
    const item = actorWhole.items.get(itemId);
    if (!item) return;

    const boostEffects = item.effects.filter(e => e.getFlag("eclipsephase", "chiPushBoost"));
    if (boostEffects.length) {
        const changes = boostEffects.flatMap(e => e.changes);
        await item.deleteEmbeddedDocuments("ActiveEffect", boostEffects.map(e => e.id));
        await _adjustPoolValuesForChiPush(actorWhole, changes, -1);
    }

    await item.update({ "system.pushed": false });
}

/**
 * Ends every currently-pushed chi sleight on the actor, e.g. when the actor rests.
 * @param {Actor} actorWhole
 */
export async function endAllChiPushes(actorWhole){
    const pushedItems = actorWhole.items.filter(i => i.type === "aspect" && i.system.psiType === "chi" && i.system.pushed);
    for (const item of pushedItems) {
        await endChiPush(actorWhole, item.id);
    }
}

export async function infectionUpdate(actorWhole, options){

    const raiseInfection = parseInt(options.raiseInfection);
    const actorModel = actorWhole.system;
    let infectionMod = parseInt(actorModel.psiStrain.infection) + parseInt(options.push ? raiseInfection * 2 : raiseInfection)

    if (infectionMod <= 100)
        await actorWhole.update({"system.psiStrain.infection" : infectionMod});

    else if (infectionMod > 100)
        await actorWhole.update({"system.psiStrain.infection" : 100});
    

    return infectionMod
}

/**
 * Executes a chi sleight push end-to-end: charges the flat RAW Infection cost, applies the
 * temporary boost, announces it, then rolls the mandatory Infection Test. No skill check is
 * involved - chi sleights are already-active/passive per RAW, unlike gamma's activation roll.
 * @param {Actor} actorWhole
 * @param {string} itemId
 * @param {string} rollMode - "private" (GM-only, default) or "public"
 */
export async function confirmChiPush(actorWhole, itemId, rollMode){
    const psiOwner = game.user._id;
    const recipientList = prepareRecipients(rollMode);
    const pushedItem = actorWhole.items.get(itemId);
    const actingPerson = game.i18n.format("ep2e.roll.announce.psi.pushingSleight", { name: pushedItem?.name });

    const raisedInfection = Math.min(actorWhole.system.psiStrain.infection + 5, 100);
    await actorWhole.update({ "system.psiStrain.infection": raisedInfection });

    await pushChiSleight(actorWhole, itemId);
    const minutes = Math.floor(actorWhole.system.aptitudes.wil.value / 5);
    const chiPushMessage = game.i18n.format("ep2e.roll.announce.psi.chiPushActive", { minutes });
    await rollToChat(null, { message: chiPushMessage }, CHI_PUSH_OUTPUT, null, actingPerson, recipientList, false);

    const systemOptions = { brewStatus: game.settings.get("eclipsephase", "superBrew") };
    await rollPsiEffect(actorWhole, psiOwner, false, systemOptions, itemId, rollMode);
}

export async function rollPsiEffect(actorWhole, psiOwner, push, systemOptions, chiPushItemId, rollMode){
    //Infection (only relevant for psi checks)
    const actorModel = actorWhole.system;
    let recipientList;
    if (rollMode) {
        recipientList = prepareRecipients(rollMode);
    } else {
        recipientList = gmList();
        if(!recipientList.includes(psiOwner))
            recipientList.push(psiOwner)
    }

    const actingPerson = game.i18n.localize("ep2e.roll.dialog.push.infectionTries");

    let infectionMod = actorModel.psiStrain.infection;
    let physicalDamageRoll = null;
    let durUpdate = actorWhole.system.health.physical.value;
    let woundUpdate = actorWhole.system.physical.wounds;
    let death = actorWhole.system.health.death.max + actorWhole.system.health.physical.max
    let woundThreshold = actorWhole.system.physical.wt
    let mentalUpdate = actorWhole.system.health.mental.value;
    let traumaUpdate = actorWhole.system.mental.trauma;
    let insanityMax = actorWhole.system.health.mental.max + actorWhole.system.health.insanity.max
    let traumaThreshold = actorWhole.system.mental.tt
    let d6 = {}

    //Success check of the virus
    let task = new TaskRoll(game.i18n.localize("ep2e.roll.dialog.push.infectionTakeover"), infectionMod, false)

    await task.performRoll()

    let outputData = task.outputData(false, actorWhole, false, false, false, systemOptions)
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

    

    await rollToChat(null, message, TASK_RESULT_OUTPUT, roll, actingPerson, recipientList, false)


    //Effect in case virus was successful
    if(outputData.resultClass === "success"){
        let virusMod = "";
        if(outputData.result === 3){
            virusMod = "";
        }
        else if(outputData.result === 4){
            virusMod = " + 1"
        }
        else {
            virusMod = " + 2"
        }

        let rollFormula = "1d6"

        d6 = await new Roll(rollFormula+virusMod).evaluate();

        let message = {};
        let result = d6.total > 6 ? 6 : d6.total;
        let psiLabel = "";
        let psiCopy = "";

        const strainFamily = actorStrainFamily(actorWhole);

        if(strainFamily === "ki"){
            const archetypeData = actorModel.subStrain.byArchetype[actorModel.subStrain.label];
            const influenceRow = eclipsephase.kiInfluence[actorModel.subStrain.label]?.[result];
            if(result === 1){
                message.influenceLabel = "ep2e.ki.effect.cognitiveFeedback";
                message.influenceCopy = "ep2e.ki.effect.takeStrain";
            }
            else if(influenceRow){
                const choice = archetypeData?.["influence" + result]?.description;
                message.influenceLabel = influenceRow.label;
                if(influenceRow.base) message.influenceCopy = choice && choice !== "none" ? influenceRow.base + "." + choice : "";
                else message.influenceCopy = influenceRow.copy;
            }
        }
        else if(actorModel.subStrain.label != "custom"){
            const archetypeData = actorModel.subStrain.byArchetype[actorModel.subStrain.label];
            if(result === 1){
                message.influenceLabel = "ep2e.psi.effect.physicalDamage";
                message.influenceCopy = "ep2e.psi.effect.takeDamage";
            }
            else if (result > 1 && result <=3) {
                psiLabel = archetypeData["influence" + result].label;
                psiCopy = archetypeData["influence" + result].description;
                if(psiLabel === "restrictedBehaviour" && actorModel.subStrain.label === "architect"){
                    message.influenceLabel = eclipsephase.psiStrainLabels[psiLabel];
                    message.influenceCopy = "ep2e.psi.effect.restrictedBehaviour.relaxation";
                }
                else if(psiLabel === "restrictedBehaviour" && actorModel.subStrain.label === "haunter"){
                    message.influenceLabel = eclipsephase.psiStrainLabels[psiLabel];
                    message.influenceCopy = "ep2e.psi.effect.restrictedBehaviour.empathy";
                }
                else if(actorModel.subStrain.label === "xenomorph"){
                    message.influenceLabel = eclipsephase.psiStrainLabels.enhancedBehaviour;
                    message.influenceCopy = "ep2e.psi.effect.enhancedBehaviour." + psiCopy;
                }
                else {
                    message.influenceLabel = eclipsephase.psiStrainLabels[psiLabel];
                    message.influenceCopy = "ep2e.psi.effect." + psiLabel + "." + psiCopy;
                }
            }
            else if (result > 3 && actorModel.subStrain.label != "beast" && actorModel.subStrain.label != "haunter") {
                psiCopy = archetypeData["influence" + result].description;
                message.influenceLabel = "ep2e.psi.effect.motivation.label";
                message.influenceCopy = "ep2e.psi.effect.motivation." + psiCopy;
            }
            else if (result > 3 && result <=5){
                psiCopy = archetypeData["influence" + result].description;
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
            const customInfluence = actorModel.strainInfluence["influence" + result];
            message.influenceLabel = eclipsephase.otherPsiLabels[customInfluence.label];
            message.influenceCopy = customInfluence.description;
        }

        if(strainFamily === "ki" || actorModel.subStrain.label != "custom") message.influenceRule = effectRuleKey(message.influenceCopy);

        let actingPerson = game.i18n.localize("ep2e.roll.dialog.push.infectionInfluence");
    
        await rollToChat(null, message, PSI_INFLUENCE_OUTPUT, d6, actingPerson, recipientList, false)

    }
    
    const manualPush = chiPushItemId ? false : !!push;
    const autoPushed = chiPushItemId ? false : gammaAutoPushDamageMultiplier(actorWhole) > 1;
    physicalDamageRoll = resolvePhysicalDamageFormula(manualPush, autoPushed, d6.total === 1);

    if (physicalDamageRoll && actorWhole.type === "character"){

        const physicalDamage = await new Roll(physicalDamageRoll).evaluate();
        const actingPerson = game.i18n.localize("ep2e.roll.dialog.push.infectionDamage");
        const isKi = actorStrainFamily(actorWhole) === "ki";

        let message = {
            "psiDamageValue": physicalDamage.total,
            "type": "defaultDamage",
            "rollTitle": "ep2e.roll.announce.damageDone",
            "copy": manualPush ? "ep2e.roll.announce.psi.pushedSleightFeedback" : (isKi ? "ep2e.ki.effect.takeStrain" : "ep2e.psi.effect.takeDamage")
        }

        await rollToChat(null, message, WEAPON_DAMAGE_OUTPUT, physicalDamage, actingPerson, recipientList, false, "rollOutput")

        if (isKi) {
            mentalUpdate += physicalDamage.total;

            if (physicalDamage.total >= traumaThreshold){
                traumaUpdate += Math.floor(physicalDamage.total/traumaThreshold);
            }

            if (mentalUpdate > insanityMax){
                mentalUpdate = insanityMax
            }

            actorWhole.update({"system.health.mental.value" : mentalUpdate, "system.mental.trauma" : traumaUpdate})
        } else {
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