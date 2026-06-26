'use strict';
const express = require('express');
const router = express.Router();
const sanitizeHtml = require('sanitize-html');
const { requireAuth } = require('../middleware/auth');
const { messageLimiter } = require('../middleware/ratelimit');

module.exports = (db, io) => {

  // DM conversation list
  router.get('/', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT DISTINCT ON (partner_id)
           CASE WHEN sender_id=$1 THEN receiver_id ELSE sender_id END AS partner_id,
           content, created_at
         FROM dms WHERE sender_id=$1 OR receiver_id=$1
         ORDER BY partner_id, created_at DESC`,
        [req.session.userId]
      );
      const withUsers = await Promise.all(result.rows.map(async (row) => {
        const u = await db.query('SELECT id, username, display_name, avatar, status FROM users WHERE id=$1', [row.partner_id]);
        return { ...row, user: u.rows[0] };
      }));
      res.json({ conversations: withUsers });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Get DMs with user
  router.get('/:userId', requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || '50'), 100);
      const before = req.query.before;
      let q, params;
      if (before) {
        q = `SELECT d.*, u.username, u.display_name, u.avatar FROM dms d
             JOIN users u ON u.id=d.sender_id
             WHERE ((d.sender_id=$1 AND d.receiver_id=$2) OR (d.sender_id=$2 AND d.receiver_id=$1))
             AND d.created_at < (SELECT created_at FROM dms WHERE id=$3)
             ORDER BY d.created_at DESC LIMIT $4`;
        params = [req.session.userId, req.params.userId, before, limit];
      } else {
        q = `SELECT d.*, u.username, u.display_name, u.avatar FROM dms d
             JOIN users u ON u.id=d.sender_id
             WHERE (d.sender_id=$1 AND d.receiver_id=$2) OR (d.sender_id=$2 AND d.receiver_id=$1)
             ORDER BY d.created_at DESC LIMIT $3`;
        params = [req.session.userId, req.params.userId, limit];
      }
      const result = await db.query(q, params);
      // Mark read
      await db.query('UPDATE dms SET read=TRUE WHERE sender_id=$1 AND receiver_id=$2 AND read=FALSE', [req.params.userId, req.session.userId]);
      res.json({ messages: result.rows.reverse() });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Send DM
  router.post('/:userId', requireAuth, messageLimiter, async (req, res) => {
    try {
      let content = sanitizeHtml(req.body.content || '', { allowedTags: [], allowedAttributes: {} }).trim();
      if (!content) return res.status(400).json({ error: 'Empty message.' });
      if (content.length > 2000) return res.status(400).json({ error: 'Too long.' });
      const target = await db.query('SELECT id FROM users WHERE id=$1 AND is_banned=FALSE', [req.params.userId]);
      if (!target.rows[0]) return res.status(404).json({ error: 'User not found.' });

      const msg = await db.query(
        'INSERT INTO dms (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING *',
        [req.session.userId, req.params.userId, content]
      );
      const m = msg.rows[0];
      const sender = await db.query('SELECT username, display_name, avatar FROM users WHERE id=$1', [req.session.userId]);
      const full = { ...m, ...sender.rows[0] };

      io.to(`user:${req.params.userId}`).emit('new_dm', full);
      io.to(`user:${req.session.userId}`).emit('new_dm', full);
      res.json({ message: full });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Groups
  router.get('/groups/list', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT g.* FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=$1`,
        [req.session.userId]
      );
      res.json({ groups: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  router.post('/groups/create', requireAuth, async (req, res) => {
    try {
      const { name, memberIds } = req.body;
      if (!name || !Array.isArray(memberIds)) return res.status(400).json({ error: 'Invalid data.' });
      const group = await db.query('INSERT INTO groups (name, owner_id) VALUES ($1,$2) RETURNING *', [name, req.session.userId]);
      const g = group.rows[0];
      const allMembers = [...new Set([req.session.userId, ...memberIds])];
      for (const uid of allMembers) {
        await db.query('INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g.id, uid]);
      }
      res.json({ group: g });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  router.get('/groups/:groupId/messages', requireAuth, async (req, res) => {
    try {
      const member = await db.query('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2', [req.params.groupId, req.session.userId]);
      if (!member.rows[0]) return res.status(403).json({ error: 'Not a member.' });
      const result = await db.query(
        `SELECT gm.*, u.username, u.display_name, u.avatar FROM group_messages gm
         JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 ORDER BY gm.created_at DESC LIMIT 50`,
        [req.params.groupId]
      );
      res.json({ messages: result.rows.reverse() });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  router.post('/groups/:groupId/messages', requireAuth, messageLimiter, async (req, res) => {
    try {
      const member = await db.query('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2', [req.params.groupId, req.session.userId]);
      if (!member.rows[0]) return res.status(403).json({ error: 'Not a member.' });
      let content = sanitizeHtml(req.body.content || '', { allowedTags: [], allowedAttributes: {} }).trim();
      if (!content) return res.status(400).json({ error: 'Empty.' });
      const msg = await db.query('INSERT INTO group_messages (group_id, user_id, content) VALUES ($1,$2,$3) RETURNING *', [req.params.groupId, req.session.userId, content]);
      const u = await db.query('SELECT username, display_name, avatar FROM users WHERE id=$1', [req.session.userId]);
      const full = { ...msg.rows[0], ...u.rows[0] };
      io.to(`group:${req.params.groupId}`).emit('new_group_message', full);
      res.json({ message: full });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  return router;
};
