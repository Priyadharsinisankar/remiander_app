const crypto = require('crypto');
const db = require('./db');

const HASH_ITERATIONS = 120000;
const HASH_LENGTH = 64;
const HASH_DIGEST = 'sha512';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_LENGTH, HASH_DIGEST)
    .toString('hex');

  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [salt, originalHash] = storedHash.split(':');
  const candidate = hashPassword(password, salt).split(':')[1];
  const candidateBuffer = Buffer.from(candidate);
  const originalBuffer = Buffer.from(originalHash);

  if (candidateBuffer.length !== originalBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuffer, originalBuffer);
}

function createAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.get('authorization') || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Login required' });
    }

    const result = await db.query(
      `SELECT id, name, email, telegram_chat_id
       FROM users
       WHERE auth_token = $1`,
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid login token' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createAuthToken,
  hashPassword,
  requireAuth,
  verifyPassword,
};
