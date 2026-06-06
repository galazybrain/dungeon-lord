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

const ADMIN_IDS = ['754243493706203136']; // Replace with your Discord ID

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
      .addUserOption(opt => opt.setName('target').setDescription('User (defaults to you)').setRequired(false))),

  async execute(interaction) {
    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    // ── Reset Raid Cooldown ─────────────────────────────────────────────
    if (sub === 'resetcooldown') {
      const target = interaction.options.getUser('target');
      updatePlayer(target.id, interaction.guildId, { raid_cooldown_until: null });
      return interaction.reply({ content: `✅ Cooldown reset for **${target.tag}**.`, ephemeral: true });
    }

    // ── Full Player Reset ───────────────────────────────────────────────
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

    // ── View Player Stats ───────────────────────────────────────────────
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

    // ── Debug Purchase (army_salve) ─────────────────────────────────────
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
  },
};