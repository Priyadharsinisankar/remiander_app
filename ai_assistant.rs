use anyhow::Result;
use async_openai::{
    types::{
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessageArgs,
        ChatCompletionRequestUserMessageArgs, CreateChatCompletionRequestArgs,
    },
    ChatCompletion,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::database::DbPool;
use crate::models::{AIIntent, AIResponse, ParsedReminder, ReminderPriority};

pub struct AIAssistant {
    client: ChatCompletion,
    pool: DbPool,
    model: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ParsedReminderJson {
    title: String,
    #[serde(default)]
    description: Option<String>,
    reminder_time: String,
    #[serde(default = "default_priority")]
    priority: String,
    #[serde(default)]
    tags: Option<Vec<String>>,
}

fn default_priority() -> String {
    "medium".to_string()
}

impl AIAssistant {
    pub fn new(api_key: &str, pool: DbPool, model: Option<&str>) -> Self {
        let client = ChatCompletion::new(api_key);
        Self {
            client,
            pool,
            model: model.unwrap_or("gpt-4-turbo-preview").to_string(),
        }
    }

    pub async fn process_message(
        &self,
        user_id: i64,
        message: &str,
    ) -> Result<AIResponse> {
        // Save user message to conversation history
        crate::database::save_conversation(&self.pool, user_id, "user", message).await?;

        // Get conversation history for context
        let history = crate::database::get_conversation_history(&self.pool, user_id, 10).await?;

        // First, detect intent
        let intent = self.detect_intent(message).await?;

        match intent {
            AIIntent::CreateReminder => {
                let parsed = self.parse_reminder(message).await?;
                
                // Save AI response
                let response_text = format!(
                    "✅ I've created a reminder for you:\n\n📌 **{}**\n🕐 {}",
                    parsed.title,
                    parsed.reminder_time.format("%Y-%m-%d %H:%M UTC")
                );
                crate::database::save_conversation(
                    &self.pool,
                    user_id,
                    "assistant",
                    &response_text,
                )
                .await?;

                Ok(AIResponse {
                    response: response_text,
                    extracted_reminder: Some(parsed),
                    intent: AIIntent::CreateReminder,
                })
            }
            AIIntent::ListReminders => {
                let reminders = crate::database::get_user_reminders(
                    &self.pool,
                    user_id,
                    None,
                )
                .await?;

                let response = if reminders.is_empty() {
                    "📝 You don't have any reminders yet. Would you like to create one?".to_string()
                } else {
                    let mut list = String::from("📋 **Your Reminders:**\n\n");
                    for (i, r) in reminders.iter().enumerate() {
                        let status_icon = match r.status {
                            crate::models::ReminderStatus::Pending => "⏳",
                            crate::models::ReminderStatus::Completed => "✅",
                            crate::models::ReminderStatus::Cancelled => "❌",
                            crate::models::ReminderStatus::Snoozed => "💤",
                        };
                        list.push_str(&format!(
                            "{}. {} {} - {}\n   🕐 {}\n\n",
                            i + 1,
                            status_icon,
                            r.title,
                            format!("{:?}", r.priority).to_lowercase(),
                            r.reminder_time.format("%Y-%m-%d %H:%M")
                        ));
                    }
                    list
                };

                crate::database::save_conversation(
                    &self.pool,
                    user_id,
                    "assistant",
                    &response,
                )
                .await?;

                Ok(AIResponse {
                    response,
                    extracted_reminder: None,
                    intent: AIIntent::ListReminders,
                })
            }
            AIIntent::Help => {
                let help_text = r#"
🤖 **Reminder AI Assistant Help**

**Create a reminder:**
• "Remind me to call mom tomorrow at 3pm"
• "Set reminder: Meeting with John on Friday 2pm, high priority"
• "Remind me to take medicine daily at 8am"

**View reminders:**
• "Show my reminders"
• "List all pending reminders"
• "What do I have today?"

**Manage reminders:**
• "Delete reminder [id]"
• "Mark reminder [id] as done"
• "Snooze reminder [id] for 1 hour"

**General:**
• Ask me anything about time management!
• I can help you organize your schedule

💡 **Tips:**
• Include specific dates/times for better accuracy
• Use priority words: urgent, high, low
• Add tags like #work, #personal, #health
"#.to_string();

                crate::database::save_conversation(
                    &self.pool,
                    user_id,
                    "assistant",
                    &help_text,
                )
                .await?;

                Ok(AIResponse {
                    response: help_text,
                    extracted_reminder: None,
                    intent: AIIntent::Help,
                })
            }
            _ => {
                let general_response = self.generate_general_response(message, &history).await?;
                
                crate::database::save_conversation(
                    &self.pool,
                    user_id,
                    "assistant",
                    &general_response,
                )
                .await?;

                Ok(AIResponse {
                    response: general_response,
                    extracted_reminder: None,
                    intent: AIIntent::GeneralChat,
                })
            }
        }
    }

    async fn detect_intent(&self, message: &str) -> Result<AIIntent> {
        let system_prompt = r#"
You are an intent detector for a reminder application. Analyze the user's message and determine the intent.

Possible intents:
- "create_reminder": User wants to create/set a new reminder
- "list_reminders": User wants to see their reminders
- "update_reminder": User wants to modify an existing reminder
- "delete_reminder": User wants to remove a reminder
- "help": User is asking for help or how to use the bot
- "general_chat": General conversation not related to reminders

Respond with ONLY the intent name, nothing else.
"#;

        let request = CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .messages(vec![
                ChatCompletionRequestSystemMessageArgs::default()
                    .content(system_prompt)
                    .build()?
                    .into(),
                ChatCompletionRequestUserMessageArgs::default()
                    .content(message)
                    .build()?
                    .into(),
            ])
            .max_tokens(20)
            .temperature(0.0)
            .build()?;

        let response = self.client.create(request).await?;
        let content = response.choices[0]
            .message
            .content
            .as_ref()
            .unwrap_or(&String::new())
            .trim()
            .to_lowercase();

        let intent = match content.as_str() {
            "create_reminder" => AIIntent::CreateReminder,
            "list_reminders" => AIIntent::ListReminders,
            "update_reminder" => AIIntent::UpdateReminder,
            "delete_reminder" => AIIntent::DeleteReminder,
            "help" => AIIntent::Help,
            _ => AIIntent::Unknown,
        };

        Ok(intent)
    }

    async fn parse_reminder(&self, message: &str) -> Result<ParsedReminder> {
        let now = Utc::now();
        let system_prompt = format!(
            r#"
You are a reminder parser. Extract reminder details from the user's message.
Current date/time: {}

Return a JSON object with these fields:
- "title": The reminder title (required)
- "description": Additional details (optional)
- "reminder_time": ISO 8601 datetime string (required)
- "priority": One of "low", "medium", "high", "urgent" (default: "medium")
- "tags": Array of tag strings (optional)

IMPORTANT: Parse relative times correctly. "Tomorrow 3pm" should be tomorrow at 15:00 UTC.
"Next Monday" should be the upcoming Monday at 09:00 UTC.

Return ONLY valid JSON, no other text.
"#,
            now.format("%Y-%m-%d %H:%M:%S UTC")
        );

        let request = CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .messages(vec![
                ChatCompletionRequestSystemMessageArgs::default()
                    .content(&system_prompt)
                    .build()?
                    .into(),
                ChatCompletionRequestUserMessageArgs::default()
                    .content(message)
                    .build()?
                    .into(),
            ])
            .max_tokens(200)
            .temperature(0.1)
            .response_format(serde_json::json!({"type": "json_object"}))
            .build()?;

        let response = self.client.create(request).await?;
        let content = response.choices[0]
            .message
            .content
            .as_ref()
            .unwrap_or(&String::new());

        let parsed: ParsedReminderJson = serde_json::from_str(content)?;

        let reminder_time = chrono::DateTime::parse_from_rfc3339(&parsed.reminder_time)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| now + chrono::Duration::hours(1));

        let priority = match parsed.priority.to_lowercase().as_str() {
            "low" => ReminderPriority::Low,
            "high" => ReminderPriority::High,
            "urgent" => ReminderPriority::Urgent,
            _ => ReminderPriority::Medium,
        };

        Ok(ParsedReminder {
            title: parsed.title,
            description: parsed.description,
            reminder_time,
            priority,
            tags: parsed.tags,
        })
    }

    async fn generate_general_response(
        &self,
        message: &str,
        history: &[(String, String)],
    ) -> Result<String> {
        let system_prompt = r#"
You are a friendly AI assistant for a reminder application. Help users with:
- Time management tips
- Productivity advice
- General questions about the app
- Friendly conversation

Keep responses concise and helpful. Use emojis occasionally.
If the user seems to want to create a reminder, guide them on how to phrase it.
"#;

        let mut messages: Vec<ChatCompletionRequestMessage> = vec![
            ChatCompletionRequestSystemMessageArgs::default()
                .content(system_prompt)
                .build()?
                .into(),
        ];

        for (role, content) in history {
            let msg = match role.as_str() {
                "user" => ChatCompletionRequestUserMessageArgs::default()
                    .content(content)
                    .build()?
                    .into(),
                "assistant" => async_openai::types::ChatCompletionRequestAssistantMessageArgs::default()
                    .content(content)
                    .build()?
                    .into(),
                _ => continue,
            };
            messages.push(msg);
        }

        let request = CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .messages(messages)
            .max_tokens(500)
            .temperature(0.7)
            .build()?;

        let response = self.client.create(request).await?;
        let content = response.choices[0]
            .message
            .content
            .clone()
            .unwrap_or_else(|| "I'm sorry, I couldn't generate a response.".to_string());

        Ok(content)
    }
}
