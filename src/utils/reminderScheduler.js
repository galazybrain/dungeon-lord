const fs = require('fs');
const path = require('path');

const REMINDERS_FILE = path.join(__dirname, '../../data/reminders.json');

function loadReminders() {
  if (!fs.existsSync(REMINDERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
}

function saveReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

function startReminderScheduler(client) {
  setInterval(async () => {
    const reminders = loadReminders();
    const now = new Date();
    let changed = false;

    for (const reminder of reminders) {
      if (reminder.fired) continue;
      if (new Date(reminder.fireAt) <= now) {
        try {
          const user = await client.users.fetch(reminder.userId);
          await user.send(`⏰ **Reminder!**\n> ${reminder.message}`);
        } catch (e) {
          console.error(`Failed to DM reminder to ${reminder.userId}:`, e.message);
        }
        reminder.fired = true;
        changed = true;
      }
    }

    if (changed) saveReminders(reminders);
  }, 60 * 1000);
}

module.exports = { startReminderScheduler };
