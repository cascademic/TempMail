const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();

function generateTempPassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let result = '';
  const crypto = require('crypto');
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// GET /api/admin/users/pending
router.get('/users/pending', adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, email, created_at FROM users WHERE is_approved = false AND is_admin = false ORDER BY created_at ASC'
    );
    res.json({ success: true, pendingUsers: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load pending users' });
  }
});

// GET /api/admin/users/approved
router.get('/users/approved', adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, email, approved_at, last_login, emails_created FROM users WHERE is_approved = true AND is_admin = false ORDER BY approved_at DESC'
    );
    res.json({ success: true, approvedUsers: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load approved users' });
  }
});

// POST /api/admin/approve-user
router.post('/approve-user', adminMiddleware, async (req, res) => {
  try {
    const { userId, approve } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (approve) {
      const { rows } = await db.query(
        `UPDATE users SET is_approved = true, approved_at = NOW(), approved_by = $1
         WHERE id = $2 AND is_admin = false RETURNING id, username, is_approved`,
        [req.user.id, userId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, message: 'User approved', user: rows[0] });
    } else {
      const { rows } = await db.query(
        `UPDATE users SET is_approved = false, approved_at = NULL, approved_by = NULL
         WHERE id = $1 AND is_admin = false RETURNING id, username, is_approved`,
        [userId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, message: 'User rejected', user: rows[0] });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/admin/reset-password
router.post('/reset-password', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const { rows } = await db.query('SELECT id, username, email FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const tempPassword = generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 10);
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId]);

    res.json({
      success: true,
      tempPassword,
      message: 'Share this temporary password with the user',
      user: { username: rows[0].username, email: rows[0].email },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// POST /api/admin/deactivate-user
router.post('/deactivate-user', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const { rows } = await db.query(
      `UPDATE users SET is_approved = false, approved_at = NULL, approved_by = NULL
       WHERE id = $1 AND is_admin = false RETURNING id, username`,
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found or is admin' });

    res.json({ success: true, message: 'User deactivated', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// GET /api/admin/stats
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const [pending, approved, emails, messages] = await Promise.all([
      db.query("SELECT COUNT(*) as count FROM users WHERE is_approved = false AND is_admin = false"),
      db.query("SELECT COUNT(*) as count FROM users WHERE is_approved = true AND is_admin = false"),
      db.query("SELECT COUNT(*) as count FROM temp_emails"),
      db.query("SELECT COUNT(*) as count FROM messages"),
    ]);
    res.json({
      success: true,
      stats: {
        pendingUsers: parseInt(pending.rows[0].count),
        approvedUsers: parseInt(approved.rows[0].count),
        totalEmails: parseInt(emails.rows[0].count),
        totalMessages: parseInt(messages.rows[0].count),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// POST /api/config/update
router.post('/config/update', adminMiddleware, async (req, res) => {
  try {
    const { email_ttl_seconds, max_emails_per_user, service_name, email_domain } = req.body;

    const updates = [];
    const values = [];
    let paramIdx = 1;

    if (typeof email_ttl_seconds === 'number') {
      if (email_ttl_seconds < 60) return res.status(400).json({ error: 'email_ttl_seconds must be >= 60' });
      updates.push(`email_ttl_seconds = $${paramIdx++}`);
      values.push(email_ttl_seconds);
    }
    if (typeof max_emails_per_user === 'number') {
      if (max_emails_per_user < 1) return res.status(400).json({ error: 'max_emails_per_user must be >= 1' });
      updates.push(`max_emails_per_user = $${paramIdx++}`);
      values.push(max_emails_per_user);
    }
    if (typeof service_name === 'string' && service_name.trim()) {
      updates.push(`service_name = $${paramIdx++}`);
      values.push(service_name.trim());
    }
    if (typeof email_domain === 'string' && email_domain.trim()) {
      updates.push(`email_domain = $${paramIdx++}`);
      values.push(email_domain.trim());
    }

    updates.push(`updated_at = NOW()`);
    updates.push(`updated_by = $${paramIdx++}`);
    values.push(req.user.username);
    values.push(1);

    const { rows } = await db.query(
      `UPDATE app_config SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Config not found' });
    res.json({ success: true, config: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

module.exports = router;
