const crypto = require('crypto');
const db = require('./db');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GOOGLE_CALENDAR_SCOPE = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

const oauthStates = new Map();

function getBaseUrl() {
  return process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

function getRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl()}/api/google/callback`;
}

function getTimezone() {
  return process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TZ || 'Asia/Kolkata';
}

function hasGoogleConfig() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function assertGoogleConfig() {
  if (!hasGoogleConfig()) {
    const error = new Error('Google Calendar is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.');
    error.status = 503;
    throw error;
  }
}

function createAuthUrl(userId) {
  assertGoogleConfig();

  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, {
    userId,
    expiresAt: Date.now() + GOOGLE_STATE_TTL_MS,
  });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function takeOAuthState(state) {
  const savedState = oauthStates.get(state);
  oauthStates.delete(state);

  if (!savedState || savedState.expiresAt < Date.now()) {
    const error = new Error('Google Calendar sign-in expired. Please try again.');
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
    const error = new Error(body.error_description || body.error || 'Google request failed');
    error.status = response.status;
    throw error;
  }

  return body;
}

async function exchangeCodeForTokens(code) {
  assertGoogleConfig();

  return postForm(GOOGLE_TOKEN_URL, {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
  });
}

async function refreshAccessToken(refreshToken) {
  assertGoogleConfig();

  const tokens = await postForm(GOOGLE_TOKEN_URL, {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  return tokens.access_token;
}

async function getGoogleEmail(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const profile = await response.json();
  return profile.email || null;
}

async function saveGoogleConnection(userId, tokens) {
  if (!tokens.refresh_token) {
    const error = new Error('Google did not return a refresh token. Reconnect and approve offline access.');
    error.status = 400;
    throw error;
  }

  const googleEmail = await getGoogleEmail(tokens.access_token);

  await db.query(
    `UPDATE users
     SET google_refresh_token = $1,
         google_calendar_email = $2
     WHERE id = $3`,
    [tokens.refresh_token, googleEmail, userId]
  );
}

function toCalendarDateTime(value) {
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

async function createCalendarEvent(user, reminder) {
  if (!user.google_refresh_token) {
    const error = new Error('Connect Google Calendar before enabling it on a reminder.');
    error.status = 400;
    throw error;
  }

  const accessToken = await refreshAccessToken(user.google_refresh_token);
  const reminderMinutes = Math.max(0, Number(reminder.remind_before_minutes || 0));
  const response = await fetch(GOOGLE_CALENDAR_EVENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: reminder.title,
      description: reminder.description || '',
      start: {
        dateTime: toCalendarDateTime(reminder.start_time),
        timeZone: getTimezone(),
      },
      end: {
        dateTime: toCalendarDateTime(getEventEndTime(reminder.start_time, reminder.end_time)),
        timeZone: getTimezone(),
      },
      reminders: {
        useDefault: false,
        overrides: reminderMinutes > 0 ? [{ method: 'popup', minutes: reminderMinutes }] : [],
      },
      extendedProperties: {
        private: {
          reminderAppId: String(reminder.id),
          reminderType: reminder.reminder_type || 'task',
        },
      },
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.error?.message || 'Could not create Google Calendar event');
    error.status = response.status;
    throw error;
  }

  await db.query('UPDATE reminders SET calendar_event_id = $1 WHERE id = $2', [body.id, reminder.id]);

  return body;
}

async function updateCalendarEvent(user, reminder) {
  if (!user.google_refresh_token || !reminder.calendar_event_id) {
    return null;
  }

  const accessToken = await refreshAccessToken(user.google_refresh_token);
  const reminderMinutes = Math.max(0, Number(reminder.remind_before_minutes || 0));
  const response = await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/${reminder.calendar_event_id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: reminder.title,
      description: reminder.description || '',
      start: {
        dateTime: toCalendarDateTime(reminder.start_time),
        timeZone: getTimezone(),
      },
      end: {
        dateTime: toCalendarDateTime(getEventEndTime(reminder.start_time, reminder.end_time)),
        timeZone: getTimezone(),
      },
      reminders: {
        useDefault: false,
        overrides: reminderMinutes > 0 ? [{ method: 'popup', minutes: reminderMinutes }] : [],
      },
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error?.message || 'Could not update Google Calendar event');
    error.status = response.status;
    throw error;
  }

  return await response.json();
}

async function deleteCalendarEvent(user, calendarEventId) {
  if (!user.google_refresh_token || !calendarEventId) {
    return null;
  }

  const accessToken = await refreshAccessToken(user.google_refresh_token);
  const response = await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/${calendarEventId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error?.message || 'Could not delete Google Calendar event');
    error.status = response.status;
    throw error;
  }

  return true;
}

module.exports = {
  createAuthUrl,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  exchangeCodeForTokens,
  hasGoogleConfig,
  saveGoogleConnection,
  takeOAuthState,
};
