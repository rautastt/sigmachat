'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { generateToken, generateInviteCode, calcLevel } = require('../utils/helpers');

const { authLimiter } = require('../middleware/ratelimit');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

module.exports = (db) => {

  // Register
  router.post('/register', authLimiter, [
    body('username').trim().isLength({ min: 2, max: 32 }).matches(/^[a-zA-Z0-9_.-]+$/),
    body('email').isString(),
    body('password').isLength({ min: 6, max: 128 }),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { username, email, password } = req.body;
    try {
      // Check ban
      const ban = await db.query('SELECT id FROM bans WHERE (email=$1) AND unbanned=FALSE', [email]);
      if (ban.rows.length > 0) return res.status(403).json({ error: 'This account is banned.' });

      const exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
      if (exists.rows.length > 0) return res.status(409).json({ error: 'Username or email already in use.' });

      const hash = await bcrypt.hash(password, 12);

      const result = await db.query(
        `INSERT INTO users (username, display_name, email, password_hash, email_verified)
         VALUES ($1,$2,$3,$4,TRUE) RETURNING id, username, email, is_admin, email_verified`,
        [username, username, email, hash]
      );
      const user = result.rows[0];

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isAdmin = user.is_admin;
      req.session.emailVerified = user.email_verified;

      res.json({ success: true, user: { id: user.id, username: user.username, emailVerified: user.email_verified } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Registration failed.' });
    }
  });

  // Login
  router.post('/login', authLimiter, [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input.' });

    const { username, password } = req.body;
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE (username=$1 OR email=$1)',
        [username]
      );
      if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });
      const user = result.rows[0];

      if (user.is_banned) return res.status(403).json({ error: 'Your account has been banned.' });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

      await db.query('UPDATE users SET last_seen=NOW(), status=$1 WHERE id=$2', ['online', user.id]);

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isAdmin = user.is_admin;
      req.session.emailVerified = user.email_verified;

      const { password_hash, verification_token, reset_token, ...safe } = user;
      res.json({ success: true, user: safe });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed.' });
    }
  });

  // Logout
  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  // Me
  router.get('/me', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, username, display_name, email, avatar, banner, bio, status, custom_status,
                email_verified, is_admin, badge_blue, badge_gold, badge_rail, xp, level, points,
                name_color, chat_effect, theme, created_at, last_seen
         FROM users WHERE id=$1`,
        [req.session.userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
      res.json({ user: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch user.' });
    }
  });

  // Verify email
  router.get('/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send('Invalid token.');
    try {
      const result = await db.query(
        'SELECT id FROM users WHERE verification_token=$1 AND verification_token_expires > NOW()',
        [token]
      );
      if (result.rows.length === 0) return res.status(400).send('Token invalid or expired.');
      await db.query(
        'UPDATE users SET email_verified=TRUE, verified_at=NOW(), verification_token=NULL, verification_token_expires=NULL WHERE id=$1',
        [result.rows[0].id]
      );
      if (req.session.userId === result.rows[0].id) req.session.emailVerified = true;
      res.redirect('/?verified=1');
    } catch (err) {
      res.status(500).send('Verification failed.');
    }
  });

  // Resend verification
  router.post('/resend-verification', requireAuth, async (req, res) => {
    try {
      const result = await db.query('SELECT username, email, email_verified FROM users WHERE id=$1', [req.session.userId]);
      const user = result.rows[0];
      if (user.email_verified) return res.status(400).json({ error: 'Email already verified.' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to resend.' });
    }
  });

  // Forgot password
  router.post('/forgot-password', authLimiter, [
    body('email').isString(),
  ], async (req, res) => {
    try {
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Reset password
  router.post('/reset-password', authLimiter, [
    body('token').notEmpty(),
    body('password').isLength({ min: 6, max: 128 }),
  ], async (req, res) => {
    try {
      const result = await db.query(
        'SELECT id FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()',
        [req.body.token]
      );
      if (result.rows.length === 0) return res.status(400).json({ error: 'Token invalid or expired.' });
      const hash = await bcrypt.hash(req.body.password, 12);
      await db.query('UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2', [hash, result.rows[0].id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Reset failed.' });
    }
  });

  // Change password
  router.post('/change-password', requireAuth, [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6, max: 128 }),
  ], async (req, res) => {
    try {
      const result = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.session.userId]);
      const match = await bcrypt.compare(req.body.currentPassword, result.rows[0].password_hash);
      if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
      const hash = await bcrypt.hash(req.body.newPassword, 12);
      await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.session.userId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Change email
  router.post('/change-email', requireAuth, [
    body('email').isString(),
    body('password').notEmpty(),
  ], async (req, res) => {
    try {
      const result = await db.query('SELECT password_hash, username FROM users WHERE id=$1', [req.session.userId]);
      const match = await bcrypt.compare(req.body.password, result.rows[0].password_hash);
      if (!match) return res.status(401).json({ error: 'Password is incorrect.' });
      const exists = await db.query('SELECT id FROM users WHERE email=$1 AND id!=$2', [req.body.email, req.session.userId]);
      if (exists.rows.length > 0) return res.status(409).json({ error: 'Email already in use.' });
      await db.query('UPDATE users SET email=$1, email_verified=TRUE WHERE id=$2',
        [req.body.email, req.session.userId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Change username
  router.post('/change-username', requireAuth, [
    body('username').trim().isLength({ min: 2, max: 32 }).matches(/^[a-zA-Z0-9_.-]+$/),
  ], async (req, res) => {
    try {
      const verified = await db.query('SELECT email_verified FROM users WHERE id=$1', [req.session.userId]);
      if (!verified.rows[0].email_verified) return res.status(403).json({ error: 'Email must be verified to change username.' });
      const exists = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [req.body.username, req.session.userId]);
      if (exists.rows.length > 0) return res.status(409).json({ error: 'Username taken.' });
      await db.query('UPDATE users SET username=$1 WHERE id=$2', [req.body.username, req.session.userId]);
      req.session.username = req.body.username;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Update profile
  router.post('/update-profile', requireAuth, [
    body('bio').optional().isLength({ max: 500 }),
    body('display_name').optional().trim().isLength({ max: 64 }),
    body('custom_status').optional().isLength({ max: 128 }),
    body('status').optional().isIn(['online', 'idle', 'dnd', 'invisible']),
  ], async (req, res) => {
    try {
      const { bio, display_name, custom_status, status } = req.body;
      await db.query(
        'UPDATE users SET bio=$1, display_name=$2, custom_status=$3, status=$4 WHERE id=$5',
        [bio || '', display_name || req.session.username, custom_status || '', status || 'online', req.session.userId]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Upload avatar
  router.post('/upload-avatar', requireAuth, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const url = `/uploads/avatars/${req.file.filename}`;
    await db.query('UPDATE users SET avatar=$1 WHERE id=$2', [url, req.session.userId]);
    res.json({ success: true, url });
  });

  // Upload banner
  router.post('/upload-banner', requireAuth, upload.single('banner'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const url = `/uploads/banners/${req.file.filename}`;
    await db.query('UPDATE users SET banner=$1 WHERE id=$2', [url, req.session.userId]);
    res.json({ success: true, url });
  });

  // Logout all devices (destroy all sessions)
  router.post('/logout-all', requireAuth, async (req, res) => {
    try {
      await db.query('DELETE FROM session WHERE sess::jsonb->\'userId\' = to_jsonb($1::text)', [req.session.userId]);
      req.session.destroy(() => res.json({ success: true }));
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  return router;
};
