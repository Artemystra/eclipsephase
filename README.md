The first inofficial Eclipse Phase 2e system for Foundry is happy to announce it's bump to version 1.0 - just three years after I started to learn how to code (so we're both ready for Kindergarten now <3 ). The current system is in a state in which the core rules are working while I have also implemented some convenience features (e.g. automatic ammo count) where I see fit. 
<p><p/>
The time and energy I put into this project is happily given and does not demand any pay nor tribute. Though if you like my work and want to emotially support me, while going thorough all states of mental illness (described in the Eclipse Phase core rules) please consider: 

Writing something nice
<img src="https://war-klar.de/PicShare/GitHub/discordLogo.webp"/>

Buying me a kofi
<img src="https://war-klar.de/PicShare/GitHub/kofiLogo.webp"/>


<h2>Most important features in overview</h2>
<h3>Localization</h3>
<ul>
<li><a href="#languages-included">Languages included</a></li>
<li><a href="#about-localization">About Localization</a></li>
</ul>
<h3>Features For Players</h3>
<ul>
<li><a href="#character-sheet-design">Character Sheet Design</a></li>
<li><a href="#action-side-car">Action Side Car</a></li>
<li><a href="#contextual-dice-roll-menus">Contextual Dice Roll Menus</a></li>
<li><a href="#rules--tooltips">Rules & Tooltips</a></li>
<li><a href="#automatic-rest-calculator">Automatic Rest Calculator</a></li>
</ul>
<h3>Features For GMs</h3>
<ul>
<li><a href="#npc--threat-sheet-design">NPC & Threat Sheet Design</a></li>
<li><a href="#enriched-dice-results">Enriched Dice Results</a></li>
<li><a href="#extensive-compendium-packs">Extensive Compendium Packs</a></li>
<li><a href="#automated-chat-feedback">Automated Chat Feedback</a></li>
<li><a href="#active-effects">Active Effects</a></li>
</ul>
<h3>Disclaimers</h3>
<ul>
<li><a href="#personal">Personal</a></li>
<li><a href="#contribution">Contribution</a></li>
<li><a href="#legal">Legal</a></li>
</ul>

<h2>Localization</h2>
<h3>Languages Included</h3>
<p>To date we're supporting the system in the following languages:</p>
<ol>
<li>English</li>
<li>Chinese (Simplified)</li>
<li>German</li>
<li>Portugese (BR)</li>
<p>Keeping this system up to date in all of these laguages is a never ending process. Therefore every laguage but English (which the system is written in) and German (which I'm a native speaker in) will show some not correctly localized parts here and there.</p>
<p>If you are a native speaker in any of these (or other) languages and want to support the system with your skills, feel free to contact me directly via mail or on discord (laphaela). You don't need any development skills and your help will be much appreciated by anyone who plays the system in your language!</p>
</ol>

<h3>About Localization</h3>
<p>We're happy to announce that from this moment on forward, the system at hand is fully localized and can and will be translated into as many laguages as possible. Please keep in mind, that the system is made for fans by fans. None of us gets paid for writing code, designing the sheets, improving the overall UX/UI or translating it into another language. Apart from the fact, that this means, that there might be errors and some sentences, words or speech patterns that are not as professional and clear as you might wish for, it also means, that none of this happens without YOU. Yes, we need YOU to make localization happen. So if you happen to speak & write any laguage not localized yet or are under the impression that you can support us or one of our language experts who created a localization for a specific language, feel free to reach out via discord. I'm happy to help you getting started or connect you to the people necessary to discuss your ideas of how to make our system more accessible for people speaking other languages than english.</p>

<h2>Features For Players</h2>
<h3>Character Sheet Design</h3>
<p><img src="https://war-klar.de/PicShare/GitHub/characterSheet2.png"><br>
<i>The character sheet is designed to reduce player search time</i></p>
<ol>
<li>
<strong>The Persona Section<strong><br>
Holds every information that rarely changes during a session or even a campaign. It holds your aptitudes, traits & flaws and the personality description of your character as well as their goals, IDs and rep.
</li>
<li>
<strong>The Inventory Section<strong><br>
A normal character has a lot of inventory to manage, such as armor, weapons, special gear and even vehicles or special abilities like psi sleights. While the skills tab is the most commonly used in this section, most of the other tabs are often just to help you setting your character up for a mission and then not to be seen again for some time. Yet itßs still common to browse your different inventories while making up your mind how to overcome a threat.
</li>
<li>
<strong>The Action Side Car<strong><br>
Here you find an overview of the most important items your character has currently at hand. It's meant to be a combat/scene companion that gives you qick access to the items currently at hand. The Side Car also provides a lot of other helpful information.
</li>
</ol>

<h3>Action Side Car</h3>
<p>The basic idea of the Action Side Car is that you as a player sets up their characters inventory for a mission or scene and save navigation time afterwards, to prevent you from navigating to your (probably extensive) inventory again in search for this one item you want to use.</p>
Apart from this the Action Side Car comes with a number of convenience features that help you and your GM alike to understand the rules a bit better:
<ul>
<li>
<strong>Modification Overview<strong><br>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/modifiers.png">
</div><br>
To provide you as a player with a better idea of the modifications automatically applied to your rolls, you have the Modification Over on top of the Side Car. You can always hover it to get more information about the nature of the modifications you're suffering.
</li>
<li>
<strong>Armor Section<strong><br>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/armorOverview.png">
</div><br>
Presents the player with a cumulated value for both their energy and their kinetic armor. Beside stating if the armor exceeding certain thresholds it's also hoverable so players can understand the armor values and how any modification may impact them a bit better.
</li>
<li>
<strong>Item Details<strong><br>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/itemDetails.png">
</div><br>
While it's necessary to reduce the provided information, about any item shown, to the bare minimum in order to save as much space as possible, players can easily decollapse these items to get to know more about their items at hand.
</li>
<strong>Reload Automation<strong><br>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/reload.png">
</div><br>
Melee and Ranged weapons can be directly rolled from this section. If applicable, ranged weapons automatically deduct the ammo used from the sheet. The Action Side Bar provides players with the option to reload them directly. This mechanic is not yet bound to any ammunition. This will eventually change before deployment of v1.0.
</li>
</ul>

<h3>Contextual Dice Roll Menus</h3>
<p>Most of the rules in Eclipse Phase a relatively straight forward, which is reflected in the minimal design of the common dice roll pop-up. To save you, as a player, time and nerves special rolls like attacks, fray or psi are enriched to provide the best UX as possible, while navigating through your GMs challenges.</p>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/diceRollMenu.png">
</div><br>
<i>Hacking is not yet fully implemented. This might change after the deployment of v1.0 as result of the rules complexity around this topic.</i>

<h3>Rules & Tooltips</h3>
<p>Where applicable the system is enriched with other tooltips including some of the more complex rules of Eclipse Phase, to save you time searching for them in the rulebook. If you're missing some important rules feel free to open an issue and let's discuss this matter.</p>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/Tooltips.png">
</div><br>

<h3>Automatic Rest Calculator</h3>
<p>Resting allows players to recover pool points. All you have to do is choosing your preferred rest type by clicking the checkbox next to it. The roll will happen automatically and refills your pools to the max if possible. If not it's presenting you with another menu to choose how to distribute your points.</p>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/restCalculator.png">
</div><br>

<h2>Features For GMs</h2>
<h3>NPC & Threat Sheet Design</h3>
<p><h2>NPC Sheet</h2>
<img src="https://war-klar.de/PicShare/GitHub/npcSheet.jpg"></p>
<p><h2>Threat Sheet</h2>
<img src="https://war-klar.de/PicShare/GitHub/threatSheet.jpg">
<i>The main difference between the Threat and the NPC sheet is the fact, that NPCs are provided with goals and extended psi rules, as they're meant to be closer to what a player character is about to experience during a mission or campaign.</i></p>
While player character sheets are quite complex, they're designed to be used in a more exclusive way, screen estate wise. While your players will commonly have only one character open, you might casually view multiple threat & NPC sheets all at once. Therefore the screens are reduced much more, without preventing you from using any other functionality.

<h3>Enriched Dice Results</h3>
<p>While the rules of EP are relatively straight forward, keeping track of all the modifiers affecting your players rolls can be tedious. This is why the system tries to make dice roll results as tranparent as possible.</p>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/diceResults.png">
</div><br>

<h3>Extensive Compendium Packs</h3>
<p>Since Eclipse Phase is published under a creative commons license it's possible for us to provide you with many of the standard items, available from the EP2E base rules.</p>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/Compendiums.png">
</div><br>

<h3>Automated Chat Feedback</h3>
<p>While TTRPG is all about trust and communication, there are sometimes things players forget to communicate while still important that you're keeping track of them. For this reason the system provides you with many automated chat messages, briefing you about what your players are about and how they're trying to achieve it.</p>
<div style="display: grid; align-items: center;">
    <img src="https://war-klar.de/PicShare/GitHub/chatFeedback.png">
</div><br>

<h3>Active Effects</h3>
Active Effects is a built in Foundry feature which works with this system. It helps players and game masters to add temporary effects which may be switched on and off based on several indicators like <strong>presence of an item</strong>, <strong>real life time</strong> or <strong>the items status (active inactive)</strong>. <p>

Since there are several items (like traits, flaws and ware) that are morph specific we also included the automatic activation/deactivation of those items when the morph is switched, so you will never have to keep track of any situational modifiers you might only have during populating a specific morph. (<strong>Important:</strong> this only goes for any items which are <strong>always</strong> providing bonuses. Items that only provide bonuses in specific situations like "to all perceive tests <strong>if smell is included</strong>" do not work yet.)<p>

Creating your own active effect items is simpel, but as for now you need to now the exact data value path. To make this a bit easier for you we created a list with all modifiers that are present till date, so you don't have to guess on how to build your own active effect items.

<p><strong><u>General Mods</strong></u><br>
system.mods.globalMod = affects all skill/aptitude tests.<br>
system.mods.traumaMod = affects all skill/aptitude tests through trauma. (type "-10" to ignore one trauma)<br>
system.mods.woundMod = affects all skill/aptitude tests through trauma. (type "-10" to ignore one wound)<br>
system.mods.woundMultiplier = Sets a wound effect multiplier. This will not effect the number of wounds, but their effect (e.g. 1 wound -20 instead of -10)<br>
system.mods.iniMod = affects initiative. Will be added to the calculated ini + the dice roll.<br>
system.mods.durmod = affects durability. Will also be used to calculate derived stats.<br>
system.mods.lucmod = affects lucidity. Will also be used to calculate derived stats.<br>
system.mods.ttMod = affects trauma threshold. This gets added after the tt is calculated by the system.<br>
system.mods.energyMod = affects energy armor. This is added on top of the energy armor without any effect on encumberance.<br>
system.mods.kineticMod = affects kinetic armor. This is added on top of the kinetic armor without any effect on encumberance.</p>

<p><strong><u>Pool Mods</strong></u>
system.pools.insight.mod = affects the maximum insight pool.<br>
system.pools.moxie.mod = affects the maximum moxie pool.<br>
system.pools.vigor.mod = affects the maximum vigor pool.<br>
system.pools.flex.mod = affects the maximum flex pool.</p>

<p><strong><u>Aptitude Mods</strong></u>
system.aptitudes.cog.mod = affects the cognition roll. It is not affecting the cognition itself.<br>
system.aptitudes.int.mod = affects the intuition roll. It is not affecting the intuition itself.<br>
system.aptitudes.ref.mod = affects the reflexes roll. It is not affecting the reflexes itself.<br>
system.aptitudes.sav.mod = affects the savvy roll. It is not affecting the savvy itself.<br>
system.aptitudes.som.mod = affects the somatics roll. It is not affecting the somatics itself.<br>
system.aptitudes.wil.mod = affects the willpower roll. It is not affecting the willpower itself.</p>

<p><strong><u>Skill Mods</strong></u>
system.skillsIns.infosec.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.interface.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.perceive.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.program.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.research.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsIns.survival.mod = affects the skilltotal of given skill. Also affects the skilltest roll.</p>

system.skillsMox.deceive.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsMox.kinesics.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsMox.persuade.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsMox.provoke.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsMox.psi.mod = affects the skilltotal of given skill. Also affects the skilltest roll.</p>

system.skillsVig.athletics.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.fray.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.free fall.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.guns.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.infiltrate.mod = affects the skilltotal of given skill. Also affects the skilltest roll.<br>
system.skillsVig.melee.mod = affects the skilltotal of given skill. Also affects the skilltest roll.</p>

<h2><strong>Disclaimers</strong></h2>
<h3>Personal</h3>
<p>Please keep in mind, that this system is build from ground up using a boilerplate and coded by one person who is totally new to coding in general. While I had some great help in the past (looking at you, Will) most of the code is done by myself and not very coherent nor well documented (though I'm trying my best). If not otherwise noted, this system will keep updating constantly, but please feel free to reach out with your own ideas if you like. I really hope that you like the system and that you're going to enjoy many meaningful hours of fun with your friends & players all around the world!</p>

<h3>Contribution</h3>
<p>Starting this system for my own campaign only it has grown to a far more mature EP2e system in time. This leads to many convenience features not yet or only partially integrated. While I appreciate every comment and feature request or discussion around how to best tackle a particular problem believe it to be a good practice to reach out to me before you start sending me pull requests, even if the intend may be noble. If you want to participate to this project please keep the following in mind:</p>

<p>
<ul>
<li>Please do never send a pull request into the master branch. This branch is my own campaign and testing live branch. You're free to use it for your own campaign but be aware that the master branch might break from time to time, leaving your system unplayable for an unforseeable period.</li>
<li>Please reach out before you're investing a massive amount of time into a new feature. As it happens this system is still very work in progress and it might well be that there's a specific reason why I have not already tackled a specific functionality. The best thing to do is just ping me on discord (laphaela) and shortly chat with me about your idea</li>
<li>A feature backlog exists. I'm keeping a more or less up to date trello board with smaller and bigger task to streamline work. If you want to contribute and have no idea about what you can do, just ping me via discord (laphaela) and we figure it out</li>
<li>If you happen to have already invested time into a project do not fret. Of course I love to see your work and am happy to merge it into my current working branch. The typical branch I'm messing with is the development branch, so if you want to show me your work, please consider sending a pull request there. You're also quite welcome to reach out via discord (laphaela)</li>
</ul>
</p>

<p>Please do not take these words in any defensive or otherwise gatekeeping way. I love to see any contribution to the system as is and would love to incorporate your work into the existing code. We just saw some pull requests in the past that didn't make it into the code as the solution people worked on was already in development without them knowing about it. I'm looking forward to you reaching out!</p>

<h3>Legal</h3>
<p>This is the first, unofficial Foundry VTT system for Eclipse Phase 2nd Edition. All official logos, icons or other trademarks are intellectual property of Posthuman Studios, LLC (https://eclipsephase.com) and used with their permission.</p>

<p>Rules and non-registered trademarks are published under (CC) BY-NC-SA (https://creativecommons.org/licenses/by-nc-sa/3.0/). This is also true for any additions made or code written by the developer (me)</p>

<p>All of this was built on the Boilerplate System of FoundryVTT which was distributed for mingling around in it. Thanks, Atropos for this! (https://gitlab.com/foundrynet/worldbuilding)</p>