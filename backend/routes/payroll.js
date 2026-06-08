const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// ── 計件費率設定 ──────────────────────────────────────────────
router.get('/rates', (req, res) => {
  const rates = db.prepare('SELECT pr.*, p.name as product_name FROM payroll_rates pr LEFT JOIN products p ON p.id=pr.product_id ORDER BY pr.product_code').all();
  res.json(rates);
});

router.post('/rates', (req, res) => {
  const { product_id, piece_rate, defect_penalty, bonus_threshold, bonus_rate } = req.body;
  if (!product_id) return res.status(400).json({ error: '產品為必填' });
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(product_id);
  const id = uuidv4();
  db.prepare(`INSERT OR REPLACE INTO payroll_rates (id,product_id,product_code,product_name,piece_rate,defect_penalty,bonus_threshold,bonus_rate)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, product_id, p?.code || '', p?.name || '', piece_rate || 0, defect_penalty || 0, bonus_threshold || 0, bonus_rate || 0);
  res.json({ ok: true, id });
});

router.patch('/rates/:id', (req, res) => {
  const { piece_rate, defect_penalty, bonus_threshold, bonus_rate } = req.body;
  db.prepare('UPDATE payroll_rates SET piece_rate=?, defect_penalty=?, bonus_threshold=?, bonus_rate=? WHERE id=?').run(piece_rate, defect_penalty, bonus_threshold, bonus_rate, req.params.id);
  res.json({ ok: true });
});

// ── 薪資期別 ──────────────────────────────────────────────────
router.get('/periods', (req, res) => {
  res.json(db.prepare('SELECT * FROM payroll_periods ORDER BY period DESC LIMIT 24').all());
});

router.post('/periods', (req, res) => {
  const { period, note } = req.body;
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO payroll_periods (id,period,status,note) VALUES (?,?,\'open\',?)').run(id, period, note || '');
  res.json({ ok: true, id, period });
});

// ── 計算薪資（依期別從 progress_logs 彙總）──────────────────
router.get('/calculate/:period', (req, res) => {
  const { period } = req.params;
  const [y, m] = period.split('-');
  const startDate = `${y}-${m}-01`;
  const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

  // 從 progress_logs 取本期回報，關聯工單產品
  const logs = db.prepare(`
    SELECT pl.operator, pl.qty, pl.defect_qty,
           wo.product_id, wo.product_name, wo.product_code, wo.id as wo_id
    FROM progress_logs pl
    JOIN work_orders wo ON wo.id=pl.work_order_id
    WHERE pl.logged_at >= ? AND pl.logged_at <= ? AND pl.operator != ''
    ORDER BY pl.operator, wo.product_code
  `).all(startDate + ' 00:00:00', endDate + ' 23:59:59');

  // 依 operator + product 彙總
  const grouped = {};
  logs.forEach(log => {
    const key = `${log.operator}||${log.product_id || log.product_code}`;
    if (!grouped[key]) {
      grouped[key] = {
        operator: log.operator,
        product_id: log.product_id,
        product_name: log.product_name,
        product_code: log.product_code,
        ok_qty: 0,
        defect_qty: 0,
      };
    }
    grouped[key].ok_qty += log.qty || 0;
    grouped[key].defect_qty += log.defect_qty || 0;
  });

  const records = Object.values(grouped).map(row => {
    const rate = row.product_id
      ? db.prepare('SELECT * FROM payroll_rates WHERE product_id=?').get(row.product_id)
      : null;

    const piece_rate = rate?.piece_rate || 0;
    const defect_penalty = rate?.defect_penalty || 0;
    const bonus_threshold = rate?.bonus_threshold || 0;
    const bonus_rate = rate?.bonus_rate || 0;

    const gross = row.ok_qty * piece_rate;
    const deduction = row.defect_qty * defect_penalty;
    const bonus = (bonus_threshold > 0 && row.ok_qty >= bonus_threshold) ? row.ok_qty * bonus_rate : 0;
    const net = gross - deduction + bonus;

    return {
      ...row,
      piece_rate,
      defect_penalty,
      gross_amount: Math.round(gross),
      deduction: Math.round(deduction),
      bonus: Math.round(bonus),
      net_amount: Math.round(net),
    };
  });

  // 依操作員彙總
  const byOperator = {};
  records.forEach(r => {
    if (!byOperator[r.operator]) {
      byOperator[r.operator] = { operator: r.operator, total_ok: 0, total_defect: 0, gross: 0, deduction: 0, bonus: 0, net: 0, details: [] };
    }
    byOperator[r.operator].total_ok += r.ok_qty;
    byOperator[r.operator].total_defect += r.defect_qty;
    byOperator[r.operator].gross += r.gross_amount;
    byOperator[r.operator].deduction += r.deduction;
    byOperator[r.operator].bonus += r.bonus;
    byOperator[r.operator].net += r.net_amount;
    byOperator[r.operator].details.push(r);
  });

  const summary = Object.values(byOperator).sort((a, b) => b.net - a.net);
  const totals = { gross: summary.reduce((s, r) => s + r.gross, 0), net: summary.reduce((s, r) => s + r.net, 0) };

  res.json({ period, records: summary, totals });
});

// 儲存薪資計算結果
router.post('/save/:period', (req, res) => {
  const { period } = req.params;
  const { records } = req.body;

  let periodRow = db.prepare('SELECT id FROM payroll_periods WHERE period=?').get(period);
  if (!periodRow) {
    const id = uuidv4();
    db.prepare('INSERT INTO payroll_periods (id,period,status) VALUES (?,?,\'open\')').run(id, period);
    periodRow = { id };
  }

  // 清除舊記錄重寫
  db.prepare('DELETE FROM payroll_records WHERE period=?').run(period);
  const ins = db.prepare(`INSERT INTO payroll_records (id,period_id,period,operator,product_name,product_code,ok_qty,defect_qty,piece_rate,defect_penalty,gross_amount,deduction,net_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  (records || []).forEach(r => {
    ins.run(uuidv4(), periodRow.id, period, r.operator, r.product_name || '', r.product_code || '', r.ok_qty || 0, r.defect_qty || 0, r.piece_rate || 0, r.defect_penalty || 0, r.gross_amount || 0, r.deduction || 0, r.net_amount || 0);
  });

  res.json({ ok: true });
});

// 封帳
router.patch('/periods/:period/close', (req, res) => {
  db.prepare("UPDATE payroll_periods SET status='closed', closed_at=datetime('now','localtime') WHERE period=?").run(req.params.period);
  res.json({ ok: true });
});

module.exports = router;
