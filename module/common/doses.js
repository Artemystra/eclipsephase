import { drugVector, doseOnset } from "./drugs.js";
import { durationRunOut } from "./time.js";
import { sleevedNervousSystem, chainHasWareMarker, CYBERBRAIN_MARKER } from "./body-markers.js";
import { consumeDose } from "./general-sheet-functions.js";

// What a drug's type can act on (Core p.330): biochem and nano are substances and need a
// biological body; an electronic drug is software and needs an infomorph or a cyberbrain.
const SUBSTANCE_TYPES = ["biochem", "nano"];

/**
 * Whether a drug can act on the body the ego currently acts through, and why not when it cannot.
 * A drug with no type recorded is not gated, so a homebrew one keeps working. Guards taking only -
 * loading a sprayer is never gated, since the pack is not being used on the loader.
 * @param {Actor} actor - The actor about to take the dose
 * @param {Item} item - The drug
 * @returns {Object} allowed, plus the localization key explaining a refusal
 */
export function doseSubstrate(actor, item) {
  const type = item?.system?.drugType;
  const nervousSystem = sleevedNervousSystem(actor);

  if (type === "electronic") {
    const allowed = nervousSystem === "info" || chainHasWareMarker(actor, CYBERBRAIN_MARKER);
    return { allowed, reasonKey: allowed ? null : "ep2e.actorSheet.warnings.doseNeedsCyberbrain" };
  }

  if (SUBSTANCE_TYPES.includes(type)) {
    const allowed = nervousSystem === "bio";
    return { allowed, reasonKey: allowed ? null : "ep2e.actorSheet.warnings.doseNeedsBiomorph" };
  }

  return { allowed: true, reasonKey: null };
}

/**
 * The changes a drug's own blueprint effects describe, which a dose copies onto the actor. The
 * blueprints themselves never apply from the item.
 * @param {Item} item - The drug
 * @returns {Object[]} Every change, in blueprint order
 */
function blueprintChanges(item) {
  return item.effects.map(effect => effect.changes ?? []).flat();
}

/**
 * The effect one dose of a drug puts on the actor. Modelled on the chi push: an explicit start,
 * expiry on the world clock rather than on a combat turn, no token icon, and the drug's own
 * description so the Time Panel has something to show. A drug with no duration recorded runs until
 * somebody ends it, which is what the book's "Permanent" and "-" mean.
 * @param {Item} item - The drug
 * @returns {Object} The ActiveEffect data
 */
export function doseEffectData(item) {
  const system = item.system;
  const changes = blueprintChanges(item);
  const span = system.duration;
  const timed = Number.isFinite(span?.value) && span.value > 0 && !!span.units;

  return {
    name: item.name,
    img: item.img,
    origin: item.uuid,
    description: system.description ?? "",
    disabled: false,
    transfer: false,
    changes,
    system: { changes },
    duration: timed ? { value: span.value, units: span.units, expiry: null } : { value: null, expiry: null },
    start: ActiveEffect.getEffectStart(),
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER,
    flags: {
      eclipsephase: {
        dose: {
          itemId: item.id,
          name: item.name,
          category: system.category ?? "",
          drugType: system.drugType ?? "",
          vector: drugVector(system)?.key ?? null,
          onset: doseOnset(system),
          wearOff: system.wearOff?.sv ?? "",
          rollOptions: Array.isArray(system.rollOptions) ? system.rollOptions : [],
          blocksPsi: system.blocksPsi === true
        }
      }
    }
  };
}

/**
 * The dose of a drug already running on the actor, if there is one. Keyed on the drug's name, so a
 * pack bought in another form still counts as the same drug - the book does not stack a drug with
 * itself.
 * @param {Actor} actor - The actor to look on
 * @param {String} drugName - The drug's name
 * @returns {ActiveEffect|null} The running dose, or null
 */
export function activeDoseFor(actor, drugName) {
  return actor.effects.find(effect =>
    effect.getFlag?.("eclipsephase", "dose")?.name === drugName && !durationRunOut(effect)) ?? null;
}

/**
 * Takes one dose of a drug: refuses it in a body it cannot act on, spends it from the pack, and
 * puts the dose's effect on the actor - or, when the same drug is already running, restarts that
 * effect's clock instead of stacking a second one. The effect data is read before the dose is
 * spent, because the last dose takes the drug itself off the sheet.
 * @param {Actor} actor - The actor taking the dose
 * @param {Item} item - The drug
 * @returns {Promise<Object>} taken and emptied as consumeDose reports them, refused when the body
 *   would not take it, and the effect now running
 */
export async function takeDose(actor, item) {
  const substrate = doseSubstrate(actor, item);
  if (!substrate.allowed) {
    ui.notifications.warn(game.i18n.localize(substrate.reasonKey));
    return { taken: false, emptied: false, refused: true, effect: null };
  }

  const running = activeDoseFor(actor, item.name);
  const data = doseEffectData(item);
  const outcome = await consumeDose(actor, item);
  if (!outcome.taken) {
    ui.notifications.warn(game.i18n.format("ep2e.actorSheet.warnings.noDosesLeft", { name: item.name }));
    return { ...outcome, refused: false, effect: null };
  }

  if (running) {
    await running.update({ start: ActiveEffect.getEffectStart(), "duration.expired": false });
    return { ...outcome, refused: false, effect: running };
  }

  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return { ...outcome, refused: false, effect };
}

/**
 * Removes every dose whose duration has run out, called from the actor's effect-duration hook on
 * the GM's client. Foundry's expiry only marks an effect; taking it off the actor is the system's
 * job, and the wear-off card hangs on exactly that deletion.
 * @param {Actor} actor - The actor whose effects were refreshed
 * @param {ActiveEffect[]} effects - The effects whose remaining duration changed
 * @returns {Promise<void>} Resolves once every run-out dose is gone
 */
export async function endRunOutDoses(actor, effects) {
  const runOut = effects.filter(effect =>
    effect.getFlag?.("eclipsephase", "dose") !== undefined && durationRunOut(effect));

  if (runOut.length) await actor.deleteEmbeddedDocuments("ActiveEffect", runOut.map(effect => effect.id));
}
