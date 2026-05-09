const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const {
  createAuthUrl,
  exchangeCodeForTokens,
  hasGoogleConfig,
  saveGoogleConnection,
  takeOAuthState,
} = require('../googleCalendar');

const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  res.json({
    configured: hasGoogleConfig(),
    connected: Boolean(req.user.google_refresh_token),
    email: req.user.google_calendar_email,
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
      return res.redirect(`/?google=error&message=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect('/?google=error&message=Missing%20Google%20authorization%20code');
    }

    const savedState = takeOAuthState(state);
    const tokens = await exchangeCodeForTokens(code);
    await saveGoogleConnection(savedState.userId, tokens);

    res.redirect('/?google=connected');
  } catch (error) {
    res.redirect(`/?google=error&message=${encodeURIComponent(error.message)}`);
  }
});

router.delete('/connection', requireAuth, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE users
       SET google_refresh_token = NULL,
           google_calendar_email = NULL
       WHERE id = $1`,
      [req.user.id]
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
