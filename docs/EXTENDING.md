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
  api: { rolls, actors, ui, chat, migration, registry, drugs }
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
api.rolls   // RollCheck, rollToChat, TaskRoll, TaskRollModifier, rollCalc, usePoolFromChat,
            // prepareRecipients, gmList, inheritChatVisibility, damageValueCalc,
            // applySuccessTierBonus
api.actors  // bodyBindingKey, bodyHasWareMarker, chainHasWareMarker, bodyNervousSystem,
            // sleevedNervousSystem, CYBERBRAIN_MARKER, targetKinds, transferItemBetweenActors,
            // mergeOrCreateItem, requestGMItemTransfer, tempEffectCreation, tempEffectDeletion,
            // getBodyBindingInfo, resolveBodyForItem, applyStandardEnhancements, applyFrame
api.ui      // confirmation, selectBody, moreInfo, systemMessage, addWindowControls,
            // addDragSupport, addMinimizeSupport, registerCommonHandlers,
            // itemTypeFilterPills, slideToggleVisibility, selectFromSearchableList,
            // tokenAt, pickTokensOnCanvas, drawTargetMarker, selectedTokenActor,
            // pickActorFromList
api.chat    // readRollContext(element), registerCard, renderCard, updateCard
api.migration // createProgressDialog(title), forEachActor(fn, options), forEachItem(fn, options),
              // postNotice(actor, key, data)
api.drugs     // takeDose, offerDose, forceDose, activeDoseFor, doseSubstrate, doseEffectData,
              // chemicalPayload, chooseDrugForm, needsVectorChoice, drugVector, isAmmoPack,
              // runningDoses, drugBlockingPsi, drugPsiPenalties
api.attacks   // registerAttackEffect, applyTargetedAttack, postDefenceCards, rollDefence,
              // defenceOutcome, chemicalDoses, followUpVisibility, yieldDefence,
              // unsuitableTarget
```

`api.drugs` is described in "Drugs and doses" below.

`api.ui.pickTokensOnCanvas({ icon, color, markColor, multi, max, within, refuse, marker })` lets
the user pick targets on the canvas. A click marks a token, another click on it unmarks it, a
right-click confirms; Escape, or a right-click with nothing marked, cancels. Open sheets are
minimised while the user picks and come back afterwards. It resolves to the marked tokens in the
order they were marked, or `null`.

- `icon` is a Font Awesome class, e.g. `"fa-syringe"`, or one of the system's own shapes,
  `"ep-slash"` (melee) or `"ep-lightning"` (psi), drawn as the cursor and as the marks.
  Without it both are a crosshair. The system's own colours are a turquoise cursor and red marks
  with a white border; `color` and `markColor` (CSS hex values) change them.
- `multi: true` picks up to `max` targets: the text under the cursor counts down, and a click past
  `max` is refused with a notice. `max: Infinity` takes any number, and the text counts what is
  marked. Without `multi` one target is picked: the text says whether it is chosen, and a click on
  another token moves the mark over to it.
- `within` (in scene units, edge to edge) refuses a further token farther than that from every
  token already marked, with a notice - a burst at targets within a meter of each other is
  `within: 1`.
- `refuse(token)` returns a notice for a token that may not be picked, or nothing; the notice is
  shown and the token stays unmarked.
- `marker(token, point, { icon, color })` draws the mark and returns what removes it. The default,
  `drawTargetMarker`, draws the cursor's shape in `markColor` with a white border where the token
  was clicked.

`selectedTokenActor()` is the actor of the user's selected token, and
`pickActorFromList(actors, header, copy)` asks for one actor from a list the user can filter by
typing.

`api.rolls.RollCheck` runs the full task-roll pipeline (dialog, pool spend, chat card) and is
what a custom roll source hooks into via `eclipsephase.preRollDialog`/`preRoll`/`postRoll` below.
A dataset may carry `visibility: { whisper, blind }`, which then decides who sees the roll card
instead of the dialog's roll mode - the system's defence rolls are seen as their attack was this
way.
`api.chat.readRollContext(element)` takes any element inside a chat card (typically the button a
listener fired on) and returns the roll context described in "Chat message context" below,
falling back to the card's legacy `data-*` attributes for cards created before this existed.

`api.migration` lets a module run its own data updates the same way the system's own migrations
do:

```js
await api.migration.forEachActor(async actor => {
  // update actor
}, { label: "My Module Migration", filter: actor => actor.type === "character" });

await api.migration.forEachItem(async item => {
  // update item
}, { includeCompendiums: true });

await api.migration.postNotice(actor, "my-module.migrationNotice", { count: 3 });
```

Both iterators show a cancellable progress dialog, isolate one document's error from the rest (it
is logged and collected, not thrown), and resolve to
`{ completed, total, cancelled, errors }`. `forEachActor` covers every world actor.
`forEachItem` covers world items and every actor's embedded items by default, and world item
compendiums as well when `includeCompendiums` is `true`. `postNotice` whispers a localized chat
message to an actor's non-GM owners and does nothing when it has none - the pattern the system's
own migrations use for a one-time "your data changed" notice.

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
| `eclipsephase.preRoll` | In `RollCheck()`, right before the roll is performed | `rollContext` with `dataset`, `actor`, `actorModel`, `rolledFrom`, `rollType`, `options`, `task`, `pool`, `modifiers` (array to push into), `itemData`, `flags`, `weapon` (what `weaponPreparation` returned for a weapon attack, or `null`) | Add a `TaskRollModifier` (or `{text, value, comment}`) to `modifiers`, or contribute data via `itemData`/`flags` |
| `eclipsephase.postRoll` | In `RollCheck()`, after the chat card was created | `rollContext` with `outputData`, `message` (the created `ChatMessage`, or `null`), `blind`, `rollMode` | React to a completed roll |
| `eclipsephase.poolResult` | In `usePoolFromChat()`, after a pool spend from a roll card was applied and the card redrawn | `{ context, actor, rolledFrom, newResult, blind, recipientList }` | React to a pool-rescue outcome (e.g. complete a purchase) |
| `eclipsephase.prepareActorMods` | In `EPactor.prepareData()`, right after `mods`/`currentStatus` are reset | `(actorWhole, actorModel)` | Contribute to `actorModel.mods` before derived values are computed |
| `eclipsephase.prepareActorStatus` | In `EPactor.prepareData()`, before the status-sidebar modifiers are summed | `(actorWhole, actorModel)` | Push `{label, modifier, flag}` onto `actorModel.currentStatus.specialModifiers` |
| `eclipsephase.prepareActorDerived` | In `EPactor.prepareData()`, as its last statement | `(actorWhole, actorModel)` | Override fully-derived fields |
| `eclipsephase.prepareItemData` | In `EPitem.prepareData()`, as its last statement | `(item, itemModel)` | Override fully-derived item fields |
| `eclipsephase.effectSuppression` | In `effects.js`, while deciding whether an ActiveEffect is suppressed | `(item, actor, result)` - set `result.suppressed` | Add a suppression rule for a module's own item types |
| `eclipsephase.prepareActorSheetContext` | In `EPactorSheet._prepareContext()`, as its last statement | `(sheet, context)` | Add to the sheet's render context |
| `eclipsephase.effectDurations` | In `EPactor.onUpdateEffectDurations()`, whenever a tracked effect's remaining duration changed | `(actorWhole, effects, event, context)` | React to a timed effect running down or expiring |
| `eclipsephase.weaponLoaded` | In the reload handler, right before a weapon's new load is written | `{ actor, weapon, ammo, ammoType, update }` - mutate `update` | Keep something about the load on the weapon, as the system keeps a chemical weapon's dose |
| `eclipsephase.postRest` | In the rest handler, right before the actor update is written | `(actorWhole, restType, updates)` - mutate `updates` | Add fields to a rest's update payload |
| `eclipsephase.ready` | In the system's own `ready` hook | `(game.eclipsephase)` | Register a module once the API is in place |

Only `character`, `npc` and `goon` actors run through this pipeline (`EPactor.MANAGED_TYPES`);
an actor type your module contributes via a module sub-type (see below) is left untouched by
`EPactor.prepareData()`.

## Registries

Registration functions are under `game.eclipsephase.api.registry`, available once
`eclipsephase.ready` has fired:

```js
Hooks.once("eclipsephase.ready", ({ api }) => {
  api.registry.registerRollSource(/* ... */);
});
```

A rejected registration (missing field, duplicate id) is logged with `console.error` and returns
`false` - it never throws, so one broken module cannot stop the system from loading.

### `registerRollSource(id, definition)`

Lets a roll use `id` as its `rolledFrom` value and resolve its own skill/pool data instead of
being matched by a hardcoded string inside the roll pipeline.

```js
api.registry.registerRollSource("myRoll", {
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
api.registry.registerPoolOption({
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
api.registry.registerSlot("chatCard.buttons", {
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
api.registry.registerRezSpendOptions({
  options: { /* the dialog's entries, same shape as the core table */ },
  costMatrix: { /* Rez cost per option id */ }
});
```

### `registerTaskResultText(table)`

Replaces the success-tier text table (`outputData()`'s `resultText`, and `outcomeAlternatives()`'s
pool-swap alternatives) wholesale. Only one registration is accepted; call it once, from your
module's `init` or `ready`.

```js
api.registry.registerTaskResultText({
  0: { class: "fail", text: "my-module.roll.result.majorFailure" },
  // ... one entry per TASK_RESULT tier, 0-9
});
```

### `registerStrainFamily(id, definition)`

Registers a discipline that works like Psi: its own substrate rule, its own sub-strain table, its
own influence results and its own feedback target. `id` is what a sleight carries in
`system.strainFamily`. The core registers `psi`; the Eclipse Phase Ki module registers `ki` the
same way, through this same function.

```js
api.registry.registerStrainFamily("myFamily", {
  label: "my-module.family.label",        // the option in the sleight's family dropdown
  tabLabel: "my-module.family.tab",       // the character sheet's strain tab

  substrate(actor) {
    // Where can this discipline work? Read the body through the public API, never by importing
    // the system's own files.
    const { sleevedNervousSystem, chainHasWareMarker, CYBERBRAIN_MARKER } = game.eclipsephase.api.actors;
    const blocked = sleevedNervousSystem(actor) === "info";
    return {
      blocked,
      jamBlocked: false,                   // true only when jamming is what blocks it
      penalised: false,                    // true applies the -30 substrate mismatch
      reasonKey: "my-module.roll.blocked", // shown when a roll is refused
      tooltipKey: "my-module.roll.blockedShort"
    };
  },

  influence(result, { strainLabel, archetypeData, actorModel }) {
    // What the Infection Test's influence card says for a d6 result of 1-6. Return null when
    // the family has nothing for that result; never throw.
    return { label: "my-module.effect.label", copy: "my-module.effect.copy", withRule: true };
  },

  subStrains: CONFIG.eclipsephase.myFamilyStrains,   // the sub-strain dropdown
  tierTraits: {                                      // the prerequisite a dropped sleight asks for
    1: { name: "My Family I", pack: "my-module.my-sleights" },
    2: { name: "My Family II", pack: "my-module.my-sleights" }
  },
  feedback: { target: "mental", copyKey: "my-module.effect.takeStrain" },
  mismatchKey: "my-module.roll.substrateMismatch",
  dataPath: "flags.my-module.subStrain",             // where the per-actor choices live
  detailsPartial: "modules/my-module/templates/details.html"
});
```

Four things are worth knowing before you build one:

- **`dataPath` should point into your own flags**, not into `system`. The core's schema does not
  know your family, and a field it does not declare is not yours to rely on. Write it with
  `actor.update({"flags.my-module.subStrain.x": ...})` - **never `setFlag`**, which throws for a
  module that is not active, and a migration may well run before yours is.
- **A family nobody registered is refused, not guessed.** `getStrainFamily(id)` answers with
  `{missing: true}` and a substrate that blocks, so a sleight whose module is switched off cannot
  quietly resolve as Psi. The sheet shows a "module missing" panel instead of the sleight list.
- **`influence` is a function, not a table.** Psi's results depend on the player's own per-slot
  choices and on the archetype; a table cannot express that. Yours may ignore the arguments and
  return a constant if it is simpler.
- **`tierTraits` carries the pack**, so the trait can live in your module's own compendium.

`getStrainFamily(id)`, `listStrainFamilies()` and `hasStrainFamily(id)` are on `api.registry` too,
for reading the registry back.

### `registerPayloadSource(packId, definition)` (2.8.5)

Offers a compendium's substances as payloads for ammunition and grenades - the "Select payload"
button of a munition sheet lists every drug from every registered source that fits the payload's
delivery (inside the target = injection, on contact = dermal, cloud = inhalation; electronic drugs
never fit).

```js
api.registry.registerPayloadSource("my-module.nanoswarms", {
  label: "my-module.payload.sources.swarms",   // a localization key
  filter: item => item.system.drugType === "nano"   // optional: which entries count
});
```

The system registers `eclipsephase.drugs-and-toxins`. `listPayloadSources()` returns the registered
sources as `{ packId, label, filter }`.

A munition that arrives on a sheet with something still open - a seeker whose size reads `select`,
or a payload switched on without a substance - asks for both in one dialog. A module that takes
items in by its own drop handler (a shop, say) calls the same step before creating the item, the
way it calls `api.drugs.chooseDrugForm` for drugs:

```js
if (!(await api.actors.chooseMunition(itemData))) return;   // cancelled: create nothing
const label = api.actors.munitionLabel(item.type, item.system);   // "Minimissile · Grin", for a list row
const { size, payload } = api.actors.needsMunitionChoice(item.type, item.system);   // still open?
```

`api.actors.mergeOrCreateItem` stacks munitions only with the same size and payload.

## Drugs and doses

A drug is an Item of type `drug`. Taking a dose puts one ActiveEffect on the actor; everything the
system does with the dose afterwards - the Time Panel row, the roll dialog's options, the check
when it takes hold, the wear-off card - reads that effect. A module adds a drug by authoring the
item; it adds behaviour by reading the effect.

### Authoring a drug

The fields that decide what a dose does:

| Field | Meaning |
|---|---|
| `category` | `"drug"` or `"toxin"` |
| `drugType` | `"biochem"`, `"nano"`, `"electronic"` or `""`. Biochem and nano need a biomorph, electronic an infomorph or a cyberbrain; `""` is never refused |
| `dermal`, `inhalation`, `injection`, `oral` | The forms the drug comes in. A pack holds one form, chosen when the drug is added to a sheet |
| `isAmmo` | The pack loads into a weapon and cannot be taken |
| `usagesUsed`, `usagesMax` | Doses spent and doses per pack |
| `duration` | `{ value, units }`, units one of `rounds`, `seconds`, `minutes`, `hours`, `days`. No value means the dose runs until it is ended by hand |
| `wearOff` | `{ d10, d6, bonus }` - stress rolled from the card when the dose ends; all zero for none |
| `rollOptions` | Conditional modifiers, see below |
| `useCheck` | A check when the dose takes hold, see below |
| `blocksPsi` | The dose blocks psi outright |
| `overTime` | Effects over time, see below |
| `healingAddition` | A dice formula added to healing rolls on Meds while the dose runs, e.g. `"1d10"` |
| `grants` | Items lent for as long as the dose runs, see below |
| `addictionType`, `addictionMod` | `"mental"`, `"physical"`, `"both"` or `""`/`"none"`, and the WIL Check's modifier as text, e.g. `"-20"` |

The drug's own ActiveEffects are blueprints: they never apply from the item. A dose copies their
`changes` onto the actor. Use them for flat modifiers that always hold - Kick's bonus to the Vigor pool - and
`rollOptions` for anything that depends on the situation.

A roll option is offered in the roll dialog while the dose runs, and the player ticks it when it
applies:

```json
{
  "id": "fear",
  "label": "my-module.drugs.juiceFear",
  "value": 30,
  "appliesTo": ["sav", "wil"],
  "random": false,
  "automatic": false,
  "replacesGlobal": false
}
```

`appliesTo` lists skill keys, aptitude keys, or `"know"` for any Know skill; an empty list matches
every check. `label` is a localization key or plain text. `random` rolls the sign - plus or minus
`value`, even odds. `automatic` applies the option on every matching check without offering it.
`replacesGlobal` stands in for the drug's own penalty to all actions on that roll, for a drug whose
penalty is stronger in one situation.

A use check is rolled from a card, by the actor's owner, the moment the dose takes hold:

```json
{
  "aptitude": "wil",
  "modifier": -20,
  "failure": "blocksPsi",
  "duration": { "value": null, "units": "" },
  "stress": { "d10": 0, "d6": 0, "bonus": 0 },
  "successPsiPenalty": -30
}
```

`failure` is what a failed check does: `"incapacitated"` or `"immobilized"` puts a timed condition
on the actor for `duration` (no value: as long as the dose runs) and removes it with the dose;
`"blocksPsi"` blocks psi for the dose's span; `"stress"` posts a card that rolls `stress`.
`successPsiPenalty` is a modifier on psi tests after a passed check. A pool spend that turns a
failure into a pass undoes the failure. An empty `aptitude` means no check.

Effects over time tick on the world clock while the dose runs:

```json
{
  "damage": { "d10": 1, "d6": 0, "bonus": 0 },
  "interval": "turn",
  "ticks": null,
  "modifier": -10,
  "incapacitates": false
}
```

`interval` is `"turn"` or `"hour"`. Every tick deals `damage`, each tick measured against the Wound
Threshold on its own. `ticks` caps the number of ticks; no value means every tick the dose lasts.
`modifier` is added once more after every full interval as a penalty to all actions, the first after one interval; with `incapacitates` the
target is incapacitated once that penalty reaches their Durability.

A grant row lends one item from a compendium:

```json
{ "pack": "eclipsephase.traits", "folder": "", "item": "random", "title": "", "description": "", "or": false }
```

`item` is a document id, or `"random"` for any item in `folder` (or the whole pack) the actor
does not own yet. `title` is added in brackets after the item's name, `description` above its
own. A row with `or: true` starts a new package; one package is picked at random, and all its rows
are lent. Lent items carry `flags.eclipsephase.grantedBy` with the dose's id and go with it.

Toxins always meet the body's defensive ware (Toxin Filters, Digestive Symbiotes, Medichines,
Nanophages, Immunizers); a drug taken willingly asks first. A halved dose runs half as long and
does half its effect, rounded up.

### The dose effect

A dose is an ActiveEffect on the actor with `transfer: false`, `showIcon` never, an explicit
`start` and an expiry on the world clock. Its data comes from `api.drugs.doseEffectData(item)`,
and it carries the drug's state in `flags.eclipsephase.dose`:

```js
{
  itemId, name,        // the pack it came from; name is the key, see below
  category, drugType,
  vector,              // the form it was taken in
  onset,               // e.g. "1 Action Turn", for the card
  wearOff,             // dice formula, e.g. "1d10+2", or ""
  rollOptions,         // as authored
  useCheck,            // as authored, or null
  checkOutcome,        // null, "passed" or "failed"
  psiPenalty,          // set by a passed check
  blocksPsi,           // from the drug, or from a failed check
  overTime,            // as authored, or null
  overTimeState,       // { ticks, steps } dealt so far
  healingAddition,     // as authored
  grants,              // as authored
  addiction,           // { type, modifier }, or null
  defense,             // { halved, by, checkBonus } when ware halved it
  filteredOut          // true once a filter's check kept it out
}
```

A drug does not stack with itself: a second dose of a drug already running - in any form - renews
the running dose instead of adding another. The renewal restarts the clock, takes the new pack's
data and asks for the check again. The name is what makes two packs the same drug.

When a dose runs out, the system deletes it, and the client that deletes it posts the wear-off card
and removes what the dose left behind: its conditions and its lent items.
Listen to `deleteActiveEffect` and check for the `dose` flag to react to a dose ending; listen to
`eclipsephase.effectDurations` to watch it run down.

### `api.drugs`

```js
const { drugs } = game.eclipsephase.api;
await drugs.takeDose(actor, item);        // { taken, emptied, refused, effect }
await drugs.offerDose(actor, item);       // { offered, message } - a card anyone can claim
await drugs.forceDose(actor, item);       // a melee attack that delivers the dose, see "Targeted attacks"
drugs.chemicalPayload(item);              // { data, drugType, name } - the dose a hit delivers
drugs.activeDoseFor(actor, "Kick");       // the running dose, or null
drugs.doseSubstrate(actor, item);         // { allowed, reasonKey }
await drugs.chooseDrugForm(itemData);     // false when cancelled; keeps only the chosen form
drugs.needsVectorChoice(item.system);     // true while a drug still offers several forms
drugs.drugVector(item.system);            // { key, label, onset } of its one form, or null
drugs.isAmmoPack(item.system);            // true for a pack that loads into a weapon
drugs.runningDoses(actor);                // the dose flag of every active dose
drugs.drugBlockingPsi(actor);             // the drug's name, or null
drugs.drugPsiPenalties(actor);            // [{ name, modifier }]
```

`takeDose`, `offerDose` and `forceDose` behave exactly like the sheet's controls: they refuse an
ammunition pack, an empty pack or a body the drug cannot act on with a notification, spend the
dose and post the cards. An offered dose is only spent once someone claims it, a forced one once
the attacker has picked the target after the hit.

A pack holds one form. A sheet that lets someone acquire a drug - an actor sheet, a shop - calls
`chooseDrugForm(itemData)` on the incoming data before creating it: it asks for the form and
whether the pack is ammunition, and does nothing for anything else. `api.actors.mergeOrCreateItem(actor,
itemData)` then adds it to a matching stack - same type and name, and for a drug the same form -
or creates it.

## Targeted attacks

An attack lands on targets. Every attack dialog that rolls a weapon, a psi-gamma sleight, or an
attack a caller set up itself has "Choose target(s)" as its primary button: the dialog steps
aside, the attacker marks the targets on the canvas, and confirming them rolls the attack. "Roll
without targets" rolls as before; the attack card then offers its target button after a hit. On a
hit - straight away, or once a pool point turns a miss into one - each target's owner (its player
owners, or the GM for a target no player owns) gets one card to defend from. The attack card names
its targets and, once each has defended, the outcome.

How many targets an attack takes comes from the dialog: one for a single shot or a melee attack, two
or three for a burst or full auto at several targets (at least two, within a meter of each other),
by range for a cone, any number for suppressive fire, and as many as "Number of targets" names for
melee, where each target is attacked on its own. A sleight takes one, two with the Additional
Target push.

### Defending

The defence follows from the attack: against a ranged attack Fray, halved, with "Dodge behind
cover" against an area attack; against a melee attack Fray in full or a parry with Melee; against a
sleight a WIL Check (Moxie pool), on half WIL against a pushed Power. A ranged card also rolls the
rest at once, without a dialog. Every defence dialog offers "Full defense" (+30). A target may
choose not to resist a sleight: `api.attacks.yieldDefence(message, targetUuid)` - the card's "Don't
resist" button - lets the attack land without a roll. An attack set up with `willing: true` skips
the defence cards altogether and lands on every target at once.

`api.attacks.defenceOutcome(attack, { passed, result, value, behindCover })` decides what reaches
the target: a failed defence is a `"hit"`; a successful dodge against an area attack lets `"half"`
through, or `"none"` behind cover. Otherwise it is an opposed test against `attack.roll`
(`{ value, result }`, the attack's die and result as its card shows them when the defence lands -
a pool point spent on the attack before that counts): when both succeed, a critical success beats
one that is not, and between equals the higher die wins, a tie going to the defender. The attack
card keeps its pool controls until the first target has defended. A defender who wins against a
sleight with a critical success is noted as having locked the async out.

Defence cards, defence rolls and the damage card are seen as the attack card was:
`api.attacks.followUpVisibility(attackCard, targets)` is public for a public attack, and otherwise
whispers to those who saw the attack card, the GMs and the targets' owners.

### Registering an effect

What the hit brings is registered:

```js
game.eclipsephase.api.attacks.registerAttackEffect("my-module.net", {
  detect(rollContext) {            // at preRoll: does this roll carry the effect?
    if (!rollContext.weapon?.weapon?.getFlag("my-module", "net")) return null;
    return { targets: 1, area: false, labelKey: "my-module.applyNet", effectLabel: "", payload: {},
      cursor: { icon: "fa-spider-web" },       // optional: icon, color, markColor; the crosshair otherwise
      within: null,                             // optional: picker distance for several targets
      unsuitable: ["infomorph"],                // optional: target kinds it cannot strike
      willing: false };                         // optional: land without defence cards
  },
  ready(attack) { return true; },              // optional, before picking: false refuses
  async beforeDelivery(attack) { return true; }, // optional, after picking: false refuses
  async resolve(attack, target, outcome, { byPool, defenceId, kind }) {}
});
```

The attack travels in `flags.eclipsephase.roll.targetedAttack` on the attack card:
`{ id, effect, actorUuid, weaponName, defence, area, targets, within, unsuitable, willing, payload,
labelKey, effectLabel, cursor, preTargets, delivered, targetNames, roll, messageId }`. `targets: 0`
stands for any number. `defence` is `"ranged"`, `"melee"` or `"will"`. `preTargets` lists the actor
uuids picked in the dialog. A caller can set an attack up itself through
`dataset.contextFlags.targetedAttack`, as `forceDose` does; its dialog picks targets the same way.
`resolve` runs where the defence settles; `outcome` is `"hit"`, `"half"` or `"none"`, `kind` how the
target defended (`"dodge"`, `"parry"`, `"will"`, `"yield"` or `"willing"`), and with `byPool` it
should undo what the earlier outcome did first.

### Unsuitable targets

`api.actors.targetKinds(actor)` names what an actor counts as when picked: `"biomorph"`,
`"synthmorph"` or `"infomorph"` by its morph, `"bot"`, `"vehicle"` or `"animal"` while it jams one,
and `"cyberbrain"` as well when its body runs one. An attack's `unsuitable` lists the kinds it
cannot strike; the picker refuses those with a notice, before the roll and after it alike.
`api.attacks.unsuitableTarget(actor, unsuitable)` returns that notice, or `null`. A psi-gamma
sleight cannot strike a synthmorph, an infomorph, a bot or a vehicle, and takes -30 against a
cyberbrain picked before the roll (once the roll has landed, the modifier can no longer apply).

### The system's effects

- `"damage"` - a weapon that deals damage, and a psi-gamma sleight that does. Once every target has
  defended and one was struck, a damage card follows the last defence with "Roll damage": one roll
  counts for every target struck. The active GM puts it on each target, less the armour it meets:
  `payload.armorUsed` is `"energy"` or `"kinetic"` (a weapon mode's armour type, or the loaded
  ammunition's when it names one), `"mental"` against psi (Psi Armor: WIL / 3, plus effects on
  `system.mods.mentalArmorMod`) or `"none"`. `payload.armorPiercing` halves the armour (armour
  piercing, a Penetration push), half damage reaches a target who partly dodged an area attack,
  and `payload.damageTarget` puts it on the body or, as stress, the mind. The card shows each
  target's owners and the GMs the reckoning, everyone else only whether damage got through.
- `"sleight"` - a psi-gamma sleight without damage of its own. The targets resist with WIL, and the
  outcome stays on the cards; what the sleight does is the GM's to apply.
- `"dose"` - a weapon with the "Ammunition: Chems" trait (`specialAmmoDrugs`) delivers one dose per
  target, as an area attack, to as many targets as its cone reaches at the range chosen
  (`api.attacks.chemicalDoses(weaponTraits)` tells whether a weapon fires chemicals). The weapon
  keeps a copy of the drug it was loaded with in `system.ammoSelected.dose`, so a hit still knows it
  once the pack is used up. `forceDose` sets up a melee attack carrying a dose.

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
  options: { push, attackMode, biomorphTarget, touchOnly, range, rollMode },
  item: { weaponId, weaponMode, sleightId, damageTarget },
  messageId
}
```

A card created before this existed has no flags; `readRollContext()` falls back to translating
the button's own `data-*` attributes into the same shape (`version: 0`), so existing chat logs
keep working. Visibility (`blind`/whisper) is read from the `ChatMessage` itself, not stored here.

The system stores only its own keys here. To put your own block on the card, assign it to
`context.flags` in `eclipsephase.preRoll`; those keys are merged over the stored context, so a key
you name is yours outright. This is the only route by which a chat button clicked later - a pool
spend, say - can reach data your module gathered at roll time. A roll your module starts itself
can also carry flags from the start: put them on the dataset as `contextFlags` before calling
`api.rolls.RollCheck`, and they arrive as `context.flags` in every hook. The system's own dose
checks and forced doses travel this way.

```js
Hooks.on("eclipsephase.preRoll", context => {
  if (context.rolledFrom !== "myRoll") return;
  context.flags.myModule = { orderId: "abc", discountSteps: 2 };
});
```

### One card per roll

A task roll's card keeps what it shows in `flags.eclipsephase.taskCard`. A pool spend no longer
posts a card of its own: it redraws the roll card, whose pool controls give way to a note on who
spent which pool, and whose result - on a swap, the die as well - shows the new values. What the
new result unlocks (a damage button, a target button) appears on that same card, and the buttons
go by the new result: `flags.eclipsephase.roll.alternatives.spent` is set, and `alternatives.result`
is the result they use. A card can take one pool spend. Cards from before keep the old separate
pool card.

### Cards that change

A card that changes after it was posted keeps its state in its flags under one key and is drawn
again from it. Register the kind of card once, at load, on every client - the active GM redraws
cards for users who may not edit them:

```js
const { chat } = game.eclipsephase.api;
chat.registerCard("myModule-vote", {
  render: state => renderTemplate("modules/my-module/vote.html", state),
  mutations: { vote: (state, { name }) => ({ ...state, votes: [...state.votes, name] }) }
});

const state = { votes: [] };
await ChatMessage.create({ content: await chat.renderCard("myModule-vote", state), flags: { eclipsephase: { "myModule-vote": state } } });

await chat.updateCard(message, "myModule-vote", "vote", { name: "Ana" });   // or "merge" with fields
```

`updateCard(message, key, mutation, payload, { extra })` runs the change on the card's current
state, redraws it and writes content and state in one update, together with any `extra` update
fields. Changes to one card run one after another, so changes arriving together are all kept. A
user who may not edit the card sends the change to the active GM.

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
Hooks.once("eclipsephase.ready", (ep) => {
  if (foundry.utils.isNewerVersion("2.5", ep.version)) {
    ui.notifications.error("Eclipse Phase Example requires system version 2.5 or later.");
    return;
  }

  ep.api.registry.registerPoolOption({
    value: "exampleIgnore",
    label: "eclipsephase-example.rollDialog.exampleIgnore",
    when: context => context.rolledFrom === "exampleRoll"
  });

  Hooks.on("eclipsephase.postRoll", (rollContext) => {
    console.log("Example module saw a roll:", rollContext.rolledFrom);
  });
});
```
