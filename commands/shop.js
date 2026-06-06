const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const {
  getOrCreatePlayer,
  updatePlayer,
  getMinionQuantity,
  setMinionQuantity,
  hasUpgrade,
  purchaseUpgrade,
  db,
  recalcDefenceHp,
  getDefenceHp,
  attemptArmySalveHeal,
} = require('../db/database');

const { MINIONS, getMinionCost, getAvailableMinions } = require('../data/minions');
const { UPGRADES, getAvailableUpgrades } = require('../data/upgrades');
const { safeCommand } = require('../utils/safeCommand');

function formatNumber(n) {
  if (n === null || n === undefined) return '?';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function getMinionBulkCost(minionDef, startOwned, qty) {
  if (minionDef.currency === 'blood') {
    return { souls: 0, blood: minionDef.bloodCost * qty };
  }
  let total = 0;
  for (let i = 0; i < qty; i++) {
    total += getMinionCost(minionDef.id, startOwned + i);
  }
  return { souls: total, blood: 0 };
}

function computeMaxQty(player, minionDef, startOwned) {
  if (minionDef.currency === 'blood') {
    return Math.max(0, Math.floor(player.blood / minionDef.bloodCost));
  }
  let remaining = player.souls;
  let count = 0;
  while (count < 9999) {
    const next = getMinionCost(minionDef.id, startOwned + count);
    if (remaining < next) break;
    remaining -= next;
    count++;
  }
  return count;
}

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

// ─── Purchase logic (returns result, never replies directly) ─────────────────

async function executeMinionPurchase(userId, guildId, minionId, qty) {
  const player = getOrCreatePlayer(userId, guildId);
  const minionDef = MINIONS[minionId];
  if (!minionDef) return { success: false, error: 'Unknown minion.' };
  if (minionDef.unlockLevel > player.dungeon_level) return { success: false, error: `Requires dungeon level ${minionDef.unlockLevel}.` };
  if (minionDef.minAscension && player.ascension < minionDef.minAscension) return { success: false, error: `Requires ascension ${minionDef.minAscension}.` };

  const owned = getMinionQuantity(userId, minionId);
  const resolvedQty = qty === 'max' ? computeMaxQty(player, minionDef, owned) : Number(qty);
  if (!resolvedQty || resolvedQty < 1) return { success: false, error: `Can't afford even one ${minionDef.name}.` };

  const { souls: totalSoulsCost, blood: totalBloodCost } = getMinionBulkCost(minionDef, owned, resolvedQty);
  if (minionDef.currency === 'blood') {
    if (player.blood < totalBloodCost) return { success: false, error: `Not enough blood. Need ${formatNumber(totalBloodCost)} 🩸.` };
    updatePlayer(userId, guildId, { blood: player.blood - totalBloodCost });
  } else {
    if (player.souls < totalSoulsCost) return { success: false, error: `Not enough souls. Need ${formatNumber(totalSoulsCost)} 💀.` };
    updatePlayer(userId, guildId, { souls: player.souls - totalSoulsCost });
  }

  setMinionQuantity(userId, minionId, owned + resolvedQty);
  await recalcSoulsPerMin(userId, guildId);

  // Defence prompt check
  const allMinions = db.prepare('SELECT SUM(quantity) as total FROM player_minions WHERE user_id = ?').get(userId);
  const hasSeenPrompt = db.prepare("SELECT 1 FROM player_upgrades WHERE user_id = ? AND upgrade_id = 'defence_prompted'").get(userId);
  let showDefencePrompt = false;
  if ((allMinions?.total ?? 0) >= 6 && !hasSeenPrompt) {
    db.prepare("INSERT OR IGNORE INTO player_upgrades (user_id, upgrade_id, purchased) VALUES (?, 'defence_prompted', 1)").run(userId);
    showDefencePrompt = true;
  }
  return {
    success: true,
    minionName: minionDef.name,
    minionEmoji: minionDef.emoji,
    newOwned: owned + resolvedQty,
    resolvedQty,
    showDefencePrompt,
  };
}

async function executeUpgradePurchase(userId, guildId, upgradeId) {
  const player = getOrCreatePlayer(userId, guildId);
  const upgradeDef = UPGRADES[upgradeId];
  if (!upgradeDef) return { success: false, error: 'Unknown upgrade.' };
  if (hasUpgrade(userId, upgradeId)) return { success: false, error: `You already own ${upgradeDef.name}.` };

  let cost = upgradeDef.cost;
  if (cost === null || cost === undefined) return { success: false, error: 'Upgrade cost error.' };
  if (player.souls < cost) return { success: false, error: `Not enough souls. Need ${formatNumber(cost)} 💀.` };

  updatePlayer(userId, guildId, { souls: player.souls - cost });
  purchaseUpgrade(userId, upgradeId);

  // Special effect for army_salve is handled automatically in raid.js (auto-heal)
  // War room and sacrificial altar have no immediate effect; they are passive or unlock commands.
  return { success: true, upgradeName: upgradeDef.name, upgradeEmoji: upgradeDef.emoji };
}

// ─── Embeds ───────────────────────────────────────────────────────────────────

function buildMinionEmbed(player, ownedMap) {
  const available = getAvailableMinions(player.dungeon_level, player.ascension);
  const embed = new EmbedBuilder()
    .setTitle('🏪 Dark Market — Minions')
    .setColor(0x8B0000)
    .setFooter({ text: `Level ${player.dungeon_level}  •  Ascension ${player.ascension}` });
  if (!available.length) return embed.setDescription('No minions available.');
  const tiers = {};
  for (const m of available) (tiers[m.tier] ||= []).push(m);
  const tierLabels = { 1: 'Tier I', 2: 'Tier II', 3: 'Tier III', 4: 'Tier IV' };
  for (const [tier, minions] of Object.entries(tiers)) {
    const lines = minions.map(m => {
      const owned = ownedMap[m.id] ?? 0;
      const singleCost = m.currency === 'blood' ? `${formatNumber(m.bloodCost)} 🩸` : `${formatNumber(getMinionCost(m.id, owned))} 💀`;
      return `${m.emoji} **${m.name}** — owned: ${owned}\n↳ +${formatNumber(m.soulsPerMin)} souls/min | ${singleCost}`;
    });
    embed.addFields({ name: tierLabels[tier] || `Tier ${tier}`, value: lines.join('\n\n') });
  }
  embed.addFields({
    name: '💰 Your Balance',
    value: `💀 ${formatNumber(player.souls)}  •  🩸 ${formatNumber(player.blood)}`,
    inline: false,
  });
  return embed;
}

function buildUpgradeEmbed(player, purchasedSet) {
  const available = (getAvailableUpgrades(player.dungeon_level, player.ascension) || []).filter(u => !purchasedSet.has(u.id));
  const embed = new EmbedBuilder()
    .setTitle('🏪 Dark Market — Upgrades')
    .setColor(0x4B0082)
    .setFooter({ text: `Level ${player.dungeon_level}  •  Ascension ${player.ascension}` });
  if (!available.length) {
    embed.setDescription('No upgrades available or all are purchased.');
    return embed;
  }
  const lines = available.map(u => {
    const costDisplay = `${formatNumber(u.cost)} souls`;
    return `${u.emoji} **${u.name}** — ${costDisplay}\n↳ ${u.description}`;
  });
  embed.setDescription(lines.join('\n\n'));
  embed.addFields({
    name: '💰 Your Balance',
    value: `💀 ${formatNumber(player.souls)}  •  🩸 ${formatNumber(player.blood)}`,
    inline: false,
  });
  return embed;
}

// ─── Shop View (handles all interactions) ───────────────────────────────────

class ShopView {
  constructor(interaction) {
    this.interaction = interaction;
    this.userId = interaction.user.id;
    this.guildId = interaction.guildId;
    this.currentTab = 'minions';
    this.selectedMinionId = null;
    this.selectedUpgradeId = null;
  }

  async getFreshData() {
    const player = getOrCreatePlayer(this.userId, this.guildId);
    const minionRows = db.prepare('SELECT minion_id, quantity FROM player_minions WHERE user_id = ?').all(this.userId);
    const upgradeRows = db.prepare('SELECT upgrade_id FROM player_upgrades WHERE user_id = ? AND purchased = 1').all(this.userId);
    const ownedMap = Object.fromEntries(minionRows.map(r => [r.minion_id, r.quantity]));
    const purchasedSet = new Set(upgradeRows.map(r => r.upgrade_id));
    return { player, ownedMap, purchasedSet };
  }

  async buildComponents() {
    const { player, ownedMap, purchasedSet } = await this.getFreshData();
    const rows = [];

    // Tab row
    const tabRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tab_minions')
        .setLabel('👺 Minions')
        .setStyle(this.currentTab === 'minions' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tab_upgrades')
        .setLabel('⚗️ Upgrades')
        .setStyle(this.currentTab === 'upgrades' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
    rows.push(tabRow);

    if (this.currentTab === 'minions') {
      const available = getAvailableMinions(player.dungeon_level, player.ascension);
      if (available.length) {
        const select = new StringSelectMenuBuilder()
          .setCustomId('select_minion')
          .setPlaceholder('Choose a minion...')
          .addOptions(
            available.map(m => {
              const owned = ownedMap[m.id] ?? 0;
              const cost = m.currency === 'blood' ? `${formatNumber(m.bloodCost)} 🩸` : `${formatNumber(getMinionCost(m.id, owned))} 💀`;
              return new StringSelectMenuOptionBuilder()
                .setLabel(`${m.name} (owned: ${owned})`)
                .setDescription(`Cost: ${cost}`)
                .setEmoji(m.emoji)
                .setValue(m.id);
            })
          );
        rows.push(new ActionRowBuilder().addComponents(select));
      }
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy_minion').setLabel('🛒 Buy Selected Minion').setStyle(ButtonStyle.Success)
      ));
    } else {
      const available = (getAvailableUpgrades(player.dungeon_level, player.ascension) || []).filter(u => !purchasedSet.has(u.id));
      if (available.length) {
        const select = new StringSelectMenuBuilder()
          .setCustomId('select_upgrade')
          .setPlaceholder('Choose an upgrade...')
          .addOptions(
            available.map(u => {
              const costDesc = `${formatNumber(u.cost)} souls`;
              return new StringSelectMenuOptionBuilder()
                .setLabel(u.name)
                .setDescription(costDesc)
                .setEmoji(u.emoji)
                .setValue(u.id);
            })
          );
        rows.push(new ActionRowBuilder().addComponents(select));
      }
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy_upgrade').setLabel('⚡ Purchase Upgrade').setStyle(ButtonStyle.Success)
      ));
    }
    return rows;
  }

  async buildEmbed() {
    const { player, ownedMap, purchasedSet } = await this.getFreshData();
    if (this.currentTab === 'minions') return buildMinionEmbed(player, ownedMap);
    else return buildUpgradeEmbed(player, purchasedSet);
  }

  async refresh() {
    const embed = await this.buildEmbed();
    const components = await this.buildComponents();
    await this.interaction.editReply({ embeds: [embed], components }).catch(() => {});
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Purchase minions and upgrades.'),

  execute: safeCommand(async (interaction) => {
    const view = new ShopView(interaction);
    await interaction.editReply({
      embeds: [await view.buildEmbed()],
      components: await view.buildComponents(),
      flags: 64, // ephemeral
    });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === view.userId,
      time: 120000,
    });

    collector.on('collect', async i => {
      try {
        // Tab switching
        if (i.customId === 'tab_minions') {
          view.currentTab = 'minions';
          await i.update({ embeds: [await view.buildEmbed()], components: await view.buildComponents() });
          return;
        }
        if (i.customId === 'tab_upgrades') {
          view.currentTab = 'upgrades';
          await i.update({ embeds: [await view.buildEmbed()], components: await view.buildComponents() });
          return;
        }

        // Select minion
        if (i.customId === 'select_minion') {
          view.selectedMinionId = i.values[0];
          await i.deferUpdate();
          return;
        }
        // Select upgrade
        if (i.customId === 'select_upgrade') {
          view.selectedUpgradeId = i.values[0];
          await i.deferUpdate();
          return;
        }

        // Buy minion (with modal)
        if (i.customId === 'buy_minion') {
          if (!view.selectedMinionId) {
            await i.reply({ content: '❌ Select a minion first.', ephemeral: true });
            return;
          }
          const minionDef = MINIONS[view.selectedMinionId];
          if (!minionDef) {
            await i.reply({ content: '❌ Invalid minion.', ephemeral: true });
            return;
          }
          const modal = new ModalBuilder()
            .setCustomId('minion_qty_modal')
            .setTitle(`Buy ${minionDef.name}`)
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('qty')
                  .setLabel('Quantity (or "max")')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('e.g., 1, 10, max')
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          const modalSubmit = await i.awaitModalSubmit({ time: 60000 });
          const qtyInput = modalSubmit.fields.getTextInputValue('qty');
          const result = await executeMinionPurchase(view.userId, view.guildId, view.selectedMinionId, qtyInput);
          if (!result.success) {
            await modalSubmit.reply({ content: `❌ ${result.error}`, ephemeral: true });
          } else {
            await modalSubmit.reply({ content: `✅ Purchased **${result.minionEmoji} ${result.minionName}** ×${result.resolvedQty}! Now owned: **${result.newOwned}**.`, ephemeral: true });
            await view.refresh();
            if (result.showDefencePrompt) {
              await modalSubmit.followUp({ content: `🛡️ **Your dungeon is vulnerable!** Use **/defence** to assign minions!`, ephemeral: true });
            }
          }
          return;
        }

        // Buy upgrade (no modal)
        if (i.customId === 'buy_upgrade') {
          if (!view.selectedUpgradeId) {
            await i.reply({ content: '❌ Select an upgrade first.', ephemeral: true });
            return;
          }
          const result = await executeUpgradePurchase(view.userId, view.guildId, view.selectedUpgradeId);
          if (!result.success) {
            await i.reply({ content: `❌ ${result.error}`, ephemeral: true });
          } else {
            await i.reply({ content: `✅ Purchased upgrade **${result.upgradeEmoji} ${result.upgradeName}**!`, ephemeral: true });
            await view.refresh();
          }
          return;
        }
      } catch (err) {
        console.error('Shop interaction error:', err);
        if (!i.replied && !i.deferred) {
          await i.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
        }
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }),
};