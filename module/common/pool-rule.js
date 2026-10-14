// The pool rule: an actor's current pool value tracks its total. Whatever starts or stops raising
// a total - a dose taken or run out, a chi push, armour worn or stashed, gear toggled, ware gained
// or lost by resleeving - moves the current value by the same amount, clamped into what the pool
// now holds. Only a change that sets a pool's value itself, as spending a point or a recharge does,
// is left to say what it meant.
const POOLS = ["insight", "moxie", "vigor", "flex"];
const TOTAL_KEY = { insight: "totalInsight", moxie: "totalMoxie", vigor: "totalVigor", flex: "totalFlex" };

// What each actor's totals were before the change in flight, consumed when the change lands.
const snapshots = new WeakMap();

/**
 * The actor a changed document belongs to: the actor itself, an item's actor, or the actor behind
 * an effect on the actor or on one of its items.
 * @param {Document} document - The document that changed
 * @returns {Actor|null} The actor, or null when none is involved
 */
export function owningActor(document) {
  if (document instanceof Actor) return document;
  const parent = document?.parent;
  if (parent instanceof Actor) return parent;
  return parent?.parent instanceof Actor ? parent.parent : null;
}

/**
 * Every pool's total as the actor's prepared data has it right now.
 * @param {Actor} actor - The actor
 * @returns {Object} Pool name to total
 */
function poolTotals(actor) {
  const totals = {};
  for (const pool of POOLS) totals[pool] = Number(actor.system?.pools?.[pool]?.[TOTAL_KEY[pool]]) || 0;
  return totals;
}

/**
 * Whether a change sets a pool's value itself, in which case the rule stays out of its way.
 * @param {Object} changes - The change in flight, flat or expanded
 * @param {String} pool - The pool name
 * @returns {Boolean} True when the change writes that pool's value
 */
function setsPoolValue(changes, pool) {
  const path = `system.pools.${pool}.value`;
  return changes?.[path] !== undefined || foundry.utils.getProperty(changes ?? {}, path) !== undefined;
}

/**
 * Remembers an actor's pool totals before a change lands, so the change can be measured.
 * @param {Actor|null} actor - The actor about to change
 * @returns {void}
 */
export function rememberPoolTotals(actor) {
  if (actor) snapshots.set(actor, poolTotals(actor));
}

/**
 * Measures how a change moved the actor's pool totals and moves the current values along with
 * them. The actor is re-prepared first: for an effect on one of its items Foundry fires the hook
 * before the actor has caught up, and the old totals would read as no change at all. A change that
 * writes a pool's value itself is left as written. Consumes the snapshot, so a batch that lands
 * several documents at once settles exactly once.
 * @param {Actor|null} actor - The actor that changed
 * @param {Object} [changes] - The change that landed, when it was an update
 * @returns {Promise<void>} Resolves once the actor is updated
 */
export async function settlePools(actor, changes = {}) {
  const before = actor ? snapshots.get(actor) : null;
  if (!before) return;
  snapshots.delete(actor);

  actor.reset?.();
  const after = poolTotals(actor);
  const updates = {};
  for (const pool of POOLS) {
    const delta = after[pool] - before[pool];
    if (!delta || setsPoolValue(changes, pool)) continue;
    const value = Number(actor.system.pools[pool]?.value) || 0;
    updates[`system.pools.${pool}.value`] = Math.clamp(value + delta, 0, after[pool]);
  }

  if (Object.keys(updates).length) await actor.update(updates);
}

/**
 * Hangs the rule on every document change that can move a pool total: the actor itself, its items
 * and their effects. Only the client that made the change settles it, so a dose taken by a player
 * moves their pool once rather than once per connected screen. Actors being created or deleted are
 * left alone; a fresh actor's pools are the recharge's business.
 * @returns {void}
 */
export function registerPoolRule() {
  const watched = [
    ["Actor", ["update"]],
    ["Item", ["create", "update", "delete"]],
    ["ActiveEffect", ["create", "update", "delete"]]
  ];

  for (const [documentName, operations] of watched) {
    for (const operation of operations) {
      const name = operation[0].toUpperCase() + operation.slice(1);
      Hooks.on(`pre${name}${documentName}`, document => rememberPoolTotals(owningActor(document)));
      Hooks.on(`${operation}${documentName}`, (document, ...rest) => {
        const changes = operation === "update" ? rest[0] : {};
        const userId = rest[rest.length - 1];
        if (userId === game.user.id) settlePools(owningActor(document), changes);
      });
    }
  }
}
