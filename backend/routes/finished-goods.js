const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// 庫存列表
router.get('/', (req, res) => {
  const { status } = req.query;
  let q = `SELECT fg.*, o.order_no, o.customer_name as order_customer
    FROM finished_goods fg LEFT JOIN orders o ON o.id=fg.order_id`;
  if (status && status !== 'all') q += ` WHERE fg.status=?`;
  q += ' ORDER BY fg.created_at DESC';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows);
});

// 庫存統計
router.get('/summary', (req, res) => {
  const stats = db.prepare(`
    SELECT product_name, product_code, SUM(qty) as total_qty, COUNT(*) as lot_count
    FROM finished_goods WHERE status='in_stock'
    GROUP BY product_code ORDER BY total_qty DESC
  `).all();
  res.json(stats);
});

// 入庫（工單完工時手動入庫）
router.post('/', (req, res) => {
  const { product_id, product_name, product_code, work_order_id, qty, location, order_id } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO finished_goods (id,product_id,product_name,product_code,work_order_id,qty,location,order_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, product_id || null, product_name, product_code || '', work_order_id || null, qty, location || '', order_id || null);

  db.prepare('INSERT INTO fg_logs (id,fg_id,action,qty,note,operator) VALUES (?,?,?,?,?,?)').run(uuidv4(), id, 'in', qty, '完工入庫', req.body.operator || '');
  res.json({ ok: true, id });
});

// 出庫
router.patch('/:id/ship', (req, res) => {
  const { qty, note, operator } = req.body;
  const fg = db.prepare('SELECT * FROM finished_goods WHERE id=?').get(req.params.id);
  if (!fg) return res.status(404).json({ error: 'Not found' });

  const remaining = fg.qty - (qty || fg.qty);
  const newStatus = remaining <= 0 ? 'shipped' : 'in_stock';
  db.prepare('UPDATE finished_goods SET qty=?, status=? WHERE id=?').run(Math.max(0, remaining), newStatus, req.params.id);
  db.prepare('INSERT INTO fg_logs (id,fg_id,action,qty,note,operator) VALUES (?,?,?,?,?,?)').run(uuidv4(), req.params.id, 'out', qty || fg.qty, note || '出庫', operator || '');
  res.json({ ok: true });
});

// 調整位置
router.patch('/:id/location', (req, res) => {
  db.prepare('UPDATE finished_goods SET location=? WHERE id=?').run(req.body.location, req.params.id);
  res.json({ ok: true });
});

// 異動記錄
router.get('/:id/logs', (req, res) => {
  res.json(db.prepare('SELECT * FROM fg_logs WHERE fg_id=? ORDER BY logged_at DESC').all(req.params.id));
});

module.exports = router;
