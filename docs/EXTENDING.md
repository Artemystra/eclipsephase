# Extending Eclipse Phase 2e

This system exposes hooks, registries and a small API object so a Foundry module can add
content and rules without patching the system's own files. Everything documented here is
read directly from the current code — if a hook or function listed below stops matching the
source, this file is out of date and should be fixed alongside the code change.

## `game.eclipsephase`

Set in the system's `init` hook and available to every module by the time `ready` fires:

```js
game.eclipsephase = {
  EPactor,               // the Actor document class
  EPitem,                // the Item document class
  rollItemMacro,         // builds a hotbar macro for an item
  rollWeaponMacro,       // builds a hotbar macro for a weapon roll
  version,               // game.system.version, e.g. "2.5"
  api: { rolls, actors, ui, chat }
};
```

`EPactor`, `EPitem`, `rollItemMacro` and `rollWeaponMacro` predate the extension API and are
what the system's own generated hotbar macros call - do not remove them when reworking `init`.

### `version`

`game.eclipsephase.version` mirrors `system.json`'s `version`. Compare it with
`foundry.utils.isNewerVersion()` against the minimum your module needs, and refuse to load with
`ui.notifications.error()` if it is too old.

### `api`

Everything under `api` is a re-export of an existing system function - nothing was moved, so the
same function is reachable both through `api` and through its original module path. Anything
listed here is considered stable for a module to depend on.

```js
api.rolls   // RollCheck, rollToChat, TaskRoll, TaskRollModifier, rollCalc, prepareRecipients,
            // gmList, inheritChatVisibility, damageValueCalc, applySuccessTierBonus
api.actors  // bodyBindingKey, bodyHasWareMarker, chainHasWareMarker, bodyNervousSystem,
            // sleevedNervousSystem, CYBERBRAIN_MARKER, transferItemBetweenActors,
            // requestGMItemTransfer, tempEffectCreation, tempEffectDeletion
api.ui      // confirmation, selectBody, moreInfo, systemMessage, addWindowControls,
            // addDragSupport, addMinimizeSupport, registerCommonHandlers,
            // itemTypeFilterPills, slideToggleVisibility
api.chat    // readRollContext(element)
```

`api.rolls.RollCheck` runs the full task-roll pipeline (dialog, pool spend, chat card) and is
what a custom roll source hooks into via `eclipsephase.preRollDialog`/`preRoll`/`postRoll` below.
`api.chat.readRollContext(element)` takes any element inside a chat card (typically the button a
listener fired on) and returns the roll context described in "Chat message context" below,
falling back to the card's legacy `data-*` attributes for cards created before this existed.

## `eclipsephase.ready`

Fired once, after `game.eclipsephase` (including `api`) is fully assembled:

```js
Hooks.once("eclipsephase.ready", (ep) => {
  // ep === game.eclipsephase
});
```

Register your module against the system from this hook rather than from Foundry's own `ready`,
so you don't race the system's own `init`/`ready` setup.

## Hooks

All of the following are custom hooks this system fires with `Hooks.callAll`, except
`eclipsephase.preRollDialog`, which uses `Hooks.call` and can be cancelled by returning `false`
from a listener.

| Hook | Fires | Arguments | Purpose |
|---|---|---|---|
| `eclipsephase.preRollDialog` | In `RollCheck()`, right after the roll is defined, before the options dialog opens | `rollContext` (mutable; set `rollContext.cancelReason` to a loc key before returning `false`) | Cancel a roll before its dialog opens |
| `eclipsephase.preRoll` | In `RollCheck()`, right before the roll is performed | `rollContext` with `dataset`, `actor`, `actorModel`, `rolledFrom`, `rollType`, `options`, `task`, `pool`, `modifiers` (array to push into), `itemData`, `flags` | Add a `TaskRollModifier` (or `{text, value, comment}`) to `modifiers`, or contribute data via `itemData`/`flags` |
| `eclipsephase.postRoll` | In `RollCheck()`, after the chat card was created | `rollContext` with `outputData`, `message` (the created `ChatMessage`, or `null`), `blind`, `rollMode` | React to a completed roll |
| `eclipsephase.poolResult` | In `usePoolFromChat()`, after a pool spend from a chat card was applied | `{ context, actor, rolledFrom, newResult, blind, recipientList }` | React to a pool-rescue outcome (e.g. complete a purchase) |
| `eclipsephase.prepareActorMods` | In `EPactor.prepareData()`, right after `mods`/`currentStatus` are reset | `(actorWhole, actorModel)` | Contribute to `actorModel.mods` before derived values are computed |
| `eclipsephase.prepareActorStatus` | In `EPactor.prepareData()`, before the status-sidebar modifiers are summed | `(actorWhole, actorModel)` | Push `{label, modifier, flag}` onto `actorModel.currentStatus.specialModifiers` |
| `eclipsephase.prepareActorDerived` | In `EPactor.prepareData()`, as its last statement | `(actorWhole, actorModel)` | Override fully-derived fields |
| `eclipsephase.prepareItemData` | In `EPitem.prepareData()`, as its last statement | `(item, itemModel)` | Override fully-derived item fields |
| `eclipsephase.effectSuppression` | In `effects.js`, while deciding whether an ActiveEffect is suppressed | `(item, actor, result)` - set `result.suppressed` | Add a suppression rule for a module's own item types |
| `eclipsephase.prepareActorSheetContext` | In `EPactorSheet._prepareContext()`, as its last statement | `(sheet, context)` | Add to the sheet's render context |
| `eclipsephase.postRest` | In the rest handler, right before the actor update is written | `(actorWhole, restType, updates)` - mutate `updates` | Add fields to a rest's update payload |
| `eclipsephase.ready` | In the system's own `ready` hook | `(game.eclipsephase)` | Register a module once the API is in place |

Only `character`, `npc` and `goon` actors run through this pipeline (`EPactor.MANAGED_TYPES`);
an actor type your module contributes via a module sub-type (see below) is left untouched by
`EPactor.prepareData()`.

## Registries

Registration functions live in `systems/eclipsephase/module/api/registry.js` and can be imported
by absolute path from a module:

```js
import { registerRollSource, registerPoolOption, registerSlot, registerRezSpendOptions }
  from "/systems/eclipsephase/module/api/registry.js";
```

A rejected registration (missing field, duplicate id) is logged with `console.error` and returns
`false` - it never throws, so one broken module cannot stop the system from loading.

### `registerRollSource(id, definition)`

Lets a roll use `id` as its `rolledFrom` value and resolve its own skill/pool data instead of
being matched by a hardcoded string inside the roll pipeline.

```js
registerRollSource("myRoll", {
  skillRoll(actorModel) {
    // returns { rollvalue, specname, poolType } or null
  },
  prepareRollData(dataset, actor) {
    // optional: returned object is merged into roll.sourceData and the stored roll context
  }
});
```

The core system registers `rangedWeapon` and `ccWeapon` this way.

### `registerPoolOption(definition)`

Adds an entry to every pool `<select>` in the roll dialog.

```js
registerPoolOption({
  value: "myOption",
  label: "my-module.rollDialog.myOption",
  when(context) {
    // receives { rollType, rolledFrom, actor }; return true to show the option
    return context.rollType === "myRollType";
  }
});
```

### `registerSlot(name, definition)`

Renders a Handlebars partial at a named place inside a core template.

```js
registerSlot("chatCard.buttons", {
  template: "modules/my-module/templates/my-button.html",
  order: 10,          // ascending; default 0
  when(context) {}    // optional, receives the slot's render context
});
```

The template must already be loaded (`foundry.applications.handlebars.loadTemplates()` in your
module's own `init`) before the slot renders, since Handlebars partials render synchronously.

Slot names the core templates currently expose:

| Slot | Template |
|---|---|
| `actor.statusSummary` | `templates/actor/partials/currentStatus/statusSummary.html` |
| `actor.gearTab.footer` | `templates/actor/partials/tabs/gear-tab.html` |
| `actor.gmInfo.rezLedger` | `templates/actor/partials/tabs/gm-info-tab.html` |
| `actor.headerBadges` | `templates/actor/partials/headerblock.html` |
| `rollDialog.sections` | `templates/chat/partials/general-modifiers.html` |
| `chatCard.header` | `templates/chat/task-result.html` |
| `chatCard.buttons` | `templates/chat/task-result.html` |

### `registerRezSpendOptions(definition)`

Replaces the Rez-spending table the character sheet offers wholesale. Only one registration is
accepted; call it once, from your module's `init` or `ready`.

```js
registerRezSpendOptions({
  options: { /* the dialog's entries, same shape as the core table */ },
  costMatrix: { /* Rez cost per option id */ }
});
```

## Chat message context

`RollCheck()` stores the data a chat card's buttons need in `flags.eclipsephase.roll` on the
`ChatMessage` it creates, instead of spreading it across `data-*` attributes. Read it with
`api.chat.readRollContext(element)`, passing any element inside the card (it walks up to the
card's `[data-message-id]`). The returned object:

```js
{
  version: 1,
  actorUuid, userId, rolledFrom, rollType,
  pool: { skillPoolValue, flexPoolValue, updatePoolPath, updateFlexPath, poolType },
  alternatives: { usageType, result, value, originalResult, resultClass, resultText },
  options: { push, attackMode, biomorphTarget, touchOnly, rollMode },
  item: { weaponId, weaponMode, sleightId, damageTarget },
  shop: { shopUuid, buyerActorId, itemIds, network, requiredTier, bodyBindings, burnAmount },
  messageId
}
```

A card created before this existed has no flags; `readRollContext()` falls back to translating
the button's own `data-*` attributes into the same shape (`version: 0`), so existing chat logs
keep working. Visibility (`blind`/whisper) is read from the `ChatMessage` itself, not stored here.

## Module sub-types for your own document types

Foundry lets a module declare its own Actor or Item sub-type without touching this system's
`template.json`. In your module's `module.json`:

```json
{
  "documentTypes": {
    "Actor": { "myType": {} }
  }
}
```

Foundry namespaces the type id as `<your-module-id>.myType`. In your module's `init`:

```js
CONFIG.Actor.dataModels["my-module.myType"] = class extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { /* your fields */ };
  }
};

foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "my-module", MySheet, {
  types: ["my-module.myType"],
  makeDefault: true
});
```

`EPactor`/`EPitem` still run for a document of your type (Foundry routes every Actor through the
system's document class), but `EPactor.prepareData()` returns immediately for any type outside
`EPactor.MANAGED_TYPES` (`character`, `npc`, `goon`), so it never touches your data. There is no
built-in way to convert an existing document from a system type to a module type or back -
migrating one requires an explicit `update({ type, system: _replace({...}) })` (`_replace` is
Foundry's shorthand global for `foundry.data.operators.ForcedReplacement.create`), since a bare
`update({type})` fails silently in v14: no exception is thrown, but the type never changes.

## Minimal example module

```json
// module.json
{
  "id": "eclipsephase-example",
  "title": "Eclipse Phase Example",
  "version": "1.0.0",
  "compatibility": { "minimum": "14" },
  "relationships": {
    "systems": [{ "id": "eclipsephase", "type": "system", "compatibility": { "minimum": "2.5" } }]
  },
  "esmodules": ["module.js"]
}
```

```js
// module.js
import { registerPoolOption } from "/systems/eclipsephase/module/api/registry.js";

Hooks.once("eclipsephase.ready", (ep) => {
  if (foundry.utils.isNewerVersion("2.5", ep.version)) {
    ui.notifications.error("Eclipse Phase Example requires system version 2.5 or later.");
    return;
  }

  registerPoolOption({
    value: "exampleIgnore",
    label: "eclipsephase-example.rollDialog.exampleIgnore",
    when: context => context.rolledFrom === "exampleRoll"
  });

  Hooks.on("eclipsephase.postRoll", (rollContext) => {
    console.log("Example module saw a roll:", rollContext.rolledFrom);
  });
});
```
