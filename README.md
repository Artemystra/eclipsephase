<h5 style="font-size: 10px;">Disclaimer: This is the first, unofficial Foundry VTT system for Eclipse Phase 2nd Edition. All official logos, icons or other trademarks are intellectual property of Posthuman Studios, LLC (https://eclipsephase.com) and used with their permission.

Rules and non-registered trademarks are published under (CC) BY-NC-SA (https://creativecommons.org/licenses/by-nc-sa/3.0/). This is also true for any additions made or code written by the developer (me)

All of this was build on the Boilerplate System of FoundryVTT which was distributed for mingling around in it. Thanks, Atropos for this! (https://gitlab.com/foundrynet/worldbuilding)

It's build by a total newbie so do not expect much, but if I did not write it otherwise I'll maintain the code and try to improve it over time. Feel free to get your own fork (hue hue hue) to try to make it even better.

If you want to use it for your own campaigns: Go for it! Please have fun.</h5>

<h2><strong>Features are included to date</strong></h2>

<ul>
<li>3 different Character types (Actors, NPCs and Threats)</li>
<li>Derived stats (Ini, trauma, durability etc.)</li>
<li>Better readable chat messages (with success/failure warnings)</li>
<li>Drag & droppable (morph)traits, armor, ware, weapons & vehicles</li>
<li>Simple system to show which items are carried "at hand"</li>
<li>Initiative Tracker + Ini Modifier (on all sheets)</li>
<li>Roll modification dialogs for all skills. Special dialogs for:</li>
<ul>
<li>Fray Checks</li>
<li>Gun & Melee Checks</li>
<li>Damage Rolls</li>
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

<h2><strong>New: Active Effects</strong></h2>
Active Effects is a built in Foundry feature which now has been introduced to this system. It helps players and game masters to add temporary effects which may be switched on and off based on several indicators like <strong>presence of an item</strong>, <strong>real life time</strong> or <strong>the items status (active inactive)</strong>. <p>

Since there are several items (like traits, flaws and ware) that are morph specific we also included the automatic activation/deactivation of those items when the morph is switched, so you will never have to keep track of any situational modifiers you might only have during populating a specific morph. (<strong>Important:</strong> this only goes for any items which are <strong>always</strong> providing bonuses. Items that only provide bonuses in specific situations like "to all perceive tests <strong>if smell is included</strong>" do not work yet.)<p>

Creating your own active effect items is simpel, but as for now you need to now the exact data value path. To make this a bit easier for you we created a list with all modifiers that are present till date, so you don't have to guess on how to build your own active effect items.

<strong><u>General Mods</u></strong><p>
data.mods.globalMod = affects all skill/aptitude tests.<br>
data.mods.traumaMod = affects all skill/aptitude tests through trauma.<br>
data.mods.woundMod = affects all skill/aptitude tests through trauma.<br>
data.mods.iniMod = affects initiative. Will be added to the calculated ini + the dice roll.<br>
data.mods.durmod = affects durability. Will also be used to calculate derived stats.<br>
data.mods.lucmod = affects lucidity. Will also be used to calculate derived stats.<p>

<strong><u>Pool Mods</u></strong><p>
data.pools.insight.mod = affects  the maximum insight pool.<br>
data.pools.moxie.mod = affects the maximum moxie pool.<br>
data.pools.vigor.mod = affects the maximum vigor pool.<br>
data.pools.flex.mod = affects the maximum flex pool.<p>

<strong><u>Aptitude Mods</u></strong><p>
data.aptitudes.cog.mod = affects the cognition roll. It is not affecting the cognition itself.<br>
data.aptitudes.int.mod = affects the intuition roll. It is not affecting the intuition itself.<br>
data.aptitudes.ref.mod = affects the reflexes roll. It is not affecting the reflexes itself.<br>
data.aptitudes.sav.mod = affects the savvy roll. It is not affecting the savvy itself.<br>
data.aptitudes.som.mod = affects  the somatics roll. It is not affecting the somatics itself.<br>
data.aptitudes.wil.mod = affects the willpower roll. It is not affecting the willpower  itself.<p>

<strong><u>Skill Mods</u></strong><p>
data.skillsIns.infosec.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsIns.interface.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsIns.perceive.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsIns.program.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsIns.research.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsIns.survival.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<p>

data.skillsMox.deceive.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsMox.kinesics.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsMox.persuade.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsMox.provoke.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsMox.psi.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<p>

data.skillsVig.athletics.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsVig.fray.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsVig.free fall.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsVig.guns.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsVig.infiltrate.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
data.skillsVig.melee.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<p>

<i>We will also look into a better UX for selecting modable values in the future, but this method will most likely stay at least till version 7.0</i>
