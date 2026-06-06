const { SlashCommandBuilder } = require('discord.js');
const { getOrCreatePlayer, updatePlayer, hasUpgrade } = require('../db/database');
const { safeCommand } = require('../utils/safeCommand');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Convert souls to blood (requires Sacrificial Altar upgrade).')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of souls to convert (must be a multiple of 100)')
        .setRequired(true)
    ),

  execute: safeCommand(async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    // Check if upgrade is owned
    if (!hasUpgrade(userId, 'sacrificial_altar')) {
      return interaction.reply({
        content: '❌ You need the **Sacrificial Altar** upgrade to convert souls to blood. Purchase it from `/shop`.',
        ephemeral: true,
      });
    }

    const soulsToConvert = interaction.options.getInteger('amount');
    if (soulsToConvert % 100 !== 0 || soulsToConvert <= 0) {
      return interaction.reply({
        content: '❌ You must convert a positive multiple of 100 souls (e.g., 100, 200, 500).',
        ephemeral: true,
      });
    }

    const player = getOrCreatePlayer(userId, guildId);
    if (player.souls < soulsToConvert) {
      return interaction.reply({
        content: `❌ You only have ${player.souls} souls. Need ${soulsToConvert}.`,
        ephemeral: true,
      });
    }

    const bloodGained = soulsToConvert / 100;
    updatePlayer(userId, guildId, {
      souls: player.souls - soulsToConvert,
      blood: player.blood + bloodGained,
    });

    await interaction.editReply({
      content: `⛩️ **Sacrificial Altar** – You sacrificed **${soulsToConvert} souls** and gained **${bloodGained} blood**.`,
      ephemeral: true,
    });
  }),
};