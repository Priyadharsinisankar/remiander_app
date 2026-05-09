const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = require('../googleCalendar');
const { createOutlookEvent, updateOutlookEvent, deleteOutlookEvent } = require('../microsoftCalendar');
const { createLinearIssue, updateLinearIssue, deleteLinearIssue, getMissingLinearConfig } = require('../linearClient');
const { createJiraIssue, updateJiraIssue, deleteJiraIssue, getMissingJiraConfig } = require('../jiraClient');
const { getSchedulerStatus, runReminderCheck } = require('../scheduler');

const router = express.Router();

async function syncReminderWithIntegrations(user, reminder) {
  const updates = {};
  const id = reminder.id;

  // Google Calendar
  if (reminder.send_calendar) {
    try {
      if (!reminder.calendar_event_id) {
        const event = await createCalendarEvent(user, reminder);
        updates.calendar_event_id = event.id;
      } else {
        await updateCalendarEvent(user, reminder);
      }
    } catch (err) {
      console.error('Google Calendar sync failed:', err.message);
    }
  }

  // Outlook
  if (reminder.send_outlook) {
    try {
      if (!reminder.outlook_event_id) {
        const event = await createOutlookEvent(user, reminder);
        updates.outlook_event_id = event.id;
      } else {
        await updateOutlookEvent(user, reminder);
      }
    } catch (err) {
      console.error('Outlook sync failed:', err.message);
    }
  }

  // Linear
  if (reminder.send_linear) {
    try {
      if (!reminder.linear_issue_id) {
        const issue = await createLinearIssue(reminder);
        updates.linear_issue_id = issue.id;
        updates.linear_issue_url = issue.url;
      } else {
        await updateLinearIssue(reminder);
      }
    } catch (err) {
      console.error('Linear sync failed:', err.message);
    }
  }

  // Jira
  if (reminder.send_jira) {
    try {
      if (!reminder.jira_issue_key) {
        const issue = await createJiraIssue(reminder);
        updates.jira_issue_key = issue.key;
        updates.jira_issue_url = issue.url;
      } else {
        await updateJiraIssue(reminder);
      }
    } catch (err) {
      console.error('Jira sync failed:', err.message);
    }
  }

  if (Object.keys(updates).length > 0) {
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    await db.query(`UPDATE reminders SET ${setClause} WHERE id = $${keys.length + 1}`, [...values, id]);
    Object.assign(reminder, updates);
  }
}

router.get('/due/pending', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.*, u.name AS user_name, u.email, u.telegram_chat_id
       FROM reminders r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.is_sent = false
         AND r.start_time <= NOW() + (r.remind_before_minutes || ' minutes')::interval
       ORDER BY r.start_time ASC`
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/scheduler/status', requireAuth, (req, res) => {
  res.json(getSchedulerStatus());
});

router.post('/scheduler/run', requireAuth, async (req, res, next) => {
  try {
    const result = await runReminderCheck();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.*, u.name AS user_name, u.email, u.telegram_chat_id
       FROM reminders r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.user_id = $1
       ORDER BY r.start_time ASC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.*, u.name AS user_name, u.email, u.telegram_chat_id
       FROM reminders r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.id = $1 AND r.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      title,
      description,
      reminder_type,
      start_time,
      end_time,
      remind_before_minutes,
      send_email,
      send_telegram,
      send_calendar,
      send_outlook,
      send_linear,
      send_jira,
    } = req.body;

    if (!title || !start_time) {
      return res.status(400).json({ error: 'title and start_time are required' });
    }

    if (send_calendar && !req.user.google_refresh_token) {
      return res.status(400).json({ error: 'Connect Google Calendar before enabling it on a reminder.' });
    }

    if (send_outlook && !req.user.microsoft_refresh_token) {
      return res.status(400).json({ error: 'Connect Outlook Calendar before enabling it on a reminder.' });
    }

    if (send_linear) {
      const missing = getMissingLinearConfig();

      if (missing.length > 0) {
        return res.status(400).json({ error: `Linear is missing: ${missing.join(', ')}` });
      }
    }

    if (send_jira) {
      const missing = getMissingJiraConfig();

      if (missing.length > 0) {
        return res.status(400).json({ error: `Jira is missing: ${missing.join(', ')}` });
      }
    }

    const result = await db.query(
      `INSERT INTO reminders (
         user_id, title, description, reminder_type, start_time, end_time,
         remind_before_minutes, send_email, send_telegram, send_calendar,
         send_outlook, send_linear, send_jira
       )
       VALUES (
         $1, $2, $3, COALESCE($4, 'task'), $5, $6, COALESCE($7, 30),
         COALESCE($8, false), COALESCE($9, true), COALESCE($10, true),
         COALESCE($11, false), COALESCE($12, false), COALESCE($13, false)
       )
       RETURNING *`,
      [
        req.user.id,
        title,
        description || null,
        reminder_type || null,
        start_time,
        end_time || null,
        remind_before_minutes,
        send_email,
        send_telegram,
        send_calendar,
        send_outlook,
        send_linear,
        send_jira,
      ]
    );

    const reminder = result.rows[0];

    await syncReminderWithIntegrations(req.user, reminder);

    res.status(201).json({ reminder });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const {
      title,
      description,
      reminder_type,
      start_time,
      end_time,
      remind_before_minutes,
      send_email,
      send_telegram,
      send_calendar,
      send_outlook,
      send_linear,
      send_jira,
      is_sent,
      calendar_event_id,
      outlook_event_id,
      linear_issue_id,
      linear_issue_url,
      jira_issue_key,
      jira_issue_url,
    } = req.body;

    const result = await db.query(
      `UPDATE reminders
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           reminder_type = COALESCE($3, reminder_type),
           start_time = COALESCE($4, start_time),
           end_time = COALESCE($5, end_time),
           remind_before_minutes = COALESCE($6, remind_before_minutes),
           send_email = COALESCE($7, send_email),
           send_telegram = COALESCE($8, send_telegram),
           send_calendar = COALESCE($9, send_calendar),
           send_outlook = COALESCE($10, send_outlook),
           send_linear = COALESCE($11, send_linear),
           send_jira = COALESCE($12, send_jira),
           is_sent = COALESCE($13, is_sent),
           calendar_event_id = COALESCE($14, calendar_event_id),
           outlook_event_id = COALESCE($15, outlook_event_id),
           linear_issue_id = COALESCE($16, linear_issue_id),
           linear_issue_url = COALESCE($17, linear_issue_url),
           jira_issue_key = COALESCE($18, jira_issue_key),
           jira_issue_url = COALESCE($19, jira_issue_url)
       WHERE id = $20
         AND user_id = $21
       RETURNING *`,
      [
        title,
        description,
        reminder_type,
        start_time,
        end_time,
        remind_before_minutes,
        send_email,
        send_telegram,
        send_calendar,
        send_outlook,
        send_linear,
        send_jira,
        is_sent,
        calendar_event_id,
        outlook_event_id,
        linear_issue_id,
        linear_issue_url,
        jira_issue_key,
        jira_issue_url,
        req.params.id,
        req.user.id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const reminder = result.rows[0];
    await syncReminderWithIntegrations(req.user, reminder);

    res.json({ reminder });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      'DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const reminder = result.rows[0];

    // Cleanup external resources
    try {
      if (reminder.calendar_event_id) await deleteCalendarEvent(req.user, reminder.calendar_event_id);
      if (reminder.outlook_event_id) await deleteOutlookEvent(req.user, reminder.outlook_event_id);
      if (reminder.linear_issue_id) await deleteLinearIssue(reminder.linear_issue_id);
      if (reminder.jira_issue_key) await deleteJiraIssue(reminder.jira_issue_key);
    } catch (err) {
      console.error('External resource cleanup failed:', err.message);
    }

    res.json({ message: 'Reminder deleted', reminder });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
