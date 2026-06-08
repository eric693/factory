const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const db = require('../db');

// 師傅個人績效（依姓名查詢）
router.get('/:operator', (req, res) => {
  const { operator } = req.params;
  const { month } = req.query;
  const m = month || dayjs().format('YYYY-MM');
  const startDate = `${m}-01 00:00:00`;
  const endDate = dayjs(m + '-01').endOf('month').format('YYYY-MM-DD') + ' 23:59:59';

  // 本月回報記錄
  const logs = db.prepare(`
    SELECT pl.*, wo.product_name, wo.product_code, wo.wo_no
    FROM progress_logs pl
    JOIN work_orders wo ON wo.id=pl.work_order_id
    WHERE pl.operator=? AND pl.logged_at BETWEEN ? AND ?
    ORDER BY pl.logged_at DESC
  `).all(operator, startDate, endDate);

  const totalOk = logs.reduce((s, l) => s + (l.qty || 0), 0);
  const totalDefect = logs.reduce((s, l) => s + (l.defect_qty || 0), 0);
  const totalAll = totalOk + totalDefect;
  const yieldRate = totalAll > 0 ? Math.round(totalOk / totalAll * 100 * 10) / 10 : null;

  // 依產品彙總
  const byProduct = {};
  logs.forEach(l => {
    const key = l.product_code || l.product_name;
    if (!byProduct[key]) byProduct[key] = { product_name: l.product_name, product_code: l.product_code, ok: 0, defect: 0, logs: 0 };
    byProduct[key].ok += l.qty || 0;
    byProduct[key].defect += l.defect_qty || 0;
    byProduct[key].logs++;
  });

  // 計件薪資（如有設定）
  const rateMap = {};
  const rates = db.prepare('SELECT * FROM payroll_rates').all();
  rates.forEach(r => { rateMap[r.product_id] = r; });

  let grossPay = 0, deduction = 0;
  Object.values(byProduct).forEach(p => {
    const prod = db.prepare('SELECT id FROM products WHERE code=?').get(p.product_code);
    const rate = prod ? rateMap[prod.id] : null;
    if (rate) {
      grossPay += p.ok * (rate.piece_rate || 0);
      deduction += p.defect * (rate.defect_penalty || 0);
    }
    p.yield_rate = p.ok + p.defect > 0 ? Math.round(p.ok / (p.ok + p.defect) * 100) : null;
  });

  // 歷史月度趨勢（最近6個月）
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = dayjs().subtract(i, 'month');
    const pm = d.format('YYYY-MM');
    const ps = `${pm}-01 00:00:00`;
    const pe = d.endOf('month').format('YYYY-MM-DD') + ' 23:59:59';
    const row = db.prepare(`SELECT SUM(qty) as ok, SUM(defect_qty) as defect FROM progress_logs WHERE operator=? AND logged_at BETWEEN ? AND ?`).get(operator, ps, pe);
    trend.push({
      month: pm,
      ok: row.ok || 0,
      defect: row.defect || 0,
      yield_rate: (row.ok || 0) + (row.defect || 0) > 0 ? Math.round((row.ok || 0) / ((row.ok || 0) + (row.defect || 0)) * 100) : null,
    });
  }

  res.json({
    operator,
    month: m,
    summary: { total_ok: totalOk, total_defect: totalDefect, yield_rate: yieldRate, log_count: logs.length, gross_pay: Math.round(grossPay), deduction: Math.round(deduction), net_pay: Math.round(grossPay - deduction) },
    by_product: Object.values(byProduct),
    trend,
    recent_logs: logs.slice(0, 20),
  });
});

// 所有師傅排行榜
router.get('/', (req, res) => {
  const { month } = req.query;
  const m = month || dayjs().format('YYYY-MM');
  const startDate = `${m}-01 00:00:00`;
  const endDate = dayjs(m + '-01').endOf('month').format('YYYY-MM-DD') + ' 23:59:59';

  const operators = db.prepare(`
    SELECT pl.operator,
      SUM(pl.qty) as total_ok,
      SUM(pl.defect_qty) as total_defect,
      COUNT(*) as log_count,
      COUNT(DISTINCT pl.work_order_id) as wo_count
    FROM progress_logs pl
    WHERE pl.logged_at BETWEEN ? AND ? AND pl.operator != ''
    GROUP BY pl.operator
    ORDER BY total_ok DESC
  `).all(startDate, endDate);

  const result = operators.map(op => ({
    ...op,
    yield_rate: op.total_ok + op.total_defect > 0
      ? Math.round(op.total_ok / (op.total_ok + op.total_defect) * 100 * 10) / 10
      : null,
    avg_per_log: op.log_count > 0 ? Math.round(op.total_ok / op.log_count) : 0,
  }));

  res.json({ operators: result, month: m });
});

module.exports = router;
