# v2.0 - A New Body

Heya people!

This is the little-big one I've been teasing for a while - v2.0 is finally here, and it's less "a bunch of features" and more "the system growing into its own skeleton." The core idea running through basically everything below and concludes a journey we started somewhere in December last year: **bodies are bodies now.** And this means, that we're finally good to close this chapter for now... or are we?

Anyhow: Armor joins Ware and Traits in being properly bound to whichever Morph, Vehicle or Animal it's actually sitting on, instead of floating around loosely and hoping you remember to keep track of it yourself. And Vehicles/Drones/Animals aren't a weird cousin standing next to the body system anymore - they *are* bodies, with all the same jamming, binding and Enhancement-slot machinery Morphs already had. (I might introduce sleeving them soon as well - yet I'm not too sure whether this is really necessary... but we'll see.)

On top of that, NPCs and Goons finally get the same SideCar overview players have had forever (Armor + Weapons at a glance, no more digging through tabs mid-combat), and I went and fixed a couple of genuinely annoying Foundry ApplicationV2 quirks that were quietly resetting your scroll position and stealing your keyboard focus on every single edit - both turned out to be Foundry core bugs, not us, but that doesn't make them less annoying, so they're worked around now.

And because a system is only as good as the sample characters teaching people how to use it, all 16 core rulebook pregens got rebuilt completely from scratch, hand-verified against the book.

Alright, that's the pitch - here's the actual patch notes:

**Added features**
- Armor is now body-bound like Ware/Traits - drag it onto a Morph, Vehicle or Animal and it stays there. A new personal Armor Stash lets you set pieces aside and Equip them again later, with Rebind/Stash/Equip actions sitting right on the item row
- Morphs with a Puppet Sock can now be jammed under the exact same rules Vehicles already had, instead of only ever being sleeveable - Jam sits right next to Sleeve, and jamming from one already-jammed body straight into another silently restores the old one first
- Ware, Traits, Flaws and now Armor can be pulled directly from the compendium onto any body the moment you drop it, automatically filling its Enhancement slots (with a Standard/Flat choice offered where it matters) instead of a manual create-then-configure step every time
- Enhancement slots (Ware/Traits/Flaws, and now Movement too) on Morphs and Vehicles grow dynamically instead of always showing a fixed number, so you've always got exactly one free slot open
- NPCs and Goons now get the same Armor + Ranged/CC Weapon SideCar players already had - every owned weapon and armor piece shows up unconditionally, since they have no "equip" toggle of their own to hide behind
- Rebuilt the entire Morph compendium from Character Options' full Morph Recognition Guide (~132 entries across Biomorphs, Synthmorphs and Infomorphs), and gave every Synthmorph, Smart Animal and Vehicle/Drone its correct book Frame, Ware, Armor and Trait values
- Synthmorphs can now pull an optional Armor Frame (Light/Medium/Heavy) straight from the compendium, auto-binding the moment the body is dropped onto an actor
- All 16 core rulebook sample characters were rebuilt from the ground up, purely from the book, with no cheating

**Bug Fixes & Code Quality**
- Fixed scroll position resetting to the top of a tab on every sheet re-render, and fixed keyboard focus dropping off the entire sheet after editing any field - both turned out to be Foundry ApplicationV2 core quirks and are now explicitly worked around
- Fixed a NaN Death Rating that could show up on legacy actors, by correctly recovering their body type from pre-1.5 data during migration.
- Fixed jammed-body armor and wound modifiers double-counting on "Own Body" rolls, and fixed drone-bound armor Ware (e.g. Bioweave) not applying its bonus at all while jammed
- Fixed multiple simultaneous Aversion Flaws colliding into one corrupted value instead of stacking correctly
- Fixed cross-actor Armor transfers silently dragging along the source actor's stale binding instead of resolving fresh on the target
- Renamed the "Vehicle" item type to "Remote Body" system-wide, and moved several misclassified Armor-compendium entries (Carapace/Industrial/Light Combat/Heavy Combat) into proper Ware items where they belonged
- Cleaned up duplicate and misattributed Morph compendium entries, and fixed a data bug that made "Digital Speed" unselectable on any body despite being morph-specific by nature.

**UX Improvements**
- Added a Physical Description and a Registered ID tab to the Limited character sheet, replacing the old always-visible body section - Registered ID shows the currently active ID's name and description at a glance
- Reworked the Armor SideCar into a compact single line across every actor type, with some useful information still just a hover away.
- Restructured the chat message header into two centered rows (sender name on top, timestamp below) with the delete icon pinned so it doesn't drift around when a name wraps
- Hid the Movement section entirely on bodies that don't have any (looking at you, Infomorphs) instead of showing an empty header
- Fixed item-row-list entries stretching to match a taller sibling in the same grid row, so an expanded neighbor's description no longer drags every closed entry down with it
