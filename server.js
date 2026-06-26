'use strict';
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const { generateInviteCode } = require('./utils/helpers');
const { generalLimiter } = require('./middleware/ratelimit');

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['polling'],
});

// Database
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Session store
const sessionMiddleware = session({
  store: new pgSession({ pool: db, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'sigma-chat-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
});

// Middleware
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(generalLimiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Share session with Socket.IO
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

// Routes
const authRoutes = require('./routes/auth')(db);
const serverRoutes = require('./routes/servers')(db, io);
const messageRoutes = require('./routes/messages')(db, io);
const userRoutes = require('./routes/users')(db);
const friendRoutes = require('./routes/friends')(db, io);
const dmRoutes = require('./routes/dms')(db, io);
const adminRoutes = require('./routes/admin')(db, io);
const storeRoutes = require('./routes/store')(db);

app.use('/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/dms', dmRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/store', storeRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO
io.on('connection', (socket) => {
  const session = socket.request.session;
  if (!session || !session.userId) return socket.disconnect();
  const userId = session.userId;

  socket.join(`user:${userId}`);
  db.query('UPDATE users SET status=$1, last_seen=NOW() WHERE id=$2', ['online', userId]).catch(() => {});

  socket.on('join_server', (serverId) => {
    socket.join(`server:${serverId}`);
  });

  socket.on('join_channel', (channelId) => {
    socket.join(`channel:${channelId}`);
  });

  socket.on('leave_channel', (channelId) => {
    socket.leave(`channel:${channelId}`);
  });

  socket.on('join_group', (groupId) => {
    socket.join(`group:${groupId}`);
  });

  socket.on('typing_start', async ({ channelId }) => {
    try {
      const ch = await db.query('SELECT server_id FROM channels WHERE id=$1', [channelId]);
      if (!ch.rows[0]) return;
      const member = await db.query('SELECT 1 FROM server_members WHERE server_id=$1 AND user_id=$2', [ch.rows[0].server_id, userId]);
      if (!member.rows[0]) return;
      socket.to(`channel:${channelId}`).emit('user_typing', { userId, username: session.username, channelId });
    } catch (_) {}
  });

  socket.on('typing_stop', ({ channelId }) => {
    socket.to(`channel:${channelId}`).emit('user_stop_typing', { userId, channelId });
  });

  socket.on('set_status', async (status) => {
    const allowed = ['online', 'idle', 'dnd', 'invisible'];
    if (!allowed.includes(status)) return;
    await db.query('UPDATE users SET status=$1 WHERE id=$2', [status, userId]).catch(() => {});
    io.emit('status_change', { userId, status: status === 'invisible' ? 'offline' : status });
  });

  socket.on('disconnect', async () => {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    if (sockets.length === 0) {
      await db.query('UPDATE users SET status=\'offline\', last_seen=NOW() WHERE id=$1', [userId]).catch(() => {});
      io.emit('status_change', { userId, status: 'offline' });
    }
  });
});

// Seed admin user on startup
async function seedAdmin() {
  try {
    const existing = await db.query('SELECT id FROM users WHERE username=$1', ['Admin']);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('whatthesigma', 12);
      await db.query(
        `INSERT INTO users (username, display_name, email, password_hash, email_verified, verified_at, is_admin, badge_blue, badge_gold)
         VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8)`,
        ['Admin', 'Admin', 'admin@sigmachat.local', hash, true, true, true, true]
      );
      console.log('Admin user created: Admin / whatthesigma');
    }
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Sigma Chat running on http://localhost:${PORT}`);
  await seedAdmin();
});

module.exports = { app, server, io };
