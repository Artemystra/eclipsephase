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

  test("every weapon mode names the armour its damage meets, and a beam weapon's meets energy armour", () => {
    const kinds = new Set(["energy", "kinetic", "none"]);
    const weapons = documents.filter(({ data }) => data.type === "rangedWeapon" || data.type === "ccWeapon");
    expect(weapons.length).toBeGreaterThan(0);
    const offenders = weapons.filter(({ data }) => ["mode1", "mode2"].some(mode => !kinds.has(data.system[mode]?.armorused))
      || (data.system.ammoType === "beam" && data.system.mode1.armorused !== "energy"));
    expect(offenders.map(o => `${o.pack}/${o.file}`)).toEqual([]);
  });

  test("every ranged weapon mode carries its range in metres and a structured area", () => {
    const offenders = documents.filter(({ data }) => data.type === "rangedWeapon").flatMap(({ pack, file, data }) => ["mode1", "mode2"]
      .filter(mode => !(data.system[mode].range === null || (typeof data.system[mode].range === "number" && data.system[mode].range > 0))
        || !["none", "uniform", "centered"].includes(data.system[mode].area?.kind))
      .map(mode => `${pack}/${file} ${mode}`));
    expect(offenders).toEqual([]);
  });

  test("every munition carries a structured area and a payload, a seeker asks for its size and a grenade has none, and one that carries a payload says how it arrives", () => {
    const offenders = documents.filter(({ data }) => data.type === "ammo" || data.type === "grenade").filter(({ data }) => {
      const system = data.system;
      return !["none", "uniform", "centered"].includes(system.area?.kind)
        || (system.area.kind === "uniform" && !(system.area.radius > 0))
        || (system.area.kind === "centered" && !(system.area.reduction > 0))
        || (data.type === "grenade" ? "size" in system : !["select", "baseline", "standard", "missile"].includes(system.size))
        || (data.type === "ammo" && system.type === "seeker" && system.size !== "select")
        || typeof system.payload?.enabled !== "boolean"
        || (system.payload.enabled && !["inside", "contact", "cloud"].includes(system.payload.delivery));
    });
    expect(offenders.map(({ pack, file }) => `${pack}/${file}`)).toEqual([]);
  });

  test("every grenade and seeker names the armour its damage meets (Core p.213), under the key the schema reads", () => {
    const munitions = documents.filter(({ data }) => data.type === "grenade" || (data.type === "ammo" && data.system.type === "seeker"));
    const offenders = munitions.filter(({ data }) => !["energy", "kinetic", "none"].includes(data.system.armorused) || "armorUsed" in data.system);
    expect(offenders.map(({ pack, file }) => `${pack}/${file}`)).toEqual([]);
    expect(Object.fromEntries(munitions.filter(({ data }) => ["Plasmaburst", "HEAP", "Stun"].includes(data.name)).map(({ data }) => [`${data.type}:${data.name}`, data.system.armorused]))).toEqual({
      "ammo:Plasmaburst": "energy", "ammo:HEAP": "kinetic", "ammo:Stun": "kinetic",
      "grenade:Plasmaburst": "energy", "grenade:Stun": "kinetic"
    });
  });

  test("seekers say they are fired from a launcher, grenades do not, and HEAP comes only as a seeker (Core p.212)", () => {
    const notice = "Information: This is Ammunition. It is meant to be fired via a launcher and not to be thrown.";
    const seekers = documents.filter(({ data }) => data.type === "ammo" && data.system.type === "seeker");
    const grenades = documents.filter(({ data }) => data.type === "grenade");

    expect(seekers.length).toBeGreaterThan(0);
    expect(seekers.filter(({ data }) => !data.system.description.startsWith(`<p><b>${notice}</b></p>`)).map(({ file }) => file)).toEqual([]);
    expect(grenades.filter(({ data }) => data.system.description.includes(notice) || data.name === "HEAP").map(({ file }) => file)).toEqual([]);
  });

  test("every document carries a name and an id", () => {
    const offenders = documents.filter(({ data }) => !data.name || !data._id);
    expect(offenders.map(o => `${o.pack}/${o.file}`)).toEqual([]);
  });

  test("every core sleight is Psi, since Ki ships as its own module", () => {
    const families = new Set(["psi"]);
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
