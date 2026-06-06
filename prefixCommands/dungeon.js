const { getOrCreatePlayer, db } = require('../db/database');
const { getEligibleLevel, getLevelData } = require('../data/levels');
const { recalculateSoulsPerMin } = require('../utils/souls');
const { buildDungeonEmbed } = require('../utils/embeds');
const { STARTING_REWARD } = require('../data/events');
const { MINIONS } = require('../data/minions');
const { getBossForm } = require('../data/bossforms');
const { getNextLevel } = require('../data/levels');
const { getDefenceHp } = require('../db/database');

module.exports = {
  async execute(message, args) {
    const userId = message.author.id;
    const guildId = message.guild.id;

    const isNewPlayer = !db.prepare(
      'SELECT 1 FROM players WHERE user_id = ? AND guild_id = ?'
    ).get(userId, guildId);

    let player = getOrCreatePlayer(userId, guildId);

    if (isNewPlayer) {
      db.prepare(`
        UPDATE players SET souls = souls + ?, lifetime_souls = lifetime_souls + ?
        WHERE user_id = ? AND guild_id = ?
      `).run(STARTING_REWARD.souls, STARTING_REWARD.souls, userId, guildId);
      await message.reply(STARTING_REWARD.message);
      player = getOrCreatePlayer(userId, guildId);
    }

    const eligibleLevel = getEligibleLevel(player.lifetime_souls, player.ascension);
    if (eligibleLevel > player.dungeon_level) {
      db.prepare(`UPDATE players SET dungeon_level = ? WHERE user_id = ? AND guild_id = ?`)
        .run(eligibleLevel, userId, guildId);
      const updatedPlayer = getOrCreatePlayer(userId, guildId);
      const newSpm = recalculateSoulsPerMin(updatedPlayer);
      db.prepare(`UPDATE players SET souls_per_min = ? WHERE user_id = ? AND guild_id = ?`)
        .run(newSpm, userId, guildId);
      const newLevelData = getLevelData(eligibleLevel);
      await message.reply(`${newLevelData.emoji} **Dungeon upgraded to Level ${eligibleLevel}: ${newLevelData.name}!**\nUnlocked: ${newLevelData.unlocks.join(', ')}`);
      player = getOrCreatePlayer(userId, guildId);
    }

    const allMinions = db.prepare(`SELECT minion_id, quantity FROM player_minions WHERE user_id = ? AND quantity > 0`).all(userId);
    const minionsWithNames = allMinions.map(row => ({
      ...row,
      name: MINIONS[row.minion_id]?.name || row.minion_id,
      emoji: MINIONS[row.minion_id]?.emoji || '👹',
    }));
    const topMinions = [...minionsWithNames].sort((a, b) => b.quantity - a.quantity).slice(0, 3);

    const levelData = getLevelData(player.dungeon_level);
    const dungeonName = levelData.name || `Level ${player.dungeon_level}`;
    const bossForm = getBossForm(player.ascension, player.boss_form_skin);
    const bossTitle = bossForm.name;
    const { current: hpCurrent, max: hpMax } = getDefenceHp(userId);
    const nextLevel = getNextLevel(player.dungeon_level);

    const embed = buildDungeonEmbed(player, dungeonName, bossTitle, topMinions, hpCurrent, hpMax, nextLevel);
    await message.reply({ embeds: [embed] });
  },
};