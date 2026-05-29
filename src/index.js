require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { db } = require('./db/database');
const { pickDropEvent, RARITY_COLORS } = require('./data/events');

// ── Bot Client Setup ──────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// ── Load Commands ─────────────────────────────────────────────────────────────

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`✅ Loaded command: /${command.data.name}`);
  }
}

// ── Ready ─────────────────────────────────────────────────────────────────────

client.once('ready', () => {
  console.log(`\n⚔️  Dungeon Lord is online as ${client.user.tag}`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)\n`);
  startDropEventScheduler();
});

// ── Handle Slash Commands ─────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (interaction.isCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error in /${interaction.commandName}:`, error);
      // Do NOT reply here – let the command handle its own errors
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  // Load prefix command handlers
  try {
    const prefixCommand = require(`./prefixCommands/${commandName}.js`);
    await prefixCommand.execute(message, args);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      // Command not found – ignore
    } else {
      console.error(`Prefix command error: ${commandName}`, err);
      await message.reply('❌ Something went wrong.');
    }
  }
});

// ── Drop Event Scheduler (every 5 minutes) ────────────────────────────────────

function startDropEventScheduler() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runDropEvents();
    } catch (err) {
      console.error('Drop event error:', err);
    }
  });
  console.log('🎲 Drop event scheduler started (every 5 minutes)');
}

async function runDropEvents() {
  // Get all players active in the last 2 hours, grouped by guild
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const activePlayers = db.prepare(`
    SELECT * FROM players WHERE last_collected > ?
  `).all(twoHoursAgo);

  if (activePlayers.length === 0) return;

  for (const player of activePlayers) {
    // Each player gets their own independent roll
    const event = pickDropEvent();
    const reward = event.reward(player);

    // Apply reward to player
    const updates = {};
    if (reward.souls > 0) {
      updates.souls = (player.souls || 0) + reward.souls;
      updates.lifetime_souls = (player.lifetime_souls || 0) + reward.souls;
    }
    if (reward.blood > 0) {
      updates.blood = (player.blood || 0) + reward.blood;
    }
    if (reward.tempMultiplier) {
      const until = new Date(Date.now() + reward.tempDuration * 60 * 1000).toISOString();
      updates.temp_multiplier = reward.tempMultiplier;
      updates.temp_multiplier_until = until;
    }
    if (reward.soulsPerMinBonus) {
      // Stack up to 50% total (10 cursed relics max)
      const currentBonus = player.relic_bonus || 0;
      if (currentBonus < 0.50) {
        updates.relic_bonus = Math.min(0.50, currentBonus + reward.soulsPerMinBonus);
      }
    }

    if (Object.keys(updates).length > 0) {
      db.prepare(`
        UPDATE players SET ${Object.keys(updates).map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now')
        WHERE user_id = ? AND guild_id = ?
      `).run(...Object.values(updates), player.user_id, player.guild_id);
    }

    // Send ephemeral-style notification to the player via the guild's system channel
    // We only notify for rare+ events to avoid spam
    if (['rare', 'epic', 'legendary'].includes(event.rarity)) {
      try {
        const guild = client.guilds.cache.get(player.guild_id);
        if (!guild) continue;

        // Try to find a dungeon channel, fall back to system channel
        const channel =
          guild.channels.cache.find(c => c.name.includes('dungeon') && c.isTextBased()) ||
          guild.systemChannel;

        if (!channel) continue;

        const rewardText = reward.souls > 0
          ? `+${reward.souls} souls`
          : reward.blood > 0
          ? `+${reward.blood} blood`
          : reward.tempMultiplier
          ? `2x souls for 30 min`
          : `+5% permanent soul gen`;

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
          .setColor(RARITY_COLORS[event.rarity])
          .setTitle(`${event.emoji} ${event.name} — ${event.rarity.toUpperCase()}`)
          .setDescription(`<@${player.user_id}> ${event.message(rewardText)}`)
          .setFooter({ text: 'Drop Event' })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } catch {
        // Channel send failed silently — not critical
      }
    }
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);