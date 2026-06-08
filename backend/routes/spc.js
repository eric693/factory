const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// ── SPC 規格管理 ──────────────────────────────────────────────
router.get('/specs', (req, res) => {
  const { product_id } = req.query;
  let q = 'SELECT s.*, p.name as product_name FROM spc_specs s LEFT JOIN products p ON p.id=s.product_id';
  if (product_id) q += ' WHERE s.product_id=?';
  q += ' ORDER BY s.product_code, s.measurement_name';
  res.json(product_id ? db.prepare(q).all(product_id) : db.prepare(q).all());
});

router.post('/specs', (req, res) => {
  const { product_id, measurement_name, unit, usl, lsl, target } = req.body;
  if (!product_id || !measurement_name) return res.status(400).json({ error: '產品與量測名稱為必填' });
  const p = db.prepare('SELECT code FROM products WHERE id=?').get(product_id);
  const id = uuidv4();
  db.prepare('INSERT OR REPLACE INTO spc_specs (id,product_id,product_code,measurement_name,unit,usl,lsl,target) VALUES (?,?,?,?,?,?,?,?)').run(id, product_id, p?.code || '', measurement_name, unit || 'mm', usl ?? null, lsl ?? null, target ?? null);
  res.json({ ok: true, id });
});

router.delete('/specs/:id', (req, res) => {
  db.prepare('DELETE FROM spc_specs WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── SPC 量測記錄 ──────────────────────────────────────────────
router.get('/measurements', (req, res) => {
  const { spec_id, product_id, limit = 100 } = req.query;
  let q = 'SELECT * FROM spc_measurements';
  const params = [];
  const conds = [];
  if (spec_id) { conds.push('spec_id=?'); params.push(spec_id); }
  if (product_id) { conds.push('product_id=?'); params.push(product_id); }
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' ORDER BY measured_at DESC LIMIT ?';
  params.push(+limit);
  res.json(db.prepare(q).all(...params));
});

router.post('/measurements', (req, res) => {
  const { spec_id, value, work_order_id, operator } = req.body;
  if (!spec_id || value === undefined) return res.status(400).json({ error: '規格與量測值為必填' });

  const spec = db.prepare('SELECT * FROM spc_specs WHERE id=?').get(spec_id);
  if (!spec) return res.status(404).json({ error: '找不到規格' });

  const wo = work_order_id ? db.prepare('SELECT wo_no FROM work_orders WHERE id=?').get(work_order_id) : null;
  const isOutOfControl = (spec.usl !== null && value > spec.usl) || (spec.lsl !== null && value < spec.lsl);

  const id = uuidv4();
  db.prepare(`INSERT INTO spc_measurements (id,spec_id,product_id,product_code,measurement_name,value,work_order_id,wo_no,operator,is_out_of_control) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, spec_id, spec.product_id, spec.product_code, spec.measurement_name, value, work_order_id || null, wo?.wo_no || '', operator || '', isOutOfControl ? 1 : 0);

  res.json({ ok: true, id, is_out_of_control: isOutOfControl });
});

// ── 管制圖資料（含 Cp/Cpk 計算）──────────────────────────────
router.get('/chart/:spec_id', (req, res) => {
  const spec = db.prepare('SELECT * FROM spc_specs WHERE id=?').get(req.params.spec_id);
  if (!spec) return res.status(404).json({ error: 'Not found' });

  const n = parseInt(req.query.n) || 50;
  const measurements = db.prepare('SELECT * FROM spc_measurements WHERE spec_id=? ORDER BY measured_at ASC LIMIT ?').all(req.params.spec_id, n);

  if (measurements.length === 0) return res.json({ spec, measurements: [], stats: null });

  const values = measurements.map(m => m.value);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1 || 1);
  const sigma = Math.sqrt(variance);

  // 管制界限（3-sigma）
  const ucl = mean + 3 * sigma;
  const lcl = mean - 3 * sigma;

  // Cp / Cpk
  let cp = null, cpk = null, cpu = null, cpl = null;
  if (spec.usl !== null && spec.lsl !== null && sigma > 0) {
    cp = (spec.usl - spec.lsl) / (6 * sigma);
    cpu = (spec.usl - mean) / (3 * sigma);
    cpl = (mean - spec.lsl) / (3 * sigma);
    cpk = Math.min(cpu, cpl);
  }

  const outCount = measurements.filter(m => m.is_out_of_control).length;

  res.json({
    spec,
    measurements,
    stats: {
      count: values.length,
      mean: Math.round(mean * 10000) / 10000,
      sigma: Math.round(sigma * 10000) / 10000,
      ucl: Math.round(ucl * 10000) / 10000,
      lcl: Math.round(lcl * 10000) / 10000,
      cp: cp !== null ? Math.round(cp * 100) / 100 : null,
      cpk: cpk !== null ? Math.round(cpk * 100) / 100 : null,
      cpu: cpu !== null ? Math.round(cpu * 100) / 100 : null,
      cpl: cpl !== null ? Math.round(cpl * 100) / 100 : null,
      out_of_control: outCount,
      out_pct: Math.round(outCount / values.length * 100),
    },
  });
});

module.exports = router;
