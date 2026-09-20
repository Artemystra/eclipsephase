import { confirmation } from "../../module/common/general-sheet-functions.js";
import { resetWorld } from "../setup/factories.js";

describe("confirmation() autoConfirm test seam", () => {
  beforeEach(() => resetWorld());
  afterEach(() => { delete global.game.eclipsephase.testing; });

  test("resolves confirmed without opening a dialog when autoConfirm is set", async () => {
    global.game.eclipsephase.testing = { autoConfirm: true };

    const result = await confirmation("Title", "Headline", "Copy");

    expect(result).toEqual({ confirm: true });
  });

  test("carries a rollMode through for a dialog that would have asked for one", async () => {
    global.game.eclipsephase.testing = { autoConfirm: true };

    const result = await confirmation("Title", "Headline", "Copy", null, null, null, false, true, "Mode", "blindroll");

    expect(result).toEqual({ confirm: true, rollMode: "blindroll" });
  });

  test("does not short-circuit the real dialog when autoConfirm is off", async () => {
    global.game.eclipsephase.testing = { autoConfirm: false };

    const result = await confirmation("Title", "Headline", "Copy");

    expect(result).toEqual({ confirm: false });
  });
});
