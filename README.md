# Sigma Chat

A complete Discord-inspired community platform built with Node.js, Express, Socket.IO, PostgreSQL, and Vanilla JS.

## Features

- **Authentication** — Register, login, logout, bcrypt passwords, express-session
- **Email Verification** — Token-based, 24h expiry, resend, change email
- **Password Reset** — Secure token email flow
- **Account Settings** — Change username, email, password, bio, avatar, banner, status
- **Discord-style UI** — Server dock, channel sidebar, chat, member list, profile bar, dark theme
- **Real-time Chat** — Socket.IO powered, typing indicators, online/offline presence
- **Servers & Channels** — Create, join (invite code), leave, delete; channel management
- **Friends & DMs** — Friend requests, accept/decline, direct messages, group chats
- **User Profiles** — Avatar, banner, bio, badges, XP bar, level, points, friend count
- **Economy** — +1 Point and +5 XP per message; Rail subscription for 1000 points
- **Store** — Buy name colors, chat effects, themes, Rail subscription
- **Moderation** — Ban, unban, kick, timeout, pin/delete messages, badge management
- **Security** — XSS protection, rate limiting, input validation, prepared queries
- **Admin Panel** — User management, moderation logs, ban records

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, SESSION_SECRET, SMTP settings
```

### 3. Set up the database
Run the schema against your PostgreSQL/Supabase database:
```bash
psql $DATABASE_URL -f database/schema.sql
```

### 4. Start the server
```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

The server starts on `http://localhost:3000` (or `PORT` from env).

## Default Admin Account

On first boot, an admin user is automatically created:
- **Username:** `Admin`
- **Password:** `whatthesigma`
- **Permissions:** Full admin, blue badge, gold badge

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Secret for session signing |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP username/email |
| `SMTP_PASS` | SMTP password |
| `APP_URL` | Public URL (for email links) |
| `UPLOAD_DIR` | Directory for uploaded files |

## File Structure

```
sigma-chat/
├── server.js               # Main Express + Socket.IO server
├── package.json
├── .env.example
├── database/
│   └── schema.sql          # Full PostgreSQL schema + seed data
├── middleware/
│   ├── auth.js             # requireAuth, requireAdmin, requireVerified
│   ├── ratelimit.js        # Rate limiters
│   └── upload.js           # Multer file upload handler
├── routes/
│   ├── auth.js             # Auth: register, login, logout, verify, etc.
│   ├── servers.js          # Server + channel CRUD
│   ├── messages.js         # Channel messages: send, delete, edit, pin
│   ├── users.js            # User profiles, search, notifications
│   ├── friends.js          # Friends + friend requests
│   ├── dms.js              # Direct messages + group chats
│   ├── admin.js            # Admin: ban, kick, timeout, badges, points
│   └── store.js            # Economy store + purchases
├── utils/
│   ├── email.js            # Nodemailer email templates
│   └── helpers.js          # Token generation, XP calc, sanitization
└── public/
    ├── index.html          # Single-page app shell
    ├── css/
    │   └── style.css       # Full Discord-inspired styles
    └── js/
        ├── app.js          # Core app logic, state, navigation
        ├── auth.js         # Login/register form handlers
        ├── socket.js       # Socket.IO event handlers
        ├── chat.js         # (loaded from app.js)
        ├── store.js        # Store UI + purchase flow
        ├── admin.js        # Admin panel UI
        └── ui.js           # Keyboard shortcuts, invite handling
```

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express 4
- **Real-time:** Socket.IO 4
- **Database:** PostgreSQL (compatible with Supabase)
- **ORM:** Raw `pg` with parameterized queries
- **Auth:** express-session + connect-pg-simple + bcrypt
- **Validation:** express-validator + sanitize-html
- **Email:** Nodemailer
- **File Uploads:** Multer
- **Rate Limiting:** express-rate-limit
