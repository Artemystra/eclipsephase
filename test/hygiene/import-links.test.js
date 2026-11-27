import fs from "fs";
import path from "path";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");

// A browser refuses to load a module that imports a name its source does not export, and with it the
// whole system: no init hook runs, no setting is registered. Jest's own module handling hands back
// undefined instead, so only reading the files tells.

/**
 * Every script of the system.
 * @returns {String[]} Paths relative to the system root
 */
function moduleFiles() {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(SYSTEM_ROOT, dir))) {
      const relative = path.join(dir, entry);
      if (fs.statSync(path.join(SYSTEM_ROOT, relative)).isDirectory()) walk(relative);
      else if (entry.endsWith(".js")) found.push(relative);
    }
  };
  walk("module");
  return found;
}

/**
 * The names a script exports, and whether it passes another script's exports on wholesale.
 * @param {String} source - The script's text
 * @returns {{names: Set<String>, passesOn: Boolean}} What it exports
 */
function exportsOf(source) {
  const names = new Set();
  for (const match of source.matchAll(/^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^\s*export\s*\{([^}]*)\}/gms)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  if (/^\s*export\s+default\b/m.test(source)) names.add("default");
  return { names, passesOn: /^\s*export\s*\*\s*from\b/m.test(source) };
}

/**
 * The names a script imports from the system's own scripts.
 * @param {String} file - Its path relative to the system root
 * @param {String} source - Its text
 * @returns {Object[]} from (the script named, relative to the system root) and name per import
 */
function importsOf(file, source) {
  const found = [];
  const pattern = /^\s*import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["'](\.[^"']+)["']/gms;
  for (const [, byDefault, named, from] of source.matchAll(pattern)) {
    const target = path.normalize(path.join(path.dirname(file), from));
    if (byDefault) found.push({ from: target, name: "default" });
    for (const part of (named ?? "").split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name) found.push({ from: target, name });
    }
  }
  return found;
}

describe("imports between the system's scripts", () => {
  test("every imported name is exported by the script it is imported from", () => {
    const files = moduleFiles();
    const sources = new Map(files.map(file => [file, fs.readFileSync(path.join(SYSTEM_ROOT, file), "utf8")]));
    const exported = new Map(files.map(file => [file, exportsOf(sources.get(file))]));

    const broken = [];
    for (const file of files) {
      for (const { from, name } of importsOf(file, sources.get(file))) {
        const target = exported.get(from);
        if (!target) broken.push(`${file}: ${from} does not exist`);
        else if (!target.names.has(name) && !target.passesOn) broken.push(`${file}: ${from} exports no "${name}"`);
      }
    }

    expect(broken).toEqual([]);
  });

  test("the check itself reads exports and imports as written", () => {
    const { names, passesOn } = exportsOf("export async function a() {}\nexport const b = 1;\nexport { c, d as e };\nexport default class F {}\n");
    expect([[...names].sort(), passesOn]).toEqual([["a", "b", "c", "default", "e"], false]);
    expect(importsOf("module/x/y.js", 'import Z, { a, b as c } from "../z.js";\nimport fs from "fs";'))
      .toEqual([{ from: path.normalize("module/z.js"), name: "default" }, { from: path.normalize("module/z.js"), name: "a" }, { from: path.normalize("module/z.js"), name: "b" }]);
  });
});
