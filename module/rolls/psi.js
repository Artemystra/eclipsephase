import { eclipsephase } from "../config.js";
import { TaskRollModifier, TaskRoll, TASK_RESULT, TASK_RESULT_TEXT, rollCalc, TASK_RESULT_OUTPUT, PSI_INFLUENCE_OUTPUT, WEAPON_DAMAGE_OUTPUT, rollToChat, RollCheck, isHit, isCriticalSuccess, superiorResults } from "./dice.js";
import * as pools from "./pools.js";
import { gmList, prepareRecipients, inheritChatVisibility, readRollContext, isChecked, timedEffectData, postCard, searchableListSelection, selectFromSearchableList, CARD_TEMPLATE } from "../common/general-sheet-functions.js";
import { registerSocketActions, relayToActiveGM } from "../common/socket.js";
import { effectRuleKey } from "../common/general-helper-functions.js";
import { getStrainFamily, listStrainFamilies } from "./strain-families.js";
import { registerRollBlock, registerFailOption, registerLandingRule, getLandingRule } from "../api/registry.js";
import { durationRunOut } from "../common/time.js";
import { strainSubstrate } from "../common/morp-functions.js";
import { registerAttackEffect, chosenTargets, attackRoll, followUpVisibility, defenders } from "./attacks.js";
import { registerCard, renderCard, updateCard, storable } from "../common/chat-cards.js";
import { measuredDistances, tokenGap } from "../common/targeting.js";
import { noteDefence, applyHealing, sufferPain, shockConditions, conditionNames } from "./damage.js";
import { conditionEntry, conditionStatusEffects, inflictCondition } from "../common/conditions.js";

const CHI_PUSH_OUTPUT = "systems/eclipsephase/templates/chat/chi-push.html";

const DEFAULT_STRAIN_FAMILY = "psi";

/**
 * The strain family an actor belongs to. Taken from their sleights, falling back to a family's
 * tier traits for characters who own the discipline but no sleight yet, and to Psi otherwise.
 * @param {Actor} actorWhole
 * @returns {string}
 */
export function actorStrainFamily(actorWhole){
    const sleights = actorWhole?.items?.filter(i => i.type === "aspect") ?? [];
    const primary = sleights.find(i => i.system?.psiType === "gamma") ?? sleights.find(i => i.system?.psiType === "chi") ?? sleights[0];
    if (primary?.system?.strainFamily) return primary.system.strainFamily;
    const ownsTrait = name => !!actorWhole?.items?.some(i => i.type === "traits" && i.name === name);
    const owned = listStrainFamilies()
        .filter(family => family.id !== DEFAULT_STRAIN_FAMILY)
        .find(family => Object.values(family.tierTraits).some(trait => ownsTrait(trait.name)));
    return owned ? owned.id : DEFAULT_STRAIN_FAMILY;
}

/**
 * Formula for the psi-feedback physical damage roll, or null if none applies. A manual push always
 * costs at least 1d6, doubled on a virus result of 1. The free Infection-66+ gamma auto-push is
 * deliberately absent here: it costs nothing to use, so it neither causes feedback damage nor
 * doubles it - it only doubles the sleight's own damage, via gammaAutoPushDamageMultiplier.
 * @param {boolean} manualPush - whether the psi check was manually pushed this roll
 * @param {boolean} virusResultIsOne - whether the infection-influence d6 landed on 1
 * @returns {string|null}
 */
export function resolvePhysicalDamageFormula(manualPush, virusResultIsOne){
    if (virusResultIsOne) return manualPush ? "2d6" : "1d6";
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
    const context = readRollContext(data.currentTarget);
    const actorWhole = await fromUuid(context.actorUuid)
    if(!actorWhole){
        ui.notifications.warn(game.i18n.localize("ep2e.roll.announce.psi.actorGone"))
        return
    }
    const psiOwner = context.userId
    const push = context.options.push;
    const systemOptions = {}
    const inherited = inheritChatVisibility(context.messageId, context.options.rollMode)
    const rollMode = inherited.blind ? "blindroll" : context.options.rollMode
    await rollPsiEffect(actorWhole, psiOwner, push, systemOptions, undefined, rollMode)
}

/**
 * Whether the actor's own strain family works in the body they currently act through, warning
 * the user when it does not. A Chi push runs entirely off the sheet and never reaches the roll
 * pipeline, so it has to ask for itself.
 * @param {Actor} actorWhole
 * @returns {boolean} true when the push may go ahead
 */
function chiPushAllowed(actorWhole){
    const substrate = strainSubstrate(actorWhole, actorStrainFamily(actorWhole));
    if (!substrate.blocked) return true;
    ui.notifications.warn(game.i18n.localize(substrate.reasonKey));
    return false;
}

/**
 * How many minutes a chi push lasts: WIL divided by five, per RAW, and never less than one.
 * @param {Actor} actorWhole - The pushing actor
 * @returns {Number} The duration in minutes
 */
export function chiPushMinutes(actorWhole){
    const { durationAptitude } = getStrainFamily(actorStrainFamily(actorWhole)).targeting;
    return Math.max(1, Math.floor((actorWhole?.system?.aptitudes?.[durationAptitude]?.value ?? 0) / 5));
}

/**
 * Ends every chi push whose duration has run out, called when Foundry reports that a tracked
 * effect's remaining time changed. Expiry only marks an effect, so the pool bump a push applied
 * has to be reversed here rather than left to core.
 * @param {Actor} actorWhole - The actor whose effects were refreshed
 * @param {ActiveEffect[]} effects - The effects whose remaining duration changed
 * @returns {Promise<void>} Resolves once every expired push is cleaned up
 */
export async function endExpiredChiPushes(actorWhole, effects){
    const expired = effects.filter(effect =>
        effect.getFlag?.("eclipsephase", "chiPushBoost") === true && durationRunOut(effect));

    for (const effect of expired) {
        const item = effect.parent;
        if (item?.id) await endChiPush(actorWhole, item.id);
    }
}

/**
 * Duplicates a chi sleight's own ActiveEffect(s) onto itself, flagged as a temporary push boost,
 * and marks the item pushed; the pool rule hands over any pool point the boost adds. No-ops entirely if
 * the actor is already Infection-33+ boosted (that already doubles the sleight's bonus globally,
 * so pushing it individually would double-count) or if the item is already pushed.
 * @param {Actor} actorWhole
 * @param {string} itemId
 */
export async function pushChiSleight(actorWhole, itemId){
    if (!chiPushAllowed(actorWhole)) return;
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
            // expiry null, so the push runs down on the world clock rather than on a combat turn,
            // which is what Foundry would otherwise default to once a duration value is present.
            duration: { value: chiPushMinutes(actorWhole), units: "minutes", expiry: null },
            // Foundry stamps start only on actor-owned effects, and this one lives on the item, so
            // it has to be supplied here or the duration would never be tracked.
            start: ActiveEffect.getEffectStart(),
            // A duration would otherwise put an icon on the token, which this system does not want.
            showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER,
            flags: { eclipsephase: { chiPushBoost: true } }
        };
        if (isV14Plus) newEffectData.system = { changes };
        await item.createEmbeddedDocuments("ActiveEffect", [newEffectData]);
    }

    await item.update({ "system.pushed": true });
}

/**
 * Ends a chi sleight's temporary push boost: deletes the duplicated effect, which hands the pool
 * point back through the pool rule, and clears the flag.
 * @param {Actor} actorWhole
 * @param {string} itemId
 */
export async function endChiPush(actorWhole, itemId){
    const item = actorWhole.items.get(itemId);
    if (!item) return;

    const boostEffects = item.effects.filter(e => e.getFlag("eclipsephase", "chiPushBoost"));
    if (boostEffects.length) {
        await item.deleteEmbeddedDocuments("ActiveEffect", boostEffects.map(e => e.id));
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
    if (!chiPushAllowed(actorWhole)) return;
    const psiOwner = game.user._id;
    const recipientList = prepareRecipients(rollMode);
    const pushedItem = actorWhole.items.get(itemId);
    const actingPerson = game.i18n.format("ep2e.roll.announce.psi.pushingSleight", { name: pushedItem?.name });

    const raisedInfection = Math.min(actorWhole.system.psiStrain.infection + 5, 100);
    await actorWhole.update({ "system.psiStrain.infection": raisedInfection });

    await pushChiSleight(actorWhole, itemId);
    const minutes = chiPushMinutes(actorWhole);
    const chiPushMessage = game.i18n.format("ep2e.roll.announce.psi.chiPushActive", { minutes });
    await rollToChat(null, { message: chiPushMessage }, CHI_PUSH_OUTPUT, null, actingPerson, recipientList, false);

    const systemOptions = {};
    await rollPsiEffect(actorWhole, psiOwner, false, systemOptions, itemId, rollMode);
}

const PSI_SOCKET_NAME = "system.eclipsephase";

let psiEffectSocketRegistered = false;

/**
 * Registers the GM-side listener that runs an Infection Test on behalf of a player. Foundry shows a
 * whispered message to its author no matter what the whisper list says, so a test authored by the
 * player would leave a countable card in their own log even when it is blind.
 */
export function registerPsiEffectSocket(){
    if (psiEffectSocketRegistered) return;
    psiEffectSocketRegistered = true;
    registerSocketActions({ psiLockOut: setLockOut, sleightEffect: setSleightEffect, sustainTarget: setSustainTarget, sleightHealing: healFromSleight, sleightChoice: applySleightChoice, endSustain: async ({ actorUuid, attackId }) => endSustaining(await fromUuid(actorUuid), { attackId }) });
    game.socket.on(PSI_SOCKET_NAME, async payload => {
        if (!game.user.isGM || payload?.action !== "rollPsiEffect") return;
        const primaryGM = game.users.activeGM;
        if (primaryGM && primaryGM.id !== game.user.id) return;
        const actorWhole = await fromUuid(payload.actorUuid);
        if (!actorWhole) return;
        const systemOptions = {};
        await rollPsiEffect(actorWhole, payload.psiOwner, payload.push, systemOptions, payload.chiPushItemId, payload.rollMode);
    });
}

/**
 * Rolls the Infection Test and everything it triggers: the influence effect on a success and the
 * feedback damage on a result of 1. Always runs on the primary GM's client, delegating there via
 * socket when a player triggered it, so that a blind test leaves nothing at all in the player's
 * chat log. Falls back to local execution when no GM is connected.
 * @param {Actor} actorWhole - The infected actor
 * @param {String} psiOwner - Id of the user the result is whispered to alongside the GMs
 * @param {Boolean|String} push - Whether the triggering sleight was pushed
 * @param {Object} systemOptions - Forwarded to TaskRoll.outputData(); no field of it is read here
 * @param {String} chiPushItemId - Id of the pushed chi sleight, if a chi push triggered this
 * @param {String} rollMode - Visibility of the originating roll, "blind" hides the test entirely
 */
export async function rollPsiEffect(actorWhole, psiOwner, push, systemOptions, chiPushItemId, rollMode){
    if (!game.user.isGM && game.users.activeGM) {
        game.socket.emit(PSI_SOCKET_NAME, {
            action: "rollPsiEffect",
            actorUuid: actorWhole.uuid,
            psiOwner,
            push,
            chiPushItemId,
            rollMode
        });
        return;
    }

    const actorModel = actorWhole.system;
    const blind = rollMode === "blind" || rollMode === "blindroll";
    const isPublic = rollMode === "public" || rollMode === "publicroll";
    let recipientList = rollMode ? prepareRecipients(rollMode) : gmList();
    if (!blind && !isPublic && !recipientList.includes(psiOwner))
        recipientList.push(psiOwner)

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

    

    await rollToChat(null, message, TASK_RESULT_OUTPUT, roll, actingPerson, recipientList, blind)


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

        const strainFamily = actorStrainFamily(actorWhole);
        const family = getStrainFamily(strainFamily);
        const strainLabel = actorModel.subStrain.label;
        const archetypeData = foundry.utils.getProperty(actorWhole, family.dataPath)?.[strainLabel];

        const influence = family.influence?.(result, { strainLabel, archetypeData, actorModel }) ?? null;
        if (influence) {
            message.influenceLabel = influence.label;
            message.influenceCopy = influence.copy;
            if (influence.withRule) message.influenceRule = effectRuleKey(influence.copy);
        }

        let actingPerson = game.i18n.localize("ep2e.roll.dialog.push.infectionInfluence");
    
        await rollToChat(null, message, PSI_INFLUENCE_OUTPUT, d6, actingPerson, recipientList, blind)

    }
    
    const manualPush = chiPushItemId ? false : !!push;
    physicalDamageRoll = resolvePhysicalDamageFormula(manualPush, d6.total === 1);

    if (physicalDamageRoll && actorWhole.type === "character"){

        const physicalDamage = await new Roll(physicalDamageRoll).evaluate();
        const actingPerson = game.i18n.localize("ep2e.roll.dialog.push.infectionDamage");
        const feedback = getStrainFamily(actorStrainFamily(actorWhole)).feedback;

        let message = {
            "psiDamageValue": physicalDamage.total,
            "type": "defaultDamage",
            "rollTitle": "ep2e.roll.announce.damageDone",
            "copy": manualPush ? "ep2e.roll.announce.psi.pushedSleightFeedback" : feedback.copyKey
        }

        await rollToChat(null, message, WEAPON_DAMAGE_OUTPUT, physicalDamage, actingPerson, recipientList, blind, "rollOutput")

        if (feedback.target === "mental") {
            mentalUpdate += physicalDamage.total;

            if (physicalDamage.total >= traumaThreshold){
                traumaUpdate += Math.floor(physicalDamage.total/traumaThreshold);
            }

            if (mentalUpdate > insanityMax){
                mentalUpdate = insanityMax
            }

            await actorWhole.update({"system.health.mental.value" : mentalUpdate, "system.mental.trauma" : traumaUpdate})
        } else {
            durUpdate += physicalDamage.total;

            if (physicalDamage.total >= woundThreshold){
                woundUpdate += Math.floor(physicalDamage.total/woundThreshold);
            }

            if (durUpdate > death){
                durUpdate = death
            }

            await actorWhole.update({"system.health.physical.value" : durUpdate, "system.physical.wounds" : woundUpdate})
        }
    }

}
// A psi-gamma sleight used on someone else is an attack (Core p.276): opposed by the target's WIL,
// and unable to reach a body without a biological brain.
export const PSI_CURSOR = { icon: "ep-lightning" };
// The sleights that can be aimed and land (Core p.276, p.386: epsilon works as gamma does), what a
// lasting one leaves, the units its WIL / 5 counts in, and who it may work on.
const LANDING_TYPES = ["gamma", "epsilon"];
export const SLEIGHT_FLAG = "sleight";

// The conditions a sleight can leave on its target (Core p.226); "impaired" goes one level deeper,
// -10 a level, as often as the sleight applies.
export const SLEIGHT_CONDITIONS = ["blinded", "confused", "dazed", "deafened", "grappled", "immobilized", "impaired", "incapacitated", "prone", "stunned", "unconscious"];

// The senses a sleight can take (Core p.282, Ki Blackout); sight and hearing are conditions of their own.
export const SENSES = ["sight", "hearing", "touch", "smell", "taste", "hunger", "balance", "direction", "proprioception", "facialRecognition", "radar", "lidar", "tRay", "electricalSense", "radiationSense"];
const SENSE_CONDITIONS = { sight: "blinded", hearing: "deafened" };
const LOST_SENSE_MODIFIER = -30;
const LASTING_DURATIONS = ["action", "minutes", "hours", "sustained"];
const SLEIGHT_UNITS = { action: "rounds", minutes: "minutes", hours: "hours" };
const AFFECTS = ["target", "async", "both"];
const SUPERIOR_RESULTS = [4, 5, 7];
export const PSI_UNSUITABLE = ["synthmorph", "infomorph", "bot", "vehicle"];
const PSI_CYBERBRAIN_MODIFIER = -30;
const PSI_TOUCH_MODIFIER = 20;
const SLEIGHT_ARMOR = ["mental", "energy", "kinetic"];
const SKILL_BOOST = 10;
// House rule: Core p.276 doubles a critical's effect. Damage still does, in the damage formula.
const CRITICAL_EFFECT_FACTOR = 4;

// Who psi works on (Core p.276-277): biological brains, a cyberbrain being harder to reach, and
// farther when the target is an async of the same family.
export const PSI_TARGETING = {
    refuses: (actor, kinds) => kinds.find(kind => PSI_UNSUITABLE.includes(kind)) ?? null,
    modifiers: (actor, kinds) => kinds.includes("cyberbrain") ? [{ text: "ep2e.roll.announce.psi.cyberbrain", value: PSI_CYBERBRAIN_MODIFIER }] : [],
    doublesRange: actor => isAsync(actor) && actorStrainFamily(actor) === DEFAULT_STRAIN_FAMILY
};

/**
 * Who a sleight's strain family lets it work on.
 * @param {Item} [sleight] - The sleight
 * @returns {Object} refuses, modifiers and doublesRange
 */
export function sleightTargeting(sleight) {
    return getStrainFamily(sleight?.system?.strainFamily ?? "psi").targeting;
}

/**
 * The armour a damaging sleight meets.
 * @param {Item} sleight - The sleight
 * @returns {String} "mental", "energy" or "kinetic"
 */
export function sleightArmor(sleight) {
    const armor = sleight?.system?.damage?.armorUsed;
    return SLEIGHT_ARMOR.includes(armor) ? armor : "mental";
}

/**
 * The psi-gamma sleight a roll uses, or null for any other roll.
 * @param {Object} context - The roll context, with actor and dataset
 * @returns {Item|null} The sleight
 */
export function gammaSleight(context) {
    if (context?.rolledFrom !== "psiSleight") return null;
    const sleight = context.actor?.items?.get?.(context.dataset?.itemid);
    return LANDING_TYPES.includes(sleight?.system?.psiType) ? sleight : null;
}

/**
 * The pushes a sleight's roll runs with: the one chosen in the dialog, plus the free push a
 * gamma-boosted async (Infection 66+) has selected. The same push from both counts once.
 * @param {Actor} actor - The async
 * @param {String} [manualPush] - The push chosen in the dialog
 * @returns {Set<String>} Push keys, e.g. "range", "effect", "power"
 */
export function gammaPushes(actor, manualPush) {
    const pushes = new Set();
    if (manualPush && manualPush !== "none" && manualPush !== "false") pushes.add(manualPush);
    const systems = actor?.system?.additionalSystems;
    if (systems?.psiGammaBoosted === true && systems?.autoPushSelection && systems.autoPushSelection !== "none") pushes.add(systems.autoPushSelection);
    return pushes;
}

/**
 * A sleight's duration key. Older compendium data wrote "Actions Turns" for action turns.
 * @param {Object} system - The sleight's system data
 * @returns {String} "instant", "action", "minutes", "hours", "sustained" or ""
 */
export function sleightDurationKey(system) {
    const duration = system?.duration ?? "";
    return duration === "Actions Turns" ? "action" : duration;
}

/**
 * How long a temporary sleight lasts (Core p.276): the async's WIL / 5 in the sleight's unit, at
 * least one, doubled by the Increased Duration push. Sustained and instant sleights have no span.
 * @param {Object} system - The sleight's system data
 * @param {Actor} actor - The async
 * @param {Set<String>} pushes - What gammaPushes reported
 * @returns {Object|null} { value, units }, or null without a span
 */
export function sleightSpan(system, actor, pushes = new Set()) {
    const units = SLEIGHT_UNITS[sleightDurationKey(system)];
    if (!units) return null;
    const { durationAptitude } = getStrainFamily(system?.strainFamily ?? DEFAULT_STRAIN_FAMILY).targeting;
    const value = Math.max(1, Math.floor((Number(actor?.system?.aptitudes?.[durationAptitude]?.value) || 0) / 5));
    return { value: pushes.has("duration") ? value * 2 : value, units };
}

/**
 * What a sleight leaves when it lands, read off the sleight at its roll: its blueprint effects'
 * changes, its situational options, who gets them and for how long, the healing it does, or its landing
 * rule. An instant sleight with neither healing nor a rule leaves nothing behind.
 * @param {Item} sleight - The sleight
 * @param {Actor} actor - The async
 * @param {Set<String>} pushes - What gammaPushes reported
 * @returns {Object|null} The landing data, or null for an instant sleight
 */
export function sleightLanding(sleight, actor, pushes = new Set()) {
    const system = sleight?.system ?? {};
    const duration = sleightDurationKey(system);
    const heal = sleightHealing(sleight);
    const rule = getLandingRule(system.landingRule) ? system.landingRule : null;
    if (!heal && !rule && !LASTING_DURATIONS.includes(duration)) return null;
    return {
        rule,
        strainFamily: system.strainFamily ?? "psi",
        uuid: sleight.uuid ?? null,
        itemId: sleight.id ?? null,
        heal,
        pushRange: pushes.has("range"),
        name: sleight.name,
        img: sleight.img ?? null,
        description: system.description ?? "",
        duration,
        span: sleightSpan(system, actor, pushes),
        changes: Array.from(sleight.effects ?? []).flatMap(effect => foundry.utils.deepClone(effect.changes ?? [])),
        rollOptions: Array.isArray(system.rollOptions) ? foundry.utils.deepClone(system.rollOptions) : [],
        affects: AFFECTS.includes(system.affects) ? system.affects : "target",
        repeat: system.repeatPerSuperior === true,
        multiplier: pushes.has("effect") ? 2 : 1,
        condition: SLEIGHT_CONDITIONS.includes(system.condition) ? system.condition : null
    };
}

/**
 * The condition a sleight leaves at its potency: Impaired one level per time it applies, -30 at most.
 * @param {String|null} condition - The sleight's condition
 * @param {Object} potency - What sleightPotency reported
 * @returns {String|null} The condition id
 */
export function sleightCondition(condition, { count = 1, factor = 1 } = {}) {
    if (condition !== "impaired") return condition ?? null;
    return `impaired${Math.min(3, count * factor) * 10}`;
}

/**
 * How strongly a landing sleight works: once, plus once per superior success when its effect
 * repeats, all times four on a critical success and doubled by the Increased Effect push.
 * @param {Object} landing - What sleightLanding read
 * @param {Number} result - The async's result tier
 * @returns {Object} count (how often the effect applies) and factor
 */
export function sleightPotency(landing, result) {
    const superior = result === 5 ? 2 : result === 4 ? 1 : 0;
    const count = 1 + (landing?.repeat ? superior : 0);
    return { count, factor: (isCriticalSuccess(result) ? CRITICAL_EFFECT_FACTOR : 1) * (landing?.multiplier ?? 1) };
}

/**
 * The dice formula a blueprint value rolls with at a sleight's potency: "1d6" once per count is
 * "2d6" for two, a bonus counted as often, and the whole doubled where the factor says.
 * @param {String} text - The value as authored, e.g. "1d6" or "2d10+5"
 * @param {Object} potency - What sleightPotency reported
 * @returns {String|null} The formula, or null when the value is no dice formula
 */
export function scaledFormula(text, { count, factor }) {
    const match = String(text ?? "").trim().match(/^(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/i);
    if (!match) return null;
    const dice = `${(Number(match[1]) || 1) * count}d${match[2]}`;
    const formula = match[4] ? `${dice} ${match[3]} ${Number(match[4]) * count}` : dice;
    return factor > 1 ? `(${formula}) * ${factor}` : formula;
}

/**
 * A blueprint value scaled by a sleight's potency. A number is multiplied; a dice formula such as
 * "1d6" is rolled once, as scaledFormula reads it.
 * @param {String|Number} value - The value as authored
 * @param {Object} potency - What sleightPotency reported
 * @returns {Promise<String|Number>} The value to apply
 */
export async function scaledValue(value, potency) {
    const text = String(value ?? "").trim();
    if (/^[+-]?\d+(\.\d+)?$/.test(text)) return Number(text) * potency.count * potency.factor;
    const formula = scaledFormula(text, potency);
    if (!formula) return value;
    return (await new Roll(formula).evaluate()).total;
}

/**
 * The effect a landing sleight puts on one side. On the async, when only the async gains from it,
 * it is named after the target and so are its options. Only added changes scale (a change's type
 * "add", or mode 2 before Foundry 14).
 * @param {Object} landing - What sleightLanding read
 * @param {Object} potency - What sleightPotency reported
 * @param {Object} context - target (the actor it was aimed at), onAsync, attackId, defenceId
 * @returns {Promise<Object>} The ActiveEffect data
 */
export async function sleightEffectData(landing, potency, { target, onAsync = false, attackId = null, defenceId = null }) {
    const named = onAsync && landing.affects === "async" && target;
    const name = named ? game.i18n.format("ep2e.psi.sleightEffect.against", { sleight: landing.name, target: target.name }) : landing.name;
    const changes = [];
    for (const change of landing.changes ?? []) {
        const added = change.type ? change.type === "add" : Number(change.mode ?? 2) === 2;
        changes.push({ ...change, value: added ? String(await scaledValue(change.value, potency)) : change.value });
    }
    const condition = onAsync ? null : sleightCondition(landing.condition, potency);
    if (condition) changes.push(...conditionStatusEffects().find(status => status.id === condition).changes);
    const rule = getLandingRule(landing.rule);
    const choosing = rule?.bindsSkill || rule?.bindsChoice;
    const rollOptions = [];
    for (const option of landing.rollOptions ?? []) rollOptions.push({ ...option, value: await scaledValue(option.value, potency) });
    return timedEffectData({
        name,
        img: condition ? conditionEntry(condition).img : landing.img,
        origin: landing.uuid,
        description: landing.description,
        changes,
        statuses: condition ? [condition] : [],
        ...(condition ? { showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS } : {}),
        span: landing.span,
        flags: {
            effectKey: SLEIGHT_FLAG,
            [SLEIGHT_FLAG]: {
                key: choosing && attackId ? `${landing.name}:${attackId}` : sleightKey(landing, named ? target : null),
                name,
                sleightName: landing.name,
                targetUuid: target?.uuid ?? null,
                asyncUuid: landing.asyncUuid ?? null,
                sustained: landing.duration === "sustained",
                attackId,
                defenceId,
                rollOptions,
                choice: choosing ? { rule: landing.rule, skillKey: null, skillName: null } : null,
                breaksContact: !onAsync && rule?.breaksContact === true
            }
        }
    });
}

/**
 * What makes two landings of a sleight the same, so the second renews the first rather than
 * stacking with it: the sleight's name, and on the async the target it is about.
 * @param {Object} landing - What sleightLanding read
 * @param {Actor|null} target - The target, when the effect is named after it
 * @returns {String} The key
 */
function sleightKey(landing, target) {
    return target ? `${landing.name}:${target.uuid}` : landing.name;
}

/**
 * Puts a sleight's effect on an actor, replacing the one it renews, or takes effects off again: those
 * of one defence when a pool point turned it, or those of one attack - on one target, or all - when
 * its sustaining ends. The active GM does it where this user may not.
 * @param {Object} request - actorUuid, and data (the effect, with its key), defenceId, or attackId
 *   with an optional targetUuid
 * @returns {Promise<Boolean>} True when done or handed to the GM
 */
export async function setSleightEffect({ actorUuid, data = null, defenceId = null, attackId = null, targetUuid = null }) {
    const actor = actorUuid ? await fromUuid(actorUuid) : null;
    if (!actor) return false;
    if (!actor.isOwner) return relayToActiveGM("sleightEffect", { actorUuid, data, defenceId, attackId, targetUuid });
    const key = data?.flags?.eclipsephase?.[SLEIGHT_FLAG]?.key ?? null;
    const renewed = Array.from(actor.effects).filter(effect => key && effect.getFlag?.("eclipsephase", SLEIGHT_FLAG)?.key === key);
    const taken = Array.from(actor.effects).filter(effect => {
        const flag = effect.getFlag?.("eclipsephase", SLEIGHT_FLAG);
        if (!flag || renewed.includes(effect)) return false;
        if (defenceId && flag.defenceId === defenceId) return true;
        return !!attackId && flag.attackId === attackId && (!targetUuid || flag.targetUuid === targetUuid);
    });
    if (renewed.length) await actor.deleteEmbeddedDocuments("ActiveEffect", renewed.map(effect => effect.id), { [CASCADE_OPTION]: false });
    if (taken.length) await actor.deleteEmbeddedDocuments("ActiveEffect", taken.map(effect => effect.id));
    if (data) await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    return true;
}

/**
 * The async's result a sleight lands with: what the attack card shows now, so a pool point spent on
 * the psi test after the targets were sent counts; the result stored with the attack otherwise.
 * @param {Object} attack - The attack
 * @returns {Number} The result tier
 */
function landingResult(attack) {
    const card = attack.messageId ? game.messages.get(attack.messageId) : null;
    const shown = card ? Number(attackRoll(card).result) : NaN;
    return Number.isFinite(shown) ? shown : Number(attack.roll?.result);
}

/**
 * Puts a landing sleight's effect on the side or sides it works on.
 * @param {Object} attack - The attack, with payload.landing
 * @param {Actor} target - The target it landed on
 * @param {Number} result - The async's result tier
 * @param {String|null} defenceId - The defence it came through
 * @returns {Promise<void>} Resolves once every side has it
 */
async function applyLanding(attack, target, result, defenceId) {
    const landing = attack.payload?.landing;
    if (!landing) return;
    const async = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
    const potency = sleightPotency(landing, result);
    if (landing.heal) {
        const origin = attack.messageId ? game.messages.get(attack.messageId) : null;
        const seen = followUpVisibility(origin, [target]);
        await healFromSleight({ actorUuid: target.uuid, formula: healingFormula(landing.heal, potency), target: landing.heal.target, sleightName: landing.name, whisper: seen.whisper, blind: seen.blind });
        return;
    }
    const rule = getLandingRule(landing.rule);
    if (rule?.instant) {
        await rule.onLand({ attack, target, async, landing, result });
        return;
    }
    const sides = landing.affects === "both" ? [target, async] : landing.affects === "async" ? [async] : [target];
    for (const side of new Set(sides.filter(Boolean))) {
        const data = await sleightEffectData({ ...landing, asyncUuid: async?.uuid ?? null }, potency, { target, onAsync: side === async, attackId: attack.id ?? null, defenceId });
        await setSleightEffect({ actorUuid: side.uuid, data });
    }
    if (rule) await rule.onLand({ attack, target, async, landing, result });
    if (landing.duration !== "sustained" || !async) return;
    for (const record of sustainRecords(async)) {
        const flag = record.getFlag("eclipsephase", SUSTAIN_FLAG);
        if (flag.attackId !== attack.id && flag.sleightName === landing.name && (flag.targets ?? []).some(entry => entry.uuid === target.uuid)) {
            await setSustainTarget({ actorUuid: async.uuid, attackId: flag.attackId, targetUuid: target.uuid, add: false });
        }
    }
    await setSustainTarget({ actorUuid: async.uuid, attackId: attack.id ?? null, landing, targetUuid: target.uuid, targetName: target.name, add: true });
}

/**
 * Carries out a sleight without damage on one target after their defence (Core p.276): the
 * outcome is noted on the cards, and a sleight that lasts leaves its effect on the side it works
 * on - the target, the async, or both. A pool point that turned the defence takes the earlier
 * landing back first.
 * @param {Object} attack - The attack, with payload.landing and roll
 * @param {Actor} target - The target
 * @param {String} outcome - "hit" or "none"
 * @param {Object} [options] - kind, byPool and defenceId, as attacks.js passes them
 * @returns {Promise<*>} What noting the defence reported
 */
export async function landSleight(attack, target, outcome, options = {}) {
    const { byPool = false, defenceId = null } = options;
    const async = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
    if (byPool && defenceId) {
        for (const side of new Set([target, async].filter(Boolean))) await setSleightEffect({ actorUuid: side.uuid, defenceId });
    }
    const noted = await noteDefence(attack, target, outcome, options);
    if (outcome !== "none") await applyLanding(attack, target, landingResult(attack), defenceId);
    return noted;
}

/**
 * The card a sleight's landing rule posts: the async's choice of a skill or a running substance, the
 * GM's note for an error they place, or the target's note that a complex action now recharges.
 * @param {Object} attack - The attack
 * @param {Actor} target - The target it landed on
 * @param {Actor|null} async - The async
 * @param {Object} landing - What sleightLanding read
 * @param {Number} result - The async's result tier
 * @returns {Promise<void>} Resolves once the card is posted
 */
async function offerLandingChoice(attack, target, async, landing, result) {
    const potency = sleightPotency(landing, result);
    const extra = landing.rule === "boostSkill" ? { bonus: SKILL_BOOST * potency.count * potency.factor } : {};
    const names = { target: target.name, async: async?.name ?? "", sleight: landing.name };
    const card = { icon: "fa-brain", color: "--iconBlue" };
    if (landing.rule === "recharge") {
        await postCard(target, { ...card, headline: game.i18n.format("ep2e.psi.choice.recharge", names) }, {}, [...new Set([...defenders(target), ...gmList()])]);
        return;
    }
    if (landing.rule === "failSkill" && !SUPERIOR_RESULTS.includes(result)) {
        await postCard(target, { ...card, headline: game.i18n.format("ep2e.psi.choice.errorGM", names) }, {}, gmList());
        return;
    }
    await postCard(async, { ...card, headline: game.i18n.format(`ep2e.psi.choice.${landing.rule}`, names), button: { action: "sleightChoice", label: game.i18n.localize(`ep2e.psi.choice.${landing.rule}Button`) }, actorUuid: async?.uuid }, { eclipsephase: { sleightChoice: { rule: landing.rule, targetUuid: target.uuid, attackId: attack.id ?? null, sleightName: landing.name, ...extra } } }, [...new Set([...defenders(async), ...gmList()])]);
}

/**
 * The skills an actor can be tested with, under the key a roll of them carries.
 * @param {Actor} actor - The actor
 * @returns {Object[]} id and label per skill, by label
 */
export function skillEntries(actor) {
    const system = actor?.system ?? {};
    const common = [system.skillsIns, system.skillsMox, system.skillsVig].flatMap(group => Object.entries(group ?? {})).map(([key, skill]) => ({ id: key.toLowerCase(), label: game.i18n.localize(skill.name) }));
    const own = Array.from(actor?.items ?? []).filter(item => ["specialSkill", "knowSkill"].includes(item.type)).map(item => ({ id: item.name.toLowerCase(), label: item.name }));
    return [...common, ...own].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Asks for what a landing rule's card leaves open and hands it on.
 * @param {ChatMessage} message - The card
 * @returns {Promise<Boolean>} True when something was chosen
 */
export async function chooseFromCard(message) {
    const choice = message?.getFlag?.("eclipsephase", "sleightChoice");
    const target = choice?.targetUuid ? await fromUuid(choice.targetUuid) : null;
    if (!target) return false;
    const definition = getLandingRule(choice?.rule);
    if (!definition?.choose) return false;
    return definition.choose({ message, target, request: { ...choice, messageId: message.id } });
}

/**
 * Asks which running substance Alter Effect changes, and how.
 * @param {Object} context - target and request
 * @returns {Promise<Boolean>} True when something was chosen
 */
async function chooseSubstance({ target, request }) {
    const running = Array.from(target.effects ?? []).filter(effect => effect.getFlag?.("eclipsephase", "dose") && Number(effect.duration?.value) > 0);
    if (!running.length) {
        ui.notifications.warn(game.i18n.format("ep2e.psi.choice.noSubstance", { target: target.name }));
        return false;
    }
    const altered = await searchableListSelection(running.map(effect => ({ id: effect.id, label: effect.name })), "ep2e.psi.choice.alterHeader", "ep2e.psi.choice.alterCopy", {
        listQuestion: "ep2e.psi.choice.alterQuestion",
        answers: [{ action: "1.5", label: "ep2e.psi.choice.longer" }, { action: "0.5", label: "ep2e.psi.choice.shorter" }]
    });
    if (altered?.cancelled || !altered?.selection || !altered.answer) return false;
    return applySleightChoice({ ...request, effectId: altered.selection, factor: Number(altered.answer) });
}

/**
 * Asks how an induced error strikes: as a superior failure or on a chosen skill.
 * @param {Object} context - target and request
 * @returns {Promise<Boolean>} True when something was chosen
 */
async function chooseError({ target, request }) {
    const entries = skillEntries(target);
    const error = await searchableListSelection(entries, "ep2e.psi.choice.errorHeader", "ep2e.psi.choice.skillCopy", {
        listMode: { copy: "ep2e.psi.choice.errorCopy", options: [{ id: "superior", label: "ep2e.psi.choice.superiorFailure" }, { id: "skill", label: "ep2e.psi.choice.failSkillOption", enablesList: true }] }
    });
    if (error?.cancelled) return false;
    if (error?.mode === "superior") return applySleightChoice({ ...request, superiorFailure: true });
    if (!error?.selection) return false;
    return applySleightChoice({ ...request, skillKey: error.selection, skillName: entries.find(entry => entry.id === error.selection)?.label ?? error.selection });
}

/**
 * Asks which skill a sleight blocks.
 * @param {Object} context - target and request
 * @returns {Promise<Boolean>} True when something was chosen
 */
async function chooseBlockedSkill({ target, request }) {
    const entries = skillEntries(target);
    const skillKey = await selectFromSearchableList(entries, "ep2e.psi.choice.skillHeader", "ep2e.psi.choice.skillCopy");
    if (!skillKey) return false;
    return applySleightChoice({ ...request, skillKey, skillName: entries.find(entry => entry.id === skillKey)?.label ?? skillKey });
}

/**
 * Asks which physical skill a sleight raises.
 * @param {Object} context - target and request
 * @returns {Promise<Boolean>} True when something was chosen
 */
async function chooseBoostedSkill({ target, request }) {
    const entries = Object.entries(target.system?.skillsVig ?? {}).map(([key, skill]) => ({ id: key, label: game.i18n.localize(skill.name) })).sort((a, b) => a.label.localeCompare(b.label));
    const skillKey = await selectFromSearchableList(entries, "ep2e.psi.choice.skillHeader", "ep2e.psi.choice.boostCopy");
    if (!skillKey) return false;
    return applySleightChoice({ ...request, skillKey, skillName: entries.find(entry => entry.id === skillKey)?.label ?? skillKey });
}

/**
 * Carries out a choice made on a landing rule's card, and closes the card with what was chosen. The
 * active GM does it where this user may not.
 * @param {Object} request - rule, targetUuid, attackId, sleightName, messageId, and skillKey with
 *   skillName, or superiorFailure, or effectId with factor; bonus on a skill it raises
 * @returns {Promise<Boolean>} True when done or handed to the GM
 */
export async function applySleightChoice(request) {
    const { rule, targetUuid, attackId, sleightName, messageId, skillKey = null, skillName = null, superiorFailure = false, effectId = null, factor = 1, bonus = 0 } = request;
    const target = targetUuid ? await fromUuid(targetUuid) : null;
    if (!target) return false;
    const message = messageId ? game.messages.get(messageId) : null;
    if (!target.isOwner || (message && !message.isOwner)) return relayToActiveGM("sleightChoice", request);
    let chosen;
    if (rule === "loseSense") {
        const effect = Array.from(target.effects).find(candidate => {
            const flag = candidate.getFlag?.("eclipsephase", SLEIGHT_FLAG);
            return flag?.choice?.rule === rule && flag.attackId === attackId;
        });
        if (!effect) return false;
        chosen = await loseSense(effect, request.sense, sleightName, target);
    } else if (rule === "alterDuration") {
        const effect = Array.from(target.effects).find(candidate => candidate.id === effectId);
        if (!effect) return false;
        await effect.update({ "duration.value": Math.max(1, Math.round(Number(effect.duration.value) * factor)) });
        chosen = game.i18n.format(factor < 1 ? "ep2e.psi.choice.shortened" : "ep2e.psi.choice.lengthened", { effect: effect.name, target: target.name });
    } else {
        const effect = Array.from(target.effects).find(candidate => {
            const flag = candidate.getFlag?.("eclipsephase", SLEIGHT_FLAG);
            return flag?.choice && flag.attackId === attackId;
        });
        if (!effect) return false;
        if (superiorFailure) {
            const name = game.i18n.format("ep2e.psi.choice.effectName", { sleight: sleightName, skill: game.i18n.localize("ep2e.psi.choice.superiorFailure") });
            await effect.update({ name, [`flags.eclipsephase.${SLEIGHT_FLAG}.name`]: name, [`flags.eclipsephase.${SLEIGHT_FLAG}.choice`]: { rule, skillKey: null, skillName: null, errorKind: "superior" } });
            chosen = game.i18n.format("ep2e.psi.choice.superiorChosen", { sleight: sleightName, target: target.name });
        } else {
            const name = game.i18n.format("ep2e.psi.choice.effectName", { sleight: sleightName, skill: skillName });
            await effect.update({ name, [`flags.eclipsephase.${SLEIGHT_FLAG}.name`]: name, [`flags.eclipsephase.${SLEIGHT_FLAG}.choice`]: { rule, skillKey, skillName }, ...(bonus ? { "system.changes": [{ key: `system.skillsVig.${skillKey}.mod`, type: "add", value: String(bonus) }] } : {}) });
            const renewed = Array.from(target.effects).filter(other => {
                const earlier = other.getFlag?.("eclipsephase", SLEIGHT_FLAG)?.choice;
                return other.id !== effect.id && earlier?.rule === rule && earlier.skillKey === skillKey;
            });
            if (renewed.length) await target.deleteEmbeddedDocuments("ActiveEffect", renewed.map(other => other.id), { [CASCADE_OPTION]: false });
            chosen = game.i18n.format("ep2e.psi.choice.skillChosen", { sleight: sleightName, target: target.name, skill: skillName });
        }
    }
    if (message) await message.update({ content: await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, { icon: "fa-brain", headline: chosen, rows: [] }) });
    return true;
}

const postLandingCard = ({ attack, target, async, landing, result }) => offerLandingChoice(attack, target, async, landing, result);
registerLandingRule("shockEffect", { label: "ep2e.item.aspect.table.landingRule.shockEffect", instant: true, onLand: landShock });
registerLandingRule("painEffect", { label: "ep2e.item.aspect.table.landingRule.painEffect", instant: true, onLand: landPain });
registerLandingRule("loseSense", { label: "ep2e.item.aspect.table.landingRule.loseSense", bindsChoice: true, onLand: postLandingCard, choose: chooseSense });
registerLandingRule("eyeContact", { label: "ep2e.item.aspect.table.landingRule.eyeContact", breaksContact: true, onLand: () => null });
registerLandingRule("blockSkill", { label: "ep2e.item.aspect.table.landingRule.blockSkill", bindsSkill: true, onLand: postLandingCard, choose: chooseBlockedSkill });
registerLandingRule("failSkill", { label: "ep2e.item.aspect.table.landingRule.failSkill", bindsSkill: true, onLand: postLandingCard, choose: chooseError, onReland: context => SUPERIOR_RESULTS.includes(context.result) ? postLandingCard(context) : undefined });
registerLandingRule("boostSkill", { label: "ep2e.item.aspect.table.landingRule.boostSkill", bindsSkill: true, onLand: postLandingCard, choose: chooseBoostedSkill });
registerLandingRule("recharge", { label: "ep2e.item.aspect.table.landingRule.recharge", instant: true, onLand: postLandingCard });
registerLandingRule("alterDuration", { label: "ep2e.item.aspect.table.landingRule.alterDuration", instant: true, onLand: postLandingCard, choose: chooseSubstance });

/**
 * The sleight effect on an actor that binds a landing rule to a skill.
 * @param {Actor} actor - The actor
 * @param {String} rule - "blockSkill" or "failSkill"
 * @param {String} skillKey - The key the roll carries
 * @returns {ActiveEffect|null} The effect
 */
function skillRuleEffect(actor, rule, skillKey) {
    if (!skillKey) return null;
    return Array.from(actor?.effects ?? []).find(effect => {
        const choice = effect.getFlag?.("eclipsephase", SLEIGHT_FLAG)?.choice;
        return choice?.rule === rule && choice.skillKey === skillKey && !effect.disabled;
    }) ?? null;
}

/**
 * Why a skill cannot be used while a sleight blocks it: it may not even be defaulted to.
 * @param {Actor} actor - The actor
 * @param {String} key - The roll key
 * @returns {String|null} The reason, or null when no sleight blocks the skill
 */
export function blockedSkillReason(actor, key) {
    const effect = skillRuleEffect(actor, "blockSkill", key);
    if (!effect) return null;
    const flag = effect.getFlag("eclipsephase", SLEIGHT_FLAG);
    return game.i18n.format("ep2e.psi.choice.blocked", { skill: flag.choice.skillName, sleight: flag.sleightName });
}

/**
 * The oldest effect holding an induced error of one kind that no skill is bound to yet.
 * @param {Actor} actor - The actor
 * @param {String} kind - "auto" or "superior"
 * @returns {ActiveEffect|null} The effect
 */
function oldestInducedError(actor, kind) {
    const held = Array.from(actor?.effects ?? []).filter(effect => {
        const choice = effect.getFlag?.("eclipsephase", SLEIGHT_FLAG)?.choice;
        return choice?.rule === "failSkill" && !choice.skillKey && (choice.errorKind ?? "auto") === kind && effect.active;
    });
    return held.sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0))[0] ?? null;
}

/**
 * The failures the induced errors on an actor let the GM put on a skill test's card, one per kind
 * however many effects hold it. Using one spends the oldest effect of that kind.
 * @param {Actor} actor - The actor
 * @param {Object} context - skillKey of the test
 * @returns {Object[]} id, label, result, note and spend per failure
 */
export function inducedErrorFailures(actor, { skillKey } = {}) {
    if (!skillKey || String(skillKey).startsWith("system.aptitudes")) return [];
    const kinds = [["auto", TASK_RESULT.FAILURE], ["superior", TASK_RESULT.FAILURE_ONE]];
    return kinds.flatMap(([kind, result]) => {
        const held = oldestInducedError(actor, kind);
        if (!held) return [];
        const sleight = held.getFlag("eclipsephase", SLEIGHT_FLAG).sleightName ?? held.name;
        return [{
            id: `inducedError-${kind}`,
            label: `${game.i18n.localize(`ep2e.psi.choice.errorKind.${kind}`)} (${sleight})`,
            result,
            note: game.i18n.localize("ep2e.psi.choice.forcedFailure"),
            spend: () => actor.deleteEmbeddedDocuments("ActiveEffect", [oldestInducedError(actor, kind).id])
        }];
    });
}

/**
 * Makes the next test with an induced error's skill fail, whatever the dice say.
 * @param {Object} context - The roll context, before its roll
 * @returns {void}
 */
export function forceInducedError(context) {
    const effect = skillRuleEffect(context?.actor, "failSkill", context?.rollType);
    if (!effect) return;
    context.forcedResult = TASK_RESULT.FAILURE;
    context.spentEffect = effect;
    context.flags.failureNote = game.i18n.localize("ep2e.psi.choice.forcedFailure");
}

/**
 * Uses an induced error up once its test is made.
 * @param {Object} context - The roll context, after its roll
 * @returns {Promise<void>} Resolves once it is gone
 */
export async function spendInducedError(context) {
    if (context?.spentEffect) await context.actor.deleteEmbeddedDocuments("ActiveEffect", [context.spentEffect.id]);
}

/**
 * Renews what a sleight left on its targets once a pool point improved the async's result after
 * it had landed - a swap that turns an ordinary success into a superior one strengthens the effect.
 * @param {ChatMessage} message - The psi test's card
 * @param {Number} [result] - The new result tier
 * @returns {Promise<Number>} How many targets it was renewed on
 */
export async function relandAfterSpend(message, result) {
    const attack = message?.getFlag?.("eclipsephase", "roll")?.targetedAttack;
    if (attack?.effect !== "sleight" || !attack.delivered || !attack.payload?.landing) return 0;
    const tier = Number.isFinite(Number(result)) ? Number(result) : landingResult({ ...attack, messageId: message.id });
    const struck = (message.getFlag("eclipsephase", "taskCard")?.targets ?? []).filter(entry => entry.outcome === "hit");
    let renewed = 0;
    for (const entry of struck) {
        const target = await fromUuid(entry.uuid);
        if (!target) continue;
        const async = attack.actorUuid ? await fromUuid(attack.actorUuid) : null;
        const earlier = [target, async].filter(Boolean).flatMap(actor => Array.from(actor.effects ?? []))
            .map(effect => effect.getFlag?.("eclipsephase", SLEIGHT_FLAG)).find(flag => flag?.attackId === attack.id && flag?.targetUuid === target.uuid);
        if (!earlier) continue;
        if (attack.payload.landing.rule) {
            await getLandingRule(attack.payload.landing.rule)?.onReland?.({ attack, target, async, landing: attack.payload.landing, result: tier });
            continue;
        }
        await applyLanding({ ...attack, messageId: message.id }, target, tier, earlier.defenceId ?? null);
        renewed++;
    }
    return renewed;
}

/**
 * Whether a sleight deals damage or stress of its own.
 * @param {Item} sleight - The sleight
 * @returns {Boolean} True when it names a damage value
 */
export function sleightDamages(sleight) {
    const damage = sleight?.system?.damage;
    return !["heal", "none"].includes(damage?.mode) && !!(damage?.d10 || damage?.d6 || damage?.bonus);
}

/**
 * What a sleight does to its target's health as its sheet shows it: "heal", "damage" or "none". A
 * sleight that never chose says "damage" when it names a damage value and "none" otherwise.
 * @param {Item} sleight - The sleight
 * @returns {String} The mode
 */
export function sleightDamageMode(sleight) {
    const damage = sleight?.system?.damage ?? {};
    if (["heal", "none", "damage"].includes(damage.mode)) return damage.mode;
    return damage.d10 || damage.d6 || damage.bonus ? "damage" : "none";
}

/**
 * The healing a sleight does instead of damage - Downtime's stress, Recalibrate's damage - or null.
 * @param {Item} sleight - The sleight
 * @returns {Object|null} target ("physical" or "mental"), d10, d6 and bonus
 */
export function sleightHealing(sleight) {
    const damage = sleight?.system?.damage;
    if (damage?.mode !== "heal" || !(damage.d10 || damage.d6 || damage.bonus)) return null;
    return { target: damage.target === "mental" ? "mental" : "physical", d10: Number(damage.d10) || 0, d6: Number(damage.d6) || 0, bonus: Number(damage.bonus) || 0 };
}

/**
 * The attack a psi-gamma sleight's roll carries: one target, two with the Additional Target push;
 * a willing target does not resist. Power has the target resist on half their WIL, Penetration
 * halves mental armour. Damaging sleights and the others are told apart, as each goes to its own
 * effect.
 * @param {Object} context - The roll context at preRoll
 * @param {Object} options - damaging: whether to recognise the damaging sleights or the others
 * @returns {Object|null} The attack's data, or null when the roll is no such attack
 */
export function detectSleightAttack(context, { damaging }) {
    const sleight = gammaSleight(context);
    if (!sleight || sleightDamages(sleight) !== damaging) return null;
    const pushes = gammaPushes(context.actor, context.options?.push);
    const rule = sleight.system.targetRule;
    const selfOnly = rule === "self" && !!context.actor?.uuid;
    return {
        targets: pushes.has("target") && !selfOnly ? 2 : 1,
        area: false,
        labelKey: "ep2e.chat.attack.chooseTarget",
        cursor: PSI_CURSOR,
        strainFamily: sleight.system.strainFamily ?? "psi",
        willing: context.options?.willing === true || context.options?.willing === "on",
        ...(selfOnly ? { selfOnly: true, preTargets: [context.actor.uuid] } : {}),
        ...(rule === "others" ? { refuseSelf: true } : {}),
        payload: {
            armorUsed: sleightArmor(sleight),
            armorPiercing: pushes.has("penetration"),
            halveWill: pushes.has("power"),
            damageTarget: sleight.system.damage?.target === "mental" ? "mental" : "physical",
            ...(damaging ? {} : { landing: sleightLanding(sleight, context.actor, pushes) })
        }
    };
}

/**
 * The formula a healing sleight rolls: its dice and bonus counted once more per superior success
 * where it repeats, the whole multiplied by what sleightPotency reported.
 * @param {Object} heal - What sleightHealing read
 * @param {Object} potency - What sleightPotency reported
 * @returns {String} The formula, e.g. "2d6" or "(2d6) * 2"
 */
export function healingFormula(heal, { count, factor }) {
    const parts = [];
    if (heal.d10) parts.push(`${heal.d10 * count}d10`);
    if (heal.d6) parts.push(`${heal.d6 * count}d6`);
    if (heal.bonus) parts.push(String(heal.bonus * count));
    const formula = parts.join(" + ") || "0";
    return factor > 1 ? `(${formula}) * ${factor}` : formula;
}

/**
 * Heals a target by what a sleight rolls - stress from the mind, damage from the body - and posts
 * the roll with a line saying so, seen as the psi test was. The active GM does it where this user
 * may not.
 * @param {Object} request - actorUuid, formula, target ("physical" or "mental"), sleightName, and
 *   whisper and blind as followUpVisibility gives them
 * @returns {Promise<Number|Boolean>} What was healed, or whether it was handed to the GM
 */
export async function healFromSleight({ actorUuid, formula, target = "physical", sleightName = "", whisper = null, blind = false }) {
    const actor = actorUuid ? await fromUuid(actorUuid) : null;
    if (!actor) return false;
    if (!actor.isOwner) return relayToActiveGM("sleightHealing", { actorUuid, formula, target, sleightName, whisper, blind });
    const roll = await new Roll(formula).evaluate();
    const healed = await applyHealing(actor, roll.total, { target });
    const kind = game.i18n.localize(target === "mental" ? "ep2e.psi.healing.stress" : "ep2e.psi.healing.damage");
    const copy = game.i18n.format("ep2e.psi.healing.card", { name: actor.name, amount: healed, kind, sleight: sleightName });
    await rollToChat(null, { type: "defaultDamage", copy, rollTitle: "ep2e.psi.healing.rollTitle" }, WEAPON_DAMAGE_OUTPUT, roll, sleightName, whisper ?? [], blind, "rollOutput");
    return healed;
}

// The flag of the record an async keeps of a sleight they sustain, and the delete option that
// tells the clean-up a sleight's effect was only renewed.
export const SUSTAIN_FLAG = "sustain";
const CASCADE_OPTION = "sleightCascade";
const SUSTAIN_MODIFIER = -10;
const SUSTAIN_LABEL = "ep2e.psi.sustain.summary";
const SUSTAIN_REACH = 10;

/**
 * Adds a target to the record of a sleight an async sustains, or takes one off; the record goes once
 * no target is left. The record lists the sleight in the time panel and costs -10 on skill tests
 * (Core p.276). The active GM does it where this user may not.
 * @param {Object} request - actorUuid (the async), attackId, landing (on adding), targetUuid,
 *   targetName and add
 * @returns {Promise<Boolean>} True when done or handed to the GM
 */
export async function setSustainTarget({ actorUuid, attackId, landing = null, targetUuid, targetName = "", add = true }) {
    const actor = actorUuid ? await fromUuid(actorUuid) : null;
    if (!actor || !attackId) return false;
    if (!actor.isOwner) return relayToActiveGM("sustainTarget", { actorUuid, attackId, landing, targetUuid, targetName, add });
    const record = sustainRecords(actor).find(effect => effect.getFlag("eclipsephase", SUSTAIN_FLAG).attackId === attackId);
    const flag = record?.getFlag("eclipsephase", SUSTAIN_FLAG);
    const targets = (flag?.targets ?? []).filter(entry => entry.uuid !== targetUuid);
    if (add) targets.push({ uuid: targetUuid, name: targetName, warned: false });
    if (!targets.length) {
        if (record) await actor.deleteEmbeddedDocuments("ActiveEffect", [record.id], { [CASCADE_OPTION]: false });
        return true;
    }
    const sleightName = flag?.sleightName ?? landing?.name ?? "";
    const others = targets.filter(entry => entry.uuid !== actorUuid).map(entry => entry.name).join(", ");
    const name = others ? game.i18n.format("ep2e.psi.sustain.name", { sleight: sleightName, targets: others }) : game.i18n.format("ep2e.psi.sustain.nameSelf", { sleight: sleightName });
    if (record) {
        await record.update({ name, [`flags.eclipsephase.${SUSTAIN_FLAG}.targets`]: targets });
        return true;
    }
    if (!add || !landing) return true;
    await actor.createEmbeddedDocuments("ActiveEffect", [timedEffectData({
        name,
        img: landing.img,
        origin: landing.uuid,
        description: game.i18n.format("ep2e.psi.sustain.description", { sleight: sleightName }),
        flags: { effectKey: SUSTAIN_FLAG, [SUSTAIN_FLAG]: { attackId, itemId: landing.itemId ?? null, sleightName, pushRange: landing.pushRange === true, strainFamily: landing.strainFamily ?? "psi", targets } }
    })]);
    return true;
}

/**
 * The records of the sleights an actor sustains.
 * @param {Actor} actor - The async
 * @returns {ActiveEffect[]} The records
 */
export function sustainRecords(actor) {
    return Array.from(actor?.effects ?? []).filter(effect => effect.getFlag?.("eclipsephase", SUSTAIN_FLAG));
}

/**
 * The item ids of the sleights an actor sustains, for the sheet.
 * @param {Actor} actor - The async
 * @returns {Object} itemId to true
 */
export function sustainedSleights(actor) {
    return Object.fromEntries(sustainRecords(actor).map(effect => [effect.getFlag("eclipsephase", SUSTAIN_FLAG).itemId, true]).filter(([id]) => id));
}

/**
 * What an async sustains, in one line: "Sustains Psi" with the total, and per sleight its name -
 * "Mindlink x 3" when it is sustained more than once - with its share, one per line.
 * @param {Actor} actor - The async
 * @returns {Object|null} label, modifier and comment, or null when nothing is sustained
 */
export function sustainSummary(actor) {
    const counts = new Map();
    for (const effect of sustainRecords(actor)) {
        const flag = effect.getFlag("eclipsephase", SUSTAIN_FLAG);
        counts.set(flag.sleightName, (counts.get(flag.sleightName) ?? 0) + 1);
    }
    if (!counts.size) return null;
    const lines = [...counts].map(([name, count]) => `${count > 1 ? `${name} x ${count}` : name} (${SUSTAIN_MODIFIER * count})`);
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0) * SUSTAIN_MODIFIER;
    return { label: SUSTAIN_LABEL, modifier: total, comment: lines.join("\n") };
}

/**
 * What sustaining costs a roll (Core p.276): -10 per sustained sleight on every other skill test,
 * in one line as sustainSummary gives it. Aptitude checks and rep tests are no skill tests, and
 * testing a sustained sleight itself is not another test.
 * @param {Object} context - The roll context, with actor, dataset, rollType and rolledFrom
 * @returns {Object[]} { text, value, comment }, or nothing
 */
export function sustainModifiers(context) {
    const dataset = context?.dataset ?? {};
    if (String(dataset.key ?? "").startsWith("system.aptitudes.") || ["rep", "muse"].includes(context?.rollType) || context?.rolledFrom === "vehicleSkill") return [];
    const own = context?.rolledFrom === "psiSleight" ? dataset.itemid : null;
    const others = sustainRecords(context?.actor).filter(effect => !own || effect.getFlag("eclipsephase", SUSTAIN_FLAG).itemId !== own);
    if (!others.length) return [];
    const summary = sustainSummary({ effects: others });
    return [{ text: summary.label, value: summary.modifier, comment: summary.comment }];
}

/**
 * Ends what an async sustains: one record, or every record of one of their sleights. The effects it
 * left on its targets go with it.
 * @param {Actor} actor - The async
 * @param {Object} which - attackId, or itemId for every record of that sleight
 * @returns {Promise<Number>} How many records ended
 */
export async function endSustaining(actor, { attackId = null, itemId = null } = {}) {
    const records = sustainRecords(actor).filter(effect => {
        const flag = effect.getFlag("eclipsephase", SUSTAIN_FLAG);
        return (attackId && flag.attackId === attackId) || (itemId && flag.itemId === itemId);
    });
    if (!records.length) return 0;
    if (!actor.isOwner) {
        for (const record of records) relayToActiveGM("endSustain", { actorUuid: actor.uuid, attackId: record.getFlag("eclipsephase", SUSTAIN_FLAG).attackId });
        return records.length;
    }
    await actor.deleteEmbeddedDocuments("ActiveEffect", records.map(effect => effect.id));
    return records.length;
}

const SUSTAIN_END_DIALOG = "systems/eclipsephase/templates/chat/sustain-end-dialog.html";

/**
 * The targets an async sustains one of their sleights on, one entry per record and target.
 * @param {Actor} actor - The async
 * @param {String} itemId - The sleight
 * @returns {Object[]} attackId, uuid and name per target
 */
export function sustainedTargets(actor, itemId) {
    return sustainRecords(actor)
        .map(effect => effect.getFlag("eclipsephase", SUSTAIN_FLAG))
        .filter(flag => flag.itemId === itemId)
        .flatMap(flag => (flag.targets ?? []).map(entry => ({ attackId: flag.attackId, uuid: entry.uuid, name: entry.name })));
}

/**
 * Ends sustaining a sleight on some of its targets: the effects it left on them go, and the records
 * follow as their targets leave them.
 * @param {Actor} actor - The async
 * @param {Object[]} picks - attackId and uuid per target
 * @returns {Promise<Number>} How many targets it ended on
 */
export async function endSustainingOn(actor, picks) {
    for (const pick of picks) {
        await setSleightEffect({ actorUuid: pick.uuid, attackId: pick.attackId });
        if (actor?.uuid && actor.uuid !== pick.uuid) await setSleightEffect({ actorUuid: actor.uuid, attackId: pick.attackId, targetUuid: pick.uuid });
        await setSustainTarget({ actorUuid: actor.uuid, attackId: pick.attackId, targetUuid: pick.uuid, add: false });
    }
    return picks.length;
}

/**
 * Asks which targets to stop sustaining a sleight on, when it is sustained on more than one: none
 * is ticked at first, the box above the list ticks them all, and the End button waits for a tick.
 * @param {String} sleightName - The sleight
 * @param {Object[]} entries - What sustainedTargets lists
 * @returns {Promise<Object[]|null>} The picked entries, or null when cancelled
 */
export async function pickSustainedTargets(sleightName, entries) {
    const content = await foundry.applications.handlebars.renderTemplate(SUSTAIN_END_DIALOG, { sleightName, entries });
    return foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize("ep2e.psi.sustain.end") },
        classes: ["ep2e-primary-right"],
        content,
        buttons: [
            {
                action: "end",
                label: game.i18n.localize("ep2e.psi.sustain.end"),
                default: true,
                callback: (event, button) => Array.from(button.form.querySelectorAll(".ep-sustain-pick:checked")).map(box => ({ attackId: box.dataset.attackId, uuid: box.dataset.targetUuid }))
            },
            { action: "cancel", label: game.i18n.localize("ep2e.roll.dialog.button.cancel"), callback: () => null }
        ],
        render: (event, dialog) => {
            const root = dialog.element;
            const picks = Array.from(root.querySelectorAll(".ep-sustain-pick"));
            const all = root.querySelector(".ep-sustain-all");
            const end = root.querySelector('button[data-action="end"]');
            const refresh = () => {
                const ticked = picks.filter(box => box.checked).length;
                if (end) end.disabled = ticked === 0;
                if (all) {
                    all.checked = ticked === picks.length;
                    all.indeterminate = ticked > 0 && ticked < picks.length;
                }
            };
            all?.addEventListener("change", () => {
                for (const box of picks) box.checked = all.checked;
                refresh();
            });
            for (const box of picks) box.addEventListener("change", refresh);
            refresh();
        },
        modal: true,
        rejectClose: false
    });
}

/**
 * Keeps both sides of a sustained sleight together (Core p.276): when the async's record ends, the
 * effects it left on its targets go, and so do its range warnings; when a target's effect is removed, that target leaves the
 * record, and the record goes with the last. Runs on the client that deleted.
 * @param {ActiveEffect} effect - The deleted effect
 * @param {Object} options - The deletion's options
 * @param {String} userId - Who deleted it
 * @returns {Promise<void>} Resolves once the other side followed
 */
export async function followSustainEnd(effect, options, userId) {
    if (userId !== game.user.id || options?.[CASCADE_OPTION] === false) return;
    const record = effect.getFlag?.("eclipsephase", SUSTAIN_FLAG);
    if (record) {
        const asyncUuid = effect.parent?.uuid;
        for (const entry of record.targets ?? []) {
            const warning = entry.warningId ? game.messages.get(entry.warningId) : null;
            if (warning?.isOwner) await warning.delete();
            await setSleightEffect({ actorUuid: entry.uuid, attackId: record.attackId });
            if (asyncUuid && asyncUuid !== entry.uuid) await setSleightEffect({ actorUuid: asyncUuid, attackId: record.attackId, targetUuid: entry.uuid });
        }
        return;
    }
    const sleight = effect.getFlag?.("eclipsephase", SLEIGHT_FLAG);
    if (sleight?.sustained && sleight.asyncUuid && sleight.attackId) await setSustainTarget({ actorUuid: sleight.asyncUuid, attackId: sleight.attackId, targetUuid: sleight.targetUuid, add: false });
}

/**
 * How far an async may be from a target before a sustained sleight slips (Core p.276): Close range
 * plus 10 m, Close doubling where the strain family says so and with the Increased Range push.
 * @param {Actor} target - The target
 * @param {Boolean} pushRange - Whether the sleight was cast with Increased Range
 * @param {String} [family] - The sleight's strain family
 * @returns {Number} The reach in metres
 */
export function sustainReach(target, pushRange = false, family = "psi") {
    return SUSTAIN_REACH * (1 + (getStrainFamily(family).targeting.doublesRange(target) ? 1 : 0) + (pushRange ? 1 : 0)) + SUSTAIN_REACH;
}

/**
 * Warns when an async and a target they sustain a sleight on have moved too far apart: a card with
 * an End button, whispered to the async's owners and the GMs, once each time they part; the card
 * goes again once they are back in reach. Measured from the stored token positions, as soon as a
 * move is stored, whichever scene the GM is looking at, when both stand on that scene. Runs on the
 * active GM, one check after the other.
 * @param {Scene} [scene] - The scene a token moved on, the viewed one by default
 * @returns {Promise<Number>} How many warnings were posted
 */
export function checkSustainReach(scene = globalThis.canvas?.scene) {
    reachCheck = reachCheck.then(() => measureSustainReach(scene)).catch(error => {
        console.error("Eclipse Phase | Sustain range check failed", error);
        return 0;
    });
    return reachCheck;
}

let reachCheck = Promise.resolve(0);

/**
 * One pass of checkSustainReach.
 * @param {Scene} scene - The scene to measure on
 * @returns {Promise<Number>} How many warnings were posted
 */
async function measureSustainReach(scene) {
    if (!game.users?.activeGM?.isSelf || !scene) return 0;
    let warned = 0;
    const tokens = Array.from(scene.tokens ?? []);
    for (const token of tokens) {
        const actor = token.actor;
        for (const record of sustainRecords(actor)) {
            const flag = record.getFlag("eclipsephase", SUSTAIN_FLAG);
            let changed = false;
            const targets = [];
            for (const entry of flag.targets ?? []) {
                const target = fromUuidSync(entry.uuid);
                const other = tokens.find(candidate => candidate.actor?.uuid === entry.uuid) ?? null;
                if (!target || !other || other === token) { targets.push(entry); continue; }
                const distance = tokenGap(placedBox(token, scene.grid), placedBox(other, scene.grid), scene.grid);
                const reach = sustainReach(target, flag.pushRange, flag.strainFamily);
                const away = distance > reach;
                let warningId = entry.warningId ?? null;
                if (away && !entry.warned) {
                    const card = await postCard(actor, { icon: "fa-person-walking-arrow-right", headline: game.i18n.format("ep2e.psi.sustain.outOfReach", { target: target.name, async: actor.name, sleight: flag.sleightName, distance: Math.round(distance), reach }), button: { action: "endSustain", label: game.i18n.localize("ep2e.psi.sustain.end") }, actorUuid: actor.uuid }, { eclipsephase: { sustainWarning: { actorUuid: actor.uuid, attackId: flag.attackId } } }, [...new Set([...defenders(actor), ...gmList()])]);
                    warningId = card?.id ?? null;
                    warned++;
                }
                if (!away && entry.warned && warningId) {
                    await game.messages.get(warningId)?.delete();
                    warningId = null;
                }
                if (away !== !!entry.warned) changed = true;
                targets.push({ ...entry, warned: away, warningId });
            }
            if (changed) await record.update({ [`flags.eclipsephase.${SUSTAIN_FLAG}.targets`]: targets });
        }
    }
    return warned;
}

/**
 * Where a token stands: its document's stored source, since the document's own x and y follow the
 * animation and still lie at the start of the way when a move is reported.
 * @param {TokenDocument} token - The token
 * @param {Object} grid - The token's scene's grid
 * @returns {Object} An object with bounds { x, y, width, height } in pixels
 */
function placedBox(token, grid) {
    const size = Number(grid?.size) || 1;
    const place = token._source ?? token;
    return { bounds: { x: Number(place.x) || 0, y: Number(place.y) || 0, width: (Number(place.width) || 1) * size, height: (Number(place.height) || 1) * size } };
}

/**
 * Carries out a range warning card's End button.
 * @param {ChatMessage} message - The card
 * @returns {Promise<Number>} How many records ended
 */
export async function endSustainFromCard(message) {
    const warning = message?.getFlag?.("eclipsephase", "sustainWarning");
    const actor = warning?.actorUuid ? await fromUuid(warning.actorUuid) : null;
    if (!actor) return 0;
    return endSustaining(actor, { attackId: warning.attackId });
}

/**
 * The range category a distance falls into for a sleight on someone else (Core p.276-277):
 * point-blank up to 2 m (+10), close up to 10 m (+0), and -10 for every further 2 m. Against an
 * async or exsurgent every category doubles, and the Increased Range push adds its base once more
 * (point-blank 6 m and close 30 m with both). The 2 m step grows with the categories.
 * @param {Number} distance - The distance in metres
 * @param {Object} [options] - async: the target has psi; pushRange: the Increased Range push is on
 * @returns {Object} band ("pointBlank", "close" or "beyond") and modifier
 */
export function psiRangeBand(distance, { async = false, pushRange = false } = {}) {
    const factor = 1 + (async ? 1 : 0) + (pushRange ? 1 : 0);
    const metres = Math.max(0, Number(distance) || 0);
    if (metres <= 2 * factor) return { band: "pointBlank", modifier: 10 };
    if (metres <= 10 * factor) return { band: "close", modifier: 0 };
    return { band: "beyond", modifier: -10 * Math.ceil((metres - 10 * factor) / (2 * factor)) };
}

/**
 * Whether a target counts as an async for psi range: it has the Psi trait or carries a sleight.
 * @param {Actor} actor - The target
 * @returns {Boolean} True for an async
 */
export function isAsync(actor) {
    return Number(actor?.system?.additionalSystems?.hasPsi) > 0 || Array.from(actor?.items ?? []).some(item => item.type === "aspect");
}

/**
 * Whether the Increased Range push is on for a roll, chosen or as a gamma-boosted async's free push.
 * @param {Object} context - The roll context
 * @returns {Boolean} True when it is
 */
export function pushesRange(context) {
    return gammaPushes(context.actor, context.options?.push).has("range");
}

/**
 * What a psi-gamma sleight's own circumstances add to its test: +20 at touch range, otherwise the
 * range category of the farthest measured target, and what its strain family adds per target.
 * @param {Object} context - The roll context at preRoll
 * @param {Function} kindsOf - kindsOf(actor) lists what a target counts as
 * @returns {Object[]} { text, value } per modifier
 */
export function sleightModifiers(context, kindsOf) {
    const sleight = gammaSleight(context);
    if (!sleight) return [];
    const targeting = sleightTargeting(sleight);
    const modifiers = [];
    const touch = context.options?.psiTouch;
    const touching = touch === true || touch === "on";
    if (touching) modifiers.push({ text: "ep2e.roll.announce.psi.touch", value: PSI_TOUCH_MODIFIER });
    const picked = String(context.options?.preTargets || "").split(",").filter(Boolean).map(uuid => fromUuidSync(uuid)).filter(Boolean);
    const measured = measuredDistances(context.options);
    const own = target => !!context.actor?.uuid && target.uuid === context.actor.uuid;
    const targets = picked.filter(target => !own(target));
    const distances = measured.length === picked.length ? measured.filter((distance, index) => !own(picked[index])) : measured;
    if (!touching && distances.length === targets.length && targets.length) {
        const pushRange = pushesRange(context);
        const worst = targets.map((target, index) => ({ distance: distances[index], ...psiRangeBand(distances[index], { async: targeting.doublesRange(target), pushRange }) }))
            .reduce((low, entry) => entry.modifier < low.modifier ? entry : low);
        modifiers.push({ text: game.i18n.format("ep2e.roll.announce.psi.range", { band: game.i18n.localize(`ep2e.targeting.band.${worst.band}`), distance: Math.round(worst.distance) }), value: worst.modifier });
    }
    for (const modifier of targets.flatMap(target => targeting.modifiers(target, kindsOf(target)))) {
        if (!modifiers.some(entry => entry.text === modifier.text)) modifiers.push(modifier);
    }
    return modifiers;
}

/**
 * Lets psi-gamma sleights without damage of their own land on targets: each target resists with
 * WIL, and a sleight that lasts leaves its effect where it works. Damaging sleights go through the
 * damage effect instead. Registered after it.
 * @returns {void}
 */
export function registerSleightAttacks() {
    registerAttackEffect("sleight", {
        detect: context => detectSleightAttack(context, { damaging: false }),
        resolve: landSleight
    });
    Hooks.on("eclipsephase.poolResult", ({ context, newResult }) => {
        const message = context?.messageId ? game.messages.get(context.messageId) : null;
        if (message) relandAfterSpend(message, newResult);
    });
    Hooks.on("deleteActiveEffect", (effect, options, userId) => followSustainEnd(effect, options, userId));
    Hooks.on("updateToken", (token, changes) => {
        if (!("x" in (changes ?? {}) || "y" in (changes ?? {}))) return;
        checkSustainReach(token.parent);
        if (game.user.isActiveGM && token.actor) breakContact(token.actor);
    });
    registerRollBlock(blockedSkillReason);
    registerFailOption(inducedErrorFailures);
    Hooks.on("eclipsephase.preRoll", forceInducedError);
    Hooks.on("eclipsephase.postRoll", spendInducedError);
    Hooks.on("eclipsephase.postRest", actor => endLockOuts(actor));
}

// The flag of the effect that keeps an async out of a mind, and the effect's icon.
export const LOCK_OUT_FLAG = "psiLockOut";
const LOCK_OUT_ICON = "icons/svg/padlock.svg";

/**
 * Whether an async is locked out of a target's mind (Core p.276): the target defended against them
 * with a critical success, and they have not recharged since.
 * @param {Actor} actor - The async
 * @param {Actor} target - The target
 * @returns {Boolean} True when they may not target that mind
 */
export function lockedOutOf(actor, target) {
    const uuid = target?.uuid;
    return !!uuid && Array.from(actor?.effects ?? []).some(effect => effect.getFlag?.("eclipsephase", LOCK_OUT_FLAG)?.targetUuid === uuid);
}

/**
 * A picker's refusal of the minds an async is locked out of.
 * @param {Actor} actor - The async
 * @returns {Function} refuse(token) for pickTokensOnCanvas
 */
export function refuseLockedOut(actor) {
    return token => token.actor && lockedOutOf(actor, token.actor) ? game.i18n.format("ep2e.targeting.lockedOut", { name: token.actor.name }) : null;
}

/**
 * Locks an async out of a target's mind after the target's critical defence, or lifts the lock
 * again when a pool point turned that defence. The active GM does it where this user may not.
 * @param {Object} lock - actorUuid (the async), targetUuid, attackId, locked
 * @returns {Promise<Boolean>} True when done or handed to the GM
 */
export async function setLockOut({ actorUuid, targetUuid, attackId, locked }) {
    const actor = actorUuid ? await fromUuid(actorUuid) : null;
    if (!actor || !targetUuid) return false;
    if (!actor.isOwner) return relayToActiveGM("psiLockOut", { actorUuid, targetUuid, attackId, locked });
    const same = Array.from(actor.effects).filter(effect => {
        const flag = effect.getFlag?.("eclipsephase", LOCK_OUT_FLAG);
        return flag?.targetUuid === targetUuid && flag?.attackId === attackId;
    });
    if (!locked) {
        if (same.length) await actor.deleteEmbeddedDocuments("ActiveEffect", same.map(effect => effect.id));
        return true;
    }
    if (same.length) return true;
    const target = await fromUuid(targetUuid);
    const name = target?.name ?? "";
    await actor.createEmbeddedDocuments("ActiveEffect", [timedEffectData({
        name: game.i18n.format("ep2e.psi.lockOut.name", { target: name }),
        img: LOCK_OUT_ICON,
        description: game.i18n.format("ep2e.psi.lockOut.description", { target: name }),
        flags: { [LOCK_OUT_FLAG]: { targetUuid, attackId } }
    })]);
    return true;
}

/**
 * Lifts every lock-out of an async, as their recharge does.
 * @param {Actor} actor - The async
 * @returns {Promise<Number>} How many were lifted
 */
export async function endLockOuts(actor) {
    const locks = Array.from(actor?.effects ?? []).filter(effect => effect.getFlag?.("eclipsephase", LOCK_OUT_FLAG));
    if (!locks.length || !actor.isOwner) return 0;
    await actor.deleteEmbeddedDocuments("ActiveEffect", locks.map(effect => effect.id));
    return locks.length;
}

// A sleight used by touch on someone who would rather not be touched (Core p.276): the async first
// lands a touch-only melee attack (+20, no damage) that the target may Fray against; a card then
// offers the sleight at touch range (+20), or, when the touch failed, at point-blank (+10).
export const PSI_TOUCH_TEMPLATE = "systems/eclipsephase/templates/chat/psi-touch.html";

// The outcomes after which a touch card offers its sleight: touched, or avoided or missed, which
// leave point-blank.
const TOUCH_SETTLED = ["touched", "avoided", "missed"];

registerCard("psiTouch", {
    render: renderTouchCard,
    mutations: { used: state => ({ ...state, used: true }) }
});

/**
 * Draws the card that follows a touch attack: what became of the touch, and the sleight to use.
 * @param {Object} state - The card's psiTouch flag
 * @returns {Promise<String>} The markup
 */
export function renderTouchCard(state) {
    const outcome = state.outcome;
    return foundry.applications.handlebars.renderTemplate(PSI_TOUCH_TEMPLATE, {
        headline: game.i18n.format("ep2e.chat.psiTouch.headline", { sleight: state.sleightName }),
        status: game.i18n.format(`ep2e.chat.psiTouch.${outcome}`, { target: state.targetName }),
        button: TOUCH_SETTLED.includes(outcome)
            ? game.i18n.format(outcome === "touched" ? "ep2e.chat.psiTouch.useTouch" : "ep2e.chat.psiTouch.usePointBlank", { sleight: state.sleightName })
            : "",
        used: state.used === true,
        actorUuid: state.actorUuid
    });
}

/**
 * Whether a sleight's roll has to start with a touch attack: a psi-gamma sleight with Touch ticked,
 * aimed at a target who is not willing, and not already past its touch.
 * @param {Object} rollContext - The roll context
 * @param {Object} values - What the dialog returned
 * @returns {Boolean} True when the touch comes first
 */
export function touchComesFirst(rollContext, values) {
    return !!gammaSleight(rollContext) && isChecked(values?.psiTouch) && !isChecked(values?.willing)
        && values?.touchSettled !== true && chosenTargets(values).length > 0;
}

/**
 * Starts a sleight with its touch attack: a melee test at +20 against the picked target, who gets
 * the usual card to defend from. The melee dialog is shown with the target already chosen. The
 * sleight's own dialog values ride along, so it can be used afterwards without asking again.
 * @param {Object} rollContext - The sleight's roll context
 * @param {Object} values - What the sleight's dialog returned
 * @returns {Promise<Boolean>} True when the touch attack was started
 */
export async function startTouch(rollContext, values) {
    if (!touchComesFirst(rollContext, values)) return false;
    const actor = rollContext.actor;
    const sleight = gammaSleight(rollContext);
    const [target] = chosenTargets(values);
    const dataset = {
        name: game.i18n.localize("ep2e.skills.vigorSkills.melee"),
        key: "melee",
        type: "skill",
        rollvalue: actor.system.skillsVig?.melee?.roll ?? 0,
        pooltype: "Vigor",
        contextFlags: {
            targetedAttack: {
                effect: "touch",
                targets: 1,
                area: false,
                labelKey: "",
                weaponName: sleight.name,
                effectLabel: game.i18n.format("ep2e.chat.defence.touchLabel", { name: sleight.name }),
                cursor: PSI_CURSOR,
                strainFamily: sleight.system.strainFamily ?? "psi",
                preTargets: [target],
                payload: { sleightName: sleight.name, dataset: storable(rollContext.dataset), options: storable(values) }
            }
        }
    };
    await RollCheck(dataset, actor.system, actor, {}, null, "skill");
    return true;
}

/**
 * The card that follows a touch attack, once posted.
 * @param {Object} attack - The touch attack
 * @returns {ChatMessage|undefined} The card
 */
function touchCardFor(attack) {
    return game.messages.find(message => message.getFlag?.("eclipsephase", "psiTouch")?.attackId === attack.id);
}

/**
 * Sets the card that follows a touch attack, posting it the first time. It is seen as the sleight's
 * own roll would be - public, private or blind as chosen in the sleight's dialog - not as the melee
 * test, so the touch does not give the psi away.
 * @param {Object} attack - The touch attack
 * @param {ChatMessage|null} card - The attack card, whose speaker the follow-up shares
 * @param {Object} change - outcome ("touched", "avoided" or "missed") and the target
 * @returns {Promise<ChatMessage|Boolean>} The card posted, or whether it was changed
 */
export async function setTouchCard(attack, card, { outcome, target }) {
    const existing = touchCardFor(attack);
    if (existing) return updateCard(existing, "psiTouch", "merge", { outcome });
    const state = {
        attackId: attack.id,
        actorUuid: attack.actorUuid,
        sleightName: attack.payload?.sleightName ?? attack.weaponName,
        targetUuid: target?.uuid ?? "",
        targetName: target?.name ?? "",
        outcome,
        used: false,
        dataset: attack.payload?.dataset ?? {},
        options: attack.payload?.options ?? {}
    };
    const { blind, recipientList } = inheritChatVisibility(null, state.options.rollMode);
    return ChatMessage.create({
        speaker: card?.speaker ?? ChatMessage.getSpeaker(),
        content: await renderCard("psiTouch", state),
        whisper: recipientList.length ? recipientList : null,
        blind,
        flags: { eclipsephase: { psiTouch: state } }
    });
}

/**
 * Uses the sleight a touch card offers, once: at touch range when the touch landed, at point-blank
 * when it did not, with the dialog values chosen before the touch.
 * @param {ChatMessage} message - The touch card
 * @returns {Promise<Boolean>} True when the sleight was rolled
 */
export async function useSleightAfterTouch(message) {
    const state = message?.getFlag?.("eclipsephase", "psiTouch");
    if (!state || state.used || !TOUCH_SETTLED.includes(state.outcome)) return false;
    const actor = await fromUuid(state.actorUuid);
    if (!actor?.isOwner) return false;
    await updateCard(message, "psiTouch", "used");
    const touched = state.outcome === "touched";
    await RollCheck(state.dataset, actor.system, actor, {
        skipDialog: true,
        presetOptions: { ...state.options, psiTouch: touched, measuredRanges: touched ? "" : "2", preTargets: state.targetUuid, touchSettled: true }
    }, null, "psiSleight");
    return true;
}

/**
 * Lets touch attacks lead to their sleight. A melee test rolled with Touch Attack unticked is no
 * touch: it carries no attack, and no card follows. Once the target has defended, a card offers it at touch
 * range or at point-blank, and changes when a pool point turns the defence around. A touch attack
 * that misses offers point-blank at once; a pool point that turns it into a hit takes that card
 * back, and the defence brings a new one.
 * @returns {void}
 */
export function registerPsiTouch() {
    Hooks.on("eclipsephase.preRoll", context => {
        if (context?.flags?.targetedAttack?.effect === "touch" && !isChecked(context.options?.touchOnly)) delete context.flags.targetedAttack;
    });
    registerAttackEffect("touch", {
        resolve: async (attack, target, outcome) => {
            await setTouchCard(attack, game.messages.get(attack.messageId) ?? null, { outcome: outcome === "hit" ? "touched" : "avoided", target });
        }
    });
    Hooks.on("eclipsephase.postRoll", async context => {
        const attack = context?.flags?.targetedAttack;
        if (attack?.effect !== "touch" || !context.message) return;
        const target = attack.preTargets?.[0] ? await fromUuid(attack.preTargets[0]) : null;
        if (!isHit(context.outputData?.alternatives?.originalResult)) await setTouchCard(attack, context.message, { outcome: "missed", target });
    });
    Hooks.on("eclipsephase.poolResult", async ({ context, newResult }) => {
        const attack = context?.targetedAttack;
        if (attack?.effect !== "touch" || !isHit(newResult)) return;
        await touchCardFor(attack)?.delete();
    });
}


/**
 * A sleight that works like a shock attack - Short Circuit, Ki's Cold Start (Core p.219): the target
 * falls prone, is incapacitated for 1 action turn plus 2 per superior success, and stunned for 3
 * minutes; a card says so, seen as the attack was.
 * @param {Object} context - attack, target, landing and result
 * @returns {Promise<Object[]>} The conditions put on
 */
export async function landShock({ attack, target, landing, result }) {
    const conditions = shockConditions(superiorResults(result, attack?.roll?.value));
    for (const { id, span } of conditions) await inflictCondition(target, id, { span, flags: { sleightShock: attack?.id ?? null } });
    await postLandingOutcome(attack, target, landing, game.i18n.format("ep2e.chat.strike.outcome", { name: target.name, conditions: conditionNames(conditions) }));
    return conditions;
}

/**
 * A sleight that works like a pain effect - Pain (Core p.216): -20 until the end of the next turn,
 * -10 with Pain Tolerance I, and the target flees with its next action; Pain Tolerance II shrugs it
 * off. The target already resisted the sleight, so no further check is asked.
 * @param {Object} context - attack, target and landing
 * @returns {Promise<Boolean>} True when the pain took hold
 */
export async function landPain({ attack, target, landing }) {
    const tolerance = Number(target.system?.additionalSystems?.painTolerance) || 0;
    if (tolerance >= 2) {
        await postLandingOutcome(attack, target, landing, game.i18n.format("ep2e.chat.strike.immune", { name: target.name, effect: game.i18n.localize("ep2e.chat.strike.pain.name") }));
        return false;
    }
    await sufferPain(target, tolerance);
    await postLandingOutcome(attack, target, landing, game.i18n.format("ep2e.chat.strike.flee", { name: target.name }));
    return true;
}

/**
 * Posts what a sleight's landing did on a card, seen as the attack card was.
 * @param {Object} attack - The attack
 * @param {Actor} target - The target
 * @param {Object} landing - What sleightLanding read
 * @param {String} headline - What happened
 * @returns {Promise<ChatMessage>} The card
 */
function postLandingOutcome(attack, target, landing, headline) {
    const origin = attack?.messageId ? game.messages.get(attack.messageId) : null;
    return postCard(target, { icon: "fa-brain", color: "--iconBlue", headline, rows: [{ label: game.i18n.localize("ep2e.psi.sleightLabel"), value: landing.name }] }, {}, followUpVisibility(origin, [target]).whisper);
}

/**
 * Asks which sense a sleight takes - Block Sense, Ki's Blackout.
 * @param {Object} context - target and request
 * @returns {Promise<Boolean>} True when something was chosen
 */
async function chooseSense({ request }) {
    const entries = SENSES.map(id => ({ id, label: game.i18n.localize(`ep2e.psi.sense.${id}`) }));
    const sense = await searchableListSelection(entries, "ep2e.psi.choice.senseHeader", "ep2e.psi.choice.senseCopy");
    if (sense?.cancelled || !sense?.selection) return false;
    return applySleightChoice({ ...request, sense: sense.selection });
}

/**
 * Takes a sense from a sleight's target (Core p.282): lost sight is Blinded, lost hearing Deafened;
 * any other sense costs -30 on the actions that rely on it, offered on every roll.
 * @param {ActiveEffect} effect - The sleight's effect on the target
 * @param {String} sense - A key of SENSES
 * @param {String} sleightName - The sleight
 * @param {Actor} target - The target
 * @returns {Promise<String>} The card's text
 */
export async function loseSense(effect, sense, sleightName, target) {
    const label = game.i18n.localize(`ep2e.psi.sense.${sense}`);
    const name = game.i18n.format("ep2e.psi.choice.effectName", { sleight: sleightName, skill: label });
    const condition = SENSE_CONDITIONS[sense] ?? null;
    const flag = effect.getFlag("eclipsephase", SLEIGHT_FLAG);
    const rollOptions = condition ? flag.rollOptions ?? [] : [...(flag.rollOptions ?? []), { id: "lostSense", label: game.i18n.format("ep2e.psi.option.lostSense", { sense: label }), value: LOST_SENSE_MODIFIER, appliesTo: [] }];
    const changes = condition ? conditionStatusEffects().find(status => status.id === condition).changes : [];
    await effect.update({
        name,
        ...(condition ? { img: conditionEntry(condition).img, statuses: [condition], showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, "system.changes": [...(effect.changes ?? []), ...changes] } : {}),
        [`flags.eclipsephase.${SLEIGHT_FLAG}.name`]: name,
        [`flags.eclipsephase.${SLEIGHT_FLAG}.choice`]: { rule: "loseSense", sense },
        [`flags.eclipsephase.${SLEIGHT_FLAG}.rollOptions`]: rollOptions
    });
    return game.i18n.format("ep2e.psi.choice.senseChosen", { sleight: sleightName, target: target.name, sense: label });
}

/**
 * Ends the sleights held on an actor by eye contact - Basilisk Stare - once it is attacked or moved
 * (Core p.281): the async stops sustaining them, which takes the effects off both sides, and a card
 * says the contact is lost.
 * @param {Actor} actor - The actor attacked or moved
 * @param {Object} [options] - except: the attack whose own sleight it is, which does not break it
 * @returns {Promise<Number>} How many ended
 */
export async function breakContact(actor, { except = null } = {}) {
    const held = Array.from(actor?.effects ?? []).map(effect => effect.getFlag?.("eclipsephase", SLEIGHT_FLAG)).filter(flag => flag?.breaksContact && (!except || flag.attackId !== except));
    for (const flag of held) {
        const async = flag.asyncUuid ? await fromUuid(flag.asyncUuid) : null;
        const ended = async && flag.attackId ? await endSustaining(async, { attackId: flag.attackId }) : 0;
        if (!ended) await setSleightEffect({ actorUuid: actor.uuid, attackId: flag.attackId, targetUuid: flag.targetUuid });
        await postCard(actor, { icon: "fa-eye-slash", color: "--iconBlue", headline: game.i18n.format("ep2e.psi.contactLost", { sleight: flag.sleightName, target: actor.name }) });
    }
    return held.length;
}
