const db = require('./db');
const { sendTelegramMessage } = require('./telegramClient');

let isRunning = false;
let schedulerHandle = null;
let lastRunAt = null;
let lastSentCount = 0;
let lastError = null;

function formatReminderTime(value) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function buildReminderMessage(reminder) {
  return `Reminder: ${reminder.title}\nWhen: ${formatReminderTime(reminder.start_time)}${
    reminder.description ? `\n\n${reminder.description}` : ''
  }`;
}

async function getDueTelegramReminders() {
  const result = await db.query(
    `SELECT r.*, u.name AS user_name, u.telegram_chat_id
     FROM reminders r
     INNER JOIN users u ON u.id = r.user_id
     WHERE r.is_sent = false
       AND r.send_telegram = true
       AND u.telegram_chat_id IS NOT NULL
       AND u.telegram_chat_id <> ''
       AND r.start_time <= NOW() + (r.remind_before_minutes || ' minutes')::interval
     ORDER BY r.start_time ASC
     LIMIT 25`
  );

  return result.rows;
}

async function markReminderSent(id) {
  await db.query('UPDATE reminders SET is_sent = true WHERE id = $1', [id]);
}

async function runReminderCheck() {
  if (isRunning) {
    return { skipped: true, reason: 'already running' };
  }

  isRunning = true;
  lastRunAt = new Date();
  lastSentCount = 0;
  lastError = null;

  try {
    const reminders = await getDueTelegramReminders();
    console.log(`Reminder scheduler found ${reminders.length} due Telegram task(s)`);

    for (const reminder of reminders) {
      try {
        await sendTelegramMessage(reminder.telegram_chat_id, buildReminderMessage(reminder));
        await markReminderSent(reminder.id);
        lastSentCount += 1;
        console.log(`Telegram reminder sent for task ${reminder.id}`);
      } catch (error) {
        lastError = error.message;
        console.error(`Failed to send Telegram reminder ${reminder.id}:`, error.message);
      }
    }

    return {
      checked: reminders.length,
      sent: lastSentCount,
      last_error: lastError,
    };
  } catch (error) {
    lastError = error.message;
    throw error;
  } finally {
    isRunning = false;
  }
}

function startReminderScheduler() {
  const pollSeconds = Number(process.env.REMINDER_POLL_SECONDS || 30);
  const pollMs = Math.max(pollSeconds, 5) * 1000;

  if (schedulerHandle) {
    return schedulerHandle;
  }

  schedulerHandle = setInterval(() => {
    runReminderCheck().catch((error) => {
      console.error('Reminder scheduler failed:', error);
    });
  }, pollMs);

  runReminderCheck().catch((error) => {
    console.error('Reminder scheduler failed:', error);
  });

  console.log(`Reminder scheduler running every ${pollMs / 1000} seconds`);
  return schedulerHandle;
}

function getSchedulerStatus() {
  return {
    running: Boolean(schedulerHandle),
    checking_now: isRunning,
    poll_seconds: Number(process.env.REMINDER_POLL_SECONDS || 30),
    last_run_at: lastRunAt,
    last_sent_count: lastSentCount,
    last_error: lastError,
  };
}

module.exports = {
  getSchedulerStatus,
  runReminderCheck,
  startReminderScheduler,
};
