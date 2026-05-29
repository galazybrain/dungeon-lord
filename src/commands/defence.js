const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const { getOrCreatePlayer, updatePlayer, db, recalcDefenceHp, getDefenceHp } = require('../db/database');
const { MINIONS } = require('../data/minions');
const { calcPower, TIER_POWER } = require('../data/combat');
const { safeCommand } = require('../utils/safeCommand');

const MAX_DEFENDERS = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDefenceTeam(userId) {
  // No longer need hp – shared HP pool is in players table
  return db.prepare(`
    SELECT minion_id, quantity
    FROM player_defence
    WHERE user_id = ?
  `).all(userId);
}

function getTotalMinionCount(userId) {
  const rows = db.prepare('SELECT SUM(quantity) as total FROM player_minions WHERE user_id = ?').get(userId);
  return rows?.total ?? 0;
}

function buildDefenceEmbed(userId, defenceTeam) {
  const rawPower = calcPower(defenceTeam.map(d => ({ minion_id: d.minion_id, quantity: d.quantity })), MINIONS);
  const { current: hpCurrent, max: hpMax } = getDefenceHp(userId);
  const hpPercent = hpMax > 0 ? (hpCurrent / hpMax) * 100 : 0;
  const filled = hpMax > 0 ? Math.round((hpCurrent / hpMax) * 10) : 0;
  const hpBar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  const embed = new EmbedBuilder()
    .setTitle('🛡️ Defence Command')
    .setColor(0x1E90FF)
    .setFooter({ text: `Max ${MAX_DEFENDERS} defenders • Raw Combat Power: ${rawPower}` });

  if (defenceTeam.length === 0) {
    embed.setDescription('⚠️ You have no defenders set! Use the menu below to assign minions.');
    embed.addFields({
      name: '🛡️ Defence HP Pool',
      value: `${hpCurrent} / ${hpMax} HP (0%) ${hpBar}`,
      inline: false,
    });
    return embed;
  }

  const lines = defenceTeam.map(d => {
    const def = MINIONS[d.minion_id];
    return def ? `${def.emoji} **${def.name}** ×${d.quantity}` : null;
  }).filter(Boolean);

  embed.setDescription(lines.join('\n'));
  embed.addFields({
    name: '🛡️ Defence HP Pool',
    value: `${hpCurrent} / ${hpMax} HP (${hpPercent.toFixed(1)}%) ${hpBar}`,
    inline: false,
  });
  return embed;
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('defence')
    .setDescription('Manage your dungeon defence team.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Ensure defence table exists (without hp column – we use global pool)
    db.exec(`
      CREATE TABLE IF NOT EXISTS player_defence (
        user_id    TEXT NOT NULL,
        minion_id  TEXT NOT NULL,
        quantity   INTEGER DEFAULT 1,
        PRIMARY KEY (user_id, minion_id),
        FOREIGN KEY (user_id) REFERENCES players(user_id)
      );
    `);

    const player = getOrCreatePlayer(interaction.user.id, interaction.guildId);
    const defenceTeam = getDefenceTeam(interaction.user.id);
    const ownedRows = db.prepare('SELECT minion_id, quantity FROM player_minions WHERE user_id = ?').all(interaction.user.id);
    const ownedMap = Object.fromEntries(ownedRows.map(r => [r.minion_id, r.quantity]));

    // Minions available to add (owned but not yet defending)
    const defending = new Set(defenceTeam.map(d => d.minion_id));
    const available = ownedRows.filter(r => !defending.has(r.minion_id) && r.quantity > 0);

    const embed = buildDefenceEmbed(interaction.user.id, defenceTeam);
    const components = [];

    // Add defender select
    if (available.length > 0 && defenceTeam.length < MAX_DEFENDERS) {
      const addOptions = available.map(r => {
        const def = MINIONS[r.minion_id];
        if (!def) return null;
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${def.name} (owned: ${r.quantity})`)
          .setDescription(`Tier ${def.tier} • Power: ${r.quantity} × ${TIER_POWER[def.tier]}`)
          .setEmoji(def.emoji)
          .setValue(r.minion_id);
      }).filter(Boolean);

      if (addOptions.length > 0) {
        components.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('defence_add')
            .setPlaceholder('Add a minion to defence...')
            .addOptions(addOptions),
        ));
      }
    }

    // Remove defender select
    if (defenceTeam.length > 0) {
      const removeOptions = defenceTeam.map(d => {
        const def = MINIONS[d.minion_id];
        if (!def) return null;
        return new StringSelectMenuOptionBuilder()
          .setLabel(`Remove: ${def.name} ×${d.quantity}`)
          .setEmoji(def.emoji)
          .setValue(d.minion_id);
      }).filter(Boolean);

      if (removeOptions.length > 0) {
        components.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('defence_remove')
            .setPlaceholder('Remove a minion from defence...')
            .addOptions(removeOptions),
        ));
      }
    }

    const reply = await interaction.editReply({ embeds: [embed], components });

    // ── Collector ─────────────────────────────────────────────────────────────
    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120_000,
    });

    collector.on('collect', async i => {
      const currentTeam = getDefenceTeam(interaction.user.id);
      const currentOwned = db.prepare('SELECT minion_id, quantity FROM player_minions WHERE user_id = ?').all(interaction.user.id);
      const currentOwnedMap = Object.fromEntries(currentOwned.map(r => [r.minion_id, r.quantity]));

      if (i.customId === 'defence_add') {
        const minionId = i.values[0];

        if (currentTeam.length >= MAX_DEFENDERS) {
          return i.reply({ content: `❌ Defence team is full (max ${MAX_DEFENDERS}).`, ephemeral: true });
        }

        const qty = currentOwnedMap[minionId] ?? 0;
        if (qty === 0) {
          return i.reply({ content: '❌ You no longer own this minion.', ephemeral: true });
        }

        // Insert or update (though conflict unlikely because we filtered)
        db.prepare(`
          INSERT INTO player_defence (user_id, minion_id, quantity)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id, minion_id) DO UPDATE SET quantity = excluded.quantity
        `).run(interaction.user.id, minionId, qty);

        // Recalculate shared HP pool (heal to full after change)
        recalcDefenceHp(interaction.user.id, true);

        await i.deferUpdate();

      } else if (i.customId === 'defence_remove') {
        const minionId = i.values[0];
        db.prepare('DELETE FROM player_defence WHERE user_id = ? AND minion_id = ?')
          .run(interaction.user.id, minionId);

        // Recalculate shared HP pool (heal to full after change)
        recalcDefenceHp(interaction.user.id, true);

        await i.deferUpdate();
      }

      // Refresh embed
      const updatedTeam = getDefenceTeam(interaction.user.id);
      const updatedOwned = db.prepare('SELECT minion_id, quantity FROM player_minions WHERE user_id = ?').all(interaction.user.id);
      const updatedDefending = new Set(updatedTeam.map(d => d.minion_id));
      const updatedAvailable = updatedOwned.filter(r => !updatedDefending.has(r.minion_id) && r.quantity > 0);

      const newEmbed = buildDefenceEmbed(interaction.user.id, updatedTeam);
      const newComponents = [];

      if (updatedAvailable.length > 0 && updatedTeam.length < MAX_DEFENDERS) {
        const addOpts = updatedAvailable.map(r => {
          const def = MINIONS[r.minion_id];
          if (!def) return null;
          return new StringSelectMenuOptionBuilder()
            .setLabel(`${def.name} (owned: ${r.quantity})`)
            .setDescription(`Tier ${def.tier} • Power: ${r.quantity} × ${TIER_POWER[def.tier]}`)
            .setEmoji(def.emoji)
            .setValue(r.minion_id);
        }).filter(Boolean);

        if (addOpts.length > 0) {
          newComponents.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('defence_add')
              .setPlaceholder('Add a minion to defence...')
              .addOptions(addOpts),
          ));
        }
      }

      if (updatedTeam.length > 0) {
        const removeOpts = updatedTeam.map(d => {
          const def = MINIONS[d.minion_id];
          if (!def) return null;
          return new StringSelectMenuOptionBuilder()
            .setLabel(`Remove: ${def.name} ×${d.quantity}`)
            .setEmoji(def.emoji)
            .setValue(d.minion_id);
        }).filter(Boolean);

        if (removeOpts.length > 0) {
          newComponents.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('defence_remove')
              .setPlaceholder('Remove a minion from defence...')
              .addOptions(removeOpts),
          ));
        }
      }

      await interaction.editReply({ embeds: [newEmbed], components: newComponents });
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};