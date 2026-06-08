const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// 批號列表
router.get('/', (req, res) => {
  const { material_id, search } = req.query;
  let q = `SELECT ln.*, m.unit as mat_unit FROM lot_numbers ln LEFT JOIN materials m ON m.id=ln.material_id`;
  const params = [];
  const conds = [];
  if (material_id) { conds.push('ln.material_id=?'); params.push(material_id); }
  if (search) { conds.push('(ln.lot_no LIKE ? OR ln.material_name LIKE ? OR ln.supplier LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' ORDER BY ln.created_at DESC LIMIT 100';
  res.json(db.prepare(q).all(...params));
});

// 建立批號
router.post('/', (req, res) => {
  const { material_id, lot_no, qty, supplier, received_at, expiry_date, unit_cost, note } = req.body;
  if (!material_id || !qty) return res.status(400).json({ error: '物料與數量為必填' });
  const mat = db.prepare('SELECT * FROM materials WHERE id=?').get(material_id);
  if (!mat) return res.status(404).json({ error: '找不到物料' });

  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM lot_numbers WHERE lot_no LIKE ?').get(`LOT-${year}-%`).cnt + 1;
  const lotNo = lot_no || `LOT-${year}-${String(seq).padStart(4, '0')}`;

  db.prepare(`INSERT INTO lot_numbers (id,lot_no,material_id,material_name,material_code,qty,remaining_qty,supplier,received_at,expiry_date,unit,unit_cost,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, lotNo, material_id, mat.name, mat.code, qty, qty, supplier || '', received_at || dayjs().format('YYYY-MM-DD'), expiry_date || '', mat.unit, unit_cost || mat.unit_cost || 0, note || '');

  // 同步增加物料庫存
  db.prepare('UPDATE materials SET stock_qty=stock_qty+? WHERE id=?').run(qty, material_id);
  db.prepare('INSERT INTO stock_logs (id,material_id,delta,reason,ref_id) VALUES (?,?,?,?,?)').run(uuidv4(), material_id, qty, `批號入庫 ${lotNo}`, id);

  res.json({ ok: true, id, lot_no: lotNo });
});

// 批號使用（領料）
router.post('/:id/use', (req, res) => {
  const { work_order_id, qty_used, operator } = req.body;
  const lot = db.prepare('SELECT * FROM lot_numbers WHERE id=?').get(req.params.id);
  if (!lot) return res.status(404).json({ error: '找不到批號' });
  if (qty_used > lot.remaining_qty) return res.status(400).json({ error: `剩餘數量不足（剩 ${lot.remaining_qty}）` });

  const wo = work_order_id ? db.prepare('SELECT product_name FROM work_orders WHERE id=?').get(work_order_id) : null;
  db.prepare('INSERT INTO lot_usage (id,lot_id,work_order_id,product_name,qty_used,operator) VALUES (?,?,?,?,?,?)').run(uuidv4(), req.params.id, work_order_id || null, wo?.product_name || '', qty_used, operator || '');
  db.prepare('UPDATE lot_numbers SET remaining_qty=remaining_qty-? WHERE id=?').run(qty_used, req.params.id);
  db.prepare('UPDATE materials SET stock_qty=stock_qty-? WHERE id=?').run(qty_used, lot.material_id);

  res.json({ ok: true });
});

// 批號追溯（正查：批號 → 用在哪些工單）
router.get('/:id/trace-forward', (req, res) => {
  const lot = db.prepare('SELECT * FROM lot_numbers WHERE id=?').get(req.params.id);
  if (!lot) return res.status(404).json({ error: 'Not found' });
  const usages = db.prepare(`
    SELECT lu.*, wo.wo_no, wo.product_name, wo.product_code, wo.status as wo_status,
           o.order_no, o.customer_name
    FROM lot_usage lu
    LEFT JOIN work_orders wo ON wo.id=lu.work_order_id
    LEFT JOIN orders o ON o.id=wo.order_id
    WHERE lu.lot_id=?
    ORDER BY lu.used_at DESC
  `).all(req.params.id);
  res.json({ lot, usages });
});

// 工單追溯（反查：工單 → 使用哪些批號）
router.get('/by-workorder/:wo_id', (req, res) => {
  const lots = db.prepare(`
    SELECT lu.*, ln.lot_no, ln.material_name, ln.material_code, ln.supplier, ln.received_at
    FROM lot_usage lu
    JOIN lot_numbers ln ON ln.id=lu.lot_id
    WHERE lu.work_order_id=?
    ORDER BY lu.used_at DESC
  `).all(req.params.wo_id);
  res.json(lots);
});

// 訂單完整追溯報告
router.get('/trace-order/:order_id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.order_id);
  if (!order) return res.status(404).json({ error: 'Not found' });

  const wos = db.prepare('SELECT * FROM work_orders WHERE order_id=?').all(req.params.order_id);
  const result = wos.map(wo => {
    const lots = db.prepare(`
      SELECT lu.*, ln.lot_no, ln.material_name, ln.material_code, ln.supplier, ln.received_at, ln.expiry_date
      FROM lot_usage lu JOIN lot_numbers ln ON ln.id=lu.lot_id
      WHERE lu.work_order_id=?
    `).all(wo.id);
    return { ...wo, lots };
  });

  const shipments = db.prepare(`
    SELECT s.shipment_no, s.shipped_at, s.carrier, s.tracking_no, s.customer_name
    FROM shipments s WHERE s.order_id=?
  `).all(req.params.order_id);

  res.json({ order, workOrders: result, shipments });
});

module.exports = router;
