const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// 列表
router.get('/', (req, res) => {
  const { status } = req.query;
  let q = 'SELECT * FROM purchase_orders';
  if (status && status !== 'all') q += ' WHERE status=?';
  q += ' ORDER BY created_at DESC LIMIT 100';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  const result = rows.map(po => ({
    ...po,
    items: db.prepare('SELECT * FROM purchase_items WHERE po_id=?').all(po.id),
  }));
  res.json(result);
});

// 建立採購單
router.post('/', (req, res) => {
  const { supplier, expected_date, note, items, created_by } = req.body;
  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM purchase_orders WHERE po_no LIKE ?').get(`PO-${year}-%`).cnt + 1;
  const po_no = `PO-${year}-${String(seq).padStart(3, '0')}`;

  const totalAmount = (items || []).reduce((s, i) => s + (i.total_cost || i.qty * (i.unit_cost || 0)), 0);

  db.prepare(`INSERT INTO purchase_orders (id,po_no,status,supplier,expected_date,total_amount,note,created_by)
    VALUES (?,?,'draft',?,?,?,?,?)`).run(id, po_no, supplier || '', expected_date || '', totalAmount, note || '', created_by || '');

  const insertItem = db.prepare(`INSERT INTO purchase_items (id,po_id,material_id,material_name,material_code,unit,qty,unit_cost,total_cost,note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  (items || []).forEach(item => {
    const total = item.total_cost || item.qty * (item.unit_cost || 0);
    insertItem.run(uuidv4(), id, item.material_id || null, item.material_name, item.material_code || '', item.unit || '個', item.qty, item.unit_cost || 0, total, item.note || '');
  });

  res.json({ ok: true, id, po_no });
});

// 從 MRP 缺料自動建立採購單
router.post('/from-mrp', (req, res) => {
  const { shortages, supplier, expected_date, created_by } = req.body;
  if (!shortages?.length) return res.status(400).json({ error: '沒有缺料資料' });

  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM purchase_orders WHERE po_no LIKE ?').get(`PO-${year}-%`).cnt + 1;
  const po_no = `PO-${year}-${String(seq).padStart(3, '0')}`;

  const items = shortages.filter(s => s.shortage > 0);
  const totalAmount = items.reduce((s, i) => {
    const mat = i.material_id ? db.prepare('SELECT unit_cost FROM materials WHERE id=?').get(i.material_id) : null;
    return s + i.shortage * (mat?.unit_cost || 0);
  }, 0);

  db.prepare(`INSERT INTO purchase_orders (id,po_no,status,supplier,expected_date,total_amount,note,created_by)
    VALUES (?,?,'draft',?,?,?,'依 MRP 缺料自動建立',?)`).run(id, po_no, supplier || '', expected_date || '', totalAmount, created_by || '');

  const insertItem = db.prepare(`INSERT INTO purchase_items (id,po_id,material_id,material_name,material_code,unit,qty,unit_cost,total_cost,note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  items.forEach(item => {
    const mat = item.material_id ? db.prepare('SELECT unit_cost FROM materials WHERE id=?').get(item.material_id) : null;
    const unitCost = mat?.unit_cost || 0;
    insertItem.run(uuidv4(), id, item.material_id || null, item.material_name, item.material_code || '', item.unit || '個', item.shortage, unitCost, item.shortage * unitCost, '');
  });

  res.json({ ok: true, id, po_no });
});

// 更新狀態
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const po = db.prepare('SELECT status FROM purchase_orders WHERE id=?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Not found' });
  const wasReceived = po.status === 'received';

  db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').run(status, req.params.id);

  // 僅在「首次」轉為 received 時自動入庫；以 stock_logs 是否已有此採購單記錄為準，
  // 確保即使 received→ordered→received 來回切換也絕不重複入庫
  const alreadyStocked = db.prepare("SELECT COUNT(*) as n FROM stock_logs WHERE ref_id=? AND reason='採購入庫'").get(req.params.id).n > 0;
  if (status === 'received' && !wasReceived && !alreadyStocked) {
    const items = db.prepare('SELECT * FROM purchase_items WHERE po_id=?').all(req.params.id);
    for (const item of items) {
      if (!item.material_id) continue;
      const mat = db.prepare('SELECT stock_qty FROM materials WHERE id=?').get(item.material_id);
      if (mat) {
        db.prepare('UPDATE materials SET stock_qty=? WHERE id=?').run((mat.stock_qty || 0) + item.qty, item.material_id);
        db.prepare('INSERT INTO stock_logs (id,material_id,delta,reason,ref_id) VALUES (?,?,?,?,?)').run(uuidv4(), item.material_id, item.qty, '採購入庫', req.params.id);
      }
    }
  }

  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM purchase_orders WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
