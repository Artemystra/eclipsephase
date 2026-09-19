import fs from "fs";
import path from "path";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");
const system = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "lang-parity.baseline.json"), "utf8"));

/**
 * Whether a path declared in the manifest exists on disk.
 * @param {String} relativePath - A path relative to the system root
 * @returns {Boolean} True when the file is present
 */
function exists(relativePath) {
  return fs.existsSync(path.join(SYSTEM_ROOT, relativePath));
}

describe("system.json", () => {
  test("declares Foundry 14 as its minimum", () => {
    expect(system.compatibility.minimum).toEqual("14");
  });

  test("every declared script and stylesheet exists", () => {
    expect([...system.esmodules, ...system.styles].filter(file => !exists(file))).toEqual([]);
  });

  test("every declared language file exists", () => {
    expect(system.languages.map(entry => entry.path).filter(file => !exists(file))).toEqual([]);
  });

  test("language files beyond the declared ones match the recorded baseline", () => {
    const declared = new Set(system.languages.map(entry => entry.lang));
    const present = fs.readdirSync(path.join(SYSTEM_ROOT, "lang"))
      .filter(file => file.endsWith(".json"))
      .map(file => file.replace(/\.json$/, ""));
    expect(present.filter(language => !declared.has(language)).sort()).toEqual(baseline.undeclaredLanguageFiles);
  });

  test("every declared compendium has an unpacked source directory", () => {
    const missing = system.packs
      .map(pack => pack.name)
      .filter(name => !exists(path.join("src", "packs", name)));
    expect(missing).toEqual([]);
  });

  test("the manifest and download URLs point at the branch matching the version", () => {
    const branch = `Release-v${system.version}`;
    expect(system.manifest).toContain(branch);
    expect(system.download).toContain(branch);
  });
});
