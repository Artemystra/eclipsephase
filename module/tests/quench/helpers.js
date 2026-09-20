import EPactor from "../../actor/EPactor.js";

/**
 * Creates a temporary world Actor for a suite, deleting it afterwards even if fn throws. Deletion
 * waits for the createActor hook's own unawaited follow-up writes, which would otherwise land on an
 * actor that no longer exists and log errors that have nothing to do with the test.
 * @param {Object} data - Data passed to Actor.create(), e.g. { type: "character", name: "..." }
 * @param {Function} fn - Called with the created actor; its return value is passed through
 * @returns {Promise<*>} Whatever fn returned
 */
export async function withTempActor(data, fn) {
  const actor = await Actor.create({ name: "Quench Temp Actor", ...data });
  try {
    return await fn(actor);
  } finally {
    if (EPactor.MANAGED_TYPES.includes(actor.type)) {
      await waitUntil(() => actor.getFlag("eclipsephase", "defaultMorphAdded"), 5000).catch(() => {});
    }
    await actor.delete();
  }
}

/**
 * Creates a temporary world Item for a suite, deleting it afterwards even if fn throws.
 * @param {Object} data - Data passed to Item.create(), e.g. { type: "gear", name: "..." }
 * @param {Function} fn - Called with the created item; its return value is passed through
 * @returns {Promise<*>} Whatever fn returned
 */
export async function withTempItem(data, fn) {
  const item = await Item.create({ name: "Quench Temp Item", ...data });
  try {
    return await fn(item);
  } finally {
    await item.delete();
  }
}

/**
 * Polls until a condition holds, for work Foundry starts but does not await - a createActor hook
 * writing further documents, for instance. Prefer a real completion signal over a fixed delay.
 * @param {Function} predicate - Called repeatedly; waiting ends once it returns a truthy value
 * @param {Number} [timeoutMs] - How long to wait before giving up
 * @returns {Promise<void>} Resolves once the predicate holds
 */
export async function waitUntil(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil: timed out waiting for condition");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

let originalDice3d;

/**
 * Hides game.dice3d so a roll's awaited 3D dice animation resolves at once. Without this a single
 * roll outlasts Mocha's default timeout on any client with Dice So Nice active.
 * @returns {void}
 */
export function suppressDice3d() {
  originalDice3d = game.dice3d;
  game.dice3d = undefined;
}

/**
 * Restores game.dice3d after suppressDice3d().
 * @returns {void}
 */
export function restoreDice3d() {
  if (originalDice3d !== undefined) game.dice3d = originalDice3d;
  originalDice3d = undefined;
}

let originalRandomUniform = null;

/**
 * Overrides CONFIG.Dice.randomUniform to return a fixed queue of uniform values (each in [0, 1)),
 * one per die rolled, so a suite can drive real Foundry dice deterministically instead of relying
 * on chance. The last value repeats once the queue is exhausted. Call restoreDice() afterwards.
 * @param {Number[]} uniforms - Values to return in order
 * @returns {void}
 */
export function seedDice(uniforms) {
  if (!originalRandomUniform) originalRandomUniform = CONFIG.Dice.randomUniform;
  const queue = [...uniforms];
  CONFIG.Dice.randomUniform = () => (queue.length > 1 ? queue.shift() : queue[0]);
}

/**
 * Restores CONFIG.Dice.randomUniform to Foundry's real implementation after seedDice().
 * @returns {void}
 */
export function restoreDice() {
  if (originalRandomUniform) CONFIG.Dice.randomUniform = originalRandomUniform;
  originalRandomUniform = null;
}

/**
 * The uniform value CONFIG.Dice.randomUniform must return for a die with the given number of
 * sides to land on a specific face, matching Foundry's own Math.ceil(randomUniform() * sides).
 * @param {Number} face - The desired face, 1-based
 * @param {Number} sides - The die's number of sides (100 for a percentile check)
 * @returns {Number} A value that, fed to seedDice(), produces that face
 */
export function uniformForFace(face, sides) {
  return (face - 0.5) / sides;
}

/**
 * The most recently created chat message in this world.
 * @returns {ChatMessage|null} The message, or null if none exist
 */
export function lastMessage() {
  return game.messages.contents.at(-1) ?? null;
}

/**
 * Toggles the confirmation()-dialog test seam so a suite can get past a delete/confirm prompt
 * without a real click. Always turn it back off once the suite is done with it.
 * @param {Boolean} [value] - The new state
 * @returns {void}
 */
export function autoConfirm(value = true) {
  game.eclipsephase.testing.autoConfirm = value;
}
