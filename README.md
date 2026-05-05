A smart, AI-powered reminder application with dual-backend implementations (Rust & C#) that integrates directly with Telegram. Leverage natural language processing to create, manage, and track your reminders effortlessly.

Rust
C#
.NET 8
PostgreSQL
Telegram Bot
OpenAI

Features
  Natural Language Processing: Just type "Remind me to call mom tomorrow at 3pm" and the AI handles the rest.
  Smart Intent Detection: Automatically knows if you want to create a reminder, list them, or just chat.
  Telegram Native: Seamless integration with inline buttons, markdown formatting, and quick-reply actions (done <id>, snooze <id>).
  Background Scheduler: Automatically checks and sends due reminders every 30 seconds without external cron jobs.
  Recurring Reminders: Support for daily, weekly, and monthly recurring tasks.
  REST API: Exposes standard endpoints for external integrations or web dashboards.
  Dual Backend: Compare high-performance Rust with enterprise-grade C# (.NET 8). Both share the same DB schema.
