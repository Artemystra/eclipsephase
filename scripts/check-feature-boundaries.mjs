import fs from "fs";
import path from "path";

const IMPORT_SPECIFIER_PATTERN = /(?:import|export)(?:[^'"();]*?from\s*|\s+)["']([^"']+)["']/g;

/**
 * Every import/export specifier a source file references, in file order.
 * @param {String} source - The file's contents
 * @returns {String[]} The specifiers, e.g. "../../rolls/dice.js"
 */
export function findImportSpecifiers(source) {
  const specifiers = [];
  IMPORT_SPECIFIER_PATTERN.lastIndex = 0;
  let match;
  while ((match = IMPORT_SPECIFIER_PATTERN.exec(source))) specifiers.push(match[1]);
  return specifiers;
}

/**
 * Every JavaScript file under a feature folder, recursively.
 * @param {String} featuresRoot - The path to module/features
 * @returns {String[]} Absolute file paths, empty if the folder does not exist yet
 */
export function listFeatureFiles(featuresRoot) {
  if (!fs.existsSync(featuresRoot)) return [];
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".js")) files.push(full);
    }
  };
  walk(featuresRoot);
  return files;
}

/**
 * Every import in every feature file that reaches outside that feature's own folder.
 * @param {String} featuresRoot - The path to module/features
 * @returns {Array<{file: String, specifier: String}>} The violations found, empty if none
 */
export function findViolations(featuresRoot) {
  const violations = [];
  for (const file of listFeatureFiles(featuresRoot)) {
    const featureName = path.relative(featuresRoot, file).split(path.sep)[0];
    const featureDir = path.join(featuresRoot, featureName);
    const source = fs.readFileSync(file, "utf8");

    for (const specifier of findImportSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;

      const resolved = path.resolve(path.dirname(file), specifier);
      const relativeToFeature = path.relative(featureDir, resolved);
      if (relativeToFeature.startsWith("..")) violations.push({ file, specifier });
    }
  }
  return violations;
}

// Run as `node scripts/check-feature-boundaries.mjs` from the repo root.
const isMain = process.argv[1] && path.basename(process.argv[1]) === "check-feature-boundaries.mjs";

if (isMain) {
  const repoRoot = process.cwd();
  const violations = findViolations(path.join(repoRoot, "module", "features"));

  if (violations.length) {
    console.error("Feature boundary violations found:");
    for (const { file, specifier } of violations) {
      console.error(`  ${path.relative(repoRoot, file)}: imports "${specifier}"`);
    }
    process.exit(1);
  }
}
