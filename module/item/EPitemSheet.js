import { registerEffectHandlers, registerCommonHandlers, itemToggle, moreInfo, addWindowControls, addDragSupport, addMinimizeSupport, escapeText, followingTooltips } from "../common/general-sheet-functions.js";
import { folderTree, rowCandidates, RANDOM, learnedBy } from "../common/doses.js";
import { hasSkillOptions, pickSpecialSkills } from "../rolls/modifiers.js";
import { choosePayload } from "../common/drugs.js";
import { payloadCloudKind } from "../common/weapon-functions.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export default class EPitemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  // See EPactorSheet.js - do not pre-merge super.DEFAULT_OPTIONS, Foundry's own class-chain walk
  // already does this and double-counts array entries otherwise.
  static DEFAULT_OPTIONS = {
    classes: ["eclipsephase", "sheet", "item"],
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: false
    },
    position: {
      width: 520,
      height: 415
    },
    actions: {
      editImage: this._onEditImage,
      selectPayload: this._onSelectPayload
    }
  };

  /**
   * Picks the substance a munition carries as its payload.
   * @returns {Promise<void>} Resolves once the choice is stored or cancelled
   */
  static async _onSelectPayload() {
    const payload = this.document.system.payload;
    if (!payload?.enabled) return;
    const cloud = this.document.system.cloud === true;
    const chosen = await choosePayload(payload.vector, { smoke: cloud });
    if (!chosen) return;
    if (chosen.smoke) {
      const custom = this.document.system.cloudColor?.kind === "custom";
      await this.document.update({ "system.payload.loaded": [], ...(custom ? {} : { "system.cloudColor.kind": "smoke" }) });
      return;
    }
    const kind = await payloadCloudKind(this.document.system, chosen.uuid);
    await this.document.update({ "system.payload.loaded": [chosen], ...(kind ? { "system.cloudColor.kind": kind } : {}) });
  }

  // scrollable: lets ApplicationV2 auto-preserve scroll position across re-renders (see EPactorSheet.js)
  static PARTS = {
    body: {
      template: "systems/eclipsephase/templates/item/item-gear-sheet.hbs",
      root: true,
      scrollable: [".item-sheet-body"]
    }
  };

  _getSheetTemplate() {
    const path = "systems/eclipsephase/templates/item";
    return `${path}/item-${this.document.type}-sheet.hbs`;
  }

  // Core empties newElement before restoring focus, so its own query always misses - retry against the live DOM
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if (state.focus && !newElement.querySelector(state.focus)) {
      this.element.querySelector(state.focus)?.focus();
    }
  }

  static TABS = {
    primary: {
      initial: "details",
      tabs: [
        { id: "details", label: "ep2e.item.general.tabs.detailsTab" },
        { id: "details2", label: "ep2e.item.general.tabs.weaponMode2" },
        { id: "additions", label: "ep2e.roll.dialog.heal.additions.label" },
        { id: "mechanics", label: "ep2e.item.drug.mechanics.tab" },
        { id: "description", label: "ep2e.item.general.table.description" },
        { id: "effects", label: "ep2e.item.general.tabs.effectsTab" }
      ]
    }
  };

    tabGroups = {
    primary: "details"
    };

  _getSheetDimensions() {
    const item = this.document;

    if (item.type === "ccWeapon") {
      return { width: 690, height: 445 };
    }
    else if (item.type === "rangedWeapon") {
      return { width: 755, height: 445 };
    }
    else if (item.type === "drug") {
      return { width: 520, height: 445 };
    }
    else if (item.type === "morph") {
      return { width: 620, height: 380 };
    }
    else if (item.type === "specialSkill" || item.type === "knowSkill") {
      return { width: 600, height: 192 };
    }
    else if (item.system?.type === "seeker" || item.type === "grenade") {
      return { width: 680, height: 415 };
    }
    else if (item.system?.type !== "seeker" && item.type === "ammo") {
      return { width: 520, height: 415 };
    }
    else if (item.type === "vehicle"){
      return { width: 680, height: 380 };
    }

    return { width: 520, height: 415 };
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.body.template = this._getSheetTemplate();
    return parts;
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.setPosition(this._getSheetDimensions());
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

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;

    context.config = CONFIG.eclipsephase;
    context.item = item;
    context.editable = this.isEditable;

    if(item.type !== "knowSkill" && item.type !== "specialSkill"){
      let primaryTabs = Object.values(this._prepareTabs("primary"));

      if (item.type !== "ccWeapon" && item.type !== "rangedWeapon") {
        primaryTabs = primaryTabs.filter(tab => tab.id !== "details2");
      }

      if (item.type !== "morph" && item.type !== "vehicle") {
        primaryTabs = primaryTabs.filter(tab => tab.id !== "additions");
      }

      if (item.type !== "drug") {
        primaryTabs = primaryTabs.filter(tab => tab.id !== "mechanics");
      }

      context.tabs = {
        primary: primaryTabs
      };

      context.tabGroups = this.tabGroups;
      item.showEffectsTab = !!(game.settings.get("eclipsephase", "effectPanel") && game.user.isGM);
    }

    if (item.type === "ccWeapon" || item.type === "rangedWeapon") {
      item.system.costName = "ep2e.item.general.table.cost." + item.system.cost;
      item.system.slotName = "ep2e.item.weapon.table.slot." + item.system.slotType;
    }

    if (item.type === "drug") {
      context.grantRows = await this._grantRows(item);
    }

    if (item.type === "ware") {
      context.immunities = learnedBy(item);
      context.skillSetup = hasSkillOptions(item) && item.parent instanceof Actor;
      context.skillPicks = (item.system.rollOptions ?? []).filter(option => option.specialSkill).flatMap(option => option.specialSkills ?? []);
    }

    if (item.type === "rangedWeapon") {
      item.system.ammoName = "ep2e.item.weapon.table.ammoUsed." + item.system.ammoType;
    }

    if (item.type === "morph" || item.type === "vehicle") {
      context.itemList = CONFIG.compendiumList ?? {
        ware: { none: "Calculating..." },
        flaw: { none: "Calculating..." },
        trait: { none: "Calculating..." },
        frame: { none: "Calculating..." }
      };
      // Enhancement slots (system.ware/traits/flaws/movement) aren't schema-bound to a fixed count -
      // only show enough to always have one free slot (minimum 3), growing as they fill up. A slot
      // that doesn't exist in the data yet is rendered as a blank placeholder; Foundry's own
      // submitOnChange form handling writes it into the document the moment it's picked.
      context.visibleWare = this._buildVisibleSlots(item.system.ware, "ware");
      context.visibleTraits = this._buildVisibleSlots(item.system.traits, "trait");
      context.visibleFlaws = this._buildVisibleSlots(item.system.flaws, "flaw");
      context.visibleMovement = this._buildVisibleSlots(item.system.movement, "move", {
        isFilled: (slot) => !!slot?.type && slot.type !== "none",
        emptySlot: (label) => ({ label, active: false, type: "none", base: null, full: null }),
        minVisible: 2
      });
    }

    if (item.type === "morph") {
      // No canonical Synthmorph in either rulebook goes without a frame, so a freshly-set-to-Synth
      // morph with no frame chosen yet defaults the dropdown to Light Frame - a pure rendering
      // default (submitOnChange means this isn't written to the document until the user actually
      // interacts with the select, same as selectBody()'s defaultSelection elsewhere).
      if (!item.system.frame || item.system.frame === "none") {
        const lightFrameEntry = Object.entries(context.itemList?.frame ?? {}).find(([, name]) => name === "Light Frame Armor");
        context.frameDefault = lightFrameEntry?.[0] ?? "none";
      } else {
        context.frameDefault = item.system.frame;
      }
    }

    await this._prepareRenderedHTMLContent(context);

    return context;
  }

  // See the comment above the visibleWare/visibleTraits/visibleFlaws/visibleMovement context
  // assignment. Ware/Trait/Flaw slots are a single {value} field where "none" means empty;
  // Movement slots are {active, type, base, full} where "none" *type* means empty - pass
  // isFilled/emptySlot to adapt the same growth rule to either shape.
  _buildVisibleSlots(existingSlots, prefix, {
    isFilled = (slot) => !!slot?.value && slot.value !== "none",
    emptySlot = (label) => ({ label, value: "" }),
    minVisible = 3
  } = {}) {
    const filledCount = Object.values(existingSlots ?? {}).filter(isFilled).length;
    const visibleCount = Math.max(minVisible, filledCount + 1);

    const visible = {};
    for (let i = 1; i <= visibleCount; i++) {
      const key = `${prefix}${i}`;
      // Label is derived from position, not stored - slots beyond template.json's predefined 10
      // never get a label written back (no input field for it), so trusting persisted data would
      // lose the number on the next render.
      visible[key] = { ...(existingSlots?.[key] ?? emptySlot(`${i}.`)), label: `${i}.` };
    }
    return visible;
  }

  async _prepareRenderedHTMLContent(context) {
    const itemModel = context.item.system;

    context.htmlDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      itemModel.description ?? "",
      { async: true }
    );
  }

  /**
   * The Temporary Traits rows the Mechanics tab shows: one per authored row plus an empty one to
   * start the next. Each row carries the choices its three pickers offer - every Item compendium,
   * the chosen compendium's folders at every level, and Random or one of the items in reach.
   * @param {Item} item - The drug
   * @returns {Promise<Object[]>} The rows
   */
  async _grantRows(item) {
    const grants = Array.isArray(item.system.grants) ? item.system.grants : [];
    const packs = (game.packs?.filter?.(pack => (pack.documentName ?? pack.metadata?.type) === "Item") ?? [])
      .map(pack => ({ value: pack.collection, label: pack.title ?? pack.metadata?.label ?? pack.collection }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const rows = [];
    const all = [...grants, { pack: "", folder: "", item: RANDOM, title: "", description: "", or: this._pendingGrantOr === true }];
    for (const [index, row] of all.entries()) {
      const pack = row.pack ? game.packs.get(row.pack) : null;
      const tree = pack ? folderTree(pack.folders) : [];
      const reach = pack ? rowCandidates(await pack.getIndex({ fields: ["folder"] }), pack.folders, row.folder) : [];
      rows.push({
        index,
        first: index === 0,
        open: index === grants.length,
        or: row.or === true,
        hasText: !!String(row.title ?? "").trim() || !!String(row.description ?? "").trim(),
        packOptions: packs.map(option => ({ ...option, selected: option.value === row.pack })),
        hasFolders: tree.length > 0,
        folderOptions: tree.map(folder => ({ value: folder.id, label: `${"\u00a0\u00a0".repeat(folder.depth)}${folder.name}`, selected: folder.id === row.folder })),
        itemOptions: reach.map(entry => ({ value: entry._id, label: entry.name, selected: entry._id === row.item })),
        random: !row.item || row.item === RANDOM
      });
    }
    return rows;
  }

  /**
   * Writes one Temporary Traits row back. A row whose compendium is cleared is dropped.
   * @param {Item} item - The drug
   * @param {Number} index - The row
   * @param {Object} changes - The fields to set
   * @returns {Promise<void>} Resolves once saved
   */
  async _updateGrant(item, index, changes) {
    const grants = foundry.utils.deepClone(Array.isArray(item.system.grants) ? item.system.grants : []);
    if (index >= grants.length) {
      grants.push({ pack: "", folder: "", item: RANDOM, title: "", description: "", or: this._pendingGrantOr === true });
      this._pendingGrantOr = false;
    }
    Object.assign(grants[index], changes);
    await item.update({ "system.grants": grants.filter(row => row.pack) });
  }

  /**
   * Lets the GM add to what a granted item carries: a title shown in brackets after its name, and
   * a description written above its own. Both are optional. The content goes to the dialog as an
   * element, since Foundry cleans string content and strips a textarea's placeholder.
   * @param {Object} row - The row as stored
   * @returns {Promise<Object|null>} title and description, or null when cancelled
   */
  async _editGrantText(row = {}) {
    const M = "ep2e.item.drug.mechanics.";
    const content = `<div class="form-group">
        <input type="text" name="grantTitle" onFocus="this.select()" value="${escapeText(row.title)}" placeholder="${game.i18n.localize(M + "grantTitlePlaceholder")}" style="min-width: 100%;"/>
      </div>
      <p class="hint">${game.i18n.localize(M + "grantTitleHint")}</p>
      <div class="form-group">
        <textarea name="grantDescription" rows="5" placeholder="${game.i18n.localize(M + "grantDescriptionPlaceholder")}" style="min-width: 100%;">${escapeText(row.description)}</textarea>
      </div>
      <p class="hint">${game.i18n.localize(M + "grantDescriptionHint")}</p>`;
    const element = document.createElement("div");
    element.innerHTML = content;
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize(M + "grantDescription") },
      classes: ["ep2e-primary-right"],
      content: element,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("ep2e.actorSheet.button.confirm"),
          default: true,
          callback: (event, button) => ({ title: button.form.elements.grantTitle.value, description: button.form.elements.grantDescription.value })
        },
        { action: "cancel", label: game.i18n.localize("ep2e.roll.dialog.button.cancel"), callback: () => ({ cancelled: true }) }
      ],
      position: { width: 360 },
      modal: true,
      rejectClose: false
    });
    return result && typeof result === "object" && !result.cancelled ? result : null;
  }

  /**
   * Wires the Temporary Traits rows: picking a compendium resets folder and item, picking a folder
   * resets the item, the And/Or toggle and the text button save at once. The toggle on the empty
 * row is held until that row gets its compendium.
   * @param {HTMLElement} html - The sheet
   * @param {Item} item - The drug
   * @returns {void}
   */
  _activateGrantListeners(html, item) {
    const rowOf = element => Number(element.closest("[data-grant-index]")?.dataset.grantIndex);
    html.querySelectorAll(".grant-pack").forEach(select => select.addEventListener("change", event => {
      event.stopPropagation();
      this._updateGrant(item, rowOf(select), { pack: select.value, folder: "", item: RANDOM });
    }));
    html.querySelectorAll(".grant-folder").forEach(select => select.addEventListener("change", event => {
      event.stopPropagation();
      this._updateGrant(item, rowOf(select), { folder: select.value, item: RANDOM });
    }));
    html.querySelectorAll(".grant-item").forEach(select => select.addEventListener("change", event => {
      event.stopPropagation();
      this._updateGrant(item, rowOf(select), { item: select.value || RANDOM });
    }));
    html.querySelectorAll(".grant-connector").forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      const index = rowOf(button);
      if (index >= (item.system.grants?.length ?? 0)) {
        this._pendingGrantOr = !this._pendingGrantOr;
        this.render();
        return;
      }
      this._updateGrant(item, index, { or: !(item.system.grants?.[index]?.or === true) });
    }));
    html.querySelectorAll(".grant-description").forEach(button => button.addEventListener("click", async event => {
      event.preventDefault();
      const index = rowOf(button);
      const text = await this._editGrantText(item.system.grants?.[index] ?? {});
      if (text) this._updateGrant(item, index, text);
    }));
  }

async _onRender(context, options) {
  await super._onRender(context, options);

  const html = this.element;
  const item = this.document;
  if (!html) return;
  followingTooltips(html, html);

  const windowHeader = html.querySelector('.window-header');
  if (windowHeader) windowHeader.style.display = 'none';

  const itemHeader = html.querySelector(".ep-sheet-titlebar");
  addWindowControls(this, itemHeader);
  addDragSupport(this, itemHeader);
  addMinimizeSupport(this, itemHeader);

  if(item.type !== "knowSkill" && item.type !== "specialSkill"){
    // Fallback logic for sheets that do not render every static tab
    const availableTabs = Array.from(
      html.querySelectorAll('[data-action="tab"][data-group="primary"][data-tab]')
    ).map(tab => tab.dataset.tab);

    // If details2 is currently selected but not actually shown, fall back to details
    if (!availableTabs.includes(this.tabGroups.primary)) {
      this.tabGroups.primary = availableTabs.includes("details") ? "details" : availableTabs[0];
    }

    // Extra safeguard for weapons with hidden second mode
    if (
      (item.type === "ccWeapon" || item.type === "rangedWeapon") &&
      !item.system.additionalMode &&
      this.tabGroups.primary === "details2"
    ) {
      this.tabGroups.primary = "details";
    }

    await this.changeTab(this.tabGroups.primary, "primary", { force: true });
  }

  itemToggle(html, item);

  html.querySelectorAll("a.moreInfoDialog").forEach(element => {
    element.addEventListener("click", moreInfo);
  });

  if (!this.isEditable) {
    // Fields would otherwise look editable but silently fail to save for non-owners
    html.querySelectorAll("input, select, textarea").forEach(element => element.disabled = true);
    html.querySelectorAll('[data-action="editImage"]').forEach(element => element.removeAttribute("data-action"));
    return;
  }

  registerEffectHandlers(html, item);
  registerCommonHandlers(html, item);

  if (item.type === "drug") {
    this._activateGrantListeners(html, item);
  }

  html.querySelector(".ware-skill-setup")?.addEventListener("click", event => {
    event.preventDefault();
    pickSpecialSkills(item.parent, item);
  });

  html.querySelectorAll(".immunity-delete").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    item.setFlag("eclipsephase", "immunities", learnedBy(item).filter(name => name !== button.dataset.name));
  }));

  if (item.type === "vehicle") {
    this._activateVehicleListeners(html, item);
  }

  html.querySelectorAll(".reveal").forEach(element => {
    element.addEventListener("mouseover", this._onToggleReveal.bind(this));
    element.addEventListener("mouseout", this._onToggleReveal.bind(this));
  });
}

  _onToggleReveal(event) {
    const reveals = event.currentTarget.getElementsByClassName("info");
    for (const value of reveals) {
      value.classList.toggle("icon-hidden");
    }

    const revealer = event.currentTarget.getElementsByClassName("toggle");
    for (const value of revealer) {
      value.classList.toggle("noShow");
    }
  }

  _activateVehicleListeners(html, item) {
    html.querySelectorAll(".autoBot").forEach(element => {
      element.addEventListener("click", this._onAutoBot.bind(this));
    });
  }

  async _onAutoBot(event) {
    const askForOptions = event.shiftKey;
    const element = event.currentTarget;
    const dataset = element.dataset;
    const itemID = dataset.id;
    const itemName = dataset.name;

    const targetItem = await ownerCheck(itemID);

    const popUpTitle = game.i18n.localize("ep2e.actorSheet.dialogHeadline.confirmationNeeded");
    const popUpHeadline = game.i18n.localize("ep2e.actorSheet.button.confirm");
    const popUpCopy = "ep2e.actorSheet.popUp.autoBotCopyGeneral";
    const popUpInfo = "ep2e.actorSheet.popUp.autoBotAdditionalInfo";

    let itemType = null;
    let popUp = { type: "none", confirm: true };

    if (!askForOptions) {
      popUp = await autoBot(popUpTitle, popUpHeadline, popUpCopy, popUpInfo);

      if (popUp.confirm === false) return;

      if (popUp.type !== "none") {
        itemType = game.i18n.localize("ep2e.item.vehicle.table.habitat." + popUp.type);
      } else {
        itemType = game.i18n.localize("ep2e.item.vehicle.skillFieldDefault");
      }
    } else {
      itemType = game.i18n.localize("ep2e.item.vehicle.table.habitat.none");
    }

    const hardware = game.i18n.localize("ep2e.item.additionalSkill.table.defaultHardwareLabel") + itemType;

    let pilotType = "";
    if (popUp.type === "air" || popUp.type === "space") {
      pilotType = game.i18n.localize("ep2e.item.vehicle.table.habitat.aerospace");
    } else if (popUp.type !== "none") {
      pilotType = game.i18n.localize("ep2e.item.vehicle.table.habitat." + popUp.type);
    } else {
      pilotType = game.i18n.localize("ep2e.item.vehicle.skillFieldDefault");
    }

    const pilot = game.i18n.localize("ep2e.item.additionalSkill.table.defaultPilotLabel") + pilotType;
    const know = game.i18n.localize("ep2e.item.additionalSkill.table.defaultKnowLabel") + itemName + " Specs";

    const autoBotUpdate = {
      "system.skills.1.name": game.i18n.localize("ep2e.skills.vigorSkills.fray"),
      "system.skills.1.value": 30,
      "system.skills.2.name": game.i18n.localize("ep2e.skills.vigorSkills.guns"),
      "system.skills.2.value": 30,
      "system.skills.3.name": hardware,
      "system.skills.3.value": 20,
      "system.skills.3.specname": itemName,
      "system.skills.4.name": game.i18n.localize("ep2e.skills.insightSkills.infosec"),
      "system.skills.4.value": 20,
      "system.skills.5.name": game.i18n.localize("ep2e.skills.insightSkills.interface"),
      "system.skills.5.value": 30,
      "system.skills.6.name": game.i18n.localize("ep2e.skills.insightSkills.perceive"),
      "system.skills.6.value": 40,
      "system.skills.7.name": pilot,
      "system.skills.7.value": 60,
      "system.skills.7.specname": itemName,
      "system.skills.8.name": game.i18n.localize("ep2e.skills.insightSkills.research"),
      "system.skills.8.value": 20,
      "system.skills.9.name": know,
      "system.skills.9.value": 80
    };

    if (targetItem.isOwned) {
      const actorWhole = this.item?.parent;
      if (!actorWhole) return;

      autoBotUpdate._id = itemID;
      await actorWhole.updateEmbeddedDocuments("Item", [autoBotUpdate]);
    } 
    else {
      const itemWhole = game.items.get(itemID);
      if (!itemWhole) return;

      await itemWhole.update(autoBotUpdate);
    }
  }
}

async function autoBot(popUpTitle, popUpHeadline, popUpCopy, popUpInfo, popUpTarget) {
  const cancelButton = game.i18n.localize("ep2e.roll.dialog.button.cancel");
  const confirmButton = game.i18n.localize("ep2e.actorSheet.button.confirm");
  const dialogType = "autoBot";
  const template = "systems/eclipsephase/templates/chat/pop-up.html";

  const content = await foundry.applications.handlebars.renderTemplate(template, {
    popUpHeadline,
    popUpCopy,
    dialogType,
    popUpInfo,
    popUpTarget
  });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: popUpTitle },
    classes: ["ep2e-primary-right"],
    content,
    buttons: [
      {
        action: "confirm",
        label: confirmButton,
        default: true,
        callback: (event, button) => _autoBotResults(button.form)
      },
      {
        action: "cancel",
        label: cancelButton,
        callback: () => ({ confirm: false })
      }
    ],
    modal: true,
    rejectClose: false,
    position: { width: 250 }
  });

  return result ?? { confirm: false };
}

function _autoBotResults(form) {
  return {
    confirm: true,
    type: form?.type?.value ?? "none"
  };
}

async function ownerCheck(itemID) {
  for (const character of game.actors) {
    for (const item of character.items) {
      if (item.id === itemID) {
        return { isOwned: true };
      }
    }
  }
  return { isOwned: false };
}