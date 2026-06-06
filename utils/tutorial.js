const { db } = require('../db/database');

/**
 * Mark a tutorial quest as completed for a user.
 * Only updates if not already completed, and awards the reward.
 */
function completeTutorialQuest(userId, guildId, questId) {
  // Check if already completed
  const existing = db.prepare(
    'SELECT 1 FROM player_tutorial WHERE user_id = ? AND quest_id = ? AND completed = 1'
  ).get(userId, questId);
  if (existing) return false;

  // Get quest reward from your TUTORIAL_QUESTS array (import from events.js)
  const { TUTORIAL_QUESTS } = require('../events'); // adjust path
  const quest = TUTORIAL_QUESTS.find(q => q.id === questId);
  if (!quest) return false;

  // Mark completed
  db.prepare(
    'INSERT INTO player_tutorial (user_id, guild_id, quest_id, completed, completed_at) VALUES (?, ?, ?, 1, ?)'
  ).run(userId, guildId, questId, Date.now());

  // Award reward (add to player)
  const player = getOrCreatePlayer(userId, guildId); // you need this function
  const { souls, blood } = quest.reward;
  if (souls > 0 || blood > 0) {
    updatePlayer(userId, guildId, {
      souls: player.souls + souls,
      blood: player.blood + blood,
    });
  }
  return true;
}

/**
 * Check and auto-complete level-up quest when dungeon level increases.
 */
function checkLevelUpQuest(userId, guildId, newLevel) {
  if (newLevel >= 2) {
    completeTutorialQuest(userId, guildId, 'tutorial_level_up');
  }
}