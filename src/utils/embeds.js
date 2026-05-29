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