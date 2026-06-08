const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');
const { sendLineNotify } = require('../lineNotify');

router.get('/', (req, res) => {
  const { status } = req.query;
  let q = `SELECT i.*, o.order_no, c.name as customer_name_full
    FROM invoices i
    LEFT JOIN orders o ON o.id=i.order_id
    LEFT JOIN customers c ON c.id=i.customer_id`;
  if (status && status !== 'all') q += ' WHERE i.status=?';
  q += ' ORDER BY i.due_date ASC, i.created_at DESC LIMIT 200';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();

  // 計算逾期狀態
  const today = dayjs().format('YYYY-MM-DD');
  const result = rows.map(inv => ({
    ...inv,
    is_overdue: inv.status !== 'paid' && inv.due_date < today,
    overdue_days: inv.status !== 'paid' ? Math.max(0, dayjs().diff(dayjs(inv.due_date), 'day')) : 0,
    outstanding: Math.max(0, (inv.amount || 0) - (inv.paid_amount || 0)),
  }));
  res.json(result);
});

router.post('/', (req, res) => {
  const { order_id, customer_name, customer_id, issue_date, due_date, amount, payment_method, note } = req.body;
  if (!customer_name || !amount || !due_date) return res.status(400).json({ error: '客戶、金額、到期日為必填' });

  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE invoice_no LIKE ?').get(`INV-${year}-%`).cnt + 1;
  const invoice_no = `INV-${year}-${String(seq).padStart(3, '0')}`;

  db.prepare(`INSERT INTO invoices (id,invoice_no,order_id,customer_id,customer_name,issue_date,due_date,amount,status,payment_method,note)
    VALUES (?,?,?,?,?,?,?,?,'unpaid',?,?)`)
    .run(id, invoice_no, order_id || null, customer_id || null, customer_name, issue_date || dayjs().format('YYYY-MM-DD'), due_date, amount, payment_method || '', note || '');

  res.json({ ok: true, id, invoice_no });
});

// 登記收款
router.patch('/:id/pay', (req, res) => {
  const { paid_amount, payment_method, paid_at, note } = req.body;
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });

  const newPaid = (inv.paid_amount || 0) + (+paid_amount || 0);
  const newStatus = newPaid >= inv.amount ? 'paid' : 'partial';
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  db.prepare('UPDATE invoices SET paid_amount=?, status=?, payment_method=COALESCE(?,payment_method), paid_at=?, note=COALESCE(?,note) WHERE id=?')
    .run(newPaid, newStatus, payment_method, paid_at || now.slice(0, 10), note, req.params.id);

  res.json({ ok: true, status: newStatus, paid_amount: newPaid });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 應收帳款統計
router.get('/summary', (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const stats = db.prepare(`
    SELECT
      SUM(amount) as total_ar,
      SUM(paid_amount) as total_paid,
      SUM(amount - paid_amount) as outstanding,
      SUM(CASE WHEN status!='paid' AND due_date < ? THEN amount-paid_amount ELSE 0 END) as overdue_amount,
      COUNT(CASE WHEN status='unpaid' THEN 1 END) as unpaid_count,
      COUNT(CASE WHEN status!='paid' AND due_date < ? THEN 1 END) as overdue_count
    FROM invoices
  `).get(today, today);

  const agingBuckets = db.prepare(`
    SELECT
      SUM(CASE WHEN due_date >= ? THEN amount-paid_amount ELSE 0 END) as current,
      SUM(CASE WHEN due_date < ? AND due_date >= date(?,' -30 days') AND status!='paid' THEN amount-paid_amount ELSE 0 END) as d30,
      SUM(CASE WHEN due_date < date(?,' -30 days') AND due_date >= date(?,' -60 days') AND status!='paid' THEN amount-paid_amount ELSE 0 END) as d31_60,
      SUM(CASE WHEN due_date < date(?,' -60 days') AND status!='paid' THEN amount-paid_amount ELSE 0 END) as d61_plus
    FROM invoices WHERE status != 'paid'
  `).get(today, today, today, today, today, today);

  res.json({ stats, aging: agingBuckets });
});

// 逾期提醒（每次呼叫時掃描）
router.post('/check-overdue', (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const overdue = db.prepare(`
    SELECT * FROM invoices WHERE status!='paid' AND due_date < ? ORDER BY due_date ASC
  `).all(today);

  if (overdue.length > 0) {
    const msg = `應收帳款逾期提醒\n共 ${overdue.length} 筆逾期\n${overdue.slice(0, 3).map(i => `${i.customer_name} ${(i.amount - i.paid_amount).toLocaleString()}元 逾期${dayjs().diff(dayjs(i.due_date), 'day')}天`).join('\n')}`;
    sendLineNotify(msg);
  }

  res.json({ overdue_count: overdue.length });
});

module.exports = router;
