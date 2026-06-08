const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// SOP 列表
router.get('/', (req, res) => {
  const { product_id } = req.query;
  let q = `SELECT s.*, p.name as product_name_full FROM sop_documents s LEFT JOIN products p ON p.id=s.product_id WHERE s.status='active'`;
  const params = [];
  if (product_id) { q += ' AND s.product_id=?'; params.push(product_id); }
  q += ' ORDER BY s.product_code, s.updated_at DESC';
  const docs = db.prepare(q).all(...params);
  res.json(docs);
});

router.get('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM sop_documents WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const steps = db.prepare('SELECT * FROM sop_steps WHERE sop_id=? ORDER BY step_no').all(req.params.id);
  res.json({ ...doc, steps });
});

// 公開端點 — 供 QR 掃碼頁讀取（不需登入）
router.get('/public/by-product/:product_id', (req, res) => {
  const doc = db.prepare(`SELECT * FROM sop_documents WHERE product_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1`).get(req.params.product_id);
  if (!doc) return res.status(404).json({ error: '此產品尚無作業標準書' });
  const steps = db.prepare('SELECT * FROM sop_steps WHERE sop_id=? ORDER BY step_no').all(doc.id);
  res.json({ ...doc, steps });
});

router.post('/', (req, res) => {
  const { product_id, title, version, safety_notes, tools_required, steps, note } = req.body;
  if (!title) return res.status(400).json({ error: '標題為必填' });
  const id = uuidv4();
  const p = product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(product_id) : null;
  db.prepare(`INSERT INTO sop_documents (id,product_id,product_code,product_name,title,version,status,safety_notes,tools_required,note)
    VALUES (?,?,?,?,?,?,'active',?,?,?)`)
    .run(id, product_id || null, p?.code || '', p?.name || '', title, version || '1.0', safety_notes || '', tools_required || '', note || '');

  const insertStep = db.prepare(`INSERT INTO sop_steps (id,sop_id,step_no,title,description,warning,expected_time_min,quality_check) VALUES (?,?,?,?,?,?,?,?)`);
  (steps || []).forEach((s, i) => insertStep.run(uuidv4(), id, s.step_no || i + 1, s.title, s.description || '', s.warning || '', s.expected_time_min || 0, s.quality_check || ''));

  res.json({ ok: true, id });
});

router.patch('/:id', (req, res) => {
  const { title, version, safety_notes, tools_required, steps, note, status } = req.body;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare('UPDATE sop_documents SET title=COALESCE(?,title), version=COALESCE(?,version), safety_notes=COALESCE(?,safety_notes), tools_required=COALESCE(?,tools_required), note=COALESCE(?,note), status=COALESCE(?,status), updated_at=? WHERE id=?')
    .run(title, version, safety_notes, tools_required, note, status, now, req.params.id);

  if (steps) {
    db.prepare('DELETE FROM sop_steps WHERE sop_id=?').run(req.params.id);
    const insertStep = db.prepare(`INSERT INTO sop_steps (id,sop_id,step_no,title,description,warning,expected_time_min,quality_check) VALUES (?,?,?,?,?,?,?,?)`);
    steps.forEach((s, i) => insertStep.run(uuidv4(), req.params.id, s.step_no || i + 1, s.title, s.description || '', s.warning || '', s.expected_time_min || 0, s.quality_check || ''));
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare("UPDATE sop_documents SET status='archived' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
