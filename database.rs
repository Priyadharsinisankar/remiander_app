use anyhow::Result;
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use uuid::Uuid;

use crate::models::{
    CreateReminder, Reminder, ReminderStatus, UpdateReminder, UserSettings,
};

pub type DbPool = Pool<Postgres>;

pub async fn create_pool(database_url: &str) -> Result<DbPool> {
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &DbPool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        
        CREATE TABLE IF NOT EXISTS reminders (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id BIGINT NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            reminder_time TIMESTAMPTZ NOT NULL,
            status reminder_status NOT NULL DEFAULT 'pending',
            priority reminder_priority NOT NULL DEFAULT 'medium',
            is_recurring BOOLEAN NOT NULL DEFAULT false,
            recurrence_pattern VARCHAR(50),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            chat_id BIGINT NOT NULL,
            message_id INTEGER,
            ai_generated BOOLEAN NOT NULL DEFAULT false,
            tags JSONB
        );

        CREATE TABLE IF NOT EXISTS user_settings (
            user_id BIGINT PRIMARY KEY,
            timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
            notification_enabled BOOLEAN NOT NULL DEFAULT true,
            ai_assistant_enabled BOOLEAN NOT NULL DEFAULT true,
            default_priority reminder_priority NOT NULL DEFAULT 'medium',
            language VARCHAR(10) NOT NULL DEFAULT 'en'
        );

        CREATE TABLE IF NOT EXISTS conversation_history (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id BIGINT NOT NULL,
            role VARCHAR(20) NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
        CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
        CREATE INDEX IF NOT EXISTS idx_reminders_reminder_time ON reminders(reminder_time);
        CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversation_history(user_id);
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

// Reminder CRUD Operations
pub async fn create_reminder(
    pool: &DbPool,
    user_id: i64,
    chat_id: i64,
    data: CreateReminder,
    ai_generated: bool,
) -> Result<Reminder> {
    let reminder = sqlx::query_as::<_, Reminder>(
        r#"
        INSERT INTO reminders (
            user_id, title, description, reminder_time, priority,
            is_recurring, recurrence_pattern, chat_id, ai_generated, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        "#,
    )
    .bind(user_id)
    .bind(&data.title)
    .bind(&data.description)
    .bind(data.reminder_time)
    .bind(data.priority.unwrap_or(crate::models::ReminderPriority::Medium))
    .bind(data.is_recurring.unwrap_or(false))
    .bind(&data.recurrence_pattern)
    .bind(chat_id)
    .bind(ai_generated)
    .bind(&data.tags.as_ref().map(|t| serde_json::to_value(t).ok()))
    .fetch_one(pool)
    .await?;

    Ok(reminder)
}

pub async fn get_reminder(pool: &DbPool, id: Uuid) -> Result<Option<Reminder>> {
    let reminder = sqlx::query_as::<_, Reminder>("SELECT * FROM reminders WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    Ok(reminder)
}

pub async fn get_user_reminders(
    pool: &DbPool,
    user_id: i64,
    status: Option<ReminderStatus>,
) -> Result<Vec<Reminder>> {
    let reminders = match status {
        Some(s) => {
            sqlx::query_as::<_, Reminder>(
                "SELECT * FROM reminders WHERE user_id = $1 AND status = $2 ORDER BY reminder_time ASC",
            )
            .bind(user_id)
            .bind(s)
            .fetch_all(pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, Reminder>(
                "SELECT * FROM reminders WHERE user_id = $1 ORDER BY reminder_time ASC",
            )
            .bind(user_id)
            .fetch_all(pool)
            .await?
        }
    };

    Ok(reminders)
}

pub async fn update_reminder(
    pool: &DbPool,
    id: Uuid,
    data: UpdateReminder,
) -> Result<Option<Reminder>> {
    let existing = get_reminder(pool, id).await?;
    
    if let Some(existing) = existing {
        let reminder = sqlx::query_as::<_, Reminder>(
            r#"
            UPDATE reminders SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                reminder_time = COALESCE($3, reminder_time),
                status = COALESCE($4, status),
                priority = COALESCE($5, priority),
                is_recurring = COALESCE($6, is_recurring),
                recurrence_pattern = COALESCE($7, recurrence_pattern),
                tags = COALESCE($8, tags),
                updated_at = NOW()
            WHERE id = $9
            RETURNING *
            "#,
        )
        .bind(data.title)
        .bind(data.description)
        .bind(data.reminder_time)
        .bind(data.status.map(|s| s as crate::models::ReminderStatus))
        .bind(data.priority.map(|p| p as crate::models::ReminderPriority))
        .bind(data.is_recurring)
        .bind(data.recurrence_pattern)
        .bind(data.tags.as_ref().map(|t| serde_json::to_value(t).ok()))
        .bind(id)
        .fetch_one(pool)
        .await?;

        Ok(Some(reminder))
    } else {
        Ok(None)
    }
}

pub async fn delete_reminder(pool: &DbPool, id: Uuid) -> Result<bool> {
    let result = sqlx::query("DELETE FROM reminders WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn get_pending_reminders(pool: &DbPool) -> Result<Vec<Reminder>> {
    let reminders = sqlx::query_as::<_, Reminder>(
        "SELECT * FROM reminders WHERE status = 'pending' AND reminder_time <= NOW() + INTERVAL '1 minute'",
    )
    .fetch_all(pool)
    .await?;

    Ok(reminders)
}

pub async fn mark_reminder_completed(pool: &DbPool, id: Uuid) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE reminders SET status = 'completed', updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn get_or_create_user_settings(
    pool: &DbPool,
    user_id: i64,
) -> Result<UserSettings> {
    let settings = sqlx::query_as::<_, UserSettings>(
        "SELECT * FROM user_settings WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    match settings {
        Some(s) => Ok(s),
        None => {
            let settings = sqlx::query_as::<_, UserSettings>(
                r#"
                INSERT INTO user_settings (user_id) VALUES ($1)
                RETURNING *
                "#,
            )
            .bind(user_id)
            .fetch_one(pool)
            .await?;
            Ok(settings)
        }
    }
}

pub async fn save_conversation(
    pool: &DbPool,
    user_id: i64,
    role: &str,
    content: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO conversation_history (user_id, role, content) VALUES ($1, $2, $3)",
    )
    .bind(user_id)
    .bind(role)
    .bind(content)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_conversation_history(
    pool: &DbPool,
    user_id: i64,
    limit: i32,
) -> Result<Vec<(String, String)>> {
    let history = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT role, content FROM conversation_history 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(history.into_iter().rev().collect())
}
