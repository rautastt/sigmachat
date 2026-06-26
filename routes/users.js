'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

module.exports = (db) => {

  // Search users
  router.get('/search', requireAuth, async (req, res) => {
    const q = `%${req.query.q || ''}%`;
    try {
      const result = await db.query(
        `SELECT id, username, display_name, avatar, status, badge_blue, badge_gold, badge_rail, is_admin
         FROM users WHERE (username ILIKE $1 OR display_name ILIKE $1) AND is_banned=FALSE LIMIT 20`,
        [q]
      );
      res.json({ users: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Get user profile
  router.get('/:userId', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, username, display_name, avatar, banner, bio, status, custom_status,
                email_verified, is_admin, badge_blue, badge_gold, badge_rail, xp, level, points,
                name_color, theme, created_at, last_seen
         FROM users WHERE id=$1 AND is_banned=FALSE`,
        [req.params.userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
      const user = result.rows[0];
      const friendCount = await db.query('SELECT COUNT(*) FROM friends WHERE user_id=$1', [req.params.userId]);
      user.friend_count = parseInt(friendCount.rows[0].count);
      const isFriend = await db.query('SELECT 1 FROM friends WHERE user_id=$1 AND friend_id=$2', [req.session.userId, req.params.userId]);
      user.is_friend = isFriend.rows.length > 0;
      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Get notifications
  router.get('/me/notifications', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
        [req.session.userId]
      );
      res.json({ notifications: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Mark notification read
  router.post('/me/notifications/:id/read', requireAuth, async (req, res) => {
    await db.query('UPDATE notifications SET read=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.session.userId]);
    res.json({ success: true });
  });

  // Mark all notifications read
  router.post('/me/notifications/read-all', requireAuth, async (req, res) => {
    await db.query('UPDATE notifications SET read=TRUE WHERE user_id=$1', [req.session.userId]);
    res.json({ success: true });
  });

  return router;
};
