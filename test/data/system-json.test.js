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

  test("the manifest is the rolling latest-release alias, so an installed copy always finds the newest one", () => {
    expect(system.manifest).toEqual("https://github.com/Artemystra/eclipsephase/releases/latest/download/system.json");
  });

  test("the download is pinned to the tag matching the declared version", () => {
    expect(system.download).toEqual(`https://github.com/Artemystra/eclipsephase/releases/download/v${system.version}/eclipsephase.zip`);
  });
});

describe("the modules the system recommends", () => {
  const recommends = system.relationships?.recommends ?? [];

  test("both modules extracted in 2.5 are offered", () => {
    expect(recommends.map(entry => entry.id).sort()).toEqual(["eclipsephase-ki", "eclipsephase-shop"]);
  });

  test("each is declared as a module, not a system", () => {
    for (const entry of recommends) expect(entry.type).toEqual("module");
  });

  test("each carries a manifest URL Foundry can install from", () => {
    for (const entry of recommends) {
      expect(entry.manifest).toMatch(/^https:\/\/github\.com\/.+\/releases\/latest\/download\/module\.json$/);
      expect(entry.manifest).toContain(entry.id);
    }
  });
});
