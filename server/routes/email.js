const express = require('express');
const db = require('../db');
const { extractOtp } = require('../otp');

const router = express.Router();

// GET /api/email/config (public)
router.get('/config', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM app_config WHERE id = 1');
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Config not found' });
    }
    res.json({ success: true, config: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// POST /api/email/create
router.post('/create', async (req, res) => {
  try {
    if (!req.user.is_approved) {
      return res.status(403).json({ error: 'Your account is pending admin approval' });
    }

    const { emailLocal } = req.body;
    if (!emailLocal || !/^[a-zA-Z0-9._-]{3,64}$/.test(emailLocal)) {
      return res.status(400).json({ error: 'Invalid email local part (3-64 chars, alphanumeric, dots, hyphens, underscores)' });
    }

    const { rows: configRows } = await db.query('SELECT * FROM app_config WHERE id = 1');
    const config = configRows[0];
    if (!config) return res.status(500).json({ error: 'Config not found' });

    const fullEmail = `${emailLocal.toLowerCase()}@${config.email_domain}`;

    // Address already exists (e.g. mail arrived first, or another user opened it): add it to this user's list
    const { rows: existing } = await db.query('SELECT * FROM temp_emails WHERE email = $1', [fullEmail]);
    if (existing.length > 0) {
      await db.query(
        'INSERT INTO user_temp_emails (user_id, temp_email_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.user.id, existing[0].id]
      );
      return res.json({ success: true, existing: true, email: existing[0] });
    }

    const { rows: countRows } = await db.query(
      'SELECT COUNT(*) as count FROM user_temp_emails WHERE user_id = $1',
      [req.user.id]
    );
    if (parseInt(countRows[0].count) >= config.max_emails_per_user) {
      return res.status(400).json({ error: `Maximum email limit reached (${config.max_emails_per_user})` });
    }

    const expiresAt = new Date(Date.now() + config.email_ttl_seconds * 1000);
    const { rows } = await db.query(
      `INSERT INTO temp_emails (email, owner_user_id, expires_at)
       VALUES ($1, $2, $3) RETURNING *`,
      [fullEmail, req.user.id, expiresAt]
    );
    await db.query(
      'INSERT INTO user_temp_emails (user_id, temp_email_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, rows[0].id]
    );

    await db.query('UPDATE users SET emails_created = emails_created + 1 WHERE id = $1', [req.user.id]);

    const ttlHours = Math.floor(config.email_ttl_seconds / 3600);
    const ttlMinutes = Math.floor((config.email_ttl_seconds % 3600) / 60);
    let expiresIn = '';
    if (ttlHours > 0) expiresIn = `${ttlHours} hour${ttlHours > 1 ? 's' : ''}`;
    else if (ttlMinutes > 0) expiresIn = `${ttlMinutes} minute${ttlMinutes > 1 ? 's' : ''}`;
    else expiresIn = `${config.email_ttl_seconds} seconds`;

    res.json({ success: true, email: rows[0], expiresIn });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create email' });
  }
});

// GET /api/email/inbox
router.get('/inbox', async (req, res) => {
  try {
    const { rows: emails } = await db.query(
      `SELECT te.*,
        (SELECT m.subject FROM messages m WHERE m.temp_email_id = te.id ORDER BY m.received_at DESC LIMIT 1) as latest_subject,
        (SELECT m.sender FROM messages m WHERE m.temp_email_id = te.id ORDER BY m.received_at DESC LIMIT 1) as latest_from,
        (SELECT m.received_at FROM messages m WHERE m.temp_email_id = te.id ORDER BY m.received_at DESC LIMIT 1) as latest_received_at
       FROM temp_emails te
       JOIN user_temp_emails ute ON ute.temp_email_id = te.id
       WHERE ute.user_id = $1
       ORDER BY ute.added_at DESC`,
      [req.user.id]
    );

    const result = emails.map((e) => ({
      id: e.id,
      email: e.email,
      messageCount: e.message_count,
      createdAt: e.created_at,
      expiresAt: e.expires_at,
      latestMessage: e.latest_from
        ? { subject: e.latest_subject, from: e.latest_from, receivedAt: e.latest_received_at }
        : null,
    }));

    res.json({ success: true, emails: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load inbox' });
  }
});

// DELETE /api/email/:emailId  (removes the email from this user's list only)
router.delete('/:emailId', async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM user_temp_emails WHERE user_id = $1 AND temp_email_id = $2',
      [req.user.id, req.params.emailId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Email not found in your list' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// GET /api/email/:emailId/messages
router.get('/:emailId/messages', async (req, res) => {
  try {
    const { emailId } = req.params;
    // Any approved user can read any temp email
    if (!req.user.is_approved) {
      return res.status(403).json({ error: 'Your account is pending admin approval' });
    }
    const { rows: emailRows } = await db.query('SELECT * FROM temp_emails WHERE id = $1', [emailId]);
    if (emailRows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const { rows: messages } = await db.query(
      'SELECT * FROM messages WHERE temp_email_id = $1 ORDER BY received_at DESC',
      [emailId]
    );

    res.json({ success: true, email: emailRows[0].email, messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// GET /api/email/:emailId/message/:messageId
router.get('/:emailId/message/:messageId', async (req, res) => {
  try {
    const { emailId, messageId } = req.params;
    // Any approved user can read any temp email
    if (!req.user.is_approved) {
      return res.status(403).json({ error: 'Your account is pending admin approval' });
    }
    const { rows: emailRows } = await db.query('SELECT * FROM temp_emails WHERE id = $1', [emailId]);
    if (emailRows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const { rows } = await db.query(
      'SELECT * FROM messages WHERE id = $1 AND temp_email_id = $2',
      [messageId, emailId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ success: true, message: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load message' });
  }
});

// POST /api/email/test-send
router.post('/test-send', async (req, res) => {
  try {
    if (!req.user.is_approved) {
      return res.status(403).json({ error: 'Not approved' });
    }

    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    const { rows: emailRows } = await db.query('SELECT * FROM temp_emails WHERE email = $1', [to.toLowerCase()]);
    if (emailRows.length === 0) {
      return res.status(404).json({ error: 'Destination email not found' });
    }

    const tempEmail = emailRows[0];
    const otp = extractOtp(body);
    const sizeBytes = Buffer.byteLength(body, 'utf8');

    await db.query(
      `INSERT INTO messages (temp_email_id, sender, recipient, subject, body_text, body_html, otp, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tempEmail.id, 'test-sender@tempmail.local', tempEmail.email, subject, body,
       `<div style="font-family: sans-serif;"><p>${body.replace(/\n/g, '<br>')}</p></div>`,
       otp, sizeBytes]
    );

    const { rows: countRows } = await db.query(
      'SELECT COUNT(*) as count FROM messages WHERE temp_email_id = $1',
      [tempEmail.id]
    );
    await db.query('UPDATE temp_emails SET message_count = $1 WHERE id = $2',
      [parseInt(countRows[0].count), tempEmail.id]);

    res.json({ success: true, message: 'Test email created', otp });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

module.exports = router;
