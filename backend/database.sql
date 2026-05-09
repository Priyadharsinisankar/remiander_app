CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    password_hash TEXT,
    auth_token TEXT UNIQUE,
    google_refresh_token TEXT,
    google_calendar_email VARCHAR(200),
    microsoft_refresh_token TEXT,
    microsoft_calendar_email VARCHAR(200),
    telegram_chat_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    reminder_type VARCHAR(20) DEFAULT 'task',
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    remind_before_minutes INTEGER DEFAULT 30,
    send_email BOOLEAN DEFAULT false,
    send_telegram BOOLEAN DEFAULT true,
    send_calendar BOOLEAN DEFAULT true,
    send_outlook BOOLEAN DEFAULT false,
    send_linear BOOLEAN DEFAULT false,
    send_jira BOOLEAN DEFAULT false,
    is_sent BOOLEAN DEFAULT false,
    calendar_event_id VARCHAR(200),
    outlook_event_id VARCHAR(200),
    linear_issue_id VARCHAR(100),
    linear_issue_url TEXT,
    jira_issue_key VARCHAR(100),
    jira_issue_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_start_time ON reminders(start_time);
CREATE INDEX IF NOT EXISTS idx_reminders_pending
    ON reminders(start_time, is_sent)
    WHERE is_sent = false;
