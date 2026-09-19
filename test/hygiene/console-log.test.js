import fs from "fs";
import path from "path";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");
const MODULE_DIR = path.join(SYSTEM_ROOT, "module");

const ALLOWED = new Set([
  "module/common/migration.js",
  "module/eclipsephase.js"
]);

/**
 * Every JavaScript file below module.
 * @returns {String[]} Paths relative to the system root
 */
function moduleFiles() {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".js")) found.push(path.relative(SYSTEM_ROOT, full));
    }
  };
  walk(MODULE_DIR);
  return found;
}

/**
 * Active console.log call sites. Lines inside block comments and line comments do not count, and
 * the migration log plus the two version banners are allowed by name.
 * @returns {String[]} Entries of file:line, sorted
 */
function activeLogs() {
  const found = [];
  for (const file of moduleFiles()) {
    if (ALLOWED.has(file)) continue;
    const lines = fs.readFileSync(path.join(SYSTEM_ROOT, file), "utf8").split(/\r?\n/);
    let inBlock = false;
    lines.forEach((text, index) => {
      const trimmed = text.trim();
      const wasInBlock = inBlock;
      const opens = trimmed.lastIndexOf("/*");
      const closes = trimmed.lastIndexOf("*/");
      if (opens > closes) inBlock = true;
      else if (closes > opens) inBlock = false;
      if (wasInBlock || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (/\bconsole\.log\s*\(/.test(trimmed)) found.push(`${file}:${index + 1}`);
    });
  }
  return found.sort();
}

describe("debug logging", () => {
  test("no active console.log outside the migration log and the version banners", () => {
    expect(activeLogs()).toEqual([]);
  });

  test("the allowed files are still present", () => {
    for (const file of ALLOWED) expect(fs.existsSync(path.join(SYSTEM_ROOT, file))).toBe(true);
  });
});
