import { addWindowControls, addDragSupport, addMinimizeSupport, registerCommonHandlers, itemTypeFilterPills, transferItemBetweenActors } from "../common/general-sheet-functions.js";
import { requestGMItemTransfer, completeShopPurchase, hasFreeFavorSlot } from "../common/general-helper-functions.js";
import * as DICE from "../rolls/dice.js";
import * as MORPHFUNCTION from "../common/morp-functions.js";

const FAVOR_TIER_RANK = { trivial: 0, minor: 1, moderate: 2, major: 3 };
// "Kaufen" (Diemen's Spezialbräu house rule, superBrew setting): flat Rep cost, no roll - Trivial
// has no RAW cost equivalent, treated as free.
const FLAT_BUY_COST = { trivial: 0, minor: 15, moderate: 30, major: 60 };
// "Gefallen einlösen": per-item Sell-Bonus contribution when staged in "To Sell", summed and capped
// at BONUS_CAP - same cap independently applies to the Rep-Burn-Bonus (burned points x2).
const SELL_BONUS_PER_TIER = { trivial: 0, minor: 5, moderate: 15, major: 30 };
const BONUS_CAP = 30;
// Plain "Verkaufen" (no active purchase): per-item Rep gain, summed with no cap - exclusive with
// SELL_BONUS_PER_TIER above, an item staged for one purpose is never staged for the other at once.
const SELL_REP_PER_TIER = { trivial: 0, minor: 5, moderate: 10, major: 20 };

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export default class EPshopSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["eclipsephase", "sheet", "actor", "shop"],
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    position: {
      width: 900,
      height: 600
    },
    window: {
      resizable: false
    },
    actions: {
      editImage: this._onEditImage,
      // Same rare core edge case as EPactorSheet - see project_release_v21_todo.md.
      configureToken: function () {
        if (!this.actor.token) return ui.notifications.warn(game.i18n.localize("ep2e.actorSheet.warnings.noPlacedToken"));
        this.actor.token.sheet.render({ force: true });
      }
    }
  };

  static PARTS = {
    body: {
      template: "systems/eclipsephase/templates/actor/shop-sheet.html",
      root: true,
      scrollable: [".shop-to-sell-column .shop-column-scroll", ".shop-inventory-column .shop-column-scroll"]
    }
  };

  static TABS = {
    primary: {
      initial: "shop",
      tabs: [
        { id: "shop", label: "ep2e.shop.tabs.shop" },
        { id: "settings", label: "ep2e.shop.tabs.settings" }
      ]
    }
  };

  tabGroups = {
    primary: "shop"
  };

  // Transient, never persisted to the actor - lives on the sheet instance like tabGroups above,
  // so it survives re-renders within the session but resets on close (see project_shop_system_research.md).
  _itemTypeFilter = [];

  // Item types actually present on the shop, minus whatever's already an active filter - the
  // dropdown only ever offers types that would actually change the visible list.
  _getFilterSuggestions() {
    const types = new Set(this.actor.items.map(i => i.type));
    this._itemTypeFilter.forEach(type => types.delete(type));
    return [...types].sort().reduce((acc, type) => {
      acc[type] = `TYPES.Item.${type}`;
      return acc;
    }, {});
  }

  // Inclusive OR: no filter shows everything, one or more selected types show only those.
  _getFilteredItems() {
    if (!this._itemTypeFilter.length) return this.actor.items.filter(() => true);
    return this.actor.items.filter(item => this._itemTypeFilter.includes(item.type));
  }

  /**
   * Filtered items grouped by type (localized label), each group sorted alphabetically by name;
   * groups themselves sorted alphabetically by label.
   * @returns {Array<{label: string, items: Item[]}>}
   */
  _getGroupedItems() {
    const groups = new Map();
    for (const item of this._getFilteredItems()) {
      const label = game.i18n.localize(`TYPES.Item.${item.type}`);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label, items: items.sort((a, b) => a.name.localeCompare(b.name)) }));
  }

  // Staged sales: stagingKey -> {sourceActorId, itemId, quantity}. Client-side only, never persisted.
  // Keyed by sourceActor.id+item.id, not item.uuid - a token-drag's uuid differs from the
  // canonical-actor uuid _getToSellEntries() re-resolves, so they'd never match.
  _toSell = new Map();

  // Set only when a GM (or any user without their own game.user.character) drags another actor's
  // item onto the shop to sell for them - see _onDropItem(). Never used by buying (Kaufen/Gefallen
  // einlösen stay bound to game.user.character only, per Schritt-12 OQ2).
  _actingCharacterId = null;

  /**
   * Who this sell transaction is acting as: the viewing user's own character first, else a
   * GM-picked acting character (see _onDropItem()), else null.
   * @returns {Actor|null}
   */
  _getActingCharacter() {
    if (game.user.character) return game.user.character;
    if (this._actingCharacterId) return game.actors.get(this._actingCharacterId) ?? null;
    return null;
  }

  // Clears the acting-character context once nothing is staged anymore (Schritt-12 OQ3) - called
  // after every mutation of _toSell.
  _maybeResetActingCharacter() {
    if (this._toSell.size === 0) this._actingCharacterId = null;
  }

  _stagingKey(sourceActor, item) {
    return `${sourceActor.id}.${item.id}`;
  }

  _stageForSale(item, sourceActor) {
    const key = this._stagingKey(sourceActor, item);
    if (this._toSell.has(key)) return;
    this._toSell.set(key, {
      sourceActorId: sourceActor.id,
      itemId: item.id,
      quantity: 1
    });
    this.render();
  }

  // Resolves staged entries against their live source actor/item each render - drops anything
  // that's gone missing since staging (deleted, sold elsewhere, source actor unavailable).
  _getToSellEntries() {
    const entries = [];
    for (const [key, staged] of this._toSell) {
      const item = game.actors.get(staged.sourceActorId)?.items.get(staged.itemId);
      if (!item) {
        this._toSell.delete(key);
        continue;
      }
      // Scratch property for the template, same pattern EPactorSheet.js uses to stash render-only
      // data directly on live documents (e.g. actor.trait/actor.gearActive).
      item.shopStagingKey = key;
      entries.push(item);
    }
    this._maybeResetActingCharacter();
    return entries;
  }

  // Buttons ordered confirm-first - DialogV2's Enter key submits the first button in the array
  // regardless of which one is flagged default:true (see project_dialogv2_enter_key_bug.md).
  // Grants the Rep-for-selling gain (Schritt 7) - exclusive with _useGefallen()'s Sell-Bonus, which
  // calls _confirmSell() directly and never goes through this method.
  async _confirmSellDialog() {
    if (this._isClosedForSelling()) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.shopClosed"));
    }

    // Networks only offered if there's actually a controlled character to credit - selling still
    // works without one (see _useGefallen() family), it just can't grant Rep to anyone.
    const networks = this._getSellNetworkOptions();

    const lines = [`<p>${game.i18n.localize("ep2e.shop.toSell.confirmMessage")}</p>`];
    if (this.actor.isOwner) {
      lines.push(`<p><strong>${game.i18n.localize("ep2e.shop.toSell.ownerWarning")}</strong></p>`);
    }
    if (networks.length) lines.push(this._networkSelectMarkup(networks, game.i18n.localize("ep2e.shop.dialog.selectNetwork.headline")));

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("ep2e.shop.toSell.confirm") },
      classes: ["ep2e-primary-right"],
      content: lines.join(""),
      buttons: [
        { action: "confirm", label: game.i18n.localize("ep2e.shop.toSell.confirm"), default: true, callback: (event, button) => ({ network: button.form.NetworkSelect?.value ?? null }) },
        { action: "cancel", label: game.i18n.localize("ep2e.roll.dialog.button.cancel"), callback: () => ({ cancelled: true }) }
      ],
      position: { width: 276 },
      modal: true,
      rejectClose: false,
      render: networks.length ? (event, dialog) => this._syncNetworkSelectConfirm(dialog) : undefined
    });
    // A falsy callback return (e.g. bare null) breaks DialogV2 resolution on this Foundry version -
    // every button here must resolve truthy, same convention as selectBody()/showOptionsDialog().
    if (!result || result.cancelled) return;
    const network = result.network;

    const repGain = this._getSellRepGain();
    // Captured before _confirmSell() clears the acting-character context once staging empties out.
    const character = this._getActingCharacter();

    await this._confirmSell();

    if (repGain > 0 && network) {
      const idItem = character?.isOwner ? character.items.get(character.system.activeID) : null;
      if (idItem) {
        const current = Number(idItem.system?.rep?.[network]?.value ?? 0);
        await idItem.update({ [`system.rep.${network}.value`]: current + repGain });
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: character }),
          content: `<p>${game.i18n.format("ep2e.shop.toSell.repGainMessage", { character: character.name, amount: repGain, network: network.replace("-rep", "") })}</p>`
        });
        // _confirmSell() already rendered once, before this rep grant happened - the shop's own
        // "Accepted Rep" display would otherwise keep showing the pre-gain value until some
        // unrelated re-render happened to catch it up.
        this.render();
      }
    }
  }

  // Transfers every currently staged item to this shop - direct if the user owns both sides,
  // otherwise via the GM-relay socket (same as EPactorSheet.js's cross-actor drop handling).
  async _confirmSell() {
    for (const [uuid, staged] of [...this._toSell]) {
      const sourceActor = game.actors.get(staged.sourceActorId);
      const item = sourceActor?.items.get(staged.itemId);
      if (!sourceActor || !item) {
        this._toSell.delete(uuid);
        continue;
      }

      // Re-validate against the item's current quantity - it may have changed since staging.
      const liveQty = Number(item.system.quantity ?? 1);
      const quantity = Math.max(1, Math.min(staged.quantity, liveQty));

      if (sourceActor.isOwner && this.actor.isOwner) {
        await transferItemBetweenActors({ sourceActor, targetActor: this.actor, item, quantity });
      } else {
        const result = await requestGMItemTransfer({
          sourceActorId: sourceActor.id,
          targetActorId: this.actor.id,
          itemId: item.id,
          quantity
        });
        if (!result?.ok) {
          ui.notifications.warn(result?.error ?? game.i18n.localize("ep2e.shop.warnings.sellFailed"));
          continue;
        }
      }
      this._toSell.delete(uuid);
    }
    this._maybeResetActingCharacter();
    this.render();
  }

  // Allows drops even when the shop itself isn't editable by the current user - Observer needs to
  // be able to drop onto it to stage a sale. See EPactorSheet.js for the same override.
  _canDragDrop(selector) {
    return true;
  }

  async _onDropItem(event, item) {
    const targetActor = this.actor;
    const sourceActor = item.parent instanceof Actor ? item.parent : null;

    // Same-actor drag (e.g. reordering the shop's own list) - nothing to do.
    if (sourceActor && sourceActor.id === targetActor.id) return null;

    // Any cross-actor drag (Owner or anyone with at least Limited permission, including the Owner
    // dragging from one of their OTHER own characters) always stages for sale first, never
    // transfers instantly - that's what lets _confirmSellDialog()'s "you own this shop, sell to
    // yourself?" warning actually fire instead of being silently bypassed for Owner.
    if (sourceActor) {
      if (!targetActor.testUserPermission(game.user, "LIMITED")) return null;
      if (this._isClosedForSelling()) {
        ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.shopClosed"));
        return null;
      }
      // Only tracked when the dragging user has no own character - a GM (or character-less user)
      // sells for whichever actor they first dragged from, blocked from switching mid-transaction.
      if (!game.user.character) {
        if (this._actingCharacterId && this._actingCharacterId !== sourceActor.id) {
          ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.differentActingCharacter"));
          return null;
        }
        this._actingCharacterId = sourceActor.id;
      }
      this._stageForSale(item, sourceActor);
      return null;
    }

    // Compendium/sidebar drops (stocking the shop, no source actor involved) still create
    // directly, and still require edit rights.
    if (this.isEditable) return super._onDropItem(event, item);
    return null;
  }

  _getAcceptedNetworks() {
    const accepted = this.actor.system.acceptedRepNetworks ?? {};
    return Object.keys(accepted).filter(key => accepted[key]);
  }

  // Selling is blocked if the shop accepts no Rep networks at all, or the Owner explicitly turned
  // off sale acceptance - buying is unaffected by either.
  _isClosedForSelling() {
    return !this._getAcceptedNetworks().length || this.actor.system.acceptsSales === false;
  }

  // Owner sees just which networks are accepted (no "their own" rep value makes sense to show
  // them); anyone else sees each accepted network's value on their own controlled character.
  _getAcceptedRepDisplay(isOwnerView) {
    const networks = this._getAcceptedNetworks();
    if (!networks.length) return { mode: "closed" };

    // An acting character (own or a GM-picked one, see _getActingCharacter()) always wins, even
    // for Owner/GM - only falls back to network-names-only (Owner) or the noCharacter warning
    // (Observer) once there's truly no one to show values for.
    const character = this._getActingCharacter();
    if (!character?.isOwner) {
      return isOwnerView
        ? { mode: "owner", text: networks.map(network => network.replace("-rep", "")).join("; ") }
        : { mode: "noCharacter" };
    }

    const idItem = character.items.get(character.system.activeID);
    const rep = idItem?.system?.rep ?? {};
    const text = networks.map(network => {
      const value = Number(rep[network]?.value ?? 0);
      return `${network.replace("-rep", "")}: ${value}`;
    }).join(" ");
    return { mode: "observer", character: character.name, text };
  }

  // Checked item ids, client-side only.
  _selectedForPurchase = new Set();

  // Accepted networks with `character`'s Rep values, sorted highest first.
  _networkOptionsFor(character) {
    if (!character?.isOwner) return [];
    const idItem = character.items.get(character.system.activeID);
    const rep = idItem?.system?.rep ?? {};
    return this._getAcceptedNetworks()
      .map(network => {
        const value = Number(rep[network]?.value ?? 0);
        return { network, value, label: `${network.replace("-rep", "")} (${value})` };
      })
      .sort((a, b) => b.value - a.value);
  }

  /**
   * Accepted networks with the user's own character's Rep values - used by Kaufen/Gefallen
   * einlösen, which stay bound to game.user.character only (Schritt-12 OQ2), never the acting
   * character used by selling.
   * @returns {Array<{network: string, value: number, label: string}>}
   */
  _getPurchaseNetworkOptions() {
    return this._networkOptionsFor(game.user.character);
  }

  /**
   * Accepted networks with the ACTING character's Rep values - used by the sell-confirmation
   * dialog, so a GM selling on behalf of another character can credit that character.
   * @returns {Array<{network: string, value: number, label: string}>}
   */
  _getSellNetworkOptions() {
    return this._networkOptionsFor(this._getActingCharacter());
  }

  /**
   * The favor tier a single item resolves to, via this shop's cost-tier valuation table.
   * @param {Item} item
   * @returns {"trivial"|"minor"|"moderate"|"major"}
   */
  _favorTierForItem(item) {
    const valuation = this.actor.system.valuation ?? {};
    return valuation[item.system.cost] ?? "trivial";
  }

  /**
   * Highest favor tier among the given items' cost tiers.
   * @param {Item[]} items
   * @returns {"trivial"|"minor"|"moderate"|"major"}
   */
  _getRequiredFavorTier(items) {
    let highest = "trivial";
    for (const item of items) {
      const favorTier = this._favorTierForItem(item);
      if (FAVOR_TIER_RANK[favorTier] > FAVOR_TIER_RANK[highest]) highest = favorTier;
    }
    return highest;
  }

  /**
   * Flat "Kaufen" Rep cost for the given items, summed per item's own favor tier.
   * @param {Item[]} items
   * @returns {number}
   */
  _getFlatBuyCost(items) {
    return items.reduce((sum, item) => sum + (FLAT_BUY_COST[this._favorTierForItem(item)] ?? 0), 0);
  }

  /**
   * Sell-Bonus for "Gefallen einlösen", summed from currently staged "To Sell" items by their own
   * favor tier, capped at BONUS_CAP.
   * @returns {number}
   */
  _getSellBonus() {
    let total = 0;
    for (const staged of this._toSell.values()) {
      const item = game.actors.get(staged.sourceActorId)?.items.get(staged.itemId);
      if (!item) continue;
      total += SELL_BONUS_PER_TIER[this._favorTierForItem(item)] ?? 0;
    }
    return Math.min(total, BONUS_CAP);
  }

  /**
   * Rep gain for a plain "Verkaufen" (no active purchase), summed from currently staged "To Sell"
   * items by their own favor tier - no cap.
   * @returns {number}
   */
  _getSellRepGain() {
    let total = 0;
    for (const staged of this._toSell.values()) {
      const item = game.actors.get(staged.sourceActorId)?.items.get(staged.itemId);
      if (!item) continue;
      total += SELL_REP_PER_TIER[this._favorTierForItem(item)] ?? 0;
    }
    return total;
  }

  // Styled like general-modifiers.html. Single network auto-selected; multiple require an explicit
  // choice (see _syncNetworkSelectConfirm()).
  _networkSelectMarkup(networks, headline, hint, hintValue) {
    const options = networks.map(o => `<option value="${o.network}">${o.label}</option>`).join("");
    const select = networks.length === 1
      ? `<select name="NetworkSelect">${options}</select>`
      : `<select name="NetworkSelect"><option value="" selected>${game.i18n.localize("ep2e.shop.dialog.selectNetwork.placeholder")}</option>${options}</select>`;
    const hintRow = hint
      ? `<div class="form-group listBackgroundMain"><label class="resource-labelDialog">${hint}</label><input type="text" value="${hintValue}" disabled/></div>`
      : "";
    return `<div class="contentBoxMargin">
      <div class="flexrow subheader"><h3 class="subheader dialog">${headline}</h3></div>
      ${hintRow}
      <div class="form-group listBackgroundMain shop-network-row">
        <label class="resource-labelDialog">${game.i18n.localize("ep2e.shop.dialog.selectNetwork.label")}</label>
        ${select}
      </div>
    </div>`;
  }

  // Same pattern as selectBody() in general-sheet-functions.js: confirm stays disabled until a
  // non-empty value is chosen.
  _syncNetworkSelectConfirm(dialog) {
    const select = dialog.element.querySelector('select[name="NetworkSelect"]');
    const confirmBtn = dialog.element.querySelector('button[data-action="confirm"]');
    if (!select || !confirmBtn) return;
    const sync = () => { confirmBtn.disabled = !select.value; };
    select.addEventListener("change", sync);
    sync();
  }

  /**
   * Prompts for a Rep network via a DialogV2 select, styled like this system's standard roll
   * dialogs. Confirm disabled until chosen.
   * @param {{title: string, headline: string, hint?: string, hintValue?: string, networks: Array<{network: string, label: string}>, confirmLabel: string}} params
   * @returns {Promise<string|null>} the chosen network, or null if cancelled
   */
  async _selectNetworkDialog({ title, headline, hint, hintValue, networks, confirmLabel }) {
    const content = this._networkSelectMarkup(networks, headline, hint, hintValue);

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title },
      classes: ["ep2e-primary-right"],
      content,
      buttons: [
        { action: "confirm", label: confirmLabel, default: true, callback: (event, button) => ({ selection: button.form.NetworkSelect.value }) },
        { action: "cancel", label: game.i18n.localize("ep2e.roll.dialog.button.cancel"), callback: () => ({ cancelled: true }) }
      ],
      position: { width: 276 },
      modal: true,
      rejectClose: false,
      render: (event, dialog) => this._syncNetworkSelectConfirm(dialog)
    });
    // A falsy callback return (e.g. bare null) breaks DialogV2 resolution on this Foundry version -
    // every button here must resolve truthy, same convention as selectBody()/showOptionsDialog().
    if (!result || result.cancelled) return null;
    return result.selection || null;
  }

  // One row per Ware item, all sharing the same body options. Confirm disabled until every row
  // has a non-placeholder value (see _syncWareBindingConfirm()).
  _wareBindingMarkup(items, bodyGroups) {
    const placeholder = game.i18n.localize("ep2e.dialog.selectBody.placeholder");
    const optgroups = bodyGroups.map(g =>
      `<optgroup label="${g.label}">${g.options.map(o => `<option value="${o.id}">${o.name}</option>`).join("")}</optgroup>`
    ).join("");
    const rows = items.map(item => `
      <div class="form-group listBackgroundMain shop-body-row">
        <label class="resource-labelDialog">${item.name}</label>
        <select name="BodySelect_${item.id}">
          <option value="" selected>${placeholder}</option>
          ${optgroups}
        </select>
      </div>`).join("");
    return `<div class="contentBoxMargin">
      <div class="flexrow subheader"><h3 class="subheader dialog">${game.i18n.localize("ep2e.dialog.selectBody.header")}</h3></div>
      ${rows}
    </div>`;
  }

  _syncWareBindingConfirm(dialog) {
    const selects = dialog.element.querySelectorAll('select[name^="BodySelect_"]');
    const confirmBtn = dialog.element.querySelector('button[data-action="confirm"]');
    if (!selects.length || !confirmBtn) return;
    const sync = () => { confirmBtn.disabled = [...selects].some(s => !s.value); };
    selects.forEach(s => s.addEventListener("change", sync));
    sync();
  }

  /**
   * One combined dialog with a body-select row per item, instead of one dialog per item.
   * @param {Item[]} items
   * @param {Array<{label: string, options: Array<{id: string, name: string}>}>} bodyGroups
   * @returns {Promise<Record<string,string>|null>} itemId -> chosen body id, or null if cancelled
   */
  async _selectWareBindingsDialog(items, bodyGroups) {
    const content = this._wareBindingMarkup(items, bodyGroups);
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("ep2e.dialog.selectBody.header") },
      classes: ["ep2e-primary-right"],
      content,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("ep2e.actorSheet.button.select"),
          default: true,
          callback: (event, button) => ({ bindings: Object.fromEntries(items.map(item => [item.id, button.form[`BodySelect_${item.id}`].value])) })
        },
        { action: "cancel", label: game.i18n.localize("ep2e.roll.dialog.button.cancel"), callback: () => ({ cancelled: true }) }
      ],
      position: { width: 340 },
      modal: true,
      rejectClose: false,
      render: (event, dialog) => this._syncWareBindingConfirm(dialog)
    });
    // A falsy callback return (e.g. bare null) breaks DialogV2 resolution on this Foundry version -
    // every button here must resolve truthy, same convention as selectBody()/showOptionsDialog().
    if (!result || result.cancelled) return null;
    return result.bindings;
  }

  /**
   * Pre-resolves Ware body bindings before any Rep is spent. Aborts the whole purchase (no Rep
   * dialog, nothing spent) if body choice is cancelled or there's no body to bind to at all - Ware
   * can't currently be bought unbound. One combined dialog for all Ware items, not one per item.
   * @param {Actor} character
   * @param {Item[]} items
   * @returns {Promise<{cancelled: boolean, bindings: Record<string,string>}>}
   */
  async _resolveWareBindings(character, items) {
    const wareItems = items.filter(i => i.type === "ware");
    if (!wareItems.length) return { cancelled: false, bindings: {} };

    const { bodies, boundToFor, buildBodyGroups } = MORPHFUNCTION.getBodyBindingInfo(character);

    if (bodies.length === 0) {
      await MORPHFUNCTION.resolveBodyForItem(character, "ep2e.systemMessage.itemAttachment.noBodyWare");
      return { cancelled: true, bindings: {} };
    }

    if (bodies.length === 1) {
      const boundTo = boundToFor(bodies[0]);
      const bindings = {};
      wareItems.forEach(item => bindings[item.id] = boundTo);
      return { cancelled: false, bindings };
    }

    const result = await this._selectWareBindingsDialog(wareItems, buildBodyGroups());
    if (!result) return { cancelled: true, bindings: {} };
    return { cancelled: false, bindings: result };
  }

  /**
   * "Gefallen einlösen": Rep test for the selected items, optionally boosted by a Sell-Bonus
   * (currently staged "To Sell" items, sold on confirm regardless of roll outcome) and/or a
   * Rep-Burn-Bonus (points the player chooses to spend, also regardless of outcome - matches RAW
   * "Burning Rep", which is a cost paid to attempt the roll, not a refundable wager). Success
   * consumes a Favor-Limit slot (small1-3/med1/large) and transfers the items; a later Pool
   * swap/upgrade that rescues a failure re-enters via usePoolFromChat() in pools.js.
   * @returns {Promise<void>}
   */
  async _useGefallen() {
    const character = game.user.character;
    if (!character?.isOwner) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.acceptedRep.noCharacter"));
    }

    const items = [...this._selectedForPurchase].map(id => this.actor.items.get(id)).filter(Boolean);
    if (!items.length) return;

    const { cancelled, bindings } = await this._resolveWareBindings(character, items);
    if (cancelled) return;

    const requiredTier = this._getRequiredFavorTier(items);
    const tierLabel = game.i18n.localize(CONFIG.eclipsephase.favorTiers[requiredTier]);

    const network = await this._selectNetworkDialog({
      title: game.i18n.localize("ep2e.shop.purchase.favorConfirm"),
      headline: `${game.i18n.localize("ep2e.shop.purchase.required")} ${tierLabel}`,
      networks: this._getPurchaseNetworkOptions(),
      confirmLabel: game.i18n.localize("ep2e.shop.purchase.favorConfirm")
    });
    if (!network) return;

    if (!hasFreeFavorSlot(character, network, requiredTier)) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.favorLimitExhausted"));
    }

    const idItem = character.items.get(character.system.activeID);
    const rollValue = Number(idItem?.system?.rep?.[network]?.value ?? 0);

    const sellBonus = this._getSellBonus();

    const systemOptions = {
      askForOptions: false,
      optionsSettings: game.settings.get("eclipsephase", "showTaskOptions"),
      brewStatus: game.settings.get("eclipsephase", "superBrew")
    };
    // Pool-swap rescue re-enters via usePoolFromChat() in pools.js using ids stashed on the chat button.
    const dataset = {
      name: network,
      key: "rep",
      rollvalue: rollValue,
      dialogTitle: `${game.i18n.localize("ep2e.shop.purchase.favorConfirm")} - ${tierLabel}`,
      shopId: this.actor.id,
      buyerActorId: character.id,
      itemIds: items.map(item => item.id).join(","),
      requiredTier,
      sellBonus,
      maxBurn: BONUS_CAP / 2,
      bodyBindings: Object.entries(bindings).map(([id, boundTo]) => `${id}:${boundTo}`).join(",")
    };

    const rollResult = await DICE.RollCheck(dataset, character.system, character, systemOptions, false, "shopPurchase");
    if (!rollResult) return; // cancelled in the options dialog - nothing spent yet, stop here

    // Clamp must match dice.js's clamp on the roll's own burn modifier.
    const requestedBurn = Number(rollResult.options?.burnMod) || 0;
    const actualBurn = Math.max(0, Math.min(requestedBurn, BONUS_CAP / 2, rollValue));
    if (requestedBurn > rollValue) {
      ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.notEnoughRepToBurn"));
    }

    // Rep burn is a cost for attempting the roll, not a refundable wager (RAW).
    if (actualBurn > 0) {
      await idItem.update({ [`system.rep.${network}.value`]: rollValue - actualBurn });
    }
    if (this._toSell.size > 0) {
      await this._confirmSell();
    }

    this._selectedForPurchase.clear();
    this.render();

    if (rollResult.resultClass !== "success") return;
    await completeShopPurchase({
      shopId: dataset.shopId,
      buyerActorId: dataset.buyerActorId,
      itemIds: dataset.itemIds,
      network: dataset.name,
      favorTier: dataset.requiredTier,
      bodyBindings: bindings
    });
  }

  /**
   * "Kaufen" (Diemen's Spezialbräu house rule, only active while the superBrew setting is on): a
   * flat Rep cost per item's own favor tier, no roll, no Favor-Limit interaction.
   * @returns {Promise<void>}
   */
  async _useFlatBuy() {
    if (!game.settings.get("eclipsephase", "superBrew")) return;

    const character = game.user.character;
    if (!character?.isOwner) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.acceptedRep.noCharacter"));
    }

    const items = [...this._selectedForPurchase].map(id => this.actor.items.get(id)).filter(Boolean);
    if (!items.length) return;

    const { cancelled, bindings } = await this._resolveWareBindings(character, items);
    if (cancelled) return;

    const cost = this._getFlatBuyCost(items);
    const network = await this._selectNetworkDialog({
      title: game.i18n.localize("ep2e.shop.purchase.confirm"),
      headline: `${game.i18n.localize("ep2e.shop.purchase.flatBuyCost")} ${cost}`,
      networks: this._getPurchaseNetworkOptions(),
      confirmLabel: game.i18n.localize("ep2e.shop.purchase.confirm")
    });
    if (!network) return;

    const idItem = character.items.get(character.system.activeID);
    const available = Number(idItem?.system?.rep?.[network]?.value ?? 0);

    if (cost > available) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.notEnoughRepToBuy"));
    }

    await idItem.update({ [`system.rep.${network}.value`]: available - cost });

    this._selectedForPurchase.clear();
    this.render();

    await completeShopPurchase({
      shopId: this.actor.id,
      buyerActorId: character.id,
      itemIds: items.map(item => item.id).join(","),
      bodyBindings: bindings
    });
  }

  // Foundry v14 core bug: for a root:true part, _replaceHTML empties newElement before restoring
  // focus, so its own query always misses - retry against the live DOM. See EPactorSheet.js.
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if (state.focus && !newElement.querySelector(state.focus)) {
      this.element.querySelector(state.focus)?.focus();
    }
  }

  // Two-tier permission model: Owner/GM get the full sheet (Shop + Einstellungen tabs), anyone
  // with at least Limited permission gets the interactive buy/sell view - there's no separate
  // read-only tier anymore, Limited and Observer behave identically.
  _getSheetTemplate() {
    const actor = this.document;
    if (game.user.isGM || actor.isOwner) {
      return "systems/eclipsephase/templates/actor/shop-sheet.html";
    }
    return "systems/eclipsephase/templates/actor/shop-sheet-observer.html";
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.body.template = this._getSheetTemplate();
    return parts;
  }

  async _prepareContext(options) {
    const actor = this.document;
    const context = await super._prepareContext(options);
    context.actor = actor;
    context.config = CONFIG.eclipsephase;
    context.editable = this.isEditable;

    // Only Owner/GM ever see the top tab bar (Shop/Einstellungen) - Observer and Limited get a
    // single untabbed view, see _getSheetTemplate().
    const isOwnerView = game.user.isGM || actor.isOwner;
    if (isOwnerView) {
      context.tabs = { primary: this._prepareTabs("primary") };
      context.tabGroups = this.tabGroups;
    }

    // Item list + type filter for both tiers - reaching this method at all already means Foundry
    // granted at least LIMITED access, so no extra permission guard here.
    context.itemGroups = this._getGroupedItems();
    context.itemTypeFilterPills = this._itemTypeFilter.map(type => game.i18n.localize(`TYPES.Item.${type}`));
    context.itemTypeFilterSuggestions = this._getFilterSuggestions();
    context.readOnly = !isOwnerView;
    context.toSellEntries = this._getToSellEntries();
    context.acceptedRep = this._getAcceptedRepDisplay(isOwnerView);

    // Buying is Observer-only.
    context.canPurchase = !isOwnerView;
    if (!isOwnerView) {
      context.selectable = true;
      context.selected = Object.fromEntries([...this._selectedForPurchase].map(id => [id, true]));
      context.purchaseNetworks = this._getPurchaseNetworkOptions();
      context.hasSelection = this._selectedForPurchase.size > 0;
      context.homebrewBuyEnabled = game.settings.get("eclipsephase", "superBrew");
      context.sellBonus = this._getSellBonus();
      if (context.hasSelection) {
        const selectedItems = [...this._selectedForPurchase].map(id => this.actor.items.get(id)).filter(Boolean);
        context.requiredFavorTierLabel = game.i18n.localize(CONFIG.eclipsephase.favorTiers[this._getRequiredFavorTier(selectedItems)]);
        context.flatBuyCost = this._getFlatBuyCost(selectedItems);
      }
    }

    if (isOwnerView) {
      context.repNetworks = CONFIG.eclipsephase.repTypes;
      context.acceptedRepNetworks = actor.system.acceptedRepNetworks;
      context.costTypes = CONFIG.eclipsephase.costTypes;
      context.favorTiers = CONFIG.eclipsephase.favorTiers;
      context.valuation = actor.system.valuation;
    }

    return context;
  }

  // Hide native window header and wire the custom title bar instead - see EPactorSheet.js/EPitemSheet.js.
  async _onRender(context, options) {
    await super._onRender(context, options);

    const html = this.element;
    if (!html) return;

    const windowHeader = html.querySelector(".window-header");
    if (windowHeader) windowHeader.style.display = "none";

    // Core disables all form.elements when !isEditable - re-enable for Observer.
    html.querySelectorAll(".item-purchase-select").forEach(el => el.disabled = false);

    const titlebar = html.querySelector(".ep-sheet-titlebar");
    addWindowControls(this, titlebar);
    addDragSupport(this, titlebar);
    addMinimizeSupport(this, titlebar);

    // Description-reveal toggle (.slideShow, powers item-row-list.hbs's expand/collapse) - generic,
    // works for any document, same call EPitemSheet.js makes.
    registerCommonHandlers(html, this.actor);
    itemTypeFilterPills(html, this, "_itemTypeFilter");

    // Opens the item sheet either editable (Owner) or read-only (Observer/Limited, see
    // EPitemSheet.js's own isEditable guard) - wired regardless of this.isEditable since viewing
    // must work even when the shop actor itself isn't editable by the current user.
    html.querySelectorAll(".item-edit").forEach(element => {
      element.addEventListener("click", ev => {
        const li = ev.currentTarget.closest(".item");
        const item = this.actor.items.get(li?.dataset.itemId);
        item?.sheet?.render(true);
      });
    });

    // To Sell staging controls - available to Owner and anyone with Limited+ permission alike.
    html.querySelectorAll(".to-sell-remove").forEach(element => {
      element.addEventListener("click", ev => {
        const li = ev.currentTarget.closest(".item");
        const key = li?.dataset.stagingKey;
        if (!key) return;
        this._toSell.delete(key);
        this._maybeResetActingCharacter();
        this.render();
      });
    });

    html.querySelector(".shop-sell-confirm")?.addEventListener("click", () => {
      if (!this._toSell.size) return;
      this._confirmSellDialog();
    });

    // Purchase controls - Observer only.
    html.querySelectorAll(".item-purchase-select").forEach(element => {
      element.addEventListener("change", ev => {
        const itemId = ev.currentTarget.dataset.itemId;
        if (!itemId) return;
        if (ev.currentTarget.checked) this._selectedForPurchase.add(itemId);
        else this._selectedForPurchase.delete(itemId);
        this.render();
      });
    });

    html.querySelector(".shop-purchase-favor")?.addEventListener("click", () => {
      if (!this._selectedForPurchase.size) return;
      this._useGefallen();
    });

    html.querySelector(".shop-purchase-flatbuy")?.addEventListener("click", () => {
      if (!this._selectedForPurchase.size) return;
      this._useFlatBuy();
    });

    if (!this.isEditable) return;

    html.querySelectorAll(".item-delete").forEach(element => {
      element.addEventListener("click", async ev => {
        const li = ev.currentTarget.closest(".item");
        const itemId = li?.dataset.itemId;
        if (!itemId) return;
        await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
      });
    });
  }

  static async _onEditImage(event, target) {
    const field = target.dataset.field || "img";
    const current = foundry.utils.getProperty(this.document, field) || "";

    const FilePickerClass =
      foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;

    const fp = new FilePickerClass({
      type: "image",
      current,
      callback: async (path) => {
        await this.document.update({ [field]: path });
      }
    });

    return fp.browse();
  }
}
