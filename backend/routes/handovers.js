const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// 列表
router.get('/', (req, res) => {
  const { date, limit = 20 } = req.query;
  let q = 'SELECT * FROM shift_handovers';
  if (date) q += ` WHERE shift_date=?`;
  q += ' ORDER BY created_at DESC LIMIT ?';
  const rows = date
    ? db.prepare(q).all(date, +limit)
    : db.prepare(q).all(+limit);
  res.json(rows);
});

// 今日生產摘要（輔助自動填入）— 必須在 /:id 之前定義
router.get('/summary/today', (req, res) => {
  const date = dayjs().format('YYYY-MM-DD');
  const wos = db.prepare(`
    SELECT wo.product_name, wo.machine_name, wo.operator,
           SUM(pl.qty) as today_qty, SUM(pl.defect_qty) as today_defect
    FROM progress_logs pl
    JOIN work_orders wo ON wo.id=pl.work_order_id
    WHERE date(pl.logged_at)=?
    GROUP BY wo.id
  `).all(date);

  const openAnomalies = db.prepare(`SELECT COUNT(*) as cnt FROM anomalies WHERE status='open' AND date(created_at)=?`).get(date);

  res.json({ date, wos, open_anomalies: openAnomalies.cnt });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM shift_handovers WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// 建立交接記錄
router.post('/', (req, res) => {
  const { shift, shift_date, from_operator, to_operator, production_summary, issues, equipment_status, materials_status, notes } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO shift_handovers (id,shift,shift_date,from_operator,to_operator,production_summary,issues,equipment_status,materials_status,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, shift, shift_date || dayjs().format('YYYY-MM-DD'), from_operator || '', to_operator || '', production_summary || '', issues || '', equipment_status || '', materials_status || '', notes || '');
  res.json({ ok: true, id });
});

// 接班人簽名確認
router.patch('/:id/sign', (req, res) => {
  db.prepare('UPDATE shift_handovers SET signed=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
