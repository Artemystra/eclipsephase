import fs from "fs";
import path from "path";
import { api } from "../../module/api/index.js";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");
const system = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8"));
const eclipsephaseSource = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "eclipsephase.js"), "utf8");
const extendingDocs = fs.readFileSync(path.join(SYSTEM_ROOT, "docs", "EXTENDING.md"), "utf8");

/**
 * Every .js file under a directory, recursively.
 * @param {String} dir - The directory to scan
 * @returns {String[]} Absolute paths of every .js file found
 */
function collectJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJsFiles(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

/**
 * Every eclipsephase.* hook name fired anywhere under module/, via Hooks.call or Hooks.callAll.
 * @returns {String[]} The unique hook names, sorted
 */
function hookNamesInSource() {
  const pattern = /Hooks\.(?:call|callAll)\(\s*["'](eclipsephase\.[a-zA-Z]+)["']/g;
  const names = new Set();
  for (const file of collectJsFiles(path.join(SYSTEM_ROOT, "module"))) {
    const source = fs.readFileSync(file, "utf8");
    let match;
    while ((match = pattern.exec(source))) names.add(match[1]);
  }
  return [...names].sort();
}

/**
 * Every eclipsephase.* hook name referenced in docs/EXTENDING.md.
 * @returns {String[]} The unique hook names, sorted
 */
function hookNamesInDocs() {
  const pattern = /`(eclipsephase\.[a-zA-Z]+)`/g;
  const names = new Set();
  let match;
  while ((match = pattern.exec(extendingDocs))) names.add(match[1]);
  return [...names].sort();
}

describe("game.eclipsephase.api surface", () => {
  test("matches the recorded snapshot", () => {
    expect(api).toMatchSnapshot();
  });
});

describe("hook documentation", () => {
  test("every eclipsephase.* hook fired under module/ is documented, and nothing else is", () => {
    expect(hookNamesInDocs()).toEqual(hookNamesInSource());
  });
});

describe("version wiring", () => {
  test("game.eclipsephase.version is wired to game.system.version", () => {
    expect(eclipsephaseSource).toMatch(/version:\s*game\.system\.version/);
  });

  test("game.system.version (the mock's stand-in for the loaded manifest) matches system.json", () => {
    expect(game.system.version).toEqual(system.version);
  });
});
