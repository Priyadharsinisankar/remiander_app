const https = require('https');

function requestTelegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    const error = new Error('TELEGRAM_BOT_TOKEN is not configured');
    error.status = 400;
    throw error;
  }

  const body = JSON.stringify(payload);
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${token}/${method}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        let parsed = {};

        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (error) {
          reject(new Error('Telegram returned an unreadable response'));
          return;
        }

        if (!parsed.ok) {
          const error = new Error(parsed.description || 'Telegram request failed');
          error.status = res.statusCode >= 400 ? res.statusCode : 502;
          reject(error);
          return;
        }

        resolve(parsed.result);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendTelegramMessage(chatId, text) {
  return requestTelegram('sendMessage', {
    chat_id: chatId,
    text,
  });
}

module.exports = {
  sendTelegramMessage,
};
