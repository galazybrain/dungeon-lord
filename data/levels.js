// Level data for dungeon progression
const LEVELS = {
  1: { name: 'Cave', soulsRequired: 0, unlocks: ['Goblin Warband'], emoji: '🕳️' },
  2: { name: 'Crypt', soulsRequired: 500, unlocks: ['Orc Patrol', 'Soul Furnace'], emoji: '⚰️' },
  3: { name: 'Tomb', soulsRequired: 1500, unlocks: ['Cursed Archer', 'Bone Walls'], emoji: '🪦' },
  4: { name: 'Catacombs', soulsRequired: 4000, unlocks: ['Vampire Thralls', 'Dark Ritual', 'Cursed Vault'], emoji: '🕯️' },
  5: { name: 'Necropolis', soulsRequired: 10000, unlocks: ['Troll Berserker', 'War Room'], emoji: '🏛️' },
  6: { name: 'Abyss', soulsRequired: 25000, unlocks: ['Soul Siphon'], emoji: '🌊' },
  7: { name: 'Inferno', soulsRequired: 60000, unlocks: ['Sacrificial Altar'], emoji: '🔥' },
  8: { name: 'Void', soulsRequired: 150000, unlocks: [], emoji: '🌌' },
  9: { name: 'Eternity', soulsRequired: 350000, unlocks: ['Nightmare Beacon'], emoji: '⏳' },
  10: { name: 'Ascension', soulsRequired: 750000, unlocks: [], emoji: '✨' },
};

// Maximum level
const MAX_LEVEL = Object.keys(LEVELS).length;

function getLevelData(level) {
  return LEVELS[level] || LEVELS[MAX_LEVEL];
}

function getEligibleLevel(lifetimeSouls, ascension = 0) {
  // Ascension may affect required souls (e.g., multiply by 2 per ascension) – adjust as needed
  let requiredMultiplier = Math.pow(2, ascension);
  for (let i = MAX_LEVEL; i >= 1; i--) {
    if (lifetimeSouls >= LEVELS[i].soulsRequired * requiredMultiplier) {
      return i;
    }
  }
  return 1;
}

function getNextLevel(currentLevel) {
  if (currentLevel >= MAX_LEVEL) return null;
  return { level: currentLevel + 1, soulsRequired: LEVELS[currentLevel + 1].soulsRequired };
}

module.exports = { getLevelData, getEligibleLevel, getNextLevel, LEVELS, MAX_LEVEL };