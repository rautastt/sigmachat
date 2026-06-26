'use strict';

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function requireVerified(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!req.session.emailVerified) {
    return res.status(403).json({ error: 'Email not verified' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireVerified };
