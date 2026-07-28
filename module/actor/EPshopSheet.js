import { addWindowControls, addDragSupport, addMinimizeSupport, registerCommonHandlers, itemTypeFilterPills, transferItemBetweenActors, confirmation, selectBody } from "../common/general-sheet-functions.js";
import { requestGMItemTransfer, completeShopPurchase, hasFreeFavorSlot, LOYALTY_PER_TIER, getLoyaltyLevel } from "../common/general-helper-functions.js";
import * as DICE from "../rolls/dice.js";
import * as MORPHFUNCTION from "../common/morp-functions.js";

const FAVOR_TIER_RANK = { trivial: 0, minor: 1, moderate: 2, major: 3 };
// "Buy" (Laph's Special Brew house rule, superBrew setting): flat Rep cost, no roll - Trivial
// has no RAW cost equivalent, treated as free.
const FLAT_BUY_COST = { trivial: 0, minor: 15, moderate: 30, major: 60 };
// "Cash in Favor": per-item Sell Bonus contribution when staged in "To Sell", summed and capped
// at BONUS_CAP - same cap independently applies to the Rep-Burn Bonus (burned points x2).
const SELL_BONUS_PER_TIER = { trivial: 0, minor: 5, moderate: 15, major: 30 };
const BONUS_CAP = 30;
// Plain "Sell" (no active purchase): per-item Rep gain, summed with no cap - exclusive with
// SELL_BONUS_PER_TIER above, an item staged for one purpose is never staged for the other at once.
const SELL_REP_PER_TIER = { trivial: 0, minor: 5, moderate: 10, major: 20 };

// Cash-in-Favor batch-difficulty ladder - Rare gear has no RAW favor tier above Major, so this
// shop's valuation always collapses it there; there is nothing higher to escalate into.
const FAVOR_DIFFICULTY_LADDER = ["trivial", "minor", "moderate", "major"];
// Rulebook "Rep Tests" table (Networking - Using Rep - Favors): the modifier for a Rep Test based
// on how big a favor is being requested.
const FAVOR_DIFFICULTY_MODIFIER = { trivial: 30, minor: 10, moderate: 0, major: -30 };

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
      // Guards a rare core edge case (actor.token null despite the "Configure Token" control being
      // shown) instead of letting ActorSheetV2's own handler throw.
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
      scrollable: [".shop-to-sell-column .shop-column-scroll", ".shop-inventory-column .shop-column-scroll", ".shop-settings-scroll"]
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
  // so it survives re-renders within the session but resets on close.
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
  // item onto the shop to sell for them - see _onDropItem(). Never used by buying (Buy/Cash in
  // Favor stay bound to game.user.character only).
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

  // Clears the acting-character context once nothing is staged anymore - called after every
  // mutation of _toSell.
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
  // regardless of which one is flagged default:true.
  // Grants the Rep-for-selling gain - exclusive with _useGefallen()'s Sell Bonus, which calls
  // _confirmSell() directly and never goes through this method.
  async _confirmSellDialog() {
    if (this._isClosedForSelling()) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.shopClosed"));
    }

    // Captured up front - _confirmSell() clears the acting-character context once staging empties
    // out, and the sell-limit check below needs it too.
    const character = this._getActingCharacter();

    if (character?.isOwner && this._isSellLockedOut(character)) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.sellLockedOut"));
    }

    // Pre-transaction validation against this shop's configured per-transaction caps (0 = no
    // limit). Exceeding either cap blocks the sale outright, no lockout. Landing exactly on a
    // cap still succeeds but locks the character out of further sales here until a long rest
    // or an Owner override.
    const maxItems = Number(this.actor.system.sellLimitMaxItems) || 0;
    const maxRep = Number(this.actor.system.sellLimitMaxRep) || 0;
    const itemCount = this._toSell.size;
    const estimatedRepGain = this._getSellRepGain();
    if ((maxItems > 0 && itemCount > maxItems) || (maxRep > 0 && estimatedRepGain > maxRep)) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.sellLimitExceeded"));
    }
    const reachesSellLimit = (maxItems > 0 && itemCount === maxItems) || (maxRep > 0 && estimatedRepGain === maxRep);

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

    const repGain = this._getSellRepGain(network);

    await this._confirmSell();

    if (reachesSellLimit && character?.isOwner) {
      await character.setFlag("eclipsephase", `shopLockouts.${this.actor.id}`, true);
    }

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
          sourceActorUuid: sourceActor.uuid,
          targetActorUuid: this.actor.uuid,
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

  // Morphs aren't traded via Rep at all outside the SuperBrew house rule (RAW: acquired via the
  // mission's Morph Points instead) - blocks every entry point (drop/stage, Cash in Favor, Buy),
  // not just the roll/charge itself.
  _isMorphBlocked(items) {
    return !game.settings.get("eclipsephase", "superBrew") && items.some(item => item.type === "morph");
  }

  // Rare gear needs at least Orange (level 2) Loyalty standing, gated behind loyaltyEnabled.
  // Checked against the item's own cost tier, not the shop's valuation-mapped favor tier
  // (which collapses rare into major for pricing/difficulty).
  _isRareBlocked(items, character) {
    if (!this.actor.system.loyaltyEnabled) return false;
    if (!items.some(item => item.system.cost === "rare")) return false;
    return this._getLoyaltyLevel(character) < 2;
  }

  // Which of this shop's 4 Loyalty Bar segments (level 1=Red..4=Green) the character currently
  // occupies - level 1 (no benefit) for anyone without an owned character or while Loyalty is off.
  _getLoyaltyLevel(character) {
    if (!this.actor.system.loyaltyEnabled || !character?.isOwner) return 1;
    const value = this.actor.getFlag("eclipsephase", "characterState")?.[character.id]?.loyalty?.value ?? 0;
    return getLoyaltyLevel(this.actor, value);
  }

  async _onDropItem(event, item) {
    const targetActor = this.actor;
    const sourceActor = item.parent instanceof Actor ? item.parent : null;

    // Same-actor drag (e.g. reordering the shop's own list) - nothing to do.
    if (sourceActor && sourceActor.id === targetActor.id) return null;

    if (this._isMorphBlocked([item])) {
      ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.morphsBlocked"));
      return null;
    }

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

  // Sell-limit lockouts live on the CHARACTER (flags.eclipsephase.shopLockouts.<shopId>), not the
  // shop - a character always owns their own document, so setting/clearing it never needs the
  // GM-relay socket that shop-owned flags (e.g. Loyalty) require.
  _isSellLockedOut(character) {
    return character?.getFlag("eclipsephase", "shopLockouts")?.[this.actor.id] === true;
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

  // Same acting-character resolution as _getAcceptedRepDisplay() - the color bar is a per
  // (shop, character) value, so it only makes sense once there's someone owned to show it for.
  // Segment widths are flex-grow weights, not required to sum to 100 - they scale proportionally
  // either way.
  _getLoyaltyBarDisplay() {
    if (!this.actor.system.loyaltyEnabled) return null;
    const character = this._getActingCharacter();
    if (!character?.isOwner) return null;

    const max = Number(this.actor.system.loyaltyBarMax) || 100;
    const value = this.actor.getFlag("eclipsephase", "characterState")?.[character.id]?.loyalty?.value ?? 0;
    const markerPercent = Math.max(0, Math.min(100, (value / max) * 100));
    const segments = this.actor.system.loyaltyBarSegments ?? {};

    return {
      value,
      max,
      markerPercent,
      segments: ["red", "orange", "yellow", "green"].map(color => ({
        color,
        weight: Number(segments[color]) || 0
      }))
    };
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
   * Accepted networks with the user's own character's Rep values - used by Buy/Cash in Favor,
   * which stay bound to game.user.character only, never the acting character used by selling.
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
   * Cash-in-Favor's final Rep-Test difficulty and how much Loyalty ease it used.
   * Below Major, difficulty is the highest item's tier +1 step per additional item. Once that
   * would exceed Major, items are priced by their own tier value (Minor=1/Moderate=2/Major=3)
   * against a budget of Major(3) plus the available Loyalty ease. Ease used is capped at what
   * the batch needed; excess is unused. Favor-Limit slot consumption stays tied to the
   * unescalated _getRequiredFavorTier() result.
   * @param {Item[]} items
   * @param {number} level 1-4
   * @returns {{tier: "trivial"|"minor"|"moderate"|"major", easeApplied: number}|null} null if the
   *   batch is too large even at full Loyalty ease
   */
  _getFinalFavorTier(items, level) {
    const majorIndex = FAVOR_DIFFICULTY_LADDER.length - 1;
    const highestIndex = FAVOR_DIFFICULTY_LADDER.indexOf(this._getRequiredFavorTier(items));
    const countBasedIndex = highestIndex + (items.length - 1);
    const preEaseIndex = countBasedIndex <= majorIndex
      ? countBasedIndex
      : items.reduce((sum, item) => sum + FAVOR_DIFFICULTY_LADDER.indexOf(this._favorTierForItem(item)), 0);

    const ease = level - 1;
    const budget = majorIndex + ease;
    if (preEaseIndex > budget) return null;

    const finalIndex = Math.max(0, preEaseIndex - ease);
    return { tier: FAVOR_DIFFICULTY_LADDER[finalIndex], easeApplied: preEaseIndex - finalIndex };
  }

  /**
   * Buy-side discount options for the current level, one per level the character could redeem
   * (level 1 has nothing to offer). Redeeming N levels grants the percentage configured for
   * level (N+1) - e.g. redeeming 1 level from level 4 uses the level-2 discount value.
   * @param {number} level 1-4
   * @returns {Array<{levels: number, percent: number, label: string}>}
   */
  _getBuyDiscountOptions(level) {
    const options = [];
    for (let redeemLevels = 1; redeemLevels < level; redeemLevels++) {
      const percent = this._getBuyDiscountPercent(redeemLevels);
      options.push({
        levels: redeemLevels,
        percent,
        label: game.i18n.format("ep2e.shop.dialog.loyaltyDiscount.option", { levels: redeemLevels, percent })
      });
    }
    return options;
  }

  // The percentage for redeeming N levels of discount (N redeemed = the level-(N+1) discount
  // value) - owner-configurable, defaults 10/20/30 for level 2/3/4.
  _getBuyDiscountPercent(redeemLevels) {
    if (!redeemLevels) return 0;
    const defaults = { level2: 10, level3: 20, level4: 30 };
    const config = this.actor.system.loyaltyBuyDiscount ?? {};
    const key = `level${redeemLevels + 1}`;
    return Number(config[key] ?? defaults[key]) || 0;
  }

  // Global constant, shop-wide (all networks, no per-network entry needed), then per-network - each
  // stage falls back to the previous one. A stored 0 ("free") is a valid override and must NOT fall
  // back (nullish coalescing, not ||). Trivial is never overridden (RAW: always free).
  _rateFor(category, tier, network) {
    if (tier === "trivial") return 0;
    const globalRate = { flatBuyCost: FLAT_BUY_COST, sellBonus: SELL_BONUS_PER_TIER, sellRepGain: SELL_REP_PER_TIER }[category][tier];
    const general = this.actor.system.generalRateOverrides?.[tier]?.[category] ?? globalRate;
    if (!network) return general;
    const override = this.actor.system.rateOverrides?.[network]?.[tier]?.[category];
    return override ?? general;
  }

  /**
   * Flat "Buy" Rep cost for the given items, summed per item's own favor tier. `network` applies
   * this shop's per-network overrides - omitted when no network is chosen yet.
   * @param {Item[]} items
   * @param {string|null} [network]
   * @returns {number}
   */
  _getFlatBuyCost(items, network = null) {
    return items.reduce((sum, item) => sum + this._rateFor("flatBuyCost", this._favorTierForItem(item), network), 0);
  }

  /**
   * Sell Bonus for "Cash in Favor", summed from currently staged "To Sell" items by their own
   * favor tier, capped at BONUS_CAP. `network` applies this shop's per-network overrides.
   * @param {string|null} [network]
   * @returns {number}
   */
  _getSellBonus(network = null) {
    let total = 0;
    for (const staged of this._toSell.values()) {
      const item = game.actors.get(staged.sourceActorId)?.items.get(staged.itemId);
      if (!item) continue;
      total += this._rateFor("sellBonus", this._favorTierForItem(item), network);
    }
    return Math.min(total, BONUS_CAP);
  }

  /**
   * Rep gain for a plain "Verkaufen" (no active purchase), summed from currently staged "To Sell"
   * items by their own favor tier - no cap. `network` applies this shop's per-network overrides.
   * @param {string|null} [network]
   * @returns {number}
   */
  _getSellRepGain(network = null) {
    let total = 0;
    for (const staged of this._toSell.values()) {
      const item = game.actors.get(staged.sourceActorId)?.items.get(staged.itemId);
      if (!item) continue;
      total += this._rateFor("sellRepGain", this._favorTierForItem(item), network);
    }
    return total;
  }

  /**
   * Per-network breakdown for a price/bonus shown before a network is chosen: networks whose value
   * differs from the global default are listed individually, any remaining accepted networks are
   * grouped under one "Otherwise" entry instead of repeating the same number per network.
   * @param {(network: string|null) => number} computeFn
   * @returns {string}
   */
  _formatRateBreakdown(computeFn) {
    const defaultValue = computeFn(null);
    const networks = this._getAcceptedNetworks();
    const overridden = networks
      .map(network => ({ network, value: computeFn(network) }))
      .filter(entry => entry.value !== defaultValue);

    if (!overridden.length) return String(defaultValue);

    const parts = overridden.map(({ network, value }) => `${network.replace("-rep", "")}: ${value}`);
    if (overridden.length < networks.length) {
      parts.push(`${game.i18n.localize("ep2e.shop.purchase.otherwiseLabel")} ${defaultValue}`);
    }
    return parts.join(" | ");
  }

  // Rounds a discounted cost down - a 10% discount on 15 Rep charges 13, not 14, so a rounding
  // artifact never costs the player more than the configured percentage actually promises.
  _applyDiscount(cost, discountPercent) {
    return Math.max(0, Math.floor(cost * (1 - discountPercent / 100)));
  }

  _getFlatBuyCostBreakdown(items, discountPercent = 0) {
    return this._formatRateBreakdown(network => this._applyDiscount(this._getFlatBuyCost(items, network), discountPercent));
  }

  _getSellBonusBreakdown() {
    return this._formatRateBreakdown(network => this._getSellBonus(network));
  }

  _getSellRepGainBreakdown() {
    return this._formatRateBreakdown(network => this._getSellRepGain(network));
  }

  // Styled like general-modifiers.html. Single network auto-selected; multiple require an explicit
  // choice (see _syncPurchaseDialogConfirm()). discountOptions (Buy only) adds a dropdown for
  // redeeming Loyalty levels for a price discount. wareItems/bodyGroups (Ware with 2+ possible
  // bodies) appends a body-choice row per item below the network section, in this same dialog.
  _networkSelectMarkup(networks, headline, hint, hintValue, discountOptions, wareItems, bodyGroups) {
    const options = networks.map(o => `<option value="${o.network}">${o.label}</option>`).join("");
    const select = networks.length === 1
      ? `<select name="NetworkSelect">${options}</select>`
      : `<select name="NetworkSelect"><option value="" selected>${game.i18n.localize("ep2e.shop.dialog.selectNetwork.placeholder")}</option>${options}</select>`;
    const hintRow = hint
      ? `<div class="form-group listBackgroundMain"><label class="resource-labelDialog">${hint}</label><input type="text" class="shop-hint-value" value="${hintValue}" disabled/></div>`
      : "";
    const discountRow = discountOptions?.length
      ? `<div class="form-group listBackgroundMain">
          <label class="resource-labelDialog">${game.i18n.localize("ep2e.shop.dialog.loyaltyDiscount.label")}</label>
          <select name="DiscountSelect">
            <option value="0">${game.i18n.localize("ep2e.shop.dialog.loyaltyDiscount.none")}</option>
            ${discountOptions.map(o => `<option value="${o.levels}">${o.label}</option>`).join("")}
          </select>
        </div>`
      : "";
    const networkSection = `<div class="contentBoxMargin">
      <div class="flexrow subheader"><h3 class="subheader dialog">${headline}</h3></div>
      ${hintRow}
      <div class="form-group listBackgroundMain shop-network-row">
        <label class="resource-labelDialog">${game.i18n.localize("ep2e.shop.dialog.selectNetwork.label")}</label>
        ${select}
      </div>
      ${discountRow}
    </div>`;
    const wareSection = wareItems?.length ? this._wareBindingMarkup(wareItems, bodyGroups) : "";
    return networkSection + wareSection;
  }

  // Confirm stays disabled until every required field has a value: the network (always present),
  // and every Ware body-select row appended by _networkSelectMarkup()'s wareItems, if any.
  _syncPurchaseDialogConfirm(dialog) {
    const networkSelect = dialog.element.querySelector('select[name="NetworkSelect"]');
    const bodySelects = dialog.element.querySelectorAll('select[name^="BodySelect_"]');
    const confirmBtn = dialog.element.querySelector('button[data-action="confirm"]');
    if (!confirmBtn) return;
    const sync = () => {
      const networkOk = !networkSelect || !!networkSelect.value;
      const bodiesOk = ![...bodySelects].some(s => !s.value);
      confirmBtn.disabled = !networkOk || !bodiesOk;
    };
    networkSelect?.addEventListener("change", sync);
    bodySelects.forEach(s => s.addEventListener("change", sync));
    sync();
  }

  // Same pattern as selectBody() in general-sheet-functions.js: confirm stays disabled until a
  // non-empty value is chosen. Used by _confirmSellDialog()'s own inline dialog, which never has
  // Ware body rows to also account for - see _syncPurchaseDialogConfirm() for that combined case.
  _syncNetworkSelectConfirm(dialog) {
    const select = dialog.element.querySelector('select[name="NetworkSelect"]');
    const confirmBtn = dialog.element.querySelector('button[data-action="confirm"]');
    if (!select || !confirmBtn) return;
    const sync = () => { confirmBtn.disabled = !select.value; };
    select.addEventListener("change", sync);
    sync();
  }

  // Buy only: live-recomputes the price hint as the Loyalty discount dropdown changes, instead of
  // leaving it pinned to the pre-discount value chosen when the dialog first opened.
  _syncDiscountHint(dialog, onDiscountChange) {
    const select = dialog.element.querySelector('select[name="DiscountSelect"]');
    const hintInput = dialog.element.querySelector(".shop-hint-value");
    if (!select || !hintInput) return;
    select.addEventListener("change", () => {
      hintInput.value = onDiscountChange(Number(select.value) || 0);
    });
  }

  /**
   * Prompts for a Rep network via a DialogV2 select, styled like this system's standard roll
   * dialogs. Confirm disabled until chosen. discountOptions (Buy only) adds a dropdown for
   * redeeming a Loyalty discount; onDiscountChange recomputes the hint value live as it changes.
   * wareItems/bodyGroups (Ware with 2+ possible bodies) folds a body-choice row per item into
   * this same dialog, below the network section.
   * @param {{title: string, headline: string, hint?: string, hintValue?: string, networks: Array<{network: string, label: string}>, confirmLabel: string, discountOptions?: Array<{levels: number, label: string}>, onDiscountChange?: (discountLevels: number) => string, wareItems?: Item[], bodyGroups?: Array<{label: string, options: Array<{id: string, name: string}>}>}} params
   * @returns {Promise<{network: string|null, discountLevels: number, bindings: Record<string,string>}>}
   */
  async _selectNetworkDialog({ title, headline, hint, hintValue, networks, confirmLabel, discountOptions, onDiscountChange, wareItems, bodyGroups }) {
    const content = this._networkSelectMarkup(networks, headline, hint, hintValue, discountOptions, wareItems, bodyGroups);

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title },
      classes: ["ep2e-primary-right"],
      content,
      buttons: [
        {
          action: "confirm",
          label: confirmLabel,
          default: true,
          callback: (event, button) => ({
            selection: button.form.NetworkSelect.value,
            discount: discountOptions ? Number(button.form.DiscountSelect?.value) || 0 : 0,
            bindings: wareItems?.length ? Object.fromEntries(wareItems.map(item => [item.id, button.form[`BodySelect_${item.id}`].value])) : {}
          })
        },
        { action: "cancel", label: game.i18n.localize("ep2e.roll.dialog.button.cancel"), callback: () => ({ cancelled: true }) }
      ],
      position: { width: wareItems?.length ? 340 : 276 },
      modal: true,
      rejectClose: false,
      render: (event, dialog) => {
        this._syncPurchaseDialogConfirm(dialog);
        if (onDiscountChange) this._syncDiscountHint(dialog, onDiscountChange);
      }
    });
    // A falsy callback return (e.g. bare null) breaks DialogV2 resolution on this Foundry version -
    // every button here must resolve truthy, same convention as selectBody()/showOptionsDialog().
    const cancelled = !result || result.cancelled;
    return {
      network: cancelled ? null : (result.selection || null),
      discountLevels: cancelled ? 0 : (discountOptions ? result.discount : 0),
      bindings: cancelled ? {} : (wareItems?.length ? result.bindings : {})
    };
  }

  // One row per Ware item, all sharing the same body options - appended into _networkSelectMarkup()
  // when wareItems is passed, or usable standalone. Confirm-readiness for these rows is handled
  // together with the network select by _syncPurchaseDialogConfirm().
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

  /**
   * Pre-checks Ware body bindings before any Rep is spent. Aborts the whole purchase (no dialog,
   * nothing spent) if there's no body to bind to at all - Ware can't currently be bought unbound.
   * Auto-binds directly if there's exactly one body (unambiguous, no dialog needed). With 2+
   * bodies, the actual choice is deferred to the caller's own _selectNetworkDialog() call (via its
   * wareItems/bodyGroups params) instead of a separate dialog shown first - this only returns what
   * that combined dialog needs.
   * @param {Actor} character
   * @param {Item[]} items
   * @returns {Promise<{cancelled: boolean, bindings: Record<string,string>, wareItems: Item[], bodyGroups: Array}>}
   */
  async _resolveWareBindings(character, items) {
    const wareItems = items.filter(i => i.type === "ware");
    if (!wareItems.length) return { cancelled: false, bindings: {}, wareItems: [], bodyGroups: [] };

    const { bodies, boundToFor, buildBodyGroups } = MORPHFUNCTION.getBodyBindingInfo(character);

    if (bodies.length === 0) {
      await MORPHFUNCTION.resolveBodyForItem(character, "ep2e.systemMessage.itemAttachment.noBodyWare");
      return { cancelled: true, bindings: {}, wareItems: [], bodyGroups: [] };
    }

    if (bodies.length === 1) {
      const boundTo = boundToFor(bodies[0]);
      const bindings = {};
      wareItems.forEach(item => bindings[item.id] = boundTo);
      return { cancelled: false, bindings, wareItems: [], bodyGroups: [] };
    }

    return { cancelled: false, bindings: {}, wareItems, bodyGroups: buildBodyGroups() };
  }

  /**
   * "Cash in Favor": Rep test for the selected items, optionally boosted by a Sell Bonus
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

    if (this._isMorphBlocked(items)) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.morphsBlocked"));
    }

    if (this._isRareBlocked(items, character)) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.rareLoyaltyRequired"));
    }

    // Batch-difficulty escalation always applies, independent of loyaltyEnabled - each additional
    // item bumps the roll one tier harder than the highest item alone needs, and Loyalty eases
    // the result back down (see _getFinalFavorTier()). Loyalty level is forced to 1 (no ease)
    // while this shop's Loyalty tracking is off, see _getLoyaltyLevel().
    const level = this._getLoyaltyLevel(character);
    const result = this._getFinalFavorTier(items, level);
    if (!result) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.favorBatchTooLarge"));
    }
    const { tier: finalTier, easeApplied } = result;
    const favorDifficultyModifier = FAVOR_DIFFICULTY_MODIFIER[finalTier];
    // The favor-difficulty dropdown in the roll's options dialog is only LOCKED (forced,
    // non-editable) while Loyalty is active - with it off, the computed value still pre-fills the
    // dropdown, but the player is free to override it, same as before this feature existed.
    const loyaltyActive = this.actor.system.loyaltyEnabled === true;

    const { cancelled, bindings: autoBindings, wareItems: wareBindingItems, bodyGroups } = await this._resolveWareBindings(character, items);
    if (cancelled) return;

    const requiredTier = this._getRequiredFavorTier(items);
    const tierLabel = game.i18n.localize(CONFIG.eclipsephase.favorTiers[requiredTier]);

    const { network, bindings: dialogBindings } = await this._selectNetworkDialog({
      title: game.i18n.localize("ep2e.shop.purchase.favorConfirm"),
      headline: `${game.i18n.localize("ep2e.shop.purchase.required")} ${tierLabel}`,
      networks: this._getPurchaseNetworkOptions(),
      confirmLabel: game.i18n.localize("ep2e.shop.purchase.favorConfirm"),
      wareItems: wareBindingItems,
      bodyGroups
    });
    if (!network) return;
    const bindings = wareBindingItems.length ? dialogBindings : autoBindings;

    if (!hasFreeFavorSlot(character, network, requiredTier)) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.favorLimitExhausted"));
    }

    const idItem = character.items.get(character.system.activeID);
    const rollValue = Number(idItem?.system?.rep?.[network]?.value ?? 0);

    const sellBonus = this._getSellBonus(network);

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
      shopUuid: this.actor.uuid,
      buyerActorId: character.id,
      itemIds: items.map(item => item.id).join(","),
      requiredTier,
      sellBonus,
      maxBurn: BONUS_CAP / 2,
      bodyBindings: Object.entries(bindings).map(([id, boundTo]) => `${id}:${boundTo}`).join(","),
      favorDifficultyModifier,
      ...(loyaltyActive ? { favorDifficultyLocked: true } : {})
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
    // Loyalty ease used for this roll (see _getFinalFavorTier()) consumes that many levels
    // instead of the normal purchase gain, never both (see applyLoyaltyTransaction()). No ease
    // used (level 1, or Loyalty off) still grants the normal gain.
    await completeShopPurchase({
      shopUuid: dataset.shopUuid,
      buyerActorId: dataset.buyerActorId,
      itemIds: dataset.itemIds,
      network: dataset.name,
      favorTier: dataset.requiredTier,
      bodyBindings: bindings,
      redeemLevels: easeApplied
    });
  }

  /**
   * "Buy" (Laph's Special Brew house rule, only active while the superBrew setting is on): a
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

    if (this._isRareBlocked(items, character)) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.rareLoyaltyRequired"));
    }

    const { cancelled, bindings: autoBindings, wareItems: wareBindingItems, bodyGroups } = await this._resolveWareBindings(character, items);
    if (cancelled) return;

    // Unlike Cash-in-Favor's automatic, passive Loyalty benefit, Buy's discount is a
    // player-chosen, consumable resource - offered only if there's a level above 1 to redeem from.
    const level = this._getLoyaltyLevel(character);
    const discountOptions = this._getBuyDiscountOptions(level);

    const { network, discountLevels, bindings: dialogBindings } = await this._selectNetworkDialog({
      title: game.i18n.localize("ep2e.shop.purchase.confirm"),
      headline: game.i18n.localize("ep2e.shop.dialog.selectNetwork.headline"),
      hint: game.i18n.localize("ep2e.shop.purchase.flatBuyCost"),
      hintValue: this._getFlatBuyCostBreakdown(items),
      networks: this._getPurchaseNetworkOptions(),
      confirmLabel: game.i18n.localize("ep2e.shop.purchase.confirm"),
      discountOptions,
      onDiscountChange: discountLevels => this._getFlatBuyCostBreakdown(items, this._getBuyDiscountPercent(discountLevels)),
      wareItems: wareBindingItems,
      bodyGroups
    });
    if (!network) return;
    const bindings = wareBindingItems.length ? dialogBindings : autoBindings;

    const discountPercent = this._getBuyDiscountPercent(discountLevels);
    const cost = this._applyDiscount(this._getFlatBuyCost(items, network), discountPercent);
    const idItem = character.items.get(character.system.activeID);
    const available = Number(idItem?.system?.rep?.[network]?.value ?? 0);

    if (cost > available) {
      return ui.notifications.warn(game.i18n.localize("ep2e.shop.warnings.notEnoughRepToBuy"));
    }

    this._selectedForPurchase.clear();
    this.render();

    const boughtItems = await completeShopPurchase({
      shopUuid: this.actor.uuid,
      buyerActorId: character.id,
      itemIds: items.map(item => item.id).join(","),
      bodyBindings: bindings,
      redeemLevels: discountLevels
    });

    // Charge only for what actually transferred - unlike Cash-in-Favor's Rep burn (a cost of
    // attempting the roll regardless of outcome), a flat Buy has no roll to justify spending Rep
    // on items that turned out to be gone.
    if (boughtItems.length) {
      const spent = this._applyDiscount(this._getFlatBuyCost(boughtItems, network), discountPercent);
      await idItem.update({ [`system.rep.${network}.value`]: available - spent });
      // The earlier render() (right after clearing the selection, above) fires before this Rep
      // deduction lands - the shop's "accepted Rep" display (read off the BUYER's item, not this
      // shop's own document, so no automatic re-render hook covers it) would otherwise keep
      // showing the pre-purchase value until some unrelated re-render happened to catch it up.
      this.render();
    }
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
    context.loyaltyBar = this._getLoyaltyBarDisplay();

    // Buying is Observer-only.
    context.canPurchase = !isOwnerView;
    if (!isOwnerView) {
      context.selectable = true;
      context.selected = Object.fromEntries([...this._selectedForPurchase].map(id => [id, true]));
      context.purchaseNetworks = this._getPurchaseNetworkOptions();
      context.hasSelection = this._selectedForPurchase.size > 0;
      context.homebrewBuyEnabled = game.settings.get("eclipsephase", "superBrew");
      // hasX gates visibility (numeric check) - the breakdown string itself is always truthy even
      // when it reads "0", so the template can't gate on the string directly.
      context.hasSellBonus = this._getSellBonus() > 0;
      context.sellBonus = this._getSellBonusBreakdown();
      // Plain-Sell preview, next to the Cash-in-Favor Sell Bonus preview above - shows what the
      // currently staged "To Sell" items would earn without cashing in a favor.
      context.hasSellForRep = this._getSellRepGain() > 0;
      context.sellForRep = this._getSellRepGainBreakdown();
      if (context.hasSelection) {
        const selectedItems = [...this._selectedForPurchase].map(id => this.actor.items.get(id)).filter(Boolean);
        context.requiredFavorTierLabel = game.i18n.localize(CONFIG.eclipsephase.favorTiers[this._getRequiredFavorTier(selectedItems)]);
        context.hasFlatBuyCost = this._getFlatBuyCost(selectedItems) > 0;
        context.flatBuyCost = this._getFlatBuyCostBreakdown(selectedItems);
      }
    }

    if (isOwnerView) {
      context.repNetworks = CONFIG.eclipsephase.repTypes;
      context.acceptedRepNetworks = actor.system.acceptedRepNetworks;
      context.costTypes = CONFIG.eclipsephase.costTypes;
      context.favorTiers = CONFIG.eclipsephase.favorTiers;
      context.valuation = actor.system.valuation;

      // Sell-limit lockouts live on each character's own flags, not this shop - scanning all
      // character actors for a match relies on the shop Owner (typically the GM) having read
      // access to them, which holds for the common GM-owned-shop case this is scoped to.
      context.sellLockedCharacters = game.actors
        .filter(a => a.type === "character" && a.getFlag("eclipsephase", "shopLockouts")?.[actor.id] === true)
        .map(a => ({ characterId: a.id, name: a.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      // Loyalty tracking - runs independent of superBrew, gated only by its own master toggle.
      context.loyaltyEnabled = actor.system.loyaltyEnabled;
      const loyaltyOverrides = actor.system.loyaltyPerTier ?? {};
      context.loyaltyTierGrid = ["minor", "moderate", "major", "rare"].map(tier => ({
        tier,
        tierLabel: CONFIG.eclipsephase.costTypes[tier],
        value: loyaltyOverrides[tier] ?? null,
        placeholder: LOYALTY_PER_TIER[tier]
      }));
      const characterState = actor.getFlag("eclipsephase", "characterState") ?? {};
      context.loyaltyRecords = Object.entries(characterState)
        .filter(([, state]) => state.loyalty !== undefined)
        .map(([characterId, state]) => ({
          characterId,
          name: game.actors.get(characterId)?.name ?? characterId,
          value: state.loyalty.value ?? 0
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      // Cost-override matrix - pre-resolved grids, no nested lookups needed in the template.
      // Trivial is never overridden (RAW: always free), so it's excluded entirely. flatBuyCost/
      // sellRepGain columns only exist while superBrew is on, same gating as "Buy" itself -
      // sellBonus is never gated.
      context.superBrewEnabled = game.settings.get("eclipsephase", "superBrew");
      // Morph Points -> cost-tier thresholds, only meaningful while superBrew is on (see the
      // superBrewEnabled gate around this section's markup in shop-sheet.html).
      context.morphPointOverrides = actor.system.morphPointOverrides ?? {};
      const general = actor.system.generalRateOverrides ?? {};
      // What the matrix's placeholders should show: the shop's General Override if set, else the
      // system-wide default - a network cell left blank falls back to whichever of these applies.
      const resolvedDefault = (category, tier) => general[tier]?.[category] ?? { flatBuyCost: FLAT_BUY_COST, sellBonus: SELL_BONUS_PER_TIER, sellRepGain: SELL_REP_PER_TIER }[category][tier];

      context.generalOverrideGrid = ["minor", "moderate", "major"].map(tier => ({
        tier,
        tierLabel: CONFIG.eclipsephase.favorTiers[tier],
        flatBuyCost: general[tier]?.flatBuyCost ?? null,
        flatBuyCostPlaceholder: FLAT_BUY_COST[tier],
        sellBonus: general[tier]?.sellBonus ?? null,
        sellBonusPlaceholder: SELL_BONUS_PER_TIER[tier],
        sellRepGain: general[tier]?.sellRepGain ?? null,
        sellRepGainPlaceholder: SELL_REP_PER_TIER[tier]
      }));

      const overrides = actor.system.rateOverrides ?? {};
      context.rateOverrideGrid = Object.keys(CONFIG.eclipsephase.repTypes).map(network => ({
        network,
        label: CONFIG.eclipsephase.repTypes[network],
        tiers: ["minor", "moderate", "major"].map(tier => ({
          tier,
          tierLabel: CONFIG.eclipsephase.favorTiers[tier],
          flatBuyCost: overrides[network]?.[tier]?.flatBuyCost ?? null,
          flatBuyCostPlaceholder: resolvedDefault("flatBuyCost", tier),
          sellBonus: overrides[network]?.[tier]?.sellBonus ?? null,
          sellBonusPlaceholder: resolvedDefault("sellBonus", tier),
          sellRepGain: overrides[network]?.[tier]?.sellRepGain ?? null,
          sellRepGainPlaceholder: resolvedDefault("sellRepGain", tier)
        }))
      }));
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

    // Scoped setFlag() for just this one field, instead of a form-participating name="" input -
    // this section's submitOnChange form would otherwise resubmit every rendered field's current
    // DOM value on ANY change event, including a stale value racing against a delete just below.
    html.querySelectorAll(".shop-loyalty-record-value").forEach(element => {
      element.addEventListener("change", async ev => {
        const characterId = ev.currentTarget.dataset.characterId;
        if (!characterId) return;
        const value = Number(ev.currentTarget.value) || 0;
        await this.actor.setFlag("eclipsephase", `characterState.${characterId}.loyalty.value`, value);
      });
    });

    html.querySelector(".shop-loyalty-record-add")?.addEventListener("click", async () => {
      const characterState = this.actor.getFlag("eclipsephase", "characterState") ?? {};
      const listedIds = new Set(Object.entries(characterState).filter(([, state]) => state.loyalty !== undefined).map(([id]) => id));
      const options = game.actors
        .filter(actor => actor.type === "character" && actor.hasPlayerOwner && !listedIds.has(actor.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(actor => ({ id: actor.id, name: actor.name }));

      if (!options.length) {
        return ui.notifications.info(game.i18n.localize("ep2e.shop.warnings.noEligibleCharacters"));
      }

      const { selection, cancelled } = await selectBody(
        [{ label: game.i18n.localize("ep2e.shop.settings.loyaltyRecordsHeadline"), options }],
        "ep2e.shop.settings.loyaltyRecordAddTitle",
        "ep2e.shop.settings.loyaltyRecordAddHeadline",
        undefined,
        undefined,
        "ep2e.dialog.selectBody.placeholderEgo",
        "ep2e.shop.settings.loyaltyRecordAddWindowTitle"
      );
      if (cancelled || !selection) return;
      await this.actor.setFlag("eclipsephase", `characterState.${selection}.loyalty`, { value: 0, updated: Date.now() });
    });

    html.querySelectorAll(".shop-loyalty-record-delete").forEach(element => {
      element.addEventListener("click", async ev => {
        const characterId = ev.currentTarget.dataset.characterId;
        const characterName = ev.currentTarget.dataset.characterName ?? "";
        if (!characterId) return;
        const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
        const popUpHeadline = `${game.i18n.localize("ep2e.actorSheet.button.delete")} ${characterName}`;
        const { confirm } = await confirmation(popUpTitle, popUpHeadline, "ep2e.shop.settings.loyaltyRecordDeleteConfirm");
        if (!confirm) return;
        await this.actor.unsetFlag("eclipsephase", `characterState.${characterId}.loyalty`);
      });
    });

    // Clears the lockout on the CHARACTER's own flags, not this shop's - see _isSellLockedOut().
    html.querySelectorAll(".shop-sell-lockout-clear").forEach(element => {
      element.addEventListener("click", async ev => {
        const characterId = ev.currentTarget.dataset.characterId;
        if (!characterId) return;
        await game.actors.get(characterId)?.unsetFlag("eclipsephase", `shopLockouts.${this.actor.id}`);
        this.render();
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
