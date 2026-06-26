'use strict';
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');

module.exports = (db, io) => {

  // All middleware
  router.use(requireAdmin);

  // List users
  router.get('/users', async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, username, display_name, email, avatar, is_admin, badge_blue, badge_gold, badge_rail,
                is_banned, timeout_until, xp, level, points, email_verified, created_at, last_seen
         FROM users ORDER BY created_at DESC`
      );
      res.json({ users: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Ban user
  router.post('/ban/:userId', [body('reason').optional().isLength({ max: 500 })], async (req, res) => {
    try {
      const target = await db.query('SELECT * FROM users WHERE id=$1', [req.params.userId]);
      if (!target.rows[0]) return res.status(404).json({ error: 'User not found.' });
      const u = target.rows[0];
      if (u.is_admin) return res.status(403).json({ error: 'Cannot ban an admin.' });
      // Store ban record
      await db.query('INSERT INTO bans (username, email, reason, banned_by) VALUES ($1,$2,$3,$4)',
        [u.username, u.email, req.body.reason || '', req.session.userId]);
      // Mark user as banned and remove sessions
      await db.query('UPDATE users SET is_banned=TRUE WHERE id=$1', [u.id]);
      await db.query('DELETE FROM session WHERE sess::jsonb->>\'userId\' = $1', [u.id]);
      // Remove from servers and friends
      await db.query('DELETE FROM server_members WHERE user_id=$1', [u.id]);
      await db.query('DELETE FROM friends WHERE user_id=$1 OR friend_id=$1', [u.id]);
      await db.query('DELETE FROM group_members WHERE user_id=$1', [u.id]);
      // Log
      await db.query('INSERT INTO moderation_logs (admin_id, target_user_id, action, reason) VALUES ($1,$2,$3,$4)',
        [req.session.userId, u.id, 'ban', req.body.reason || '']);
      io.to(`user:${u.id}`).emit('banned', { reason: req.body.reason });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Unban user
  router.post('/unban/:userId', async (req, res) => {
    try {
      const target = await db.query('SELECT username, email FROM users WHERE id=$1', [req.params.userId]);
      if (!target.rows[0]) return res.status(404).json({ error: 'Not found.' });
      const u = target.rows[0];
      await db.query('UPDATE users SET is_banned=FALSE WHERE id=$1', [req.params.userId]);
      await db.query('UPDATE bans SET unbanned=TRUE, unbanned_at=NOW() WHERE email=$1 AND unbanned=FALSE', [u.email]);
      await db.query('INSERT INTO moderation_logs (admin_id, target_user_id, action) VALUES ($1,$2,$3)', [req.session.userId, req.params.userId, 'unban']);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Kick from server
  router.post('/kick/:userId/:serverId', async (req, res) => {
    try {
      await db.query('DELETE FROM server_members WHERE user_id=$1 AND server_id=$2', [req.params.userId, req.params.serverId]);
      await db.query('INSERT INTO moderation_logs (admin_id, target_user_id, action, details) VALUES ($1,$2,$3,$4)',
        [req.session.userId, req.params.userId, 'kick', JSON.stringify({ serverId: req.params.serverId })]);
      io.to(`user:${req.params.userId}`).emit('kicked', { serverId: req.params.serverId });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Timeout user
  router.post('/timeout/:userId', [body('minutes').isInt({ min: 1, max: 10080 })], async (req, res) => {
    try {
      const until = new Date(Date.now() + req.body.minutes * 60 * 1000);
      await db.query('UPDATE users SET timeout_until=$1 WHERE id=$2', [until, req.params.userId]);
      await db.query('INSERT INTO moderation_logs (admin_id, target_user_id, action, details) VALUES ($1,$2,$3,$4)',
        [req.session.userId, req.params.userId, 'timeout', JSON.stringify({ until, minutes: req.body.minutes })]);
      io.to(`user:${req.params.userId}`).emit('timed_out', { until });
      res.json({ success: true, until });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Remove timeout
  router.post('/untimeout/:userId', async (req, res) => {
    try {
      await db.query('UPDATE users SET timeout_until=NULL WHERE id=$1', [req.params.userId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Grant/revoke badge
  router.post('/badge/:userId', [body('badge').isIn(['blue', 'gold', 'rail']), body('value').isBoolean()], async (req, res) => {
    try {
      const col = `badge_${req.body.badge}`;
      await db.query(`UPDATE users SET ${col}=$1 WHERE id=$2`, [req.body.value, req.params.userId]);
      await db.query('INSERT INTO moderation_logs (admin_id, target_user_id, action, details) VALUES ($1,$2,$3,$4)',
        [req.session.userId, req.params.userId, req.body.value ? 'grant_badge' : 'revoke_badge', JSON.stringify({ badge: req.body.badge })]);
      io.to(`user:${req.params.userId}`).emit('badge_updated', { badge: req.body.badge, value: req.body.value });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Add/remove points
  router.post('/points/:userId', [body('amount').isInt()], async (req, res) => {
    try {
      await db.query('UPDATE users SET points=GREATEST(0, points+$1) WHERE id=$2', [req.body.amount, req.params.userId]);
      await db.query('INSERT INTO moderation_logs (admin_id, target_user_id, action, details) VALUES ($1,$2,$3,$4)',
        [req.session.userId, req.params.userId, 'modify_points', JSON.stringify({ amount: req.body.amount })]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Reset XP
  router.post('/reset-xp/:userId', async (req, res) => {
    try {
      await db.query('UPDATE users SET xp=0, level=1 WHERE id=$1', [req.params.userId]);
      await db.query('INSERT INTO moderation_logs (admin_id, target_user_id, action) VALUES ($1,$2,$3)', [req.session.userId, req.params.userId, 'reset_xp']);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Grant admin
  router.post('/grant-admin/:userId', async (req, res) => {
    try {
      await db.query('UPDATE users SET is_admin=TRUE WHERE id=$1', [req.params.userId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Moderation logs
  router.get('/logs', async (req, res) => {
    try {
      const result = await db.query(
        `SELECT ml.*, a.username AS admin_username, t.username AS target_username
         FROM moderation_logs ml
         LEFT JOIN users a ON a.id=ml.admin_id
         LEFT JOIN users t ON t.id=ml.target_user_id
         ORDER BY ml.created_at DESC LIMIT 100`
      );
      res.json({ logs: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Ban list
  router.get('/bans', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM bans ORDER BY created_at DESC');
      res.json({ bans: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  return router;
};
