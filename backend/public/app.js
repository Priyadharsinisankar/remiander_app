const apiStatus = document.querySelector('#apiStatus');
const authPanel = document.querySelector('#authPanel');
const taskPanel = document.querySelector('#taskPanel');
const authForm = document.querySelector('#authForm');
const authMessage = document.querySelector('#authMessage');
const loginTab = document.querySelector('#loginTab');
const signupTab = document.querySelector('#signupTab');
const nameField = document.querySelector('#nameField');
const authSubmit = document.querySelector('#authSubmit');
const authPassword = document.querySelector('#authPassword');
const reminderForm = document.querySelector('#reminderForm');
const remindersEl = document.querySelector('#reminders');
const refreshBtn = document.querySelector('#refreshBtn');
const logoutBtn = document.querySelector('#logoutBtn');
const profileForm = document.querySelector('#profileForm');
const profileMessage = document.querySelector('#profileMessage');
const taskMessage = document.querySelector('#taskMessage');
const testTelegramBtn = document.querySelector('#testTelegramBtn');
const telegramStatus = document.querySelector('#telegramStatus');

let authMode = 'login';
let currentUser = null;

function getToken() {
  return localStorage.getItem('reminder_token');
}

function setSession(token, user) {
  localStorage.setItem('reminder_token', token);
  localStorage.setItem('reminder_user', JSON.stringify(user));
  currentUser = user;
}

function clearSession() {
  localStorage.removeItem('reminder_token');
  localStorage.removeItem('reminder_user');
  currentUser = null;
}

async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

function toDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return entities[character];
  });
}

function setMessage(element, text, type = '') {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';

  loginTab.classList.toggle('active', !isSignup);
  signupTab.classList.toggle('active', isSignup);
  nameField.classList.toggle('hidden', !isSignup);
  authSubmit.textContent = isSignup ? 'Create account' : 'Login';
  authPassword.autocomplete = isSignup ? 'new-password' : 'current-password';
  authMessage.textContent = '';
}

function renderShell() {
  if (!currentUser) {
    authPanel.classList.remove('hidden');
    taskPanel.classList.add('hidden');
    return;
  }

  authPanel.classList.add('hidden');
  taskPanel.classList.remove('hidden');
  document.querySelector('#userName').textContent = currentUser.name;
  document.querySelector('#userEmail').textContent = currentUser.email;
  document.querySelector('#telegramChatId').value = currentUser.telegram_chat_id || '';
}

async function loadReminders() {
  const reminders = await api('/reminders');
  remindersEl.innerHTML = '';

  if (reminders.length === 0) {
    remindersEl.innerHTML = '<p class="empty">No tasks yet.</p>';
    return;
  }

  reminders.forEach((reminder) => {
    const card = document.createElement('article');
    card.className = 'reminder-card';
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(reminder.title)}</h3>
        ${reminder.description ? `<p>${escapeHtml(reminder.description)}</p>` : ''}
      </div>
      <div class="reminder-meta">
        <span class="chip">${formatDate(reminder.start_time)}</span>
        <span class="chip">${reminder.remind_before_minutes} min before</span>
        ${reminder.send_telegram ? '<span class="chip">Telegram</span>' : ''}
        ${reminder.send_calendar ? '<span class="chip">Calendar</span>' : ''}
      </div>
    `;

    remindersEl.appendChild(card);
  });
}

async function checkHealth() {
  try {
    await api('/health');
    apiStatus.textContent = 'API online';
    apiStatus.className = 'status ok';
  } catch (error) {
    apiStatus.textContent = 'API offline';
    apiStatus.className = 'status error';
  }
}

async function checkTelegram() {
  try {
    const status = await api('/telegram/status');
    telegramStatus.textContent = status.configured ? 'Telegram ready' : 'No bot token';
    telegramStatus.className = status.configured ? 'status ok' : 'status error';
  } catch (error) {
    telegramStatus.textContent = 'Telegram unknown';
    telegramStatus.className = 'status error';
  }
}

async function restoreSession() {
  const savedUser = localStorage.getItem('reminder_user');

  if (!getToken() || !savedUser) {
    renderShell();
    return;
  }

  try {
    const { user } = await api('/users/me');
    currentUser = user;
    localStorage.setItem('reminder_user', JSON.stringify(user));
    renderShell();
    await Promise.all([loadReminders(), checkTelegram()]);
  } catch (error) {
    clearSession();
    renderShell();
  }
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(authMessage, '');

  const payload = {
    email: document.querySelector('#authEmail').value,
    password: document.querySelector('#authPassword').value,
  };

  if (authMode === 'signup') {
    payload.name = document.querySelector('#authName').value;
  }

  try {
    const result = await api(`/users/${authMode}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    setSession(result.token, result.user);
    authForm.reset();
    renderShell();
    await Promise.all([loadReminders(), checkTelegram()]);
  } catch (error) {
    setMessage(authMessage, error.message, 'error');
  }
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(profileMessage, '');

  try {
    const { user } = await api('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({
        telegram_chat_id: document.querySelector('#telegramChatId').value,
      }),
    });

    currentUser = user;
    localStorage.setItem('reminder_user', JSON.stringify(user));
    renderShell();
    setMessage(profileMessage, 'Telegram chat id saved.', 'ok');
  } catch (error) {
    setMessage(profileMessage, error.message, 'error');
  }
});

testTelegramBtn.addEventListener('click', async () => {
  setMessage(profileMessage, '');

  try {
    await api('/telegram/test', { method: 'POST' });
    setMessage(profileMessage, 'Test message sent.', 'ok');
  } catch (error) {
    setMessage(profileMessage, error.message, 'error');
  }
});

reminderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(taskMessage, '');

  const payload = {
    title: document.querySelector('#title').value,
    description: document.querySelector('#description').value,
    start_time: document.querySelector('#start_time').value,
    remind_before_minutes: Number(document.querySelector('#remind_before_minutes').value || 0),
    send_email: document.querySelector('#send_email').checked,
    send_telegram: document.querySelector('#send_telegram').checked,
    send_calendar: document.querySelector('#send_calendar').checked,
  };

  try {
    const result = await api('/reminders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    reminderForm.reset();
    document.querySelector('#start_time').value = toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000));
    document.querySelector('#send_telegram').checked = true;
    setMessage(taskMessage, 'Task added. Telegram will remind you automatically.', 'ok');
    await loadReminders();
  } catch (error) {
    setMessage(taskMessage, error.message, 'error');
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/users/logout', { method: 'POST' });
  } catch (error) {
    // Local logout still clears a stale or invalid browser session.
  }

  clearSession();
  renderShell();
});

refreshBtn.addEventListener('click', () => {
  loadReminders().catch((error) => {
    remindersEl.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  });
});

loginTab.addEventListener('click', () => setAuthMode('login'));
signupTab.addEventListener('click', () => setAuthMode('signup'));

document.querySelector('#start_time').value = toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000));

checkHealth();
restoreSession();
