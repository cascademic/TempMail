const cron = require('node-cron');
const db = require('./db');

const TIMEZONE = process.env.CLEANUP_TIMEZONE || 'Asia/Kolkata';

// Every 30 min: delete messages older than 30 min and fix message_count
async function cleanupMessages() {
  try {
    const { rowCount } = await db.query(
      "DELETE FROM messages WHERE received_at < NOW() - INTERVAL '30 minutes'"
    );
    await db.query(
      `UPDATE temp_emails te
       SET message_count = (SELECT COUNT(*) FROM messages m WHERE m.temp_email_id = te.id)
       WHERE message_count <> (SELECT COUNT(*) FROM messages m WHERE m.temp_email_id = te.id)`
    );
    console.log(`Cleanup: deleted ${rowCount} old messages`);
  } catch (err) {
    console.error('Cleanup messages failed:', err.message);
  }
}

// Every night at 00:00: delete all temp emails (their messages cascade)
async function cleanupTempEmails() {
  try {
    const { rowCount } = await db.query('DELETE FROM temp_emails');
    console.log(`Cleanup: deleted ${rowCount} temp emails`);
  } catch (err) {
    console.error('Cleanup temp emails failed:', err.message);
  }
}

function startCleanupJobs() {
  cron.schedule('*/30 * * * *', cleanupMessages, { timezone: TIMEZONE });
  cron.schedule('0 0 * * *', cleanupTempEmails, { timezone: TIMEZONE });
  console.log(`Cleanup jobs scheduled (timezone: ${TIMEZONE})`);
}

module.exports = { startCleanupJobs, cleanupMessages, cleanupTempEmails };
