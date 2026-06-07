const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { safeCommand } = require('../utils/safeCommand');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../data/config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set channels for bot notifications (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('events')
      .setDescription('Set the channel for drop event notifications')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to send event notifications')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('raids')
      .setDescription('Set the channel for raid notifications')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to send raid notifications')
        .setRequired(true)
      )
    ),

  execute: safeCommand(async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;

    const config = loadConfig();
    if (!config[guildId]) config[guildId] = {};

    if (sub === 'events') {
      config[guildId].eventChannelId = channel.id;
      saveConfig(config);
      return interaction.editReply({ content: `✅ Event notifications will now be sent to <#${channel.id}>` });
    }

    if (sub === 'raids') {
      config[guildId].raidChannelId = channel.id;
      saveConfig(config);
      return interaction.editReply({ content: `✅ Raid notifications will now be sent to <#${channel.id}>` });
    }
  }, true),
};