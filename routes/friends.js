'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

module.exports = (db, io) => {

  // List friends
  router.get('/', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT u.id, u.username, u.display_name, u.avatar, u.status, u.badge_blue, u.badge_gold, u.badge_rail
         FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=$1`,
        [req.session.userId]
      );
      res.json({ friends: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // List pending requests
  router.get('/requests', requireAuth, async (req, res) => {
    try {
      const incoming = await db.query(
        `SELECT fr.id, fr.sender_id, u.username, u.display_name, u.avatar, fr.created_at
         FROM friend_requests fr JOIN users u ON u.id=fr.sender_id
         WHERE fr.receiver_id=$1 AND fr.status='pending'`,
        [req.session.userId]
      );
      const outgoing = await db.query(
        `SELECT fr.id, fr.receiver_id, u.username, u.display_name, u.avatar, fr.created_at
         FROM friend_requests fr JOIN users u ON u.id=fr.receiver_id
         WHERE fr.sender_id=$1 AND fr.status='pending'`,
        [req.session.userId]
      );
      res.json({ incoming: incoming.rows, outgoing: outgoing.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Send friend request
  router.post('/request/:userId', requireAuth, async (req, res) => {
    if (req.params.userId === req.session.userId) return res.status(400).json({ error: 'Cannot add yourself.' });
    try {
      const target = await db.query('SELECT id, username FROM users WHERE id=$1 AND is_banned=FALSE', [req.params.userId]);
      if (!target.rows[0]) return res.status(404).json({ error: 'User not found.' });
      const already = await db.query('SELECT 1 FROM friends WHERE user_id=$1 AND friend_id=$2', [req.session.userId, req.params.userId]);
      if (already.rows.length > 0) return res.status(409).json({ error: 'Already friends.' });
      const existing = await db.query('SELECT * FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2', [req.session.userId, req.params.userId]);
      if (existing.rows.length > 0) return res.status(409).json({ error: 'Request already sent.' });
      // Check if reverse exists — auto-accept
      const reverse = await db.query('SELECT * FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2 AND status=\'pending\'', [req.params.userId, req.session.userId]);
      if (reverse.rows.length > 0) {
        await db.query('UPDATE friend_requests SET status=\'accepted\' WHERE id=$1', [reverse.rows[0].id]);
        await db.query('INSERT INTO friends (user_id, friend_id) VALUES ($1,$2),($3,$4) ON CONFLICT DO NOTHING',
          [req.session.userId, req.params.userId, req.params.userId, req.session.userId]);
        io.to(`user:${req.params.userId}`).emit('friend_accepted', { userId: req.session.userId });
        return res.json({ success: true, accepted: true });
      }
      await db.query('INSERT INTO friend_requests (sender_id, receiver_id) VALUES ($1,$2)', [req.session.userId, req.params.userId]);
      await db.query('INSERT INTO notifications (user_id, type, content, related_id) VALUES ($1,$2,$3,$4)',
        [req.params.userId, 'friend_request', `${req.session.username} sent you a friend request.`, req.session.userId]);
      io.to(`user:${req.params.userId}`).emit('friend_request', { from: req.session.userId, username: req.session.username });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Accept request
  router.post('/accept/:requestId', requireAuth, async (req, res) => {
    try {
      const req2 = await db.query('SELECT * FROM friend_requests WHERE id=$1 AND receiver_id=$2 AND status=\'pending\'', [req.params.requestId, req.session.userId]);
      if (!req2.rows[0]) return res.status(404).json({ error: 'Request not found.' });
      const fr = req2.rows[0];
      await db.query('UPDATE friend_requests SET status=\'accepted\' WHERE id=$1', [fr.id]);
      await db.query('INSERT INTO friends (user_id, friend_id) VALUES ($1,$2),($3,$4) ON CONFLICT DO NOTHING',
        [fr.sender_id, fr.receiver_id, fr.receiver_id, fr.sender_id]);
      await db.query('INSERT INTO notifications (user_id, type, content, related_id) VALUES ($1,$2,$3,$4)',
        [fr.sender_id, 'friend_accepted', `${req.session.username} accepted your friend request.`, req.session.userId]);
      io.to(`user:${fr.sender_id}`).emit('friend_accepted', { userId: req.session.userId });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Decline / cancel request
  router.post('/decline/:requestId', requireAuth, async (req, res) => {
    try {
      await db.query('UPDATE friend_requests SET status=\'declined\' WHERE id=$1 AND (receiver_id=$2 OR sender_id=$2)', [req.params.requestId, req.session.userId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Remove friend
  router.delete('/:userId', requireAuth, async (req, res) => {
    try {
      await db.query('DELETE FROM friends WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)', [req.session.userId, req.params.userId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  return router;
};
