const { EmbedBuilder } = require('discord.js');

function getHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('📜 Dungeon Lord – Player Guide')
    .setColor(0x2C2F33)
    .setDescription('Welcome, Dungeon Lord. Command your minions, raid rivals, and grow your power.')
    .addFields(
      { name: '🏰 **Core Commands**', value: [
        '`/collect` – Gather souls from your passive income (souls/min).',
        '`/shop` – Buy minions and permanent upgrades.',
        '`/dungeon` – View your level, stats, and defence HP.',
        '`/defence` – Assign minions to protect your dungeon.',
        '`/raid @target` – Attack another player to steal souls (minimum 10 minions).',
      ].join('\n'), inline: false },
      { name: '👺 **Minions**', value: [
        'Minions generate souls per minute. Higher tiers produce more.',
        'You can buy multiple copies of each minion. Each copy adds its production.',
        'Use `/defence` to assign minions to your defence team (max 10 types).',
        'Defence minions have a shared HP pool that decreases when you lose raids.',
      ].join('\n'), inline: false },
      { name: '⚔️ **Raiding**', value: [
        'Select up to 10 minion types, then enter a quantity per type (min 10 total).',
        'If you win: steal 20% of target’s souls, earn 1–5 blood, and destroy their defence HP (killing their defence minions).',
        'If you lose: you lose the minions you sent, but gain 1 blood and damage the defender’s HP pool.',
        'After a raid, you have a 2‑hour cooldown.',
      ].join('\n'), inline: false },
      { name: '🛡️ **Defence & HP**', value: [
        'Your defence team has a combined HP pool (100 HP per minion).',
        'When you lose a raid, your HP decreases, making you easier to attack.',
        'The **Army Salve** upgrade (5 000 souls) automatically heals your defence to full when HP drops below 25% (once per week).',
        'You can heal manually by purchasing the upgrade again (it has no effect if already owned).',
      ].join('\n'), inline: false },
      { name: '⚗️ **Upgrades**', value: [
        '• **Army Salve** – Auto‑heal defence HP (7‑day cooldown).',
        '• **War Room** – +10% raid attack power (passive).',
        '• **Sacrificial Altar** – Unlocks `/convert` (100 souls → 1 blood).',
      ].join('\n'), inline: false },
      { name: '🏆 **Progression**', value: [
        'Your dungeon level increases with lifetime souls earned.',
        'Higher levels unlock stronger minions and new upgrades.',
        'Use `/ascend` to prestige (reset level/souls but gain ascension bonuses).',
      ].join('\n'), inline: false }
    )
    .setFooter({ text: 'Remember: you can use /help anytime.' })
    .setTimestamp();
}

module.exports = { getHelpEmbed };