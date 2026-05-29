/**
 * One-time dungeon upgrades.
 * Each can only be purchased once per player per prestige cycle
 * (unless noted as permanent).
 */

const UPGRADES = {
  army_salve: {
  id:          'army_salve',
  name:        'Army Salve',
  emoji:       '💉',
  description: 'Automatically fully heals your defence team when HP drops below 25% (7-day cooldown).',
  cost:        5000,
  currency:    'souls',
  unlockLevel: 1,
  effect:      { autoHeal: true },
  permanent:   false,
},
  soul_furnace: {
    id:          'soul_furnace',
    name:        'Soul Furnace',
    emoji:       '🔥',
    description: 'Burns offerings to amplify your soul harvest.',
    cost:        2000,
    currency:    'souls',
    unlockLevel: 2,
    effect:      { soulsPerMinMultiplier: 0.20 },  // +20% to total souls/min
    permanent:   false,
  },
  dark_ritual: {
    id:          'dark_ritual',
    name:        'Dark Ritual Chamber',
    emoji:       '🕯️',
    description: 'Doubles soul generation during the night (8PM–6AM server time).',
    cost:        8000,
    currency:    'souls',
    unlockLevel: 4,
    effect:      { nightMultiplier: 2.0 },
    permanent:   false,
  },
  war_room: {
    id:          'war_room',
    name:        'War Room',
    emoji:       '🗺️',
    description: 'Strategic planning boosts your raid attack power by 10%.',
    cost:        5000,
    currency:    'souls',
    unlockLevel: 5,
    effect:      { raidAttackBonus: 0.10  },
    permanent:   false,
  },
  bone_walls: {
    id:          'bone_walls',
    name:        'Bone Walls',
    emoji:       '🦴',
    description: 'Reinforced with the remains of failed attackers. +15% raid defense.',
    cost:        3000,
    currency:    'souls',
    unlockLevel: 3,
    effect:      { defenseBonus: 0.15 },
    permanent:   false,
  },
  soul_siphon: {
    id:          'soul_siphon',
    name:        'Soul Siphon',
    emoji:       '🌀',
    description: 'Drains 5% extra souls from successful raids.',
    cost:        20000,
    currency:    'souls',
    unlockLevel: 6,
    effect:      { raidBonusPercent: 0.05 },
    permanent:   false,
  },
  sacrificial_altar: {
    id:          'sacrificial_altar',
    name:        'Sacrificial Altar',
    emoji:       '⛩️',
    description: 'Convert 100 souls into 1 blood. Use /convert to activate.',
    cost:        50000,
    currency:    'souls',
    unlockLevel: 7,
    effect:      { soulsToBloodRatio: 100 },
    permanent:   false,
  },
  nightmare_beacon: {
    id:          'nightmare_beacon',
    name:        'Nightmare Beacon',
    emoji:       '🔦',
    description: 'Passively generates 1 blood per hour.',
    cost:        80000,
    currency:    'souls',
    unlockLevel: 9,
    effect:      { passiveBloodPerHour: 1 },
    permanent:   false,
  },
  // Post-prestige upgrade
  chaos_forge: {
    id:          'chaos_forge',
    name:        'Chaos Forge',
    emoji:       '⚒️',
    description: 'Permanently increases all minion output by 50%.',
    cost:        500000,
    currency:    'souls',
    unlockLevel: 16,
    effect:      { minionMultiplier: 0.50 },
    permanent:   true,   // survives prestige resets
    minAscension: 3,
  },
};

/**
 * Get upgrades available at a given dungeon level and ascension.
 */
function getAvailableUpgrades(dungeonLevel, ascension = 0) {
  return Object.values(UPGRADES).filter(u => {
    if (u.unlockLevel > dungeonLevel) return false;
    if (u.minAscension && ascension < u.minAscension) return false;
    return true;
  });
}

module.exports = { UPGRADES, getAvailableUpgrades };