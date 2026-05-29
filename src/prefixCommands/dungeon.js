const { SlashCommandBuilder } = require('discord.js');
const { getOrCreatePlayer, updatePlayer, db } = require('../db/database');
const { getEligibleLevel } = require('../data/levels');
const { recalculateSoulsPerMin } = require('../utils/souls');
const { buildDungeonEmbed } = require('../utils/embeds');
const { STARTING_REWARD } = require('../data/events');
const { MINIONS } = require('../data/minions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dungeon')
    .setDescription('View your dungeon status and level.'),

  async execute(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guildId;

    // ── New Player Setup ────────────────────────────────────────────────────
    const isNewPlayer = !db.prepare(
      'SELECT 1 FROM players WHERE user_id = ? AND guild_id = ?'
    ).get(userId, guildId);

    let player = getOrCreatePlayer(userId, guildId);

    if (isNewPlayer) {
      // Give starting reward
      db.prepare(`
        UPDATE players
        SET souls = souls + ?, lifetime_souls = lifetime_souls + ?, updated_at = datetime('now')
        WHERE user_id = ? AND guild_id = ?
      `).run(STARTING_REWARD.souls, STARTING_REWARD.souls, userId, guildId);

      // Send welcome as ephemeral so only they see it
      await interaction.reply({
        content: STARTING_REWARD.message,
        ephemeral: true,
      });

      // Then fall through to show dungeon status publicly
      player = getOrCreatePlayer(userId, guildId);
    }

    // ── Existing Player (and new player after welcome) ──────────────────────

    // Check if dungeon level should increase
    const eligibleLevel = getEligibleLevel(player.lifetime_souls, player.ascension);
    if (eligibleLevel > player.dungeon_level) {
      db.prepare(`
        UPDATE players SET dungeon_level = ?, updated_at = datetime('now')
        WHERE user_id = ? AND guild_id = ?
      `).run(eligibleLevel, userId, guildId);

      // Recalculate souls/min since level multiplier changed
      const updatedPlayer = getOrCreatePlayer(userId, guildId);
      const newSpm = recalculateSoulsPerMin(updatedPlayer);
      db.prepare(`
        UPDATE players SET souls_per_min = ?, updated_at = datetime('now')
        WHERE user_id = ? AND guild_id = ?
      `).run(newSpm, userId, guildId);

      // Notify level up ephemerally
      const { getLevelData } = require('../data/levels');
      const newLevelData = getLevelData(eligibleLevel);
      const unlocksList = newLevelData.unlocks.join(', ');
      if (!interaction.replied) {
        await interaction.reply({
          content: `${newLevelData.emoji} **Dungeon upgraded to Level ${eligibleLevel}: ${newLevelData.name}!**\nUnlocked: ${unlocksList}`,
          ephemeral: true,
        });
      } else {
        await interaction.followUp({
          content: `${newLevelData.emoji} **Dungeon upgraded to Level ${eligibleLevel}: ${newLevelData.name}!**\nUnlocked: ${unlocksList}`,
          ephemeral: true,
        });
      }
    }

    // Get fresh player after any updates
    const freshPlayer = getOrCreatePlayer(userId, guildId);
    const minionsWithNames = getPlayerMinionsWithNames(userId);
    const embed = buildDungeonEmbed(freshPlayer, minionsWithNames); // no tutorial parameter

    if (interaction.replied) {
      await interaction.followUp({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  },
};

// ── Helper (no tutorial) ─────────────────────────────────────────────────────

function getPlayerMinionsWithNames(userId) {
  const rows = db.prepare(`
    SELECT minion_id, quantity FROM player_minions WHERE user_id = ? AND quantity > 0
  `).all(userId);

  return rows.map(row => ({
    ...row,
    name: MINIONS[row.minion_id]?.name || row.minion_id,
    emoji: MINIONS[row.minion_id]?.emoji || '👹',
  }));
}