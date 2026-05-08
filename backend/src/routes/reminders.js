const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getSchedulerStatus, runReminderCheck } = require('../scheduler');

const router = express.Router();

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
    } = req.body;

    if (!title || !start_time) {
      return res.status(400).json({ error: 'title and start_time are required' });
    }

    const result = await db.query(
      `INSERT INTO reminders (
         user_id, title, description, reminder_type, start_time, end_time,
         remind_before_minutes, send_email, send_telegram, send_calendar
       )
       VALUES ($1, $2, $3, COALESCE($4, 'task'), $5, $6, COALESCE($7, 30),
               COALESCE($8, false), COALESCE($9, true), COALESCE($10, true))
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
      ]
    );

    res.status(201).json({ reminder: result.rows[0] });
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
      is_sent,
      calendar_event_id,
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
           is_sent = COALESCE($10, is_sent),
           calendar_event_id = COALESCE($11, calendar_event_id)
       WHERE id = $12
         AND user_id = $13
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
        is_sent,
        calendar_event_id,
        req.params.id,
        req.user.id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json(result.rows[0]);
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

    res.json({ message: 'Reminder deleted', reminder: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
