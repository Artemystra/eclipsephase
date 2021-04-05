export async function TaskCheck({
    skillName = "",
    specName = "",
    rollType = "",
    skillValue = 0,
    actorData = "",
    globalMod = 0,
    infectionMod = 0,
    rollModeSelection = null,
    activeRollTarget = "",
    spec = false,
    askForOptions = false,
    optionsSettings = null,
    rollFormula = "1d100"
    } = {}) {

    if (askForOptions != optionsSettings && skillName === "psi") {
        let checkOptions = await GetPsiTaskOptions(rollType);

        if (checkOptions.cancelled) {
            return;
        }

        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
        infectionMod = checkOptions.pushes ? checkOptions.aspects*checkOptions.pushes : checkOptions.aspects;
    }

    else if (askForOptions != optionsSettings) {
        let checkOptions = await GetTaskOptions(rollType);

        if (checkOptions.cancelled) {
            return;
        }

        globalMod = checkOptions.globalMod;
        activeRollTarget = checkOptions.activeRollMode;
    }

    spec = specName ? "(" + specName + ")" : "";
    let situationalPlus = globalMod>0 ? "+" : "";
    let woundMod = Number(actorData.mods.woundMod) + Number(actorData.mods.traumaMod);
    let rollMod = Number(globalMod) - woundMod;
    let modAnnounce = rollMod ? "<u>Applied Mods:</u> <br>" : "";
    let woundAnnounce = woundMod ? "Wound/Trauma:<strong> -" + woundMod + "<br>" : "";
    let globalAnnounce = globalMod ? "</strong>Situational:<strong>"+ situationalPlus + globalMod : "";
    let modSkillValue = Number(skillValue) + Number(globalMod);
    let roll = new Roll(rollFormula).roll();
    let rollCheck = roll.total;
    let success = rollCheck <= modSkillValue;
    let critical = rollCheck === 11 || rollCheck === 22 || rollCheck === 33 || rollCheck === 44 || rollCheck === 55 || rollCheck === 66 || rollCheck === 77 || rollCheck === 88;
    let autoSuccess = rollCheck === 100;
    let autofail = rollCheck === 99;
    let doubleSuperior = rollCheck >= 66;
    let superior = rollCheck >= 33;
    let successMessage = "";
    let rollVisibility = "";
    let infectionAddition = "";

    if (skillName === "psi") {
        console.log("Infection Mod Before:" + infectionMod)
        infectionMod += Number(actorData.psiStrain.infection)
        infectionAddition = "<p/>Infection raises to<p/>" + infectionMod
        console.log("Infection Mod After:" + infectionMod)
    }

    if (activeRollTarget === "" || activeRollTarget === "public") {
        rollModeSelection = CONST.DICE_ROLL_MODES.PUBLIC
    } else if (activeRollTarget === "private") {
        rollModeSelection = CONST.DICE_ROLL_MODES.PRIVATE
        rollVisibility = "<p/><h5 style='font-weight: normal; margin: 0;'>Private Roll <i class=\"fas fa-eye-slash\"></i></h5><p/>"
    } else if (activeRollTarget === "blind") {
        rollModeSelection = CONST.DICE_ROLL_MODES.BLIND
        rollVisibility = "<p/><h5 style='font-weight: normal; margin: 0;'>Blind GM Roll <i class=\"fas fa-low-vision\"></i></h5><p/>"
    }

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


    let label = successMessage + rollVisibility + "Rolled <strong>" + skillName + spec + "</strong> check <br> against <strong>" + modSkillValue + "</strong><p> <h5 style='font-weight: normal; margin: 0;'>" + modAnnounce + woundAnnounce + globalAnnounce + infectionAddition + "</strong></h5>";
    roll.toMessage({
        speaker: ChatMessage.getSpeaker({actor: this.actor}),
        flavor: label,
        rollMode: rollModeSelection
    });


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

    function _proPsiTaskCheckOptions(form) {
        return {
            globalMod: parseInt(form.GlobalMod.value),
            aspects: parseInt(form.AspectNumber.value),
            pushes: parseInt(form.PushesNumber.value)*2,
            activeRollMode: form.RollMode.value
        }

    }

    function _proTaskCheckOptions(form) {
        return {
            globalMod: parseInt(form.GlobalMod.value),
            activeRollMode: form.RollMode.value
        }

    }
}


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


