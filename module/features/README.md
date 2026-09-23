# Feature folders

A feature folder is a self-contained piece of the system that is meant to become an external
module later (see the Release-v2.5 plan). Building it as a feature folder first, inside the core
system, is a rehearsal for that move: if the boundary holds here, moving the folder into its own
repository is a file copy, not a rewrite.

## The rule

Everything under `module/features/<feature>/` may import only:

- its own files (relative imports that stay inside `module/features/<feature>/`)
- Foundry globals (`game`, `Hooks`, `foundry`, `ChatMessage`, `Handlebars`, ...) - these need no
  import at all
- `game.eclipsephase.api.*` - the public extension surface documented in `docs/EXTENDING.md`

It may **not** import from anywhere else in the system: no `../../rolls/dice.js`, no
`../../common/...`, and no reaching into a different feature's folder either. `EPactor`,
`EPitem`, `dice.js`, `pools.js` and every other core module are off limits by path; if a feature
genuinely needs something from them, that thing belongs in `game.eclipsephase.api` instead.

`scripts/check-feature-boundaries.mjs` enforces this mechanically and runs as part of `npm test`.
A violation fails the whole test run with the offending file and import spelled out.

## Wiring a feature in

`module/features/<feature>/index.js` is the feature's only entry point. `module/eclipsephase.js`
imports it with exactly one line - no other core file imports anything from a feature folder.

Templates for a feature live under `templates/features/<feature>/`, its stylesheet under
`css/features/<feature>.css` (added to `system.json`'s `styles` array). Handlebars partials a
feature registers into a core slot must be preloaded with `loadTemplates()` in the feature's own
`index.js`, since `epSlot` renders them synchronously.

## Localization

A feature's strings stay in `lang/*.json` for as long as the feature lives in the core system -
they are not moved out early. What does move early is a declaration: `lang-keys.json` in the
feature's own folder lists which keys belong to it, as an array of entries. An entry ending in
`.` is a namespace prefix (every key under it belongs to the feature); an entry with no trailing
`.` is one exact key. For example:

```json
["ep2e.shop.", "SETTINGS.enableShopSystem.", "ep2e.item.aspect.table.family.ki"]
```

When the feature is actually extracted into its own module, `scripts/split-lang-keys.mjs`
reads this file and moves exactly the keys it names out of `lang/*.json` into the module's own
language files, for all five languages, preserving each file's line endings.
