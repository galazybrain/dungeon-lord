const { getHelpEmbed } = require('../utils/helpEmbed');

module.exports = {
  async execute(message, args) {
    await message.reply({ embeds: [getHelpEmbed()] });
  },
};