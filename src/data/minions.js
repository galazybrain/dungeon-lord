/**
 * All minion definitions.
 * 
 * costScaling: price per copy = baseCost * (costScaling ^ owned)
 * soulsPerMin: added flat per copy owned
 * unlockLevel: dungeon level required to purchase
 * currency: 'souls' | 'blood' (post-prestige minions cost blood)
 */

const MINIONS = {
  // ── Tier 1 — Early Game ────────────────────────────────────────────────────
  goblin: {
    id:          'goblin',
    name:        'Goblin Warband',
    emoji:       '👺',
    description: 'Cheap and plentiful. Not very bright.',
    tier:        1,
    baseCost:    50,
    costScaling: 1.15,
    soulsPerMin: 3,
    unlockLevel: 1,
    currency:    'souls',
  },
  orc: {
    id:          'orc',
    name:        'Orc Patrol',
    emoji:       '🪖',
    description: 'Bigger, meaner, slightly smarter than goblins.',
    tier:        1,
    baseCost:    300,
    costScaling: 1.15,
    soulsPerMin: 18,
    unlockLevel: 2,
    currency:    'souls',
  },
  archer: {
    id:          'archer',
    name:        'Cursed Archer',
    emoji:       '🏹',
    description: 'Enchanted arrows that drain the life force of victims.',
    tier:        1,
    baseCost:    800,
    costScaling: 1.15,
    soulsPerMin: 45,
    unlockLevel: 3,
    currency:    'souls',
  },

  // ── Tier 2 — Mid Game ──────────────────────────────────────────────────────
  vampire: {
    id:          'vampire',
    name:        'Vampire Thralls',
    emoji:       '🧛',
    description: 'Bound to your will. They feed, you profit.',
    tier:        2,
    baseCost:    3000,
    costScaling: 1.15,
    soulsPerMin: 120,
    unlockLevel: 5,
    currency:    'souls',
    minAscension: 1, // unlocks at ascension 1 instead of 0
  },
  troll: {
    id:          'troll',
    name:        'Troll Berserker',
    emoji:       '👹',
    description: 'Regenerates. Rampages. Remarkably effective.',
    tier:        2,
    baseCost:    10000,
    costScaling: 1.15,
    soulsPerMin: 400,
    unlockLevel: 8,
    currency:    'souls',
    minAscension: 1,
  },
  colossus: {
    id:          'colossus',
    name:        'Bone Colossus',
    emoji:       '💀',
    description: 'Assembled from the remains of your fallen enemies.',
    tier:        2,
    baseCost:    35000,
    costScaling: 1.15,
    soulsPerMin: 1200,
    unlockLevel: 9,
    currency:    'souls',
    minAscension: 2, // unlocks at ascension 2 instead of 0
  },

  // ── Tier 3 — Late Game ─────────────────────────────────────────────────────
  wraith: {
    id:          'wraith',
    name:        'Shadow Wraith',
    emoji:       '👻',
    description: 'Passes through walls. Through hope. Through sanity.',
    tier:        3,
    baseCost:    120000,
    costScaling: 1.15,
    soulsPerMin: 4000,
    unlockLevel: 11,
    currency:    'souls',
    minAscension: 2,
  },
  demon: {
    id:          'demon',
    name:        'Demon General',
    emoji:       '😈',
    description: 'Commands legions. Answers only to you.',
    tier:        3,
    baseCost:    500000,
    costScaling: 1.15,
    soulsPerMin: 15000,
    unlockLevel: 14,
    currency:    'souls',
    minAscension: 3,
  },
  dragon: {
    id:          'dragon',
    name:        'Elder Dragon',
    emoji:       '🐉',
    description: 'Ancient. Unstoppable. Surprisingly loyal.',
    tier:        3,
    baseCost:    2000000,
    costScaling: 1.15,
    soulsPerMin: 60000,
    unlockLevel: 17,
    currency:    'souls',
    minAscension: 3,
  },

  // ── Tier 4 — Post-Prestige Only ────────────────────────────────────────────
  void_stalker: {
    id:          'void_stalker',
    name:        'Void Stalker',
    emoji:       '🌑',
    description: 'Exists between dimensions. Feeds on reality itself.',
    tier:        4,
    baseCost:    5000000,
    costScaling: 1.18,
    soulsPerMin: 250000,
    unlockLevel: 15,
    currency:    'blood',  // costs blood
    bloodCost:   500,
    minAscension: 4,
  },
  chaos_titan: {
    id:          'chaos_titan',
    name:        'Chaos Titan',
    emoji:       '🔱',
    description: 'The embodiment of destruction. Your masterpiece.',
    tier:        4,
    baseCost:    20000000,
    costScaling: 1.18,
    soulsPerMin: 1000000,
    unlockLevel: 18,
    currency:    'blood',
    bloodCost:   2000,
    minAscension: 5,
  },
};

/**
 * Get the cost to buy the next copy of a minion.
 */
function getMinionCost(minionId, currentOwned) {
  const minion = MINIONS[minionId];
  if (!minion) return null;
  return Math.floor(minion.baseCost * Math.pow(minion.costScaling, currentOwned));
}

/**
 * Get all minions available at a given dungeon level and ascension.
 */
function getAvailableMinions(dungeonLevel, ascension = 0) {
  return Object.values(MINIONS).filter(m => {
    if (m.unlockLevel > dungeonLevel) return false;
    if (m.minAscension && ascension < m.minAscension) return false;
    return true;
  });
}

module.exports = { MINIONS, getMinionCost, getAvailableMinions };