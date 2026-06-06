const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/database');
const { safeCommand } = require('../utils/safeCommand');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show top players worldwide by total souls'),

  execute: safeCommand(async (interaction) => {
    // No defer – we reply directly (query is very fast)
    try {
      const rows = db.prepare(`
        SELECT user_id, SUM(souls) as total_souls
        FROM players
        GROUP BY user_id
        ORDER BY total_souls DESC
        LIMIT 10
      `).all();

      if (!rows.length) {
        return interaction.reply({ content: 'No players found anywhere yet.', ephemeral: true });
      }

      const lines = rows.map((row, idx) => {
        const rank = idx + 1;
        return `**${rank}.** <@${row.user_id}> — **${row.total_souls.toLocaleString()}** souls`;
      });

      const embed = new EmbedBuilder()
        .setTitle('🌍 Worldwide Soul Leaderboard')
        .setColor(0xFFD700)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Total souls earned across all servers' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Leaderboard crash:', err);
      // Only attempt a reply if we haven't replied yet
      if (!interaction.replied) {
        await interaction.editReply({ content: '❌ Failed to load leaderboard. Check console.', ephemeral: true });
      }
    }
  }),
};