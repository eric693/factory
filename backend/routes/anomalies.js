const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');
const { sendLineNotify } = require('../lineNotify');

const TYPES = ['machine_breakdown', 'material_shortage', 'quality_issue', 'safety', 'other'];

// SSE 連線池（通報即時推送）
const sseClients = new Set();

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const client = { res };
  sseClients.add(client);
  res.write('data: {"type":"connected"}\n\n');

  req.on('close', () => sseClients.delete(client));
});

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => { try { c.res.write(msg); } catch (_) {} });
}

// 列表
router.get('/', (req, res) => {
  const { status } = req.query;
  let q = `SELECT a.*, wo.wo_no FROM anomalies a LEFT JOIN work_orders wo ON wo.id=a.work_order_id`;
  if (status && status !== 'all') q += ` WHERE a.status=?`;
  q += ' ORDER BY a.created_at DESC LIMIT 100';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows);
});

// 新增通報（公開，師傅手機用）
router.post('/', (req, res) => {
  const { work_order_id, machine_id, machine_name, type, severity, title, description, reporter } = req.body;
  if (!title || !type) return res.status(400).json({ error: '請填標題與類型' });
  const id = uuidv4();
  db.prepare(`INSERT INTO anomalies (id,work_order_id,machine_id,machine_name,type,severity,title,description,reporter)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, work_order_id || null, machine_id || null, machine_name || '', type, severity || 'medium', title, description || '', reporter || '');

  const anomaly = db.prepare('SELECT * FROM anomalies WHERE id=?').get(id);
  broadcast({ type: 'new_anomaly', anomaly });

  // LINE 通知（高嚴重度或機台故障）
  if (severity === 'high' || type === 'machine_breakdown' || type === 'safety') {
    const typeLabel = { machine_breakdown: '機台故障', material_shortage: '缺料', quality_issue: '品質異常', safety: '安全事故', other: '其他' }[type] || type;
    sendLineNotify(`異常通報 [${typeLabel}]\n${title}\n機台：${machine_name || '-'}\n通報人：${reporter || '-'}`);
  }

  res.json({ ok: true, id });
});

// 處理（解決）
router.patch('/:id/resolve', (req, res) => {
  const { resolve_note, resolved_by } = req.body;
  db.prepare(`UPDATE anomalies SET status='resolved', resolved_by=?, resolved_at=?, resolve_note=? WHERE id=?`)
    .run(resolved_by || '管理員', dayjs().format('YYYY-MM-DD HH:mm:ss'), resolve_note || '', req.params.id);
  broadcast({ type: 'anomaly_resolved', id: req.params.id });
  res.json({ ok: true });
});

// 忽略
router.patch('/:id/ignore', (req, res) => {
  db.prepare(`UPDATE anomalies SET status='ignored' WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = { router, broadcast };
