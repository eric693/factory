const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');
const { sendLineNotify } = require('../lineNotify');

const SOURCES = { incoming: '進料檢驗', process: '製程巡檢', final: '成品檢驗', customer: '客訴退貨' };
const DISPOSITIONS = { scrap: '報廢', rework: '重工', concession: '特採放行', return: '退回供應商' };

router.get('/', (req, res) => {
  const { status } = req.query;
  let q = 'SELECT * FROM ncr_records';
  if (status && status !== 'all') q += ' WHERE status=?';
  q += ' ORDER BY created_at DESC LIMIT 100';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { source, product_id, product_name, product_code, work_order_id, defect_qty, defect_description, defect_type, severity, found_by, note } = req.body;
  if (!source || !defect_qty || !defect_description) return res.status(400).json({ error: '來源、數量、描述為必填' });

  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM ncr_records WHERE ncr_no LIKE ?').get(`NCR-${year}-%`).cnt + 1;
  const ncr_no = `NCR-${year}-${String(seq).padStart(4, '0')}`;
  const wo = work_order_id ? db.prepare('SELECT wo_no, product_name, product_code FROM work_orders WHERE id=?').get(work_order_id) : null;

  db.prepare(`INSERT INTO ncr_records (id,ncr_no,source,product_id,product_name,product_code,work_order_id,wo_no,defect_qty,defect_description,defect_type,severity,status,found_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'medium','open',?)`)
    .run(id, ncr_no, source, product_id || null, product_name || wo?.product_name || '', product_code || wo?.product_code || '', work_order_id || null, wo?.wo_no || '', defect_qty, defect_description, defect_type || 'dimension', found_by || '');

  // LINE 通知（高嚴重度）
  if (severity === 'high') {
    sendLineNotify(`NCR 不合格品通報\n編號：${ncr_no}\n產品：${product_name || wo?.product_name}\n數量：${defect_qty}\n${defect_description}`);
  }

  res.json({ ok: true, id, ncr_no });
});

router.patch('/:id/disposition', (req, res) => {
  const { disposition, disposition_note, scrap_cost, rework_cost } = req.body;
  db.prepare('UPDATE ncr_records SET disposition=?, disposition_note=?, scrap_cost=?, rework_cost=? WHERE id=?')
    .run(disposition, disposition_note || '', scrap_cost || 0, rework_cost || 0, req.params.id);
  res.json({ ok: true });
});

router.patch('/:id/close', (req, res) => {
  const { closed_by, disposition } = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare("UPDATE ncr_records SET status='closed', closed_by=?, closed_at=?, disposition=COALESCE(?,disposition) WHERE id=?").run(closed_by || '', now, disposition, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM ncr_records WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// NCR 統計
router.get('/stats', (req, res) => {
  const { year } = req.query;
  const y = year || dayjs().format('YYYY');
  const monthly = db.prepare(`
    SELECT strftime('%m', created_at) as month, COUNT(*) as cnt, SUM(defect_qty) as total_qty,
      SUM(scrap_cost+rework_cost) as total_cost
    FROM ncr_records WHERE strftime('%Y', created_at)=? GROUP BY month ORDER BY month
  `).all(y);
  const bySource = db.prepare(`
    SELECT source, COUNT(*) as cnt FROM ncr_records WHERE strftime('%Y', created_at)=? GROUP BY source
  `).all(y);
  const open = db.prepare("SELECT COUNT(*) as cnt FROM ncr_records WHERE status='open'").get().cnt;
  res.json({ monthly, bySource, open, year: y });
});

module.exports = router;
