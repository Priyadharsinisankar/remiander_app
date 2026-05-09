const express = require('express');
const { requireAuth } = require('../auth');
const { hasGoogleConfig } = require('../googleCalendar');
const { hasJiraConfig, getMissingJiraConfig } = require('../jiraClient');
const { hasLinearConfig, getMissingLinearConfig } = require('../linearClient');
const { hasMicrosoftConfig } = require('../microsoftCalendar');
const { hasNvidiaConfig } = require('../nvidiaClient');

const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  res.json({
    telegram: {
      configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      connected: Boolean(req.user.telegram_chat_id),
    },
    google: {
      configured: hasGoogleConfig(),
      connected: Boolean(req.user.google_refresh_token),
      email: req.user.google_calendar_email,
    },
    microsoft: {
      configured: hasMicrosoftConfig(),
      connected: Boolean(req.user.microsoft_refresh_token),
      email: req.user.microsoft_calendar_email,
    },
    nvidia: {
      configured: hasNvidiaConfig(),
    },
    linear: {
      configured: hasLinearConfig(),
      missing: getMissingLinearConfig(),
    },
    jira: {
      configured: hasJiraConfig(),
      missing: getMissingJiraConfig(),
    },
  });
});

module.exports = router;
