const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

router.get('/', (req, res) => {
  const { status } = req.query;
  let q = `SELECT oo.*, wo.wo_no, wo.product_name as wo_product FROM outsource_orders oo LEFT JOIN work_orders wo ON wo.id=oo.work_order_id`;
  if (status && status !== 'all') q += ' WHERE oo.status=?';
  q += ' ORDER BY oo.created_at DESC LIMIT 100';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { work_order_id, vendor_name, process_name, product_name, qty, unit_cost, sent_at, expected_return, note } = req.body;
  if (!vendor_name || !process_name || !qty) return res.status(400).json({ error: '廠商、製程、數量為必填' });
  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM outsource_orders WHERE out_no LIKE ?').get(`OUT-${year}-%`).cnt + 1;
  const out_no = `OUT-${year}-${String(seq).padStart(3, '0')}`;
  const wo = work_order_id ? db.prepare('SELECT wo_no, product_name FROM work_orders WHERE id=?').get(work_order_id) : null;
  const total = qty * (unit_cost || 0);

  db.prepare(`INSERT INTO outsource_orders (id,out_no,work_order_id,wo_no,vendor_name,process_name,product_name,qty,unit_cost,total_cost,sent_at,expected_return,status,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`)
    .run(id, out_no, work_order_id || null, wo?.wo_no || '', vendor_name, process_name, product_name || wo?.product_name || '', qty, unit_cost || 0, total, sent_at || dayjs().format('YYYY-MM-DD'), expected_return || '', note || '');

  res.json({ ok: true, id, out_no });
});

router.patch('/:id/status', (req, res) => {
  const { status, received_qty, actual_return, note } = req.body;
  const oo = db.prepare('SELECT * FROM outsource_orders WHERE id=?').get(req.params.id);
  if (!oo) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE outsource_orders SET status=?, received_qty=?, actual_return=?, note=? WHERE id=?')
    .run(status, received_qty ?? oo.received_qty, actual_return || dayjs().format('YYYY-MM-DD'), note || oo.note, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM outsource_orders WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 統計分析
router.get('/stats', (req, res) => {
  const { year } = req.query;
  const y = year || dayjs().format('YYYY');
  const stats = db.prepare(`
    SELECT vendor_name,
      COUNT(*) as order_count,
      SUM(qty) as total_qty,
      SUM(total_cost) as total_cost,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN actual_return > expected_return AND status='completed' THEN 1 ELSE 0 END) as late_count
    FROM outsource_orders
    WHERE strftime('%Y', created_at)=?
    GROUP BY vendor_name ORDER BY total_cost DESC
  `).all(y);
  res.json(stats);
});

module.exports = router;
