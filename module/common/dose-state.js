// What the doses running on an actor do to it beyond their effect changes - kept apart from
// doses.js so the strain families and the roll pipeline can read it without importing the dose
// machinery, which imports them.

/**
 * The dose flags of every dose currently acting on the actor.
 * @param {Actor} actor - The actor
 * @returns {Object[]} One dose flag per running dose
 */
export function runningDoses(actor) {
  const doses = [];
  for (const effect of actor?.effects ?? []) {
    const dose = effect.getFlag?.("eclipsephase", "dose");
    if (dose && effect.active) doses.push(dose);
  }
  return doses;
}

/**
 * The drug blocking the actor's psi, if any - Inhibitor after a failed WIL Check.
 * @param {Actor} actor - The actor
 * @returns {String|null} The drug's name, or null when nothing blocks
 */
export function drugBlockingPsi(actor) {
  return runningDoses(actor).find(dose => dose.blocksPsi === true)?.name ?? null;
}

/**
 * The healing addition a running dose stands for - Meds - which the healing dialog starts on.
 * @param {Actor} actor - The actor
 * @returns {String} The addition's key, or "" when no dose stands for one
 */
export function drugHealingAddition(actor) {
  return runningDoses(actor).find(dose => dose.healingAddition)?.healingAddition ?? "";
}

/**
 * The penalties running doses put on Psi Tests - Inhibitor's -30 after a passed WIL Check.
 * @param {Actor} actor - The actor
 * @returns {Object[]} name and modifier per drug
 */
export function drugPsiPenalties(actor) {
  return runningDoses(actor)
    .filter(dose => Number(dose.psiPenalty))
    .map(dose => ({ name: dose.name, modifier: Number(dose.psiPenalty) }));
}
