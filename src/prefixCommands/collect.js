const { collectSouls } = require('../utils/souls');
const { updatePlayer, getOrCreatePlayer } = require('../db/database');

module.exports = {
  async execute(message, args) {
    const userId = message.author.id;
    const guildId = message.guild.id;
    const player = getOrCreatePlayer(userId, guildId);
    const { earned, cappedBy } = collectSouls(player);
    if (earned <= 0) {
      return message.reply('No souls to collect yet. Wait a few minutes.');
    }
    updatePlayer(userId, guildId, { souls: player.souls + earned });
    message.reply(`💰 You collected **${Math.floor(earned)} souls**!`);
  },
};