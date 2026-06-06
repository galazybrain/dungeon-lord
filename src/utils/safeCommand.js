// utils/safeCommand.js
/**
 * Wraps a command with automatic defer and error handling.
 * Always ensures the interaction is replied to.
 */
function safeCommand(executeFn) {
  return async (interaction) => {
    try {
      // Defer immediately (ephemeral so only the user sees loading)
      await interaction.deferReply({ ephemeral: false });
    } catch (deferError) {
      // If defer fails (e.g., interaction already replied), just log and continue
      console.warn(`Defer failed for ${interaction.commandName}:`, deferError.message);
      // Still try to run the command – it might use reply directly
    }

    try {
      await executeFn(interaction);
    } catch (error) {
      console.error(`Error in /${interaction.commandName}:`, error);
      // Try to send an error message – prefer editReply if deferred, else reply
      const errorMessage = `❌ ${error.message || 'Unknown error'}`;
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage, embeds: [] }).catch(() => {});
      } else if (!interaction.replied) {
        await interaction.reply({ content: errorMessage, ephemeral: false }).catch(() => {});
      }
    }
  };
}

module.exports = { safeCommand };