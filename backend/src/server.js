const express = require('express');
const cors = require('cors');
require('dotenv').config();

const usersRouter = require('./routes/users');
const remindersRouter = require('./routes/reminders');
const telegramRouter = require('./routes/telegram');
const db = require('./db');
const { startReminderScheduler } = require('./scheduler');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'reminder-app' });
});

app.use('/api/users', usersRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/telegram', telegramRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

db.initDatabase()
  .then(() => {
    startReminderScheduler();

    app.listen(port, () => {
      console.log(`Reminder app running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
