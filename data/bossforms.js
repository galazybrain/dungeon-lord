/**
 * Boss Forms unlocked through /ascend (prestige).
 * Each ascension resets souls + upgrades + minions
 * but grants a permanent passive multiplier and a Boss Form title.
 *
 * soulMultiplier: multiplies total souls/min permanently (stacks additively)
 * e.g. ascension 1 = +50%, ascension 2 = +100% → total +150% at tier 2
 */

const BOSS_FORMS = [
  {
    ascension:       0,
    name:            'Dungeon Apprentice',
    emoji:           '🕳️',
    title:           'Apprentice',
    description:     'You are just beginning your dark journey.',
    soulMultiplier:  0,       // no bonus yet
    raidCostDiscount: 0,
    extraMinionSlot: false,
    passiveBloodMult: 1.0,
    prestigeThreshold: null,  // cannot ascend yet (no level 10 reached)
  },
  {
    ascension:       1,
    name:            'Lich',
    emoji:           '💀',
    title:           'the Lich',
    description:     'Death itself bends to your command.',
    soulMultiplier:  0.50,    // +50% souls/min globally, permanently
    raidCostDiscount: 0,
    extraMinionSlot: false,
    passiveBloodMult: 1.0,
    prestigeThreshold: 100000, // lifetime souls required to ascend
  },
  {
    ascension:       2,
    name:            'Demon',
    emoji:           '😈',
    title:           'the Ultimate Demon',
    description:     'Hell itself acknowledges your dominion.',
    soulMultiplier:  1.00,    // +100% (total +150% across both)
    raidCostDiscount: 0.25,   // raids cost 25% fewer souls
    extraMinionSlot: false,
    passiveBloodMult: 1.0,
    prestigeThreshold: 500000,
  },
  {
    ascension:       3,
    name:            'Shadow Titan',
    emoji:           '🌑',
    title:           'the Shadow Titan',
    description:     'You blot out the sun. The surface world trembles.',
    soulMultiplier:  2.00,    // +200%
    raidCostDiscount: 0.25,
    extraMinionSlot: true,    // unlocks an extra upgrade slot
    passiveBloodMult: 1.0,
    prestigeThreshold: 2000000,
  },
  {
    ascension:       4,
    name:            'Void Emperor',
    emoji:           '♾️',
    title:           'the Void Emperor',
    description:     'You have transcended death, life, and reason.',
    soulMultiplier:  4.00,    // +400%
    raidCostDiscount: 0.25,
    extraMinionSlot: true,
    passiveBloodMult: 2.0,    // passive blood gen doubled
    prestigeThreshold: 10000000,
  },
  {
    ascension:       5,
    name:            'Eternal Darkness',
    emoji:           '🌌',
    title:           'of Eternal Darkness',
    description:     'The universe ends where your dungeon begins.',
    soulMultiplier:  8.00,    // +800%
    raidCostDiscount: 0.50,
    extraMinionSlot: true,
    passiveBloodMult: 4.0,
    prestigeThreshold: 50000000,
  },
];

/**
 * Get boss form data for a given ascension level.
 */
function getBossForm(ascension) {
  return BOSS_FORMS[Math.min(ascension, BOSS_FORMS.length - 1)];
}

/**
 * Get the total soul multiplier bonus from all ascensions combined.
 * e.g. ascension 2 → 0.50 + 1.00 = 1.50 → souls/min * 2.5
 */
function getTotalSoulMultiplier(ascension) {
  let total = 0;
  for (let i = 1; i <= ascension; i++) {
    total += BOSS_FORMS[i]?.soulMultiplier || 0;
  }
  return 1 + total;
}

/**
 * Get the prestige threshold for the next ascension.
 */
function getNextPrestigeThreshold(currentAscension) {
  const next = BOSS_FORMS[currentAscension + 1];
  return next ? next.prestigeThreshold : null;
}

// Available boss form skins (cosmetic only, purchased with blood)
const BOSS_FORM_SKINS = {
  lich_bone:     { id: 'lich_bone',     name: 'Bone Lich',       emoji: '🦴', requiredAscension: 1, bloodCost: 100 },
  lich_frost:    { id: 'lich_frost',    name: 'Frost Lich',      emoji: '❄️', requiredAscension: 1, bloodCost: 100 },
  demon_fire:    { id: 'demon_fire',    name: 'Inferno Prince',  emoji: '🔥', requiredAscension: 2, bloodCost: 150 },
  demon_plague:  { id: 'demon_plague',  name: 'Plague Prince',   emoji: '🧪', requiredAscension: 2, bloodCost: 150 },
  titan_void:    { id: 'titan_void',    name: 'Void Titan',      emoji: '🕳️', requiredAscension: 3, bloodCost: 200 },
  emperor_storm: { id: 'emperor_storm', name: 'Storm Emperor',   emoji: '⚡', requiredAscension: 4, bloodCost: 300 },
};

module.exports = {
  BOSS_FORMS,
  BOSS_FORM_SKINS,
  getBossForm,
  getTotalSoulMultiplier,
  getNextPrestigeThreshold,
};