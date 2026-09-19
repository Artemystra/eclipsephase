import fs from "fs";
import path from "path";

const SYSTEM_ROOT = path.resolve(__dirname, "..", "..");
const PACK_ROOT = path.join(SYSTEM_ROOT, "src", "packs");
const template = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "template.json"), "utf8"));

/**
 * Every source document of every unpacked compendium.
 * @returns {Object[]} Entries of {pack, file, data}
 */
function allPackDocuments() {
  const documents = [];
  for (const pack of fs.readdirSync(PACK_ROOT)) {
    const dir = path.join(PACK_ROOT, pack);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      documents.push({ pack, file, data: JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) });
    }
  }
  return documents;
}

const documents = allPackDocuments().filter(({ data }) => !String(data._key ?? "").startsWith("!folders"));
const folders = allPackDocuments().filter(({ data }) => String(data._key ?? "").startsWith("!folders"));

describe("compendium sources", () => {
  test("there are documents to check", () => {
    expect(documents.length).toBeGreaterThan(100);
    expect(folders.length).toBeGreaterThan(0);
  });

  test("every folder declares the document class it holds", () => {
    const offenders = folders.filter(({ data }) => !["Item", "Actor"].includes(data.type));
    expect(offenders.map(o => `${o.pack}/${o.file}`)).toEqual([]);
  });

  test("every document declares a type the system knows", () => {
    const actorTypes = new Set(template.Actor.types);
    const itemTypes = new Set(template.Item.types);
    const offenders = documents.filter(({ data }) => {
      const isActor = String(data._key ?? "").startsWith("!actors");
      const known = isActor ? actorTypes : itemTypes;
      return !known.has(data.type);
    });
    expect(offenders.map(o => `${o.pack}/${o.file}: ${o.data.type}`)).toEqual([]);
  });

  test("every document carries a name and an id", () => {
    const offenders = documents.filter(({ data }) => !data.name || !data._id);
    expect(offenders.map(o => `${o.pack}/${o.file}`)).toEqual([]);
  });

  test("sleights declare a known strain family and psi type", () => {
    const families = new Set(["psi", "ki"]);
    const psiTypes = new Set(["chi", "gamma", "epsilon"]);
    const sleights = documents.filter(({ data }) => data.type === "aspect");
    expect(sleights.length).toBeGreaterThan(0);
    const offenders = sleights.filter(({ data }) =>
      !families.has(data.system?.strainFamily) || !psiTypes.has(data.system?.psiType));
    expect(offenders.map(o => `${o.pack}/${o.file}`)).toEqual([]);
  });

  test("morphs carry a numeric Morph Point cost", () => {
    const morphs = documents.filter(({ data }) => data.type === "morph" && data.pack !== "samplecharacters");
    const offenders = morphs.filter(({ data }) => typeof data.system?.morphPoints !== "number");
    expect(offenders.map(o => `${o.pack}/${o.file}`)).toEqual([]);
  });

  test("effect changes use a known type and a non-empty key", () => {
    const allowed = new Set(["add", "override", "subtract", "multiply", "upgrade", "downgrade"]);
    const offenders = [];
    for (const { pack, file, data } of documents) {
      for (const effect of data.effects ?? []) {
        for (const change of effect.system?.changes ?? effect.changes ?? []) {
          if (!change.key || !allowed.has(change.type)) offenders.push(`${pack}/${file}: ${change.key} ${change.type}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
