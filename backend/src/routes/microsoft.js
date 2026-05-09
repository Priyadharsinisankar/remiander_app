const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const {
  createAuthUrl,
  exchangeCodeForTokens,
  hasMicrosoftConfig,
  saveMicrosoftConnection,
  takeOAuthState,
} = require('../microsoftCalendar');

const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  res.json({
    configured: hasMicrosoftConfig(),
    connected: Boolean(req.user.microsoft_refresh_token),
    email: req.user.microsoft_calendar_email,
  });
});

router.get('/auth-url', requireAuth, (req, res, next) => {
  try {
    res.json({ url: createAuthUrl(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code, error, state } = req.query;

    if (error) {
      return res.redirect(`/?microsoft=error&message=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect('/?microsoft=error&message=Missing%20Microsoft%20authorization%20code');
    }

    const savedState = takeOAuthState(state);
    const tokens = await exchangeCodeForTokens(code);
    await saveMicrosoftConnection(savedState.userId, tokens);

    res.redirect('/?microsoft=connected');
  } catch (error) {
    res.redirect(`/?microsoft=error&message=${encodeURIComponent(error.message)}`);
  }
});

router.delete('/connection', requireAuth, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE users
       SET microsoft_refresh_token = NULL,
           microsoft_calendar_email = NULL
       WHERE id = $1`,
      [req.user.id]
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
