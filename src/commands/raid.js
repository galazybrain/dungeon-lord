const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const {
  getOrCreatePlayer,
  updatePlayer,
  logRaid,
  db,
  recalcDefenceHp,
  getDefenceHp,
  damageDefenceHp,
  destroyDefenceHp,
  attemptArmySalveHeal
} = require('../db/database');

const { MINIONS } = require('../data/minions');
const { calcPower, resolveRaid, getRaidCooldownUntil, TIER_POWER } = require('../data/combat');
const { hasUpgrade } = require('../db/database');

const MIN_ATTACK_MINIONS = 10;

async function recalcSoulsPerMin(userId, guildId) {
  const rows = db.prepare('SELECT minion_id, quantity FROM player_minions WHERE user_id = ?').all(userId);
  let total = 0;
  for (const row of rows) {
    const minion = MINIONS[row.minion_id];
    if (minion) total += minion.soulsPerMin * row.quantity;
  }
  updatePlayer(userId, guildId, { souls_per_min: total });
  return total;
}

function getDefenceTeam(userId) {
  return db.prepare('SELECT minion_id, quantity FROM player_defence WHERE user_id = ?').all(userId);
}

function getTotalOwned(userId) {
  const row = db.prepare('SELECT SUM(quantity) as total FROM player_minions WHERE user_id = ?').get(userId);
  return row?.total ?? 0;
}

function buildTeamEmbed(attackTeam, target, userId) {
  const totalSent = attackTeam.reduce((sum, [, qty]) => sum + qty, 0);
  const lines = attackTeam.map(([id, qty]) => {
    const def = MINIONS[id];
    return def ? `${def.emoji} ${def.name} ×${qty}` : null;
  }).filter(Boolean);

  let warRoomBonus = 1.0;
  if (hasUpgrade(userId, 'war_room')) {
    warRoomBonus = 1.10;
  }

  const power = calcPower(
    attackTeam.map(([id, qty]) => ({ minion_id: id, quantity: qty })),
    MINIONS
  ) * warRoomBonus;

  return new EmbedBuilder()
    .setTitle(`⚔️ Building Raid Party against ${target.username}`)
    .setColor(0xFF4500)
    .setDescription(lines.length ? lines.join('\n') : '*No minions selected yet*')
    .addFields(
      { name: '📦 Total Minions', value: `${totalSent} / ${MIN_ATTACK_MINIONS}+ required`, inline: true },
      { name: '⚡ Current Power', value: `${power} CP`, inline: true }
    )
    .setFooter({ text: 'Select a minion below to add specific quantity' });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Raid another player\'s dungeon to steal souls.')
    .addUserOption(opt => opt.setName('target').setDescription('The player to raid.').setRequired(true)),

  async execute(interaction) {
    const age = Date.now() - interaction.createdTimestamp;
    if (age > 2500) {
      console.warn(`[raid] Dropped stale interaction (${age}ms old)`);
      return;
    }

    await interaction.deferReply();

    const target = interaction.options.getUser('target');
    if (target.id === interaction.user.id) return interaction.editReply('❌ Cannot raid yourself.');
    if (target.bot) return interaction.editReply('❌ Cannot raid a bot.');

    const attacker = getOrCreatePlayer(interaction.user.id, interaction.guildId);
    if (attacker.raid_cooldown_until && new Date(attacker.raid_cooldown_until) > new Date()) {
      const remaining = Math.ceil((new Date(attacker.raid_cooldown_until) - Date.now()) / 60000);
      return interaction.editReply(`⏱️ Raid cooldown for **${remaining} more minutes**.`);
    }

    const totalOwned = getTotalOwned(interaction.user.id);
    if (totalOwned < MIN_ATTACK_MINIONS)
      return interaction.editReply(`❌ Need at least ${MIN_ATTACK_MINIONS} minions to raid. You have ${totalOwned}.`);

    const ownedRows = db.prepare('SELECT minion_id, quantity FROM player_minions WHERE user_id = ?').all(interaction.user.id);
    const ownedMap = Object.fromEntries(ownedRows.map(r => [r.minion_id, r.quantity]));

    const selectOptions = ownedRows.map(r => {
      const def = MINIONS[r.minion_id];
      if (!def) return null;
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${def.name} (owned: ${r.quantity})`)
        .setDescription(`Tier ${def.tier} • ${TIER_POWER[def.tier] || 1} CP each`)
        .setEmoji(def.emoji)
        .setValue(r.minion_id);
    }).filter(Boolean);

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('add_minion')
        .setPlaceholder('Select a minion type to add...')
        .addOptions(selectOptions)
    );

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_raid').setLabel('✅ Launch Raid').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('clear_team').setLabel('🗑️ Clear Team').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel_raid').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
    );

    let attackTeam = [];

    const reply = await interaction.editReply({
      embeds: [buildTeamEmbed(attackTeam, target, interaction.user.id)],
      components: [selectRow, actionRow]
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 180000
    });

    collector.on('collect', async i => {
      if (i.customId === 'add_minion') {
        const minionId = i.values[0];
        const def = MINIONS[minionId];
        if (!def) return i.reply({ content: '❌ Invalid minion.', ephemeral: true });

        const maxOwned = ownedMap[minionId] || 0;
        const alreadyInTeam = attackTeam.find(([id]) => id === minionId)?.[1] || 0;
        const available = maxOwned - alreadyInTeam;
        if (available <= 0) {
          return i.reply({ content: `❌ You have no more **${def.name}** to send.`, ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_${minionId}`)
          .setTitle(`Send ${def.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel(`Quantity (1-${available})`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter a number')
                .setRequired(true)
            )
          );
        await i.showModal(modal);

        try {
          const modalSubmit = await i.awaitModalSubmit({ time: 60000 });
          const qty = parseInt(modalSubmit.fields.getTextInputValue('quantity'), 10);
          if (isNaN(qty) || qty < 1 || qty > available) {
            return modalSubmit.reply({ content: `❌ Invalid quantity. Must be between 1 and ${available}.`, ephemeral: true });
          }
          const existing = attackTeam.find(([id]) => id === minionId);
          if (existing) existing[1] += qty;
          else attackTeam.push([minionId, qty]);
          await modalSubmit.update({
            embeds: [buildTeamEmbed(attackTeam, target, interaction.user.id)],
            components: [selectRow, actionRow]
          });
        } catch (err) {
          console.error('Modal error:', err);
          await i.followUp({ content: '⏱️ Modal timed out.', ephemeral: true }).catch(() => {});
        }
        return;
      }

      if (i.customId === 'clear_team') {
        attackTeam = [];
        await i.update({
          embeds: [buildTeamEmbed(attackTeam, target, interaction.user.id)],
          components: [selectRow, actionRow]
        });
        return;
      }

      if (i.customId === 'cancel_raid') {
        collector.stop('cancelled');
        await i.update({ content: '↩️ Raid cancelled.', embeds: [], components: [] });
        return;
      }

      if (i.customId === 'confirm_raid') {
        await i.deferUpdate();
        collector.stop('confirmed');

        const totalSent = attackTeam.reduce((sum, [, qty]) => sum + qty, 0);
        if (totalSent < MIN_ATTACK_MINIONS) {
          await i.followUp({ content: `❌ Need at least ${MIN_ATTACK_MINIONS} minions. Currently: ${totalSent}.`, ephemeral: true });
          return;
        }

        try {
          const defenceTeam = getDefenceTeam(target.id);
          const atkPower = calcPower(
            attackTeam.map(([id, qty]) => ({ minion_id: id, quantity: qty })),
            MINIONS
          );
          const defPowerRaw = calcPower(defenceTeam, MINIONS);

          const { current: defHpCurrent, max: defHpMax } = getDefenceHp(target.id);
          const hpPercent = defHpMax > 0 ? defHpCurrent / defHpMax : 0;
          const defPower = defPowerRaw * hpPercent;

          const atkCount = totalSent;
          const defCount = defenceTeam.reduce((s, d) => s + d.quantity, 0);

          const freshDefender = getOrCreatePlayer(target.id, interaction.guildId);
          const { attackerWon, soulsStolen, bloodReward, hpDamage } = resolveRaid(
            atkPower, defPower, atkCount, defCount, freshDefender.souls
          );

          updatePlayer(interaction.user.id, interaction.guildId, { raid_cooldown_until: getRaidCooldownUntil() });
          const freshAttacker = getOrCreatePlayer(interaction.user.id, interaction.guildId);

          if (attackerWon) {
            destroyDefenceHp(target.id);
            db.prepare('DELETE FROM player_defence WHERE user_id = ?').run(target.id);
            recalcDefenceHp(target.id, true);

            updatePlayer(interaction.user.id, interaction.guildId, {
              souls: freshAttacker.souls + soulsStolen,
              lifetime_souls: freshAttacker.lifetime_souls + soulsStolen,
              blood: freshAttacker.blood + bloodReward,
              raid_wins: freshAttacker.raid_wins + 1,
            });
            updatePlayer(target.id, interaction.guildId, {
              souls: Math.max(0, freshDefender.souls - soulsStolen),
              raid_losses: freshDefender.raid_losses + 1,
            });
            await recalcSoulsPerMin(interaction.user.id, interaction.guildId);
          } else {
            const newHp = damageDefenceHp(target.id, hpDamage);
            const { healed } = attemptArmySalveHeal(target.id);
            if (healed) {
              await interaction.channel.send({
                content: `<@${target.id}> 💉 **Army Salve** activated! Your defence team has been fully healed. Next use available in 7 days.`
              }).catch(() => {});
            }

            const updateMinion = db.prepare('UPDATE player_minions SET quantity = quantity - ? WHERE user_id = ? AND minion_id = ? AND quantity >= ?');
            const deleteDefence = db.prepare('DELETE FROM player_defence WHERE user_id = ? AND minion_id = ?');
            const transaction = db.transaction(() => {
              for (const [minionId, qty] of attackTeam) {
                updateMinion.run(qty, interaction.user.id, minionId, qty);
                deleteDefence.run(interaction.user.id, minionId);
              }
            });
            transaction();
            db.prepare('DELETE FROM player_minions WHERE user_id = ? AND quantity <= 0').run(interaction.user.id);
            await recalcSoulsPerMin(interaction.user.id, interaction.guildId);

            updatePlayer(interaction.user.id, interaction.guildId, {
              blood: freshAttacker.blood + bloodReward,
              raid_losses: freshAttacker.raid_losses + 1,
            });
            updatePlayer(target.id, interaction.guildId, {
              successful_defenses: freshDefender.successful_defenses + 1,
            });
          }

          logRaid(interaction.user.id, target.id, soulsStolen, attackerWon);

          const resultEmbed = new EmbedBuilder()
            .setColor(attackerWon ? 0x00FF00 : 0xFF0000)
            .setTitle(attackerWon ? '⚔️ Raid Successful!' : '💀 Raid Failed!')
            .setDescription(attackerWon
              ? `<@${interaction.user.id}> overpowered <@${target.id}>'s defences!`
              : `<@${target.id}>'s defenders repelled <@${interaction.user.id}>'s forces.`)
            .addFields(
              { name: '⚡ Attacker Power', value: `${atkPower} CP`, inline: true },
              { name: '🛡️ Defender Power', value: `${defPower} CP`, inline: true },
              { name: '\u200B', value: '\u200B', inline: true },
              attackerWon
                ? { name: '💀 Souls Stolen', value: `${soulsStolen.toLocaleString()}`, inline: true }
                : { name: '⚔️ Minions Lost', value: `${atkCount} sent minions`, inline: true },
              { name: '🩸 Blood Earned', value: `${bloodReward}`, inline: true }
            )
            .setFooter({ text: 'Raid cooldown: 2 hours' });

          await interaction.channel.send({ content: `<@${interaction.user.id}> <@${target.id}>`, embeds: [resultEmbed] });
          await i.editReply({ content: '✅ Raid complete! See result above.', embeds: [], components: [] });
        } catch (err) {
          console.error('Raid resolution error:', err);
          await i.editReply({ content: `❌ An error occurred: ${err.message || err}`, embeds: [], components: [] });
        }
      }
    });

    collector.on('end', (_, reason) => {
      if (!['confirmed', 'cancelled'].includes(reason)) {
        interaction.editReply({ content: '⏱️ Raid timed out.', embeds: [], components: [] }).catch(() => {});
      }
    });
  },
};