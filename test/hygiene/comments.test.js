import fs from "fs";
import path from "path";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_DIRS = ["module", "templates", "css"];
const GERMAN = /[äöüÄÖÜß]/;
const SESSION_REFERENCE = /\bSchritt \d|\bOQ\d|project_[a-z]+_|feedback_[a-z]+_/;

/**
 * Every source file the comment rules apply to.
 * @returns {String[]} Paths relative to the system root
 */
function sourceFiles() {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(SYSTEM_ROOT, dir))) {
      const relative = path.join(dir, entry);
      const full = path.join(SYSTEM_ROOT, relative);
      if (fs.statSync(full).isDirectory()) walk(relative);
      else if (/\.(js|hbs|html|css)$/.test(entry)) found.push(relative);
    }
  };
  for (const dir of SOURCE_DIRS) walk(dir);
  return found;
}

/**
 * The comment lines of a file, covering line comments, block comments, Handlebars and CSS.
 * @param {String} relativePath - A path relative to the system root
 * @returns {Object[]} Entries of {line, text}
 */
function commentLines(relativePath) {
  const lines = fs.readFileSync(path.join(SYSTEM_ROOT, relativePath), "utf8").split(/\r?\n/);
  const comments = [];
  let inBlock = false;
  lines.forEach((text, index) => {
    const trimmed = text.trim();
    const isHandlebars = trimmed.startsWith("{{!");
    const isLine = trimmed.startsWith("//");
    if (inBlock || trimmed.startsWith("/*") || trimmed.startsWith("*") || isLine || isHandlebars) {
      comments.push({ line: index + 1, text: trimmed });
    }
    if (trimmed.includes("/*")) inBlock = true;
    if (trimmed.includes("*/")) inBlock = false;
  });
  return comments;
}

const files = sourceFiles();

describe("comment hygiene", () => {
  test("there are files to check", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  test("no comment contains German", () => {
    const offenders = [];
    for (const file of files) {
      for (const { line, text } of commentLines(file)) {
        if (GERMAN.test(text)) offenders.push(`${file}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no comment references this project's planning artefacts", () => {
    const offenders = [];
    for (const file of files) {
      for (const { line, text } of commentLines(file)) {
        if (SESSION_REFERENCE.test(text)) offenders.push(`${file}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
