const { MINIONS } = require('../data/minions');
const { UPGRADES } = require('../data/upgrades');
const { getLevelData } = require('../data/levels');
const { getTotalSoulMultiplier, BOSS_FORMS } = require('../data/bossforms');
const { getMinionQuantity, hasUpgrade } = require('../db/database');


// Max souls a player can hold at once (prevents hoarding without collecting)
const BASE_STORAGE_CAP = 10000;

/**
 * Calculate how many souls a player has passively earned since last_collected.
 * This is called on /collect — no background tick needed.
 *
 * @param {object} player - Player row from DB
 * @returns {number} souls earned since last collected
 */
function calculatePendingSouls(player) {
  const now = Date.now();
  const lastCollected = new Date(player.last_collected).getTime();
  const minutesElapsed = (now - lastCollected) / 1000 / 60;

  // Cap at 24 hours to prevent absurd offline gains
  const cappedMinutes = Math.min(minutesElapsed, 24 * 60);

  const soulsPerMin = player.souls_per_min || 1;
  return soulsPerMin * cappedMinutes;
}

/**
 * Recalculate a player's souls/min from scratch based on their current
 * minions, upgrades, dungeon level, and ascension.
 *
 * Call this whenever a player buys a minion or upgrade.
 *
 * @param {object} player - Player row from DB
 * @returns {number} new souls_per_min value
 */
function recalculateSoulsPerMin(player) {
  const { user_id, dungeon_level, ascension } = player;

  // 1. Sum up raw minion output — ALL minions generate souls regardless of purchase currency
  let rawSoulsPerMin = 1; // base 1/min even with no minions
  for (const [minionId, minion] of Object.entries(MINIONS)) {
    const qty = getMinionQuantity(user_id, minionId);
    rawSoulsPerMin += minion.soulsPerMin * qty;
  }

  // 2. Apply dungeon level multiplier
  const levelData = getLevelData(dungeon_level);
  let multiplier = levelData.multiplier;

  // 3. Apply one-time upgrade bonuses
  if (hasUpgrade(user_id, 'soul_furnace')) {
    multiplier += UPGRADES.soul_furnace.effect.soulsPerMinMultiplier;
  }
  if (hasUpgrade(user_id, 'chaos_forge')) {
    multiplier += UPGRADES.chaos_forge.effect.minionMultiplier;
  }

  // 4. Apply prestige (boss form) multiplier
  const prestigeMultiplier = getTotalSoulMultiplier(ascension);
  multiplier *= prestigeMultiplier;

  return Math.floor(rawSoulsPerMin * multiplier);
}

/**
 * Check if current time is "night" in GMT+8 (8PM–6AM SGT).
 * Used for the Dark Ritual Chamber upgrade.
 */
function isNightTime() {
  const sgtOffset = 8 * 60; // GMT+8 in minutes
  const now = new Date();
  const sgtMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + sgtOffset) % (24 * 60);
  const sgtHour = Math.floor(sgtMinutes / 60);
  return sgtHour >= 20 || sgtHour < 6;
}

/**
 * Get the soul storage cap for a player.
 * Cursed Vault upgrade triples it.
 */
function getStorageCap(player) {
  const hasVault = hasUpgrade(player.user_id, 'cursed_vault');
  return BASE_STORAGE_CAP * (hasVault ? UPGRADES.cursed_vault.effect.storageMultiplier : 1);
}

/**
 * Full collect calculation — returns how many souls to actually award.
 * Accounts for night bonus and storage cap.
 *
 * @param {object} player - Player row from DB
 * @returns {{ earned: number, cappedBy: string|null }} 
 *   earned = souls to add, cappedBy = reason it was capped (or null)
 */

/**
 * Calculate souls earned since last collection.
 * Accounts for night bonus (if applicable) but no longer has a storage cap.
 * @returns {{ earned: number, cappedBy: string|null }}
 */
function collectSouls(player) {
  const now = Date.now();
  const lastCollected = new Date(player.last_collected).getTime();
  let minutesElapsed = Math.floor((now - lastCollected) / (60 * 1000));
  if (minutesElapsed <= 0) {
    return { earned: 0, cappedBy: null };
  }

  // Apply night bonus if player has Dark Ritual upgrade
  let multiplier = 1.0;
  if (hasUpgrade(player.user_id, 'dark_ritual')) {
    const hour = new Date(now).getHours();
    const isNight = hour >= 20 || hour < 6; // 8 PM to 6 AM
    if (isNight) multiplier = 2.0;
  }

  // Calculate raw earned souls
  let earned = player.souls_per_min * minutesElapsed * multiplier;
  // No more storage cap – always return full earned amount
  return { earned, cappedBy: null };
}
/**
 * Calculate how much blood a player passively earns per hour.
 * Requires Nightmare Beacon upgrade (+ boss form multiplier at high ascension).
 */
function calculateBloodPerHour(player) {
  let bloodPerHour = 0;

  if (hasUpgrade(player.user_id, 'nightmare_beacon')) {
    bloodPerHour += UPGRADES.nightmare_beacon.effect.passiveBloodPerHour;
  }

  const bossForm = BOSS_FORMS[Math.min(player.ascension, BOSS_FORMS.length - 1)];
  bloodPerHour *= bossForm.passiveBloodMult;

  return bloodPerHour;
}

/**
 * Format a soul count for display (e.g. 1,234,567 → "1.23M")
 */
function formatSouls(amount) {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000)     return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000)         return `${(amount / 1_000).toFixed(1)}K`;
  return Math.floor(amount).toString();
}

module.exports = {
  calculatePendingSouls,
  recalculateSoulsPerMin,
  collectSouls,
  calculateBloodPerHour,
  getStorageCap,
  isNightTime,
  formatSouls,
};