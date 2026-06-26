'use strict';
const crypto = require('crypto');

function generateToken(length = 48) {
  return crypto.randomBytes(length).toString('hex');
}

function generateInviteCode(length = 8) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

function calcLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp)) + 1;
}

function sanitizeUser(user) {
  const { password_hash, verification_token, reset_token, ...safe } = user;
  return safe;
}

function isTimedOut(user) {
  if (!user.timeout_until) return false;
  return new Date(user.timeout_until) > new Date();
}

module.exports = { generateToken, generateInviteCode, calcLevel, sanitizeUser, isTimedOut };
