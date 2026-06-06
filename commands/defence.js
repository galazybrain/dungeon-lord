const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { getOrCreatePlayer, db, recalcDefenceHp, getDefenceHp } = require('../db/database');
const { MINIONS } = require('../data/minions');
const { calcPower, TIER_POWER } = require('../data/combat');
const { safeCommand } = require('../utils/safeCommand');

const MAX_DEFENDERS = 10;

function getDefenceTeam(userId) {
  return db.prepare(`SELECT minion_id, quantity FROM player_defence WHERE user_id = ?`).all(userId);
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
  } else {
    const lines = defenceTeam.map(d => {
      const def = MINIONS[d.minion_id];
      return def ? `${def.emoji} **${def.name}** ×${d.quantity}` : null;
    }).filter(Boolean);
    embed.setDescription(lines.join('\n'));
  }

  embed.addFields({
    name: '🛡️ Defence HP Pool',
    value: `${hpCurrent} / ${hpMax} HP (${hpPercent.toFixed(1)}%) ${hpBar}`,
    inline: false,
  });

  return embed;
}

function buildComponents(userId) {
  const defenceTeam = getDefenceTeam(userId);
  const ownedRows = db.prepare('SELECT minion_id, quantity FROM player_minions WHERE user_id = ?').all(userId);
  const defending = new Set(defenceTeam.map(d => d.minion_id));
  const available = ownedRows.filter(r => !defending.has(r.minion_id) && r.quantity > 0);
  const components = [];

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
          .addOptions(addOptions)
      ));
    }
  }

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
          .addOptions(removeOptions)
      ));
    }
  }

  return components;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('defence')
    .setDescription('Manage your dungeon defence team.'),

  execute: safeCommand(async (interaction) => {

    getOrCreatePlayer(interaction.user.id, interaction.guildId);

    const defenceTeam = getDefenceTeam(interaction.user.id);
    const embed = buildDefenceEmbed(interaction.user.id, defenceTeam);
    const components = buildComponents(interaction.user.id);

    const reply = await interaction.editReply({ embeds: [embed], components });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120_000,
    });

    collector.on('collect', async i => {
      const currentOwned = db.prepare('SELECT minion_id, quantity FROM player_minions WHERE user_id = ?').all(interaction.user.id);
      const currentOwnedMap = Object.fromEntries(currentOwned.map(r => [r.minion_id, r.quantity]));
      const currentTeam = getDefenceTeam(interaction.user.id);

      if (i.customId === 'defence_add') {
        const minionId = i.values[0];
        const def = MINIONS[minionId];

        if (currentTeam.length >= MAX_DEFENDERS) {
          return i.reply({ content: `❌ Defence team is full (max ${MAX_DEFENDERS}).`, ephemeral: true });
        }

        const maxQty = currentOwnedMap[minionId] ?? 0;
        if (maxQty === 0) {
          return i.reply({ content: '❌ You no longer own this minion.', ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`defence_qty_${minionId}`)
          .setTitle(`Deploy ${def.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel(`How many to defend with? (1-${maxQty})`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter a number')
                .setRequired(true)
            )
          );
        await i.showModal(modal);

        try {
          const modalSubmit = await i.awaitModalSubmit({ time: 60000 });
          const entered = parseInt(modalSubmit.fields.getTextInputValue('quantity'), 10);

          if (isNaN(entered) || entered < 1 || entered > maxQty) {
            return modalSubmit.reply({ content: `❌ Invalid quantity. Must be between 1 and ${maxQty}.`, ephemeral: true });
          }

          db.prepare(`
            INSERT INTO player_defence (user_id, minion_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, minion_id) DO UPDATE SET quantity = excluded.quantity
          `).run(interaction.user.id, minionId, entered);

          recalcDefenceHp(interaction.user.id, true);
          await modalSubmit.deferUpdate();
        } catch {
          await i.followUp({ content: '⏱️ Timed out.', ephemeral: true }).catch(() => {});
          return;
        }

      } else if (i.customId === 'defence_remove') {
        const minionId = i.values[0];
        db.prepare('DELETE FROM player_defence WHERE user_id = ? AND minion_id = ?')
          .run(interaction.user.id, minionId);
        recalcDefenceHp(interaction.user.id, true);
        await i.deferUpdate();
      }

      // Refresh embed and components
      const updatedTeam = getDefenceTeam(interaction.user.id);
      const newEmbed = buildDefenceEmbed(interaction.user.id, updatedTeam);
      const newComponents = buildComponents(interaction.user.id);
      await interaction.editReply({ embeds: [newEmbed], components: newComponents });
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }),
};