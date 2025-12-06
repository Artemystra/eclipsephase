/**
 * Sorts an object list alphabetically
 * Uses the value (label of a dropdown) to do so
 * @param {*} obj 
 * @returns 
 */
export function sortObjectByValue(obj) {
  return Object.fromEntries(
    Object.entries(obj).sort(([, a], [, b]) =>
      a.localeCompare(b, game.i18n.lang)
    )
  );
}