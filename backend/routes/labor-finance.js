const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

const COST_TYPES = { labor: '人工', material: '材料', other: '其他' };

function projectSummary(projectId) {
  const project = db.prepare('SELECT * FROM labor_projects WHERE id=?').get(projectId);
  if (!project) return null;
  const received = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM project_receipts WHERE project_id=?').get(projectId).t;
  const cost = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM project_costs WHERE project_id=?').get(projectId).t;
  const profit = (project.contract_amount || 0) - cost;
  return {
    contract_amount: project.contract_amount || 0,
    received,
    received_pct: project.contract_amount > 0 ? Math.round(received / project.contract_amount * 100 * 10) / 10 : 0,
    total_cost: cost,
    cost_pct: project.contract_amount > 0 ? Math.round(cost / project.contract_amount * 100 * 10) / 10 : 0,
    profit,
    margin_pct: project.contract_amount > 0 ? Math.round(profit / project.contract_amount * 100 * 10) / 10 : 0,
  };
}

// 專案列表（含財務摘要）
router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM labor_projects ORDER BY created_at DESC').all();
  res.json(projects.map(p => ({ ...p, ...projectSummary(p.id) })));
});

router.post('/', (req, res) => {
  const { name, client_name, contract_amount, note } = req.body;
  if (!name) return res.status(400).json({ error: '專案名稱為必填' });
  const id = uuidv4();
  db.prepare('INSERT INTO labor_projects (id,name,client_name,contract_amount,note) VALUES (?,?,?,?,?)')
    .run(id, name, client_name || '', contract_amount || 0, note || '');
  res.json({ ok: true, id });
});

router.patch('/:id', (req, res) => {
  const { name, client_name, contract_amount, status, note } = req.body;
  const p = db.prepare('SELECT * FROM labor_projects WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE labor_projects SET name=?, client_name=?, contract_amount=?, status=?, note=? WHERE id=?')
    .run(name ?? p.name, client_name ?? p.client_name, contract_amount ?? p.contract_amount, status ?? p.status, note ?? p.note, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM labor_projects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 專案完整財務明細
router.get('/:id/detail', (req, res) => {
  const project = db.prepare('SELECT * FROM labor_projects WHERE id=?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const receipts = db.prepare('SELECT * FROM project_receipts WHERE project_id=? ORDER BY received_date DESC').all(req.params.id);
  const costs = db.prepare('SELECT * FROM project_costs WHERE project_id=? ORDER BY cost_date DESC').all(req.params.id);

  // 成本分類彙總
  const byType = {};
  ['labor', 'material', 'other'].forEach(t => { byType[t] = { type: t, label: COST_TYPES[t], total: 0, count: 0, items: [] }; });
  costs.forEach(c => {
    const t = byType[c.cost_type] || byType.other;
    t.total += c.amount; t.count++; t.items.push(c);
  });
  const totalCost = costs.reduce((s, c) => s + c.amount, 0);
  Object.values(byType).forEach(t => { t.pct = totalCost > 0 ? Math.round(t.total / totalCost * 100 * 10) / 10 : 0; });

  res.json({
    project,
    summary: projectSummary(req.params.id),
    receipts,
    costs,
    cost_by_type: Object.values(byType).filter(t => t.count > 0),
  });
});

// 收款
router.post('/:id/receipts', (req, res) => {
  const { amount, received_date, method, note } = req.body;
  if (!amount) return res.status(400).json({ error: '金額為必填' });
  db.prepare('INSERT INTO project_receipts (id,project_id,amount,received_date,method,note) VALUES (?,?,?,?,?,?)')
    .run(uuidv4(), req.params.id, amount, received_date || dayjs().format('YYYY-MM-DD'), method || '', note || '');
  res.json({ ok: true });
});

router.delete('/receipts/:rid', (req, res) => {
  db.prepare('DELETE FROM project_receipts WHERE id=?').run(req.params.rid);
  res.json({ ok: true });
});

// 成本記錄
router.post('/:id/costs', (req, res) => {
  const { cost_type, subject, task_name, amount, qty, unit_price, worker_name, source, cost_date, description } = req.body;
  if (!cost_type || amount === undefined) return res.status(400).json({ error: '類型與金額為必填' });
  db.prepare(`INSERT INTO project_costs (id,project_id,cost_type,subject,task_name,amount,qty,unit_price,worker_name,source,cost_date,description)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuidv4(), req.params.id, cost_type, subject || COST_TYPES[cost_type] || '', task_name || '', amount, qty || 0, unit_price || 0, worker_name || '', source || 'manual', cost_date || dayjs().format('YYYY-MM-DD'), description || '');
  res.json({ ok: true });
});

// 材料退回沖銷（負數成本）
router.post('/:id/costs/return', (req, res) => {
  const { original_cost_id, qty, note } = req.body;
  const orig = db.prepare('SELECT * FROM project_costs WHERE id=?').get(original_cost_id);
  if (!orig) return res.status(404).json({ error: '找不到原成本' });
  const returnQty = qty || orig.qty;
  const returnAmount = -(returnQty * (orig.unit_price || 0));
  db.prepare(`INSERT INTO project_costs (id,project_id,cost_type,subject,task_name,amount,qty,unit_price,source,cost_date,description)
    VALUES (?,?,?,?,?,?,?,?,'return',?,?)`)
    .run(uuidv4(), req.params.id, orig.cost_type, orig.subject, orig.task_name, returnAmount, -returnQty, orig.unit_price, dayjs().format('YYYY-MM-DD'), `${note || '材料退回（沖銷原成本）'} - ${orig.subject || orig.description || ''}`);
  res.json({ ok: true, return_amount: returnAmount });
});

router.delete('/costs/:cid', (req, res) => {
  db.prepare('DELETE FROM project_costs WHERE id=?').run(req.params.cid);
  res.json({ ok: true });
});

module.exports = router;
