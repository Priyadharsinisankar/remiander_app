const crypto = require('crypto');
const db = require('./db');

const MICROSOFT_GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me';
const MICROSOFT_GRAPH_EVENTS_URL = 'https://graph.microsoft.com/v1.0/me/events';
const MICROSOFT_STATE_TTL_MS = 10 * 60 * 1000;
const MICROSOFT_SCOPES = ['openid', 'email', 'offline_access', 'User.Read', 'Calendars.ReadWrite'].join(' ');

const oauthStates = new Map();

function getTenantId() {
  return process.env.MS_TENANT_ID || 'common';
}

function getBaseUrl() {
  return process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

function getRedirectUri() {
  return process.env.MS_REDIRECT_URI || `${getBaseUrl()}/api/microsoft/callback`;
}

function getAuthorizeUrl() {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/authorize`;
}

function getTokenUrl() {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/token`;
}

function getTimezone() {
  return process.env.MS_CALENDAR_TIMEZONE || process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Kolkata';
}

function hasMicrosoftConfig() {
  return Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_TENANT_ID);
}

function assertMicrosoftConfig() {
  if (!hasMicrosoftConfig()) {
    const error = new Error('Microsoft Calendar is not configured. Add MS_CLIENT_ID, MS_TENANT_ID, and MS_CLIENT_SECRET to .env.');
    error.status = 503;
    throw error;
  }
}

function createAuthUrl(userId) {
  assertMicrosoftConfig();

  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, {
    userId,
    expiresAt: Date.now() + MICROSOFT_STATE_TTL_MS,
  });

  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    response_mode: 'query',
    scope: MICROSOFT_SCOPES,
    state,
  });

  return `${getAuthorizeUrl()}?${params.toString()}`;
}

function takeOAuthState(state) {
  const savedState = oauthStates.get(state);
  oauthStates.delete(state);

  if (!savedState || savedState.expiresAt < Date.now()) {
    const error = new Error('Microsoft sign-in expired. Please try again.');
    error.status = 400;
    throw error;
  }

  return savedState;
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.error_description || body.error || 'Microsoft request failed');
    error.status = response.status;
    throw error;
  }

  return body;
}

async function exchangeCodeForTokens(code) {
  assertMicrosoftConfig();

  return postForm(getTokenUrl(), {
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
    scope: MICROSOFT_SCOPES,
  });
}

async function refreshAccessToken(refreshToken) {
  assertMicrosoftConfig();

  const tokens = await postForm(getTokenUrl(), {
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    redirect_uri: getRedirectUri(),
    scope: MICROSOFT_SCOPES,
  });

  return tokens.access_token;
}

async function getMicrosoftEmail(accessToken) {
  const response = await fetch(MICROSOFT_GRAPH_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const profile = await response.json();
  return profile.mail || profile.userPrincipalName || null;
}

async function saveMicrosoftConnection(userId, tokens) {
  if (!tokens.refresh_token) {
    const error = new Error('Microsoft did not return a refresh token. Reconnect and approve offline access.');
    error.status = 400;
    throw error;
  }

  const email = await getMicrosoftEmail(tokens.access_token);

  await db.query(
    `UPDATE users
     SET microsoft_refresh_token = $1,
         microsoft_calendar_email = $2
     WHERE id = $3`,
    [tokens.refresh_token, email, userId]
  );
}

function toGraphDateTime(value) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getEventEndTime(startTime, endTime) {
  if (endTime) {
    return endTime;
  }

  return new Date(new Date(startTime).getTime() + 30 * 60 * 1000).toISOString();
}

async function createOutlookEvent(user, reminder) {
  if (!user.microsoft_refresh_token) {
    const error = new Error('Connect Outlook Calendar before enabling it on a reminder.');
    error.status = 400;
    throw error;
  }

  const accessToken = await refreshAccessToken(user.microsoft_refresh_token);
  const response = await fetch(MICROSOFT_GRAPH_EVENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: reminder.title,
      body: {
        contentType: 'Text',
        content: reminder.description || '',
      },
      start: {
        dateTime: toGraphDateTime(reminder.start_time),
        timeZone: getTimezone(),
      },
      end: {
        dateTime: toGraphDateTime(getEventEndTime(reminder.start_time, reminder.end_time)),
        timeZone: getTimezone(),
      },
      reminderMinutesBeforeStart: Math.max(0, Number(reminder.remind_before_minutes || 0)),
      isReminderOn: Number(reminder.remind_before_minutes || 0) > 0,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.error?.message || 'Could not create Outlook Calendar event');
    error.status = response.status;
    throw error;
  }

  await db.query('UPDATE reminders SET outlook_event_id = $1 WHERE id = $2', [body.id, reminder.id]);

  return body;
}

async function updateOutlookEvent(user, reminder) {
  if (!user.microsoft_refresh_token || !reminder.outlook_event_id) {
    return null;
  }

  const accessToken = await refreshAccessToken(user.microsoft_refresh_token);
  const response = await fetch(`${MICROSOFT_GRAPH_EVENTS_URL}/${reminder.outlook_event_id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: reminder.title,
      body: {
        contentType: 'Text',
        content: reminder.description || '',
      },
      start: {
        dateTime: toGraphDateTime(reminder.start_time),
        timeZone: getTimezone(),
      },
      end: {
        dateTime: toGraphDateTime(getEventEndTime(reminder.start_time, reminder.end_time)),
        timeZone: getTimezone(),
      },
      reminderMinutesBeforeStart: Math.max(0, Number(reminder.remind_before_minutes || 0)),
      isReminderOn: Number(reminder.remind_before_minutes || 0) > 0,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error?.message || 'Could not update Outlook Calendar event');
    error.status = response.status;
    throw error;
  }

  return await response.json();
}

async function deleteOutlookEvent(user, outlookEventId) {
  if (!user.microsoft_refresh_token || !outlookEventId) {
    return null;
  }

  const accessToken = await refreshAccessToken(user.microsoft_refresh_token);
  const response = await fetch(`${MICROSOFT_GRAPH_EVENTS_URL}/${outlookEventId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error?.message || 'Could not delete Outlook Calendar event');
    error.status = response.status;
    throw error;
  }

  return true;
}

module.exports = {
  createAuthUrl,
  createOutlookEvent,
  updateOutlookEvent,
  deleteOutlookEvent,
  exchangeCodeForTokens,
  hasMicrosoftConfig,
  saveMicrosoftConnection,
  takeOAuthState,
};
