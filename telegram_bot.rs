use anyhow::Result;
use std::sync::Arc;
use teloxide::{
    payloads::SendMessageSet,
    prelude::*,
    types::{InlineKeyboardButton, InlineKeyboardMarkup, ParseMode},
    Bot,
};
use tracing::info;
use uuid::Uuid;

use crate::ai_assistant::AIAssistant;
use crate::database::DbPool;
use crate::reminder_service::ReminderService;

pub struct TelegramBot {
    bot: Bot,
    pool: DbPool,
    ai_assistant: Arc<AIAssistant>,
    reminder_service: Arc<ReminderService>,
}

impl TelegramBot {
    pub fn new(
        token: &str,
        pool: DbPool,
        ai_assistant: Arc<AIAssistant>,
        reminder_service: Arc<ReminderService>,
    ) -> Self {
        Self {
            bot: Bot::new(token),
            pool,
            ai_assistant,
            reminder_service,
        }
    }

    pub async fn run(&self) {
        info!("Starting Telegram bot...");

        let handler = Update::filter_message()
            .branch(
                dptree::entry()
                    .filter_command::<BotCommand>()
                    .endpoint(Self::handle_command),
            )
            .branch(dptree::entry().endpoint(Self::handle_message));

        Dispatcher::builder(&self.bot, handler)
            .dependencies(dptree::deps![
                self.pool.clone(),
                self.ai_assistant.clone(),
                self.reminder_service.clone()
            ])
            .enable_ctrlc_handler()
            .build()
            .dispatch()
            .await;
    }

    async fn handle_command(
        bot: Bot,
        msg: Message,
        cmd: BotCommand,
        pool: DbPool,
        ai_assistant: Arc<AIAssistant>,
        reminder_service: Arc<ReminderService>,
    ) -> ResponseResult<()> {
        match cmd {
            BotCommand::Start => {
                let welcome = r#"
🤖 **Welcome to Reminder AI Bot!**

I'm your smart reminder assistant. I can help you:
• 📝 Create reminders using natural language
• 📋 View and manage your reminders
• 💬 Chat about productivity and time management

**Quick Start:**
Just tell me what you need to remember!
Example: "Remind me to call mom tomorrow at 3pm"

Type /help for more commands.
"#;
                bot.send_message(msg.chat.id, welcome)
                    .parse_mode(ParseMode::MarkdownV2)
                    .await?;
            }
            BotCommand::Help => {
                let ai_response = ai_assistant
                    .process_message(msg.from.unwrap().id.into(), "/help")
                    .await
                    .unwrap_or_else(|_| crate::models::AIResponse {
                        response: "Type /help for assistance".to_string(),
                        extracted_reminder: None,
                        intent: crate::models::AIIntent::Help,
                    });
                
                bot.send_message(msg.chat.id, ai_response.response)
                    .parse_mode(ParseMode::Markdown)
                    .await?;
            }
            BotCommand::List => {
                let user_id = msg.from.unwrap().id.into();
                let reminders = crate::database::get_user_reminders(&pool, user_id, None)
                    .await
                    .unwrap_or_default();

                if reminders.is_empty() {
                    bot.send_message(msg.chat.id, "📝 You don't have any reminders yet!")
                        .await?;
                } else {
                    let mut buttons: Vec<Vec<InlineKeyboardButton>> = vec![];
                    let mut text = String::from("📋 **Your Reminders:**\n\n");

                    for (i, r) in reminders.iter().take(10).enumerate() {
                        let status = match r.status {
                            crate::models::ReminderStatus::Pending => "⏳",
                            crate::models::ReminderStatus::Completed => "✅",
                            crate::models::ReminderStatus::Cancelled => "❌",
                            crate::models::ReminderStatus::Snoozed => "💤",
                        };

                        text.push_str(&format!(
                            "{} {} - {}\n",
                            status,
                            r.title,
                            r.reminder_time.format("%m/%d %H:%M")
                        ));

                        if r.status == crate::models::ReminderStatus::Pending {
                            buttons.push(vec![
                                InlineKeyboardButton::callback(
                                    "✅ Done",
                                    format!("done_{}", r.id),
                                ),
                                InlineKeyboardButton::callback(
                                    "⏰ Snooze",
                                    format!("snooze_{}", r.id),
                                ),
                                InlineKeyboardButton::callback(
                                    "❌ Delete",
                                    format!("delete_{}", r.id),
                                ),
                            ]);
                        }
                    }

                    if reminders.len() > 10 {
                        text.push_str(&format!("\n...and {} more", reminders.len() - 10));
                    }

                    let keyboard = if buttons.is_empty() {
                        None
                    } else {
                        Some(InlineKeyboardMarkup::new(buttons))
                    };

                    bot.send_message(msg.chat.id, text)
                        .parse_mode(ParseMode::Markdown)
                        .reply_markup(keyboard)
                        .await?;
                }
            }
            BotCommand::Settings => {
                let keyboard = InlineKeyboardMarkup::new(vec![
                    vec![
                        InlineKeyboardButton::callback("🔔 Notifications", "toggle_notif"),
                        InlineKeyboardButton::callback("🤖 AI Assistant", "toggle_ai"),
                    ],
                    vec![
                        InlineKeyboardButton::callback("⏰ Timezone", "set_timezone"),
                        InlineKeyboardButton::callback("🎯 Default Priority", "set_priority"),
                    ],
                ]);

                bot.send_message(msg.chat.id, "⚙️ **Settings**\n\nSelect an option to configure:")
                    .parse_mode(ParseMode::Markdown)
                    .reply_markup(keyboard)
                    .await?;
            }
            _ => {}
        }

        Ok(())
    }

    async fn handle_message(
        bot: Bot,
        msg: Message,
        pool: DbPool,
        ai_assistant: Arc<AIAssistant>,
        reminder_service: Arc<ReminderService>,
    ) -> ResponseResult<()> {
        let text = msg.text().unwrap_or("");
        let user_id = msg.from.unwrap().id.into();

        // Handle quick actions (done, snooze)
        if text.starts_with("done ") || text.starts_with("snooze ") {
            let parts: Vec<&str> = text.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(id) = Uuid::parse_str(parts[1]) {
                    if text.starts_with("done ") {
                        crate::database::mark_reminder_completed(&pool, id).await?;
                        bot.send_message(msg.chat.id, "✅ Reminder marked as done!")
                            .await?;
                    } else {
                        reminder_service.snooze_reminder(id).await?;
                        bot.send_message(msg.chat.id, "⏰ Reminder snoozed for 1 hour!")
                            .await?;
                    }
                    return Ok(());
                }
            }
        }

        // Process with AI
        let typing = bot.send_chat_action(msg.chat.id, teloxide::types::ChatAction::Typing);
        let ai_result = ai_assistant.process_message(user_id, text);

        let ((), result) = tokio::join!(typing, ai_result);

        match result {
            Ok(ai_response) => {
                // If a reminder was extracted, create it
                if let Some(parsed) = ai_response.extracted_reminder {
                    let create_data = crate::models::CreateReminder {
                        title: parsed.title,
                        description: parsed.description,
                        reminder_time: parsed.reminder_time,
                        priority: Some(parsed.priority),
                        is_recurring: None,
                        recurrence_pattern: None,
                        tags: parsed.tags,
                    };

                    match crate::database::create_reminder(
                        &pool,
                        user_id,
                        msg.chat.id.into(),
                        create_data,
                        true,
                    )
                    .await
                    {
                        Ok(reminder) => {
                            let keyboard = InlineKeyboardMarkup::new(vec![vec![
                                InlineKeyboardButton::callback(
                                    "❌ Cancel",
                                    format!("delete_{}", reminder.id),
                                ),
                                InlineKeyboardButton::callback(
                                    "⏰ Snooze",
                                    format!("snooze_{}", reminder.id),
                                ),
                            ]]);

                            bot.send_message(msg.chat.id, ai_response.response)
                                .parse_mode(ParseMode::Markdown)
                                .reply_markup(keyboard)
                                .await?;
                        }
                        Err(e) => {
                            bot.send_message(
                                msg.chat.id,
                                format!("❌ Failed to create reminder: {}", e),
                            )
                            .await?;
                        }
                    }
                } else {
                    bot.send_message(msg.chat.id, ai_response.response)
                        .parse_mode(ParseMode::Markdown)
                        .await?;
                }
            }
            Err(e) => {
                bot.send_message(
                    msg.chat.id,
                    format!("🤖 Sorry, I encountered an error: {}", e),
                )
                .await?;
            }
        }

        Ok(())
    }

    pub async fn send_message(&self, chat_id: i64, text: &str) -> Result<()> {
        self.bot
            .send_message(teloxide::types::ChatId(chat_id), text)
            .parse_mode(ParseMode::Markdown)
            .await?;
        Ok(())
    }
}

#[derive(BotCommands, Clone)]
#[command(rename_rule = "lowercase", description = "Bot commands:")]
pub enum BotCommand {
    #[command(description = "Start the bot")]
    Start,
    #[command(description = "Show help")]
    Help,
    #[command(description = "List all reminders")]
    List,
    #[command(description = "Bot settings")]
    Settings,
}
