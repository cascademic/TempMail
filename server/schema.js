const db = require('./db');

// Applies schema changes added after the initial migration, so existing databases pick them up on deploy
async function ensureSchema() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_temp_emails (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        temp_email_id UUID NOT NULL REFERENCES temp_emails(id) ON DELETE CASCADE,
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, temp_email_id)
      )
    `);
    // Existing emails stay in their owner's list
    await db.query(`
      INSERT INTO user_temp_emails (user_id, temp_email_id, added_at)
      SELECT owner_user_id, id, created_at FROM temp_emails
      ON CONFLICT DO NOTHING
    `);
  } catch (err) {
    console.error('Schema update failed:', err.message);
  }
}

module.exports = { ensureSchema };
