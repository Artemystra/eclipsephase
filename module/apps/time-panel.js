import { addWindowControls, addDragSupport, addMinimizeSupport } from "../common/general-sheet-functions.js";
import { elapsedTime, formatTimeOfDay, worldTimeForDate, worldTimeAtTimeOfDay, secondsForClock, secondsForBeat, advanceLabel, advanceSeconds, spanTooltip, ADVANCE_PRESETS, HOURS, BEATS } from "../common/time.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMP_EFFECT_FLAGS = ["effectKey", "chiPushBoost", "dose"];

/**
 * Whether an effect is one the panel should list: anything Foundry tracks a duration for, plus the
 * system's own temporary effects, which end on an event rather than on a clock.
 * @param {ActiveEffect} effect - The effect to judge
 * @returns {Boolean} True when the effect belongs in the list
 */
export function isRunningEffect(effect) {
  if (effect.isTemporary) return true;
  return TEMP_EFFECT_FLAGS.some(flag => effect.getFlag?.("eclipsephase", flag) !== undefined);
}

/**
 * The characters the recharge reset applies to: the assigned characters of every connected player.
 * @returns {Actor[]} The actors, without duplicates
 */
export function rechargeTargets() {
  const actors = new Map();
  for (const user of game.users) {
    if (user.isGM || !user.active || !user.character) continue;
    actors.set(user.character.id, user.character);
  }
  return [...actors.values()];
}

/**
 * The actors whose running effects the list shows. A GM sees everything in the world, since a
 * toxin ticking on an enemy is exactly what they need to keep track of; a player sees only their
 * own character, so the panel never leaks what the GM has running elsewhere.
 * @returns {Actor[]} The actors to read effects from
 */
export function watchedActors() {
  if (!game.user.isGM) return game.user.character ? [game.user.character] : [];
  return [...game.actors];
}

/**
 * Every running effect on the watched actors, grouped under the actor carrying them. Item-owned
 * effects are included, since that is where a sleight's or a drug's own effect lives.
 * @returns {Object[]} One group per actor, each with its name, count and effect rows
 */
export function runningEffectGroups() {
  const groups = [];

  for (const actor of watchedActors()) {
    const owned = [...actor.effects];
    for (const item of actor.items) owned.push(...item.effects);

    const rows = [];
    for (const effect of owned) {
      if (effect.disabled || !isRunningEffect(effect)) continue;
      const description = effect.description || effect.parent?.system?.description || "";
      rows.push({
        actorId: actor.id,
        effectId: effect.id,
        parentId: effect.parent?.id ?? null,
        onItem: effect.parent !== actor,
        name: effect.name,
        expired: effect.duration?.expired === true,
        remaining: effect.duration?.label ?? "",
        hasInfo: !!description,
        description
      });
    }

    if (!rows.length) continue;
    rows.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ actorId: actor.id, name: actor.name, count: rows.length, effects: rows });
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

export default class EPtimePanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ep-time-panel",
    classes: ["eclipsephase", "sheet", "ep-time-panel"],
    tag: "div",
    window: {
      title: "ep2e.time.title",
      resizable: false
    },
    position: {
      width: 420,
      height: "auto"
    },
    actions: {
      advance: EPtimePanel._onAdvance,
      advanceCustom: EPtimePanel._onAdvanceCustom,
      endEffect: EPtimePanel._onEndEffect,
      restoreRest: EPtimePanel._onRestoreRest,
      toggleAutoReset: EPtimePanel._onToggleAutoReset,
      toggleEffects: EPtimePanel._onToggleEffects,
      toggleActor: EPtimePanel._onToggleActor,
      effectInfo: EPtimePanel._onEffectInfo,
      beatsInfo: EPtimePanel._onBeatsInfo,
      toggleFormat: EPtimePanel._onToggleFormat
    }
  };

  /** @inheritDoc */
  _getHeaderControls() {
    return [{
      icon: "fas fa-stopwatch",
      label: "ep2e.time.toggleFormat",
      action: "toggleFormat"
    }];
  }

  static PARTS = {
    body: {
      template: "systems/eclipsephase/templates/apps/time-panel.hbs",
      root: true
    }
  };

  // Collapsed state is per client and per session: the list opens on the first render so the GM
  // sees what is running, and stays however they leave it afterwards.
  #effectsOpen = true;

  // Set once the panel has been dragged, after which it stays where it was put.
  #userMoved = false;

  // Which actors' effect lists are expanded, per client and per session.
  #openActors = new Set();

  static #instance = null;

  static #sidebarObserver = null;

  /**
   * The one panel instance, created on first use.
   * @returns {EPtimePanel} The panel
   */
  static get instance() {
    if (!EPtimePanel.#instance) EPtimePanel.#instance = new EPtimePanel();
    return EPtimePanel.#instance;
  }

  /**
   * Opens the panel, or brings it to the front when it is already open.
   * @returns {Promise<EPtimePanel>} The rendered panel
   */
  static open() {
    return EPtimePanel.instance.render({ force: true });
  }

  /**
   * Re-renders the panel if it is currently open, for the hooks that change what it shows.
   * @returns {void}
   */
  static refresh() {
    if (EPtimePanel.#instance?.rendered) EPtimePanel.#instance.render();
  }

  /**
   * Whether this client may operate the clock. Players can be given the panel to look at, never
   * the controls - world time is a GM-only setting in Foundry either way.
   * @returns {Boolean} True for a GM
   */
  get canControl() {
    return game.user.isGM;
  }

  async _prepareContext() {
    const worldTime = game.time.worldTime;
    const format = game.settings.get("eclipsephase", "timeFormat");
    const { year, dayOfYear, day, hour, minute, beat } = elapsedTime(worldTime);
    const inBeats = format === BEATS;

    return {
      canControl: this.canControl,
      year,
      dayOfYear,
      day,
      showYear: year > 1,
      timeOfDay: formatTimeOfDay(worldTime, format),
      inBeats,
      hour: String(hour).padStart(2, "0"),
      minute: String(minute).padStart(2, "0"),
      beat: String(beat).padStart(3, "0"),
      // Each format's tooltip shows the other one, so either reading is a hover away.
      clockTooltip: formatTimeOfDay(worldTime, inBeats ? HOURS : BEATS),
      presets: ADVANCE_PRESETS.map(preset => {
        const seconds = advanceSeconds(preset, format);
        const inBeats = format === BEATS && preset.beatLabel;
        return {
          id: preset.id,
          seconds,
          label: advanceLabel(preset, format),
          tooltip: inBeats ? spanTooltip(seconds) : ""
        };
      }),
      autoReset: game.settings.get("eclipsephase", "rechargeAutoReset"),
      effectsOpen: this.#effectsOpen,
      // A player only ever sees their own character, so grouping by actor would add a level that
      // never has anything to choose between.
      grouped: this.canControl,
      groups: runningEffectGroups().map(group => ({ ...group, open: this.#openActors.has(group.actorId) })),
      effects: runningEffectGroups().flatMap(group => group.effects)
    };
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;
    if (!html) return;

    const windowHeader = html.querySelector(".window-header");
    if (windowHeader) windowHeader.style.display = "none";

    const titlebar = html.querySelector(".ep-sheet-titlebar");
    addWindowControls(this, titlebar);
    addDragSupport(this, titlebar);
    addMinimizeSupport(this, titlebar);
    titlebar?.addEventListener("mousedown", event => {
      if (event.button === 0 && !event.target.closest("[data-action], button, input, select")) this.#userMoved = true;
    });

    for (const input of html.querySelectorAll(".ep-time-date-input")) {
      input.addEventListener("change", () => this.setDateFromHeader());
    }
    for (const input of html.querySelectorAll(".ep-time-clock-input")) {
      input.addEventListener("change", () => this.setTimeOfDayFromClock());
    }
    EPtimePanel.watchSidebar();
    this.pinToSidebar();
  }

  /**
   * Parks the panel at the top right, immediately left of the sidebar, so it sits beside the tray
   * instead of underneath it. Measured from the sidebar's left edge rather than its width, which
   * is what moves when the tray is collapsed or expanded. Skipped once the GM has dragged the
   * panel somewhere of their own choosing.
   * @returns {void}
   */
  pinToSidebar() {
    if (this.#userMoved) return;
    const gap = 10;
    const width = this.position?.width ?? 420;
    const sidebarLeft = document.getElementById("sidebar")?.getBoundingClientRect().left ?? window.innerWidth;
    this.setPosition({
      left: Math.max(gap, sidebarLeft - width - gap),
      top: gap
    });
  }

  /**
   * Re-parks the open panel after the sidebar has been collapsed or expanded, or the window
   * resized. Deferred by a frame so the measurement is taken once the new layout has settled.
   * @returns {void}
   */
  static reposition() {
    if (!EPtimePanel.#instance?.rendered) return;
    requestAnimationFrame(() => EPtimePanel.#instance?.pinToSidebar());
  }

  /**
   * Watches the sidebar's own geometry rather than the collapse event. The tray also opens when a
   * tab is clicked while it is closed, which never fires collapseSidebar - observing the element
   * catches every way it can change width, whatever triggered it.
   * @returns {void}
   */
  static watchSidebar() {
    if (EPtimePanel.#sidebarObserver || typeof ResizeObserver === "undefined") return;
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    EPtimePanel.#sidebarObserver = new ResizeObserver(() => EPtimePanel.reposition());
    EPtimePanel.#sidebarObserver.observe(sidebar);
  }

  /**
   * Moves the world clock on by a preset step.
   * @param {Event} event - The originating click
   * @param {HTMLElement} target - The button, carrying the step in seconds
   * @returns {Promise<void>} Resolves once the clock has moved
   */
  static async _onAdvance(event, target) {
    const seconds = Number(target.dataset.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    await game.time.advance(seconds);
  }

  /**
   * Moves the world clock on by the number of minutes typed into the custom field.
   * @returns {Promise<void>} Resolves once the clock has moved
   */
  static async _onAdvanceCustom() {
    const input = this.element.querySelector("[name='customMinutes']");
    const minutes = Number(input?.value);
    if (!Number.isFinite(minutes) || minutes === 0) return;
    await game.time.advance(Math.round(minutes * 60));
    input.value = "";
  }

  /**
   * Sets the clock from the year and day typed into the header, keeping the time of day. Moving
   * the date by hand can expire effects that were running, the same as letting time pass would.
   * @returns {Promise<void>} Resolves once the clock is set
   */
  async setDateFromHeader() {
    const year = Number(this.element.querySelector("[name='year']")?.value);
    const dayOfYear = Number(this.element.querySelector("[name='dayOfYear']")?.value);
    if (!Number.isFinite(year) || !Number.isFinite(dayOfYear)) return;

    const current = elapsedTime(game.time.worldTime);
    if (year === current.year && dayOfYear === current.dayOfYear) return;

    const secondsIntoDay = game.time.worldTime % 86400;
    await game.time.set(worldTimeForDate(year, dayOfYear) + secondsIntoDay);
  }

  /**
   * Sets the time of day from the clock fields, keeping the current day. Reads beats or hours and
   * minutes depending on which the panel is showing.
   * @returns {Promise<void>} Resolves once the clock is set
   */
  async setTimeOfDayFromClock() {
    const field = name => Number(this.element.querySelector(`[name='${name}']`)?.value);
    const inBeats = game.settings.get("eclipsephase", "timeFormat") === BEATS;
    const secondsIntoDay = inBeats
      ? secondsForBeat(field("beat"))
      : secondsForClock(field("hour"), field("minute"));

    await game.time.set(worldTimeAtTimeOfDay(game.time.worldTime, secondsIntoDay));
  }

  /**
   * Switches the panel between hours and beats without going through the settings menu.
   * @returns {Promise<void>} Resolves once the new format is stored
   */
  static async _onToggleFormat() {
    const current = game.settings.get("eclipsephase", "timeFormat");
    await game.settings.set("eclipsephase", "timeFormat", current === BEATS ? HOURS : BEATS);
    await this.render();
  }

  /**
   * Ends one running effect straight from the list.
   * @param {Event} event - The originating click
   * @param {HTMLElement} target - The row's button, carrying the actor, parent and effect ids
   * @returns {Promise<void>} Resolves once the effect is gone
   */
  static async _onEndEffect(event, target) {
    const { actorId, parentId, effectId, onItem } = target.dataset;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const parent = onItem === "true" ? actor.items.get(parentId) : actor;
    await parent?.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
  }

  /**
   * Clears the per-day recharge allowances on every watched character, for a GM who has moved the
   * clock by hand rather than through a rest.
   * @returns {Promise<void>} Resolves once every character is updated
   */
  static async _onRestoreRest() {
    for (const actor of rechargeTargets()) {
      await actor.update({
        "system.rest.short1": false,
        "system.rest.short2": false,
        "system.rest.shortExtra": false,
        "system.rest.long": false
      });
    }
    ui.notifications.info(game.i18n.localize("ep2e.time.restRestored"));
  }

  /**
   * Turns the automatic day-change reset on or off, for a table that would rather clear the
   * recharges by hand.
   * @returns {Promise<void>} Resolves once the new state is stored
   */
  static async _onToggleAutoReset() {
    const current = game.settings.get("eclipsephase", "rechargeAutoReset");
    await game.settings.set("eclipsephase", "rechargeAutoReset", !current);
    await this.render();
  }

  /**
   * Explains what beats are, for anyone meeting Swatch Internet Time for the first time.
   * @returns {Promise<void>} Resolves once the dialog is dismissed
   */
  static async _onBeatsInfo() {
    await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ep2e.time.beatsInfo.title") },
      content: `<div class="ep-time-effect-info">${game.i18n.localize("ep2e.time.beatsInfo.copy")}</div>`,
      ok: { label: game.i18n.localize("ep2e.time.close") },
      modal: true
    });
  }

  /**
   * Expands or collapses one actor's list of running effects.
   * @param {Event} event - The originating click
   * @param {HTMLElement} target - The actor row, carrying its id
   * @returns {Promise<void>} Resolves once the panel has re-rendered
   */
  static async _onToggleActor(event, target) {
    const actorId = target.dataset.actorId;
    if (this.#openActors.has(actorId)) this.#openActors.delete(actorId);
    else this.#openActors.add(actorId);
    await this.render();
  }

  /**
   * Shows one effect's description in the system's standard dialog.
   * @param {Event} event - The originating click
   * @param {HTMLElement} target - The info icon, carrying the actor, parent and effect ids
   * @returns {Promise<void>} Resolves once the dialog is dismissed
   */
  static async _onEffectInfo(event, target) {
    const { actorId, parentId, effectId, onItem } = target.dataset;
    const actor = game.actors.get(actorId);
    const parent = onItem === "true" ? actor?.items.get(parentId) : actor;
    const effect = parent?.effects.find(entry => entry.id === effectId);
    if (!effect) return;

    const description = effect.description || parent?.system?.description || "";
    await foundry.applications.api.DialogV2.prompt({
      window: { title: effect.name },
      content: `<div class="ep-time-effect-info">${description}</div>`,
      ok: { label: game.i18n.localize("ep2e.time.close") },
      modal: true
    });
  }

  /**
   * Collapses or expands the running-effects list.
   * @returns {Promise<void>} Resolves once the panel has re-rendered
   */
  static async _onToggleEffects() {
    this.#effectsOpen = !this.#effectsOpen;
    await this.render();
  }
}
