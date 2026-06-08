const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

router.get('/', (req, res) => {
  const { status } = req.query;
  let q = 'SELECT * FROM suppliers';
  if (status) q += ' WHERE status=?';
  q += ' ORDER BY name';
  const rows = status ? db.prepare(q).all(status) : db.prepare(q).all();

  const result = rows.map(s => {
    const poStats = db.prepare(`
      SELECT COUNT(*) as total, SUM(total_amount) as total_amount,
        SUM(CASE WHEN status='received' THEN 1 ELSE 0 END) as received
      FROM purchase_orders WHERE supplier=?
    `).get(s.name);
    return { ...s, po_count: poStats.total || 0, po_total: poStats.total_amount || 0 };
  });
  res.json(result);
});

router.post('/', (req, res) => {
  const { code, name, contact, phone, email, address, payment_terms, lead_days, note } = req.body;
  if (!code || !name) return res.status(400).json({ error: '編號與名稱為必填' });
  const id = uuidv4();
  db.prepare(`INSERT INTO suppliers (id,code,name,contact,phone,email,address,payment_terms,lead_days,note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, code, name, contact || '', phone || '', email || '', address || '', payment_terms || '月結30天', lead_days || 7, note || '');
  res.json({ ok: true, id });
});

router.patch('/:id', (req, res) => {
  const { name, contact, phone, email, address, payment_terms, lead_days, rating, status, note } = req.body;
  const s = db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE suppliers SET name=?, contact=?, phone=?, email=?, address=?, payment_terms=?, lead_days=?, rating=?, status=?, note=? WHERE id=?')
    .run(name ?? s.name, contact ?? s.contact, phone ?? s.phone, email ?? s.email, address ?? s.address, payment_terms ?? s.payment_terms, lead_days ?? s.lead_days, rating ?? s.rating, status ?? s.status, note ?? s.note, req.params.id);
  res.json({ ok: true });
});

// 供應商績效（從採購單自動計算）
router.get('/:id/performance', (req, res) => {
  const s = db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });

  const pos = db.prepare(`
    SELECT po.*, pi.material_name
    FROM purchase_orders po
    LEFT JOIN purchase_items pi ON pi.po_id=po.id
    WHERE po.supplier=?
    ORDER BY po.created_at DESC LIMIT 50
  `).all(s.name);

  const completed = pos.filter(p => p.status === 'received');
  const onTime = completed.filter(p => !p.expected_date || p.updated_at <= p.expected_date + ' 23:59:59');
  const deliveryRate = completed.length > 0 ? Math.round(onTime.length / completed.length * 100) : null;
  const totalSpend = pos.reduce((sum, p) => sum + (p.total_amount || 0), 0);

  res.json({ supplier: s, pos, stats: { total_orders: pos.length, completed: completed.length, delivery_rate: deliveryRate, total_spend: totalSpend } });
});

// 新增評鑑
router.post('/:id/evaluate', (req, res) => {
  const { period, delivery_score, quality_score, price_score, po_count, on_time_count, note } = req.body;
  const s = db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const total = Math.round(((delivery_score || 100) * 0.5 + (quality_score || 100) * 0.3 + (price_score || 100) * 0.2));
  const id = uuidv4();
  db.prepare(`INSERT INTO supplier_evaluations (id,supplier_id,period,delivery_score,quality_score,price_score,total_score,po_count,on_time_count,note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.params.id, period, delivery_score || 100, quality_score || 100, price_score || 100, total, po_count || 0, on_time_count || 0, note || '');

  // 更新供應商評分
  db.prepare('UPDATE suppliers SET rating=? WHERE id=?').run(Math.round(total / 20), req.params.id);
  res.json({ ok: true, total_score: total });
});

router.get('/:id/evaluations', (req, res) => {
  const evals = db.prepare('SELECT * FROM supplier_evaluations WHERE supplier_id=? ORDER BY period DESC').all(req.params.id);
  res.json(evals);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
