const { EmbedBuilder } = require('discord.js');

const COLORS = {
  default:   0x2b2d31,
  success:   0x57f287,
  warning:   0xfee75c,
  danger:    0xed4245,
  blood:     0x8b0000,
  souls:     0x9b59b6,
  legendary: 0xffaa00,
  epic:      0xaa44ff,
  rare:      0x4488ff,
};

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function createProgressBar(current, max, length = 10) {
  if (max <= 0) return '█'.repeat(length);
  const filled = Math.round((current / max) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

/**
 * Build the full dungeon embed (no tutorial).
 * @param {object} player - player object
 * @param {string} dungeonName - name of current dungeon level
 * @param {string} bossTitle - boss form name
 * @param {Array} topMinions - [{ name, emoji, quantity }] top 3
 * @param {number} currentHp - defence HP current
 * @param {number} maxHp - defence HP max
 * @param {object|null} nextLevel - { level, soulsRequired }
 */
function buildDungeonEmbed(player, dungeonName, bossTitle, topMinions, currentHp, maxHp, nextLevel) {
  // Level progress
  let progressText = '**MAX LEVEL**';
  let progressBar = '';
  if (nextLevel) {
    const current = player.lifetime_souls;
    const required = nextLevel.soulsRequired;
    const pct = Math.min(100, Math.floor((current / required) * 100));
    const bar = createProgressBar(current, required);
    progressText = `${bar} ${pct}%\n${formatNumber(current)} / ${formatNumber(required)} lifetime souls`;
  }

  // Top minions (limited to 3)
  const minionLines = topMinions.length
    ? topMinions.map(m => `${m.emoji} ${m.name} ×${m.quantity}`).join('\n')
    : 'None yet — visit `/shop`';

  // Defence HP bar
  const hpPercent = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;
  const hpBar = createProgressBar(currentHp, maxHp);
  const defenceValue = `${currentHp} / ${maxHp} HP (${hpPercent.toFixed(1)}%) ${hpBar}`;

  const embed = new EmbedBuilder()
    .setTitle(dungeonName)
    .setColor(COLORS.blood)
    .setDescription(bossTitle)
    .addFields(
      { name: '💀 Souls', value: `${formatNumber(player.souls)} stored\n+${formatNumber(player.souls_per_min)}/min`, inline: true },
      { name: '🩸 Blood', value: formatNumber(player.blood), inline: true },
      { name: `⬆️ Level ${player.dungeon_level} → ${nextLevel ? nextLevel.level : 'MAX'}`, value: progressText, inline: false },
      { name: '👹 Top Minions', value: minionLines, inline: true },
      { name: '🛡️ Defence HP Pool', value: defenceValue, inline: false }
    )
    .setFooter({ text: 'Use /collect to gather souls • /shop to upgrade' })
    .setTimestamp();

  return embed;
}

module.exports = {
  COLORS,
  formatNumber,
  createProgressBar,
  buildDungeonEmbed,
};