/**
 * Drop Events — random rewards that fire every 5 minutes
 * for players who have collected within the last 2 hours (active players).
 *
 * Events scale with dungeon_level so higher-level players get bigger drops.
 * Uses node-cron (add to package.json: npm install node-cron)
 */

// ── Event Definitions ────────────────────────────────────────────────────────

const DROP_EVENTS = [
  {
    id:       'soul_surge',
    name:     'Soul Surge',
    emoji:    '💀',
    rarity:   'common',
    weight:   45, // out of 100
    message:  (amount) => `A wave of wandering souls floods your dungeon! **+${amount} souls**`,
    reward:   (player) => ({
      souls: Math.floor((10 + Math.random() * 40) * player.dungeon_level),
      blood: 0,
    }),
  },
  {
    id:       'minion_skirmish',
    name:     'Minion Skirmish',
    emoji:    '⚔️',
    rarity:   'common',
    weight:   25,
    message:  (amount) => `Your minions clashed with surface warriors and returned victorious! **+${amount} blood**`,
    reward:   (player) => ({
      souls: 0,
      blood: Math.floor(1 + Math.random() * 3),
    }),
  },
  {
    id:       'cursed_relic',
    name:     'Cursed Relic',
    emoji:    '🔮',
    rarity:   'rare',
    weight:   15,
    message:  () => `A cursed relic was unearthed in your dungeon! **+5% permanent soul generation**`,
    reward:   (player) => ({
      souls:        0,
      blood:        0,
      soulsPerMinBonus: 0.05, // permanent stacking bonus, stored in DB
    }),
  },
  {
    id:       'dark_patron',
    name:     'Dark Patron',
    emoji:    '😈',
    rarity:   'epic',
    weight:   10,
    message:  (amount) => `A powerful entity has taken interest in your dungeon and bestows gifts! **+${amount} souls**`,
    reward:   (player) => ({
      souls: Math.floor(500 * player.dungeon_level * (1 + player.ascension * 0.5)),
      blood: Math.floor(5 * (1 + player.ascension)),
    }),
  },
  {
    id:       'void_rift',
    name:     'Void Rift',
    emoji:    '🌑',
    rarity:   'legendary',
    weight:   5,
    message:  () => `A void rift tears open above your dungeon! **2x soul generation for 30 minutes!**`,
    reward:   (player) => ({
      souls:          0,
      blood:          0,
      tempMultiplier: 2.0,
      tempDuration:   30, // minutes
    }),
  },
];

// ── Weighted Random Pick ─────────────────────────────────────────────────────

/**
 * Pick a random event using weighted probabilities.
 */
function pickDropEvent() {
  const totalWeight = DROP_EVENTS.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const event of DROP_EVENTS) {
    roll -= event.weight;
    if (roll <= 0) return event;
  }

  return DROP_EVENTS[0]; // fallback
}

// ── Rarity Colors (for Discord embeds) ───────────────────────────────────────

const RARITY_COLORS = {
  common:    0x888888,
  rare:      0x4488ff,
  epic:      0xaa44ff,
  legendary: 0xffaa00,
};

// ── Starting Reward ──────────────────────────────────────────────────────────

const STARTING_REWARD = {
  souls: 100,
  blood: 0,
  message: [
    '⚔️ **Welcome, Dungeon Lord.**',
    'Your domain is but a dirt cave for now — but darkness grows.',
    'Here are **100 souls** to begin your conquest.',
    '',
    '> Use `/shop` to buy your first minions.',
    '> Use `/collect` to gather souls over time.',
    '> Use `/dungeon` to check your status.',
  ].join('\n'),
};

