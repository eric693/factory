const https = require('https');
const querystring = require('querystring');
const db = require('./db');

function sendLineNotify(message) {
  try {
    const tokenRow = db.prepare("SELECT value FROM system_settings WHERE key='line_notify_token'").get();
    const enabledRow = db.prepare("SELECT value FROM system_settings WHERE key='line_notify_enabled'").get();
    const token = tokenRow?.value?.trim();
    const enabled = enabledRow?.value === '1';

    if (!enabled || !token) return;

    const body = querystring.stringify({ message: `\n${message}` });
    const req = https.request({
      hostname: 'notify-api.line.me',
      path: '/api/notify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

module.exports = { sendLineNotify };
