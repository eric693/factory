const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// 詢價單列表
router.get('/inquiries', (req, res) => {
  const list = db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 50').all();
  const result = list.map(i => ({
    ...i,
    items: db.prepare('SELECT * FROM inquiry_items WHERE inquiry_id=?').all(i.id),
  }));
  res.json(result);
});

// 公開詢價提交（客戶填表）
router.post('/inquiries/public', (req, res) => {
  const { company_name, contact_name, contact_phone, contact_email, message, items } = req.body;
  if (!company_name) return res.status(400).json({ error: '請填公司名稱' });
  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM inquiries WHERE inquiry_no LIKE ?').get(`INQ-${year}-%`).cnt + 1;
  const inquiry_no = `INQ-${year}-${String(seq).padStart(3, '0')}`;

  db.prepare(`INSERT INTO inquiries (id,inquiry_no,company_name,contact_name,contact_phone,contact_email,message,status)
    VALUES (?,?,?,?,?,?,?,'pending')`).run(id, inquiry_no, company_name, contact_name || '', contact_phone || '', contact_email || '', message || '');

  const insertItem = db.prepare('INSERT INTO inquiry_items (id,inquiry_id,product_name,qty,note) VALUES (?,?,?,?,?)');
  (items || []).forEach(item => insertItem.run(uuidv4(), id, item.product_name, item.qty || 0, item.note || ''));

  res.json({ ok: true, inquiry_no });
});

router.patch('/inquiries/:id/status', (req, res) => {
  const { status, assigned_to } = req.body;
  db.prepare('UPDATE inquiries SET status=?, assigned_to=? WHERE id=?').run(status, assigned_to || '', req.params.id);
  res.json({ ok: true });
});

const getSetting = (key, def) => {
  const row = db.prepare('SELECT value FROM system_settings WHERE key=?').get(key);
  return row ? parseFloat(row.value) : def;
};

// 報價計算（依 BOM 自動算成本）
router.post('/calculate', (req, res) => {
  const defaultMargin = getSetting('default_margin_pct', 25);
  const defaultLaborRate = getSetting('default_labor_rate', 300);
  const { items, margin_pct = defaultMargin, labor_cost_per_hour = defaultLaborRate } = req.body;
  const result = [];

  for (const item of items) {
    const product = item.product_id
      ? db.prepare('SELECT * FROM products WHERE id=?').get(item.product_id)
      : null;

    // 原料成本
    let materialCost = 0;
    if (product) {
      const boms = db.prepare('SELECT b.qty_per_unit, m.unit_cost FROM bom b JOIN materials m ON m.id=b.material_id WHERE b.product_id=?').all(product.id);
      materialCost = boms.reduce((s, b) => s + b.qty_per_unit * (b.unit_cost || 0), 0);
    }

    // 人工成本
    const stdHours = product?.std_hours || item.std_hours || 1;
    const laborCost = stdHours * labor_cost_per_hour;

    const unitCost = materialCost + laborCost;
    const unitPrice = unitCost * (1 + margin_pct / 100);
    const totalPrice = unitPrice * item.qty;

    result.push({
      product_name: product?.name || item.product_name || '',
      product_code: product?.code || item.product_code || '',
      product_id: item.product_id,
      qty: item.qty,
      std_hours: stdHours,
      material_cost_unit: Math.round(materialCost * 100) / 100,
      labor_cost_unit: Math.round(laborCost * 100) / 100,
      unit_cost: Math.round(unitCost * 100) / 100,
      margin_pct,
      unit_price: Math.round(unitPrice),
      total_price: Math.round(totalPrice),
    });
  }

  const totalMaterial = result.reduce((s, r) => s + r.material_cost_unit * r.qty, 0);
  const totalLabor = result.reduce((s, r) => s + r.labor_cost_unit * r.qty, 0);
  const totalPrice = result.reduce((s, r) => s + r.total_price, 0);

  res.json({ items: result, totalMaterial, totalLabor, totalPrice, margin_pct });
});

// 建立報價單
router.post('/', (req, res) => {
  const { inquiry_id, customer_name, items, margin_pct, valid_days, note } = req.body;
  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM quotes WHERE quote_no LIKE ?').get(`QT-${year}-%`).cnt + 1;
  const quote_no = `QT-${year}-${String(seq).padStart(3, '0')}`;

  const totalMaterial = (items || []).reduce((s, i) => s + (i.material_cost || 0) * i.qty, 0);
  const totalLabor = (items || []).reduce((s, i) => s + (i.labor_cost || 0) * i.qty, 0);
  const finalPrice = (items || []).reduce((s, i) => s + (i.total_price || 0), 0);

  db.prepare(`INSERT INTO quotes (id,quote_no,inquiry_id,customer_name,valid_days,margin_pct,total_material_cost,total_labor_cost,final_price,note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, quote_no, inquiry_id || null, customer_name, valid_days || 30, margin_pct || 25, totalMaterial, totalLabor, finalPrice, note || '');

  const insertItem = db.prepare(`INSERT INTO quote_items (id,quote_id,product_id,product_name,product_code,qty,material_cost,labor_cost,unit_price,total_price)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  (items || []).forEach(item => insertItem.run(uuidv4(), id, item.product_id || null, item.product_name, item.product_code || '', item.qty, item.material_cost || 0, item.labor_cost || 0, item.unit_price || 0, item.total_price || 0));

  if (inquiry_id) db.prepare(`UPDATE inquiries SET status='quoted' WHERE id=?`).run(inquiry_id);

  res.json({ ok: true, id, quote_no });
});

// 報價單列表 + 詳情
router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 50').all();
  const result = list.map(q => ({
    ...q,
    items: db.prepare('SELECT * FROM quote_items WHERE quote_id=?').all(q.id),
  }));
  res.json(result);
});

router.get('/:id', (req, res) => {
  const q = db.prepare('SELECT * FROM quotes WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare('SELECT * FROM quote_items WHERE quote_id=?').all(req.params.id);
  res.json({ ...q, items });
});

router.patch('/:id/status', (req, res) => {
  db.prepare('UPDATE quotes SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
