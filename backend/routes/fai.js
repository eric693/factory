const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

router.get('/', (req, res) => {
  const { status } = req.query;
  let q = 'SELECT f.*, wo.wo_no FROM fai_records f LEFT JOIN work_orders wo ON wo.id=f.work_order_id';
  if (status && status !== 'all') q += ' WHERE f.status=?';
  q += ' ORDER BY f.created_at DESC LIMIT 100';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const fai = db.prepare('SELECT * FROM fai_records WHERE id=?').get(req.params.id);
  if (!fai) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare('SELECT * FROM fai_items WHERE fai_id=? ORDER BY item_no').all(req.params.id);
  res.json({ ...fai, items });
});

// 從 SPC 規格自動建立 FAI 量測項目
router.post('/from-spc/:product_id', (req, res) => {
  const { work_order_id, inspector } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.product_id);
  if (!product) return res.status(404).json({ error: 'Not found' });

  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM fai_records WHERE fai_no LIKE ?').get(`FAI-${year}-%`).cnt + 1;
  const fai_no = `FAI-${year}-${String(seq).padStart(3, '0')}`;

  const wo = work_order_id ? db.prepare('SELECT wo_no FROM work_orders WHERE id=?').get(work_order_id) : null;

  db.prepare(`INSERT INTO fai_records (id,fai_no,work_order_id,wo_no,product_id,product_name,product_code,inspector,status)
    VALUES (?,?,?,?,?,?,?,'pending','pending')`)
    .run(id, fai_no, work_order_id || null, wo?.wo_no || '', req.params.product_id, product.name, product.code);

  // 從 SPC 規格建立量測項目
  const specs = db.prepare('SELECT * FROM spc_specs WHERE product_id=?').all(req.params.product_id);
  const insertItem = db.prepare(`INSERT INTO fai_items (id,fai_id,item_no,measurement_name,spec_description,usl,lsl,target,unit,result) VALUES (?,?,?,?,?,?,?,?,'mm','pending')`);
  specs.forEach((s, i) => {
    const spec = `LSL ${s.lsl ?? '-'} ~ USL ${s.usl ?? '-'}`;
    insertItem.run(uuidv4(), id, i + 1, s.measurement_name, spec, s.usl, s.lsl, s.target);
  });

  // 若無 SPC 規格，建立基本項目
  if (specs.length === 0) {
    insertItem.run(uuidv4(), id, 1, '外觀檢查', '無明顯缺陷', null, null, null);
    insertItem.run(uuidv4(), id, 2, '尺寸量測', '依圖面規格', null, null, null);
    insertItem.run(uuidv4(), id, 3, '功能測試', '功能正常', null, null, null);
  }

  res.json({ ok: true, id, fai_no });
});

router.post('/', (req, res) => {
  const { work_order_id, product_id, inspector, items } = req.body;
  if (!product_id || !items?.length) return res.status(400).json({ error: '產品與量測項目為必填' });

  const product = db.prepare('SELECT * FROM products WHERE id=?').get(product_id);
  const wo = work_order_id ? db.prepare('SELECT wo_no FROM work_orders WHERE id=?').get(work_order_id) : null;
  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM fai_records WHERE fai_no LIKE ?').get(`FAI-${year}-%`).cnt + 1;
  const fai_no = `FAI-${year}-${String(seq).padStart(3, '0')}`;

  db.prepare(`INSERT INTO fai_records (id,fai_no,work_order_id,wo_no,product_id,product_name,product_code,inspector,status)
    VALUES (?,?,?,?,?,?,?,?,'pending')`)
    .run(id, fai_no, work_order_id || null, wo?.wo_no || '', product_id, product?.name || '', product?.code || '', inspector || '');

  const insertItem = db.prepare(`INSERT INTO fai_items (id,fai_id,item_no,measurement_name,spec_description,usl,lsl,target,unit,result) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  items.forEach((item, i) => insertItem.run(uuidv4(), id, item.item_no || i + 1, item.measurement_name, item.spec_description || '', item.usl ?? null, item.lsl ?? null, item.target ?? null, item.unit || 'mm', 'pending'));

  res.json({ ok: true, id, fai_no });
});

// 填寫量測結果
router.patch('/:id/items', (req, res) => {
  const { results } = req.body; // [{fai_item_id, actual_value, result}]
  const fai = db.prepare('SELECT * FROM fai_records WHERE id=?').get(req.params.id);
  if (!fai) return res.status(404).json({ error: 'Not found' });

  (results || []).forEach(r => {
    const isPass = r.result === 'pass';
    db.prepare('UPDATE fai_items SET actual_value=?, result=? WHERE id=? AND fai_id=?').run(r.actual_value || '', r.result, r.fai_item_id, req.params.id);
  });

  // 自動判定整體結果
  const items = db.prepare('SELECT result FROM fai_items WHERE fai_id=?').all(req.params.id);
  const allFilled = items.every(i => i.result !== 'pending');
  const allPass = items.every(i => i.result === 'pass');

  if (allFilled) {
    const overall = allPass ? 'pass' : 'fail';
    db.prepare('UPDATE fai_records SET overall_result=?, status=? WHERE id=?').run(overall, allPass ? 'approved' : 'rejected', req.params.id);
  }

  res.json({ ok: true, all_pass: allPass });
});

// 核准
router.patch('/:id/approve', (req, res) => {
  const { approved_by } = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare('UPDATE fai_records SET status=?, approved_by=?, approved_at=?, overall_result=? WHERE id=?').run('approved', approved_by || '', now, 'pass', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM fai_records WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
