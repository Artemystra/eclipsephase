import fs from "fs";
import path from "path";

export const LANGUAGES = ["en", "de", "es", "pt-BR", "cn"];

/**
 * Every leaf key of a localization object, as a dot-path.
 * @param {Object} object - A parsed language file
 * @param {String} [prefix] - The path accumulated so far
 * @param {Object} [out] - The collector, dot-path to value
 * @returns {Object} A flat map of dot-path to value
 */
export function flattenKeys(object, prefix = "", out = {}) {
  for (const key of Object.keys(object)) {
    const value = object[key];
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flattenKeys(value, keyPath, out);
    else out[keyPath] = value;
  }
  return out;
}

/**
 * Rebuilds a nested object from a flat dot-path map.
 * @param {Object} flat - A flat map of dot-path to value
 * @returns {Object} The nested object
 */
export function unflatten(flat) {
  const out = {};
  for (const [keyPath, value] of Object.entries(flat)) {
    const parts = keyPath.split(".");
    let target = out;
    for (const part of parts.slice(0, -1)) {
      if (typeof target[part] !== "object" || target[part] === null) target[part] = {};
      target = target[part];
    }
    target[parts.at(-1)] = value;
  }
  return out;
}

/**
 * Whether a key belongs to one of the given entries. An entry ending in "." is a namespace
 * prefix, matching every key under it; an entry with no trailing "." is one exact key.
 * @param {String} key - A flattened dot-path key
 * @param {String[]} entries - The lang-keys.json entries
 * @returns {Boolean} Whether the key matches any entry
 */
export function matchesEntry(key, entries) {
  return entries.some(entry => (entry.endsWith(".") ? key.startsWith(entry) : key === entry));
}

/**
 * Splits a language object's keys into the ones the given entries claim and the rest.
 * @param {Object} languageObject - A parsed language file
 * @param {String[]} entries - The lang-keys.json entries
 * @returns {{extracted: Object, remaining: Object, extractedCount: Number}} The two halves, nested back into objects
 */
export function splitByEntries(languageObject, entries) {
  const flat = flattenKeys(languageObject);
  const extractedFlat = {};
  const remainingFlat = {};

  for (const [key, value] of Object.entries(flat)) {
    if (matchesEntry(key, entries)) extractedFlat[key] = value;
    else remainingFlat[key] = value;
  }

  return {
    extracted: unflatten(extractedFlat),
    remaining: unflatten(remainingFlat),
    extractedCount: Object.keys(extractedFlat).length
  };
}

/**
 * Reads a language file, reporting whether it uses CRLF line endings.
 * @param {String} filePath - Path to a lang/*.json file
 * @returns {{data: Object, crlf: Boolean}} The parsed content and its line-ending style
 */
export function loadLanguageFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return { data: JSON.parse(text), crlf: text.includes("\r\n") };
}

/**
 * Serializes a language object the way this project's lang files are formatted: two-space
 * indent, no trailing newline, and the given line-ending style.
 * @param {Object} data - The object to serialize
 * @param {Boolean} crlf - Whether to use CRLF line endings
 * @returns {String} The serialized JSON
 */
export function serializeLanguageFile(data, crlf) {
  const json = JSON.stringify(data, null, 2);
  return crlf ? json.replace(/\n/g, "\r\n") : json;
}

/**
 * Splits the entries a feature claims out of every language file, optionally writing the result.
 * @param {Object} options - languagesDir (holds en.json etc.), entries (lang-keys.json content),
 *   outDir (where the extracted files are written), dryRun (report only, write nothing)
 * @returns {Object} Per-language { extractedCount }, keyed by language code
 */
export function runSplit({ languagesDir, entries, outDir, dryRun = false }) {
  const results = {};

  for (const language of LANGUAGES) {
    const filePath = path.join(languagesDir, `${language}.json`);
    const { data, crlf } = loadLanguageFile(filePath);
    const { extracted, remaining, extractedCount } = splitByEntries(data, entries);
    results[language] = { extractedCount };

    if (!dryRun) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${language}.json`), serializeLanguageFile(extracted, crlf));
      fs.writeFileSync(filePath, serializeLanguageFile(remaining, crlf));
    }
  }

  return results;
}

// Run as `node scripts/split-lang-keys.mjs <feature>` from the repo root.
const isMain = process.argv[1] && path.basename(process.argv[1]) === "split-lang-keys.mjs";

if (isMain) {
  const [feature, ...rest] = process.argv.slice(2);
  const dryRun = rest.includes("--dry-run");
  const outFlagIndex = rest.indexOf("--out");

  if (!feature) {
    console.error("Usage: node scripts/split-lang-keys.mjs <feature> [--dry-run] [--out <dir>]");
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const featureDir = path.join(repoRoot, "module", "features", feature);
  const langKeysPath = path.join(featureDir, "lang-keys.json");

  if (!fs.existsSync(langKeysPath)) {
    console.error(`No lang-keys.json found for feature "${feature}" at ${langKeysPath}`);
    process.exit(1);
  }

  const entries = JSON.parse(fs.readFileSync(langKeysPath, "utf8"));
  const outDir = outFlagIndex >= 0 ? path.resolve(rest[outFlagIndex + 1]) : path.join(featureDir, "lang");

  const results = runSplit({ languagesDir: path.join(repoRoot, "lang"), entries, outDir, dryRun });

  for (const [language, { extractedCount }] of Object.entries(results)) {
    console.log(`${language}: ${extractedCount} key(s)${dryRun ? " (dry run, nothing written)" : ` moved to ${outDir}`}`);
  }
}
