const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const db = require('../db');

// 13週滾動產能規劃
router.get('/weekly', (req, res) => {
  const weeks = parseInt(req.query.weeks) || 13;
  const today = dayjs().startOf('week');
  const machines = db.prepare(`SELECT * FROM machines WHERE status='active' ORDER BY code`).all();
  const hoursPerDay = parseFloat(db.prepare(`SELECT value FROM system_settings WHERE key='work_hours_per_day'`).get()?.value || '8');

  const result = [];
  for (let w = 0; w < weeks; w++) {
    const wStart = today.add(w, 'week').format('YYYY-MM-DD');
    const wEnd = today.add(w, 'week').add(6, 'day').format('YYYY-MM-DD');
    const label = today.add(w, 'week').format('MM/DD');

    const machineLoad = machines.map(m => {
      const wos = db.prepare(`
        SELECT wo.planned_qty - wo.completed_qty as remaining, COALESCE(p.std_hours, 1) as std_hours,
          wo.planned_start, wo.planned_end
        FROM work_orders wo LEFT JOIN products p ON p.id=wo.product_id
        WHERE wo.machine_id=? AND wo.status NOT IN ('completed','cancelled')
          AND wo.planned_start <= ? AND wo.planned_end >= ?
      `).all(m.id, wEnd, wStart);

      // 將工單總工時依「與本週重疊天數 / 工單總天數」比例攤提，避免跨週重複計算
      const loadHrs = wos.reduce((s, w) => {
        const totalHrs = Math.max(0, w.remaining) * w.std_hours;
        const woStart = dayjs(w.planned_start);
        const woEnd = dayjs(w.planned_end);
        const totalDays = Math.max(1, woEnd.diff(woStart, 'day') + 1);
        const overlapStart = woStart.isAfter(dayjs(wStart)) ? woStart : dayjs(wStart);
        const overlapEnd = woEnd.isBefore(dayjs(wEnd)) ? woEnd : dayjs(wEnd);
        const overlapDays = Math.max(0, overlapEnd.diff(overlapStart, 'day') + 1);
        return s + totalHrs * (overlapDays / totalDays);
      }, 0);

      const capacityHrs = 5 * hoursPerDay; // 5 workdays/week
      const loadPct = capacityHrs > 0 ? Math.round(loadHrs / capacityHrs * 100) : 0;

      return {
        machine_id: m.id,
        machine_name: m.name,
        machine_code: m.code,
        load_hours: Math.round(loadHrs * 10) / 10,
        capacity_hours: capacityHrs,
        load_pct: loadPct,
        status: loadPct >= 100 ? 'overloaded' : loadPct >= 80 ? 'warning' : 'ok',
      };
    });

    result.push({ week: w + 1, label, start: wStart, end: wEnd, machines: machineLoad });
  }

  res.json({ weeks: result, machines: machines.map(m => ({ id: m.id, name: m.name, code: m.code })) });
});

// 訂單可行性檢查（報價時用）
router.get('/feasibility', (req, res) => {
  const { due_date, items } = req.query;
  if (!due_date) return res.status(400).json({ error: '需要提供交期' });

  const itemList = items ? JSON.parse(items) : [];
  const machines = db.prepare(`SELECT * FROM machines WHERE status='active'`).all();
  const hoursPerDay = parseFloat(db.prepare(`SELECT value FROM system_settings WHERE key='work_hours_per_day'`).get()?.value || '8');
  const today = dayjs();
  const dueDate = dayjs(due_date);
  const availableDays = dueDate.diff(today, 'day');

  const result = itemList.map(item => {
    const product = item.product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(item.product_id) : null;
    const stdHours = product?.std_hours || 1;
    const requiredHours = stdHours * (item.qty || 0);
    const requiredDays = Math.ceil(requiredHours / hoursPerDay);

    // 找最早可用機台
    const machineLoads = machines.map(m => {
      const existing = db.prepare(`
        SELECT COALESCE(SUM((planned_qty-completed_qty)*COALESCE(p.std_hours,1)),0) as load_hrs
        FROM work_orders wo LEFT JOIN products p ON p.id=wo.product_id
        WHERE wo.machine_id=? AND wo.status NOT IN ('completed','cancelled') AND wo.planned_end >= date('now')
      `).get(m.id);
      const availableHrs = availableDays * hoursPerDay;
      const remainingHrs = availableHrs - (existing.load_hrs || 0);
      return { ...m, remaining_hrs: Math.max(0, remainingHrs), load_hrs: existing.load_hrs || 0 };
    });

    const bestMachine = machineLoads.sort((a, b) => b.remaining_hrs - a.remaining_hrs)[0];
    const feasible = bestMachine && bestMachine.remaining_hrs >= requiredHours;

    return {
      product_name: product?.name || item.product_name || '',
      qty: item.qty,
      required_hours: Math.round(requiredHours * 10) / 10,
      required_days: requiredDays,
      feasible,
      suggested_machine: bestMachine?.name,
      available_hours: Math.round(bestMachine?.remaining_hrs * 10) / 10,
    };
  });

  const allFeasible = result.every(r => r.feasible);
  res.json({ feasible: allFeasible, items: result, available_days: availableDays });
});

module.exports = router;
