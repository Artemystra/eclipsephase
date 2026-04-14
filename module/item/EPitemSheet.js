import { registerEffectHandlers, registerCommonHandlers, itemToggle, moreInfo } from "../common/general-sheet-functions.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export default class EPitemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
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
    }
  });

  static PARTS = {
    body: {
      template: "systems/eclipsephase/templates/item/item-gear-sheet.hbs",
      root: true
    }
  };

  _getSheetTemplate() {
    const path = "systems/eclipsephase/templates/item";
    return `${path}/item-${this.document.type}-sheet.hbs`;
  }

  static TABS = {
    primary: {
      initial: "details",
      tabs: [
        { id: "details", label: "ep2e.item.general.tabs.detailsTab" },
        { id: "details2", label: "ep2e.item.general.tabs.weaponMode2" },
        { id: "additions", label: "ep2e.roll.dialog.heal.additions.label" },
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
      return { width: 520, height: 420 };
    }
    else if (item.type === "morph") {
      return { width: 620, height: 500 };
    }
    else if (item.type === "specialSkill" || item.type === "knowSkill") {
      return { width: 600, height: 140 };
    }
    else if (item.system?.type === "seeker" || item.type === "grenade") {
      return { width: 680, height: 415 };
    }
    else if (item.system?.type !== "seeker" && item.type === "ammo") {
      return { width: 520, height: 415 };
    }
    else if (item.type === "vehicle"){
      return { width: 1010, height: 505 };
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

async _prepareContext(options) {
  const context = await super._prepareContext(options);
  const item = this.document;

  /**
   * In case we need item
   */
  //console.log(item);

  context.config = CONFIG.eclipsephase;
  context.item = item;
  context.editable = this.isEditable;


  if(item.type !== "knowSkill" && item.type !== "specialSkill"){
    let primaryTabs = Object.values(this._prepareTabs("primary"));

    // Only weapons should show details2
    if (item.type !== "ccWeapon" && item.type !== "rangedWeapon") {
      primaryTabs = primaryTabs.filter(tab => tab.id !== "details2");
    }

    // Only morphs should show additions
    if (item.type !== "morph") {
      primaryTabs = primaryTabs.filter(tab => tab.id !== "additions");
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

  if (item.type === "rangedWeapon") {
    item.system.ammoName = "ep2e.item.weapon.table.ammoUsed." + item.system.ammoType;
  }

  if (item.type === "morph") {
    context.itemList = CONFIG.compendiumList;
  }

  await this._prepareRenderedHTMLContent(context);

  return context;
}

  async _prepareRenderedHTMLContent(context) {
    const itemModel = context.item.system;

    context.htmlDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      itemModel.description ?? "",
      { async: true }
    );
  }

async _onRender(context, options) {
  await super._onRender(context, options);

  const html = this.element;
  const item = this.document;
  if (!html) return;

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

  if (!this.isEditable) return;

  registerEffectHandlers(html, item);
  registerCommonHandlers(html, item);

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
}