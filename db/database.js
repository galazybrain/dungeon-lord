const Database = require('better-sqlite3');
const path = require('path');

const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname);
fs.mkdirSync(DB_DIR, { recursive: true }); // ensures folder exists

const db = new Database(path.join(DB_DIR, 'dungeon.db')); // ✅ absolute path

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    user_id         TEXT PRIMARY KEY,
    guild_id        TEXT NOT NULL,

    -- Currency
    souls           REAL    DEFAULT 0,
    blood           REAL    DEFAULT 0,
    lifetime_souls  REAL    DEFAULT 0,

    -- Passive income
    souls_per_min   REAL    DEFAULT 1,
    last_collected  TEXT    DEFAULT (datetime('now')),

    -- Dungeon level (1–20)
    dungeon_level   INTEGER DEFAULT 1,
    dungeon_name    TEXT    DEFAULT NULL,

    -- Prestige
    ascension       INTEGER DEFAULT 0,
    boss_form       INTEGER DEFAULT 0,
    boss_form_skin  INTEGER DEFAULT 0,

    -- Raid
    raid_wins           INTEGER DEFAULT 0,
    raid_losses         INTEGER DEFAULT 0,
    successful_defenses INTEGER DEFAULT 0,
    last_raid_at        TEXT    DEFAULT NULL,
    raid_cooldown_until TEXT    DEFAULT NULL,

    -- Temp event buffs
    temp_multiplier       REAL DEFAULT 1.0,
    temp_multiplier_until TEXT DEFAULT NULL,

    -- Defense
    defense_level   INTEGER DEFAULT 0,

    -- Misc
    created_at      TEXT    DEFAULT (datetime('now')),
    updated_at      TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS player_minions (
    user_id     TEXT NOT NULL,
    minion_id   TEXT NOT NULL,
    quantity    INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, minion_id),
    FOREIGN KEY (user_id) REFERENCES players(user_id)
  );

  CREATE TABLE IF NOT EXISTS player_defence (
    user_id    TEXT NOT NULL,
    minion_id  TEXT NOT NULL,
    quantity   INTEGER DEFAULT 1,
    PRIMARY KEY (user_id, minion_id),
    FOREIGN KEY (user_id) REFERENCES players(user_id)
  );

  CREATE TABLE IF NOT EXISTS player_upgrades (
    user_id     TEXT NOT NULL,
    upgrade_id  TEXT NOT NULL,
    purchased   INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, upgrade_id),
    FOREIGN KEY (user_id) REFERENCES players(user_id)
  );

  CREATE TABLE IF NOT EXISTS raid_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    attacker_id   TEXT NOT NULL,
    defender_id   TEXT NOT NULL,
    souls_stolen  REAL DEFAULT 0,
    attacker_won  INTEGER NOT NULL,
    timestamp     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS achievements (
    user_id         TEXT NOT NULL,
    achievement_id  TEXT NOT NULL,
    unlocked_at     TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, achievement_id),
    FOREIGN KEY (user_id) REFERENCES players(user_id)
  );

  CREATE TABLE IF NOT EXISTS quests (
    user_id       TEXT NOT NULL,
    quest_id      TEXT NOT NULL,
    progress      INTEGER DEFAULT 0,
    completed     INTEGER DEFAULT 0,
    expires_at    TEXT NOT NULL,
    PRIMARY KEY (user_id, quest_id),
    FOREIGN KEY (user_id) REFERENCES players(user_id)
  );
`);

// Add defence HP columns safely (outside CREATE TABLE)
try {
  db.exec(`ALTER TABLE players ADD COLUMN defence_hp_current INTEGER DEFAULT 0`);
} catch (err) {
  if (!err.message.includes('duplicate column name')) throw err;
}
try {
  db.exec(`ALTER TABLE players ADD COLUMN defence_hp_max INTEGER DEFAULT 0`);
} catch (err) {
  if (!err.message.includes('duplicate column name')) throw err;
}
// Add army_salve_cooldown_until column if not exists
try {
  db.exec(`ALTER TABLE players ADD COLUMN army_salve_cooldown_until TEXT DEFAULT NULL`);
} catch (err) {
  if (!err.message.includes('duplicate column name')) throw err;
}
// ─── Player Helpers ──────────────────────────────────────────────────────────

function getOrCreatePlayer(userId, guildId) {
  let player = db.prepare(`
    SELECT * FROM players WHERE user_id = ? AND guild_id = ?
  `).get(userId, guildId);

  if (!player) {
    db.prepare(`
      INSERT INTO players (user_id, guild_id) VALUES (?, ?)
    `).run(userId, guildId);
    player = db.prepare(`
      SELECT * FROM players WHERE user_id = ? AND guild_id = ?
    `).get(userId, guildId);
  }
  return player;
}

function updatePlayer(userId, guildId, fields) {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;
  const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  db.prepare(`
    UPDATE players
    SET ${setClause}, updated_at = datetime('now')
    WHERE user_id = ? AND guild_id = ?
  `).run(...values, userId, guildId);
}
function attemptArmySalveHeal(userId) {
  // Check if player owns the upgrade
  const upgrade = db.prepare(`
    SELECT purchased FROM player_upgrades WHERE user_id = ? AND upgrade_id = 'army_salve' AND purchased = 1
  `).get(userId);
  if (!upgrade) return { healed: false, reason: 'not_owned' };

  // Get current HP and cooldown
  const player = db.prepare(`
    SELECT defence_hp_current, defence_hp_max, army_salve_cooldown_until
    FROM players WHERE user_id = ?
  `).get(userId);
  if (!player) return { healed: false, reason: 'no_player' };

  // Check cooldown
  if (player.army_salve_cooldown_until && new Date(player.army_salve_cooldown_until) > new Date()) {
    return { healed: false, reason: 'cooldown' };
  }

  // Check HP percentage (current / max)
  const hpPercent = player.defence_hp_max > 0 ? player.defence_hp_current / player.defence_hp_max : 0;
  if (hpPercent > 0.25) return { healed: false, reason: 'hp_above_25' };

  // Heal to full and set cooldown 7 days from now
  const cooldownUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE players
    SET defence_hp_current = defence_hp_max,
        army_salve_cooldown_until = ?
    WHERE user_id = ?
  `).run(cooldownUntil, userId);

  return { healed: true, reason: 'success' };
}

// ─── Minion Helpers ──────────────────────────────────────────────────────────

function getMinions(userId) {
  return db.prepare(`SELECT * FROM player_minions WHERE user_id = ?`).all(userId);
}

function getMinionQuantity(userId, minionId) {
  const row = db.prepare(`SELECT quantity FROM player_minions WHERE user_id = ? AND minion_id = ?`).get(userId, minionId);
  return row ? row.quantity : 0;
}

function setMinionQuantity(userId, minionId, quantity) {
  db.prepare(`
    INSERT INTO player_minions (user_id, minion_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, minion_id) DO UPDATE SET quantity = excluded.quantity
  `).run(userId, minionId, quantity);
}

// ─── Upgrade Helpers ──────────────────────────────────────────────────────────

function getUpgrades(userId) {
  return db.prepare(`SELECT * FROM player_upgrades WHERE user_id = ?`).all(userId);
}

function hasUpgrade(userId, upgradeId) {
  const row = db.prepare(`SELECT purchased FROM player_upgrades WHERE user_id = ? AND upgrade_id = ?`).get(userId, upgradeId);
  return row ? row.purchased === 1 : false;
}

function purchaseUpgrade(userId, upgradeId) {
  db.prepare(`
    INSERT INTO player_upgrades (user_id, upgrade_id, purchased)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, upgrade_id) DO UPDATE SET purchased = 1
  `).run(userId, upgradeId);
}

// ─── Defence HP Pool Helpers ─────────────────────────────────────────────────

function recalcDefenceHp(userId, healToFull = true) {
  const rows = db.prepare('SELECT quantity FROM player_defence WHERE user_id = ?').all(userId);
  const maxHp = rows.reduce((sum, row) => sum + (100 * row.quantity), 0);
  let currentHp = maxHp;
  if (!healToFull) {
    const existing = db.prepare('SELECT defence_hp_current FROM players WHERE user_id = ?').get(userId);
    currentHp = Math.min(maxHp, existing?.defence_hp_current ?? maxHp);
  }
  db.prepare(`UPDATE players SET defence_hp_max = ?, defence_hp_current = ? WHERE user_id = ?`)
    .run(maxHp, currentHp, userId);
  return { max: maxHp, current: currentHp };
}

function getDefenceHp(userId) {
  const row = db.prepare('SELECT defence_hp_current, defence_hp_max FROM players WHERE user_id = ?').get(userId);
  return { current: row?.defence_hp_current || 0, max: row?.defence_hp_max || 0 };
}

function damageDefenceHp(userId, damage) {
  const { current, max } = getDefenceHp(userId);
  const newCurrent = Math.max(0, current - damage);
  db.prepare(`UPDATE players SET defence_hp_current = ? WHERE user_id = ?`).run(newCurrent, userId);
  return newCurrent;
}

function destroyDefenceHp(userId) {
  db.prepare(`UPDATE players SET defence_hp_current = 0 WHERE user_id = ?`).run(userId);
}

function healDefenceHp(userId) {
  const { max } = getDefenceHp(userId);
  db.prepare(`UPDATE players SET defence_hp_current = ? WHERE user_id = ?`).run(max, userId);
}

// ─── Raid Log Helpers ─────────────────────────────────────────────────────────

function logRaid(attackerId, defenderId, soulsStolen, attackerWon) {
  db.prepare(`
    INSERT INTO raid_log (attacker_id, defender_id, souls_stolen, attacker_won)
    VALUES (?, ?, ?, ?)
  `).run(attackerId, defenderId, soulsStolen, attackerWon ? 1 : 0);
}

function getRecentRaids(userId, limit = 10) {
  return db.prepare(`
    SELECT * FROM raid_log
    WHERE attacker_id = ? OR defender_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(userId, userId, limit);
}

// ─── Achievement Helpers ──────────────────────────────────────────────────────

function hasAchievement(userId, achievementId) {
  const row = db.prepare(`SELECT 1 FROM achievements WHERE user_id = ? AND achievement_id = ?`).get(userId, achievementId);
  return !!row;
}

function unlockAchievement(userId, achievementId) {
  db.prepare(`INSERT OR IGNORE INTO achievements (user_id, achievement_id) VALUES (?, ?)`).run(userId, achievementId);
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

function getLeaderboard(guildId, limit = 10) {
  return db.prepare(`
    SELECT user_id, lifetime_souls, ascension, dungeon_level, boss_form
    FROM players
    WHERE guild_id = ?
    ORDER BY lifetime_souls DESC
    LIMIT ?
  `).all(guildId, limit);
}

module.exports = {
  db,
  getOrCreatePlayer,
  updatePlayer,
  getMinions,
  getMinionQuantity,
  setMinionQuantity,
  attemptArmySalveHeal,
  getUpgrades,
  hasUpgrade,
  purchaseUpgrade,
  logRaid,
  getRecentRaids,
  hasAchievement,
  unlockAchievement,
  getLeaderboard,
  recalcDefenceHp,
  getDefenceHp,
  damageDefenceHp,
  destroyDefenceHp,
  healDefenceHp,
};
