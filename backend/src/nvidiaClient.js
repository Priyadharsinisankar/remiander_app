const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

function hasNvidiaConfig() {
  return Boolean(process.env.NVIDIA_API_KEY);
}

function getNvidiaBaseUrl() {
  return (process.env.NVIDIA_BASE_URL || NVIDIA_BASE_URL).replace(/\/+$/, '');
}

function getNvidiaModel() {
  return process.env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct';
}

function extractJson(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const match = trimmed.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error('AI response did not include a reminder JSON object');
  }

  return JSON.parse(match[0]);
}

function normalizeDraft(draft) {
  return {
    title: String(draft.title || '').slice(0, 200),
    description: String(draft.description || ''),
    reminder_type: draft.reminder_type || 'task',
    start_time: draft.start_time || '',
    remind_before_minutes: Number.isFinite(Number(draft.remind_before_minutes))
      ? Number(draft.remind_before_minutes)
      : 30,
  };
}

async function draftReminderFromText(text) {
  if (!hasNvidiaConfig()) {
    const error = new Error('NVIDIA AI is not configured. Add NVIDIA_API_KEY to .env.');
    error.status = 400;
    throw error;
  }

  const now = new Date();
  const response = await fetch(`${getNvidiaBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getNvidiaModel(),
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content:
            'Extract a reminder draft as strict JSON only. Use local timezone Asia/Kolkata. Fields: title, description, reminder_type, start_time, remind_before_minutes. reminder_type must be one of task, meeting, deadline, birthday, event. start_time must be YYYY-MM-DDTHH:mm.',
        },
        {
          role: 'user',
          content: `Current date/time: ${now.toISOString()}\nReminder text: ${text}`,
        },
      ],
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.error?.message || 'NVIDIA AI request failed');
    error.status = response.status;
    throw error;
  }

  return normalizeDraft(extractJson(body.choices?.[0]?.message?.content || ''));
}

async function chatWithAI(messages) {
  if (!hasNvidiaConfig()) {
    const error = new Error('NVIDIA AI is not configured. Add NVIDIA_API_KEY to .env.');
    error.status = 400;
    throw error;
  }

  const response = await fetch(`${getNvidiaBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getNvidiaModel(),
      temperature: 0.5,
      max_tokens: 1000,
      messages: messages,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.error?.message || 'NVIDIA AI request failed');
    error.status = response.status;
    throw error;
  }

  return body.choices?.[0]?.message?.content || '';
}

module.exports = {
  chatWithAI,
  draftReminderFromText,
  hasNvidiaConfig,
};
