import fs from "fs";
import path from "path";
import baseline from "./lang-parity.baseline.json";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");
const LANGUAGES = ["de", "es", "pt-BR", "cn"];

/**
 * Every leaf key of a localization file as a dot-path.
 * @param {Object} object - A parsed language file
 * @param {String} [prefix] - The path accumulated so far
 * @param {String[]} [out] - The collector
 * @returns {String[]} All leaf key paths
 */
function leafKeys(object, prefix = "", out = []) {
  for (const key of Object.keys(object)) {
    const value = object[key];
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) leafKeys(value, keyPath, out);
    else out.push(keyPath);
  }
  return out;
}

/**
 * Reads and parses one language file.
 * @param {String} language - A language code matching a file in lang
 * @returns {Object} The parsed file
 */
function readLanguage(language) {
  return JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "lang", `${language}.json`), "utf8"));
}

describe("localization files", () => {
  const english = new Set(leafKeys(readLanguage("en")));

  test("every language file is valid JSON", () => {
    for (const language of ["en", ...LANGUAGES]) expect(() => readLanguage(language)).not.toThrow();
  });

  for (const language of LANGUAGES) {
    test(`${language} has no key missing beyond the recorded baseline`, () => {
      const keys = new Set(leafKeys(readLanguage(language)));
      const missing = [...english].filter(key => !keys.has(key));
      const allowed = new Set(baseline.missingAgainstEnglish[language]);
      expect(missing.filter(key => !allowed.has(key))).toEqual([]);
    });

    test(`${language} has no key English lacks beyond the recorded baseline`, () => {
      const keys = leafKeys(readLanguage(language));
      const allowed = new Set(baseline.extraBeyondEnglish[language]);
      expect(keys.filter(key => !english.has(key) && !allowed.has(key))).toEqual([]);
    });
  }

  test("no new migration copy is translated, as the localization policy requires", () => {
    for (const language of LANGUAGES) {
      const allowed = new Set(baseline.existingMigrationKeys[language]);
      const keys = leafKeys(readLanguage(language)).filter(key => key.startsWith("ep2e.migration."));
      expect(keys.filter(key => !allowed.has(key))).toEqual([]);
    }
  });
});
