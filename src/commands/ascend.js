const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getOrCreatePlayer, updatePlayer, db } = require('../db/database');
const { getBossForm, getTotalSoulMultiplier, getNextPrestigeThreshold } = require('../data/bossforms');
const { safeCommand } = require('../utils/safeCommand');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ascend')
    .setDescription('Prestige your dungeon — reset for permanent power.'),

  execute: safeCommand(async (interaction) => {
    

    const player   = getOrCreatePlayer(interaction.user.id, interaction.guildId);
    const nextForm = getBossForm(player.ascension + 1);

    // ── Gate checks ───────────────────────────────────────────────────────────

    if (!nextForm) {
      return interaction.editReply({ content: '🌌 You have reached the pinnacle of darkness. There is nothing beyond.' });
    }

    const threshold = getNextPrestigeThreshold(player.ascension);

    if (threshold && player.lifetime_souls < threshold) {
      const needed = threshold - player.lifetime_souls;
      return interaction.editReply({
        content: `❌ Not ready to ascend.\nYou need **${needed.toLocaleString()} more lifetime souls** to unlock **${nextForm.emoji} ${nextForm.name}**.`,
      });
    }

    if (player.dungeon_level < 10) {
      return interaction.editReply({ content: '❌ You must reach **dungeon level 10** before ascending.' });
    }

    // ── Confirmation prompt ───────────────────────────────────────────────────

    const currentForm = getBossForm(player.ascension);
    const newMultiplier = getTotalSoulMultiplier(player.ascension + 1);

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Ascension Awaits')
      .setColor(0xFF4500)
      .setDescription(
        `You are about to transcend your current form.\n\n` +
        `**Current Form:** ${currentForm.emoji} ${currentForm.name}\n` +
        `**New Form:** ${nextForm.emoji} ${nextForm.name}\n\n` +
        `*"${nextForm.description}"*`
      )
      .addFields(
        {
          name: '🔥 What You Lose',
          value: '- All souls\n- All minions\n- All upgrades (except permanent ones)',
          inline: true,
        },
        {
          name: '✨ What You Gain',
          value: `- **${nextForm.emoji} ${nextForm.title}** title\n- **${(newMultiplier * 100 - 100).toFixed(0)}% total** souls/min bonus\n- Ascension level ${player.ascension + 1}`,
          inline: true,
        }
      )
      .setFooter({ text: 'This cannot be undone.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ascend_confirm')
        .setLabel('Ascend')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ascend_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    // ── Collector ─────────────────────────────────────────────────────────────

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 30_000,
      max: 1,
    });

    collector.on('collect', async i => {
      if (i.customId === 'ascend_cancel') {
        return i.update({ content: '↩️ Ascension cancelled.', embeds: [], components: [] });
      }

      // ── Perform ascension ─────────────────────────────────────────────────

      const newAscension = player.ascension + 1;

      // Reset minions
      db.prepare('DELETE FROM player_minions WHERE user_id = ?').run(interaction.user.id);

      // Reset non-permanent upgrades
      db.prepare(`
        DELETE FROM player_upgrades
        WHERE user_id = ? AND upgrade_id NOT IN (
          SELECT upgrade_id FROM player_upgrades WHERE user_id = ? AND upgrade_id = 'chaos_forge'
        )
      `).run(interaction.user.id, interaction.user.id);

      // Update player
      updatePlayer(interaction.user.id, interaction.guildId, {
        ascension:    newAscension,
        boss_form:    newAscension,
        souls:        0,
        souls_per_min: 1 * getTotalSoulMultiplier(newAscension), // base 1 * new multiplier
        dungeon_level: 1,
      });

      const resultEmbed = new EmbedBuilder()
        .setTitle(`${nextForm.emoji} Ascension Complete!`)
        .setColor(0x9400D3)
        .setDescription(
          `You have become **${nextForm.name}** — *${nextForm.title}*\n\n` +
          `*"${nextForm.description}"*\n\n` +
          `Your souls/min now carries a **${((getTotalSoulMultiplier(newAscension) - 1) * 100).toFixed(0)}% permanent bonus**.`
        )
        .setFooter({ text: `Ascension ${newAscension} • The darkness grows stronger.` });

      return i.update({ embeds: [resultEmbed], components: [] });
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        interaction.editReply({ content: '⏱️ Ascension timed out.', embeds: [], components: [] }).catch(() => {});
      }
    });
  }),
};