'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

module.exports = (db) => {

  // List store items
  router.get('/', requireAuth, async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM store_items WHERE active=TRUE ORDER BY type, price');
      const purchases = await db.query('SELECT DISTINCT item_id FROM user_purchases WHERE user_id=$1', [req.session.userId]);
      const owned = new Set(purchases.rows.map(r => r.item_id));
      const items = result.rows.map(item => ({ ...item, owned: owned.has(item.id) }));
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // Purchase item
  router.post('/buy/:itemId', requireAuth, async (req, res) => {
    try {
      const item = await db.query('SELECT * FROM store_items WHERE id=$1 AND active=TRUE', [req.params.itemId]);
      if (!item.rows[0]) return res.status(404).json({ error: 'Item not found.' });
      const it = item.rows[0];
      const alreadyOwned = await db.query('SELECT 1 FROM user_purchases WHERE user_id=$1 AND item_id=$2', [req.session.userId, it.id]);
      if (alreadyOwned.rows.length > 0) return res.status(409).json({ error: 'Already purchased.' });
      const user = await db.query('SELECT points, badge_rail FROM users WHERE id=$1', [req.session.userId]);
      const u = user.rows[0];
      if (u.points < it.price) return res.status(402).json({ error: 'Not enough points.' });

      // Deduct points
      await db.query('UPDATE users SET points=points-$1 WHERE id=$2', [it.price, req.session.userId]);
      
      // Add purchase record
      await db.query('INSERT INTO user_purchases (user_id, item_id) VALUES ($1,$2)', [req.session.userId, it.id]);

      // Apply the item effect
      const data = it.data || {};
      if (it.type === 'rail') {
        await db.query('UPDATE users SET badge_rail=TRUE WHERE id=$1', [req.session.userId]);
        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db.query('INSERT INTO subscriptions (user_id, type, expires_at) VALUES ($1,$2,$3)', [req.session.userId, 'rail', expires]);
      } else if (it.type === 'name_color') {
        await db.query('UPDATE users SET name_color=$1 WHERE id=$2', [data.color, req.session.userId]);
      } else if (it.type === 'chat_effect') {
        await db.query('UPDATE users SET chat_effect=$1 WHERE id=$2', [data.effect, req.session.userId]);
      } else if (it.type === 'theme') {
        await db.query('UPDATE users SET theme=$1 WHERE id=$2', [data.theme, req.session.userId]);
      }

      const newPoints = u.points - it.price;
      res.json({ success: true, newPoints });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed.' });
    }
  });

  // My purchases
  router.get('/my-purchases', requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT si.*, up.purchased_at FROM user_purchases up
         JOIN store_items si ON si.id=up.item_id WHERE up.user_id=$1`,
        [req.session.userId]
      );
      res.json({ purchases: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed.' });
    }
  });

  return router;
};
