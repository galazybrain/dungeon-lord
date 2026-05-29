const { SlashCommandBuilder } = require('discord.js');
const { getHelpEmbed } = require('../utils/helpEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how to play Dungeon Lord'),
  async execute(interaction) {
    await interaction.editReply({ embeds: [getHelpEmbed()], ephemeral: true });
  },
};