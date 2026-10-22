import { registerCard, renderCard, updateCard } from "../../module/common/chat-cards.js";
import { resetWorld } from "../setup/factories.js";

/**
 * Posts a card of a registered kind with a state.
 * @param {String} key - The kind of card
 * @param {Object} state - Its state
 * @returns {Promise<Object>} The card
 */
async function posted(key, state) {
  return ChatMessage.create({ content: await renderCard(key, state), flags: { eclipsephase: { [key]: state } } });
}

beforeEach(() => {
  resetWorld();
  registerCard("tally", {
    render: async state => `<p>${state.title}: ${state.marks.join(",")}</p>`,
    mutations: { mark: (state, { mark }) => ({ ...state, marks: [...state.marks, mark] }) }
  });
  registerCard("note", { render: async state => `<em>${state.text}</em>` });
});

describe("changing a chat card", () => {
  test("the card is drawn again from its changed state, each kind with its own look", async () => {
    const tally = await posted("tally", { title: "Hits", marks: [] });
    const note = await posted("note", { text: "before" });

    await updateCard(tally, "tally", "mark", { mark: "Ana" });
    await updateCard(note, "note", "merge", { text: "after" });

    expect(tally.content).toBe("<p>Hits: Ana</p>");
    expect(tally.getFlag("eclipsephase", "tally").marks).toEqual(["Ana"]);
    expect(note.content).toBe("<em>after</em>");
  });

  test("changes arriving together are applied one after another, none lost", async () => {
    const tally = await posted("tally", { title: "Hits", marks: [] });

    await Promise.all(["Ana", "Bo", "Cy"].map(mark => updateCard(tally, "tally", "mark", { mark })));

    expect(tally.getFlag("eclipsephase", "tally").marks).toEqual(["Ana", "Bo", "Cy"]);
  });

  test("further fields ride along in the same update", async () => {
    const note = await posted("note", { text: "before" });

    await updateCard(note, "note", "merge", { text: "after" }, { extra: { "flags.eclipsephase.other.done": true } });

    expect(note.getFlag("eclipsephase", "other")).toEqual({ done: true });
  });

  test("a user who may not change the card sends the change to the active GM", async () => {
    const note = await posted("note", { text: "before" });
    note.author = "someone-else";
    game.user.isGM = false;
    game.users.activeGM = { id: "gm-1" };
    const emitted = [];
    const realEmit = game.socket.emit;
    game.socket.emit = (name, payload) => emitted.push(payload);

    try {
      expect(await updateCard(note, "note", "merge", { text: "after" })).toBe(false);
    } finally {
      game.socket.emit = realEmit;
      game.user.isGM = true;
    }

    expect(emitted).toEqual([{ action: "updateCard", messageId: note.id, key: "note", mutation: "merge", payload: { text: "after" }, extra: {} }]);
    expect(note.content).toBe("<em>before</em>");
  });

  test("a card of an unknown kind, or without its state, is left alone", async () => {
    const note = await posted("note", { text: "before" });

    expect(await updateCard(note, "unknown", "merge", { text: "x" })).toBe(false);
    expect(await updateCard(note, "tally", "mark", { mark: "x" })).toBe(false);
    expect(note.content).toBe("<em>before</em>");
  });
});
