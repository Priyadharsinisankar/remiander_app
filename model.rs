use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "reminder_status", rename_all = "lowercase")]
pub enum ReminderStatus {
    Pending,
    Completed,
    Cancelled,
    Snoozed,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "reminder_priority", rename_all = "lowercase")]
pub enum ReminderPriority {
    Low,
    Medium,
    High,
    Urgent,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Reminder {
    pub id: Uuid,
    pub user_id: i64, // Telegram user ID
    pub title: String,
    pub description: Option<String>,
    pub reminder_time: DateTime<Utc>,
    pub status: ReminderStatus,
    pub priority: ReminderPriority,
    pub is_recurring: bool,
    pub recurrence_pattern: Option<String>, // "daily", "weekly", "monthly"
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub chat_id: i64,
    pub message_id: Option<i32>,
    pub ai_generated: bool,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReminder {
    pub title: String,
    pub description: Option<String>,
    pub reminder_time: DateTime<Utc>,
    pub priority: Option<ReminderPriority>,
    pub is_recurring: Option<bool>,
    pub recurrence_pattern: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateReminder {
    pub title: Option<String>,
    pub description: Option<String>,
    pub reminder_time: Option<DateTime<Utc>>,
    pub status: Option<ReminderStatus>,
    pub priority: Option<ReminderPriority>,
    pub is_recurring: Option<bool>,
    pub recurrence_pattern: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIRequest {
    pub message: String,
    pub user_id: i64,
    pub context: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIResponse {
    pub response: String,
    pub extracted_reminder: Option<ParsedReminder>,
    pub intent: AIIntent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AIIntent {
    CreateReminder,
    ListReminders,
    UpdateReminder,
    DeleteReminder,
    GeneralChat,
    Help,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedReminder {
    pub title: String,
    pub description: Option<String>,
    pub reminder_time: DateTime<Utc>,
    pub priority: ReminderPriority,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub user_id: i64,
    pub timezone: String,
    pub notification_enabled: bool,
    pub ai_assistant_enabled: bool,
    pub default_priority: ReminderPriority,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub data: Option<T>,
    pub message: String,
    pub error: Option<String>,
}
