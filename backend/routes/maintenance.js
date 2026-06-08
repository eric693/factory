const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

router.get('/', (req, res) => {
  const { status } = req.query;
  let q = 'SELECT ms.*, m.code as machine_code FROM maintenance_schedules ms LEFT JOIN machines m ON m.id=ms.machine_id';
  if (status && status !== 'all') q += ' WHERE ms.status=?';
  q += ' ORDER BY ms.next_due ASC';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { machine_id, title, maintenance_type, frequency_days, next_due, estimated_hours, assigned_to, note } = req.body;
  if (!title || !next_due) return res.status(400).json({ error: '標題與到期日為必填' });

  const machine = machine_id ? db.prepare('SELECT * FROM machines WHERE id=?').get(machine_id) : null;
  const id = uuidv4();

  db.prepare(`INSERT INTO maintenance_schedules (id,machine_id,machine_name,title,maintenance_type,frequency_days,next_due,estimated_hours,assigned_to,status,note)
    VALUES (?,?,?,?,?,?,?,?,?,'pending',?)`).run(id, machine_id || null, machine?.name || '', title, maintenance_type || 'routine', frequency_days || 30, next_due, estimated_hours || 2, assigned_to || '', note || '');

  res.json({ ok: true, id });
});

router.patch('/:id', (req, res) => {
  const { status, assigned_to, next_due, note } = req.body;
  db.prepare('UPDATE maintenance_schedules SET status=?, assigned_to=?, next_due=?, note=? WHERE id=?')
    .run(status, assigned_to, next_due, note, req.params.id);
  res.json({ ok: true });
});

// 標記完成 → 建立 log + 推算下次到期
router.post('/:id/complete', (req, res) => {
  const { done_by, actual_hours, result, note } = req.body;
  const schedule = db.prepare('SELECT * FROM maintenance_schedules WHERE id=?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const nextDue = dayjs().add(schedule.frequency_days || 30, 'day').format('YYYY-MM-DD');

  db.prepare('INSERT INTO maintenance_logs (id,schedule_id,machine_id,done_at,actual_hours,done_by,result,note) VALUES (?,?,?,?,?,?,?,?)')
    .run(uuidv4(), schedule.id, schedule.machine_id, now, actual_hours || 0, done_by || '', result || '', note || '');

  db.prepare('UPDATE maintenance_schedules SET status=?, last_done=?, next_due=? WHERE id=?')
    .run('pending', now.slice(0, 10), nextDue, schedule.id);

  res.json({ ok: true, next_due: nextDue });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM maintenance_schedules WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 即將到期的保養（通知中心用）
router.get('/upcoming', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const until = dayjs().add(days, 'day').format('YYYY-MM-DD');
  const rows = db.prepare(`
    SELECT ms.*, m.code as machine_code
    FROM maintenance_schedules ms
    LEFT JOIN machines m ON m.id=ms.machine_id
    WHERE ms.next_due <= ? AND ms.status='pending'
    ORDER BY ms.next_due ASC
  `).all(until);
  res.json(rows);
});

module.exports = router;
