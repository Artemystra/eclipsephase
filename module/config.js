export const eclipsephase = {};

eclipsephase.traitTypes = {
    trait: "ep2e.item.traits.traitLabel",
    flaw: "ep2e.item.traits.flawLabel"
}

eclipsephase.firingModes = {
    ss: "ep2e.item.weapon.table.firingMode.ss",
    sa: "ep2e.item.weapon.table.firingMode.sa",
    saBF: "ep2e.item.weapon.table.firingMode.saBF",
    bfFA: "ep2e.item.weapon.table.firingMode.bfFA",
    saBFfa: "ep2e.item.weapon.table.firingMode.saBFfa"
}

eclipsephase.weaponTypes = {
    integrated: "ep2e.item.weapon.table.slot.integrated",
    sidearm: "ep2e.item.weapon.table.slot.sidearm",
    oneHanded: "ep2e.item.weapon.table.slot.oneHanded",
    twoHanded: "ep2e.item.weapon.table.slot.twoHanded",
    bulky: "ep2e.item.weapon.table.slot.bulky"
}

eclipsephase.gearTypes = {
    digital: "ep2e.item.general.table.slot.digital",
    consumable: "ep2e.item.general.table.slot.consumable",
    accessory: "ep2e.item.general.table.slot.accessory",
    bulky: "ep2e.item.general.table.slot.bulky",
    notMobile: "ep2e.item.general.table.slot.notMobile"
}

eclipsephase.moveTypes = {
    none: "ep2e.morph.currentMorph.movementTypes.none",
    boat: "ep2e.morph.currentMorph.movementTypes.boat",
    brachiate: "ep2e.morph.currentMorph.movementTypes.brachiate",
    glider: "ep2e.morph.currentMorph.movementTypes.glider",
    hopper: "ep2e.morph.currentMorph.movementTypes.hopper",
    hover: "ep2e.morph.currentMorph.movementTypes.hover",
    ionic: "ep2e.morph.currentMorph.movementTypes.ionic",
    'magnetic generator': "ep2e.morph.currentMorph.movementTypes.magneticgenerator",
    microlight: "ep2e.morph.currentMorph.movementTypes.microlight",
    ooze: "ep2e.morph.currentMorph.movementTypes.ooze",
    'plasma sail': "ep2e.morph.currentMorph.movementTypes.plasmasail",
    roller: "ep2e.morph.currentMorph.movementTypes.roller",
    rotor: "ep2e.morph.currentMorph.movementTypes.rotor",
    snake: "ep2e.morph.currentMorph.movementTypes.snake",
    submarine: "ep2e.morph.currentMorph.movementTypes.submarine",
    swimmer: "ep2e.morph.currentMorph.movementTypes.swimmer",
    'thrust vector': "ep2e.morph.currentMorph.movementTypes.thrustvector",
    tracked: "ep2e.morph.currentMorph.movementTypes.tracked",
    walker: "ep2e.morph.currentMorph.movementTypes.walker",
    wheeled: "ep2e.morph.currentMorph.movementTypes.wheeled",
    winged: "ep2e.morph.currentMorph.movementTypes.winged"
}
eclipsephase.armorTypes = {
    main: "ep2e.item.armor.table.type.main",
    additional: "ep2e.item.armor.table.type.additional"
}

eclipsephase.wareTypes = {
    b: "ep2e.item.ware.table.type.b",
    bc: "ep2e.item.ware.table.type.bc",
    bch: "ep2e.item.ware.table.type.bch",
    bh: "ep2e.item.ware.table.type.bh",
    bhm: "ep2e.item.ware.table.type.bhm",
    bn: "ep2e.item.ware.table.type.bn",
    bm: "ep2e.item.ware.table.type.bm",
    c: "ep2e.item.ware.table.type.c",
    ch: "ep2e.item.ware.table.type.ch",
    chn: "ep2e.item.ware.table.type.chn",
    chm: "ep2e.item.ware.table.type.chm",
    h: "ep2e.item.ware.table.type.h",
    hm: "ep2e.item.ware.table.type.hm",
    hn: "ep2e.item.ware.table.type.hn",
    hmn: "ep2e.item.ware.table.type.hmn",
    n: "ep2e.item.ware.table.type.n",
    nh: "ep2e.item.ware.table.type.nh",
    m: "ep2e.item.ware.table.type.m",
    mn: "ep2e.item.ware.table.type.mn"
}

eclipsephase.costTypes = {
    minor: "ep2e.item.general.table.cost.minor",
    moderate: "ep2e.item.general.table.cost.moderate",
    major: "ep2e.item.general.table.cost.major",
    rare: "ep2e.item.general.table.cost.rare"
}

// Shop Item Valuation dropdown values - costTypes plus a shop-only "Free" tier with no RAW
// equivalent as an item's own cost. Not favorTiers' "trivial" - that's a differently-scoped
// tier used by the shop's separate Difficulty Mapping step, not this one.
eclipsephase.effectiveCostTiers = {
    free: "ep2e.shop.settings.costTierFree",
    minor: "ep2e.item.general.table.cost.minor",
    moderate: "ep2e.item.general.table.cost.moderate",
    major: "ep2e.item.general.table.cost.major",
    rare: "ep2e.item.general.table.cost.rare"
}

// Same 7 networks as Item.id.rep in template.json - reused as-is for the Shop's acceptedRepNetworks toggles.
eclipsephase.repTypes = {
    "@-rep": "ep2e.id.repType.@rep",
    "c-rep": "ep2e.id.repType.crep",
    "f-rep": "ep2e.id.repType.frep",
    "g-rep": "ep2e.id.repType.grep",
    "i-rep": "ep2e.id.repType.irep",
    "r-rep": "ep2e.id.repType.rrep",
    "x-rep": "ep2e.id.repType.xrep"
}

eclipsephase.repIcons = {
    "@-rep": "systems/eclipsephase/resources/icons/Currency/currency-at.svg",
    "c-rep": "systems/eclipsephase/resources/icons/Currency/currency-c.svg",
    "f-rep": "systems/eclipsephase/resources/icons/Currency/currency-f.svg",
    "g-rep": "systems/eclipsephase/resources/icons/Currency/currency-g.svg",
    "i-rep": "systems/eclipsephase/resources/icons/Currency/currency-i.svg",
    "r-rep": "systems/eclipsephase/resources/icons/Currency/currency-r.svg",
    "x-rep": "systems/eclipsephase/resources/icons/Currency/currency-x.svg"
}

// Same RAW favor tiers as the Rep-Test roll dialog's favorMod dropdown (general-modifiers.html) -
// reused here for the Shop's Difficulty Mapping table.
eclipsephase.favorTiers = {
    trivial: "ep2e.roll.dialog.reputationMode.trivial",
    minor: "ep2e.roll.dialog.reputationMode.minor",
    moderate: "ep2e.roll.dialog.reputationMode.moderate",
    major: "ep2e.roll.dialog.reputationMode.major"
}

eclipsephase.programLevels = {
    intruder: "ep2e.item.program.table.level.intruder",
    user: "ep2e.item.program.table.level.user",
    admin: "ep2e.item.program.table.level.admin",
    owner: "ep2e.item.program.table.level.owner"
}

eclipsephase.psiTypes = {
    gamma: "ep2e.item.aspect.table.type.gamma",
    chi: "ep2e.item.aspect.table.type.chi",
    epsilon: "ep2e.item.aspect.table.type.epsilon"
}

eclipsephase.strainFamilies = {
    psi: "ep2e.item.aspect.table.family.psi",
    ki: "ep2e.item.aspect.table.family.ki"
}

eclipsephase.actionTypes = {
    quick: "ep2e.item.aspect.table.action.quick",
    task: "ep2e.item.aspect.table.action.task",
    complex: "ep2e.item.aspect.table.action.complex"
}

eclipsephase.duration = {
    instant: "ep2e.item.aspect.table.duration.instant",
    action: "ep2e.item.aspect.table.duration.action",
    minutes: "ep2e.item.aspect.table.duration.minutes",
    hours: "ep2e.item.aspect.table.duration.hours",
    sustained: "ep2e.item.aspect.table.duration.sustained"
}

eclipsephase.damageTargets = {
    physical: "ep2e.item.aspect.table.damage.physical",
    mental: "ep2e.item.aspect.table.damage.mental"
}

eclipsephase.aptitudes = {
    cog: "ep2e.actorSheet.aptitudes.cog",
    int: "ep2e.actorSheet.aptitudes.int",
    ref: "ep2e.actorSheet.aptitudes.ref",
    sav: "ep2e.actorSheet.aptitudes.sav",
    som: "ep2e.actorSheet.aptitudes.som",
    wil: "ep2e.actorSheet.aptitudes.wil",
    soft: "ep2e.actorSheet.aptitudes.soft"
}

eclipsephase.knowAptitudes = {
    cog: "ep2e.actorSheet.aptitudes.cog",
    int: "ep2e.actorSheet.aptitudes.int",
    soft: "ep2e.actorSheet.aptitudes.soft"
}

eclipsephase.vehicleSize = {
    vs: "ep2e.item.vehicle.table.size.vs",
    s: "ep2e.item.vehicle.table.size.s",
    m: "ep2e.item.vehicle.table.size.m",
    l: "ep2e.item.vehicle.table.size.l",
    vl: "ep2e.item.vehicle.table.size.vl"
}

eclipsephase.vehicleType = {
    robot: "ep2e.item.vehicle.table.type.robot",
    vehicle: "ep2e.item.vehicle.table.type.vehicle",
    animal: "ep2e.item.vehicle.table.type.animal"
}

eclipsephase.vehicleHabitat = {
    none: "ep2e.item.vehicle.table.habitat.none",
    ground: "ep2e.item.vehicle.table.habitat.ground",
    air: "ep2e.item.vehicle.table.habitat.air",
    space: "ep2e.item.vehicle.table.habitat.space",
    nautical: "ep2e.item.vehicle.table.habitat.nautical"
}

eclipsephase.bodyTypes = {
    bio: "ep2e.morph.currentMorph.morphType.bio",
    synth: "ep2e.morph.currentMorph.morphType.synth",
    info: "ep2e.morph.currentMorph.morphType.info"
}

eclipsephase.drugTypes = {
    biochem: "Biochem",
    nano: "Nano",
    electronic: "Electronic"
}

eclipsephase.drugAddicitonTypes = {
    none: "Select",
    physical: "Physical",
    mental: "Mental"
}

eclipsephase.drugCategories = {
    cognitive: "ep2e.item.drug.table.category.cognitive",
    combat: "ep2e.item.drug.table.category.combat",
    health: "ep2e.item.drug.table.category.health",
    nano: "ep2e.item.drug.table.category.nano",
    narco: "ep2e.item.drug.table.category.narco",
    petals: "ep2e.item.drug.table.category.petals",
    psi: "ep2e.item.drug.table.category.psi",
    rec: "ep2e.item.drug.table.category.rec",
    social: "ep2e.item.drug.table.category.social",
    toxins: "ep2e.item.drug.table.category.toxins",
    nanotox: "ep2e.item.drug.table.category.nanotox"
}

eclipsephase.grenadeArmorVector = {
    none: "ep2e.item.weapon.table.armorUsed.none",
    kinetic: "ep2e.item.weapon.table.armorUsed.kinetic",
    energy: "ep2e.item.weapon.table.armorUsed.energy"
}

eclipsephase.rangedAmmoType = {
    beam: "ep2e.item.weapon.table.ammoUsed.beam",
    kinetic: "ep2e.item.weapon.table.ammoUsed.kinetic",
    seeker: "ep2e.item.weapon.table.ammoUsed.seeker",
    spray: "ep2e.item.weapon.table.ammoUsed.spray",
    rail: "ep2e.item.weapon.table.ammoUsed.rail"
}

eclipsephase.trippleSkillModifiers = {
    10: "+ 10",
    20: "+ 20",
    30: "+ 30"
}

eclipsephase.genders = {
    cis: "ep2e.ego.general.gender.cis",
    trans: "ep2e.ego.general.gender.trans",
    nonBi: "ep2e.ego.general.gender.nonBi",
    fluid: "ep2e.ego.general.gender.fluid",
    aGen: "ep2e.ego.general.gender.aGen",
    biGen: "ep2e.ego.general.gender.biGen",
    polGen: "ep2e.ego.general.gender.polGen",
    neu: "ep2e.ego.general.gender.neu",
    genAp: "ep2e.ego.general.gender.genAp",
    inter: "ep2e.ego.general.gender.inter",
    demi: "ep2e.ego.general.gender.demi",
    grey: "ep2e.ego.general.gender.grey",
    apora: "ep2e.ego.general.gender.apora",
    mav: "ep2e.ego.general.gender.mav",
    novi: "ep2e.ego.general.gender.novi"
}

eclipsephase.sexes = {
    male: "ep2e.ego.general.sex.male",
    female: "ep2e.ego.general.sex.female",
    inter: "ep2e.ego.general.sex.inter",
    dyadic: "ep2e.ego.general.sex.dyadic"
}

eclipsephase.origins = {
    anarchist: "ep2e.ego.general.origin.anarchist",
    argonaut: "ep2e.ego.general.origin.argonaut",
    barsoomian: "ep2e.ego.general.origin.barsoomian",
    brinker: "ep2e.ego.general.origin.brinker",
    criminal: "ep2e.ego.general.origin.criminal",
    extropian: "ep2e.ego.general.origin.extropian",
    hypercorps: "ep2e.ego.general.origin.hypercorps",
    jovian: "ep2e.ego.general.origin.jovian",
    lunar: "ep2e.ego.general.origin.lunar",
    mercurial: "ep2e.ego.general.origin.mercurial",
    reclaimer: "ep2e.ego.general.origin.reclaimer",
    scum: "ep2e.ego.general.origin.scum",
    socialite: "ep2e.ego.general.origin.socialite",
    titanian: "ep2e.ego.general.origin.titanian",
    venusian: "ep2e.ego.general.origin.venusian",
    regional: "ep2e.ego.general.origin.regional"
}

//Languages listed in the core rulebook (Step 7: Skills) and the Character Options Random
//Language table (3.0), used as suggestions for the Languages multi-select on the Identity tab.
//Players may still type in any other language.
eclipsephase.languages = {
    arabic: "ep2e.ego.general.language.arabic",
    bengali: "ep2e.ego.general.language.bengali",
    cantonese: "ep2e.ego.general.language.cantonese",
    dutch: "ep2e.ego.general.language.dutch",
    english: "ep2e.ego.general.language.english",
    farsi: "ep2e.ego.general.language.farsi",
    french: "ep2e.ego.general.language.french",
    german: "ep2e.ego.general.language.german",
    hindi: "ep2e.ego.general.language.hindi",
    italian: "ep2e.ego.general.language.italian",
    japanese: "ep2e.ego.general.language.japanese",
    javanese: "ep2e.ego.general.language.javanese",
    korean: "ep2e.ego.general.language.korean",
    mandarin: "ep2e.ego.general.language.mandarin",
    polish: "ep2e.ego.general.language.polish",
    portuguese: "ep2e.ego.general.language.portuguese",
    punjabi: "ep2e.ego.general.language.punjabi",
    russian: "ep2e.ego.general.language.russian",
    skandinaviska: "ep2e.ego.general.language.skandinaviska",
    spanish: "ep2e.ego.general.language.spanish",
    swedish: "ep2e.ego.general.language.swedish",
    tamil: "ep2e.ego.general.language.tamil",
    turkish: "ep2e.ego.general.language.turkish",
    urdu: "ep2e.ego.general.language.urdu",
    vietnamese: "ep2e.ego.general.language.vietnamese",
    wu: "ep2e.ego.general.language.wu"
}

eclipsephase.damageRatingMultiplier = {
  synth: 2.0,
  bio: 1.5,
  info: 2.0
}

eclipsephase.morphNames = [
  "morph1", "morph2", "morph3", "morph4", "morph5", "morph6"
]
//Psi Influence Dropdowns

eclipsephase.strains = {
    none: "ep2e.psi.strain.none",
    architect: "ep2e.psi.strain.architect",
    beast: "ep2e.psi.strain.beast",
    haunter: "ep2e.psi.strain.haunter",
    stranger: "ep2e.psi.strain.stranger",
    xenomorph: "ep2e.psi.strain.xenomorph",
    custom: "ep2e.psi.strain.custom"
}

eclipsephase.architectEnhanced = {
    none: "ep2e.psi.strain.none",
    arrogance: "ep2e.psi.effect.enhancedBehaviour.arrogance",
    curiosity: "ep2e.psi.effect.enhancedBehaviour.curiosity",
    callouseness: "ep2e.psi.effect.enhancedBehaviour.callouseness",
    ruthlessness: "ep2e.psi.effect.enhancedBehaviour.ruthlessness"
}

eclipsephase.architectMotivation = {
    none: "ep2e.psi.strain.none",
    hoard: "ep2e.psi.effect.motivation.hoard",
    innerWorkings: "ep2e.psi.effect.motivation.innerWorkings",
    create: "ep2e.psi.effect.motivation.create",
    advancedTech: "ep2e.psi.effect.motivation.advancedTech",
    discardTies: "ep2e.psi.effect.motivation.discardTies",
    discoverUnknown: "ep2e.psi.effect.motivation.discoverUnknown",
    repurpose: "ep2e.psi.effect.motivation.repurpose",
    uncoverSecrets: "ep2e.psi.effect.motivation.uncoverSecrets"
}

eclipsephase.beastEnhanced = {
    none: "ep2e.psi.strain.none",
    aggression: "ep2e.psi.effect.enhancedBehaviour.aggression",
    arousal: "ep2e.psi.effect.enhancedBehaviour.arousal",
    gluttony: "ep2e.psi.effect.enhancedBehaviour.gluttony",
    riskTaking: "ep2e.psi.effect.enhancedBehaviour.riskTaking"
}

eclipsephase.beastRestricted = {
    none: "ep2e.psi.strain.none",
    remorse: "ep2e.psi.effect.restrictedBehaviour.remorse",
    empathy: "ep2e.psi.effect.restrictedBehaviour.empathy"
}

eclipsephase.beastMotivation = {
    none: "ep2e.psi.strain.none",
    domination: "ep2e.psi.effect.motivation.domination",
    noQuarter: "ep2e.psi.effect.motivation.noQuarter",
    cannibalism: "ep2e.psi.effect.motivation.cannibalism",
    claimTerritory: "ep2e.psi.effect.motivation.claimTerritory",
    eradicate: "ep2e.psi.effect.motivation.eradicate",
    instillFear: "ep2e.psi.effect.motivation.instillFear",
    stalkPrey: "ep2e.psi.effect.motivation.stalkPrey"
}

eclipsephase.haunterEnhanced = {
    none: "ep2e.psi.strain.none",
    avoidance: "ep2e.psi.effect.enhancedBehaviour.avoidance",
    mistrust: "ep2e.psi.effect.enhancedBehaviour.mistrust",
    denial: "ep2e.psi.effect.enhancedBehaviour.denial",
    nihilism: "ep2e.psi.effect.enhancedBehaviour.nihilism",
    unsettlingMannerisms: "ep2e.psi.effect.enhancedBehaviour.unsettlingMannerisms"
}

eclipsephase.haunterMotivation = {
    none: "ep2e.psi.strain.none",
    cutTies: "ep2e.psi.effect.motivation.cutTies",
    isolation: "ep2e.psi.effect.motivation.isolation",
    crushHope: "ep2e.psi.effect.motivation.crushHope",
    hiddenTruths: "ep2e.psi.effect.motivation.hiddenTruths",
    releaseFromMisery: "ep2e.psi.effect.motivation.releaseFromMisery",
    shakeConfidence: "ep2e.psi.effect.motivation.shakeConfidence"
}

eclipsephase.strangerEnhanced = {
    none: "ep2e.psi.strain.none",
    deceit: "ep2e.psi.effect.enhancedBehaviour.deceit",
    selfSabotage: "ep2e.psi.effect.enhancedBehaviour.selfSabotage",
    cruelty: "ep2e.psi.effect.enhancedBehaviour.cruelty",
    spite: "ep2e.psi.effect.enhancedBehaviour.spite"
}

eclipsephase.strangerRestricted = {
    none: "ep2e.psi.strain.none",
    remorse: "ep2e.psi.effect.restrictedBehaviour.remorse",
    empathy: "ep2e.psi.effect.restrictedBehaviour.empathy",
    takeResponsibility: "ep2e.psi.effect.restrictedBehaviour.takeResponsibility"
}

eclipsephase.strangerMotivation = {
    none: "ep2e.psi.strain.none",
    follPlans: "ep2e.psi.effect.motivation.follPlans",
    manipulation: "ep2e.psi.effect.motivation.manipulation",
    testLimits: "ep2e.psi.effect.motivation.testLimits",
    betrayal: "ep2e.psi.effect.motivation.betrayal",
    covertOpponent: "ep2e.psi.effect.motivation.covertOpponent",
    grandScheme: "ep2e.psi.effect.motivation.grandScheme",
    mislead: "ep2e.psi.effect.motivation.mislead",
    twistTruth: "ep2e.psi.effect.motivation.twistTruth"
}

eclipsephase.xenomorphEnhanced = {
    none: "ep2e.psi.strain.none",
    nonVerbalCommunication: "ep2e.psi.effect.enhancedBehaviour.nonVerbalCommunication",
    cliquishness: "ep2e.psi.effect.enhancedBehaviour.cliquishness",
    arousal: "ep2e.psi.effect.enhancedBehaviour.arousal",
    gluttony: "ep2e.psi.effect.enhancedBehaviour.gluttony",
    grooming: "ep2e.psi.effect.enhancedBehaviour.grooming",
    socialize: "ep2e.psi.effect.enhancedBehaviour.socialize"
}

eclipsephase.xenomorphMotivation = {
    none: "ep2e.psi.strain.none",
    transform: "ep2e.psi.effect.motivation.transform",
    control: "ep2e.psi.effect.motivation.control",
    trueForm: "ep2e.psi.effect.motivation.trueForm",
    eatTheWeak: "ep2e.psi.effect.motivation.eatTheWeak",
    establishColony: "ep2e.psi.effect.motivation.establishColony",
    hibernate: "ep2e.psi.effect.motivation.hibernate",
    molt: "ep2e.psi.effect.motivation.molt",
    playWithPrey: "ep2e.psi.effect.motivation.playWithPrey",
    protectTribe: "ep2e.psi.effect.motivation.protectTribe"
}

eclipsephase.psiCustomLabels = {
    none: "ep2e.psi.strain.none",
    enhancedBehaviour: "ep2e.psi.effect.enhancedBehaviour.label",
    restrictedBehaviour: "ep2e.psi.effect.restrictedBehaviour.label",
    motivation: "ep2e.psi.effect.motivation.label",
    special: "ep2e.psi.effect.other",
}

eclipsephase.psiStrainLabels = {
    none: "ep2e.psi.strain.none",
    enhancedBehaviour: "ep2e.psi.effect.enhancedBehaviour.label",
    restrictedBehaviour: "ep2e.psi.effect.restrictedBehaviour.label"
}

eclipsephase.otherPsiLabels = {
    enhancedBehaviour: "ep2e.psi.effect.enhancedBehaviour.label",
    restricted: "ep2e.psi.effect.restrictedBehaviour.label",
    motivation: "ep2e.psi.effect.motivation.label",
    other: "ep2e.psi.effect.other"
}

//Ki Influence Dropdowns

eclipsephase.kiStrains = {
    none: "ep2e.ki.strain.none",
    crucible: "ep2e.ki.strain.crucible",
    redline: "ep2e.ki.strain.redline",
    signal: "ep2e.ki.strain.signal",
    ruin: "ep2e.ki.strain.ruin",
    colony: "ep2e.ki.strain.colony"
}

eclipsephase.crucibleIntegration = {
    none: "ep2e.ki.strain.none",
    equipment: "ep2e.ki.effect.crucible.integration.equipment",
    armor: "ep2e.ki.effect.crucible.integration.armor",
    weapon: "ep2e.ki.effect.crucible.integration.weapon"
}

eclipsephase.crucibleReconfiguration = {
    none: "ep2e.ki.strain.none",
    forced: "ep2e.ki.effect.crucible.reconfiguration.forced",
    shutdown: "ep2e.ki.effect.crucible.reconfiguration.shutdown",
    rearranged: "ep2e.ki.effect.crucible.reconfiguration.rearranged"
}

eclipsephase.crucibleOvercorrection = {
    none: "ep2e.ki.strain.none",
    plating: "ep2e.ki.effect.crucible.overcorrection.plating",
    sensing: "ep2e.ki.effect.crucible.overcorrection.sensing",
    limbs: "ep2e.ki.effect.crucible.overcorrection.limbs"
}

eclipsephase.redlineGovernor = {
    none: "ep2e.ki.strain.none",
    limited: "ep2e.ki.effect.redline.governor.limited",
    overridden: "ep2e.ki.effect.redline.governor.overridden",
    runaway: "ep2e.ki.effect.redline.governor.runaway"
}

eclipsephase.redlineCompulsion = {
    none: "ep2e.ki.strain.none",
    overdoIt: "ep2e.ki.effect.redline.compulsion.overdoIt",
    testTheLimits: "ep2e.ki.effect.redline.compulsion.testTheLimits",
    redTape: "ep2e.ki.effect.redline.compulsion.redTape"
}

eclipsephase.redlineRerouting = {
    none: "ep2e.ki.strain.none",
    crossCategory: "ep2e.ki.effect.redline.rerouting.crossCategory",
    categorySupport: "ep2e.ki.effect.redline.rerouting.categorySupport",
    broadShift: "ep2e.ki.effect.redline.rerouting.broadShift"
}

eclipsephase.signalCarrier = {
    none: "ep2e.ki.strain.none",
    location: "ep2e.ki.effect.signal.carrier.location",
    meshId: "ep2e.ki.effect.signal.carrier.meshId",
    diagnostics: "ep2e.ki.effect.signal.carrier.diagnostics",
    sensorFeed: "ep2e.ki.effect.signal.carrier.sensorFeed"
}

eclipsephase.signalSaturation = {
    none: "ep2e.ki.strain.none",
    arOverlays: "ep2e.ki.effect.signal.saturation.arOverlays",
    crosstalk: "ep2e.ki.effect.signal.saturation.crosstalk",
    hapticAlerts: "ep2e.ki.effect.signal.saturation.hapticAlerts",
    sensorNoise: "ep2e.ki.effect.signal.saturation.sensorNoise"
}

eclipsephase.signalDependency = {
    none: "ep2e.ki.strain.none",
    meshConnection: "ep2e.ki.effect.signal.dependency.meshConnection",
    positioning: "ep2e.ki.effect.signal.dependency.positioning",
    tacticalNetwork: "ep2e.ki.effect.signal.dependency.tacticalNetwork",
    devicePing: "ep2e.ki.effect.signal.dependency.devicePing"
}

eclipsephase.ruinFatigue = {
    none: "ep2e.ki.strain.none",
    brittleArmor: "ep2e.ki.effect.ruin.fatigue.brittleArmor",
    fatiguedActuators: "ep2e.ki.effect.ruin.fatigue.fatiguedActuators",
    leakingConstruction: "ep2e.ki.effect.ruin.fatigue.leakingConstruction",
    thermalCracks: "ep2e.ki.effect.ruin.fatigue.thermalCracks"
}

eclipsephase.ruinSeized = {
    none: "ep2e.ki.strain.none",
    limb: "ep2e.ki.effect.ruin.seized.limb",
    sense: "ep2e.ki.effect.ruin.seized.sense",
    movement: "ep2e.ki.effect.ruin.seized.movement",
    mounts: "ep2e.ki.effect.ruin.seized.mounts"
}

eclipsephase.ruinIntermittent = {
    none: "ep2e.ki.strain.none",
    wareFailure: "ep2e.ki.effect.ruin.intermittent.wareFailure",
    sensorDecay: "ep2e.ki.effect.ruin.intermittent.sensorDecay",
    powerSag: "ep2e.ki.effect.ruin.intermittent.powerSag"
}

eclipsephase.ruinShedding = {
    none: "ep2e.ki.strain.none",
    armorPlate: "ep2e.ki.effect.ruin.shedding.armorPlate",
    wareComponent: "ep2e.ki.effect.ruin.shedding.wareComponent",
    supply: "ep2e.ki.effect.ruin.shedding.supply"
}

eclipsephase.ruinCollapse = {
    none: "ep2e.ki.strain.none",
    mobility: "ep2e.ki.effect.ruin.collapse.mobility",
    sensory: "ep2e.ki.effect.ruin.collapse.sensory",
    structural: "ep2e.ki.effect.ruin.collapse.structural",
    systemic: "ep2e.ki.effect.ruin.collapse.systemic"
}

eclipsephase.colonyWitnesses = {
    none: "ep2e.ki.strain.none",
    eyes: "ep2e.ki.effect.colony.witnesses.eyes",
    faces: "ep2e.ki.effect.colony.witnesses.faces",
    attention: "ep2e.ki.effect.colony.witnesses.attention",
    recognition: "ep2e.ki.effect.colony.witnesses.recognition"
}

eclipsephase.colonySympathetic = {
    none: "ep2e.ki.strain.none",
    activation: "ep2e.ki.effect.colony.sympathetic.activation",
    inhibition: "ep2e.ki.effect.colony.sympathetic.inhibition",
    mimicry: "ep2e.ki.effect.colony.sympathetic.mimicry",
    feedback: "ep2e.ki.effect.colony.sympathetic.feedback"
}

eclipsephase.colonyBorrowed = {
    none: "ep2e.ki.strain.none",
    eye: "ep2e.ki.effect.colony.borrowed.eye",
    hand: "ep2e.ki.effect.colony.borrowed.hand",
    voice: "ep2e.ki.effect.colony.borrowed.voice",
    organ: "ep2e.ki.effect.colony.borrowed.organ"
}

eclipsephase.colonyGathering = {
    none: "ep2e.ki.strain.none",
    procession: "ep2e.ki.effect.colony.gathering.procession",
    encirclement: "ep2e.ki.effect.colony.gathering.encirclement",
    docking: "ep2e.ki.effect.colony.gathering.docking",
    nest: "ep2e.ki.effect.colony.gathering.nest"
}

eclipsephase.colonyIncarnation = {
    none: "ep2e.ki.strain.none",
    chorus: "ep2e.ki.effect.colony.incarnation.chorus",
    body: "ep2e.ki.effect.colony.incarnation.body",
    nervousSystem: "ep2e.ki.effect.colony.incarnation.nervousSystem",
    effigy: "ep2e.ki.effect.colony.incarnation.effigy"
}

/**
 * Per-result chat output for every Ki sub-strain, keyed by the d6 result. A row with "base" reads
 * the player's stored choice and appends it to that base key, a row with "copy" is fixed text.
 * Result 1 is shared by all sub-strains and handled separately.
 */
eclipsephase.kiInfluence = {
    crucible: {
        2: { label: "ep2e.ki.effect.crucible.integration.label", base: "ep2e.ki.effect.crucible.integration" },
        3: { label: "ep2e.ki.effect.crucible.reconfiguration.label", base: "ep2e.ki.effect.crucible.reconfiguration" },
        4: { label: "ep2e.ki.effect.crucible.overcorrection.label", base: "ep2e.ki.effect.crucible.overcorrection" },
        5: { label: "ep2e.ki.effect.crucible.motivation.label", copy: "ep2e.ki.effect.crucible.motivation.text" },
        6: { label: "ep2e.ki.effect.crucible.revision.label", copy: "ep2e.ki.effect.crucible.revision.text" }
    },
    redline: {
        2: { label: "ep2e.ki.effect.redline.governor.label", base: "ep2e.ki.effect.redline.governor" },
        3: { label: "ep2e.ki.effect.redline.compulsion.label", base: "ep2e.ki.effect.redline.compulsion" },
        4: { label: "ep2e.ki.effect.redline.experimental.label", copy: "ep2e.ki.effect.redline.experimental.text" },
        5: { label: "ep2e.ki.effect.redline.rerouting.label", base: "ep2e.ki.effect.redline.rerouting" },
        6: { label: "ep2e.ki.effect.redline.overclock.label", copy: "ep2e.ki.effect.redline.overclock.text" }
    },
    signal: {
        2: { label: "ep2e.ki.effect.signal.carrier.label", base: "ep2e.ki.effect.signal.carrier" },
        3: { label: "ep2e.ki.effect.signal.saturation.label", base: "ep2e.ki.effect.signal.saturation" },
        4: { label: "ep2e.ki.effect.signal.interference.label", copy: "ep2e.ki.effect.signal.interference.text" },
        5: { label: "ep2e.ki.effect.signal.dependency.label", base: "ep2e.ki.effect.signal.dependency" },
        6: { label: "ep2e.ki.effect.signal.beacon.label", copy: "ep2e.ki.effect.signal.beacon.text" }
    },
    ruin: {
        2: { label: "ep2e.ki.effect.ruin.fatigue.label", base: "ep2e.ki.effect.ruin.fatigue" },
        3: { label: "ep2e.ki.effect.ruin.seized.label", base: "ep2e.ki.effect.ruin.seized" },
        4: { label: "ep2e.ki.effect.ruin.intermittent.label", base: "ep2e.ki.effect.ruin.intermittent" },
        5: { label: "ep2e.ki.effect.ruin.shedding.label", base: "ep2e.ki.effect.ruin.shedding" },
        6: { label: "ep2e.ki.effect.ruin.collapse.label", base: "ep2e.ki.effect.ruin.collapse" }
    },
    colony: {
        2: { label: "ep2e.ki.effect.colony.witnesses.label", base: "ep2e.ki.effect.colony.witnesses" },
        3: { label: "ep2e.ki.effect.colony.sympathetic.label", base: "ep2e.ki.effect.colony.sympathetic" },
        4: { label: "ep2e.ki.effect.colony.borrowed.label", base: "ep2e.ki.effect.colony.borrowed" },
        5: { label: "ep2e.ki.effect.colony.gathering.label", base: "ep2e.ki.effect.colony.gathering" },
        6: { label: "ep2e.ki.effect.colony.incarnation.label", base: "ep2e.ki.effect.colony.incarnation" }
    }
}
