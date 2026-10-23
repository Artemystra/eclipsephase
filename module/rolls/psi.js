import { eclipsephase } from "../config.js";
import { TaskRollModifier, TaskRoll, TASK_RESULT, TASK_RESULT_TEXT, rollCalc, TASK_RESULT_OUTPUT, PSI_INFLUENCE_OUTPUT, WEAPON_DAMAGE_OUTPUT, rollToChat} from "./dice.js";
import * as pools from "./pools.js";
import { gmList, prepareRecipients, inheritChatVisibility, readRollContext } from "../common/general-sheet-functions.js";
import { effectRuleKey } from "../common/general-helper-functions.js";
import { getStrainFamily, listStrainFamilies } from "./strain-families.js";
import { durationRunOut } from "../common/time.js";
import { strainSubstrate } from "../common/morp-functions.js";
import { registerAttackEffect } from "./attacks.js";
import { noteDefence } from "./damage.js";

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
    return Math.max(1, Math.floor((actorWhole?.system?.aptitudes?.wil?.value ?? 0) / 5));
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
export const PSI_UNSUITABLE = ["synthmorph", "infomorph", "bot", "vehicle"];
const PSI_CYBERBRAIN_MODIFIER = -30;
const PSI_TOUCH_MODIFIER = 20;

/**
 * The psi-gamma sleight a roll uses, or null for any other roll.
 * @param {Object} context - The roll context, with actor and dataset
 * @returns {Item|null} The sleight
 */
export function gammaSleight(context) {
    if (context?.rolledFrom !== "psiSleight") return null;
    const sleight = context.actor?.items?.get?.(context.dataset?.itemid);
    return sleight?.system?.psiType === "gamma" ? sleight : null;
}

/**
 * Whether a sleight deals damage or stress of its own.
 * @param {Item} sleight - The sleight
 * @returns {Boolean} True when it names a damage value
 */
export function sleightDamages(sleight) {
    const damage = sleight?.system?.damage;
    return !!(damage?.d10 || damage?.d6 || damage?.bonus);
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
    const push = context.options?.push;
    return {
        targets: push === "target" ? 2 : 1,
        area: false,
        labelKey: "ep2e.chat.attack.chooseTarget",
        cursor: PSI_CURSOR,
        unsuitable: PSI_UNSUITABLE,
        willing: context.options?.willing === true || context.options?.willing === "on",
        payload: {
            armorUsed: "mental",
            armorPiercing: push === "penetration",
            halveWill: push === "power",
            damageTarget: sleight.system.damage?.target === "mental" ? "mental" : "physical"
        }
    };
}

/**
 * What a psi-gamma sleight's own circumstances add to its test: +20 at touch range, -30 against a
 * target who runs a cyberbrain.
 * @param {Object} context - The roll context at preRoll
 * @param {Function} kindsOf - kindsOf(actor) lists what a target counts as
 * @returns {Object[]} { text, value } per modifier
 */
export function sleightModifiers(context, kindsOf) {
    if (!gammaSleight(context)) return [];
    const modifiers = [];
    const touch = context.options?.psiTouch;
    if (touch === true || touch === "on") modifiers.push({ text: "ep2e.roll.announce.psi.touch", value: PSI_TOUCH_MODIFIER });
    const targets = String(context.options?.preTargets || "").split(",").filter(Boolean).map(uuid => fromUuidSync(uuid)).filter(Boolean);
    if (targets.some(target => kindsOf(target).includes("cyberbrain"))) modifiers.push({ text: "ep2e.roll.announce.psi.cyberbrain", value: PSI_CYBERBRAIN_MODIFIER });
    return modifiers;
}

/**
 * Lets psi-gamma sleights without damage of their own land on targets: each target resists with
 * WIL, and the outcome stays on the cards - what the sleight does is the GM's to apply. Damaging
 * sleights go through the damage effect instead. Registered after it.
 * @returns {void}
 */
export function registerSleightAttacks() {
    registerAttackEffect("sleight", {
        detect: context => detectSleightAttack(context, { damaging: false }),
        resolve: noteDefence
    });
}
