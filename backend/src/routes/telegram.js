const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { sendTelegramMessage } = require('../telegramClient');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  });
});

router.post('/test', requireAuth, async (req, res, next) => {
  try {
    if (!req.user.telegram_chat_id) {
      return res.status(400).json({ error: 'Add your Telegram chat id first' });
    }

    const message = await sendTelegramMessage(
      req.user.telegram_chat_id,
      `Hi ${req.user.name}, Telegram is connected to your reminder app.`
    );

    res.json({ ok: true, message });
  } catch (error) {
    next(error);
  }
});

router.post('/webhook', async (req, res, next) => {
  try {
    const message = req.body.message;

    if (!message || !message.chat || !message.text) {
      return res.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();

    if (text.startsWith('/start')) {
      await sendTelegramMessage(
        chatId,
        `Your chat id is ${chatId}. Add it to your reminder app profile to receive task messages.`
      );

      return res.json({
        ok: true,
        chat_id: chatId,
      });
    }

    const user = await db.query(
      'SELECT id, name FROM users WHERE telegram_chat_id = $1',
      [chatId]
    );

    if (user.rowCount === 0) {
      await sendTelegramMessage(
        chatId,
        'I do not know this chat yet. Send /start, then add the chat id to your reminder app profile.'
      );

      return res.json({ ok: true });
    }

    const result = await db.query(
      `INSERT INTO reminders (user_id, title, description, start_time, send_telegram)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', true)
       RETURNING *`,
      [user.rows[0].id, text, 'Created from Telegram']
    );

    await sendTelegramMessage(
      chatId,
      `Task created for one hour from now: ${result.rows[0].title}`
    );

    res.status(201).json({
      ok: true,
      reminder: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
