'use strict';
const express = require('express');
const router = express.Router();
const sanitizeHtml = require('sanitize-html');
const { requireAuth } = require('../middleware/auth');
const { messageLimiter } = require('../middleware/ratelimit');
const { calcLevel, isTimedOut } = require('../utils/helpers');

module.exports = (db, io) => {

  // Get messages for a channel
  router.get('/channel/:channelId', requireAuth, async (req, res) => {
    try {
      const channel = await db.query('SELECT * FROM channels WHERE id=$1', [req.params.channelId]);
      if (!channel.rows[0]) return res.status(404).json({ error: 'Channel not found.' });
      const member = await db.query(
        'SELECT 1 FROM server_members WHERE server_id=$1 AND user_id=$2',
        [channel.rows[0].server_id, req.session.userId]
      );
      if (!member.rows[0]) return res.status(403).json({ error: 'Not a member.' });

      const before = req.query.before;
      const limit = Math.min(parseInt(req.query.limit || '50'), 100);

      let query, params;
      if (before) {
        query = `SELECT m.*, u.username, u.display_name, u.avatar, u.badge_blue, u.badge_gold, u.badge_rail, u.is_admin, u.name_color
                 FROM messages m JOIN users u ON u.id=m.user_id
                 WHERE m.channel_id=$1 AND m.created_at < (SELECT created_at FROM messages WHERE id=$2)
                 ORDER BY m.created_at DESC LIMIT $3`;
        params = [req.params.channelId, before, limit];
      } else {
        query = `SELECT m.*, u.username, u.display_name, u.avatar, u.badge_blue, u.badge_gold, u.badge_rail, u.is_admin, u.name_color
                 FROM messages m JOIN users u ON u.id=m.user_id
                 WHERE m.channel_id=$1 ORDER BY m.created_at DESC LIMIT $2`;
        params = [req.params.channelId, limit];
      }
      const result = await db.query(query, params);
      res.json({ messages: result.rows.reverse() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Pinned messages
  router.get('/channel/:channelId/pinned', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT m.*, u.username, u.display_name, u.avatar FROM messages m
         JOIN users u ON u.id=m.user_id WHERE m.channel_id=$1 AND m.is_pinned=TRUE ORDER BY m.created_at`,
        [req.params.channelId]
      );
      res.json({ messages: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Send message
  router.post('/channel/:channelId', requireAuth, messageLimiter, async (req, res) => {
    try {
      const user = await db.query('SELECT * FROM users WHERE id=$1', [req.session.userId]);
      const u = user.rows[0];
      if (!u) return res.status(404).json({ error: 'User not found.' });
      if (u.is_banned) return res.status(403).json({ error: 'Banned.' });
      if (isTimedOut(u)) return res.status(403).json({ error: 'You are timed out.' });

      const channel = await db.query('SELECT * FROM channels WHERE id=$1', [req.params.channelId]);
      if (!channel.rows[0]) return res.status(404).json({ error: 'Channel not found.' });
      const member = await db.query(
        'SELECT 1 FROM server_members WHERE server_id=$1 AND user_id=$2',
        [channel.rows[0].server_id, req.session.userId]
      );
      if (!member.rows[0]) return res.status(403).json({ error: 'Not a member.' });

      let content = sanitizeHtml(req.body.content || '', { allowedTags: [], allowedAttributes: {} }).trim();
      if (!content) return res.status(400).json({ error: 'Message cannot be empty.' });
      if (content.length > 2000) return res.status(400).json({ error: 'Message too long.' });

      const msg = await db.query(
        'INSERT INTO messages (channel_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
        [req.params.channelId, req.session.userId, content]
      );
      const message = msg.rows[0];

      // Award XP and points
      const newXp = u.xp + 5;
      const newPoints = u.points + 1;
      const newLevel = calcLevel(newXp);
      await db.query('UPDATE users SET xp=$1, points=$2, level=$3 WHERE id=$4', [newXp, newPoints, newLevel, req.session.userId]);

      const full = {
        ...message,
        username: u.username,
        display_name: u.display_name,
        avatar: u.avatar,
        badge_blue: u.badge_blue,
        badge_gold: u.badge_gold,
        badge_rail: u.badge_rail,
        is_admin: u.is_admin,
        name_color: u.name_color,
        chat_effect: u.chat_effect,
      };

      io.to(`channel:${req.params.channelId}`).emit('new_message', full);
      res.json({ message: full });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Delete message
  router.delete('/:messageId', requireAuth, async (req, res) => {
    try {
      const msg = await db.query('SELECT * FROM messages WHERE id=$1', [req.params.messageId]);
      if (!msg.rows[0]) return res.status(404).json({ error: 'Not found.' });
      const m = msg.rows[0];
      const channel = await db.query('SELECT * FROM channels WHERE id=$1', [m.channel_id]);
      const ch = channel.rows[0];
      const member = await db.query('SELECT role FROM server_members WHERE server_id=$1 AND user_id=$2', [ch.server_id, req.session.userId]);
      const isMod = member.rows[0] && ['owner', 'admin', 'moderator'].includes(member.rows[0].role);
      if (m.user_id !== req.session.userId && !isMod && !req.session.isAdmin) return res.status(403).json({ error: 'Forbidden.' });

      await db.query('DELETE FROM messages WHERE id=$1', [req.params.messageId]);
      io.to(`channel:${m.channel_id}`).emit('message_deleted', { messageId: req.params.messageId, channelId: m.channel_id });

      if (isMod && m.user_id !== req.session.userId) {
        await db.query('INSERT INTO moderation_logs (admin_id, target_user_id, action, details) VALUES ($1,$2,$3,$4)',
          [req.session.userId, m.user_id, 'delete_message', JSON.stringify({ messageId: req.params.messageId, content: m.content })]);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Edit message
  router.patch('/:messageId', requireAuth, async (req, res) => {
    try {
      const msg = await db.query('SELECT * FROM messages WHERE id=$1', [req.params.messageId]);
      if (!msg.rows[0]) return res.status(404).json({ error: 'Not found.' });
      if (msg.rows[0].user_id !== req.session.userId) return res.status(403).json({ error: 'Forbidden.' });
      let content = sanitizeHtml(req.body.content || '', { allowedTags: [], allowedAttributes: {} }).trim();
      if (!content) return res.status(400).json({ error: 'Empty.' });
      const updated = await db.query('UPDATE messages SET content=$1, edited_at=NOW() WHERE id=$2 RETURNING *', [content, req.params.messageId]);
      io.to(`channel:${updated.rows[0].channel_id}`).emit('message_edited', { messageId: req.params.messageId, content, channelId: updated.rows[0].channel_id });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Pin/unpin
  router.post('/:messageId/pin', requireAuth, async (req, res) => {
    try {
      const msg = await db.query('SELECT m.*, c.server_id FROM messages m JOIN channels c ON c.id=m.channel_id WHERE m.id=$1', [req.params.messageId]);
      if (!msg.rows[0]) return res.status(404).json({ error: 'Not found.' });
      const m = msg.rows[0];
      const member = await db.query('SELECT role FROM server_members WHERE server_id=$1 AND user_id=$2', [m.server_id, req.session.userId]);
      if (!member.rows[0] || !['owner', 'admin', 'moderator'].includes(member.rows[0].role)) return res.status(403).json({ error: 'Forbidden.' });
      const pinned = !m.is_pinned;
      await db.query('UPDATE messages SET is_pinned=$1 WHERE id=$2', [pinned, req.params.messageId]);
      io.to(`channel:${m.channel_id}`).emit('message_pinned', { messageId: req.params.messageId, pinned, channelId: m.channel_id });
      res.json({ success: true, pinned });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  return router;
};
