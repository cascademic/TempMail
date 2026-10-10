const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

const OTP_SUBJECT = 'one time password: dp world trade finance';

// Validates { username, password, email } from the body and returns the latest message for that email
async function getLatestMessage(req, res) {
  const { username, password, email } = req.body || {};
  if (!username || !password || !email) {
    res.status(400).json({ error: 'username, password, and email are required' });
    return null;
  }

  const { rows: users } = await db.query('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);
  const user = users[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return null;
  }
  if (!user.is_approved) {
    res.status(403).json({ error: 'Your account is pending admin approval' });
    return null;
  }

  const { rows } = await db.query(
    `SELECT m.* FROM messages m
     JOIN temp_emails te ON te.id = m.temp_email_id
     WHERE te.email = $1
     ORDER BY m.received_at DESC
     LIMIT 1`,
    [String(email).trim().toLowerCase()]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'No messages found for this email' });
    return null;
  }
  return rows[0];
}

// POST /api/email/latest
router.post('/latest', async (req, res) => {
  try {
    const message = await getLatestMessage(req, res);
    if (!message) return;
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load latest message' });
  }
});

// POST /api/email/get-otp
router.post('/get-otp', async (req, res) => {
  try {
    const message = await getLatestMessage(req, res);
    if (!message) return;

    if ((message.subject || '').trim().toLowerCase() !== OTP_SUBJECT) {
      return res.status(404).json({ error: 'Latest message is not a DP World Trade Finance OTP mail' });
    }

    const body = message.body_text || (message.body_html || '').replace(/<[^>]+>/g, ' ');
    const match = body.match(/One Time Password code\D*(\d{6})\b/i) || body.match(/\b(\d{6})\b/);
    if (!match) {
      return res.status(404).json({ error: 'OTP not found in latest message' });
    }

    res.json({ success: true, otp: match[1] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get OTP' });
  }
});

module.exports = router;
