const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('./db');
const { autoSchedule, analyzeBottleneck, capacityWarnings, insertUrgentOrder } = require('./scheduler');
const { authMiddleware, seedAdminUser } = require('./auth');
const usersRouter = require('./routes/users');
const { router: anomaliesRouter } = require('./routes/anomalies');
const handoversRouter = require('./routes/handovers');
const quotesRouter = require('./routes/quotes');
const finishedGoodsRouter = require('./routes/finished-goods');
const costRouter = require('./routes/cost');
const morningReportRouter = require('./routes/morning-report');
const purchaseRouter = require('./routes/purchase');
const maintenanceRouter = require('./routes/maintenance');
const lotsRouter = require('./routes/lots');
const spcRouter = require('./routes/spc');
const payrollRouter = require('./routes/payroll');
const moldsRouter = require('./routes/molds');
const outsourceRouter = require('./routes/outsource');
const complaintsRouter = require('./routes/complaints');
const suppliersRouter = require('./routes/suppliers');
const sopRouter = require('./routes/sop');
const capacityRouter = require('./routes/capacity');
const skillsRouter = require('./routes/skills');
const workersRouter = require('./routes/workers');
const laborPayrollRouter = require('./routes/labor-payroll');
const laborFinanceRouter = require('./routes/labor-finance');
const laborDashboardRouter = require('./routes/labor-dashboard');
const faiRouter = require('./routes/fai');
const ncrRouter = require('./routes/ncr');
const invoicesRouter = require('./routes/invoices');
const profitRouter = require('./routes/profit');
const performanceRouter = require('./routes/performance');
const { sendLineNotify } = require('./lineNotify');

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' })); // 12mb 以支援完工照片/簽名 base64 上傳

seedAdminUser();

app.use('/api/users', usersRouter);
app.use('/api/anomalies', anomaliesRouter);
app.use('/api/handovers', handoversRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/finished-goods', finishedGoodsRouter);
app.use('/api/cost', costRouter);
app.use('/api/morning-report', morningReportRouter);
app.use('/api/purchase', purchaseRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/sop', sopRouter);
app.use('/api/capacity', capacityRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/workers', workersRouter);
app.use('/api/labor-payroll', laborPayrollRouter);
app.use('/api/labor-finance', laborFinanceRouter);
app.use('/api/labor-dashboard', laborDashboardRouter);
app.use('/api/fai', faiRouter);
app.use('/api/ncr', ncrRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/profit', profitRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/lots', lotsRouter);
app.use('/api/spc', spcRouter);
app.use('/api/payroll', payrollRouter);
app.use('/api/molds', moldsRouter);
app.use('/api/outsource', outsourceRouter);
app.use('/api/complaints', complaintsRouter);
app.use('/api/suppliers', suppliersRouter);

// ─── Dashboard ───────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  const orderStats = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN status='in_production' THEN 1 ELSE 0 END) as in_production,
      SUM(CASE WHEN status='shipped' THEN 1 ELSE 0 END) as shipped
    FROM orders
  `).get();

  const woStats = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
    FROM work_orders
  `).get();

  const overdueOrders = db.prepare(`
    SELECT COUNT(*) as cnt FROM orders
    WHERE due_date < date('now') AND status NOT IN ('shipped','cancelled')
  `).get();

  const recentProgress = db.prepare(`
    SELECT pl.*, wo.wo_no, wo.product_name
    FROM progress_logs pl
    JOIN work_orders wo ON wo.id = pl.work_order_id
    ORDER BY pl.logged_at DESC LIMIT 5
  `).all();

  const upcomingDue = db.prepare(`
    SELECT * FROM orders
    WHERE status NOT IN ('shipped','cancelled')
    ORDER BY due_date ASC LIMIT 5
  `).all();

  const machineUtilization = db.prepare(`
    SELECT m.name, m.code, m.id,
      COUNT(wo.id) as active_jobs,
      SUM(CASE WHEN wo.status='in_progress' THEN wo.planned_qty - wo.completed_qty ELSE 0 END) as remaining_qty
    FROM machines m
    LEFT JOIN work_orders wo ON wo.machine_id = m.id AND wo.status NOT IN ('completed','cancelled')
    WHERE m.status='active'
    GROUP BY m.id
  `).all();

  // 本月良率
  const yieldRate = db.prepare(`
    SELECT
      SUM(completed_qty) as total_ok,
      SUM(defect_qty) as total_defect,
      COUNT(*) as wo_count
    FROM work_orders
    WHERE created_at >= date('now','start of month')
  `).get();

  const bottlenecks = analyzeBottleneck();
  const warnings = capacityWarnings(14);

  res.json({ orderStats, woStats, overdueOrders, recentProgress, upcomingDue, machineUtilization, yieldRate, bottlenecks: bottlenecks.slice(0, 3), warnings });
});

// ─── Customers ────────────────────────────────────────────────
app.get('/api/customers', (req, res) => {
  res.json(db.prepare('SELECT * FROM customers ORDER BY name').all());
});

app.post('/api/customers', (req, res) => {
  const { name, contact, phone } = req.body;
  const id = uuidv4();
  const token = uuidv4().replace(/-/g, '').slice(0, 12);
  db.prepare('INSERT INTO customers (id,name,contact,phone,query_token) VALUES (?,?,?,?,?)').run(id, name, contact, phone, token);
  res.json({ id, name, contact, phone, query_token: token });
});

// ─── Products ─────────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY code').all());
});

app.post('/api/products', (req, res) => {
  const { code, name, unit, std_hours } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO products (id,code,name,unit,std_hours) VALUES (?,?,?,?,?)').run(id, code, name, unit || '個', std_hours || 1);
  res.json({ id, code, name, unit, std_hours });
});

// ─── Machines ─────────────────────────────────────────────────
app.get('/api/machines', (req, res) => {
  res.json(db.prepare(`SELECT * FROM machines WHERE status='active' ORDER BY code`).all());
});

// ─── Orders ───────────────────────────────────────────────────
app.get('/api/orders', (req, res) => {
  const { status, search } = req.query;
  let query = `SELECT o.*, COUNT(oi.id) as item_count FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id`;
  const params = [];
  const conditions = [];
  if (status && status !== 'all') { conditions.push(`o.status = ?`); params.push(status); }
  if (search) { conditions.push(`(o.order_no LIKE ? OR o.customer_name LIKE ?)`); params.push(`%${search}%`, `%${search}%`); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' GROUP BY o.id ORDER BY o.priority ASC, o.due_date ASC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  const workOrders = db.prepare('SELECT * FROM work_orders WHERE order_id = ? ORDER BY planned_start').all(req.params.id);
  res.json({ ...order, items, workOrders });
});

app.post('/api/orders', (req, res) => {
  const { customer_id, customer_name, due_date, priority, note, items } = req.body;
  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE order_no LIKE ?').get(`ORD-${year}-%`).cnt + 1;
  const order_no = `ORD-${year}-${String(seq).padStart(3, '0')}`;

  db.prepare(`INSERT INTO orders (id,order_no,customer_id,customer_name,priority,due_date,note) VALUES (?,?,?,?,?,?,?)`)
    .run(id, order_no, customer_id || null, customer_name, priority || 2, due_date, note || '');

  const insertItem = db.prepare(`INSERT INTO order_items (id,order_id,product_id,product_name,product_code,qty,unit) VALUES (?,?,?,?,?,?,?)`);
  (items || []).forEach(item => {
    insertItem.run(uuidv4(), id, item.product_id || null, item.product_name, item.product_code || '', item.qty, item.unit || '個');
  });

  res.json({ id, order_no });
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/orders/:id', (req, res) => {
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Schedule / Auto-plan ──────────────────────────────────────
app.post('/api/schedule/auto', (req, res) => {
  const { order_ids } = req.body;
  const results = autoSchedule(order_ids);
  res.json({ scheduled: results.length, results });
});

app.post('/api/schedule/urgent', (req, res) => {
  const { order_id } = req.body;
  const result = insertUrgentOrder(order_id);
  res.json(result);
});

app.get('/api/schedule/bottleneck', (req, res) => {
  res.json(analyzeBottleneck());
});

app.get('/api/schedule/capacity-warnings', (req, res) => {
  const days = parseInt(req.query.days) || 14;
  res.json(capacityWarnings(days));
});

app.get('/api/schedule/gantt', (req, res) => {
  const { start, end } = req.query;
  const s = start || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const e = end || dayjs().add(30, 'day').format('YYYY-MM-DD');

  const workOrders = db.prepare(`
    SELECT wo.*, o.order_no, o.customer_name, o.priority
    FROM work_orders wo
    LEFT JOIN orders o ON o.id = wo.order_id
    WHERE wo.planned_start <= ? AND wo.planned_end >= ?
      AND wo.status NOT IN ('cancelled')
    ORDER BY wo.machine_name, wo.planned_start
  `).all(e, s);

  const machines = db.prepare(`SELECT * FROM machines WHERE status='active' ORDER BY code`).all();
  res.json({ machines, workOrders });
});

// ─── Changeover Matrix ────────────────────────────────────────
app.get('/api/changeover', (req, res) => {
  const rows = db.prepare(`
    SELECT cm.*, p1.name as from_name, p1.code as from_code, p2.name as to_name, p2.code as to_code, m.name as machine_name
    FROM changeover_matrix cm
    JOIN products p1 ON p1.id = cm.from_product_id
    JOIN products p2 ON p2.id = cm.to_product_id
    JOIN machines m ON m.id = cm.machine_id
  `).all();
  res.json(rows);
});

app.post('/api/changeover', (req, res) => {
  const { from_product_id, to_product_id, machine_id, changeover_min } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT OR REPLACE INTO changeover_matrix (id,from_product_id,to_product_id,machine_id,changeover_min) VALUES (?,?,?,?,?)`)
    .run(id, from_product_id, to_product_id, machine_id, changeover_min);
  res.json({ ok: true });
});

// ─── Work Orders ──────────────────────────────────────────────
app.get('/api/work-orders', (req, res) => {
  const { status, search } = req.query;
  let query = `SELECT wo.*, o.order_no, o.customer_name, o.due_date as order_due_date
    FROM work_orders wo LEFT JOIN orders o ON o.id = wo.order_id`;
  const params = [];
  const conditions = [];
  if (status && status !== 'all') { conditions.push(`wo.status = ?`); params.push(status); }
  if (search) { conditions.push(`(wo.wo_no LIKE ? OR wo.product_name LIKE ? OR wo.machine_name LIKE ?)`); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY wo.planned_start ASC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/work-orders/:id', (req, res) => {
  const wo = db.prepare(`
    SELECT wo.*, o.order_no, o.customer_name, o.due_date as order_due_date
    FROM work_orders wo LEFT JOIN orders o ON o.id = wo.order_id
    WHERE wo.id = ?
  `).get(req.params.id);
  if (!wo) return res.status(404).json({ error: 'Not found' });
  const logs = db.prepare('SELECT * FROM progress_logs WHERE work_order_id = ? ORDER BY logged_at DESC').all(req.params.id);
  const yield_rate = wo.completed_qty + wo.defect_qty > 0
    ? Math.round((wo.completed_qty / (wo.completed_qty + wo.defect_qty)) * 100)
    : null;
  res.json({ ...wo, logs, yield_rate });
});

app.patch('/api/work-orders/:id', (req, res) => {
  const { status, operator, machine_id, planned_start, planned_end, note } = req.body;
  const wo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
  if (!wo) return res.status(404).json({ error: 'Not found' });

  const machine = machine_id ? db.prepare('SELECT * FROM machines WHERE id = ?').get(machine_id) : null;

  const updates = {
    status: status || wo.status,
    operator: operator !== undefined ? operator : wo.operator,
    machine_id: machine_id || wo.machine_id,
    machine_name: machine ? machine.name : wo.machine_name,
    planned_start: planned_start || wo.planned_start,
    planned_end: planned_end || wo.planned_end,
    note: note !== undefined ? note : wo.note,
    actual_start: status === 'in_progress' && !wo.actual_start ? dayjs().format('YYYY-MM-DD HH:mm:ss') : wo.actual_start,
    actual_end: status === 'completed' ? dayjs().format('YYYY-MM-DD HH:mm:ss') : wo.actual_end,
  };

  db.prepare(`UPDATE work_orders SET status=?,operator=?,machine_id=?,machine_name=?,planned_start=?,planned_end=?,note=?,actual_start=?,actual_end=? WHERE id=?`)
    .run(updates.status, updates.operator, updates.machine_id, updates.machine_name, updates.planned_start, updates.planned_end, updates.note, updates.actual_start, updates.actual_end, req.params.id);

  if (status === 'in_progress') {
    db.prepare(`UPDATE orders SET status='in_production' WHERE id=?`).run(wo.order_id);
  }

  res.json({ ok: true });
});

// ─── Progress Logs（含不良品）────────────────────────────────
app.post('/api/work-orders/:id/progress', (req, res) => {
  const { qty, defect_qty = 0, operator, note } = req.body;
  const wo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
  if (!wo) return res.status(404).json({ error: 'Not found' });

  const logId = uuidv4();
  db.prepare('INSERT INTO progress_logs (id,work_order_id,qty,defect_qty,operator,note) VALUES (?,?,?,?,?,?)').run(logId, req.params.id, qty, defect_qty, operator || '', note || '');

  const newCompleted = wo.completed_qty + qty;
  const newDefect = (wo.defect_qty || 0) + defect_qty;
  const newStatus = newCompleted >= wo.planned_qty ? 'completed' : 'in_progress';
  const actual_start = wo.actual_start || dayjs().format('YYYY-MM-DD HH:mm:ss');
  const actual_end = newStatus === 'completed' ? dayjs().format('YYYY-MM-DD HH:mm:ss') : wo.actual_end;

  db.prepare('UPDATE work_orders SET completed_qty=?,defect_qty=?,status=?,actual_start=?,actual_end=? WHERE id=?')
    .run(newCompleted, newDefect, newStatus, actual_start, actual_end, req.params.id);

  if (wo.order_id) {
    if (newStatus === 'completed') {
      // 檢查此訂單所有工單是否全部完工
      const allDone = db.prepare(`
        SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
        FROM work_orders WHERE order_id=?
      `).get(wo.order_id);
      if (allDone.total > 0 && allDone.total === allDone.done) {
        db.prepare(`UPDATE orders SET status='completed' WHERE id=? AND status NOT IN ('shipped','cancelled')`).run(wo.order_id);
      } else {
        db.prepare(`UPDATE orders SET status='in_production' WHERE id=? AND status NOT IN ('shipped','cancelled')`).run(wo.order_id);
      }
    } else {
      db.prepare(`UPDATE orders SET status='in_production' WHERE id=? AND status NOT IN ('shipped','cancelled','completed')`).run(wo.order_id);
    }
  }

  // 良率預警檢查（非同步不阻塞回應）
  if (wo.product_id && newStatus === 'completed') {
    setImmediate(() => { try { checkYieldAlerts(wo.product_id); } catch(_) {} });
  }

  res.json({ ok: true, completed_qty: newCompleted, defect_qty: newDefect, status: newStatus });
});

// ─── OEE 設備稼動率 ────────────────────────────────────────────
app.get('/api/oee', (req, res) => {
  const { machine_id, month } = req.query;
  const m = month || dayjs().format('YYYY-MM');
  const startOf = `${m}-01`;
  const endOf = dayjs(startOf).endOf('month').format('YYYY-MM-DD');

  const machines = machine_id
    ? [db.prepare('SELECT * FROM machines WHERE id=?').get(machine_id)]
    : db.prepare(`SELECT * FROM machines WHERE status='active' ORDER BY code`).all();

  const result = machines.filter(Boolean).map(machine => {
    const events = db.prepare(`
      SELECT * FROM machine_events
      WHERE machine_id=? AND started_at >= ? AND started_at <= ?
      ORDER BY started_at
    `).all(machine.id, startOf, endOf + ' 23:59:59');

    // 該月有效工作天（依系統設定工時）
    const daysInMonth = dayjs(startOf).daysInMonth();
    const hoursPerDay = parseFloat(db.prepare(`SELECT value FROM system_settings WHERE key='work_hours_per_day'`).get()?.value || '8');
    const totalMinutes = daysInMonth * hoursPerDay * 60;
    const runningMin = events.filter(e => e.event_type === 'running').reduce((s, e) => s + (e.duration_min || 0), 0);
    const downtimeMin = events.filter(e => e.event_type === 'downtime').reduce((s, e) => s + (e.duration_min || 0), 0);
    const maintMin = events.filter(e => e.event_type === 'maintenance').reduce((s, e) => s + (e.duration_min || 0), 0);

    // 本月完工工單（含標準工時）
    const wos = db.prepare(`
      SELECT SUM(wo.completed_qty) as ok, SUM(wo.defect_qty) as defect,
             SUM((wo.completed_qty + COALESCE(wo.defect_qty,0)) * COALESCE(p.std_hours,1) * 60) as std_minutes
      FROM work_orders wo
      LEFT JOIN products p ON p.id = wo.product_id
      WHERE wo.machine_id=? AND wo.actual_end >= ? AND wo.actual_end <= ? AND wo.status='completed'
    `).get(machine.id, startOf, endOf + ' 23:59:59');

    const availability = totalMinutes > 0 ? (runningMin / totalMinutes) * 100 : 0;
    const totalOutput = (wos.ok || 0) + (wos.defect || 0);
    const quality = totalOutput > 0 ? ((wos.ok || 0) / totalOutput) * 100 : 100;
    // 速度稼動率 = 標準工時總和 / 實際運轉時間
    const stdMin = wos.std_minutes || 0;
    const performance = runningMin > 0 ? Math.min((stdMin / runningMin) * 100, 100) : (totalOutput > 0 ? 85 : 0);
    const oee = (availability * performance * quality) / 10000;

    return {
      machine_id: machine.id,
      machine_name: machine.name,
      machine_code: machine.code,
      month: m,
      running_min: runningMin,
      downtime_min: downtimeMin,
      maintenance_min: maintMin,
      availability: Math.round(availability * 10) / 10,
      performance: Math.round(performance * 10) / 10,
      quality: Math.round(quality * 10) / 10,
      oee: Math.round(oee * 10) / 10,
      ok_qty: wos.ok || 0,
      defect_qty: wos.defect || 0,
      events,
    };
  });

  res.json(result);
});

app.post('/api/oee/event', (req, res) => {
  const { machine_id, event_type, reason, started_at, ended_at, operator } = req.body;
  const id = uuidv4();
  const duration_min = ended_at
    ? Math.round(dayjs(ended_at).diff(dayjs(started_at), 'minute'))
    : null;

  db.prepare(`INSERT INTO machine_events (id,machine_id,event_type,reason,started_at,ended_at,duration_min,operator) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, machine_id, event_type, reason || '', started_at, ended_at || null, duration_min, operator || '');

  res.json({ ok: true, id });
});

// ─── 操作員績效 ────────────────────────────────────────────────
app.get('/api/analytics/operators', (req, res) => {
  const { month } = req.query;
  const m = month || dayjs().format('YYYY-MM');

  const operators = db.prepare(`
    SELECT
      pl.operator,
      COUNT(DISTINCT pl.work_order_id) as wo_count,
      SUM(pl.qty) as total_ok,
      SUM(pl.defect_qty) as total_defect,
      COUNT(*) as log_count,
      MIN(pl.logged_at) as first_log,
      MAX(pl.logged_at) as last_log
    FROM progress_logs pl
    WHERE pl.logged_at >= ? AND pl.operator != ''
    GROUP BY pl.operator
    ORDER BY total_ok DESC
  `).all(`${m}-01`);

  const result = operators.map(op => ({
    ...op,
    yield_rate: op.total_ok + op.total_defect > 0
      ? Math.round((op.total_ok / (op.total_ok + op.total_defect)) * 100)
      : 100,
    avg_per_log: op.log_count > 0 ? Math.round(op.total_ok / op.log_count) : 0,
  }));

  res.json(result);
});

// ─── 報表 / 分析 ──────────────────────────────────────────────
app.get('/api/analytics/summary', (req, res) => {
  const { year } = req.query;
  const y = year || dayjs().format('YYYY');

  // 月產量（依完工工單）
  const monthlyOutput = db.prepare(`
    SELECT strftime('%m', actual_end) as month,
      SUM(completed_qty) as ok_qty,
      SUM(defect_qty) as defect_qty,
      COUNT(*) as wo_count
    FROM work_orders
    WHERE strftime('%Y', actual_end) = ? AND status='completed'
    GROUP BY month ORDER BY month
  `).all(y);

  // 客戶別出貨量
  const customerStats = db.prepare(`
    SELECT customer_name,
      COUNT(*) as order_count,
      SUM(CASE WHEN status='shipped' THEN 1 ELSE 0 END) as shipped_count
    FROM orders
    WHERE strftime('%Y', created_at) = ?
    GROUP BY customer_name ORDER BY order_count DESC LIMIT 10
  `).all(y);

  // 產品別生產量
  const productStats = db.prepare(`
    SELECT product_name, product_code,
      SUM(completed_qty) as total_qty,
      SUM(defect_qty) as defect_qty,
      COUNT(*) as wo_count
    FROM work_orders
    WHERE strftime('%Y', created_at) = ? AND status='completed'
    GROUP BY product_code ORDER BY total_qty DESC LIMIT 10
  `).all(y);

  // 良率趨勢（月）
  const yieldTrend = db.prepare(`
    SELECT strftime('%m', actual_end) as month,
      ROUND(SUM(completed_qty)*100.0/(SUM(completed_qty)+SUM(defect_qty)+0.001),1) as yield_pct
    FROM work_orders
    WHERE strftime('%Y', actual_end) = ? AND status='completed'
    GROUP BY month ORDER BY month
  `).all(y);

  // 交期達成率
  const onTimeRate = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN s.shipped_at <= o.due_date OR o.status != 'shipped' THEN 0 ELSE 1 END) as late_count
    FROM orders o
    LEFT JOIN shipments s ON s.order_id = o.id
    WHERE strftime('%Y', o.created_at) = ?
  `).get(y);

  res.json({ monthlyOutput, customerStats, productStats, yieldTrend, onTimeRate });
});

// CSV 匯出
app.get('/api/analytics/export/orders', (req, res) => {
  const { year } = req.query;
  const y = year || dayjs().format('YYYY');
  const orders = db.prepare(`
    SELECT o.order_no, o.customer_name, o.status, o.priority, o.due_date, o.created_at,
           GROUP_CONCAT(oi.product_name || ' x' || oi.qty) as items
    FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
    WHERE strftime('%Y', o.created_at) = ?
    GROUP BY o.id ORDER BY o.created_at DESC
  `).all(y);

  const headers = '訂單編號,客戶,狀態,優先度,交期,建立日期,品項\n';
  const statusMap = { pending:'待排產', scheduled:'已排產', in_production:'生產中', shipped:'已出貨', cancelled:'已取消' };
  const priorityMap = { 1:'急件', 2:'一般', 3:'低優先' };
  const rows = orders.map(o =>
    `${o.order_no},${o.customer_name},${statusMap[o.status]||o.status},${priorityMap[o.priority]||o.priority},${o.due_date},${o.created_at?.slice(0,10)},"${o.items||''}"`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=orders-${y}.csv`);
  res.send('﻿' + headers + rows); // BOM for Excel UTF-8
});

app.get('/api/analytics/export/work-orders', (req, res) => {
  const { year } = req.query;
  const y = year || dayjs().format('YYYY');
  const wos = db.prepare(`
    SELECT wo.wo_no, wo.product_name, wo.product_code, wo.planned_qty, wo.completed_qty, wo.defect_qty,
           wo.machine_name, wo.operator, wo.status, wo.planned_start, wo.planned_end, wo.actual_start, wo.actual_end,
           o.order_no, o.customer_name
    FROM work_orders wo LEFT JOIN orders o ON o.id=wo.order_id
    WHERE strftime('%Y', wo.created_at) = ?
    ORDER BY wo.created_at DESC
  `).all(y);

  const headers = '工單編號,訂單編號,客戶,產品,料號,計畫數,完成數,不良數,良率%,機台,操作員,狀態,計畫開始,計畫結束,實際開始,實際結束\n';
  const rows = wos.map(w => {
    const total = (w.completed_qty || 0) + (w.defect_qty || 0);
    const yr = total > 0 ? Math.round((w.completed_qty / total) * 100) : 100;
    return `${w.wo_no},${w.order_no||''},${w.customer_name||''},${w.product_name},${w.product_code||''},${w.planned_qty},${w.completed_qty||0},${w.defect_qty||0},${yr}%,${w.machine_name||''},${w.operator||''},${w.status},${w.planned_start||''},${w.planned_end||''},${w.actual_start||''},${w.actual_end||''}`;
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=work-orders-${y}.csv`);
  res.send('﻿' + headers + rows);
});

// ─── MRP 物料需求計算 ──────────────────────────────────────────
app.get('/api/materials', (req, res) => {
  res.json(db.prepare('SELECT * FROM materials ORDER BY code').all());
});

app.post('/api/materials', (req, res) => {
  const { code, name, unit, stock_qty, safety_stock, unit_cost } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO materials (id,code,name,unit,stock_qty,safety_stock,unit_cost) VALUES (?,?,?,?,?,?,?)').run(id, code, name, unit || '個', stock_qty || 0, safety_stock || 0, unit_cost || 0);
  res.json({ id });
});

app.patch('/api/materials/:id/stock', (req, res) => {
  const { delta, reason } = req.body;
  const mat = db.prepare('SELECT * FROM materials WHERE id=?').get(req.params.id);
  if (!mat) return res.status(404).json({ error: 'Not found' });
  const newStock = (mat.stock_qty || 0) + delta;
  db.prepare('UPDATE materials SET stock_qty=? WHERE id=?').run(newStock, req.params.id);
  db.prepare('INSERT INTO stock_logs (id,material_id,delta,reason) VALUES (?,?,?,?)').run(uuidv4(), req.params.id, delta, reason || '');
  res.json({ ok: true, stock_qty: newStock });
});

app.get('/api/bom', (req, res) => {
  const { product_id } = req.query;
  let q = `SELECT b.*, m.name as material_name, m.code as material_code, m.unit, m.stock_qty, m.safety_stock
            FROM bom b JOIN materials m ON m.id=b.material_id`;
  if (product_id) q += ' WHERE b.product_id=?';
  res.json(product_id ? db.prepare(q).all(product_id) : db.prepare(q).all());
});

app.post('/api/bom', (req, res) => {
  const { product_id, material_id, qty_per_unit } = req.body;
  const id = uuidv4();
  db.prepare('INSERT OR REPLACE INTO bom (id,product_id,material_id,qty_per_unit) VALUES (?,?,?,?)').run(id, product_id, material_id, qty_per_unit);
  res.json({ ok: true });
});

// MRP 計算：針對待排產 / 已排產訂單計算物料缺口
app.get('/api/mrp/calculate', (req, res) => {
  const pendingItems = db.prepare(`
    SELECT oi.product_id, oi.product_name, oi.product_code, SUM(oi.qty) as total_qty
    FROM order_items oi
    JOIN orders o ON o.id=oi.order_id
    WHERE o.status IN ('pending','scheduled','in_production')
    GROUP BY oi.product_id
  `).all();

  const shortages = [];

  for (const item of pendingItems) {
    if (!item.product_id) continue;
    const boms = db.prepare(`
      SELECT b.*, m.name as mat_name, m.code as mat_code, m.unit, m.stock_qty, m.safety_stock
      FROM bom b JOIN materials m ON m.id=b.material_id
      WHERE b.product_id=?
    `).all(item.product_id);

    for (const bom of boms) {
      const required = bom.qty_per_unit * item.total_qty;
      const available = bom.stock_qty || 0;
      const shortage = required - available;

      shortages.push({
        product_name: item.product_name,
        product_code: item.product_code,
        material_name: bom.mat_name,
        material_code: bom.mat_code,
        material_id: bom.material_id,
        unit: bom.unit,
        required_qty: Math.round(required * 100) / 100,
        stock_qty: available,
        safety_stock: bom.safety_stock || 0,
        shortage: Math.round(Math.max(0, shortage) * 100) / 100,
        status: shortage > 0 ? 'shortage' : available < (bom.safety_stock || 0) ? 'low' : 'ok',
      });
    }
  }

  shortages.sort((a, b) => b.shortage - a.shortage);
  res.json(shortages);
});

// ─── 客戶自助入口 ──────────────────────────────────────────────
app.get('/api/public/orders/:token', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE query_token=?').get(req.params.token);
  if (!customer) return res.status(404).json({ error: '查詢代碼無效' });

  const orders = db.prepare(`
    SELECT o.*, COUNT(oi.id) as item_count
    FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
    WHERE o.customer_id=?
    GROUP BY o.id ORDER BY o.created_at DESC LIMIT 20
  `).all(customer.id);

  const ordersWithProgress = orders.map(order => {
    const wos = db.prepare(`
      SELECT wo_no, product_name, planned_qty, completed_qty, status, planned_end
      FROM work_orders WHERE order_id=?
    `).all(order.id);
    const totalPct = wos.length > 0
      ? Math.round(wos.reduce((s, w) => s + (w.completed_qty / w.planned_qty * 100), 0) / wos.length)
      : 0;
    return { ...order, workOrders: wos, progress_pct: totalPct };
  });

  res.json({
    customer: { name: customer.name, contact: customer.contact },
    orders: ordersWithProgress,
  });
});

// LINE 通知測試
app.post('/api/line-notify/test', (req, res) => {
  sendLineNotify('FactoryOS LINE 通知測試成功！');
  res.json({ ok: true, message: '測試訊息已發送' });
});

// SOP 公開端點（QR 掃碼後無需登入可查詢）
app.get('/api/public/sop/:product_id', (req, res) => {
  const doc = db.prepare(`SELECT * FROM sop_documents WHERE product_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1`).get(req.params.product_id);
  if (!doc) return res.status(404).json({ error: '此產品尚無作業標準書' });
  const steps = db.prepare('SELECT * FROM sop_steps WHERE sop_id=? ORDER BY step_no').all(doc.id);
  res.json({ ...doc, steps });
});

// B2B 客戶下單
app.post('/api/public/orders/:token', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE query_token=?').get(req.params.token);
  if (!customer) return res.status(404).json({ error: '查詢代碼無效' });

  const { due_date, note, items } = req.body;
  if (!due_date || !items?.length) return res.status(400).json({ error: '交期與品項為必填' });

  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE order_no LIKE ?').get(`ORD-${year}-%`).cnt + 1;
  const order_no = `ORD-${year}-${String(seq).padStart(3, '0')}`;

  db.prepare('INSERT INTO orders (id,order_no,customer_id,customer_name,priority,due_date,note) VALUES (?,?,?,?,2,?,?)')
    .run(id, order_no, customer.id, customer.name, due_date, note || 'B2B 客戶線上下單');

  const insertItem = db.prepare('INSERT INTO order_items (id,order_id,product_id,product_name,product_code,qty,unit) VALUES (?,?,?,?,?,?,?)');
  items.forEach(item => {
    const p = item.product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(item.product_id) : null;
    insertItem.run(uuidv4(), id, item.product_id || null, p?.name || item.product_name || '', p?.code || '', item.qty, p?.unit || '個');
  });

  res.json({ ok: true, order_no });
});

// B2B 客戶可訂購的產品列表
app.get('/api/public/products', (req, res) => {
  const products = db.prepare('SELECT id, code, name, unit FROM products ORDER BY code').all();
  res.json(products);
});

// ─── QR Code 掃碼報工頁（公開端點）────────────────────────────
app.get('/api/wo/:id/qr-data', (req, res) => {
  const wo = db.prepare(`
    SELECT wo.*, o.order_no, o.customer_name
    FROM work_orders wo LEFT JOIN orders o ON o.id=wo.order_id
    WHERE wo.id=?
  `).get(req.params.id);
  if (!wo) return res.status(404).json({ error: 'Not found' });
  res.json(wo);
});

// 掃碼後快速報工
app.post('/api/wo/:id/quick-progress', (req, res) => {
  const { qty, defect_qty = 0, operator } = req.body;
  const wo = db.prepare('SELECT * FROM work_orders WHERE id=?').get(req.params.id);
  if (!wo) return res.status(404).json({ error: 'Not found' });

  const logId = uuidv4();
  db.prepare('INSERT INTO progress_logs (id,work_order_id,qty,defect_qty,operator,note) VALUES (?,?,?,?,?,?)').run(logId, req.params.id, qty, defect_qty, operator || '掃碼報工', '手機掃碼');

  const newCompleted = (wo.completed_qty || 0) + qty;
  const newDefect = (wo.defect_qty || 0) + defect_qty;
  const newStatus = newCompleted >= wo.planned_qty ? 'completed' : 'in_progress';
  const actual_start = wo.actual_start || dayjs().format('YYYY-MM-DD HH:mm:ss');
  const actual_end = newStatus === 'completed' ? dayjs().format('YYYY-MM-DD HH:mm:ss') : wo.actual_end;

  db.prepare('UPDATE work_orders SET completed_qty=?,defect_qty=?,status=?,actual_start=?,actual_end=? WHERE id=?')
    .run(newCompleted, newDefect, newStatus, actual_start, actual_end, req.params.id);

  if (wo.order_id) {
    if (newStatus === 'completed') {
      const allDone = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done FROM work_orders WHERE order_id=?`).get(wo.order_id);
      if (allDone.total > 0 && allDone.total === allDone.done) {
        db.prepare(`UPDATE orders SET status='completed' WHERE id=? AND status NOT IN ('shipped','cancelled')`).run(wo.order_id);
      } else {
        db.prepare(`UPDATE orders SET status='in_production' WHERE id=? AND status NOT IN ('shipped','cancelled')`).run(wo.order_id);
      }
    } else {
      db.prepare(`UPDATE orders SET status='in_production' WHERE id=? AND status NOT IN ('shipped','cancelled','completed')`).run(wo.order_id);
    }
  }

  res.json({ ok: true, completed_qty: newCompleted, planned_qty: wo.planned_qty, status: newStatus });
});

// ─── Shipments ────────────────────────────────────────────────
app.get('/api/shipments', (req, res) => {
  const { status } = req.query;
  let q = `SELECT s.*, o.order_no FROM shipments s LEFT JOIN orders o ON o.id=s.order_id`;
  if (status && status !== 'all') q += ` WHERE s.status=?`;
  q += ' ORDER BY s.created_at DESC';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows);
});

app.post('/api/shipments', (req, res) => {
  const { order_id, customer_name, carrier, tracking_no, note, items } = req.body;
  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) as cnt FROM shipments WHERE shipment_no LIKE ?').get(`SHP-${year}-%`).cnt + 1;
  const shipment_no = `SHP-${year}-${String(seq).padStart(3, '0')}`;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`INSERT INTO shipments (id,shipment_no,order_id,customer_name,shipped_at,carrier,tracking_no,status,note)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, shipment_no, order_id || null, customer_name, now, carrier || '', tracking_no || '', 'pending', note || '');

  // 出貨明細
  const insertShipItem = db.prepare('INSERT INTO shipment_items (id,shipment_id,product_name,product_code,qty) VALUES (?,?,?,?,?)');
  (items || []).forEach(item => insertShipItem.run(uuidv4(), id, item.product_name, item.product_code || '', item.qty));

  // 自動扣減成品庫存
  (items || []).forEach(item => {
    let remaining = item.qty;
    const fgs = db.prepare(`
      SELECT * FROM finished_goods
      WHERE product_code=? AND status='in_stock'
      ORDER BY created_at ASC
    `).all(item.product_code || '');
    for (const fg of fgs) {
      if (remaining <= 0) break;
      const deduct = Math.min(fg.qty, remaining);
      const newQty = fg.qty - deduct;
      if (newQty <= 0) {
        db.prepare('UPDATE finished_goods SET qty=0, status=? WHERE id=?').run('shipped', fg.id);
      } else {
        db.prepare('UPDATE finished_goods SET qty=? WHERE id=?').run(newQty, fg.id);
      }
      db.prepare('INSERT INTO fg_logs (id,fg_id,action,qty,note,operator) VALUES (?,?,?,?,?,?)').run(uuidv4(), fg.id, 'ship', deduct, `出貨單 ${shipment_no}`, '系統');
      remaining -= deduct;
    }
  });

  if (order_id) db.prepare(`UPDATE orders SET status='shipped' WHERE id=?`).run(order_id);
  res.json({ ok: true, id, shipment_no });
});

app.patch('/api/shipments/:id/ship', (req, res) => {
  const { carrier, tracking_no, note } = req.body;
  const s = db.prepare('SELECT * FROM shipments WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`UPDATE shipments SET status='shipped', shipped_at=?, carrier=?, tracking_no=?, note=? WHERE id=?`)
    .run(now, carrier || s.carrier, tracking_no || s.tracking_no, note || s.note, req.params.id);
  if (s.order_id) db.prepare(`UPDATE orders SET status='shipped' WHERE id=?`).run(s.order_id);
  res.json({ ok: true });
});

app.delete('/api/shipments/:id', (req, res) => {
  db.prepare('DELETE FROM shipments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── 系統設定 ─────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value, description FROM system_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = { value: r.value, description: r.description }; });
  res.json(settings);
});

app.patch('/api/settings', (req, res) => {
  const updates = req.body; // { key: value, ... }
  const stmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value, description) SELECT ?, ?, description FROM system_settings WHERE key=?');
  Object.entries(updates).forEach(([key, value]) => {
    db.prepare('UPDATE system_settings SET value=? WHERE key=?').run(String(value), key);
  });
  res.json({ ok: true });
});

// ─── 老闆儀表板 ──────────────────────────────────────────────
app.get('/api/boss-dashboard', (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const thisMonth = dayjs().format('YYYY-MM');
  const thisYear = dayjs().format('YYYY');

  // 本月訂單收入 vs 成本
  const monthOrders = db.prepare(`SELECT id, total_revenue FROM orders WHERE strftime('%Y-%m', created_at)=?`).all(thisMonth);
  const monthRevenue = monthOrders.reduce((s, o) => s + (o.total_revenue || 0), 0);

  // 應收帳款概況
  const arStats = db.prepare(`
    SELECT SUM(amount-paid_amount) as outstanding,
      SUM(CASE WHEN due_date < ? AND status!='paid' THEN amount-paid_amount ELSE 0 END) as overdue
    FROM invoices WHERE status!='paid'
  `).get(today);

  // 今日生產狀況
  const todayProd = db.prepare(`
    SELECT COUNT(DISTINCT work_order_id) as wo_count, SUM(qty) as ok_qty, SUM(defect_qty) as defect_qty
    FROM progress_logs WHERE logged_at >= ? AND logged_at < ?
  `).get(today + ' 00:00:00', today + ' 23:59:59');

  // 本月累計產量
  const monthProd = db.prepare(`
    SELECT SUM(qty) as ok_qty, SUM(defect_qty) as defect_qty
    FROM progress_logs WHERE logged_at >= ?
  `).get(thisMonth + '-01 00:00:00');

  // 工單超時警示（實際工時 > 標準工時 * 1.5）
  const overrunWOs = db.prepare(`
    SELECT wo.wo_no, wo.product_name, wo.operator, wo.machine_name,
      wo.actual_start, wo.actual_end,
      ROUND((julianday(COALESCE(wo.actual_end,datetime('now','localtime')))-julianday(wo.actual_start))*24,1) as actual_hrs,
      COALESCE(p.std_hours,1) * wo.planned_qty as std_hrs
    FROM work_orders wo LEFT JOIN products p ON p.id=wo.product_id
    WHERE wo.actual_start IS NOT NULL AND wo.status='in_progress'
      AND (julianday(datetime('now','localtime'))-julianday(wo.actual_start))*24 > COALESCE(p.std_hours,1) * wo.planned_qty * 1.5
    ORDER BY actual_hrs DESC LIMIT 5
  `).all();

  // 逾期未收款前5大
  const overdueAR = db.prepare(`
    SELECT customer_name, invoice_no, amount-paid_amount as outstanding, due_date,
      CAST(julianday('now')-julianday(due_date) AS INTEGER) as overdue_days
    FROM invoices WHERE status!='paid' AND due_date < ? ORDER BY outstanding DESC LIMIT 5
  `).all(today);

  // 近7天每日產量
  const dailyOutput = [];
  for (let i = 6; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
    const row = db.prepare(`SELECT SUM(qty) as qty, SUM(defect_qty) as defect FROM progress_logs WHERE logged_at >= ? AND logged_at < ?`).get(d + ' 00:00:00', d + ' 23:59:59');
    dailyOutput.push({ date: d, label: dayjs(d).format('MM/DD'), qty: row.qty || 0, defect: row.defect || 0 });
  }

  // 逾期訂單
  const overdueOrders = db.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE due_date < ? AND status NOT IN ('shipped','cancelled')`).get(today);

  // 未解決異常
  const openAnomalies = db.prepare(`SELECT COUNT(*) as cnt, SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high_cnt FROM anomalies WHERE status='open'`).get();

  // 報價本月統計
  const quoteStats = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN result='won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN result='lost' THEN 1 ELSE 0 END) as lost,
      SUM(CASE WHEN result IS NULL OR result='pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN result='won' THEN final_price ELSE 0 END) as won_amount
    FROM quotes WHERE strftime('%Y-%m',created_at)=?
  `).get(thisMonth);

  res.json({
    revenue: { month: monthRevenue, year: 0 },
    ar: { outstanding: arStats.outstanding || 0, overdue: arStats.overdue || 0 },
    production: { today: todayProd, month: monthProd, daily: dailyOutput },
    alerts: { overrun_wos: overrunWOs, overdue_orders: overdueOrders.cnt, open_anomalies: openAnomalies },
    ar_overdue: overdueAR,
    quotes: quoteStats,
  });
});

// ─── 報價勝率 ─────────────────────────────────────────────────
app.patch('/api/quotes/:id/result', (req, res) => {
  const { result, lost_reason } = req.body;
  db.prepare('UPDATE quotes SET result=?, lost_reason=? WHERE id=?').run(result, lost_reason || null, req.params.id);
  res.json({ ok: true });
});

app.get('/api/quotes/stats/winrate', (req, res) => {
  const { year } = req.query;
  const y = year || dayjs().format('YYYY');

  const monthly = db.prepare(`
    SELECT strftime('%m', created_at) as month,
      COUNT(*) as total,
      SUM(CASE WHEN result='won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN result='lost' THEN 1 ELSE 0 END) as lost,
      ROUND(SUM(CASE WHEN result='won' THEN final_price ELSE 0 END),0) as won_amount,
      ROUND(AVG(CASE WHEN result IS NOT NULL AND result!='pending' THEN final_price END),0) as avg_quote
    FROM quotes WHERE strftime('%Y',created_at)=? GROUP BY month ORDER BY month
  `).all(y);

  const byCustomer = db.prepare(`
    SELECT customer_name, COUNT(*) as total,
      SUM(CASE WHEN result='won' THEN 1 ELSE 0 END) as won,
      ROUND(AVG(final_price),0) as avg_price,
      SUM(CASE WHEN result='won' THEN final_price ELSE 0 END) as won_amount
    FROM quotes WHERE strftime('%Y',created_at)=? AND result IS NOT NULL AND result!='pending'
    GROUP BY customer_name ORDER BY total DESC LIMIT 10
  `).all(y);

  const lostReasons = db.prepare(`
    SELECT lost_reason, COUNT(*) as cnt FROM quotes WHERE result='lost' AND lost_reason IS NOT NULL AND strftime('%Y',created_at)=?
    GROUP BY lost_reason ORDER BY cnt DESC
  `).all(y);

  const overall = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN result='won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN result='lost' THEN 1 ELSE 0 END) as lost
    FROM quotes WHERE strftime('%Y',created_at)=?
  `).get(y);

  res.json({ monthly, byCustomer, lostReasons, overall, year: y });
});

// ─── 全域搜尋 ──────────────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ results: [] });
  const like = `%${q}%`;
  const results = [];

  const orders = db.prepare(`SELECT id, order_no, customer_name, status, due_date FROM orders WHERE order_no LIKE ? OR customer_name LIKE ? LIMIT 5`).all(like, like);
  orders.forEach(r => results.push({ type: 'order', id: r.id, title: r.order_no, sub: r.customer_name, status: r.status, meta: r.due_date, path: '/orders' }));

  const wos = db.prepare(`SELECT id, wo_no, product_name, status, machine_name FROM work_orders WHERE wo_no LIKE ? OR product_name LIKE ? OR operator LIKE ? LIMIT 5`).all(like, like, like);
  wos.forEach(r => results.push({ type: 'workorder', id: r.id, title: r.wo_no, sub: r.product_name, status: r.status, meta: r.machine_name, path: '/work-orders' }));

  const customers = db.prepare(`SELECT id, name, contact FROM customers WHERE name LIKE ? OR contact LIKE ? LIMIT 3`).all(like, like);
  customers.forEach(r => results.push({ type: 'customer', id: r.id, title: r.name, sub: r.contact || '', path: '/customers' }));

  const products = db.prepare(`SELECT id, code, name FROM products WHERE code LIKE ? OR name LIKE ? LIMIT 3`).all(like, like);
  products.forEach(r => results.push({ type: 'product', id: r.id, title: r.code, sub: r.name, path: '/mrp' }));

  const lots = db.prepare(`SELECT id, lot_no, material_name, supplier FROM lot_numbers WHERE lot_no LIKE ? OR material_name LIKE ? LIMIT 3`).all(like, like);
  lots.forEach(r => results.push({ type: 'lot', id: r.id, title: r.lot_no, sub: r.material_name + (r.supplier ? ` · ${r.supplier}` : ''), path: '/traceability' }));

  const anomalies = db.prepare(`SELECT id, title, machine_name, status FROM anomalies WHERE title LIKE ? LIMIT 3`).all(like);
  anomalies.forEach(r => results.push({ type: 'anomaly', id: r.id, title: r.title, sub: r.machine_name || '', status: r.status, path: '/anomalies' }));

  res.json({ results, query: q });
});

// 訂單完整詳情（含工單進度、成本、出貨）
app.get('/api/orders/:id/full', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });

  const items = db.prepare(`SELECT * FROM order_items WHERE order_id=?`).all(req.params.id);
  const wos = db.prepare(`
    SELECT wo.*, ROUND(wo.completed_qty*100.0/wo.planned_qty,1) as progress_pct
    FROM work_orders wo WHERE wo.order_id=? ORDER BY wo.planned_start
  `).all(req.params.id);
  const shipments = db.prepare(`SELECT s.shipment_no, s.status, s.shipped_at, s.carrier, s.tracking_no FROM shipments s WHERE s.order_id=?`).all(req.params.id);
  const invoiceInfo = db.prepare(`SELECT invoice_no, amount, paid_amount, status, due_date FROM invoices WHERE order_id=?`).get(req.params.id);
  const profitInfo = { revenue: order.total_revenue || 0 };

  // 計算成本
  const laborRate = parseFloat(db.prepare(`SELECT value FROM system_settings WHERE key='default_labor_rate'`).get()?.value || '300');
  let materialCost = 0, laborCost = 0;
  wos.forEach(wo => {
    if (wo.product_id) {
      const boms = db.prepare(`SELECT b.qty_per_unit, m.unit_cost FROM bom b JOIN materials m ON m.id=b.material_id WHERE b.product_id=?`).all(wo.product_id);
      materialCost += boms.reduce((s, b) => s + b.qty_per_unit * (b.unit_cost || 0), 0) * (wo.completed_qty || 0);
    }
    if (wo.actual_start && wo.actual_end) {
      const hrs = dayjs(wo.actual_end).diff(dayjs(wo.actual_start), 'minute') / 60;
      laborCost += hrs * laborRate;
    }
  });

  profitInfo.material_cost = Math.round(materialCost);
  profitInfo.labor_cost = Math.round(laborCost);
  profitInfo.total_cost = Math.round(materialCost + laborCost);
  profitInfo.gross_profit = Math.round((order.total_revenue || 0) - materialCost - laborCost);

  const totalProgress = wos.length > 0
    ? Math.round(wos.reduce((s, w) => s + (w.progress_pct || 0), 0) / wos.length)
    : 0;

  res.json({ ...order, items, wos, shipments, invoice: invoiceInfo || null, profit: profitInfo, total_progress: totalProgress });
});

// 客戶信用管理
app.patch('/api/customers/:id/credit', (req, res) => {
  const { credit_limit, credit_note } = req.body;
  db.prepare('UPDATE customers SET credit_limit=?, credit_note=? WHERE id=?').run(credit_limit || 0, credit_note || '', req.params.id);
  res.json({ ok: true });
});

app.get('/api/customers/:id/credit-check', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });

  const outstanding = db.prepare(`SELECT COALESCE(SUM(amount-paid_amount),0) as total FROM invoices WHERE customer_id=? AND status!='paid'`).get(req.params.id)?.total || 0;
  const creditLimit = customer.credit_limit || 0;
  const available = creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : null;
  const exceeded = creditLimit > 0 && outstanding > creditLimit;

  res.json({ customer_name: customer.name, credit_limit: creditLimit, outstanding: Math.round(outstanding), available, exceeded });
});

// 工時超時偵測 API
app.get('/api/overrun-wos', (req, res) => {
  const overruns = db.prepare(`
    SELECT wo.id, wo.wo_no, wo.product_name, wo.operator, wo.machine_name, wo.order_id,
      wo.actual_start, wo.planned_qty, wo.completed_qty,
      ROUND((julianday(COALESCE(wo.actual_end,datetime('now','localtime')))-julianday(wo.actual_start))*24,1) as actual_hrs,
      COALESCE(p.std_hours,1) * wo.planned_qty as std_hrs,
      ROUND((julianday(COALESCE(wo.actual_end,datetime('now','localtime')))-julianday(wo.actual_start))*24 / (COALESCE(p.std_hours,1)*wo.planned_qty+0.001)*100 ,0) as overrun_pct
    FROM work_orders wo LEFT JOIN products p ON p.id=wo.product_id
    WHERE wo.actual_start IS NOT NULL AND wo.status IN ('in_progress','completed')
      AND (julianday(COALESCE(wo.actual_end,datetime('now','localtime')))-julianday(wo.actual_start))*24 > COALESCE(p.std_hours,1) * wo.planned_qty * 1.2
    ORDER BY overrun_pct DESC LIMIT 20
  `).all();
  res.json(overruns);
});

// ─── 良率預警規則 ─────────────────────────────────────────────
app.get('/api/yield-alerts/rules', (req, res) => {
  const rules = db.prepare(`SELECT yr.*, p.name as product_name_full FROM yield_alert_rules yr LEFT JOIN products p ON p.id=yr.product_id ORDER BY yr.created_at DESC`).all();
  res.json(rules);
});

app.post('/api/yield-alerts/rules', (req, res) => {
  const { product_id, threshold_pct, consecutive_wos } = req.body;
  const p = product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(product_id) : null;
  const id = require('uuid').v4();
  db.prepare(`INSERT OR REPLACE INTO yield_alert_rules (id,product_id,product_name,product_code,threshold_pct,consecutive_wos,is_active)
    VALUES (?,?,?,?,?,?,1)`)
    .run(id, product_id || null, p?.name || '', p?.code || '', threshold_pct || 95, consecutive_wos || 3);
  res.json({ ok: true, id });
});

app.patch('/api/yield-alerts/rules/:id', (req, res) => {
  const { threshold_pct, consecutive_wos, is_active } = req.body;
  db.prepare('UPDATE yield_alert_rules SET threshold_pct=COALESCE(?,threshold_pct), consecutive_wos=COALESCE(?,consecutive_wos), is_active=COALESCE(?,is_active) WHERE id=?')
    .run(threshold_pct, consecutive_wos, is_active, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/yield-alerts/rules/:id', (req, res) => {
  db.prepare('DELETE FROM yield_alert_rules WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 執行良率預警檢查（進度回報後自動呼叫）
function checkYieldAlerts(productId) {
  const enabled = db.prepare("SELECT value FROM system_settings WHERE key='yield_alert_enabled'").get()?.value === '1';
  if (!enabled) return;

  const rules = db.prepare('SELECT * FROM yield_alert_rules WHERE (product_id=? OR product_id IS NULL) AND is_active=1').all(productId);
  for (const rule of rules) {
    const n = rule.consecutive_wos || 3;
    const recentWOs = db.prepare(`
      SELECT completed_qty, defect_qty FROM work_orders
      WHERE product_id=? AND status='completed' AND completed_qty > 0
      ORDER BY actual_end DESC LIMIT ?
    `).all(rule.product_id || productId, n);

    if (recentWOs.length < n) continue;

    const yields = recentWOs.map(w => {
      const total = (w.completed_qty || 0) + (w.defect_qty || 0);
      return total > 0 ? (w.completed_qty / total) * 100 : 100;
    });

    const allBelowThreshold = yields.every(y => y < rule.threshold_pct);
    if (allBelowThreshold) {
      const avgYield = Math.round(yields.reduce((s, y) => s + y, 0) / yields.length * 10) / 10;
      const product = productId ? db.prepare('SELECT name FROM products WHERE id=?').get(productId) : null;
      const msg = `良率預警\n產品：${rule.product_name || product?.name || productId}\n連續 ${n} 張工單平均良率 ${avgYield}%，低於目標 ${rule.threshold_pct}%`;
      sendLineNotify(msg);
      db.prepare('UPDATE yield_alert_rules SET last_triggered=? WHERE id=?').run(dayjs().format('YYYY-MM-DD HH:mm:ss'), rule.id);
    }
  }
}

// 良率預警歷史（從工單資料計算）
app.get('/api/yield-alerts/history', (req, res) => {
  const { product_id } = req.query;
  const wos = db.prepare(`
    SELECT wo.product_id, wo.product_name, wo.product_code, wo.wo_no, wo.actual_end,
      wo.completed_qty, wo.defect_qty,
      ROUND(wo.completed_qty * 100.0 / (wo.completed_qty + wo.defect_qty + 0.001), 1) as yield_pct
    FROM work_orders wo
    WHERE wo.status='completed' AND wo.completed_qty > 0
      ${product_id ? 'AND wo.product_id=?' : ''}
    ORDER BY wo.actual_end DESC LIMIT 100
  `).all(...(product_id ? [product_id] : []));

  res.json(wos);
});

// ─── AI 智慧排程建議 ──────────────────────────────────────────
app.get('/api/ai/schedule-insights', (req, res) => {
  // 分析歷史工單：實際工時 vs 標準工時，找出偏差最大的產品
  const analysis = db.prepare(`
    SELECT wo.product_id, wo.product_name, wo.product_code,
      COUNT(*) as wo_count,
      AVG(wo.completed_qty) as avg_qty,
      p.std_hours as current_std_hours,
      AVG(
        CASE WHEN wo.actual_start IS NOT NULL AND wo.actual_end IS NOT NULL
          THEN (julianday(wo.actual_end) - julianday(wo.actual_start)) * 24 / wo.completed_qty
          ELSE NULL END
      ) as actual_hours_per_unit
    FROM work_orders wo
    LEFT JOIN products p ON p.id=wo.product_id
    WHERE wo.status='completed' AND wo.actual_start IS NOT NULL AND wo.actual_end IS NOT NULL
      AND wo.completed_qty > 0
    GROUP BY wo.product_id
    HAVING wo_count >= 2
    ORDER BY wo_count DESC
  `).all();

  const suggestions = analysis.map(row => {
    const actual = row.actual_hours_per_unit;
    const std = row.current_std_hours || 1;
    if (!actual || actual <= 0) return null;
    const deviation = ((actual - std) / std) * 100;
    const recommended = Math.round(actual * 100) / 100;
    const accuracy = Math.round((1 - Math.abs(deviation) / 100) * 100);
    return {
      product_id: row.product_id,
      product_name: row.product_name,
      product_code: row.product_code,
      wo_count: row.wo_count,
      current_std_hours: std,
      actual_hours_per_unit: Math.round(actual * 1000) / 1000,
      recommended_std_hours: recommended,
      deviation_pct: Math.round(deviation * 10) / 10,
      accuracy_pct: Math.max(0, accuracy),
      action: Math.abs(deviation) > 20 ? (deviation > 0 ? 'increase' : 'decrease') : 'ok',
    };
  }).filter(Boolean).sort((a, b) => Math.abs(b.deviation_pct) - Math.abs(a.deviation_pct));

  // 瓶頸預測：未來 14 天工單負載
  const bottlenecks = db.prepare(`
    SELECT wo.machine_id, wo.machine_name,
      COUNT(*) as pending_wos,
      SUM((wo.planned_qty - wo.completed_qty) * COALESCE(p.std_hours, 1)) as load_hours
    FROM work_orders wo
    LEFT JOIN products p ON p.id=wo.product_id
    WHERE wo.status NOT IN ('completed','cancelled')
      AND wo.planned_end >= date('now') AND wo.planned_end <= date('now','+14 days')
    GROUP BY wo.machine_id
    ORDER BY load_hours DESC
    LIMIT 5
  `).all();

  // 逾期風險訂單（3天內到期且尚未完工）
  const atRisk = db.prepare(`
    SELECT o.order_no, o.customer_name, o.due_date,
      COUNT(wo.id) as total_wos,
      SUM(CASE WHEN wo.status='completed' THEN 1 ELSE 0 END) as done_wos,
      ROUND(SUM(CASE WHEN wo.status='completed' THEN 1.0 ELSE 0 END) / COUNT(wo.id) * 100) as progress_pct
    FROM orders o
    LEFT JOIN work_orders wo ON wo.order_id=o.id
    WHERE o.status IN ('scheduled','in_production')
      AND o.due_date >= date('now') AND o.due_date <= date('now','+5 days')
    GROUP BY o.id
    HAVING progress_pct < 80
    ORDER BY o.due_date ASC
  `).all();

  res.json({ suggestions, bottlenecks, atRisk, generated_at: dayjs().format('YYYY-MM-DD HH:mm') });
});

// 套用 AI 建議（更新產品標準工時）
app.patch('/api/ai/apply-std-hours', (req, res) => {
  const { product_id, std_hours } = req.body;
  if (!product_id || !std_hours) return res.status(400).json({ error: '缺少必要參數' });
  db.prepare('UPDATE products SET std_hours=? WHERE id=?').run(std_hours, product_id);
  res.json({ ok: true });
});

// ─── 通知中心 ──────────────────────────────────────────────────
app.get('/api/notifications', (req, res) => {
  const notifications = [];

  // 逾期訂單
  const overdue = db.prepare(`SELECT id, order_no, customer_name, due_date FROM orders WHERE due_date < date('now') AND status NOT IN ('shipped','cancelled') ORDER BY due_date ASC LIMIT 10`).all();
  overdue.forEach(o => notifications.push({ type: 'overdue', severity: 'high', title: `訂單逾期：${o.order_no}`, body: `${o.customer_name} · 交期 ${o.due_date}`, ref_id: o.id }));

  // 未解決異常
  const anomalies = db.prepare(`SELECT id, title, severity, machine_name, created_at FROM anomalies WHERE status='open' ORDER BY created_at DESC LIMIT 10`).all();
  anomalies.forEach(a => notifications.push({ type: 'anomaly', severity: a.severity === 'high' ? 'high' : 'medium', title: `異常通報：${a.title}`, body: a.machine_name || '', ref_id: a.id }));

  // 產能預警
  const threshold = parseFloat(db.prepare(`SELECT value FROM system_settings WHERE key='capacity_warning_threshold'`).get()?.value || '85') / 100;
  const horizon = require('dayjs')().add(14, 'day').format('YYYY-MM-DD');
  const machines = db.prepare(`SELECT * FROM machines WHERE status='active'`).all();
  machines.forEach(m => {
    const wos = db.prepare(`SELECT SUM(planned_qty-completed_qty) as load FROM work_orders WHERE machine_id=? AND planned_end<=? AND status NOT IN ('completed','cancelled')`).get(m.id, horizon);
    const load = wos.load || 0;
    const available = 14 * (m.capacity_per_day || 8);
    if (load > available * threshold) {
      notifications.push({ type: 'capacity', severity: 'medium', title: `產能預警：${m.name}`, body: `負載 ${Math.round(load/available*100)}%，未來14天`, ref_id: m.id });
    }
  });

  // MRP 缺料（stock < safety_stock）
  const shortages = db.prepare(`SELECT id, name, code, stock_qty, safety_stock FROM materials WHERE stock_qty < safety_stock LIMIT 10`).all();
  shortages.forEach(s => notifications.push({ type: 'shortage', severity: 'medium', title: `物料偏低：${s.name}`, body: `庫存 ${s.stock_qty}，安全庫存 ${s.safety_stock}`, ref_id: s.id }));

  // 即將到期保養
  const maint = db.prepare(`SELECT ms.*, m.name as mname FROM maintenance_schedules ms LEFT JOIN machines m ON m.id=ms.machine_id WHERE ms.next_due <= date('now','+7 days') AND ms.status='pending' LIMIT 5`).all();
  maint.forEach(mt => notifications.push({ type: 'maintenance', severity: 'low', title: `保養到期：${mt.title}`, body: `${mt.machine_name || ''} · ${mt.next_due}`, ref_id: mt.id }));

  notifications.sort((a, b) => { const ord = { high: 0, medium: 1, low: 2 }; return ord[a.severity] - ord[b.severity]; });
  res.json({ count: notifications.length, items: notifications });
});

// ─── 客戶 CRM ─────────────────────────────────────────────────
app.get('/api/customers/:id/crm', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });

  const orders = db.prepare(`
    SELECT o.id, o.order_no, o.status, o.due_date, o.created_at, o.priority,
           COUNT(oi.id) as item_count, SUM(oi.qty) as total_qty
    FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
    WHERE o.customer_id=?
    GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50
  `).all(req.params.id);

  const stats = db.prepare(`
    SELECT COUNT(*) as total_orders,
      SUM(CASE WHEN status='shipped' THEN 1 ELSE 0 END) as shipped,
      SUM(CASE WHEN status IN ('pending','scheduled','in_production') THEN 1 ELSE 0 END) as active
    FROM orders WHERE customer_id=?
  `).get(req.params.id);

  res.json({ customer, orders, stats });
});

app.patch('/api/customers/:id', (req, res) => {
  const { name, contact, phone } = req.body;
  db.prepare('UPDATE customers SET name=?, contact=?, phone=? WHERE id=?').run(name, contact || '', phone || '', req.params.id);
  res.json({ ok: true });
});

// ─── 生產環境：服務前端靜態檔 + SPA fallback ──────────────────
const path = require('path');
const fs = require('fs');
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // 非 /api 的路由一律回傳 index.html（前端路由接手）
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Error handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 5100;
app.listen(PORT, () => console.log(`Factory API running on port ${PORT}`));
