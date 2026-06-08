const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const db = require('../db');

const getDefaultLaborRate = () => {
  const row = db.prepare("SELECT value FROM system_settings WHERE key='default_labor_rate'").get();
  return row ? parseFloat(row.value) : 300;
};

// 訂單利潤分析
router.get('/orders', (req, res) => {
  const { month, year, status } = req.query;
  const period = month || `${year || dayjs().format('YYYY')}-01`;

  let q = `
    SELECT o.id, o.order_no, o.customer_name, o.status, o.due_date, o.created_at, o.total_revenue,
      COUNT(DISTINCT oi.id) as item_count,
      SUM(oi.qty) as total_qty,
      SUM(oi.qty * oi.unit_price) as revenue_from_items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id=o.id
    WHERE 1=1
  `;
  const params = [];

  if (month) { q += ' AND strftime(\'%Y-%m\', o.created_at)=?'; params.push(month); }
  else if (year) { q += ' AND strftime(\'%Y\', o.created_at)=?'; params.push(year); }
  if (status && status !== 'all') { q += ' AND o.status=?'; params.push(status); }
  q += ' GROUP BY o.id ORDER BY o.created_at DESC LIMIT 100';

  const orders = db.prepare(q).all(...params);
  const laborRate = getDefaultLaborRate();

  const result = orders.map(order => {
    // 收入 = total_revenue（手動設定）或 revenue_from_items（明細單價）
    const revenue = order.total_revenue || order.revenue_from_items || 0;

    // 成本：從工單計算
    const wos = db.prepare(`
      SELECT wo.*, p.std_hours, p.labor_cost_per_hour
      FROM work_orders wo LEFT JOIN products p ON p.id=wo.product_id
      WHERE wo.order_id=?
    `).all(order.id);

    let materialCost = 0, laborCost = 0, outsourceCost = 0;

    for (const wo of wos) {
      // 原料成本
      if (wo.product_id) {
        const boms = db.prepare(`SELECT b.qty_per_unit, m.unit_cost FROM bom b JOIN materials m ON m.id=b.material_id WHERE b.product_id=?`).all(wo.product_id);
        materialCost += boms.reduce((s, b) => s + b.qty_per_unit * (b.unit_cost || 0), 0) * (wo.completed_qty || 0);
      }

      // 人工成本（實際）
      if (wo.actual_start && wo.actual_end) {
        const hours = dayjs(wo.actual_end).diff(dayjs(wo.actual_start), 'minute') / 60;
        laborCost += hours * (wo.labor_cost_per_hour || laborRate);
      } else {
        // 標準工時估算
        const stdHours = (wo.std_hours || 1) * (wo.completed_qty || 0);
        laborCost += stdHours * (wo.labor_cost_per_hour || laborRate);
      }

      // 外發成本
      const outsource = db.prepare(`SELECT SUM(total_cost) as total FROM outsource_orders WHERE work_order_id=? AND status='completed'`).get(wo.id);
      outsourceCost += outsource?.total || 0;
    }

    const totalCost = materialCost + laborCost + outsourceCost;
    const grossProfit = revenue - totalCost;
    const grossMargin = revenue > 0 ? Math.round(grossProfit / revenue * 100 * 10) / 10 : null;

    return {
      ...order,
      revenue: Math.round(revenue),
      material_cost: Math.round(materialCost),
      labor_cost: Math.round(laborCost),
      outsource_cost: Math.round(outsourceCost),
      total_cost: Math.round(totalCost),
      gross_profit: Math.round(grossProfit),
      gross_margin_pct: grossMargin,
    };
  });

  const totals = {
    revenue: result.reduce((s, r) => s + r.revenue, 0),
    total_cost: result.reduce((s, r) => s + r.total_cost, 0),
    gross_profit: result.reduce((s, r) => s + r.gross_profit, 0),
    avg_margin: result.filter(r => r.revenue > 0).length > 0
      ? Math.round(result.filter(r => r.revenue > 0).reduce((s, r) => s + (r.gross_margin_pct || 0), 0) / result.filter(r => r.revenue > 0).length * 10) / 10
      : null,
  };

  res.json({ orders: result, totals });
});

// 設定訂單收入（手動輸入報價金額）
router.patch('/orders/:order_id/revenue', (req, res) => {
  const { total_revenue, items } = req.body;
  if (total_revenue !== undefined) {
    db.prepare('UPDATE orders SET total_revenue=? WHERE id=?').run(total_revenue, req.params.order_id);
  }
  if (items) {
    items.forEach(item => {
      db.prepare('UPDATE order_items SET unit_price=? WHERE id=? AND order_id=?').run(item.unit_price || 0, item.id, req.params.order_id);
    });
    // 重算 total_revenue
    const total = db.prepare('SELECT SUM(qty*unit_price) as total FROM order_items WHERE order_id=?').get(req.params.order_id)?.total || 0;
    db.prepare('UPDATE orders SET total_revenue=? WHERE id=?').run(total, req.params.order_id);
  }
  res.json({ ok: true });
});

// 月度利潤趨勢
router.get('/monthly', (req, res) => {
  const { year } = req.query;
  const y = year || dayjs().format('YYYY');
  const laborRate = getDefaultLaborRate();

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const result = months.map(m => {
    const period = `${y}-${m}`;
    const orders = db.prepare(`SELECT id, total_revenue FROM orders WHERE strftime('%Y-%m', created_at)=?`).all(period);

    let revenue = 0, matCost = 0, laborCost = 0;
    orders.forEach(o => {
      revenue += o.total_revenue || 0;
      const wos = db.prepare('SELECT wo.*, p.std_hours, p.labor_cost_per_hour FROM work_orders wo LEFT JOIN products p ON p.id=wo.product_id WHERE wo.order_id=?').all(o.id);
      wos.forEach(wo => {
        if (wo.product_id) {
          const boms = db.prepare('SELECT b.qty_per_unit, m.unit_cost FROM bom b JOIN materials m ON m.id=b.material_id WHERE b.product_id=?').all(wo.product_id);
          matCost += boms.reduce((s, b) => s + b.qty_per_unit * (b.unit_cost || 0), 0) * (wo.completed_qty || 0);
        }
        const hrs = (wo.std_hours || 1) * (wo.completed_qty || 0);
        laborCost += hrs * (wo.labor_cost_per_hour || laborRate);
      });
    });

    const totalCost = matCost + laborCost;
    return {
      month: m,
      period,
      revenue: Math.round(revenue),
      total_cost: Math.round(totalCost),
      gross_profit: Math.round(revenue - totalCost),
      margin_pct: revenue > 0 ? Math.round((revenue - totalCost) / revenue * 100 * 10) / 10 : 0,
    };
  });

  res.json(result);
});

// 客戶貢獻度排行
router.get('/customers', (req, res) => {
  const { year } = req.query;
  const y = year || dayjs().format('YYYY');

  const customers = db.prepare(`
    SELECT o.customer_name,
      COUNT(*) as order_count,
      SUM(o.total_revenue) as total_revenue,
      SUM(CASE WHEN o.status='shipped' THEN 1 ELSE 0 END) as shipped_count
    FROM orders o
    WHERE strftime('%Y', o.created_at)=? AND o.total_revenue > 0
    GROUP BY o.customer_name
    ORDER BY total_revenue DESC
    LIMIT 20
  `).all(y);

  res.json(customers);
});

module.exports = router;
