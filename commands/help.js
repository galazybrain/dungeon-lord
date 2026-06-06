const { SlashCommandBuilder } = require('discord.js');
const { getHelpEmbed } = require('../utils/helpEmbed');
const { safeCommand } = require('../utils/safeCommand');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how to play Dungeon Lord'),
  execute: safeCommand(async (interaction) => {
    await interaction.editReply({ embeds: [getHelpEmbed()], ephemeral: true });
  }),
};