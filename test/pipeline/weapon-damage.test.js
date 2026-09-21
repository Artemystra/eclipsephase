import { prepareWeapon } from "../../module/rolls/damage.js";
import { makeActor, resetWorld, seedRolls } from "../setup/factories.js";

/**
 * Records every formula handed to Roll, so the formula dealWeaponDamage assembles can be asserted
 * directly rather than inferred from the rendered card.
 * @returns {String[]} The formulas, filled as rolls are constructed, carrying a restore()
 */
function recordFormulas() {
  const formulas = [];
  const Original = global.Roll;
  global.Roll = class extends Original {
    constructor(formula) {
      super(formula);
      formulas.push(formula);
    }
  };
  formulas.restore = () => { global.Roll = Original; };
  return formulas;
}

/**
 * A character carrying one melee weapon that deals 1d10+1d6+2.
 * @param {Object} [options] - traits go on the weapon mode, meleeDamageMod on the actor
 * @returns {Object} The prepared actor
 */
function makeFighter({ traits = {}, meleeDamageMod = null } = {}) {
  return makeActor({
    type: "character",
    name: "Fighter",
    system: { mods: { meleeDamageMod } },
    items: [
      { _id: "knife1", name: "Knife", type: "ccWeapon", system: { additionalMode: false, mode1: { d10: 1, d6: 1, bonus: 2, traits } } }
    ]
  });
}

/**
 * A character carrying a ranged weapon whose trait deals damage even on a miss.
 * @returns {Object} The prepared actor
 */
function makeShooter() {
  return makeActor({
    type: "character",
    name: "Shooter",
    items: [
      {
        _id: "gun1", name: "Gun", type: "rangedWeapon",
        system: {
          additionalMode: false,
          ammoSelected: { name: "Standard", d10: 0, d6: 0, bonus: 0 },
          mode1: { d10: 1, d6: 0, bonus: 0, traits: { dvOnMiss: { name: "dvOnMiss", value: true, dv: { d10: 0, d6: 1, bonus: 0 } } } }
        }
      }
    ]
  });
}

/**
 * The context a finished attack roll hands to prepareWeapon. Passing it directly is what lets this
 * run without a chat message or the DOM.
 * @param {Object} actor - The attacker
 * @param {Object} [overrides] - Fields merged over the context
 * @returns {Object} The prepared context
 */
function weaponContext(actor, overrides = {}) {
  return {
    actorUuid: actor.uuid,
    messageId: null,
    rolledFrom: "ccWeapon",
    item: { weaponId: "knife1", weaponMode: "1" },
    alternatives: { originalResult: 3 },
    options: { biomorphTarget: false, touchOnly: false, attackMode: "", rollMode: "public" },
    ...overrides
  };
}

describe("the damage formula a hit assembles", () => {
  let formulas;
  beforeEach(() => { resetWorld(); formulas = recordFormulas(); seedRolls([9]); });
  afterEach(() => formulas.restore());

  test("a plain success rolls the weapon's own damage", async () => {
    await prepareWeapon(null, 3, weaponContext(makeFighter()));

    expect([...formulas]).toEqual(["1d10+1d6+2"]);
    expect(global.__ep.createdMessages).toHaveLength(1);
  });

  test("one spare degree of success adds a d6", async () => {
    await prepareWeapon(null, 4, weaponContext(makeFighter()));
    expect([...formulas]).toEqual(["1d10+1d6+2+1d6"]);
  });

  test("a melee damage mod, a biomorph target and burst mode all join the formula", async () => {
    const actor = makeFighter({ meleeDamageMod: "+2" });
    await prepareWeapon(null, 5, weaponContext(actor, {
      options: { biomorphTarget: true, touchOnly: false, attackMode: "burst", rollMode: "public" }
    }));

    expect([...formulas]).toEqual(["1d10+1d6+2+1d10+2 + 1d6+2d6"]);
  });

  test("a critical doubles the whole formula", async () => {
    await prepareWeapon(null, 7, weaponContext(makeFighter()));
    expect([...formulas]).toEqual(["2*(1d10+1d6+2)"]);
  });

  test("dvHalved wraps the doubled formula in a halving", async () => {
    const actor = makeFighter({ traits: { dvHalved: { name: "dvHalved", value: true } } });
    await prepareWeapon(null, 7, weaponContext(actor));

    expect([...formulas]).toEqual(["ceil((2*(1d10+1d6+2))/2)"]);
  });
});

describe("what happens when no damage is dealt", () => {
  let formulas;
  beforeEach(() => { resetWorld(); formulas = recordFormulas(); seedRolls([9]); });
  afterEach(() => formulas.restore());

  test("a touch-only hit posts a card without rolling anything", async () => {
    await prepareWeapon(null, 4, weaponContext(makeFighter(), {
      options: { biomorphTarget: false, touchOnly: true, attackMode: "", rollMode: "public" }
    }));

    expect([...formulas]).toEqual([]);
    expect(global.__ep.createdMessages).toHaveLength(1);
  });

  test("a miss rolls nothing and posts nothing", async () => {
    await prepareWeapon(null, 2, weaponContext(makeFighter()));

    expect([...formulas]).toEqual([]);
    expect(global.__ep.createdMessages).toHaveLength(0);
  });

  test("a miss with dvOnMiss still deals the trait's own damage", async () => {
    const actor = makeShooter();
    await prepareWeapon(null, 2, weaponContext(actor, { rolledFrom: "rangedWeapon", item: { weaponId: "gun1", weaponMode: "1" } }));

    expect(formulas).toHaveLength(1);
    expect(global.__ep.createdMessages).toHaveLength(1);
  });
});
