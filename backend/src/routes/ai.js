const express = require('express');
const { requireAuth } = require('../auth');
const db = require('../db');
const { draftReminderFromText, chatWithAI } = require('../nvidiaClient');

const router = express.Router();

router.get('/chat', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT role, content, created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 50',
      [req.user.id]
    );
    res.json({ history: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/chat', requireAuth, async (req, res, next) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 1. Fetch current reminders for context
    const remindersResult = await db.query(
      'SELECT title, description, start_time, reminder_type FROM reminders WHERE user_id = $1 AND is_sent = false ORDER BY start_time ASC',
      [req.user.id]
    );

    // 2. Fetch recent chat history
    const historyResult = await db.query(
      'SELECT role, content FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [req.user.id]
    );
    const history = historyResult.rows.reverse();

    // 3. Prepare prompt
    const now = new Date().toISOString();
    const remindersContext = remindersResult.rows.length > 0
      ? remindersResult.rows.map(r => `- ${r.title} (${r.reminder_type}) at ${r.start_time}${r.description ? `: ${r.description}` : ''}`).join('\n')
      : 'No upcoming reminders.';

    const systemPrompt = `You are a helpful schedule assistant. Current time is ${now}.
The user's upcoming reminders:
${remindersContext}

Help the user manage their time, answer questions about their schedule, and suggest additions if they seem overwhelmed.
Be concise and friendly.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message }
    ];

    // 4. Call AI
    const responseText = await chatWithAI(messages);

    // 5. Save message and response
    await db.query(
      'INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3), ($1, $4, $5)',
      [req.user.id, 'user', message, 'assistant', responseText]
    );

    res.json({ response: responseText });
  } catch (error) {
    next(error);
  }
});

router.post('/reminder-draft', requireAuth, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const draft = await draftReminderFromText(text);
    res.json({ draft });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
