const { SlashCommandBuilder } = require('discord.js');
const { safeCommand } = require('../utils/safeCommand');
const fs = require('fs');
const path = require('path');

const REMINDERS_FILE = path.join(__dirname, '../../data/reminders.json');

function loadReminders() {
  if (!fs.existsSync(REMINDERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
}

function saveReminders(reminders) {
  fs.mkdirSync(path.dirname(REMINDERS_FILE), { recursive: true });
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('Manage your reminders')
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Set a new reminder')
      .addStringOption(opt => opt.setName('message').setDescription('What to remind you about').setRequired(true))
      .addStringOption(opt => opt.setName('date').setDescription('Date (YYYY-MM-DD)').setRequired(true))
      .addStringOption(opt => opt.setName('time').setDescription('Time (HH:MM) in 24hr format').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('View your active reminders')
    )
    .addSubcommand(sub => sub
      .setName('cancel')
      .setDescription('Cancel a reminder')
      .addIntegerOption(opt => opt.setName('id').setDescription('Reminder ID from /reminder list').setRequired(true))
    ),

  execute: safeCommand(async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const reminders = loadReminders();

    if (sub === 'set') {
      const message = interaction.options.getString('message');
      const date = interaction.options.getString('date');
      const time = interaction.options.getString('time');
      const fireAt = new Date(`${date}T${time}:00`);

      if (isNaN(fireAt.getTime())) {
        return interaction.editReply({ content: '❌ Invalid date or time format. Use YYYY-MM-DD and HH:MM.' });
      }
      if (fireAt < new Date()) {
        return interaction.editReply({ content: '❌ That time is already in the past!' });
      }

      const id = Date.now();
      reminders.push({ id, userId, channelId: interaction.channelId, message, fireAt: fireAt.toISOString(), fired: false });
      saveReminders(reminders);

      return interaction.editReply({ content: `✅ Reminder set for **${date} at ${time}**!\n> ${message}` });
    }

    if (sub === 'list') {
      const mine = reminders.filter(r => r.userId === userId && !r.fired);
      if (!mine.length) return interaction.editReply({ content: '📭 You have no active reminders.' });

      const list = mine.map(r => {
        const d = new Date(r.fireAt);
        return `**ID ${r.id}** — <t:${Math.floor(d.getTime() / 1000)}:F>\n> ${r.message}`;
      }).join('\n\n');

      return interaction.editReply({ content: `⏰ **Your Reminders:**\n\n${list}` });
    }

    if (sub === 'cancel') {
      const id = interaction.options.getInteger('id');
      const idx = reminders.findIndex(r => r.id === id && r.userId === userId);
      if (idx === -1) return interaction.editReply({ content: '❌ Reminder not found or not yours.' });

      reminders.splice(idx, 1);
      saveReminders(reminders);
      return interaction.editReply({ content: `🗑️ Reminder **${id}** cancelled.` });
    }
  }, true), // ephemeral since it's personal
};