const { EmbedBuilder } = require('discord.js');
function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n?.toLocaleString() ?? '0';
}
const COLORS = {
  blood: 0x8B0000,
};
/**
 * @param {object} player
 * @param {string} dungeonName
 * @param {string} bossTitle
 * @param {Array} topMinions - [{ name, emoji, quantity }] top 3
 * @param {number} currentHp
 * @param {number} maxHp
 * @param {object|null} nextLevel
 * @param {Array} defenceTeam - [{ minion_id, quantity }] from player_defence
 */
function buildDungeonEmbed(player, dungeonName, bossTitle, topMinions, currentHp, maxHp, nextLevel, defenceTeam = []) {
  // Level progress
  let progressText = '**MAX LEVEL**';
  if (nextLevel) {
    const current = player.lifetime_souls;
    const required = nextLevel.soulsRequired;
    const pct = Math.min(100, Math.floor((current / required) * 100));
    const bar = createProgressBar(current, required);
    progressText = `${bar} ${pct}%\n${formatNumber(current)} / ${formatNumber(required)} lifetime souls`;
  }
function createProgressBar(current, max, length = 10) {
  const filled = Math.round((current / max) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

  // Top minions
  const minionLines = topMinions.length
    ? topMinions.map(m => `${m.emoji} ${m.name} ×${m.quantity}`).join('\n')
    : 'None yet — visit `/shop`';

  // Defence HP bar
  const hpPercent = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;
  const hpBar = createProgressBar(currentHp, maxHp);
  const defenceValue = `${currentHp} / ${maxHp} HP (${hpPercent.toFixed(1)}%) ${hpBar}`;

  // Defending vs collecting
  const defendingLines = defenceTeam.length
    ? defenceTeam.map(d => {
        const { MINIONS } = require('../data/minions');
        const def = MINIONS[d.minion_id];
        if (!def) return null;
        const total = d.quantity; // defending
        // Find how many the player owns total
        return `${def.emoji} ${def.name}: **${total}** defending`;
      }).filter(Boolean).join('\n')
    : 'No minions assigned to defence.';

  const embed = new EmbedBuilder()
    .setTitle(dungeonName)
    .setColor(COLORS.blood)
    .setDescription(bossTitle)
    .addFields(
      { name: '💀 Souls', value: `${formatNumber(player.souls)} stored\n+${formatNumber(player.souls_per_min)}/min`, inline: true },
      { name: '🩸 Blood', value: formatNumber(player.blood), inline: true },
      { name: `⬆️ Level ${player.dungeon_level} → ${nextLevel ? nextLevel.level : 'MAX'}`, value: progressText, inline: false },
      { name: '👹 Top Minions', value: minionLines, inline: true },
      { name: '🛡️ Defence HP Pool', value: defenceValue, inline: false },
      { name: '⚔️ Defending Minions', value: defendingLines, inline: false },
    )
    .setFooter({ text: 'Use /collect to gather souls • /shop to upgrade' })
    .setTimestamp();

  return embed;
}
function buildCollectEmbed(soulsGained, totalSouls, soulsPerMin) {
  return new EmbedBuilder()
    .setTitle('💀 Souls Collected')
    .setColor(COLORS.blood)
    .setDescription(`**+${formatNumber(soulsGained)} souls** collected\nYou now hold **${formatNumber(totalSouls)} souls**`)
    .setFooter({ text: `+${formatNumber(soulsPerMin)}/min passive income` })
    .setTimestamp();
}
function buildAchievementEmbed(achievement) {
  return new EmbedBuilder()
    .setTitle('🏆 Achievement Unlocked!')
    .setColor(COLORS.blood)
    .setDescription(`**${achievement.name}**\n${achievement.description}`)
    .setFooter({ text: achievement.reward ? `Reward: +${formatNumber(achievement.reward.souls || 0)} souls` : 'Keep it up!' })
    .setTimestamp();
}
module.exports = { buildDungeonEmbed, buildCollectEmbed, buildAchievementEmbed };