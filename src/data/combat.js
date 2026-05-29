/**
 * Shared combat logic for raid system.
 */

const TIER_POWER = {
  1: 1,
  2: 6,
  3: 36,
  4: 216,
};

const BASE_HP = 1000;

/**
 * Calculate total combat power for a list of minions.
 * @param {Array} minions - [{ minion_id, quantity }]
 * @param {object} MINIONS - minion definitions
 * @param {number} hpPercentage - multiplier for defence HP (0..1)
 */
function calcPower(team, MINIONS, hpPercentage = 1.0) {
  return team.reduce((sum, m) => {
    const tierPower = TIER_POWER[MINIONS[m.minion_id]?.tier] || 1;
    return sum + (m.quantity * tierPower * hpPercentage);
  }, 0);
}

/**
 * Calculate shared HP pool for a team.
 * More minions = higher HP.
 * @param {number} totalMinions - total number of minions in team
 */
function calcHP(totalMinions) {
  return BASE_HP + totalMinions * 50;
}

/**
 * Resolve a raid.
 * Returns { attackerWon, soulsStolen, bloodReward, hpDamage }
 *
 * @param {number} attackPower
 * @param {number} defendPower
 * @param {number} attackerMinions - total minion count sent
 * @param {number} defenderMinions - total defender minion count
 * @param {number} defenderSouls
 */
function resolveRaid(attackPower, defendPower, attackerMinions, defenderMinions, defenderSouls) {
  const attackerWon = attackPower > defendPower;
  const powerRatio = attackPower / Math.max(defendPower, 1);
  const baseDamage = Math.floor(powerRatio * 100); // base damage between 0 and ~infinite

  let hpDamage;
  if (attackerWon) {
    // Attacker wins: heavy damage, at least 20% of defender's max HP (but cap)
    hpDamage = Math.max(20, Math.min(100, Math.floor(baseDamage * 1.5)));
  } else {
    // Defender wins: light damage, between 5 and 30
    hpDamage = Math.max(5, Math.min(30, Math.floor(baseDamage * 0.5)));
  }

  // Blood reward (same as before)
  const bloodTable = [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];
  const bloodReward = attackerWon
    ? bloodTable[Math.floor(Math.random() * bloodTable.length)]
    : 1;

  const soulsStolen = attackerWon
    ? Math.floor(defenderSouls * 0.20)
    : 0;

  return { attackerWon, soulsStolen, bloodReward, hpDamage };
}

/**
 * Roll a raid cooldown end time (2 hours from now).
 */
function getRaidCooldownUntil() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
}

module.exports = { TIER_POWER, calcPower, calcHP, resolveRaid, getRaidCooldownUntil };