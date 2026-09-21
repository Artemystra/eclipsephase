import fs from "fs";
import path from "path";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");
const MODULE_DIR = path.join(SYSTEM_ROOT, "module");

// Foundry 14 still honours "-=key": null, but logs a compatibility warning per key, and that
// warning throws once CONFIG.compatibility.mode is FAILURE. The throw lands inside the database
// backend's dry run, turns into a notification, and the document is skipped without the calling
// migration ever seeing an error. foundry.data.operators.ForcedDeletion is the form that holds.
const LEGACY_DELETION = /["'`][^"'`]*\.-=/;

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

describe("no update uses the legacy deletion syntax", () => {
  test("no file writes a -=key", () => {
    const offenders = moduleFiles().flatMap(file =>
      fs.readFileSync(path.join(SYSTEM_ROOT, file), "utf8")
        .split("\n")
        .filter(line => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .filter(line => LEGACY_DELETION.test(line))
        .map(line => `${file}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});
