const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { authMiddleware } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/email');
const adminRoutes = require('./routes/admin');
const { startSmtpServer, stopSmtpServer } = require('./smtp');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.get('/api/config', async (req, res) => {
  try {
    const db = require('./db');
    const { rows } = await db.query('SELECT * FROM app_config WHERE id = 1');
    if (rows.length === 0) return res.status(404).json({ error: 'Config not found' });
    res.json({ success: true, config: rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// Protected routes
app.use('/api/email', authMiddleware, emailRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

const httpServer = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startSmtpServer();
});

function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  stopSmtpServer();
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
