import { ownerVision } from "../../module/rolls/chat.js";

/**
 * A stand-in chat card carrying one private button per owner id given.
 * @param {String[]} ownerIds - The data-ownerid of each button, in order
 * @returns {Object} An element exposing the querySelector API ownerVision uses
 */
function cardWithButtons(ownerIds) {
  const buttons = ownerIds.map(ownerid => ({
    ownerid,
    classes: new Set(),
    classList: { add(name) { this.owner.classes.add(name); } },
    getAttribute: name => (name === "data-ownerid" ? ownerid : null)
  }));
  buttons.forEach(button => { button.classList.owner = button; });

  return {
    buttons,
    querySelector: selector => (selector === ".privateChatButton" ? buttons[0] ?? null : null),
    querySelectorAll: selector => (selector === ".privateChatButton" ? buttons : [])
  };
}

/**
 * Registers an actor the card's buttons can point at.
 * @param {String} id - The actor id
 * @param {Boolean} isOwner - Whether the current user owns it
 * @returns {void}
 */
function registerActor(id, isOwner) {
  game.actors.set(id, { id, isOwner });
}

beforeEach(() => {
  game.actors.clear();
});

describe("hiding private buttons from users who do not own the actor", () => {
  test("a button whose actor the user does not own is hidden", async () => {
    registerActor("a1", false);
    const card = cardWithButtons(["a1"]);

    await ownerVision(card);

    expect(card.buttons[0].classes.has("noShow")).toBe(true);
  });

  test("a button whose actor the user owns is left visible", async () => {
    registerActor("a1", true);
    const card = cardWithButtons(["a1"]);

    await ownerVision(card);

    expect(card.buttons[0].classes.has("noShow")).toBe(false);
  });

  test("every private button on the card is judged, not only the first", async () => {
    registerActor("a1", false);
    registerActor("a2", false);
    registerActor("a3", false);
    const card = cardWithButtons(["a1", "a2", "a3"]);

    await ownerVision(card);

    expect(card.buttons.map(button => button.classes.has("noShow"))).toEqual([true, true, true]);
  });

  test("buttons are judged one by one, so an owned one stays while a foreign one goes", async () => {
    registerActor("mine", true);
    registerActor("theirs", false);
    const card = cardWithButtons(["mine", "theirs"]);

    await ownerVision(card);

    expect(card.buttons.map(button => button.classes.has("noShow"))).toEqual([false, true]);
  });

  test("a card without private buttons is left alone", async () => {
    const card = cardWithButtons([]);
    await expect(ownerVision(card)).resolves.toBeUndefined();
  });

  test("a button pointing at an actor that no longer exists is left visible", async () => {
    const card = cardWithButtons(["gone"]);

    await ownerVision(card);

    expect(card.buttons[0].classes.has("noShow")).toBe(false);
  });
});
