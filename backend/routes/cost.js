const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const db = require('../db');

const getDefaultLaborRate = () => {
  const row = db.prepare(`SELECT value FROM system_settings WHERE key='default_labor_rate'`).get();
  return row ? parseFloat(row.value) : 300;
};

// 訂單成本分析
router.get('/orders', (req, res) => {
  const { month, year } = req.query;
  const m = month || dayjs().format('YYYY-MM');

  const orders = db.prepare(`
    SELECT o.id, o.order_no, o.customer_name, o.status, o.due_date, o.created_at,
           COUNT(wo.id) as wo_count,
           SUM(wo.planned_qty) as total_planned,
           SUM(wo.completed_qty) as total_completed,
           SUM(wo.defect_qty) as total_defect
    FROM orders o
    LEFT JOIN work_orders wo ON wo.order_id=o.id
    WHERE strftime('%Y-%m', o.created_at) = ?
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `).all(m);

  const result = orders.map(order => {
    const wos = db.prepare(`
      SELECT wo.*, p.std_hours, p.labor_cost_per_hour
      FROM work_orders wo
      LEFT JOIN products p ON p.id=wo.product_id
      WHERE wo.order_id=?
    `).all(order.id);

    let materialCost = 0;
    let laborCost = 0;
    let stdLaborCost = 0;

    for (const wo of wos) {
      // 實際人工成本 (以實際時間計算)
      let actualHours = 0;
      if (wo.actual_start && wo.actual_end) {
        actualHours = dayjs(wo.actual_end).diff(dayjs(wo.actual_start), 'minute') / 60;
      }
      const rate = wo.labor_cost_per_hour || getDefaultLaborRate();
      laborCost += actualHours * rate;

      // 標準人工成本
      const stdHours = (wo.std_hours || 1) * (wo.completed_qty || 0);
      stdLaborCost += stdHours * rate;

      // 原料成本
      if (wo.product_id) {
        const boms = db.prepare(`
          SELECT b.qty_per_unit, m.unit_cost
          FROM bom b JOIN materials m ON m.id=b.material_id
          WHERE b.product_id=?
        `).all(wo.product_id);
        const matCostPerUnit = boms.reduce((s, b) => s + b.qty_per_unit * (b.unit_cost || 0), 0);
        materialCost += matCostPerUnit * (wo.completed_qty || 0);
      }
    }

    const totalCost = materialCost + laborCost;
    const laborVariance = laborCost - stdLaborCost;
    const total = order.total_completed || 0;
    const defect = order.total_defect || 0;
    const yieldRate = total + defect > 0 ? Math.round(total / (total + defect) * 100) : 100;

    return {
      ...order,
      material_cost: Math.round(materialCost),
      labor_cost: Math.round(laborCost),
      std_labor_cost: Math.round(stdLaborCost),
      labor_variance: Math.round(laborVariance),
      total_cost: Math.round(totalCost),
      cost_per_unit: total > 0 ? Math.round(totalCost / total) : 0,
      yield_rate: yieldRate,
    };
  });

  const totals = {
    total_material: result.reduce((s, r) => s + r.material_cost, 0),
    total_labor: result.reduce((s, r) => s + r.labor_cost, 0),
    total_std_labor: result.reduce((s, r) => s + r.std_labor_cost, 0),
    total_variance: result.reduce((s, r) => s + r.labor_variance, 0),
    total_cost: result.reduce((s, r) => s + r.total_cost, 0),
  };

  res.json({ orders: result, totals, month: m });
});

// 產品成本分析（依產品彙總）
router.get('/products', (req, res) => {
  const { year } = req.query;
  const y = year || dayjs().format('YYYY');

  const products = db.prepare(`
    SELECT wo.product_id, wo.product_name, wo.product_code,
           COUNT(*) as wo_count,
           SUM(wo.completed_qty) as total_qty,
           SUM(wo.defect_qty) as total_defect
    FROM work_orders wo
    WHERE strftime('%Y', wo.created_at)=? AND wo.status='completed'
    GROUP BY wo.product_code
    ORDER BY total_qty DESC
  `).all(y);

  const result = products.map(p => {
    if (!p.product_id) return { ...p, material_cost_unit: 0, labor_cost_unit: 0, total_cost_unit: 0 };

    const boms = db.prepare(`
      SELECT b.qty_per_unit, m.unit_cost
      FROM bom b JOIN materials m ON m.id=b.material_id
      WHERE b.product_id=?
    `).all(p.product_id);

    const matCostUnit = boms.reduce((s, b) => s + b.qty_per_unit * (b.unit_cost || 0), 0);
    const prod = db.prepare('SELECT std_hours, labor_cost_per_hour FROM products WHERE id=?').get(p.product_id);
    const laborCostUnit = (prod?.std_hours || 1) * (prod?.labor_cost_per_hour || getDefaultLaborRate());
    const totalCostUnit = matCostUnit + laborCostUnit;
    const yieldRate = p.total_qty + p.total_defect > 0
      ? Math.round(p.total_qty / (p.total_qty + p.total_defect) * 100) : 100;

    return {
      ...p,
      material_cost_unit: Math.round(matCostUnit * 100) / 100,
      labor_cost_unit: Math.round(laborCostUnit * 100) / 100,
      total_cost_unit: Math.round(totalCostUnit * 100) / 100,
      total_material_cost: Math.round(matCostUnit * p.total_qty),
      total_labor_cost: Math.round(laborCostUnit * p.total_qty),
      total_cost: Math.round(totalCostUnit * p.total_qty),
      yield_rate: yieldRate,
    };
  });

  res.json({ products: result, year: y });
});

// 人工效率分析（標準 vs 實際工時）
router.get('/labor-efficiency', (req, res) => {
  const { month } = req.query;
  const m = month || dayjs().format('YYYY-MM');

  const wos = db.prepare(`
    SELECT wo.id, wo.wo_no, wo.product_name, wo.product_code,
           wo.completed_qty, wo.defect_qty, wo.operator,
           wo.actual_start, wo.actual_end,
           p.std_hours, p.labor_cost_per_hour
    FROM work_orders wo
    LEFT JOIN products p ON p.id=wo.product_id
    WHERE strftime('%Y-%m', wo.actual_end)=? AND wo.status='completed'
    ORDER BY wo.actual_end DESC
  `).all(m);

  const result = wos.map(wo => {
    const stdHours = (wo.std_hours || 1) * (wo.completed_qty || 0);
    let actualHours = 0;
    if (wo.actual_start && wo.actual_end) {
      actualHours = dayjs(wo.actual_end).diff(dayjs(wo.actual_start), 'minute') / 60;
    }
    const efficiency = actualHours > 0 ? Math.round((stdHours / actualHours) * 100) : 100;
    const rate = wo.labor_cost_per_hour || 300;

    return {
      ...wo,
      std_hours: Math.round(stdHours * 10) / 10,
      actual_hours: Math.round(actualHours * 10) / 10,
      efficiency_pct: efficiency,
      std_labor_cost: Math.round(stdHours * rate),
      actual_labor_cost: Math.round(actualHours * rate),
      variance: Math.round((actualHours - stdHours) * rate),
    };
  });

  const summary = {
    total_std_hours: result.reduce((s, r) => s + r.std_hours, 0),
    total_actual_hours: result.reduce((s, r) => s + r.actual_hours, 0),
    total_variance_cost: result.reduce((s, r) => s + r.variance, 0),
    avg_efficiency: result.length > 0
      ? Math.round(result.reduce((s, r) => s + r.efficiency_pct, 0) / result.length)
      : 100,
  };

  res.json({ items: result, summary, month: m });
});

module.exports = router;
