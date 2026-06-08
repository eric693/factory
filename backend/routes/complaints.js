const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

router.get('/', (req, res) => {
  const { status } = req.query;
  let q = 'SELECT * FROM complaints';
  if (status && status !== 'all') q += ' WHERE status=?';
  q += ' ORDER BY created_at DESC LIMIT 100';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { customer_name, product_name, product_code, issue_date, severity, related_order_id, related_wo_id, d1_team, d2_problem } = req.body;
  if (!customer_name || !d2_problem) return res.status(400).json({ error: '客戶名稱與問題描述為必填' });
  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM complaints WHERE complaint_no LIKE ?').get(`CR-${year}-%`).cnt + 1;
  const complaint_no = `CR-${year}-${String(seq).padStart(3, '0')}`;

  db.prepare(`INSERT INTO complaints (id,complaint_no,customer_name,product_name,product_code,issue_date,severity,status,related_order_id,related_wo_id,d1_team,d2_problem)
    VALUES (?,?,?,?,?,?,?,'open',?,?,?,?)`)
    .run(id, complaint_no, customer_name, product_name || '', product_code || '', issue_date || dayjs().format('YYYY-MM-DD'), severity || 'medium', related_order_id || null, related_wo_id || null, d1_team || '', d2_problem);

  res.json({ ok: true, id, complaint_no });
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

router.patch('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });

  const fields = ['customer_name','product_name','product_code','severity','status','related_order_id','related_wo_id','d1_team','d2_problem','d3_containment','d4_root_cause','d5_corrective','d6_implement','d7_prevent','d8_close'];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (req.body.status === 'closed' && !c.closed_at) updates.closed_at = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const setClauses = Object.keys(updates).map(k => `${k}=?`).join(', ');
  if (!setClauses) return res.json({ ok: true });
  db.prepare(`UPDATE complaints SET ${setClauses} WHERE id=?`).run(...Object.values(updates), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM complaints WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
