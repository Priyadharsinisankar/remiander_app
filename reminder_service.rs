use anyhow::Result;
use chrono::Utc;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{error, info};
use uuid::Uuid;

use crate::database::DbPool;
use crate::models::{Reminder, ReminderStatus};

pub struct ReminderService {
    pool: DbPool,
    telegram_bot: Arc<crate::telegram_bot::TelegramBot>,
}

impl ReminderService {
    pub fn new(pool: DbPool, telegram_bot: Arc<crate::telegram_bot::TelegramBot>) -> Self {
        Self { pool, telegram_bot }
    }

    pub async fn start_checker(self: Arc<Self>) {
        let mut ticker = interval(Duration::from_secs(30));

        loop {
            ticker.tick().await;
            
            if let Err(e) = self.check_and_send_reminders().await {
                error!("Error checking reminders: {}", e);
            }
        }
    }

    async fn check_and_send_reminders(&self) -> Result<()> {
        let pending = crate::database::get_pending_reminders(&self.pool).await?;

        for reminder in pending {
            if let Err(e) = self.send_reminder_notification(&reminder).await {
                error!(
                    "Failed to send reminder {} to user {}: {}",
                    reminder.id, reminder.user_id, e
                );
            } else {
                // Handle recurring reminders
                if reminder.is_recurring {
                    self.handle_recurring_reminder(&reminder).await?;
                } else {
                    crate::database::mark_reminder_completed(&self.pool, reminder.id).await?;
                }
            }
        }

        Ok(())
    }

    async fn send_reminder_notification(&self, reminder: &Reminder) -> Result<()> {
        let priority_emoji = match reminder.priority {
            crate::models::ReminderPriority::Urgent => "🚨",
            crate::models::ReminderPriority::High => "🔴",
            crate::models::ReminderPriority::Medium => "🟡",
            crate::models::ReminderPriority::Low => "🟢",
        };

        let mut message = format!(
            "{} **Reminder** {}\n\n📌 *{}*\n",
            priority_emoji, priority_emoji, reminder.title
        );

        if let Some(desc) = &reminder.description {
            message.push_str(&format!("📝 {}\n", desc));
        }

        message.push_str(&format!(
            "\n🕐 {}\n",
            reminder.reminder_time.format("%Y-%m-%d %H:%M UTC")
        ));

        if let Some(tags) = &reminder.tags {
            if !tags.is_empty() {
                message.push_str(&format!(
                    "\n🏷️ {}\n",
                    tags.iter().map(|t| format!("#{}", t)).collect::<Vec<_>>().join(" ")
                ));
            }
        }

        message.push_str(&format!(
            "\nℹ️ ID: `{}`\n✅ Reply 'done {}' to mark complete\n⏰ Reply 'snooze {}' to snooze for 1 hour",
            reminder.id, reminder.id, reminder.id
        ));

        self.telegram_bot
            .send_message(reminder.chat_id, &message)
            .await?;

        info!(
            "Sent reminder {} to user {}",
            reminder.id, reminder.user_id
        );

        Ok(())
    }

    async fn handle_recurring_reminder(&self, reminder: &Reminder) -> Result<()> {
        let new_time = match reminder.recurrence_pattern.as_deref() {
            Some("daily") => reminder.reminder_time + chrono::Duration::days(1),
            Some("weekly") => reminder.reminder_time + chrono::Duration::weeks(1),
            Some("monthly") => reminder.reminder_time + chrono::Duration::days(30),
            _ => reminder.reminder_time + chrono::Duration::days(1),
        };

        crate::database::update_reminder(
            &self.pool,
            reminder.id,
            crate::models::UpdateReminder {
                reminder_time: Some(new_time),
                status: Some(ReminderStatus::Pending),
                ..Default::default()
            },
        )
        .await?;

        Ok(())
    }

    pub async fn snooze_reminder(&self, reminder_id: Uuid) -> Result<bool> {
        let reminder = crate::database::get_reminder(&self.pool, reminder_id).await?;
        
        if let Some(reminder) = reminder {
            let new_time = Utc::now() + chrono::Duration::hours(1);
            crate::database::update_reminder(
                &self.pool,
                reminder_id,
                crate::models::UpdateReminder {
                    reminder_time: Some(new_time),
                    status: Some(ReminderStatus::Snoozed),
                    ..Default::default()
                },
            )
            .await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}
