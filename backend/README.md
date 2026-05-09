# AI Reminder App - Backend

A powerful, AI-integrated reminder application built with Express and PostgreSQL. It supports Telegram notifications, Google Calendar sync, Microsoft Outlook sync, and issue creation in Jira and Linear.

## Features

- **Natural Language Parsing**: Draft reminders by simply typing text (powered by NVIDIA AI).
- **AI Schedule Assistant**: A built-in chatbot that understands your schedule and helps you plan.
- **Multi-Platform Sync**:
  - **Google Calendar**: Full event sync (Create/Update/Delete).
  - **Microsoft Outlook**: Native Outlook Calendar integration.
  - **Jira**: Create and manage Atlassian issues from your reminders.
  - **Linear**: Seamlessly sync tasks with your Linear teams.
- **Telegram Native**: Bot integration for instant notifications and reminders.
- **Smart Scheduler**: Automatically checks for due reminders and dispatches notifications.

## Prerequisites

- Node.js v18+
- PostgreSQL
- External API Keys (Optional but recommended for full features):
  - NVIDIA API Key
  - Telegram Bot Token
  - Google Cloud Console Project (for Calendar)
  - Microsoft Entra ID App (for Outlook)
  - Jira API Token & Linear API Key

## Setup

1. **Database Setup**:
   ```sql
   CREATE DATABASE reminder_app;
   psql -d reminder_app -f database.sql
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env` and fill in your credentials.

   ```env
   DATABASE_URL=postgresql://user:pass@localhost:5432/reminder_app
   PORT=3000
   
   # AI
   NVIDIA_API_KEY=your_key
   NVIDIA_MODEL=meta/llama-3.1-70b-instruct
   
   # Integrations
   TELEGRAM_BOT_TOKEN=...
   JIRA_API_TOKEN=...
   JIRA_BASE_URL=https://your-site.atlassian.net
   LINEAR_PERSONAL_API_KEY=...
   LINEAR_TEAM_ID=...
   
   # OAuth
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   MS_CLIENT_ID=...
   MS_CLIENT_SECRET=...
   MS_TENANT_ID=common
   ```

3. **Install & Run**:
   ```bash
   npm install
   npm run dev
   ```

## API Reference

### Reminders
- `GET /api/reminders`: List all reminders for the user.
- `POST /api/reminders`: Create a new reminder.
- `PATCH /api/reminders/:id`: Update an existing reminder (syncs with external services).
- `DELETE /api/reminders/:id`: Delete a reminder (cleans up external resources).

### AI Assistant
- `POST /api/ai/reminder-draft`: Convert raw text into a reminder object.
- `GET /api/ai/chat`: Retrieve chat history.
- `POST /api/ai/chat`: Talk to the AI assistant about your schedule.

### Integrations
- `GET /api/integrations/status`: Check which services are configured and connected.
- `GET /api/google/auth-url`: Get Google Calendar OAuth URL.
- `GET /api/microsoft/auth-url`: Get Microsoft Outlook OAuth URL.
- `POST /api/telegram/test`: Send a test notification to your Telegram bot.

## Sync Logic

The backend implements a "Full Sync" lifecycle:
- **Creation**: When `send_calendar` (or other flags) is true, an event/issue is created immediately.
- **Update**: Changing title/time in the app updates the external resource.
- **Deletion**: Deleting in the app removes the external resource.
- **Toggling**: Enabling an integration on an existing reminder will create the external resource on the fly.

## Development

- `npm run dev`: Start server with nodemon.
- `npm start`: Production start.
- `scripts/`: Contains maintenance and migration scripts.

---
Built with ❤️ for productivity.
