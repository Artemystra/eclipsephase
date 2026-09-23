import fs from "fs";
import path from "path";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");
const MODULE_DIR = path.join(SYSTEM_ROOT, "module");

// Types a module owns rather than the system. A check against one of these strings in core code
// breaks the moment the module namespaces its type, which is exactly what happened when the shop
// became eclipsephase-shop.shop and core kept comparing against the bare "shop".
const MODULE_OWNED_TYPES = ["shop"];

/**
 * Every JavaScript file below module, excluding the system's own test harness.
 * @returns {String[]} Paths relative to the system root
 */
function moduleFiles() {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        if (entry !== "tests") walk(full);
      } else if (entry.endsWith(".js")) {
        found.push(path.relative(SYSTEM_ROOT, full));
      }
    }
  };
  walk(MODULE_DIR);
  return found;
}

/**
 * Comparisons of a .type against one of the given literals, ignoring commented-out lines.
 * @param {String} source - The file's contents
 * @param {String} type - The type literal to look for
 * @returns {String[]} The offending lines, trimmed
 */
function typeComparisons(source, type) {
  const pattern = new RegExp(`type\\s*[!=]==?\\s*["']${type}["']|["']${type}["']\\s*[!=]==?\\s*\\w*\\.?type`);
  return source
    .split("\n")
    .filter(line => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .filter(line => pattern.test(line))
    .map(line => line.trim());
}

describe("core does not hardcode module-owned actor types", () => {
  test.each(MODULE_OWNED_TYPES)("no file compares a type against %p", type => {
    const offenders = moduleFiles().flatMap(file => {
      const source = fs.readFileSync(path.join(SYSTEM_ROOT, file), "utf8");
      return typeComparisons(source, type).map(line => `${file}: ${line}`);
    });
    expect(offenders).toEqual([]);
  });
});
