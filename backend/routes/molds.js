const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

router.get('/', (req, res) => {
  const { status } = req.query;
  let q = 'SELECT m.*, p.name as product_name FROM molds m LEFT JOIN products p ON p.id=m.product_id';
  if (status && status !== 'all') q += ' WHERE m.status=?';
  q += ' ORDER BY m.code';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { code, name, machine_id, material, max_shots, warning_shots, product_id, note } = req.body;
  if (!code || !name) return res.status(400).json({ error: '模具編號與名稱為必填' });
  const machine = machine_id ? db.prepare('SELECT * FROM machines WHERE id=?').get(machine_id) : null;
  const product = product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(product_id) : null;
  const id = uuidv4();
  const maxShots = max_shots || 500000;
  db.prepare(`INSERT INTO molds (id,code,name,machine_id,machine_name,material,max_shots,warning_shots,product_id,product_name,next_maintenance_shots,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, code, name, machine_id || null, machine?.name || '', material || '', maxShots, warning_shots || Math.round(maxShots * 0.9), product_id || null, product?.name || '', warning_shots || Math.round(maxShots * 0.9), note || '');
  res.json({ ok: true, id });
});

router.patch('/:id', (req, res) => {
  const { name, machine_id, material, max_shots, warning_shots, status, product_id, note } = req.body;
  const mold = db.prepare('SELECT * FROM molds WHERE id=?').get(req.params.id);
  if (!mold) return res.status(404).json({ error: 'Not found' });
  const machine = machine_id ? db.prepare('SELECT * FROM machines WHERE id=?').get(machine_id) : null;
  const product = product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(product_id) : null;
  db.prepare('UPDATE molds SET name=?, machine_id=?, machine_name=?, material=?, max_shots=?, warning_shots=?, status=?, product_id=?, product_name=?, note=? WHERE id=?')
    .run(name ?? mold.name, machine_id ?? mold.machine_id, machine?.name ?? mold.machine_name, material ?? mold.material, max_shots ?? mold.max_shots, warning_shots ?? mold.warning_shots, status ?? mold.status, product_id ?? mold.product_id, product?.name ?? mold.product_name, note ?? mold.note, req.params.id);
  res.json({ ok: true });
});

// 加模次（連結工單）
router.post('/:id/shots', (req, res) => {
  const { shots, work_order_id, operator, note } = req.body;
  if (!shots || shots <= 0) return res.status(400).json({ error: '模次必須大於 0' });
  const mold = db.prepare('SELECT * FROM molds WHERE id=?').get(req.params.id);
  if (!mold) return res.status(404).json({ error: 'Not found' });

  const newShots = mold.current_shots + shots;
  const newTotal = mold.total_shots + shots;
  let newStatus = mold.status;
  if (newShots >= mold.max_shots) newStatus = 'overhaul';
  else if (newShots >= mold.warning_shots) newStatus = 'warning';

  db.prepare('UPDATE molds SET current_shots=?, total_shots=?, status=? WHERE id=?').run(newShots, newTotal, newStatus, req.params.id);
  db.prepare('INSERT INTO mold_logs (id,mold_id,action,shots_added,work_order_id,operator,note) VALUES (?,?,?,?,?,?,?)').run(uuidv4(), req.params.id, 'production', shots, work_order_id || null, operator || '', note || '');

  res.json({ ok: true, current_shots: newShots, total_shots: newTotal, status: newStatus });
});

// 保養重置模次
router.post('/:id/maintain', (req, res) => {
  const { operator, note } = req.body;
  const mold = db.prepare('SELECT * FROM molds WHERE id=?').get(req.params.id);
  if (!mold) return res.status(404).json({ error: 'Not found' });
  const now = dayjs().format('YYYY-MM-DD');
  db.prepare('UPDATE molds SET current_shots=0, status=\'active\', last_maintained=?, next_maintenance_shots=? WHERE id=?').run(now, mold.warning_shots, req.params.id);
  db.prepare('INSERT INTO mold_logs (id,mold_id,action,shots_added,operator,note) VALUES (?,?,?,?,?,?)').run(uuidv4(), req.params.id, 'maintenance', 0, operator || '', note || '保養完成，模次重置');
  res.json({ ok: true });
});

router.get('/:id/logs', (req, res) => {
  const logs = db.prepare('SELECT ml.*, wo.wo_no FROM mold_logs ml LEFT JOIN work_orders wo ON wo.id=ml.work_order_id WHERE ml.mold_id=? ORDER BY ml.logged_at DESC LIMIT 50').all(req.params.id);
  res.json(logs);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM molds WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
