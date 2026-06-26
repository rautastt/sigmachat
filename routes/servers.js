'use strict';
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { requireAuth, requireVerified } = require('../middleware/auth');
const { generateInviteCode } = require('../utils/helpers');
const upload = require('../middleware/upload');

module.exports = (db, io) => {

  // List user's servers
  router.get('/', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT s.*, sm.role FROM servers s
         JOIN server_members sm ON sm.server_id=s.id
         WHERE sm.user_id=$1 ORDER BY s.created_at`,
        [req.session.userId]
      );
      res.json({ servers: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Search public servers
  router.get('/search', requireAuth, async (req, res) => {
    const q = `%${req.query.q || ''}%`;
    try {
      const result = await db.query(
        `SELECT s.*, (SELECT COUNT(*) FROM server_members WHERE server_id=s.id) AS member_count
         FROM servers s WHERE s.is_public=TRUE AND s.name ILIKE $1 LIMIT 20`,
        [q]
      );
      res.json({ servers: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Get single server
  router.get('/:serverId', requireAuth, async (req, res) => {
    try {
      const isMember = await db.query('SELECT 1 FROM server_members WHERE server_id=$1 AND user_id=$2', [req.params.serverId, req.session.userId]);
      if (isMember.rows.length === 0) return res.status(403).json({ error: 'Not a member.' });
      const result = await db.query('SELECT * FROM servers WHERE id=$1', [req.params.serverId]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Server not found.' });
      const members = await db.query(
        `SELECT u.id, u.username, u.display_name, u.avatar, u.status, u.badge_blue, u.badge_gold, u.badge_rail, u.is_admin, sm.role
         FROM server_members sm JOIN users u ON u.id=sm.user_id WHERE sm.server_id=$1`,
        [req.params.serverId]
      );
      const channels = await db.query('SELECT * FROM channels WHERE server_id=$1 ORDER BY position', [req.params.serverId]);
      res.json({ server: result.rows[0], members: members.rows, channels: channels.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Create server
  router.post('/', requireAuth, requireVerified, [
    body('name').trim().isLength({ min: 2, max: 100 }),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try {
      const invite = generateInviteCode();
      const server = await db.query(
        'INSERT INTO servers (name, description, owner_id, invite_code, is_public) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.body.name, req.body.description || '', req.session.userId, invite, req.body.is_public !== false]
      );
      const s = server.rows[0];
      await db.query('INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,$3)', [s.id, req.session.userId, 'owner']);
      const general = await db.query(
        'INSERT INTO channels (server_id, name, type) VALUES ($1,$2,$3) RETURNING *',
        [s.id, 'general', 'text']
      );
      res.json({ server: s, channel: general.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create server.' });
    }
  });

  // Update server
  router.patch('/:serverId', requireAuth, async (req, res) => {
    try {
      const server = await db.query('SELECT * FROM servers WHERE id=$1', [req.params.serverId]);
      if (server.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
      if (server.rows[0].owner_id !== req.session.userId && !req.session.isAdmin) return res.status(403).json({ error: 'Forbidden.' });
      const { name, description, is_public } = req.body;
      await db.query('UPDATE servers SET name=COALESCE($1,name), description=COALESCE($2,description), is_public=COALESCE($3,is_public) WHERE id=$4',
        [name, description, is_public, req.params.serverId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Upload server icon
  router.post('/:serverId/icon', requireAuth, upload.single('icon'), async (req, res) => {
    const server = await db.query('SELECT owner_id FROM servers WHERE id=$1', [req.params.serverId]);
    if (!server.rows[0] || server.rows[0].owner_id !== req.session.userId) return res.status(403).json({ error: 'Forbidden.' });
    const url = `/uploads/icons/${req.file.filename}`;
    await db.query('UPDATE servers SET icon=$1 WHERE id=$2', [url, req.params.serverId]);
    res.json({ success: true, url });
  });

  // Join via invite
  router.post('/join/:inviteCode', requireAuth, async (req, res) => {
    try {
      const server = await db.query('SELECT * FROM servers WHERE invite_code=$1', [req.params.inviteCode]);
      if (server.rows.length === 0) return res.status(404).json({ error: 'Invalid invite.' });
      const s = server.rows[0];
      const already = await db.query('SELECT 1 FROM server_members WHERE server_id=$1 AND user_id=$2', [s.id, req.session.userId]);
      if (already.rows.length > 0) return res.json({ server: s, already: true });
      await db.query('INSERT INTO server_members (server_id, user_id) VALUES ($1,$2)', [s.id, req.session.userId]);
      io.to(`server:${s.id}`).emit('member_joined', { serverId: s.id, userId: req.session.userId });
      res.json({ server: s });
    } catch (err) {
      res.status(500).json({ error: 'Failed to join.' });
    }
  });

  // Leave server
  router.post('/:serverId/leave', requireAuth, async (req, res) => {
    try {
      const server = await db.query('SELECT * FROM servers WHERE id=$1', [req.params.serverId]);
      if (!server.rows[0]) return res.status(404).json({ error: 'Not found.' });
      if (server.rows[0].owner_id === req.session.userId) return res.status(400).json({ error: 'Owner cannot leave. Transfer ownership or delete server.' });
      await db.query('DELETE FROM server_members WHERE server_id=$1 AND user_id=$2', [req.params.serverId, req.session.userId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Delete server
  router.delete('/:serverId', requireAuth, async (req, res) => {
    try {
      const server = await db.query('SELECT * FROM servers WHERE id=$1', [req.params.serverId]);
      if (!server.rows[0]) return res.status(404).json({ error: 'Not found.' });
      if (server.rows[0].owner_id !== req.session.userId && !req.session.isAdmin) return res.status(403).json({ error: 'Forbidden.' });
      await db.query('DELETE FROM servers WHERE id=$1', [req.params.serverId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Channels
  router.post('/:serverId/channels', requireAuth, [
    body('name').trim().isLength({ min: 1, max: 100 }),
  ], async (req, res) => {
    try {
      const server = await db.query('SELECT * FROM servers WHERE id=$1', [req.params.serverId]);
      if (!server.rows[0]) return res.status(404).json({ error: 'Not found.' });
      const member = await db.query('SELECT role FROM server_members WHERE server_id=$1 AND user_id=$2', [req.params.serverId, req.session.userId]);
      if (!member.rows[0] || !['owner', 'admin', 'moderator'].includes(member.rows[0].role)) return res.status(403).json({ error: 'Forbidden.' });
      const count = await db.query('SELECT COUNT(*) FROM channels WHERE server_id=$1', [req.params.serverId]);
      const channel = await db.query(
        'INSERT INTO channels (server_id, name, topic, type, position) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.params.serverId, req.body.name, req.body.topic || '', req.body.type || 'text', parseInt(count.rows[0].count)]
      );
      io.to(`server:${req.params.serverId}`).emit('channel_created', channel.rows[0]);
      res.json({ channel: channel.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  router.delete('/:serverId/channels/:channelId', requireAuth, async (req, res) => {
    try {
      const server = await db.query('SELECT * FROM servers WHERE id=$1', [req.params.serverId]);
      if (!server.rows[0]) return res.status(404).json({ error: 'Not found.' });
      const member = await db.query('SELECT role FROM server_members WHERE server_id=$1 AND user_id=$2', [req.params.serverId, req.session.userId]);
      if (!member.rows[0] || !['owner', 'admin'].includes(member.rows[0].role)) return res.status(403).json({ error: 'Forbidden.' });
      await db.query('DELETE FROM channels WHERE id=$1 AND server_id=$2', [req.params.channelId, req.params.serverId]);
      io.to(`server:${req.params.serverId}`).emit('channel_deleted', { channelId: req.params.channelId });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Regenerate invite
  router.post('/:serverId/regen-invite', requireAuth, async (req, res) => {
    try {
      const server = await db.query('SELECT * FROM servers WHERE id=$1', [req.params.serverId]);
      if (!server.rows[0] || server.rows[0].owner_id !== req.session.userId) return res.status(403).json({ error: 'Forbidden.' });
      const code = generateInviteCode();
      await db.query('UPDATE servers SET invite_code=$1 WHERE id=$2', [code, req.params.serverId]);
      res.json({ invite_code: code });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  return router;
};
