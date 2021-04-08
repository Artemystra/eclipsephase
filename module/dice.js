//General & Special Task Checks
export async function TaskCheck({
    //General
    actorData = "",
    skillName = "",
    specName = "",
    spec = false,
    skillValue = null,
    askForOptions = false,
    optionsSettings = null,
    brewStatus = false,
    //Roll
    rollType = "",
    rollModeSelection = null,
    activeRollTarget = "",
    globalMod = null,
    rollFormula = "1d100",
    //Psi
    infectionMod = null,
    aspectPushes = null,
    aspectBase = null,
    //Guns
    aim = "",
    size = "",
    range = "",
    coverDefender = "",
    coverAttacker = false,
    visualImpairment = "",
    prone = false,
    firingMode = "",
    smartlink = true,
    running = false,
    superiorPosition = false,
    calledShot = false,
    inMelee = false
    } = {}) {
    console.log("The Skill Name from Dice.js: " + skillName)
    //Guns check dialog
    if (askForOptions != optionsSettings && skillName === "guns") {
        let checkOptions = await GetGunsTaskOptions(rollType);

        if (checkOptions.cancelled) {
            return;
        }

        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        aim = checkOptions.aim;
        size = checkOptions.size;
        range = checkOptions.range;
        coverDefender = checkOptions.coverDefender;
        coverAttacker = checkOptions.coverAttacker;
        visualImpairment = checkOptions.visualImpairment;
        prone = checkOptions.prone;
        firingMode = checkOptions.firingMode;
        smartlink = checkOptions.smartlink;
        running = checkOptions.running
        superiorPosition = checkOptions.superiorPosition;
        calledShot = checkOptions.calledShot;
        inMelee = checkOptions.inMelee;
    }

    //Psi check dialog
    else if (askForOptions != optionsSettings && skillName === "psi" && brewStatus === true) {
        let checkOptions = await GetPsiTaskOptions(rollType);

        if (checkOptions.cancelled) {
            return;
        }

        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        aspectPushes = checkOptions.pushes
        aspectBase = checkOptions.aspects
    }

    //Default skill check dialog
    else if (askForOptions != optionsSettings) {
        let checkOptions = await GetTaskOptions(rollType);

        if (checkOptions.cancelled) {
            return;
        }

        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
    }

    let gunsMod = 0;
    let gunAnnounce = "";
    let gunModTitle = "";

    if (skillName === "guns"){
        console.log("Smartlink: " + smartlink);
        console.log("Running: " + running);
        console.log("Superior Position: " + superiorPosition);
        console.log("Called Shot: " + calledShot);
        console.log("In Melee: " + inMelee);
        console.log("Covered Attacker: " + coverAttacker);
        //Guns roll modifications
        if (!smartlink) {
            gunsMod -= 10;
            gunAnnounce += "<br>No Smartgun (<strong>-10</strong>)";
        }
        if (running) {
            gunsMod -= 20;
            gunAnnounce += "<br>Running (<strong>-20</strong>)";
        }
        if (superiorPosition) {
            gunsMod += 20;
            gunAnnounce += "<br>Superior Position (<strong>+20</strong>)";
        }
        if (calledShot) {
            gunsMod -= 10;
            gunAnnounce += "<br>Called Shot (<strong>-10</strong>)";
        }
        if (inMelee) {
            gunsMod -= 20;
            gunAnnounce += "<br>Stuck in Melee (<strong>-10</strong>)";
        }

        if (coverAttacker) {
            gunsMod -= 10;
            gunAnnounce += "<br>In Cover (<strong>-10</strong>)";
        }

        if (aim === "quick") {
            gunsMod += 10;
            gunAnnounce += "<br>Quick Aim (<strong>+10</strong>)";
        }
        else if (aim === "long") {
            gunsMod += 30;
            gunAnnounce += "<br>Long Aim (<strong>+30</strong>)";
        }

        if (size === "xs") {
            gunsMod -= 30;
            gunAnnounce += "<br>Very Small Target (<strong>-30</strong>)";
        }
        else if (size === "s") {
            gunsMod -= 10;
            gunAnnounce += "<br>Small Target (<strong>-10</strong>)";
        }
        else if (size === "l") {
            gunsMod += 10;
            gunAnnounce += "<br>Large Target (<strong>+10</strong>)";
        }
        else if (size === "xl") {
            gunsMod += 30;
            gunAnnounce += "<br>Very Large Target (<strong>+30</strong>)";
        }

        if (range === "range" && prone) {
            gunsMod -= 20;
            gunAnnounce += "<br>Prone at Range (<strong>-20</strong>)";
        }
        else if (range === "beyond" && prone) {
            gunsMod -= 30;
            gunAnnounce += "<br>Prone Beyond Range (<strong>-30</strong>)";
        }
        else if (range === "beyond+" && prone) {
            gunsMod -= 40;
            gunAnnounce += "<br>Prone Far Beyond Range (<strong>-40</strong>)";
        }
        else if (range === "range") {
            gunsMod -= 10;
            gunAnnounce += "<br>At Range (<strong>-10</strong>)";
        }
        else if (range === "beyond") {
            gunsMod -= 20;
            gunAnnounce += "<br>Beyond Range (<strong>-20</strong>)";
        }
        else if (range === "beyond+") {
            gunsMod -= 30;
            gunAnnounce += "<br>Far Beyond Range (<strong>-30</strong>)";
        }


        if (coverDefender === "minor") {
            gunsMod -= 10;
            gunAnnounce += "<br>Target in minor Cover (<strong>-10</strong>)";
        }
        else if (coverDefender === "moderate") {
            gunsMod -= 20;
            gunAnnounce += "<br>Target in moderate Cover (<strong>-20</strong>)";
        }
        else if (coverDefender === "major") {
            gunsMod -= 30;
            gunAnnounce += "<br>Target in major Cover (<strong>-30</strong>)";
        }

        if (visualImpairment === "minor") {
            gunsMod -= 10;
            gunAnnounce += "<br>Minor Visual Impairment <strong>-10</strong>";
        }
        else if (visualImpairment === "major") {
            gunsMod -= 20;
            gunAnnounce += "<br>Moderate Visual Impaired <strong>-20</strong>";
        }
        else if (visualImpairment === "blind") {
            gunsMod -= 30;
            gunAnnounce += "<br>Blind (<strong>-30</strong>)";
        }

        if (firingMode === "burst") {
            gunsMod += 10;
            gunAnnounce += "<br>Wide Burst (<strong>+10</strong>)";
        }
        else if (firingMode === "fullAuto") {
            gunsMod += 30;
            gunAnnounce += "<br>Wide Full Auto (<strong>+30</strong>)";
        }
        else if (firingMode === "indirect") {
            gunsMod -= 20;
            gunAnnounce += "<br>Indirect (<strong>-20</strong>)";
        }

        gunModTitle = gunAnnounce ? "<p/><u>Shooting Modifiers</u>" : "";
    }


    //General roll modifications
    let woundMod = Number(actorData.mods.woundMod) + Number(actorData.mods.traumaMod);
    let rollMod = Number(globalMod) - woundMod;
    let modSkillValue = Number(skillValue) + Number(globalMod) + Number(gunsMod);

    //Chat message variables
    spec = specName ? "(" + specName + ")" : "";
    let situationalPlus = globalMod>0 ? "+" : "";
    let modAnnounce = rollMod ? "<u>Applied Mods:</u> <br>" : "";
    let woundAnnounce = woundMod ? "Wound/Trauma:<strong> -" + woundMod + "</strong><br>" : "";
    let globalAnnounce = globalMod ? "Situational:<strong>" + situationalPlus + globalMod + "</strong>" : "";

    //The dice roll
    let roll = new Roll(rollFormula).roll();

    //Success check
    let rollCheck = roll.total;
    let success = rollCheck <= modSkillValue;
    let critical = rollCheck === 11 || rollCheck === 22 || rollCheck === 33 || rollCheck === 44 || rollCheck === 55 || rollCheck === 66 || rollCheck === 77 || rollCheck === 88;
    let autoSuccess = rollCheck === 100;
    let autofail = rollCheck === 99;
    let doubleSuperior = rollCheck >= 66;
    let superior = rollCheck >= 33;
    let successMessage = "";

    //Success messages
    if (autofail) {
        successMessage = "<span class='fail'>Supreme Fail!</span> <p>";
    } else if (autoSuccess) {
        successMessage = "<span class='success'>Supreme Success!</span> <p>";
    } else if (success && critical && doubleSuperior) {
        successMessage = "<span class='success'>Superior Critical Success!</span> <p>";
    } else if (!success && critical && rollCheck <= 33) {
        successMessage = "<span class='fail'>Superior Critical Fail!</span> <p>";
    } else if (success && critical && superior) {
        successMessage = "<span class='success'>Greater Critical Success!</span> <p>";
    } else if (!success && critical && rollCheck <= 66 ) {
        successMessage = "<span class='fail'> Greater Critical Fail!</span> <p>";
    } else if (success && critical) {
        successMessage = "<span class='success'>Critical Success!</span> <p>";
    } else if (!success && critical) {
        successMessage = "<span class='fail'>Critical Fail!</span> <p>";
    } else if (success && doubleSuperior) {
        successMessage = "<span class='success'>Superior Success!</span> <p>";
    } else if (!success && !superior) {
        successMessage = "<span class='fail'>Superior Fail!</span> <p>";
    } else if (success && superior) {
        successMessage = "<span class='success'>Greater Success!</span> <p>";
    } else if (!success && !doubleSuperior) {
        successMessage = "<span class='fail'>Greater Fail!</span> <p>";
    } else if (success) {
        successMessage = "<span class='success'>Success!</span> <p>";
    } else if (!success) {
        successMessage = "<span class='fail'>Fail!</span> <p>";
    }

    //Visibility toggler
    let rollVisibility = "";
    if (activeRollTarget === "" || activeRollTarget === "public") {
        rollModeSelection = CONST.DICE_ROLL_MODES.PUBLIC
    } else if (activeRollTarget === "private") {
        rollModeSelection = CONST.DICE_ROLL_MODES.PRIVATE
        rollVisibility = "<p/><h5 style='font-weight: normal; margin: 0;'>Private Roll <i class=\"fas fa-eye-slash\"></i></h5><p/>"
    } else if (activeRollTarget === "blind") {
        rollModeSelection = CONST.DICE_ROLL_MODES.BLIND
        rollVisibility = "<p/><h5 style='font-weight: normal; margin: 0;'>Blind GM Roll <i class=\"fas fa-low-vision\"></i></h5><p/>"
    }

    //Infection (only relevant for psi checks)
    let infectionAddition = "";
    console.log("Aspect Pushes As Per Dialog: " + aspectPushes)
    if (success && doubleSuperior) {
        aspectPushes -= 4
    }
    else if (success && superior) {
        aspectPushes -= 2
    }
    infectionMod = aspectPushes>0 ? aspectBase*aspectPushes : aspectBase;
    if (skillName === "psi" && brewStatus === true && aspectBase) {
        infectionMod += Number(actorData.psiStrain.infection)
        infectionAddition = "<p/><u>Infection raises to:</u><br><strong>" + infectionMod + "</strong>"
    }

    //Chat message constructor
    let label = successMessage + rollVisibility + "Rolled <strong>" + skillName + spec + "</strong> check <br> against <strong>" + modSkillValue + "</strong><p> <h5 style='font-weight: normal; margin: 0;'>" + modAnnounce + woundAnnounce + globalAnnounce + infectionAddition + gunModTitle + gunAnnounce + "</h5>";
    roll.toMessage({
        speaker: ChatMessage.getSpeaker({actor: this.actor}),
        flavor: label,
        rollMode: rollModeSelection
    });

    //Skill check dialog constructor
    async function GetTaskOptions(rollType) {
        const template = "systems/eclipsephase/templates/chat/skill-test-dialog.html";
        const html = await renderTemplate(template, {});

        return new Promise(resolve => {
            const data = {
                title: rollType[0].toUpperCase() + rollType.slice(1) + " Check",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
                        callback: html => resolve(_proTaskCheckOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };

            new Dialog(data, null).render(true);
        });
    }

    //Psi check dialog constructor
    async function GetPsiTaskOptions(rollType) {
        const template = "systems/eclipsephase/templates/chat/psi-test-dialog.html";
        const html = await renderTemplate(template, {});

        return new Promise(resolve => {
            const data = {
                title: "Psi Check",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
                        callback: html => resolve(_proPsiTaskCheckOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };

            new Dialog(data, null).render(true);
        });
    }

    //Guns check dialog constructor
    async function GetGunsTaskOptions(rollType) {
        const template = "systems/eclipsephase/templates/chat/gun-test-dialog.html";
        const html = await renderTemplate(template, {});

        return new Promise(resolve => {
            const data = {
                title: "Guns Check",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
                        callback: html => resolve(_proGunsTaskCheckOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };

            new Dialog(data, null).render(true);
        });
    }

    //Psi check results
    function _proPsiTaskCheckOptions(form) {
        return {
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            aspects: parseInt(form.AspectNumber.value),
            pushes: parseInt(form.PushesNumber.value)*2,
            activeRollMode: form.RollMode.value
        }

    }

    //Guns skill check results
    function _proGunsTaskCheckOptions(form) {
        return {
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            activeRollMode: form.RollMode.value,
            aim: form.Aim.value,
            size: form.Size.value,
            range: form.Range.value,
            coverDefender: form.TargetCover.value,
            coverAttacker: form.AttackerCover.checked,
            visualImpairment: form.VisualImpair.value,
            prone: form.DefenderProne.checked,
            firingMode: form.FiringMode.value,
            smartlink: form.Smartlink.checked,
            running: form.Running.checked,
            superiorPosition: form.SupPosition.checked,
            calledShot: form.CalledShot.checked,
            inMelee: form.Melee.checked
        }

    }

    //General skill check results
    function _proTaskCheckOptions(form) {
        return {
            globalMod: form.GlobalMod.value ? parseInt(form.GlobalMod.value) : 0,
            activeRollMode: form.RollMode.value
        }

    }
}

//Weapon damage rolls
export async function DamageRoll({
        weaponName = "",
        weaponDamage = "",
        successType = "normal",
        critical = false,
        actorData ="",
        askForOptions = false,
        optionsSettings = null
    } = {}) {

    if (askForOptions != optionsSettings) {
        let checkOptions = await GetDamageRollOptions(weaponName);

        if (checkOptions.cancelled) {
            return;
        }

        successType = checkOptions.successType;
        critical = checkOptions.critical;
    }

    let criticalModifier = critical ? "2 *(" : "(";
    let successModifier = ")";
    if (successType === "greater") {
        successModifier = "+ 1d6)"
    }
    else if (successType === "superior") {
        successModifier = "+ 2d6)"
    }

    let intermediateRollFormula = weaponDamage + successModifier;
    let rollFormula = criticalModifier + (intermediateRollFormula);
    let roll = new Roll(rollFormula).roll();
    let rollCheck = roll.total;
    console.log(successType)
    console.log(critical)

    console.log(rollCheck)
        let label = "Rolls damage with <br> <strong>" + weaponName + "</strong>";
        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
        });

    async function GetDamageRollOptions(weaponName) {
        const template = "systems/eclipsephase/templates/chat/damage-roll-dialog.html";
        const html = await renderTemplate(template, {});

        return new Promise(resolve => {
            const data = {
                title: weaponName[0].toUpperCase() + weaponName.slice(1) + " Damage Roll",
                content: html,
                buttons: {
                    cancel: {
                        label: "Cancel",
                        callback: html => resolve ({cancelled: true})
                    },
                    normal: {
                        label: "Roll!",
                        callback: html => resolve(_proDamageRollOptions(html[0].querySelector("form")))
                    }
                },
                default: "normal",
                close: () => resolve ({cancelled: true})
            };

            new Dialog(data, null).render(true);
        });
    }

    function _proDamageRollOptions(form) {
        return {
            successType: form.successType.value,
            critical: form.critical.checked
        }

    }
}


