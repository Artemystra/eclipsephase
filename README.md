The first inofficial Eclipse Phase 2e system is about two years in the making and nears it's version 1.0 (A state in which the core rules are working with some convenience features where I see fit.). If you like my work and want to support me, please consider buying me a kofi (https://ko-fi.com/diemen) or just texting me here or on discord (jorra#7357) to say "thank you!". It means a lot to me!

<h2>Most important features in overview</h2>
<h3>For Players</h3>
<ul>
<li><a href="#character-sheet-design">Character Sheet Design</a></li>
<li><a href="#action-side-car">Action Side Car</a></li>
<li><a href="#contextual-dice-roll-menus">Contextual Dice Roll Menus</a></li>
<li><a href="#modification-overview">Modification Overview</a></li>
<li><a href="#rules--tooltips">Rules & Tooltips</a></li>
</ul>
<h3>For GMs</h3>
<ul>
<li><a href="#character-sheet-design-1">NPC & Threat Sheet Design</a></li>
<li><a href="#action-bar-1">Enriched Dice Results</a></li>
<li><a href="#legal-disclaimer-1">Extensive Compendium Packs</a></li>
<li><a href="#legal-disclaimer-1">Automated Chat Feedback</a></li>
<li><a href="#legal-disclaimer-1">Active Effects</a></li>
</ul>
<h3><a href="#legal-disclaimer-1">Legal Disclaimer</a></h3>

<h2>For Players</h2>
<h3>Character Sheet Design</h3>
<h3>Action Side Car</h3>
<h3>Contextual Dice Roll Menus</h3>
<h3>Modification Overview</h3>
<h3>Rules & Tooltips</h3>
<h2>For GMs</h2>
<h3>NPC & Threat Sheet Design</h3>
<h3>Enriched Dice Results</h3>
<h3>Extensive Compendium Packs</h3>
<h3>Automated Chat Feedback</h3>
<h3>Active Effects</h3>

<h2><strong>Current state of sheets</strong></h2>
<h2>Character Sheet</h2>
<img src="https://war-klar.de/PicShare/GitHub/characterSheet.jpg"><p/>
<h2>NPC Sheet</h2>
<img src="https://war-klar.de/PicShare/GitHub/npcSheet.jpg"><p/>
<h2>Threat Sheet</h2>
<img src="https://war-klar.de/PicShare/GitHub/threatSheet.jpg"><p/>

<h2><strong>Features are included to date</strong></h2>

<ul>
<li>3 different Character types (Actors, NPCs and Threats)</li>
<li>Derived stats (Ini, trauma, durability etc.)</li>
<li>Better readable chat messages (with success/failure warnings)</li>
<li>Drag & droppable (morph)traits, armor, ware, weapons & vehicles</li>
<li>Simple system to show which items are carried "at hand"</li>
<li>Initiative Tracker + Ini Modifier (on all sheets)</li>
<li>Ammunition count & reload functionality</li>
<li>Roll modification dialogs for all skills. Special dialogs for:</li>
<ul>
<li>Fray Checks</li>
<li>Gun & Melee Checks</li>
<li>Damage Rolls</li>
</ul>
<li>Included compendiums</li>
<ul>
<li>ammo, grenades, ranged- & cc weapons</li>
<li>apps & mesh services</li>
<li>armor</li>
<li>bots & vehicles</li>
<li>drugs & toxins</li>
<li>ego- & morph traits/flaws</li>
<li>gear</li>
<li>psi sleights</li>
<li>ware</li>
<li>homebrew items</li>
</ul>
<li>Active Effects introduced to:</li>
<ul>
<li>Traits & Flaws</li>
<li>Weapons, Armor & Gear</li>
<li>Morph Traits, Morph Flaws & Ware</li>
<li>Drugs, Toxins & Grenades</li>
</ul>
<li>Multiple body support for PCs for up to 6 morphs</li>
<li>Active Effects on Body-Traits/Ware toggle automatically when the body is switched!</li>
<li>Ever growing convenience Tooltips to make you play more an search for rules less</li>
</ul><p>

I'm trying to improve this system on a steady basis, but it will remain a hobby project. If you have any suggestions feel free to open Issues on GIT Hub - I'll come back to you as soon as possible.<p>

<i>I'm also happy for any support - either by saying "thanks" or buying me a kofi: https://ko-fi.com/diemen</i><p>

<h2><strong>Active Effects</strong></h2>
Active Effects is a built in Foundry feature which works with this system. It helps players and game masters to add temporary effects which may be switched on and off based on several indicators like <strong>presence of an item</strong>, <strong>real life time</strong> or <strong>the items status (active inactive)</strong>. <p>

Since there are several items (like traits, flaws and ware) that are morph specific we also included the automatic activation/deactivation of those items when the morph is switched, so you will never have to keep track of any situational modifiers you might only have during populating a specific morph. (<strong>Important:</strong> this only goes for any items which are <strong>always</strong> providing bonuses. Items that only provide bonuses in specific situations like "to all perceive tests <strong>if smell is included</strong>" do not work yet.)<p>

Creating your own active effect items is simpel, but as for now you need to now the exact data value path. To make this a bit easier for you we created a list with all modifiers that are present till date, so you don't have to guess on how to build your own active effect items.

<strong><u>General Mods</strong></u><br>
system.mods.globalMod = affects all skill/aptitude tests.<br>
system.mods.traumaMod = affects all skill/aptitude tests through trauma. (type "-10" to ignore one trauma)<br>
system.mods.woundMod = affects all skill/aptitude tests through trauma. (type "-10" to ignore one wound)<br>
system.mods.woundMultiplier = Sets a wound effect multiplier. This will not effect the number of wounds, but their effect (e.g. 1 wound -20 instead of -10)<br>
system.mods.iniMod = affects initiative. Will be added to the calculated ini + the dice roll.<br>
system.mods.durmod = affects durability. Will also be used to calculate derived stats.<br>
system.mods.lucmod = affects lucidity. Will also be used to calculate derived stats.<br>
system.mods.ttMod = affects trauma threshold. This gets added after the tt is calculated by the system.<br>
system.mods.energyMod = affects energy armor. This is added on top of the energy armor without any effect on encumberance.<br>
system.mods.kineticMod = affects kinetic armor. This is added on top of the kinetic armor without any effect on encumberance.<p>


<strong><u>Pool Mods</strong></u>
system.pools.insight.mod = affects the maximum insight pool.<br>
system.pools.moxie.mod = affects the maximum moxie pool.<br>
system.pools.vigor.mod = affects the maximum vigor pool.<br>
system.pools.flex.mod = affects the maximum flex pool.<p>

<strong><u>Aptitude Mods</strong></u>
system.aptitudes.cog.mod = affects the cognition roll. It is not affecting the cognition itself.<br>
system.aptitudes.int.mod = affects the intuition roll. It is not affecting the intuition itself.<br>
system.aptitudes.ref.mod = affects the reflexes roll. It is not affecting the reflexes itself.<br>
system.aptitudes.sav.mod = affects the savvy roll. It is not affecting the savvy itself.<br>
system.aptitudes.som.mod = affects the somatics roll. It is not affecting the somatics itself.<br>
system.aptitudes.wil.mod = affects the willpower roll. It is not affecting the willpower itself.<p>

<strong><u>Skill Mods</strong></u>
system.skillsIns.infosec.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.interface.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.perceive.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.program.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.research.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.survival.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<p>

system.skillsMox.deceive.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsMox.kinesics.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsMox.persuade.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsMox.provoke.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsMox.psi.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<p>

system.skillsVig.athletics.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.fray.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.free fall.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.guns.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.infiltrate.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.melee.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<p>

<h2><strong>Legal Disclaimer</strong></h2>
<h5 style="font-size: 10px;">Disclaimer: This is the first, unofficial Foundry VTT system for Eclipse Phase 2nd Edition. All official logos, icons or other trademarks are intellectual property of Posthuman Studios, LLC (https://eclipsephase.com) and used with their permission.

Rules and non-registered trademarks are published under (CC) BY-NC-SA (https://creativecommons.org/licenses/by-nc-sa/3.0/). This is also true for any additions made or code written by the developer (me)

All of this was built on the Boilerplate System of FoundryVTT which was distributed for mingling around in it. Thanks, Atropos for this! (https://gitlab.com/foundrynet/worldbuilding)

It's build by a total newbie so do not expect much, but if I did not write it otherwise I'll maintain the code and try to improve it over time. Feel free to get your own fork (hue hue hue) to try to make it even better.

If you want to use it for your own campaigns: Go for it! Please have fun.</h5>