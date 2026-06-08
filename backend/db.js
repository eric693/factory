const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'factory.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    phone TEXT,
    query_token TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    unit TEXT DEFAULT '個',
    std_hours REAL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    capacity_per_day REAL DEFAULT 8,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_no TEXT UNIQUE NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 2,
    due_date TEXT NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id),
    product_name TEXT NOT NULL,
    product_code TEXT,
    qty INTEGER NOT NULL,
    unit TEXT DEFAULT '個'
  );

  CREATE TABLE IF NOT EXISTS work_orders (
    id TEXT PRIMARY KEY,
    wo_no TEXT UNIQUE NOT NULL,
    order_id TEXT REFERENCES orders(id),
    order_item_id TEXT REFERENCES order_items(id),
    product_name TEXT NOT NULL,
    product_code TEXT,
    planned_qty INTEGER NOT NULL,
    completed_qty INTEGER DEFAULT 0,
    defect_qty INTEGER DEFAULT 0,
    machine_id TEXT REFERENCES machines(id),
    machine_name TEXT,
    operator TEXT,
    status TEXT DEFAULT 'pending',
    planned_start TEXT,
    planned_end TEXT,
    actual_start TEXT,
    actual_end TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS progress_logs (
    id TEXT PRIMARY KEY,
    work_order_id TEXT REFERENCES work_orders(id),
    qty INTEGER NOT NULL,
    defect_qty INTEGER DEFAULT 0,
    operator TEXT,
    note TEXT,
    logged_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    shipment_no TEXT UNIQUE NOT NULL,
    order_id TEXT REFERENCES orders(id),
    customer_name TEXT,
    shipped_at TEXT,
    carrier TEXT,
    tracking_no TEXT,
    status TEXT DEFAULT 'preparing',
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS shipment_items (
    id TEXT PRIMARY KEY,
    shipment_id TEXT REFERENCES shipments(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    product_code TEXT,
    qty INTEGER NOT NULL
  );

  -- OEE: 設備事件（開機/停機/維修）
  CREATE TABLE IF NOT EXISTS machine_events (
    id TEXT PRIMARY KEY,
    machine_id TEXT REFERENCES machines(id),
    event_type TEXT NOT NULL,  -- 'running','downtime','maintenance'
    reason TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_min INTEGER,
    operator TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 換模時間矩陣
  CREATE TABLE IF NOT EXISTS changeover_matrix (
    id TEXT PRIMARY KEY,
    from_product_id TEXT REFERENCES products(id),
    to_product_id TEXT REFERENCES products(id),
    machine_id TEXT REFERENCES machines(id),
    changeover_min INTEGER NOT NULL DEFAULT 30,
    UNIQUE(from_product_id, to_product_id, machine_id)
  );

  -- 物料主檔
  CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    unit TEXT DEFAULT '個',
    stock_qty REAL DEFAULT 0,
    safety_stock REAL DEFAULT 0,
    unit_cost REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- BOM（產品用料清單）
  CREATE TABLE IF NOT EXISTS bom (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id),
    material_id TEXT REFERENCES materials(id),
    qty_per_unit REAL NOT NULL,
    UNIQUE(product_id, material_id)
  );

  -- 庫存異動記錄
  CREATE TABLE IF NOT EXISTS stock_logs (
    id TEXT PRIMARY KEY,
    material_id TEXT REFERENCES materials(id),
    delta REAL NOT NULL,
    reason TEXT,
    ref_id TEXT,
    logged_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 使用者帳號
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'worker',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 異常通報
  CREATE TABLE IF NOT EXISTS anomalies (
    id TEXT PRIMARY KEY,
    work_order_id TEXT REFERENCES work_orders(id),
    machine_id TEXT REFERENCES machines(id),
    machine_name TEXT,
    type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    title TEXT NOT NULL,
    description TEXT,
    reporter TEXT,
    status TEXT DEFAULT 'open',
    resolved_by TEXT,
    resolved_at TEXT,
    resolve_note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 換班交接
  CREATE TABLE IF NOT EXISTS shift_handovers (
    id TEXT PRIMARY KEY,
    shift TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    from_operator TEXT,
    to_operator TEXT,
    production_summary TEXT,
    issues TEXT,
    equipment_status TEXT,
    materials_status TEXT,
    notes TEXT,
    signed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 詢價單
  CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY,
    inquiry_no TEXT UNIQUE NOT NULL,
    company_name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    assigned_to TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS inquiry_items (
    id TEXT PRIMARY KEY,
    inquiry_id TEXT REFERENCES inquiries(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    qty INTEGER,
    note TEXT
  );

  -- 報價單
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    quote_no TEXT UNIQUE NOT NULL,
    inquiry_id TEXT REFERENCES inquiries(id),
    customer_name TEXT NOT NULL,
    valid_days INTEGER DEFAULT 30,
    status TEXT DEFAULT 'draft',
    total_material_cost REAL DEFAULT 0,
    total_labor_cost REAL DEFAULT 0,
    margin_pct REAL DEFAULT 25,
    final_price REAL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS quote_items (
    id TEXT PRIMARY KEY,
    quote_id TEXT REFERENCES quotes(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id),
    product_name TEXT NOT NULL,
    product_code TEXT,
    qty INTEGER NOT NULL,
    material_cost REAL DEFAULT 0,
    labor_cost REAL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0
  );

  -- 成品庫存
  CREATE TABLE IF NOT EXISTS finished_goods (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id),
    product_name TEXT NOT NULL,
    product_code TEXT,
    work_order_id TEXT REFERENCES work_orders(id),
    qty INTEGER NOT NULL,
    location TEXT,
    status TEXT DEFAULT 'in_stock',
    order_id TEXT REFERENCES orders(id),
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS fg_logs (
    id TEXT PRIMARY KEY,
    fg_id TEXT REFERENCES finished_goods(id),
    action TEXT NOT NULL,
    qty INTEGER,
    note TEXT,
    operator TEXT,
    logged_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 系統設定（key-value）
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
  );

  -- 採購申請單
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_no TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'draft',
    supplier TEXT,
    expected_date TEXT,
    total_amount REAL DEFAULT 0,
    note TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY,
    po_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
    material_id TEXT REFERENCES materials(id),
    material_name TEXT NOT NULL,
    material_code TEXT,
    unit TEXT DEFAULT '個',
    qty REAL NOT NULL,
    unit_cost REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    note TEXT
  );

  -- 計劃性保養排程
  CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id TEXT PRIMARY KEY,
    machine_id TEXT REFERENCES machines(id),
    machine_name TEXT,
    title TEXT NOT NULL,
    maintenance_type TEXT DEFAULT 'routine',
    frequency_days INTEGER DEFAULT 30,
    last_done TEXT,
    next_due TEXT NOT NULL,
    estimated_hours REAL DEFAULT 2,
    assigned_to TEXT,
    status TEXT DEFAULT 'pending',
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 保養執行記錄
  CREATE TABLE IF NOT EXISTS maintenance_logs (
    id TEXT PRIMARY KEY,
    schedule_id TEXT REFERENCES maintenance_schedules(id),
    machine_id TEXT REFERENCES machines(id),
    done_at TEXT NOT NULL,
    actual_hours REAL DEFAULT 0,
    done_by TEXT,
    result TEXT,
    note TEXT
  );

  -- 批號管理（全程追溯）
  CREATE TABLE IF NOT EXISTS lot_numbers (
    id TEXT PRIMARY KEY,
    lot_no TEXT UNIQUE NOT NULL,
    material_id TEXT REFERENCES materials(id),
    material_name TEXT NOT NULL,
    material_code TEXT,
    qty REAL NOT NULL,
    remaining_qty REAL NOT NULL,
    supplier TEXT,
    received_at TEXT,
    expiry_date TEXT,
    unit TEXT DEFAULT '個',
    unit_cost REAL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS lot_usage (
    id TEXT PRIMARY KEY,
    lot_id TEXT REFERENCES lot_numbers(id),
    work_order_id TEXT REFERENCES work_orders(id),
    product_name TEXT,
    qty_used REAL NOT NULL,
    used_at TEXT DEFAULT (datetime('now','localtime')),
    operator TEXT
  );

  -- SPC 規格與量測
  CREATE TABLE IF NOT EXISTS spc_specs (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id),
    product_code TEXT,
    measurement_name TEXT NOT NULL,
    unit TEXT DEFAULT 'mm',
    usl REAL,
    lsl REAL,
    target REAL,
    UNIQUE(product_id, measurement_name)
  );

  CREATE TABLE IF NOT EXISTS spc_measurements (
    id TEXT PRIMARY KEY,
    spec_id TEXT REFERENCES spc_specs(id),
    product_id TEXT REFERENCES products(id),
    product_code TEXT,
    measurement_name TEXT NOT NULL,
    value REAL NOT NULL,
    work_order_id TEXT REFERENCES work_orders(id),
    wo_no TEXT,
    measured_at TEXT DEFAULT (datetime('now','localtime')),
    operator TEXT,
    is_out_of_control INTEGER DEFAULT 0
  );

  -- 薪資計件設定
  CREATE TABLE IF NOT EXISTS payroll_rates (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id),
    product_code TEXT,
    product_name TEXT NOT NULL,
    piece_rate REAL DEFAULT 0,
    defect_penalty REAL DEFAULT 0,
    bonus_threshold INTEGER DEFAULT 0,
    bonus_rate REAL DEFAULT 0,
    UNIQUE(product_id)
  );

  CREATE TABLE IF NOT EXISTS payroll_periods (
    id TEXT PRIMARY KEY,
    period TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'open',
    closed_at TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS payroll_records (
    id TEXT PRIMARY KEY,
    period_id TEXT REFERENCES payroll_periods(id),
    period TEXT NOT NULL,
    operator TEXT NOT NULL,
    product_name TEXT,
    product_code TEXT,
    work_order_id TEXT REFERENCES work_orders(id),
    ok_qty INTEGER DEFAULT 0,
    defect_qty INTEGER DEFAULT 0,
    piece_rate REAL DEFAULT 0,
    defect_penalty REAL DEFAULT 0,
    gross_amount REAL DEFAULT 0,
    deduction REAL DEFAULT 0,
    net_amount REAL DEFAULT 0,
    note TEXT
  );

  -- 模具/治具管理
  CREATE TABLE IF NOT EXISTS molds (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    machine_id TEXT REFERENCES machines(id),
    machine_name TEXT,
    material TEXT,
    total_shots INTEGER DEFAULT 0,
    current_shots INTEGER DEFAULT 0,
    max_shots INTEGER DEFAULT 500000,
    warning_shots INTEGER DEFAULT 450000,
    status TEXT DEFAULT 'active',
    last_maintained TEXT,
    next_maintenance_shots INTEGER,
    product_id TEXT REFERENCES products(id),
    product_name TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS mold_logs (
    id TEXT PRIMARY KEY,
    mold_id TEXT REFERENCES molds(id),
    action TEXT NOT NULL,
    shots_added INTEGER DEFAULT 0,
    work_order_id TEXT REFERENCES work_orders(id),
    operator TEXT,
    note TEXT,
    logged_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 外發加工
  CREATE TABLE IF NOT EXISTS outsource_orders (
    id TEXT PRIMARY KEY,
    out_no TEXT UNIQUE NOT NULL,
    work_order_id TEXT REFERENCES work_orders(id),
    wo_no TEXT,
    vendor_name TEXT NOT NULL,
    process_name TEXT NOT NULL,
    product_name TEXT,
    qty INTEGER NOT NULL,
    unit_cost REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    sent_at TEXT,
    expected_return TEXT,
    actual_return TEXT,
    received_qty INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 8D 客訴管理
  CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    complaint_no TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    product_name TEXT,
    product_code TEXT,
    issue_date TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    related_order_id TEXT REFERENCES orders(id),
    related_wo_id TEXT REFERENCES work_orders(id),
    d1_team TEXT,
    d2_problem TEXT,
    d3_containment TEXT,
    d4_root_cause TEXT,
    d5_corrective TEXT,
    d6_implement TEXT,
    d7_prevent TEXT,
    d8_close TEXT,
    closed_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 供應商管理
  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    contact TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    payment_terms TEXT,
    lead_days INTEGER DEFAULT 7,
    rating INTEGER DEFAULT 3,
    status TEXT DEFAULT 'active',
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS supplier_evaluations (
    id TEXT PRIMARY KEY,
    supplier_id TEXT REFERENCES suppliers(id),
    period TEXT NOT NULL,
    delivery_score INTEGER DEFAULT 100,
    quality_score INTEGER DEFAULT 100,
    price_score INTEGER DEFAULT 100,
    total_score INTEGER DEFAULT 100,
    po_count INTEGER DEFAULT 0,
    on_time_count INTEGER DEFAULT 0,
    note TEXT,
    evaluated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- SOP 作業標準書
  CREATE TABLE IF NOT EXISTS sop_documents (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id),
    product_code TEXT,
    product_name TEXT,
    title TEXT NOT NULL,
    version TEXT DEFAULT '1.0',
    status TEXT DEFAULT 'active',
    safety_notes TEXT,
    tools_required TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sop_steps (
    id TEXT PRIMARY KEY,
    sop_id TEXT REFERENCES sop_documents(id) ON DELETE CASCADE,
    step_no INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    warning TEXT,
    expected_time_min INTEGER DEFAULT 0,
    quality_check TEXT
  );

  -- FAI 首件確認
  CREATE TABLE IF NOT EXISTS fai_records (
    id TEXT PRIMARY KEY,
    fai_no TEXT UNIQUE NOT NULL,
    work_order_id TEXT REFERENCES work_orders(id),
    wo_no TEXT,
    product_id TEXT REFERENCES products(id),
    product_name TEXT,
    product_code TEXT,
    inspector TEXT,
    status TEXT DEFAULT 'pending',
    overall_result TEXT,
    approved_by TEXT,
    approved_at TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS fai_items (
    id TEXT PRIMARY KEY,
    fai_id TEXT REFERENCES fai_records(id) ON DELETE CASCADE,
    item_no INTEGER NOT NULL,
    measurement_name TEXT NOT NULL,
    spec_description TEXT,
    usl REAL,
    lsl REAL,
    target REAL,
    unit TEXT DEFAULT 'mm',
    actual_value TEXT,
    result TEXT DEFAULT 'pending'
  );

  -- NCR 不合格品管理
  CREATE TABLE IF NOT EXISTS ncr_records (
    id TEXT PRIMARY KEY,
    ncr_no TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    product_id TEXT REFERENCES products(id),
    product_name TEXT,
    product_code TEXT,
    work_order_id TEXT REFERENCES work_orders(id),
    wo_no TEXT,
    defect_qty INTEGER NOT NULL,
    defect_description TEXT NOT NULL,
    defect_type TEXT DEFAULT 'dimension',
    severity TEXT DEFAULT 'medium',
    disposition TEXT,
    disposition_note TEXT,
    rework_wo_id TEXT REFERENCES work_orders(id),
    status TEXT DEFAULT 'open',
    found_by TEXT,
    closed_by TEXT,
    closed_at TEXT,
    scrap_cost REAL DEFAULT 0,
    rework_cost REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 應收帳款
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_no TEXT UNIQUE NOT NULL,
    order_id TEXT REFERENCES orders(id),
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'unpaid',
    paid_at TEXT,
    payment_method TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 良率預警規則
  CREATE TABLE IF NOT EXISTS yield_alert_rules (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id),
    product_name TEXT,
    product_code TEXT,
    threshold_pct REAL DEFAULT 95,
    consecutive_wos INTEGER DEFAULT 3,
    is_active INTEGER DEFAULT 1,
    last_triggered TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// 預設系統設定

const insertSetting = db.prepare(`INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)`);
insertSetting.run('default_margin_pct', '25', '預設報價毛利率 (%)');
insertSetting.run('default_labor_rate', '300', '預設人工工資 (元/小時)');
insertSetting.run('default_quote_valid_days', '30', '報價單有效天數');
insertSetting.run('work_hours_per_day', '8', '每日工作小時');
insertSetting.run('capacity_warning_threshold', '85', '產能預警閾值 (%)');
insertSetting.run('company_name', 'FactoryOS 製造廠', '公司名稱');
insertSetting.run('inquiry_email', '', '詢價回覆信箱');

// 升級舊有欄位（若已存在則忽略）
const addCol = (table, col, def) => {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch (_) {}
};
addCol('work_orders', 'defect_qty', 'INTEGER DEFAULT 0');
addCol('work_orders', 'product_id', 'TEXT REFERENCES products(id)');
// 回填 product_id（依 product_code 對應）
try {
  db.exec(`UPDATE work_orders SET product_id=(SELECT id FROM products WHERE products.code=work_orders.product_code) WHERE product_id IS NULL AND product_code != ''`);
} catch(_) {}
addCol('progress_logs', 'defect_qty', 'INTEGER DEFAULT 0');
addCol('customers', 'query_token', 'TEXT');
addCol('products', 'labor_cost_per_hour', 'REAL DEFAULT 300');
addCol('order_items', 'unit_price', 'REAL DEFAULT 0');
addCol('orders', 'total_revenue', 'REAL DEFAULT 0');
addCol('quotes', 'result', 'TEXT DEFAULT NULL');
addCol('quotes', 'lost_reason', 'TEXT DEFAULT NULL');
addCol('customers', 'credit_limit', 'REAL DEFAULT 0');
addCol('customers', 'credit_note', 'TEXT DEFAULT NULL');

// 技能矩陣表（師傅可操作的機台/產品）
try { db.exec(`CREATE TABLE IF NOT EXISTS operator_skills (
  id TEXT PRIMARY KEY,
  operator TEXT NOT NULL,
  machine_id TEXT REFERENCES machines(id),
  product_id TEXT REFERENCES products(id),
  skill_level INTEGER DEFAULT 1,
  certified INTEGER DEFAULT 0,
  certified_at TEXT,
  note TEXT,
  UNIQUE(operator, machine_id, product_id)
)`); } catch(_) {}

// ───── 點工媒合（工班接案平台）─────
try { db.exec(`
  -- 點工/工班檔案
  CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    work_types TEXT DEFAULT '[]',
    pricing_method TEXT DEFAULT '日薪',
    team_size INTEGER DEFAULT 1,
    price_min REAL DEFAULT 0,
    price_max REAL DEFAULT 0,
    phone TEXT,
    line_name TEXT,
    line_user_id TEXT,
    service_areas TEXT DEFAULT '[]',
    intro TEXT,
    rating REAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'unlisted',
    primary_city TEXT,
    lat REAL,
    lng REAL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 可接案時段
  CREATE TABLE IF NOT EXISTS worker_slots (
    id TEXT PRIMARY KEY,
    worker_id TEXT REFERENCES workers(id) ON DELETE CASCADE,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    service_area TEXT,
    note TEXT,
    status TEXT DEFAULT 'available',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 接案邀約
  CREATE TABLE IF NOT EXISTS worker_invitations (
    id TEXT PRIMARY KEY,
    invitation_no TEXT UNIQUE NOT NULL,
    worker_id TEXT REFERENCES workers(id),
    project_name TEXT NOT NULL,
    client_name TEXT,
    client_phone TEXT,
    location TEXT,
    city TEXT,
    work_date TEXT,
    work_types TEXT DEFAULT '[]',
    description TEXT,
    offer_price REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    responded_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 今日工作（已接受案件，含照片與簽名）
  CREATE TABLE IF NOT EXISTS worker_jobs (
    id TEXT PRIMARY KEY,
    invitation_id TEXT REFERENCES worker_invitations(id),
    worker_id TEXT REFERENCES workers(id),
    project_name TEXT,
    work_date TEXT,
    status TEXT DEFAULT 'in_progress',
    photos TEXT DEFAULT '[]',
    signature TEXT,
    completion_note TEXT,
    started_at TEXT DEFAULT (datetime('now','localtime')),
    completed_at TEXT
  );

  -- 點工評價
  CREATE TABLE IF NOT EXISTS worker_reviews (
    id TEXT PRIMARY KEY,
    worker_id TEXT REFERENCES workers(id),
    invitation_id TEXT REFERENCES worker_invitations(id),
    rating INTEGER NOT NULL,
    comment TEXT,
    reviewer_name TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 薪資設定（級距日薪，可多筆生效日）
  CREATE TABLE IF NOT EXISTS worker_rates (
    id TEXT PRIMARY KEY,
    worker_id TEXT REFERENCES workers(id) ON DELETE CASCADE,
    skill_level TEXT DEFAULT '師傅',
    day_rate REAL NOT NULL,
    overtime_hourly REAL DEFAULT 0,
    effective_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 薪資結算期別
  CREATE TABLE IF NOT EXISTS labor_payroll_periods (
    id TEXT PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    period_type TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    settled_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(year, month, period_type)
  );

  -- 薪資紀錄
  CREATE TABLE IF NOT EXISTS labor_payroll_records (
    id TEXT PRIMARY KEY,
    period_id TEXT REFERENCES labor_payroll_periods(id) ON DELETE CASCADE,
    worker_id TEXT REFERENCES workers(id),
    worker_name TEXT,
    skill_level TEXT,
    day_rate REAL DEFAULT 0,
    overtime_hourly REAL DEFAULT 0,
    work_days REAL DEFAULT 0,
    overtime_hours REAL DEFAULT 0,
    base_pay REAL DEFAULT 0,
    overtime_pay REAL DEFAULT 0,
    bonus REAL DEFAULT 0,
    deduction REAL DEFAULT 0,
    advance_deduction REAL DEFAULT 0,
    net_pay REAL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    note TEXT
  );

  -- 請假使用紀錄（額度依年資計算，使用量記錄於此）
  CREATE TABLE IF NOT EXISTS worker_leave (
    id TEXT PRIMARY KEY,
    worker_id TEXT REFERENCES workers(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    leave_type TEXT NOT NULL,
    days REAL NOT NULL,
    leave_date TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 專案合約（收款）
  CREATE TABLE IF NOT EXISTS labor_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT,
    contract_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS project_receipts (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES labor_projects(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    received_date TEXT,
    method TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 成本記錄（人工/材料/其他，支援退回沖銷）
  CREATE TABLE IF NOT EXISTS project_costs (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES labor_projects(id) ON DELETE CASCADE,
    cost_type TEXT NOT NULL,
    subject TEXT,
    task_name TEXT,
    amount REAL NOT NULL,
    qty REAL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    worker_name TEXT,
    source TEXT DEFAULT 'manual',
    cost_date TEXT,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`); } catch(e) { console.error('workers schema:', e.message); }

addCol('workers', 'skill_level', "TEXT DEFAULT '師傅'");
addCol('workers', 'base_salary', 'REAL DEFAULT 0');
addCol('workers', 'hire_date', 'TEXT');
addCol('worker_invitations', 'project_id', 'TEXT REFERENCES labor_projects(id)');
addCol('worker_invitations', 'slot_id', 'TEXT REFERENCES worker_slots(id)');
addCol('worker_jobs', 'project_cost_id', 'TEXT');
// migrate old 'new' inquiry status → 'pending'
try { db.exec(`UPDATE inquiries SET status='pending' WHERE status='new'`); } catch(_) {}

insertSetting.run('line_notify_token', '', 'LINE Notify Token（用於推播通知）');
insertSetting.run('line_notify_enabled', '0', '啟用 LINE 通知（1=啟用）');
insertSetting.run('yield_alert_enabled', '1', '啟用良率預警（1=啟用）');

module.exports = db;
