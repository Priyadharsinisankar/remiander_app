# Reminder App

Simple Express + PostgreSQL reminder app with login/signup, private task lists, and Telegram Bot API messaging.
#t
## Setup

1. Create a PostgreSQL database.

```sql
CREATE DATABASE reminder_app;
```

2. Run the schema.

```bash
psql -U postgres -d reminder_app -f database.sql
```

3. Create `.env` from `.env.example` and update `DATABASE_URL` plus your bot token.

```bash
cp .env.example .env
```

```env
TELEGRAM_BOT_TOKEN=123456:your_bot_token
```

4. Install dependencies and start the server.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Telegram

1. Create a bot with BotFather and put the token in `.env` as `TELEGRAM_BOT_TOKEN`.
2. Start the app, create an account, then send `/start` to your Telegram bot.
3. The bot replies with your chat id. Paste that chat id into the app and click `Save Telegram`.
4. Click `Test Telegram`. New tasks with Telegram enabled will be checked automatically by the scheduler.

The reminder scheduler starts with the server and checks pending Telegram tasks every 30 seconds by default. Change this in `.env`:

```env
REMINDER_POLL_SECONDS=30
```

To receive Telegram webhook messages locally, expose the app with a public HTTPS URL such as ngrok and set:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-public-url/api/telegram/webhook"
```

## API

- `GET /api/health`
- `POST /api/users/signup`
- `POST /api/users/login`
- `POST /api/users/logout`
- `GET /api/users/me`
- `PATCH /api/users/me`
- `GET /api/reminders` authenticated
- `GET /api/reminders/:id` authenticated
- `POST /api/reminders` authenticated
- `PATCH /api/reminders/:id` authenticated
- `DELETE /api/reminders/:id` authenticated
- `GET /api/reminders/due/pending`
- `GET /api/reminders/scheduler/status` authenticated
- `POST /api/reminders/scheduler/run` authenticated
- `GET /api/telegram/status`
- `POST /api/telegram/test` authenticated
- `POST /api/telegram/webhook`
