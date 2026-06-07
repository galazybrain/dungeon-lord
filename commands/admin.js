const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { 
  db, 
  getOrCreatePlayer, 
  updatePlayer, 
  recalcDefenceHp, 
  getDefenceHp,
  hasUpgrade,
  purchaseUpgrade
} = require('../db/database');
const { MINIONS } = require('../data/minions');
const { UPGRADES, getAvailableUpgrades } = require('../data/upgrades');
const { safeCommand } = require('../utils/safeCommand');

const ADMIN_IDS = ['754243493706203136', '1478669539259584534', '1505086807006646343']; // Replace with your Discord ID(s)

// Audit log channel (in-memory; resets on restart)
let auditLogChannelId = null;

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function createProgressBar(current, max, length = 10) {
  const filled = max > 0 ? Math.round((current / max) * length) : 0;
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('[Admin] Various administrative commands')

    // ── Existing subcommands ──────────────────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('resetcooldown')
      .setDescription('Reset a player\'s raid cooldown')
      .addUserOption(opt => opt.setName('target').setDescription('The player').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('resetplayer')
      .setDescription('Fully reset a player\'s progress')
      .addUserOption(opt => opt.setName('target').setDescription('The player').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('viewstats')
      .setDescription('View detailed stats of a player')
      .addUserOption(opt => opt.setName('target').setDescription('The player').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('debugpurchase')
      .setDescription('Check or reset army_salve purchase')
      .addStringOption(opt => opt.setName('action').setDescription('check or reset').setRequired(true).addChoices(
        { name: 'check', value: 'check' },
        { name: 'reset', value: 'reset' }
      ))
      .addUserOption(opt => opt.setName('target').setDescription('User (defaults to you)').setRequired(false)))

    // ── New subcommands ───────────────────────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('setauditlog')
      .setDescription('Set the channel where audit log events are posted')
      .addChannelOption(opt => opt.setName('channel').setDescription('The channel to send audit logs to').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('purge')
      .setDescription('Delete a number of messages in this channel')
      .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to delete (1–100)').setRequired(true).setMinValue(1).setMaxValue(100)))
    .addSubcommand(sub => sub
      .setName('mute')
      .setDescription('Timeout (mute) a user for a specified duration')
      .addUserOption(opt => opt.setName('user').setDescription('The user to mute').setRequired(true))
      .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for the mute').setRequired(false))),

  async execute(interaction) {
    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    // ── Reset Raid Cooldown ───────────────────────────────────────────────────
    if (sub === 'resetcooldown') {
      const target = interaction.options.getUser('target');
      updatePlayer(target.id, interaction.guildId, { raid_cooldown_until: null });
      return interaction.reply({ content: `✅ Cooldown reset for **${target.tag}**.`, ephemeral: true });
    }

    // ── Full Player Reset ─────────────────────────────────────────────────────
    if (sub === 'resetplayer') {
      const target = interaction.options.getUser('target');
      try {
        db.transaction(() => {
          db.prepare('DELETE FROM player_minions WHERE user_id = ?').run(target.id);
          db.prepare('DELETE FROM player_defence WHERE user_id = ?').run(target.id);
          db.prepare('DELETE FROM player_upgrades WHERE user_id = ?').run(target.id);
          db.prepare('DELETE FROM achievements WHERE user_id = ?').run(target.id);
          db.prepare('DELETE FROM quests WHERE user_id = ?').run(target.id);
          db.prepare('DELETE FROM raid_log WHERE attacker_id = ? OR defender_id = ?').run(target.id, target.id);
          db.prepare(`
            UPDATE players SET
              souls = 0,
              blood = 0,
              lifetime_souls = 0,
              souls_per_min = 1,
              last_collected = datetime('now'),
              dungeon_level = 1,
              dungeon_name = NULL,
              ascension = 0,
              boss_form = 0,
              boss_form_skin = 0,
              raid_wins = 0,
              raid_losses = 0,
              successful_defenses = 0,
              last_raid_at = NULL,
              raid_cooldown_until = NULL,
              temp_multiplier = 1.0,
              temp_multiplier_until = NULL,
              defense_level = 0,
              defence_hp_current = 0,
              defence_hp_max = 0,
              army_salve_cooldown_until = NULL,
              updated_at = datetime('now')
            WHERE user_id = ?
          `).run(target.id);
        })();
        return interaction.editReply({ content: `✅ **${target.tag}** has been fully reset.` });
      } catch (err) {
        console.error('Reset error:', err);
        return interaction.editReply({ content: `❌ Reset failed: ${err.message}` });
      }
    }

    // ── View Player Stats ─────────────────────────────────────────────────────
    if (sub === 'viewstats') {
      const target = interaction.options.getUser('target');
      let player;
      try {
        player = getOrCreatePlayer(target.id, interaction.guildId);
      } catch (err) {
        return interaction.editReply({ content: `❌ Error: ${err.message}` });
      }
      const { current: hpCurrent, max: hpMax } = getDefenceHp(target.id);
      const hpPercent = hpMax > 0 ? (hpCurrent / hpMax) * 100 : 0;
      const hpBar = createProgressBar(hpCurrent, hpMax);

      const minionRows = db.prepare('SELECT minion_id, quantity FROM player_minions WHERE user_id = ?').all(target.id);
      const minionList = minionRows.map(r => {
        const m = MINIONS[r.minion_id];
        return m ? `${m.emoji} **${m.name}** ×${r.quantity}` : null;
      }).filter(Boolean).join('\n') || 'None';

      const defenceRows = db.prepare('SELECT minion_id, quantity FROM player_defence WHERE user_id = ?').all(target.id);
      const defenceList = defenceRows.map(r => {
        const m = MINIONS[r.minion_id];
        return m ? `${m.emoji} **${m.name}** ×${r.quantity}` : null;
      }).filter(Boolean).join('\n') || 'None';

      const upgradeRows = db.prepare('SELECT upgrade_id FROM player_upgrades WHERE user_id = ? AND purchased = 1').all(target.id);
      const upgradeList = upgradeRows.map(r => {
        const u = UPGRADES[r.upgrade_id];
        return u ? `${u.emoji} **${u.name}**` : null;
      }).filter(Boolean).join('\n') || 'None';

      const availableUpgrades = (getAvailableUpgrades(player.dungeon_level, player.ascension) || [])
        .filter(u => !upgradeRows.some(r => r.upgrade_id === u.id))
        .map(u => `${u.emoji} **${u.name}**`).join('\n') || 'None';

      const embed = new EmbedBuilder()
        .setTitle(`📊 Stats for ${target.tag}`)
        .setColor(0x2C2F33)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '💰 Souls', value: formatNumber(player.souls), inline: true },
          { name: '🩸 Blood', value: formatNumber(player.blood), inline: true },
          { name: '📈 Souls/min', value: formatNumber(player.souls_per_min), inline: true },
          { name: '🏰 Level', value: `${player.dungeon_level}`, inline: true },
          { name: '✨ Ascension', value: `${player.ascension}`, inline: true },
          { name: '🛡️ Defence HP', value: `${hpCurrent}/${hpMax} HP (${hpPercent.toFixed(1)}%) ${hpBar}`, inline: false },
          { name: '⚔️ Minions', value: minionList.slice(0, 1024), inline: false },
          { name: '🛡️ Defence Team', value: defenceList.slice(0, 1024), inline: false },
          { name: '✅ Upgrades', value: upgradeList.slice(0, 1024), inline: true },
          { name: '🔓 Available', value: availableUpgrades.slice(0, 1024), inline: true },
          { name: '⚔️ Raid Stats', value: `Wins: ${player.raid_wins} | Losses: ${player.raid_losses} | Defenses: ${player.successful_defenses}`, inline: false }
        )
        .setFooter({ text: `User ID: ${target.id}` })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── Debug Purchase (army_salve) ───────────────────────────────────────────
    if (sub === 'debugpurchase') {
      const action = interaction.options.getString('action');
      const target = interaction.options.getUser('target') || interaction.user;
      const userId = target.id;
      if (action === 'check') {
        const row = db.prepare(`SELECT * FROM player_upgrades WHERE user_id = ? AND upgrade_id = 'army_salve'`).get(userId);
        if (!row) {
          return interaction.reply({ content: `✅ **${target.tag}** does NOT own Army Salve.`, ephemeral: true });
        } else {
          return interaction.reply({ content: `ℹ️ **${target.tag}** owns Army Salve (purchased=${row.purchased}).`, ephemeral: true });
        }
      } else if (action === 'reset') {
        db.prepare(`DELETE FROM player_upgrades WHERE user_id = ? AND upgrade_id = 'army_salve'`).run(userId);
        return interaction.reply({ content: `🔄 Removed Army Salve purchase for **${target.tag}**. They can buy it again.`, ephemeral: true });
      }
    }

    // ── Set Audit Log Channel ─────────────────────────────────────────────────
    if (sub === 'setauditlog') {
      const channel = interaction.options.getChannel('channel');
      auditLogChannelId = channel.id;
      return interaction.reply({ content: `✅ Audit log channel set to ${channel}.`, ephemeral: true });
    }

    // ── Purge Messages ────────────────────────────────────────────────────────
    if (sub === 'purge') {
      const amount = interaction.options.getInteger('amount');
      await interaction.deferReply({ ephemeral: true });
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        return interaction.editReply({ content: `🗑️ Deleted **${deleted.size}** message(s).` });
      } catch (err) {
        console.error('[purge]', err);
        return interaction.editReply({ content: '❌ Failed to delete messages. Messages older than 14 days cannot be bulk deleted.' });
      }
    }

    // ── Mute / Timeout ────────────────────────────────────────────────────────
    if (sub === 'mute') {
      const target = interaction.options.getMember('user');
      const duration = interaction.options.getInteger('duration');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const durationMs = duration * 60 * 1000;
      try {
        await target.timeout(durationMs, reason);
        return interaction.reply({
          content: `🔇 **${target.user.tag}** has been muted for **${duration} minute(s)**.\n📝 Reason: ${reason}`,
          ephemeral: true,
        });
      } catch (err) {
        console.error('[mute]', err);
        return interaction.reply({ content: '❌ Failed to mute user. Make sure I have the Moderate Members permission.', ephemeral: true });
      }
    }
  },
};

// ─── Audit Log Listeners ──────────────────────────────────────────────────────
// Call setupAuditLog(client) in your index.js after the client is ready:
//   const { setupAuditLog } = require('./commands/admin');
//   client.once('ready', () => setupAuditLog(client));

function setupAuditLog(client) {
  // Message deleted
  client.on('messageDelete', async (message) => {
    if (!auditLogChannelId || message.partial || message.author?.bot) return;
    const logChannel = client.channels.cache.get(auditLogChannelId);
    if (!logChannel) return;
    const embed = new EmbedBuilder()
      .setColor(0xFF4444)
      .setTitle('🗑️ Message Deleted')
      .addFields(
        { name: 'Author', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: 'Content', value: message.content || '*[No text content]*' },
      )
      .setTimestamp();
    logChannel.send({ embeds: [embed] });
  });

  // Message edited
  client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (!auditLogChannelId || oldMessage.partial || newMessage.partial) return;
    if (oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    const logChannel = client.channels.cache.get(auditLogChannelId);
    if (!logChannel) return;
    const embed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('✏️ Message Edited')
      .addFields(
        { name: 'Author', value: `${oldMessage.author.tag} (<@${oldMessage.author.id}>)`, inline: true },
        { name: 'Channel', value: `<#${oldMessage.channel.id}>`, inline: true },
        { name: 'Before', value: oldMessage.content || '*[empty]*' },
        { name: 'After', value: newMessage.content || '*[empty]*' },
      )
      .setTimestamp();
    logChannel.send({ embeds: [embed] });
  });

  // Member joined
  client.on('guildMemberAdd', async (member) => {
    if (!auditLogChannelId) return;
    const logChannel = client.channels.cache.get(auditLogChannelId);
    if (!logChannel) return;
    const embed = new EmbedBuilder()
      .setColor(0x44FF88)
      .setTitle('📥 Member Joined')
      .addFields(
        { name: 'User', value: `${member.user.tag} (<@${member.user.id}>)`, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();
    logChannel.send({ embeds: [embed] });
  });

  // Member left
  client.on('guildMemberRemove', async (member) => {
    if (!auditLogChannelId) return;
    const logChannel = client.channels.cache.get(auditLogChannelId);
    if (!logChannel) return;
    const embed = new EmbedBuilder()
      .setColor(0xFF8844)
      .setTitle('📤 Member Left')
      .addFields(
        { name: 'User', value: `${member.user.tag} (<@${member.user.id}>)`, inline: true },
        { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();
    logChannel.send({ embeds: [embed] });
  });
}

module.exports.setupAuditLog = setupAuditLog;