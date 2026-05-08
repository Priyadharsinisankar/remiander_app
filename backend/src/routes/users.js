const express = require('express');
const db = require('../db');
const {
  createAuthToken,
  hashPassword,
  requireAuth,
  verifyPassword,
} = require('../auth');

const router = express.Router();

function publicUser(user, token) {
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      telegram_chat_id: user.telegram_chat_id,
    },
  };
}

router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password, telegram_chat_id } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    const token = createAuthToken();
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, auth_token, telegram_chat_id)
       VALUES ($1, LOWER($2), $3, $4, $5)
       RETURNING id, name, email, telegram_chat_id`,
      [name, email, hashPassword(password), token, telegram_chat_id || null]
    );

    res.status(201).json(publicUser(result.rows[0], token));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const existing = await db.query('SELECT * FROM users WHERE email = LOWER($1)', [email]);

    if (existing.rowCount === 0 || !verifyPassword(password, existing.rows[0].password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createAuthToken();
    const result = await db.query(
      `UPDATE users
       SET auth_token = $1
       WHERE id = $2
       RETURNING id, name, email, telegram_chat_id`,
      [token, existing.rows[0].id]
    );

    res.json(publicUser(result.rows[0], token));
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await db.query('UPDATE users SET auth_token = NULL WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, telegram_chat_id } = req.body;

    const result = await db.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           telegram_chat_id = COALESCE($2, telegram_chat_id)
       WHERE id = $3
       RETURNING id, name, email, telegram_chat_id`,
      [name || null, telegram_chat_id || null, req.user.id]
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
