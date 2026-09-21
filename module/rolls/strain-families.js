const strainFamilies = new Map();

const MISSING_FAMILY_KEY = "ep2e.roll.announce.strainFamilyMissing";

const PERMISSIVE_SUBSTRATE = () => ({ blocked: false, jamBlocked: false, penalised: false, reasonKey: "", tooltipKey: "" });

const MISSING_SUBSTRATE = () => ({ blocked: true, jamBlocked: false, penalised: false, reasonKey: MISSING_FAMILY_KEY, tooltipKey: MISSING_FAMILY_KEY });

/**
 * Reports a rejected registration without throwing, so one broken module cannot stop the system
 * from loading.
 * @param {String} what - The registration that was rejected
 * @param {String} reason - Why it was rejected
 * @returns {Boolean} Always false, so callers can return it directly
 */
function reject(what, reason) {
  console.error(`Eclipse Phase | ${what} was not registered: ${reason}`);
  return false;
}

/**
 * Registers a strain family, so everything that differs between Psi and Ki is described in one
 * entry instead of branched on by id. Only the differences belong here - infection rate, push
 * economy, the Chi and Gamma mechanics and the aspect item type are shared by every family.
 * @param {String} id - The value a sleight carries in system.strainFamily
 * influence(result, {strainLabel, archetypeData, actorModel}) returns what the infection card should
 * say - {label, copy, withRule} - or null when the family has nothing for that result. Every family
 * resolves its own, so no family is ever routed into another's rules.
 * @param {String} id - The value a sleight carries in system.strainFamily
 * @param {Object} definition - May hold label, tabLabel, substrate, subStrains, influence, tierTraits, feedback, mismatchKey, dataPath and detailsPartial
 * @returns {Boolean} Whether the family was registered
 */
export function registerStrainFamily(id, definition = {}) {
  if (typeof id !== "string" || !id) return reject("A strain family", "its id must be a non-empty string");
  if (strainFamilies.has(id)) return reject(`Strain family "${id}"`, "that id is already taken");
  if (definition.substrate !== undefined && typeof definition.substrate !== "function") {
    return reject(`Strain family "${id}"`, "substrate must be a function");
  }

  strainFamilies.set(id, {
    id,
    label: definition.label ?? "",
    tabLabel: definition.tabLabel ?? "",
    substrate: definition.substrate ?? PERMISSIVE_SUBSTRATE,
    subStrains: definition.subStrains ?? {},
    influence: typeof definition.influence === "function" ? definition.influence : null,
    tierTraits: definition.tierTraits ?? {},
    feedback: definition.feedback ?? { target: "physical", copyKey: "" },
    mismatchKey: definition.mismatchKey ?? "",
    dataPath: definition.dataPath ?? "system.subStrain.byArchetype",
    detailsPartial: definition.detailsPartial ?? ""
  });
  return true;
}

/**
 * The definition registered for one strain family. A family a sleight names but nobody registered
 * answers with a missing marker rather than undefined, so every caller has something to branch on
 * and can refuse the roll instead of quietly treating it as Psi.
 * @param {String} id - The strain family id
 * @returns {Object} The definition, or an object carrying missing: true
 */
export function getStrainFamily(id) {
  return strainFamilies.get(id) ?? { id, missing: true, substrate: MISSING_SUBSTRATE, tierTraits: {}, subStrains: {}, influence: null, mismatchKey: "", dataPath: "", detailsPartial: "" };
}

/**
 * Every registered strain family, in registration order.
 * @returns {Object[]} The definitions
 */
export function listStrainFamilies() {
  return Array.from(strainFamilies.values());
}

/**
 * Whether a family is registered at all.
 * @param {String} id - The strain family id
 * @returns {Boolean} True when a definition exists
 */
export function hasStrainFamily(id) {
  return strainFamilies.has(id);
}

/**
 * Drops every registration. Only for tests, which need a clean registry per case.
 * @returns {void}
 */
export function resetStrainFamilies() {
  strainFamilies.clear();
}

/**
 * Registers the families the core system owns. Psi stays here for good; Ki is registered here for
 * now and moves into its own module unchanged, which is why both blocks reach the body helpers
 * through the public API instead of importing them - that also keeps this file from importing the
 * one that dispatches to it.
 * @returns {void}
 */
export function registerCoreStrainFamilies() {
  registerStrainFamily("psi", {
    label: "ep2e.item.aspect.table.family.psi",
    tabLabel: "ep2e.actorSheet.rightTabs.psiTab",
    substrate(actor) {
      const { sleevedNervousSystem, chainHasWareMarker, CYBERBRAIN_MARKER } = game.eclipsephase.api.actors;
      const nervousSystem = sleevedNervousSystem(actor);
      const jamBlocked = !!actor?.system?.activeJam ||
        !!foundry.utils.getProperty(actor, "flags.eclipsephase.psiJamSuppression");
      const blocked = jamBlocked || nervousSystem === "info" || chainHasWareMarker(actor, CYBERBRAIN_MARKER);
      return {
        blocked,
        jamBlocked,
        penalised: !blocked && nervousSystem === "synth",
        reasonKey: jamBlocked ? "ep2e.roll.announce.jamming.noPsi" : "ep2e.roll.announce.psi.noBioBrain",
        tooltipKey: jamBlocked ? "ep2e.roll.announce.jamming.noPsiTooltip" : "ep2e.roll.announce.psi.substrateBlockedTooltip"
      };
    },
    subStrains: CONFIG.eclipsephase.strains,
    influence(result, { strainLabel, archetypeData, actorModel }) {
      const labels = CONFIG.eclipsephase.psiStrainLabels;

      if (strainLabel === "custom") {
        const custom = actorModel?.strainInfluence?.["influence" + result];
        if (!custom) return null;
        return { label: CONFIG.eclipsephase.otherPsiLabels[custom.label], copy: custom.description, withRule: false };
      }

      if (result === 1) return { label: "ep2e.psi.effect.physicalDamage", copy: "ep2e.psi.effect.takeDamage", withRule: true };

      const slot = archetypeData?.["influence" + result];
      if (!slot) return null;

      if (result <= 3) {
        if (slot.label === "restrictedBehaviour" && strainLabel === "architect") {
          return { label: labels[slot.label], copy: "ep2e.psi.effect.restrictedBehaviour.relaxation", withRule: true };
        }
        if (slot.label === "restrictedBehaviour" && strainLabel === "haunter") {
          return { label: labels[slot.label], copy: "ep2e.psi.effect.restrictedBehaviour.empathy", withRule: true };
        }
        if (strainLabel === "xenomorph") {
          return { label: labels.enhancedBehaviour, copy: "ep2e.psi.effect.enhancedBehaviour." + slot.description, withRule: true };
        }
        return { label: labels[slot.label], copy: "ep2e.psi.effect." + slot.label + "." + slot.description, withRule: true };
      }

      if (result === 6 && strainLabel === "beast") return { copy: "ep2e.psi.effect.frenzy", withRule: true };
      if (result === 6 && strainLabel === "haunter") return { copy: "ep2e.psi.effect.hallucination", withRule: true };

      return { label: "ep2e.psi.effect.motivation.label", copy: "ep2e.psi.effect.motivation." + slot.description, withRule: true };
    },
    tierTraits: {
      1: { name: "Psi I", pack: "eclipsephase.traits" },
      2: { name: "Psi II", pack: "eclipsephase.traits" }
    },
    feedback: { target: "physical", copyKey: "ep2e.psi.effect.takeDamage" },
    mismatchKey: "ep2e.roll.announce.psi.substrateMismatch",
    dataPath: "system.subStrain.byArchetype",
    detailsPartial: "systems/eclipsephase/templates/actor/partials/tabs/strain-details-psi.html"
  });

  registerStrainFamily("ki", {
    label: "ep2e.item.aspect.table.family.ki",
    tabLabel: "ep2e.actorSheet.rightTabs.kiTab",
    substrate(actor) {
      const { sleevedNervousSystem, chainHasWareMarker, CYBERBRAIN_MARKER } = game.eclipsephase.api.actors;
      const nervousSystem = sleevedNervousSystem(actor);
      const blocked = nervousSystem === "info" || !chainHasWareMarker(actor, CYBERBRAIN_MARKER);
      return {
        blocked,
        jamBlocked: false,
        penalised: !blocked && nervousSystem === "bio",
        reasonKey: "ep2e.roll.announce.ki.noCyberbrain",
        tooltipKey: "ep2e.roll.announce.ki.substrateBlockedTooltip"
      };
    },
    subStrains: CONFIG.eclipsephase.kiStrains,
    influence(result, { strainLabel, archetypeData }) {
      if (result === 1) return { label: "ep2e.ki.effect.cognitiveFeedback", copy: "ep2e.ki.effect.takeStrain", withRule: true };

      const row = CONFIG.eclipsephase.kiInfluence[strainLabel]?.[result];
      const choice = archetypeData?.["influence" + result]?.description;
      const copy = row?.base ? (choice && choice !== "none" ? row.base + "." + choice : "") : row?.copy;

      return { label: row?.label, copy, withRule: true };
    },
    tierTraits: {
      1: { name: "Ki I", pack: "eclipsephase.traits" },
      2: { name: "Ki II", pack: "eclipsephase.traits" }
    },
    feedback: { target: "mental", copyKey: "ep2e.ki.effect.takeStrain" },
    mismatchKey: "ep2e.roll.announce.ki.substrateMismatch",
    dataPath: "flags.eclipsephase-ki.subStrain",
    detailsPartial: "systems/eclipsephase/templates/actor/partials/tabs/strain-details-ki.html"
  });
}
