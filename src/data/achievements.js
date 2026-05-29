/**
 * Achievement definitions.
 * Checked after each player action (collect, raid, buy, ascend).
 *
 * condition: function(player, stats) → boolean
 *   stats is an object of action-specific counters passed at check time
 * reward: souls and/or blood granted on first unlock
 */

const ACHIEVEMENTS = {
  // ── Collection ─────────────────────────────────────────────────────────────
  first_collect: {
    id:          'first_collect',
    name:        'First Harvest',
    emoji:       '💀',
    description: 'Collect souls for the first time.',
    reward:      { souls: 50, blood: 0 },
    condition:   (player) => true, // triggered manually after first collect
  },
  soul_hoarder: {
    id:          'soul_hoarder',
    name:        'Soul Hoarder',
    emoji:       '💰',
    description: 'Hold 10,000 souls at once.',
    reward:      { souls: 500, blood: 0 },
    condition:   (player) => player.souls >= 10000,
  },
  soul_millionaire: {
    id:          'soul_millionaire',
    name:        'Soul Millionaire',
    emoji:       '🤑',
    description: 'Accumulate 1,000,000 lifetime souls.',
    reward:      { souls: 0, blood: 50 },
    condition:   (player) => player.lifetime_souls >= 1_000_000,
  },

  // ── Minions ────────────────────────────────────────────────────────────────
  first_minion: {
    id:          'first_minion',
    name:        'Dark Recruiter',
    emoji:       '👺',
    description: 'Purchase your first minion.',
    reward:      { souls: 100, blood: 0 },
    condition:   (player, stats) => stats.totalMinionsOwned >= 1,
  },
  dragon_tamer: {
    id:          'dragon_tamer',
    name:        'Dragon Tamer',
    emoji:       '🐉',
    description: 'Own 10 Elder Dragons.',
    reward:      { souls: 0, blood: 200 },
    condition:   (player, stats) => (stats.minionCounts?.dragon || 0) >= 10,
  },
  minion_army: {
    id:          'minion_army',
    name:        'Dark Army',
    emoji:       '⚔️',
    description: 'Own 100 minions total.',
    reward:      { souls: 5000, blood: 0 },
    condition:   (player, stats) => stats.totalMinionsOwned >= 100,
  },

  // ── Raiding ────────────────────────────────────────────────────────────────
  first_blood: {
    id:          'first_blood',
    name:        'First Blood',
    emoji:       '🩸',
    description: 'Win your first raid.',
    reward:      { souls: 200, blood: 10 },
    condition:   (player) => player.raid_wins >= 1,
  },
  warlord: {
    id:          'warlord',
    name:        'Warlord',
    emoji:       '🗡️',
    description: 'Win 50 raids.',
    reward:      { souls: 0, blood: 100 },
    condition:   (player) => player.raid_wins >= 50,
  },
  untouchable: {
    id:          'untouchable',
    name:        'Untouchable',
    emoji:       '🛡️',
    description: 'Successfully defend 20 raids.',
    reward:      { souls: 0, blood: 50 },
    condition:   (player, stats) => (stats.successfulDefenses || 0) >= 20,
  },

  // ── Progression ────────────────────────────────────────────────────────────
  the_grind: {
    id:          'the_grind',
    name:        'The Grind',
    emoji:       '⛏️',
    description: 'Reach dungeon level 10.',
    reward:      { souls: 1000, blood: 25 },
    condition:   (player) => player.dungeon_level >= 10,
  },
  ascended: {
    id:          'ascended',
    name:        'Ascended',
    emoji:       '✨',
    description: 'Prestige for the first time.',
    reward:      { souls: 0, blood: 100 },
    condition:   (player) => player.ascension >= 1,
  },
  elder_god: {
    id:          'elder_god',
    name:        'Elder God',
    emoji:       '🌌',
    description: 'Reach the 5th ascension.',
    reward:      { souls: 0, blood: 1000 },
    condition:   (player) => player.ascension >= 5,
  },

  // ── Economy ────────────────────────────────────────────────────────────────
  blood_money: {
    id:          'blood_money',
    name:        'Blood Money',
    emoji:       '💸',
    description: 'Spend 500 blood total.',
    reward:      { souls: 10000, blood: 0 },
    condition:   (player, stats) => (stats.totalBloodSpent || 0) >= 500,
  },
  nightmare_lord: {
    id:          'nightmare_lord',
    name:        'Nightmare Lord',
    emoji:       '👑',
    description: 'Reach #1 on the leaderboard.',
    reward:      { souls: 0, blood: 500 },
    condition:   (player, stats) => stats.leaderboardRank === 1,
  },
};

/**
 * Check which achievements a player has newly unlocked.
 * Returns array of newly unlocked achievement IDs.
 *
 * @param {object} player - Player row from DB
 * @param {object} stats - Action-specific stats (minionCounts, totalMinionsOwned, etc.)
 * @param {string[]} alreadyUnlocked - Achievement IDs the player already has
 * @returns {string[]} newly unlocked achievement IDs
 */
function checkAchievements(player, stats = {}, alreadyUnlocked = []) {
  const newlyUnlocked = [];

  for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
    if (alreadyUnlocked.includes(id)) continue;
    try {
      if (achievement.condition(player, stats)) {
        newlyUnlocked.push(id);
      }
    } catch {
      // Condition failed gracefully — stats object may be missing keys
    }
  }

  return newlyUnlocked;
}

module.exports = { ACHIEVEMENTS, checkAchievements };