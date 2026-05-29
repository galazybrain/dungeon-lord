const { SlashCommandBuilder } = require('discord.js');
const { getOrCreatePlayer, updatePlayer, unlockAchievement, hasAchievement } = require('../db/database');
const { db } = require('../db/database');
const { collectSouls, recalculateSoulsPerMin, isNightTime, formatSouls } = require('../utils/souls');
const { buildCollectEmbed, buildAchievementEmbed } = require('../utils/embeds');
const { checkAchievements, ACHIEVEMENTS } = require('../data/achievements');
const { safeCommand } = require('../utils/safeCommand');


// Minimum time between collects (in minutes) — prevents spam clicking
const COLLECT_COOLDOWN_MINUTES = 1;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collect')
    .setDescription('Gather the souls your minions have harvested.'),

  async execute(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guildId;

    const player = getOrCreatePlayer(userId, guildId);

    // ── Cooldown Check ──────────────────────────────────────────────────────
    const lastCollected = new Date(player.last_collected).getTime();
    const minutesSince  = (Date.now() - lastCollected) / 1000 / 60;

    if (minutesSince < COLLECT_COOLDOWN_MINUTES) {
      const secsLeft = Math.ceil((COLLECT_COOLDOWN_MINUTES - minutesSince) * 60);
      return await interaction.editReply({
        content: `⏳ Your minions are still working — collect again in **${secsLeft}s**`,
        ephemeral: true,
      });
    }

    // ── Calculate Souls ─────────────────────────────────────────────────────
    const { earned, cappedBy } = collectSouls(player);
    const night = isNightTime();

    // Apply temp multiplier if active
    let finalEarned = earned;
    if (player.temp_multiplier > 1 && player.temp_multiplier_until) {
      if (new Date(player.temp_multiplier_until) > new Date()) {
        finalEarned = Math.floor(earned * player.temp_multiplier);
      }
    }

    // Apply relic bonus (permanent stacking from drop events)
    if (player.relic_bonus > 0) {
      finalEarned = Math.floor(finalEarned * (1 + player.relic_bonus));
    }

    // ── Save to DB ──────────────────────────────────────────────────────────
    const newSouls         = (player.souls || 0) + finalEarned;
    const newLifetimeSouls = (player.lifetime_souls || 0) + finalEarned;

    updatePlayer(userId, guildId, {
      souls:          newSouls,
      lifetime_souls: newLifetimeSouls,
      last_collected: new Date().toISOString(),
    });

    

    // ── Achievement Checks ──────────────────────────────────────────────────
    const freshPlayer = getOrCreatePlayer(userId, guildId);
    const alreadyUnlocked = db.prepare(
      'SELECT achievement_id FROM achievements WHERE user_id = ?'
    ).all(userId).map(r => r.achievement_id);

    const newlyUnlocked = checkAchievements(freshPlayer, {}, alreadyUnlocked);

    for (const achId of newlyUnlocked) {
      unlockAchievement(userId, achId);
      const ach = ACHIEVEMENTS[achId];
      if (ach?.reward) {
        updatePlayer(userId, guildId, {
          souls: (freshPlayer.souls || 0) + (ach.reward.souls || 0),
          blood: (freshPlayer.blood || 0) + (ach.reward.blood || 0),
        });
      }
    }

    // ── Reply ───────────────────────────────────────────────────────────────
    // Main collect result — public
    const embed = buildCollectEmbed(player, finalEarned, cappedBy, night);
    await interaction.editReply({ embeds: [embed] });

    
    

    // Achievement unlocks — ephemeral
    for (const achId of newlyUnlocked) {
      const ach = ACHIEVEMENTS[achId];
      if (ach) {
        await interaction.followUp({
          embeds: [buildAchievementEmbed(ach)],
          ephemeral: true,
        });
      }
    }
  },
};