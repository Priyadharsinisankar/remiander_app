const { Client, Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
});

function getDatabaseName() {
  if (!connectionString) {
    return null;
  }

  const url = new URL(connectionString);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function getMaintenanceConnectionString() {
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
}

async function ensureDatabaseExists() {
  const databaseName = getDatabaseName();

  if (!connectionString || !databaseName || databaseName === 'postgres') {
    return;
  }

  const client = new Client({
    connectionString: getMaintenanceConnectionString(),
  });

  await client.connect();

  try {
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName]
    );

    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    }
  } finally {
    await client.end();
  }
}

async function initDatabase() {
  await ensureDatabaseExists();

  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS public;
    SET search_path TO public;

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE,
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

    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_token TEXT UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_email VARCHAR(200);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_calendar_email VARCHAR(200);
    ALTER TABLE reminders ADD COLUMN IF NOT EXISTS send_outlook BOOLEAN DEFAULT false;
    ALTER TABLE reminders ADD COLUMN IF NOT EXISTS send_linear BOOLEAN DEFAULT false;
    ALTER TABLE reminders ADD COLUMN IF NOT EXISTS send_jira BOOLEAN DEFAULT false;
    ALTER TABLE reminders ADD COLUMN IF NOT EXISTS outlook_event_id VARCHAR(200);
    ALTER TABLE reminders ADD COLUMN IF NOT EXISTS linear_issue_id VARCHAR(100);
    ALTER TABLE reminders ADD COLUMN IF NOT EXISTS linear_issue_url TEXT;
    ALTER TABLE reminders ADD COLUMN IF NOT EXISTS jira_issue_key VARCHAR(100);
    ALTER TABLE reminders ADD COLUMN IF NOT EXISTS jira_issue_url TEXT;

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
  `);
}

module.exports = {
  initDatabase,
  query: (text, params) => pool.query(text, params),
  pool,
};
