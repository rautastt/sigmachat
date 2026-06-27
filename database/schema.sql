-- Sigma Chat Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(32) UNIQUE NOT NULL,
  display_name VARCHAR(64),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT DEFAULT NULL,
  banner TEXT DEFAULT NULL,
  bio TEXT DEFAULT '',
  status VARCHAR(32) DEFAULT 'online',
  custom_status TEXT DEFAULT '',
  email_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ DEFAULT NULL,
  verification_token TEXT DEFAULT NULL,
  verification_token_expires TIMESTAMPTZ DEFAULT NULL,
  reset_token TEXT DEFAULT NULL,
  reset_token_expires TIMESTAMPTZ DEFAULT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  badge_blue BOOLEAN DEFAULT FALSE,
  badge_gold BOOLEAN DEFAULT FALSE,
  badge_rail BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  timeout_until TIMESTAMPTZ DEFAULT NULL,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  points INTEGER DEFAULT 0,
  name_color VARCHAR(32) DEFAULT NULL,
  chat_effect TEXT DEFAULT NULL,
  theme TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

-- Servers
CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT NULL,
  banner TEXT DEFAULT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code VARCHAR(16) UNIQUE NOT NULL,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Server Members
CREATE TABLE IF NOT EXISTS server_members (
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (server_id, user_id)
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  topic TEXT DEFAULT '',
  type VARCHAR(16) DEFAULT 'text',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_pinned BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Direct Messages
CREATE TABLE IF NOT EXISTS dms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group Chats
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  icon TEXT DEFAULT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group Members
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- Group Messages
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Friends
CREATE TABLE IF NOT EXISTS friends (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);

-- Friend Requests
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  related_id UUID DEFAULT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bans
CREATE TABLE IF NOT EXISTS bans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(32) NOT NULL,
  email VARCHAR(255) NOT NULL,
  ip VARCHAR(64) DEFAULT NULL,
  reason TEXT DEFAULT '',
  banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  unbanned BOOLEAN DEFAULT FALSE,
  unbanned_at TIMESTAMPTZ DEFAULT NULL
);

-- Moderation Logs
CREATE TABLE IF NOT EXISTS moderation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  reason TEXT DEFAULT '',
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store Items
CREATE TABLE IF NOT EXISTS store_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  type VARCHAR(32) NOT NULL,
  price INTEGER NOT NULL,
  data JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Purchases (with UNIQUE constraint to prevent duplicates)
CREATE TABLE IF NOT EXISTS user_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES store_items(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

-- Subscriptions (Rail)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Achievements
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Typing Indicators (ephemeral, could use Redis but stored briefly)
CREATE TABLE IF NOT EXISTS typing_indicators (
  channel_id UUID NOT NULL,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

-- Seed default store items
INSERT INTO store_items (name, description, type, price, data) VALUES
  ('Rail Subscription', 'Access to exclusive Rail features, decorations, and chat effects', 'rail', 1000, '{}'),
  ('Neon Name', 'Make your username glow in neon colors', 'name_color', 200, '{"color": "#00ffcc"}'),
  ('Crimson Name', 'A bold crimson name color', 'name_color', 200, '{"color": "#dc143c"}'),
  ('Gold Name', 'Prestigious gold name color', 'name_color', 300, '{"color": "#ffd700"}'),
  ('Confetti Effect', 'Send confetti bursting with every message', 'chat_effect', 500, '{"effect": "confetti"}'),
  ('Sparkle Effect', 'Your messages sparkle and shimmer', 'chat_effect', 500, '{"effect": "sparkle"}'),
  ('Dark Matter Theme', 'Ultra-dark theme with deep space colors', 'theme', 400, '{"theme": "dark_matter"}'),
  ('Sakura Theme', 'Beautiful pink and white cherry blossom theme', 'theme', 400, '{"theme": "sakura"}')
ON CONFLICT DO NOTHING;
