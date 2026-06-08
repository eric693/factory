const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

// ── 工作日計算（跳過週六日）──────────────────────────────────────
function addWorkdays(startDate, days) {
  let d = dayjs(startDate);
  let added = 0;
  while (added < days) {
    d = d.add(1, 'day');
    if (d.day() !== 0 && d.day() !== 6) added++;
  }
  return d;
}

function workdaysBetween(start, end) {
  let d = dayjs(start);
  const e = dayjs(end);
  let count = 0;
  while (d.isBefore(e, 'day')) {
    if (d.day() !== 0 && d.day() !== 6) count++;
    d = d.add(1, 'day');
  }
  return count;
}

// ── TOC 瓶頸分析 ────────────────────────────────────────────────
function analyzeBottleneck() {
  const machines = db.prepare(`SELECT * FROM machines WHERE status='active'`).all();
  const results = [];

  for (const m of machines) {
    const pendingWOs = db.prepare(`
      SELECT wo.*, p.std_hours
      FROM work_orders wo
      LEFT JOIN products p ON p.code = wo.product_code
      WHERE wo.machine_id = ? AND wo.status NOT IN ('completed','cancelled')
    `).all(m.id);

    const totalHours = pendingWOs.reduce((s, w) => {
      const hrs = (w.std_hours || 1) * (w.planned_qty - w.completed_qty);
      return s + hrs;
    }, 0);

    const capacityDays = m.capacity_per_day || 8;
    const loadDays = totalHours / capacityDays;

    results.push({
      machine_id: m.id,
      machine_name: m.name,
      machine_code: m.code,
      pending_jobs: pendingWOs.length,
      total_load_hours: Math.round(totalHours * 10) / 10,
      load_days: Math.round(loadDays * 10) / 10,
      utilization_pct: Math.min(Math.round((loadDays / 20) * 100), 999),
      is_bottleneck: false,
    });
  }

  // 標記最大負載為瓶頸
  if (results.length > 0) {
    const maxLoad = Math.max(...results.map(r => r.total_load_hours));
    results.forEach(r => { r.is_bottleneck = r.total_load_hours === maxLoad && maxLoad > 0; });
  }

  return results.sort((a, b) => b.total_load_hours - a.total_load_hours);
}

// ── 產能預警 ─────────────────────────────────────────────────────
function capacityWarnings(days = 14) {
  const warnings = [];
  const horizon = dayjs().add(days, 'day');
  const machines = db.prepare(`SELECT * FROM machines WHERE status='active'`).all();

  for (const m of machines) {
    const wos = db.prepare(`
      SELECT * FROM work_orders
      WHERE machine_id = ? AND planned_end <= ? AND status NOT IN ('completed','cancelled')
    `).all(m.id, horizon.format('YYYY-MM-DD'));

    const totalHours = wos.reduce((s, w) => {
      const hrs = (w.planned_qty - w.completed_qty);
      return s + hrs;
    }, 0);

    const threshold = parseFloat(db.prepare(`SELECT value FROM system_settings WHERE key='capacity_warning_threshold'`).get()?.value || '85') / 100;
    const availableHours = days * m.capacity_per_day;
    if (totalHours > availableHours * threshold) {
      warnings.push({
        machine_id: m.id,
        machine_name: m.name,
        load_pct: Math.round((totalHours / availableHours) * 100),
        days_horizon: days,
      });
    }
  }
  return warnings;
}

// ── 換模時間查詢 ──────────────────────────────────────────────────
function getChangeover(fromProductId, toProductId, machineId) {
  if (!fromProductId || !toProductId || fromProductId === toProductId) return 0;
  const row = db.prepare(`
    SELECT changeover_min FROM changeover_matrix
    WHERE from_product_id=? AND to_product_id=? AND machine_id=?
  `).get(fromProductId, toProductId, machineId);
  return row ? row.changeover_min : 30; // 預設30分鐘
}

// ── 急件插單重排 ──────────────────────────────────────────────────
function insertUrgentOrder(orderId) {
  const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId);
  if (!order) return { error: '找不到訂單' };

  // 強制設為最高優先
  db.prepare(`UPDATE orders SET priority=1, status='scheduled' WHERE id=?`).run(orderId);

  const items = db.prepare(`SELECT oi.*, p.std_hours FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?`).all(orderId);
  const machines = db.prepare(`SELECT * FROM machines WHERE status='active' ORDER BY code`).all();

  if (!machines.length) return { error: '沒有可用機台' };

  const insertWO = db.prepare(`
    INSERT OR REPLACE INTO work_orders
    (id,wo_no,order_id,order_item_id,product_id,product_name,product_code,planned_qty,machine_id,machine_name,status,planned_start,planned_end)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let woCounter = db.prepare(`SELECT COUNT(*) as cnt FROM work_orders`).get().cnt + 1;
  const conflicts = [];
  const newWOs = [];
  const today = dayjs().format('YYYY-MM-DD');

  for (const item of items) {
    const existing = db.prepare(`SELECT * FROM work_orders WHERE order_item_id=?`).get(item.id);
    if (existing && ['completed','in_progress'].includes(existing.status)) continue;

    const stdHours = item.std_hours || 1;
    const daysNeeded = Math.ceil((stdHours * item.qty) / 8);

    // 找負載最少的機台
    const machineLoad = machines.map(m => {
      const load = db.prepare(`
        SELECT COUNT(*) as cnt FROM work_orders
        WHERE machine_id=? AND status NOT IN ('completed','cancelled') AND planned_start >= ?
      `).get(m.id, today);
      return { ...m, load: load.cnt };
    });
    const best = machineLoad.sort((a, b) => a.load - b.load)[0];

    const end = addWorkdays(today, daysNeeded).format('YYYY-MM-DD');
    const woNo = `WO-${dayjs().format('YYYY')}-${String(woCounter).padStart(3, '0')}`;
    const woId = existing ? existing.id : uuidv4();

    insertWO.run(woId, existing ? existing.wo_no : woNo, item.order_id, item.id,
      item.product_id || null, item.product_name, item.product_code, item.qty,
      best.id, best.name, 'scheduled', today, end);

    // 偵測衝突：機台在此期間已有排程
    const conflicting = db.prepare(`
      SELECT wo_no, product_name FROM work_orders
      WHERE machine_id=? AND id!=? AND status NOT IN ('completed','cancelled')
        AND planned_start <= ? AND planned_end >= ?
    `).all(best.id, woId, end, today);

    if (conflicting.length) {
      conflicts.push({ machine: best.name, conflicting: conflicting.map(c => c.wo_no) });
    }

    newWOs.push({ wo_no: woNo, machine: best.name, start: today, end, days: daysNeeded });
    woCounter++;
  }

  return { success: true, workOrders: newWOs, conflicts };
}

// ── 一般自動排產 ───────────────────────────────────────────────────
function autoSchedule(orderIds) {
  const results = [];

  let orders;
  if (orderIds && orderIds.length > 0) {
    const placeholders = orderIds.map(() => '?').join(',');
    orders = db.prepare(`
      SELECT o.*, oi.id as item_id, oi.product_id, oi.product_name, oi.product_code, oi.qty,
             p.std_hours
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.id IN (${placeholders})
      ORDER BY o.priority ASC, o.due_date ASC
    `).all(...orderIds);
  } else {
    orders = db.prepare(`
      SELECT o.*, oi.id as item_id, oi.product_id, oi.product_name, oi.product_code, oi.qty,
             p.std_hours
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.status IN ('pending','scheduled')
      ORDER BY o.priority ASC, o.due_date ASC
    `).all();
  }

  const machines = db.prepare(`SELECT * FROM machines WHERE status='active'`).all();
  if (!machines.length) return results;

  // 機台可用時間追蹤
  const machineAvailability = {};
  machines.forEach(m => {
    const lastWO = db.prepare(`
      SELECT planned_end FROM work_orders
      WHERE machine_id=? AND status NOT IN ('completed','cancelled')
      ORDER BY planned_end DESC LIMIT 1
    `).get(m.id);
    machineAvailability[m.id] = lastWO ? dayjs(lastWO.planned_end) : dayjs();
  });

  // 機台上一個產品（用於換模計算）
  const machineLastProduct = {};
  machines.forEach(m => {
    const lastWO = db.prepare(`
      SELECT product_code FROM work_orders
      WHERE machine_id=? AND status NOT IN ('cancelled')
      ORDER BY planned_end DESC LIMIT 1
    `).get(m.id);
    machineLastProduct[m.id] = lastWO ? lastWO.product_code : null;
  });

  const insertWO = db.prepare(`
    INSERT OR REPLACE INTO work_orders
    (id,wo_no,order_id,order_item_id,product_id,product_name,product_code,planned_qty,machine_id,machine_name,status,planned_start,planned_end)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const updateOrder = db.prepare(`UPDATE orders SET status='scheduled' WHERE id=?`);
  let woCounter = db.prepare(`SELECT COUNT(*) as cnt FROM work_orders`).get().cnt + 1;

  for (const item of orders) {
    const existing = db.prepare(`SELECT id FROM work_orders WHERE order_item_id=?`).get(item.item_id);
    if (existing) continue;

    const stdHours = item.std_hours || 1;
    const totalHours = stdHours * item.qty;
    const daysNeeded = Math.ceil(totalHours / 8);

    // 選最早可用機台（考慮換模時間）
    let bestMachine = machines[0];
    let bestAvail = machineAvailability[machines[0].id];

    for (const m of machines) {
      const avail = machineAvailability[m.id];
      // 加換模時間（分鐘轉天）
      const changeoverHrs = getChangeover(
        machineLastProduct[m.id],
        item.product_id,
        m.id
      ) / 60;
      const effectiveAvail = avail.add(Math.ceil(changeoverHrs * 8), 'hour');

      if (effectiveAvail.isBefore(bestAvail)) {
        bestMachine = m;
        bestAvail = effectiveAvail;
      }
    }

    const start = bestAvail.format('YYYY-MM-DD');
    const end = addWorkdays(start, daysNeeded).format('YYYY-MM-DD');
    machineAvailability[bestMachine.id] = dayjs(end);
    machineLastProduct[bestMachine.id] = item.product_code;

    const woNo = `WO-${dayjs().format('YYYY')}-${String(woCounter).padStart(3, '0')}`;
    const woId = uuidv4();

    insertWO.run(woId, woNo, item.id, item.item_id,
      item.product_id || null, item.product_name, item.product_code, item.qty,
      bestMachine.id, bestMachine.name, 'scheduled', start, end);

    updateOrder.run(item.id);
    woCounter++;
    results.push({ woNo, productName: item.product_name, machine: bestMachine.name, start, end });
  }

  return results;
}

module.exports = { autoSchedule, analyzeBottleneck, capacityWarnings, insertUrgentOrder };
