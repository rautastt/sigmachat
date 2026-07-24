'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { generateToken, generateInviteCode, calcLevel } = require('../utils/helpers');
const { sendVerificationEmail, sendPasswordResetEmail, sendEmailChangeVerification } = require('../utils/email');

const { authLimiter } = require('../middleware/ratelimit');
const { requireAuth } = require('../middleware/auth');

module.exports = (db) => {
  // ===== LOGIN =====
  router.post('/login', authLimiter, [
    body('username').isString(),
    body('password').isString(),
  ], async (req, res) => {
    try {
      const result = await db.query(
        'SELECT id, username, display_name, email, password_hash, email_verified, is_admin FROM users WHERE (username=$1 OR email=$1) AND is_banned=FALSE',
        [req.body.username]
      );
      if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
      const user = result.rows[0];
      const match = await bcrypt.compare(req.body.password, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.displayName = user.display_name;
      req.session.isAdmin = user.is_admin;
      req.session.emailVerified = user.email_verified;
      res.json({ success: true, user: { id: user.id, username: user.username, emailVerified: user.email_verified } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // ===== REGISTER =====
  router.post('/register', authLimiter, [
    body('username').isLength({ min: 3, max: 32 }).isAlphanumeric(),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { username, email, password } = req.body;
      const exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
      if (exists.rows.length > 0) return res.status(409).json({ error: 'Username or email already in use.' });

      const hash = await bcrypt.hash(password, 12);
      const verificationToken = generateToken();

      const result = await db.query(
        `INSERT INTO users (username, display_name, email, password_hash, email_verified, verification_token, verification_token_expires)
         VALUES ($1,$2,$3,$4,FALSE,$5,NOW() + INTERVAL '24 hours') RETURNING id, username, email, is_admin, email_verified`,
        [username, username, email, hash, verificationToken]
      );
      const user = result.rows[0];

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.displayName = user.username;
      req.session.isAdmin = user.is_admin;
      req.session.emailVerified = user.email_verified;

      // Send verification email
      try {
        await sendVerificationEmail(email, username, verificationToken);
        console.log('✅ Verification email sent to', email);
      } catch (emailErr) {
        console.error('⚠️ Failed to send verification email:', emailErr.message);
        // Don't fail the registration if email fails
      }

      res.json({ success: true, user: { id: user.id, username: user.username, emailVerified: user.email_verified } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // ===== VERIFY EMAIL =====
  router.post('/verify-email', requireAuth, [
    body('token').isString(),
  ], async (req, res) => {
    try {
      const { token } = req.body;
      const result = await db.query(
        'SELECT id, email FROM users WHERE id=$1 AND verification_token=$2 AND verification_token_expires > NOW()',
        [req.session.userId, token]
      );
      if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token.' });

      await db.query(
        'UPDATE users SET email_verified=TRUE, verified_at=NOW(), verification_token=NULL, verification_token_expires=NULL WHERE id=$1',
        [req.session.userId]
      );
      req.session.emailVerified = true;
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed.' });
    }
  });

  // ===== RESEND VERIFICATION =====
  router.post('/resend-verification', requireAuth, async (req, res) => {
    try {
      const result = await db.query('SELECT username, email, email_verified FROM users WHERE id=$1', [req.session.userId]);
      const user = result.rows[0];
      if (user.email_verified) return res.status(400).json({ error: 'Email already verified.' });
      
      const verificationToken = generateToken();
      await db.query(
        'UPDATE users SET verification_token=$1, verification_token_expires=NOW() + INTERVAL \'24 hours\' WHERE id=$2',
        [verificationToken, req.session.userId]
      );

      // Send verification email
      try {
        await sendVerificationEmail(user.email, user.username, verificationToken);
        console.log('✅ Verification email resent to', user.email);
      } catch (emailErr) {
        console.error('⚠️ Failed to send verification email:', emailErr.message);
        return res.status(500).json({ error: 'Failed to send email. Please try again.' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to resend.' });
    }
  });

  // ===== FORGOT PASSWORD =====
  router.post('/forgot-password', authLimiter, [
    body('email').isString(),
  ], async (req, res) => {
    try {
      const result = await db.query('SELECT id, username FROM users WHERE email=$1', [req.body.email]);
      if (result.rows.length === 0) {
        // Don't reveal if email exists
        return res.json({ success: true });
      }

      const user = result.rows[0];
      const resetToken = generateToken();
      
      await db.query(
        'UPDATE users SET reset_token=$1, reset_token_expires=NOW() + INTERVAL \'1 hour\' WHERE id=$2',
        [resetToken, user.id]
      );

      // Send reset email
      try {
        await sendPasswordResetEmail(req.body.email, user.username, resetToken);
        console.log('✅ Password reset email sent to', req.body.email);
      } catch (emailErr) {
        console.error('⚠️ Failed to send reset email:', emailErr.message);
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // ===== RESET PASSWORD =====
  router.post('/reset-password', [
    body('token').isString(),
    body('password').isLength({ min: 6 }),
  ], async (req, res) => {
    try {
      const result = await db.query(
        'SELECT id FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()',
        [req.body.token]
      );
      if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token.' });
      const hash = await bcrypt.hash(req.body.password, 12);
      await db.query('UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2', [hash, result.rows[0].id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Reset failed.' });
    }
  });

  // ===== CHANGE PASSWORD =====
  router.post('/change-password', requireAuth, [
    body('currentPassword').isString(),
    body('newPassword').isLength({ min: 6 }),
  ], async (req, res) => {
    try {
      const result = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.session.userId]);
      if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
      const match = await bcrypt.compare(req.body.currentPassword, result.rows[0].password_hash);
      if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
      const hash = await bcrypt.hash(req.body.newPassword, 12);
      await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.session.userId]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // ===== CHANGE EMAIL =====
  router.post('/change-email', requireAuth, [
    body('email').isEmail(),
    body('password').isString(),
  ], async (req, res) => {
    try {
      const result = await db.query('SELECT password_hash, username FROM users WHERE id=$1', [req.session.userId]);
      if (!result.rows[0]) return res.status(401).json({ error: 'User not found' });
      const match = await bcrypt.compare(req.body.password, result.rows[0].password_hash);
      if (!match) return res.status(401).json({ error: 'Password is incorrect.' });
      const exists = await db.query('SELECT id FROM users WHERE email=$1 AND id!=$2', [req.body.email, req.session.userId]);
      if (exists.rows.length > 0) return res.status(409).json({ error: 'Email already in use.' });
      
      const verificationToken = generateToken();
      await db.query(
        'UPDATE users SET email=$1, email_verified=FALSE, verification_token=$2, verification_token_expires=NOW() + INTERVAL \'24 hours\' WHERE id=$3',
        [req.body.email, verificationToken, req.session.userId]
      );

      // Send verification email for new email
      try {
        await sendEmailChangeVerification(req.body.email, result.rows[0].username, verificationToken);
        console.log('✅ Email change verification sent to', req.body.email);
      } catch (emailErr) {
        console.error('⚠️ Failed to send email change verification:', emailErr.message);
        return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // ===== CHANGE USERNAME =====
  router.post('/change-username', requireAuth, [
    body('username').isLength({ min: 3, max: 32 }).isAlphanumeric(),
  ], async (req, res) => {
    try {
      const exists = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [req.body.username, req.session.userId]);
      if (exists.rows.length > 0) return res.status(409).json({ error: 'Username already in use.' });
      await db.query('UPDATE users SET username=$1, display_name=$1 WHERE id=$2', [req.body.username, req.session.userId]);
      req.session.username = req.body.username;
      req.session.displayName = req.body.username;
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // ===== GET PROFILE =====
  router.get('/profile', requireAuth, async (req, res) => {
    try {
      const result = await db.query('SELECT id, username, display_name, email, email_verified, avatar, banner, bio, status, created_at FROM users WHERE id=$1', [req.session.userId]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  // ===== LOGOUT =====
  router.post('/logout', (req, res) => {
    try {
      db.query('DELETE FROM session WHERE sess::jsonb->\'userId\' = to_jsonb($1::text)', [req.session.userId]);
      req.session.destroy(() => res.json({ success: true }));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed.' });
    }
  });

  return router;
};
