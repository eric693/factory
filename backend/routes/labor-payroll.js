const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

const SKILL_LEVELS = ['師傅', '半技', '學徒'];

// 期別日期範圍
function periodRange(year, month, type) {
  const mStr = String(month).padStart(2, '0');
  const lastDay = dayjs(`${year}-${mStr}-01`).endOf('month').format('YYYY-MM-DD');
  if (type === 'first') return [`${year}-${mStr}-01`, `${year}-${mStr}-15`];
  if (type === 'second') return [`${year}-${mStr}-16`, lastDay];
  return [`${year}-${mStr}-01`, lastDay]; // full
}

// 依年資計算特休天數（勞基法）
function annualLeaveDays(hireDate) {
  if (!hireDate) return 0;
  const months = dayjs().diff(dayjs(hireDate), 'month');
  const years = months / 12;
  if (years < 0.5) return 0;
  if (years < 1) return 3;
  if (years < 2) return 7;
  if (years < 3) return 10;
  if (years < 5) return 14;
  if (years < 10) return 15;
  return Math.min(30, 15 + Math.floor(years - 9));
}

// 請假額度表（勞基法）
function leaveQuota(hireDate) {
  return {
    特休假: annualLeaveDays(hireDate),
    病假: 30,
    事假: 14,
    婚假: 8,
    產假: 56,
    陪產假: 7,
    生理假: 12,
    家庭照顧假: 7,
  };
}

// 取得某點工在指定日期適用的日薪
function effectiveRate(workerId, date) {
  const rate = db.prepare(`
    SELECT * FROM worker_rates WHERE worker_id=? AND effective_date <= ?
    ORDER BY effective_date DESC LIMIT 1
  `).get(workerId, date);
  return rate;
}

// ───── 薪資設定（級距日薪）─────
router.get('/rates/:workerId', (req, res) => {
  res.json(db.prepare('SELECT * FROM worker_rates WHERE worker_id=? ORDER BY effective_date DESC').all(req.params.workerId));
});

router.post('/rates/:workerId', (req, res) => {
  const { skill_level, day_rate, overtime_hourly, effective_date } = req.body;
  if (!day_rate || !effective_date) return res.status(400).json({ error: '日薪與生效日為必填' });
  const id = uuidv4();
  db.prepare(`INSERT INTO worker_rates (id,worker_id,skill_level,day_rate,overtime_hourly,effective_date) VALUES (?,?,?,?,?,?)`)
    .run(id, req.params.workerId, skill_level || '師傅', day_rate, overtime_hourly || 0, effective_date);
  res.json({ ok: true, id });
});

router.delete('/rates/:rateId', (req, res) => {
  db.prepare('DELETE FROM worker_rates WHERE id=?').run(req.params.rateId);
  res.json({ ok: true });
});

// ───── 請假額度 ─────
router.get('/leave/:workerId', (req, res) => {
  const year = parseInt(req.query.year) || dayjs().year();
  const worker = db.prepare('SELECT * FROM workers WHERE id=?').get(req.params.workerId);
  if (!worker) return res.status(404).json({ error: 'Not found' });

  const quota = leaveQuota(worker.hire_date);
  const usage = db.prepare('SELECT leave_type, SUM(days) used FROM worker_leave WHERE worker_id=? AND year=? GROUP BY leave_type').all(req.params.workerId, year);
  const usedMap = {};
  usage.forEach(u => { usedMap[u.leave_type] = u.used; });

  const seniorityYears = worker.hire_date ? Math.round(dayjs().diff(dayjs(worker.hire_date), 'month') / 12 * 100) / 100 : 0;

  const rows = Object.entries(quota).map(([type, q]) => ({
    leave_type: type, quota: q, used: usedMap[type] || 0, remaining: q - (usedMap[type] || 0),
  }));
  res.json({ year, seniority_years: seniorityYears, annual_leave: quota.特休假, rows });
});

router.post('/leave/:workerId', (req, res) => {
  const { year, leave_type, days, leave_date, note } = req.body;
  if (!leave_type || !days) return res.status(400).json({ error: '假別與天數為必填' });
  db.prepare(`INSERT INTO worker_leave (id,worker_id,year,leave_type,days,leave_date,note) VALUES (?,?,?,?,?,?,?)`)
    .run(uuidv4(), req.params.workerId, year || dayjs().year(), leave_type, days, leave_date || '', note || '');
  res.json({ ok: true });
});

// ───── 薪資結算 ─────
// 預覽某期別可結算名單
router.get('/preview', (req, res) => {
  const year = parseInt(req.query.year) || dayjs().year();
  const month = parseInt(req.query.month) || dayjs().month() + 1;
  const type = req.query.period_type || 'full';
  const [start, end] = periodRange(year, month, type);

  const workers = db.prepare("SELECT * FROM workers ORDER BY name").all();
  const rows = workers.map(w => {
    const rate = effectiveRate(w.id, end);
    // 出勤天數：以已完工的 worker_jobs 在期間內計
    const jobs = db.prepare(`
      SELECT COUNT(*) days FROM worker_jobs
      WHERE worker_id=? AND status='completed' AND date(completed_at) BETWEEN ? AND ?
    `).get(w.id, start, end);
    const workDays = jobs.days || 0;

    const issues = [];
    if (!w.skill_level) issues.push('缺少 SkillLevel');
    if (!rate) issues.push('無適用費率');

    const dayRate = rate?.day_rate || 0;
    const basePay = workDays * dayRate;

    return {
      worker_id: w.id, worker_name: w.name, skill_level: w.skill_level || '師傅',
      day_rate: dayRate, work_days: workDays, base_pay: basePay,
      advance_deduction: 0,
      can_settle: issues.length === 0,
      issues,
    };
  });

  const settleable = rows.filter(r => r.can_settle).length;
  const needAttention = rows.filter(r => !r.can_settle).length;

  res.json({
    year, month, period_type: type, range: { start, end },
    settleable, need_attention: needAttention,
    applied_structure: start,
    rows,
  });
});

// 執行結算
router.post('/settle', (req, res) => {
  const { year, month, period_type, adjustments } = req.body;
  const [start, end] = periodRange(year, month, period_type);
  const adjMap = {};
  (adjustments || []).forEach(a => { adjMap[a.worker_id] = a; });

  let periodRow = db.prepare('SELECT * FROM labor_payroll_periods WHERE year=? AND month=? AND period_type=?').get(year, month, period_type);
  if (!periodRow) {
    const pid = uuidv4();
    db.prepare(`INSERT INTO labor_payroll_periods (id,year,month,period_type,status) VALUES (?,?,?,?,'settled')`).run(pid, year, month, period_type);
    periodRow = { id: pid };
  } else {
    db.prepare("UPDATE labor_payroll_periods SET status='settled', settled_at=? WHERE id=?").run(dayjs().format('YYYY-MM-DD HH:mm:ss'), periodRow.id);
    db.prepare('DELETE FROM labor_payroll_records WHERE period_id=?').run(periodRow.id);
  }

  const workers = db.prepare("SELECT * FROM workers").all();
  let count = 0;
  const ins = db.prepare(`INSERT INTO labor_payroll_records (id,period_id,worker_id,worker_name,skill_level,day_rate,overtime_hourly,work_days,overtime_hours,base_pay,overtime_pay,bonus,deduction,advance_deduction,net_pay,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`);

  for (const w of workers) {
    const rate = effectiveRate(w.id, end);
    if (!rate) continue;
    const jobs = db.prepare(`SELECT COUNT(*) days FROM worker_jobs WHERE worker_id=? AND status='completed' AND date(completed_at) BETWEEN ? AND ?`).get(w.id, start, end);
    const workDays = jobs.days || 0;
    const adj = adjMap[w.id] || {};
    const basePay = workDays * rate.day_rate;
    const overtimePay = (adj.overtime_hours || 0) * (rate.overtime_hourly || 0);
    const bonus = adj.bonus || 0;
    const deduction = adj.deduction || 0;
    const advance = adj.advance_deduction || 0;
    const netPay = basePay + overtimePay + bonus - deduction - advance;
    ins.run(uuidv4(), periodRow.id, w.id, w.name, w.skill_level || '師傅', rate.day_rate, rate.overtime_hourly || 0, workDays, adj.overtime_hours || 0, basePay, overtimePay, bonus, deduction, advance, netPay);
    count++;
  }

  // 結算總計 + 負薪資警示
  const summary = db.prepare(`SELECT COUNT(*) cnt, SUM(net_pay) total, SUM(CASE WHEN net_pay < 0 THEN 1 ELSE 0 END) negative FROM labor_payroll_records WHERE period_id=?`).get(periodRow.id);
  res.json({ ok: true, settled: count, period_id: periodRow.id, total_net: Math.round(summary.total || 0), negative_count: summary.negative || 0 });
});

// 反結算（撤銷某期別,刪除該期薪資紀錄並還原為草稿）
router.delete('/settle', (req, res) => {
  const { year, month, period_type } = req.body;
  const period = db.prepare('SELECT * FROM labor_payroll_periods WHERE year=? AND month=? AND period_type=?').get(year, month, period_type);
  if (!period) return res.status(404).json({ error: '查無此結算期別' });
  const removed = db.prepare('DELETE FROM labor_payroll_records WHERE period_id=?').run(period.id).changes;
  db.prepare("UPDATE labor_payroll_periods SET status='draft', settled_at=NULL WHERE id=?").run(period.id);
  res.json({ ok: true, removed });
});

// 查某期別是否已結算
router.get('/period-status', (req, res) => {
  const { year, month, period_type } = req.query;
  const period = db.prepare('SELECT * FROM labor_payroll_periods WHERE year=? AND month=? AND period_type=?').get(+year, +month, period_type);
  if (!period) return res.json({ settled: false });
  const summary = db.prepare(`SELECT COUNT(*) cnt, SUM(net_pay) total FROM labor_payroll_records WHERE period_id=?`).get(period.id);
  res.json({ settled: period.status === 'settled', settled_at: period.settled_at, count: summary.cnt, total_net: Math.round(summary.total || 0) });
});

// 薪資紀錄
router.get('/records', (req, res) => {
  const { year, month, worker_id } = req.query;
  let q = `SELECT r.*, p.year, p.month, p.period_type, p.status as period_status
    FROM labor_payroll_records r JOIN labor_payroll_periods p ON p.id=r.period_id WHERE 1=1`;
  const params = [];
  if (year) { q += ' AND p.year=?'; params.push(+year); }
  if (month) { q += ' AND p.month=?'; params.push(+month); }
  if (worker_id) { q += ' AND r.worker_id=?'; params.push(worker_id); }
  q += ' ORDER BY p.year DESC, p.month DESC, r.worker_name';
  res.json(db.prepare(q).all(...params));
});

// 某點工薪資歷史
router.get('/history/:workerId', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, p.year, p.month, p.period_type, p.status as period_status
    FROM labor_payroll_records r JOIN labor_payroll_periods p ON p.id=r.period_id
    WHERE r.worker_id=? ORDER BY p.year DESC, p.month DESC
  `).all(req.params.workerId);
  const total = rows.reduce((s, r) => s + (r.net_pay || 0), 0);
  res.json({ records: rows, total_net: Math.round(total) });
});

router.get('/meta', (req, res) => {
  res.json({ skill_levels: SKILL_LEVELS, leave_types: ['特休假','病假','事假','婚假','產假','陪產假','生理假','家庭照顧假'] });
});

module.exports = router;
