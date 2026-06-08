const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const db = require('../db');

router.get('/', (req, res) => {
  const date = req.query.date || dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs(date).subtract(1, 'day').format('YYYY-MM-DD');

  // 昨日生產完成
  const yesterdayOutput = db.prepare(`
    SELECT wo.product_name, wo.product_code, wo.machine_name, wo.operator,
           SUM(pl.qty) as ok_qty, SUM(pl.defect_qty) as defect_qty
    FROM progress_logs pl
    JOIN work_orders wo ON wo.id=pl.work_order_id
    WHERE date(pl.logged_at)=?
    GROUP BY wo.id
    ORDER BY ok_qty DESC
  `).all(yesterday);

  // 今日待生產工單
  const todayWOs = db.prepare(`
    SELECT wo.wo_no, wo.product_name, wo.planned_qty, wo.completed_qty,
           wo.machine_name, wo.operator, wo.status, wo.planned_end,
           o.order_no, o.customer_name, o.due_date
    FROM work_orders wo
    LEFT JOIN orders o ON o.id=wo.order_id
    WHERE wo.status IN ('scheduled','in_progress')
    ORDER BY wo.planned_start ASC
    LIMIT 20
  `).all();

  // 即將到期訂單（3天內）
  const urgentDue = db.prepare(`
    SELECT order_no, customer_name, due_date, status
    FROM orders
    WHERE due_date BETWEEN ? AND date(?, '+3 days')
      AND status NOT IN ('shipped','cancelled')
    ORDER BY due_date ASC
  `).all(date, date);

  // 過期未出貨
  const overdue = db.prepare(`
    SELECT order_no, customer_name, due_date, status
    FROM orders
    WHERE due_date < ? AND status NOT IN ('shipped','cancelled')
    ORDER BY due_date ASC
  `).all(date);

  // 未處理異常
  const openAnomalies = db.prepare(`
    SELECT title, type, severity, machine_name, reporter, created_at
    FROM anomalies WHERE status='open'
    ORDER BY severity DESC, created_at ASC
    LIMIT 10
  `).all();

  // 庫存缺料（MRP 簡版）
  const materialShortages = db.prepare(`
    SELECT m.name, m.code, m.unit, m.stock_qty, m.safety_stock,
           (m.safety_stock - m.stock_qty) as shortage
    FROM materials m
    WHERE m.stock_qty < m.safety_stock AND m.safety_stock > 0
    ORDER BY shortage DESC
    LIMIT 10
  `).all();

  // 今日統計摘要
  const stats = {
    yesterday_ok: yesterdayOutput.reduce((s, r) => s + (r.ok_qty || 0), 0),
    yesterday_defect: yesterdayOutput.reduce((s, r) => s + (r.defect_qty || 0), 0),
    today_scheduled: todayWOs.filter(w => w.status === 'scheduled').length,
    today_in_progress: todayWOs.filter(w => w.status === 'in_progress').length,
    overdue_count: overdue.length,
    open_anomalies: openAnomalies.length,
    material_shortage_count: materialShortages.length,
  };

  if (stats.yesterday_ok + stats.yesterday_defect > 0) {
    stats.yesterday_yield = Math.round(stats.yesterday_ok / (stats.yesterday_ok + stats.yesterday_defect) * 100);
  } else {
    stats.yesterday_yield = 100;
  }

  // 成品庫存狀態
  const fgStock = db.prepare(`
    SELECT product_name, product_code, SUM(qty) as total_qty
    FROM finished_goods WHERE status='in_stock'
    GROUP BY product_code
    ORDER BY total_qty DESC
    LIMIT 10
  `).all();

  res.json({
    report_date: date,
    generated_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    stats,
    yesterday_output: yesterdayOutput,
    today_work_orders: todayWOs,
    urgent_due: urgentDue,
    overdue,
    open_anomalies: openAnomalies,
    material_shortages: materialShortages,
    fg_stock: fgStock,
  });
});

module.exports = router;
