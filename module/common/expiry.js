import { endExpiredChiPushes } from "../rolls/psi.js";
import { deleteRunOutTempEffects } from "./general-sheet-functions.js";
import { endRunOutDoses } from "./doses.js";
import { owningActor } from "./pool-rule.js";
import { durationRunOut } from "./time.js";

/**
 * Takes a system effect off once Foundry has marked it expired: a chi push ends, a temporary
 * effect and a dose are deleted. Anything else Foundry marked is left alone.
 * @param {ActiveEffect} effect - The effect just marked expired
 * @returns {Promise<void>} Resolves once the clean-up has run
 */
export async function cleanUpExpired(effect) {
  const actor = owningActor(effect);
  if (!actor) return;
  await endExpiredChiPushes(actor, [effect]);
  await deleteRunOutTempEffects(actor, [effect]);
  await endRunOutDoses(actor, [effect]);
  await sweepTokenCopies(actor, effect);
}

/**
 * Removes what an expired effect of a world actor leaves behind on its unlinked tokens. Foundry
 * marks the tokens' inherited copies expired too, and marking an inherited copy writes it into the
 * token's own data; once the world actor's effect is gone, that written copy stays behind,
 * inactive. Waits a tick so the tokens have rebuilt from the world actor first.
 * @param {Actor} actor - The actor the effect expired on
 * @param {ActiveEffect} effect - The expired effect
 * @returns {Promise<void>} Resolves once every left-behind copy is gone
 */
export async function sweepTokenCopies(actor, effect) {
  if (actor.isToken || typeof actor.getDependentTokens !== "function") return;
  const systemEffect = ["dose", "effectKey", "chiPushBoost"].some(flag => effect.getFlag?.("eclipsephase", flag) !== undefined);
  if (!systemEffect) return;

  await new Promise(resolve => setTimeout(resolve, 0));
  for (const token of actor.getDependentTokens()) {
    const copy = Array.from(token.actor?.effects ?? []).find(candidate => candidate.id === effect.id);
    if (copy && durationRunOut(copy)) await token.actor.deleteEmbeddedDocuments("ActiveEffect", [copy.id]);
  }
}

/**
 * Hangs the clean-up on Foundry's own expiry. When the clock runs an effect out, Foundry's effect
 * registry marks it expired with an update and does not wait for the actor's duration hook;
 * deleting from that hook raced the update and left the server updating effects already gone.
 * Waiting for the update to land - on the client that made it, the active GM's - lets the two
 * happen one after the other.
 * @returns {void}
 */
export function registerExpiryCleanup() {
  Hooks.on("updateActiveEffect", (effect, changes, options, userId) => {
    if (userId !== game.user.id) return;
    const expired = changes?.["duration.expired"] ?? foundry.utils.getProperty(changes ?? {}, "duration.expired");
    if (expired !== true) return;
    cleanUpExpired(effect);
  });
}
