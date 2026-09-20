import fs from "fs";
import os from "os";
import path from "path";

/**
 * Loads the boundary checker fresh, so mutating global state between tests isn't a concern - the
 * module only exports pure functions.
 * @returns {Promise<Object>} The module's exports
 */
async function loadChecker() {
  return import("../../scripts/check-feature-boundaries.mjs");
}

/**
 * A throwaway directory under the OS temp folder, removed after the test.
 * @returns {String} The directory's path
 */
function makeTempFeaturesRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ep-feature-boundaries-"));
}

describe("findImportSpecifiers", () => {
  test("finds a named import", async () => {
    const { findImportSpecifiers } = await loadChecker();
    expect(findImportSpecifiers('import { a } from "./sibling.js";')).toEqual(["./sibling.js"]);
  });

  test("finds a default import, a namespace import and a side-effect import", async () => {
    const { findImportSpecifiers } = await loadChecker();
    const source = [
      'import Thing from "./thing.js";',
      'import * as Helper from "./helper.js";',
      'import "./side-effect.js";'
    ].join("\n");
    expect(findImportSpecifiers(source)).toEqual(["./thing.js", "./helper.js", "./side-effect.js"]);
  });

  test("finds a re-export", async () => {
    const { findImportSpecifiers } = await loadChecker();
    expect(findImportSpecifiers('export { thing } from "./thing.js";')).toEqual(["./thing.js"]);
  });

  test("ignores a file with no imports", async () => {
    const { findImportSpecifiers } = await loadChecker();
    expect(findImportSpecifiers("export function nothing() {}")).toEqual([]);
  });
});

describe("findViolations", () => {
  let root;

  beforeEach(() => { root = makeTempFeaturesRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test("reports nothing when the features folder does not exist", async () => {
    const { findViolations } = await loadChecker();
    expect(findViolations(path.join(root, "does-not-exist"))).toEqual([]);
  });

  test("passes an import that stays inside the feature's own folder", async () => {
    const { findViolations } = await loadChecker();
    fs.mkdirSync(path.join(root, "shop", "sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "shop", "index.js"), 'import { helper } from "./sub/helper.js";');

    expect(findViolations(root)).toEqual([]);
  });

  test("passes a bare specifier, since Foundry globals need no import", async () => {
    const { findViolations } = await loadChecker();
    fs.mkdirSync(path.join(root, "shop"), { recursive: true });
    fs.writeFileSync(path.join(root, "shop", "index.js"), 'import Handlebars from "handlebars";');

    expect(findViolations(root)).toEqual([]);
  });

  test("reports the exact import the plan names as forbidden", async () => {
    const { findViolations } = await loadChecker();
    fs.mkdirSync(path.join(root, "shop"), { recursive: true });
    const file = path.join(root, "shop", "index.js");
    fs.writeFileSync(file, 'import { RollCheck } from "../../rolls/dice.js";');

    const violations = findViolations(root);
    expect(violations).toEqual([{ file, specifier: "../../rolls/dice.js" }]);
  });

  test("reports an import reaching into common/ just as it reports rolls/", async () => {
    const { findViolations } = await loadChecker();
    fs.mkdirSync(path.join(root, "shop"), { recursive: true });
    fs.writeFileSync(path.join(root, "shop", "index.js"), 'import { x } from "../../common/general-sheet-functions.js";');

    expect(findViolations(root)).toHaveLength(1);
  });

  test("reports one feature reaching into a sibling feature's folder", async () => {
    const { findViolations } = await loadChecker();
    fs.mkdirSync(path.join(root, "shop"), { recursive: true });
    fs.mkdirSync(path.join(root, "ki"), { recursive: true });
    fs.writeFileSync(path.join(root, "shop", "index.js"), 'import { x } from "../ki/index.js";');

    expect(findViolations(root)).toHaveLength(1);
  });

  test("checks every file, not just the first", async () => {
    const { findViolations } = await loadChecker();
    fs.mkdirSync(path.join(root, "shop"), { recursive: true });
    fs.writeFileSync(path.join(root, "shop", "a.js"), 'import { x } from "../../rolls/dice.js";');
    fs.writeFileSync(path.join(root, "shop", "b.js"), 'import { y } from "./a.js";');
    fs.writeFileSync(path.join(root, "shop", "c.js"), 'import { z } from "../../common/x.js";');

    expect(findViolations(root)).toHaveLength(2);
  });
});
