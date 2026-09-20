import {
  registerRollSource, getRollSource,
  registerPoolOption, applicablePoolOptions,
  registerSlot, slotEntries, renderSlot, renderPoolOptions,
  resetRegistry
} from "../../module/api/registry.js";
import { resetWorld } from "../setup/factories.js";

describe("roll sources", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); });

  test("a registered source is readable by its id", () => {
    expect(registerRollSource("shopPurchase", { skillRoll: () => ({ rollvalue: 40 }) })).toBe(true);
    expect(getRollSource("shopPurchase").skillRoll().rollvalue).toEqual(40);
  });

  test("an unknown id yields nothing", () => {
    expect(getRollSource("nothingHere")).toBeUndefined();
  });

  test("a duplicate id is refused and the first registration stands", () => {
    registerRollSource("duplicate", { skillRoll: () => ({ rollvalue: 1 }) });
    expect(registerRollSource("duplicate", { skillRoll: () => ({ rollvalue: 2 }) })).toBe(false);
    expect(getRollSource("duplicate").skillRoll().rollvalue).toEqual(1);
  });

  test("an empty id is refused", () => {
    expect(registerRollSource("", {})).toBe(false);
    expect(registerRollSource(null, {})).toBe(false);
  });

  test("a non-function skillRoll is refused", () => {
    expect(registerRollSource("wrongType", { skillRoll: "not a function" })).toBe(false);
    expect(getRollSource("wrongType")).toBeUndefined();
  });
});

describe("pool options", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); });

  test("an option without a visibility check always applies", () => {
    registerPoolOption({ value: "always", label: "ep2e.always" });
    expect(applicablePoolOptions({ rollType: "guns" }).map(o => o.value)).toEqual(["always"]);
  });

  test("the visibility check receives the roll context", () => {
    registerPoolOption({ value: "psiOnly", label: "ep2e.psiOnly", when: ctx => ctx.rollType === "psi" });
    expect(applicablePoolOptions({ rollType: "psi" }).map(o => o.value)).toEqual(["psiOnly"]);
    expect(applicablePoolOptions({ rollType: "guns" })).toEqual([]);
  });

  test("a duplicate value is refused", () => {
    registerPoolOption({ value: "once", label: "a" });
    expect(registerPoolOption({ value: "once", label: "b" })).toBe(false);
    expect(applicablePoolOptions({})).toHaveLength(1);
  });

  test("an option missing value or label is refused", () => {
    expect(registerPoolOption({ label: "no value" })).toBe(false);
    expect(registerPoolOption({ value: "noLabel" })).toBe(false);
  });

  test("a visibility check that throws hides the option instead of breaking the dialog", () => {
    registerPoolOption({ value: "broken", label: "x", when: () => { throw new Error("boom"); } });
    expect(applicablePoolOptions({})).toEqual([]);
  });

  test("options render as markup with the pool name appended", () => {
    const markup = renderPoolOptions([{ value: "ignoreInfection", label: "ep2e.roll.dialog.ignoreInfection" }], "ep2e.skills.pool.moxie");
    expect(markup).toContain('value="ignoreInfection"');
    expect(markup).toContain("ep2e.roll.dialog.ignoreInfection");
    expect(markup).toContain("(ep2e.skills.pool.moxie)");
  });

  test("options render without a suffix when no pool name is given", () => {
    const markup = renderPoolOptions([{ value: "x", label: "ep2e.x" }], "");
    expect(markup).toEqual('<option value="x">ep2e.x</option>');
  });
});

describe("slots", () => {
  beforeEach(() => { resetRegistry(); resetWorld(); });

  test("entries come back in ascending order regardless of registration order", () => {
    registerSlot("chatCard.buttons", { template: "late.html", order: 20 });
    registerSlot("chatCard.buttons", { template: "early.html", order: 5 });
    expect(slotEntries("chatCard.buttons").map(e => e.template)).toEqual(["early.html", "late.html"]);
  });

  test("an entry without an order sorts before an explicitly later one", () => {
    registerSlot("s", { template: "default.html" });
    registerSlot("s", { template: "later.html", order: 1 });
    expect(slotEntries("s").map(e => e.template)).toEqual(["default.html", "later.html"]);
  });

  test("the visibility check receives the render context", () => {
    registerSlot("s", { template: "shown.html", when: ctx => ctx.show === true });
    expect(slotEntries("s", { show: true })).toHaveLength(1);
    expect(slotEntries("s", { show: false })).toHaveLength(0);
  });

  test("an entry without a template is refused", () => {
    expect(registerSlot("s", {})).toBe(false);
    expect(slotEntries("s")).toEqual([]);
  });

  test("an unknown slot renders as nothing", () => {
    expect(renderSlot("nobody.registered.here", {})).toEqual("");
  });

  test("a registered partial is rendered with the context", () => {
    Handlebars.registerPartial("spike-slot.html", "<p>{{name}}</p>");
    registerSlot("s", { template: "spike-slot.html" });
    expect(renderSlot("s", { name: "Hex" })).toEqual("<p>Hex</p>");
    Handlebars.unregisterPartial("spike-slot.html");
  });

  test("a missing partial is skipped instead of breaking the render", () => {
    registerSlot("s", { template: "never-loaded.html" });
    expect(renderSlot("s", {})).toEqual("");
  });
});
