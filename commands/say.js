const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { safeCommand } = require('../utils/safeCommand');

const ADMIN_IDS = [
  '754243493706203136', // replace with your Discord ID
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot send a message in a specified channel (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('The channel to send the message in')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('message')
      .setDescription('Plain text message (optional if using embed)')
      .setRequired(false)
    )
    .addBooleanOption(opt => opt
      .setName('embed')
      .setDescription('Send as an embed?')
      .setRequired(false)
    )
    .addStringOption(opt => opt
      .setName('title')
      .setDescription('Embed title')
      .setRequired(false)
    )
    .addStringOption(opt => opt
      .setName('description')
      .setDescription('Embed description/body text')
      .setRequired(false)
    )
    .addStringOption(opt => opt
      .setName('color')
      .setDescription('Embed color as hex e.g. #FF0000 (default: dark red)')
      .setRequired(false)
    ),

  execute: safeCommand(async (interaction) => {
    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
    }

    const channel     = interaction.options.getChannel('channel');
    const message     = interaction.options.getString('message');
    const useEmbed    = interaction.options.getBoolean('embed');
    const title       = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const colorHex    = interaction.options.getString('color');

    if (!channel.isTextBased()) {
      return interaction.editReply({ content: '❌ That channel is not a text channel.' });
    }

    if (!message && !useEmbed) {
      return interaction.editReply({ content: '❌ Provide a message or enable the embed option.' });
    }

    try {
      if (useEmbed) {
        const color = colorHex ? parseInt(colorHex.replace('#', ''), 16) : 0x8B0000;
        const embed = new EmbedBuilder()
          .setColor(color)
          .setTimestamp();

        if (title) embed.setTitle(title);
        if (description) embed.setDescription(description);

        await channel.send({ content: message ?? undefined, embeds: [embed] });
      } else {
        await channel.send(message);
      }

      return interaction.editReply({ content: `✅ Message sent in <#${channel.id}>` });
    } catch (e) {
      return interaction.editReply({ content: `❌ Failed to send: ${e.message}` });
    }
  }, true),
};