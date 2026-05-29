const { SlashCommandBuilder } = require('discord.js');
const { getOrCreatePlayer, db, getDefenceHp } = require('../db/database');
const { getEligibleLevel, getLevelData, getNextLevel } = require('../data/levels');
const { recalculateSoulsPerMin } = require('../utils/souls');
const { buildDungeonEmbed } = require('../utils/embeds');
const { STARTING_REWARD } = require('../data/events');
const { MINIONS } = require('../data/minions');
const { getBossForm } = require('../data/bossforms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dungeon')
    .setDescription('View your dungeon status.'),

  async execute(interaction) {
    const age = Date.now() - interaction.createdTimestamp;
    if (age > 2500) {
      console.warn(`[dungeon] Dropped stale interaction (${age}ms old)`);
      return;
    }

    await interaction.deferReply();

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    // New player check
    const existing = db.prepare('SELECT 1 FROM players WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
    let player = getOrCreatePlayer(userId, guildId);

    if (!existing) {
      db.prepare(`UPDATE players SET souls = souls + ?, lifetime_souls = lifetime_souls + ? WHERE user_id = ? AND guild_id = ?`)
        .run(STARTING_REWARD.souls, STARTING_REWARD.souls, userId, guildId);
      await interaction.followUp({ content: STARTING_REWARD.message, ephemeral: true });
      player = getOrCreatePlayer(userId, guildId);
    }

    // Level up check
    const eligibleLevel = getEligibleLevel(player.lifetime_souls, player.ascension);
    if (eligibleLevel > player.dungeon_level) {
      db.prepare(`UPDATE players SET dungeon_level = ? WHERE user_id = ? AND guild_id = ?`).run(eligibleLevel, userId, guildId);
      const updatedPlayer = getOrCreatePlayer(userId, guildId);
      const newSpm = recalculateSoulsPerMin(updatedPlayer);
      db.prepare(`UPDATE players SET souls_per_min = ? WHERE user_id = ? AND guild_id = ?`).run(newSpm, userId, guildId);
      const newLevelData = getLevelData(eligibleLevel);
      await interaction.followUp({
        content: `${newLevelData.emoji} **Dungeon upgraded to Level ${eligibleLevel}: ${newLevelData.name}!**\nUnlocked: ${newLevelData.unlocks.join(', ')}`,
        ephemeral: true
      });
      player = getOrCreatePlayer(userId, guildId);
    }

    // All minions owned
    const allMinions = db.prepare(`SELECT minion_id, quantity FROM player_minions WHERE user_id = ? AND quantity > 0`).all(userId);
    const minionsWithNames = allMinions.map(row => ({
      ...row,
      name: MINIONS[row.minion_id]?.name || row.minion_id,
      emoji: MINIONS[row.minion_id]?.emoji || '👹',
    }));
    const topMinions = [...minionsWithNames].sort((a, b) => b.quantity - a.quantity).slice(0, 3);

    // Defence team
    const defenceTeam = db.prepare('SELECT minion_id, quantity FROM player_defence WHERE user_id = ?').all(userId);

    // Dungeon name & boss
    const levelData = getLevelData(player.dungeon_level);
    const dungeonName = levelData.name || `Level ${player.dungeon_level}`;
    const bossForm = getBossForm(player.ascension, player.boss_form_skin);
    const bossTitle = bossForm.name;

    // Defence HP
    const { current: hpCurrent, max: hpMax } = getDefenceHp(userId);

    // Next level
    const nextLevel = getNextLevel(player.dungeon_level);

    // Build embed
    const embed = buildDungeonEmbed(player, dungeonName, bossTitle, topMinions, hpCurrent, hpMax, nextLevel, defenceTeam);

    await interaction.editReply({ embeds: [embed], content: null });
  },
};