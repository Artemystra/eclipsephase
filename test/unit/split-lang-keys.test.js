import fs from "fs";
import os from "os";
import path from "path";

/**
 * Loads the split-lang-keys script fresh.
 * @returns {Promise<Object>} The module's exports
 */
async function loadScript() {
  return import("../../scripts/split-lang-keys.mjs");
}

describe("flattenKeys and unflatten", () => {
  test("flattens a nested object into dot-paths and back", async () => {
    const { flattenKeys, unflatten } = await loadScript();
    const nested = { ep2e: { shop: { purchase: { buy: "Buy" } }, roll: { title: "Roll" } } };

    const flat = flattenKeys(nested);
    expect(flat).toEqual({ "ep2e.shop.purchase.buy": "Buy", "ep2e.roll.title": "Roll" });
    expect(unflatten(flat)).toEqual(nested);
  });
});

describe("matchesEntry", () => {
  test("a trailing-dot entry matches every key under that namespace", async () => {
    const { matchesEntry } = await loadScript();
    expect(matchesEntry("ep2e.shop.purchase.buy", ["ep2e.shop."])).toBe(true);
    expect(matchesEntry("ep2e.shop", ["ep2e.shop."])).toBe(false);
    expect(matchesEntry("ep2e.other.thing", ["ep2e.shop."])).toBe(false);
  });

  test("an entry without a trailing dot matches only that exact key", async () => {
    const { matchesEntry } = await loadScript();
    expect(matchesEntry("ep2e.item.aspect.table.family.ki", ["ep2e.item.aspect.table.family.ki"])).toBe(true);
    expect(matchesEntry("ep2e.item.aspect.table.family.kilogram", ["ep2e.item.aspect.table.family.ki"])).toBe(false);
  });
});

describe("splitByEntries", () => {
  test("separates claimed keys from the rest and counts them", async () => {
    const { splitByEntries } = await loadScript();
    const language = { ep2e: { shop: { buy: "Buy" }, roll: { title: "Roll" } } };

    const { extracted, remaining, extractedCount } = splitByEntries(language, ["ep2e.shop."]);

    expect(extracted).toEqual({ ep2e: { shop: { buy: "Buy" } } });
    expect(remaining).toEqual({ ep2e: { roll: { title: "Roll" } } });
    expect(extractedCount).toEqual(1);
  });
});

// Any namespace the system still owns will do - the shop's moved into its own module.
const PREFIX = "ep2e.psi.";

describe("runSplit, on copies of the real language files", () => {
  let languagesDir;
  let outDir;

  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ep-split-lang-"));
    languagesDir = path.join(root, "lang");
    outDir = path.join(root, "out");
    fs.mkdirSync(languagesDir);
    const realLangDir = path.resolve(__dirname, "..", "..", "lang");
    for (const file of fs.readdirSync(realLangDir)) {
      fs.copyFileSync(path.join(realLangDir, file), path.join(languagesDir, file));
    }
  });

  test("a dry run reports the count and writes nothing", async () => {
    const { runSplit, LANGUAGES } = await loadScript();
    const before = fs.readFileSync(path.join(languagesDir, "en.json"));

    const results = runSplit({ languagesDir, entries: [PREFIX], outDir, dryRun: true });

    for (const language of LANGUAGES) expect(results[language].extractedCount).toEqual(96);
    expect(fs.existsSync(outDir)).toBe(false);
    expect(fs.readFileSync(path.join(languagesDir, "en.json"))).toEqual(before);
  });

  test("a real run moves the keys out completely, key for key", async () => {
    const { runSplit, flattenKeys } = await loadScript();
    const originalEn = JSON.parse(fs.readFileSync(path.join(languagesDir, "en.json"), "utf8"));
    const originalKeys = new Set(Object.keys(flattenKeys(originalEn)));

    runSplit({ languagesDir, entries: [PREFIX], outDir, dryRun: false });

    const extracted = JSON.parse(fs.readFileSync(path.join(outDir, "en.json"), "utf8"));
    const remaining = JSON.parse(fs.readFileSync(path.join(languagesDir, "en.json"), "utf8"));
    const combinedKeys = new Set([...Object.keys(flattenKeys(extracted)), ...Object.keys(flattenKeys(remaining))]);

    expect(combinedKeys).toEqual(originalKeys);
    expect(Object.keys(flattenKeys(extracted)).every(key => key.startsWith(PREFIX))).toBe(true);
    expect(Object.keys(flattenKeys(remaining)).some(key => key.startsWith(PREFIX))).toBe(false);
  });

  test("preserves each language file's own line-ending style", async () => {
    const { runSplit } = await loadScript();

    runSplit({ languagesDir, entries: [PREFIX], outDir, dryRun: false });

    const expectCrlf = { "en.json": true, "de.json": true, "es.json": false, "cn.json": false, "pt-BR.json": false };
    for (const [file, crlf] of Object.entries(expectCrlf)) {
      const remainingText = fs.readFileSync(path.join(languagesDir, file), "utf8");
      const extractedText = fs.readFileSync(path.join(outDir, file), "utf8");
      expect(remainingText.includes("\r\n")).toBe(crlf);
      expect(extractedText.includes("\r\n")).toBe(crlf);
    }
  });
});
