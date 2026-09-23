import EPactor from "../../module/actor/EPactor.js";

/**
 * Runs the minimum-infection rule against a prepared model, the way prepareData does.
 * @param {Number} tier - What the Psi I / Psi II or Ki I / Ki II trait effect set
 * @param {Number} infection - The character's current Infection Rating
 * @returns {Object} The psiStrain block afterwards
 */
function minimumFor(tier, infection = 0) {
  const actorModel = {
    additionalSystems: tier === null ? {} : { hasPsi: tier },
    psiStrain: { infection, minimumInfection: 0 }
  };
  EPactor.prototype._minimumInfection.call({}, actorModel);
  return actorModel.psiStrain;
}

describe("the Infection Rating floor a discipline imposes", () => {
  test("the first tier sets it to ten", () => {
    expect(minimumFor(1).minimumInfection).toEqual(10);
  });

  test("the second tier sets it to twenty", () => {
    expect(minimumFor(2).minimumInfection).toEqual(20);
  });

  test("no discipline imposes no floor", () => {
    expect(minimumFor(null).minimumInfection).toEqual(0);
    expect(minimumFor(0).minimumInfection).toEqual(0);
  });

  test("it comes from the trait tier, not from how many sleights are owned", () => {
    expect(minimumFor(2).minimumInfection).toEqual(20);
    expect(minimumFor(1).minimumInfection).toEqual(10);
  });
});

describe("what the floor does to the rating itself", () => {
  test("a rating below the floor is raised to it", () => {
    expect(minimumFor(2, 5).infection).toEqual(20);
  });

  test("a rating above the floor is left alone", () => {
    expect(minimumFor(2, 45).infection).toEqual(45);
  });

  test("a rating exactly at the floor is left alone", () => {
    expect(minimumFor(1, 10).infection).toEqual(10);
  });

  test("a character with no discipline keeps whatever rating it has", () => {
    expect(minimumFor(null, 0).infection).toEqual(0);
  });
});
