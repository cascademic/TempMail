# TempMail

Temporary email service with Express + PostgreSQL backend and React frontend.

## SMTP Server

The backend includes a built-in SMTP server that receives incoming emails and stores them in the database. It starts automatically with the HTTP server (unless `ENABLE_SMTP=false`).

### Configuration

| Env variable | Default | Description |
|---|---|---|
| `ENABLE_SMTP` | `true` | Set to `false` to disable the SMTP server |
| `SMTP_PORT` | `2525` | Port the SMTP server listens on |
| `MAIL_DOMAIN` | `tempmail.tk` | Domain accepted for incoming mail |
| `MAX_MESSAGE_SIZE_MB` | `1` | Maximum message size in MB |

### Test locally

Use [swaks](https://github.com/jetmore/swaks) to send a test email:

```bash
swaks --to test@YOURDOMAIN --server localhost:2525
```

Replace `YOURDOMAIN` with the value of `MAIL_DOMAIN`.

### CapRover deployment

On CapRover, map the container's SMTP port to the host's port 25:

- **Container port:** `2525`
- **Server (host) port:** `25`

This routes incoming internet mail (port 25) to the SMTP server inside the container (port 2525). Make sure port 25 is open in your firewall/security group.
