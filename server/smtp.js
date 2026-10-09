const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const db = require('./db');
const { extractOtp } = require('./otp');

let smtpServer = null;

async function getSystemOwner() {
  const { rows } = await db.query(
    'SELECT id FROM users WHERE is_admin = true ORDER BY created_at ASC LIMIT 1'
  );
  return rows.length > 0 ? rows[0].id : null;
}

async function getOrCreateTempEmail(recipient) {
  const { rows: existing } = await db.query(
    'SELECT * FROM temp_emails WHERE email = $1',
    [recipient]
  );
  if (existing.length > 0) return existing[0];

  const ownerId = await getSystemOwner();
  if (!ownerId) {
    throw new Error('No system owner (admin user) found for auto-creating inbox');
  }

  const { rows: configRows } = await db.query('SELECT email_ttl_seconds FROM app_config WHERE id = 1');
  const ttlSeconds = configRows.length > 0 ? configRows[0].email_ttl_seconds : 3600;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const { rows } = await db.query(
    `INSERT INTO temp_emails (email, owner_user_id, expires_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [recipient, ownerId, expiresAt]
  );
  return rows[0];
}

async function saveMessage(recipient, parsed, rawSize) {
  const tempEmail = await getOrCreateTempEmail(recipient);

  const fromAddr = parsed.from && parsed.from.text ? parsed.from.text : '';
  const subject = parsed.subject || '';
  const textBody = parsed.text || '';
  const htmlBody = parsed.html || null;
  const otp = extractOtp(textBody);
  const sizeBytes = rawSize || 0;

  await db.query(
    `INSERT INTO messages (temp_email_id, sender, recipient, subject, body_text, body_html, otp, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [tempEmail.id, fromAddr, recipient, subject, textBody, htmlBody, otp, sizeBytes]
  );

  const { rows: countRows } = await db.query(
    'SELECT COUNT(*) as count FROM messages WHERE temp_email_id = $1',
    [tempEmail.id]
  );
  await db.query('UPDATE temp_emails SET message_count = $1 WHERE id = $2',
    [parseInt(countRows[0].count), tempEmail.id]);
}

function startSmtpServer() {
  if (process.env.ENABLE_SMTP === 'false') {
    console.log('SMTP server disabled (ENABLE_SMTP=false)');
    return;
  }

  const mailDomain = process.env.MAIL_DOMAIN || 'tempmail.tk';
  const smtpPort = parseInt(process.env.SMTP_PORT || '2525');
  const maxSize = parseInt(process.env.MAX_MESSAGE_SIZE_MB || '1') * 1024 * 1024;

  smtpServer = new SMTPServer({
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    size: maxSize,
    maxClients: 50,
    banner: mailDomain,

    onRcptTo(session, address, cb) {
      try {
        const recipient = address.value
          ? address.value[0].address.toLowerCase()
          : String(address).toLowerCase();

        if (session.envelope.rcptTo.length > 5) {
          return cb(new Error('Too many recipients (max 5)'));
        }

        if (!recipient.endsWith(`@${mailDomain}`)) {
          const err = new Error('Relay access denied');
          err.responseCode = 550;
          return cb(err);
        }

        cb();
      } catch (err) {
        console.error('SMTP onRcptTo error:', err);
        const e = new Error('Internal error');
        e.responseCode = 451;
        cb(e);
      }
    },

    async onData(stream, session, cb) {
      let rawSize = 0;
      const chunks = [];

      stream.on('data', (chunk) => {
        rawSize += chunk.length;
        chunks.push(chunk);
      });

      stream.on('error', (err) => {
        console.error('SMTP stream error:', err);
        const e = new Error('Failed to read message');
        e.responseCode = 451;
        cb(e);
      });

      stream.on('end', async () => {
        try {
          const rawBuffer = Buffer.concat(chunks);
          const parsed = await simpleParser(rawBuffer);

          for (const rcpt of session.envelope.rcptTo) {
            const recipient = rcpt.value
              ? rcpt.value[0].address.toLowerCase()
              : String(rcpt).toLowerCase();

            try {
              await saveMessage(recipient, parsed, rawSize);
              console.log(`SMTP delivered: ${recipient} from ${parsed.from && parsed.from.text ? parsed.from.text : 'unknown'}`);
            } catch (err) {
              console.error(`SMTP save failed for ${recipient}:`, err);
            }
          }

          cb();
        } catch (err) {
          console.error('SMTP onData parse error:', err);
          const e = new Error('Failed to process message');
          e.responseCode = 451;
          cb(e);
        }
      });
    },
  });

  smtpServer.listen(smtpPort, () => {
    console.log(`SMTP server listening on port ${smtpPort} (domain: ${mailDomain})`);
  });

  smtpServer.on('error', (err) => {
    console.error('SMTP server error:', err);
  });
}

function stopSmtpServer() {
  if (smtpServer) {
    smtpServer.close();
    smtpServer = null;
    console.log('SMTP server stopped');
  }
}

module.exports = { startSmtpServer, stopSmtpServer };
