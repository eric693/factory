const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// 台灣縣市中心座標（地圖定位用，無需外部 API）
const CITY_COORDS = {
  '台北市': [25.0330, 121.5654], '臺北市': [25.0330, 121.5654],
  '新北市': [25.0169, 121.4628], '桃園市': [24.9936, 121.3010],
  '台中市': [24.1477, 120.6736], '臺中市': [24.1477, 120.6736],
  '台南市': [22.9999, 120.2270], '臺南市': [22.9999, 120.2270],
  '高雄市': [22.6273, 120.3014], '基隆市': [25.1276, 121.7392],
  '新竹市': [24.8138, 120.9675], '新竹縣': [24.8387, 121.0177],
  '苗栗縣': [24.5602, 120.8214], '彰化縣': [24.0518, 120.5161],
  '南投縣': [23.9609, 120.9719], '雲林縣': [23.7092, 120.4313],
  '嘉義市': [23.4801, 120.4491], '嘉義縣': [23.4518, 120.2555],
  '屏東縣': [22.5519, 120.5487], '宜蘭縣': [24.7021, 121.7378],
  '花蓮縣': [23.9871, 121.6015], '台東縣': [22.7583, 121.1444], '臺東縣': [22.7583, 121.1444],
  '澎湖縣': [23.5712, 119.5793], '金門縣': [24.4321, 118.3171], '連江縣': [26.1602, 119.9499],
};

const parseJSON = (s, def) => { try { return JSON.parse(s); } catch { return def; } };
const serialize = (w) => ({
  ...w,
  work_types: parseJSON(w.work_types, []),
  service_areas: parseJSON(w.service_areas, []),
});

// 加一點隨機偏移避免同城市點工完全重疊
const cityCoord = (city, seed) => {
  const base = CITY_COORDS[city];
  if (!base) return null;
  const offset = ((seed || 0) % 10) * 0.004 - 0.018;
  const offset2 = ((Math.floor((seed || 0) / 10)) % 10) * 0.004 - 0.018;
  return [base[0] + offset, base[1] + offset2];
};

// ───── 點工檔案 ─────
// 列表（地圖搜尋用，支援篩選）
router.get('/', (req, res) => {
  const { keyword, city, work_type, min_rating, max_price, date, status } = req.query;
  let q = 'SELECT * FROM workers WHERE 1=1';
  const params = [];
  // 預設只顯示已上架（地圖搜尋）；status=all 顯示全部（管理用）
  if (status === 'all') { /* no filter */ }
  else { q += " AND status='listed'"; }
  if (keyword) { q += ' AND (name LIKE ? OR intro LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
  if (city) { q += ' AND service_areas LIKE ?'; params.push(`%${city}%`); }
  if (work_type) { q += ' AND work_types LIKE ?'; params.push(`%${work_type}%`); }
  if (min_rating) { q += ' AND rating >= ?'; params.push(parseFloat(min_rating)); }
  if (max_price) { q += ' AND price_min <= ?'; params.push(parseFloat(max_price)); }
  q += ' ORDER BY rating DESC, updated_at DESC';

  let workers = db.prepare(q).all(...params).map(serialize);

  // 依日期篩選（必須在該日有可接案時段）
  if (date) {
    workers = workers.filter(w => {
      const slots = db.prepare(`SELECT COUNT(*) n FROM worker_slots WHERE worker_id=? AND status='available' AND date(start_time) <= ? AND date(end_time) >= ?`).get(w.id, date, date);
      return slots.n > 0;
    });
  }

  // 補上地圖座標
  workers = workers.map((w, i) => {
    let coords = (w.lat && w.lng) ? [w.lat, w.lng] : cityCoord(w.primary_city || w.service_areas[0], i + 1);
    return { ...w, map_lat: coords?.[0] || null, map_lng: coords?.[1] || null };
  });

  res.json(workers);
});

router.get('/:id', (req, res) => {
  const w = db.prepare('SELECT * FROM workers WHERE id=?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  const slots = db.prepare("SELECT * FROM worker_slots WHERE worker_id=? ORDER BY start_time").all(req.params.id);
  const reviews = db.prepare('SELECT * FROM worker_reviews WHERE worker_id=? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
  res.json({ ...serialize(w), slots, reviews });
});

// 由 LINE user id 取得（或建立）檔案
router.get('/by-line/:lineUserId', (req, res) => {
  const w = db.prepare('SELECT * FROM workers WHERE line_user_id=?').get(req.params.lineUserId);
  if (!w) return res.json(null);
  res.json(serialize(w));
});

// 建立 / 更新檔案
router.post('/', (req, res) => {
  const { id, name, work_types, pricing_method, team_size, price_min, price_max, phone, line_name, line_user_id, service_areas, intro, primary_city, status } = req.body;
  if (!name) return res.status(400).json({ error: '姓名/隊名為必填' });

  const wt = JSON.stringify(work_types || []);
  const sa = JSON.stringify(service_areas || []);
  const pCity = primary_city || (service_areas && service_areas[0]) || null;
  const coord = pCity ? cityCoord(pCity, db.prepare('SELECT COUNT(*) n FROM workers').get().n + 1) : null;
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  if (id) {
    const exist = db.prepare('SELECT * FROM workers WHERE id=?').get(id);
    if (exist) {
      db.prepare(`UPDATE workers SET name=?, work_types=?, pricing_method=?, team_size=?, price_min=?, price_max=?, phone=?, line_name=?, service_areas=?, intro=?, primary_city=?, lat=?, lng=?, status=COALESCE(?,status), updated_at=? WHERE id=?`)
        .run(name, wt, pricing_method || '日薪', team_size || 1, price_min || 0, price_max || 0, phone || '', line_name || '', sa, intro || '', pCity, coord?.[0] || exist.lat, coord?.[1] || exist.lng, status || null, now, id);
      return res.json({ ok: true, id });
    }
  }

  const newId = id || uuidv4();
  db.prepare(`INSERT INTO workers (id,name,work_types,pricing_method,team_size,price_min,price_max,phone,line_name,line_user_id,service_areas,intro,primary_city,lat,lng,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(newId, name, wt, pricing_method || '日薪', team_size || 1, price_min || 0, price_max || 0, phone || '', line_name || '', line_user_id || null, sa, intro || '', pCity, coord?.[0] || null, coord?.[1] || null, status || 'unlisted');
  res.json({ ok: true, id: newId });
});

// 上架 / 下架
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE workers SET status=?, updated_at=? WHERE id=?').run(status, dayjs().format('YYYY-MM-DD HH:mm:ss'), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM workers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ───── 可接案時段 ─────
router.get('/:id/slots', (req, res) => {
  res.json(db.prepare('SELECT * FROM worker_slots WHERE worker_id=? ORDER BY start_time').all(req.params.id));
});

router.post('/:id/slots', (req, res) => {
  const { start_time, end_time, service_area, note } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: '開始與結束時間為必填' });
  const id = uuidv4();
  db.prepare(`INSERT INTO worker_slots (id,worker_id,start_time,end_time,service_area,note) VALUES (?,?,?,?,?,?)`)
    .run(id, req.params.id, start_time, end_time, service_area || '', note || '');
  res.json({ ok: true, id });
});

router.delete('/slots/:slotId', (req, res) => {
  db.prepare('DELETE FROM worker_slots WHERE id=?').run(req.params.slotId);
  res.json({ ok: true });
});

// ───── 接案邀約 ─────
// 點工查自己的邀約
router.get('/:id/invitations', (req, res) => {
  const list = db.prepare('SELECT * FROM worker_invitations WHERE worker_id=? ORDER BY created_at DESC').all(req.params.id);
  res.json(list.map(i => ({ ...i, work_types: parseJSON(i.work_types, []) })));
});

// 發案方建立邀約
router.post('/:id/invitations', (req, res) => {
  const { project_name, project_id, client_name, client_phone, location, city, work_date, work_types, description, offer_price } = req.body;
  if (!project_name) return res.status(400).json({ error: '專案名稱為必填' });
  const worker = db.prepare('SELECT * FROM workers WHERE id=?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: '找不到點工' });

  const id = uuidv4();
  const year = dayjs().format('YYYY');
  const seq = db.prepare('SELECT COUNT(*) n FROM worker_invitations WHERE invitation_no LIKE ?').get(`INV-${year}-%`).n + 1;
  const invitation_no = `INV-${year}-${String(seq).padStart(4, '0')}`;

  // 若指定日期,嘗試找出涵蓋該日的可用時段以便接受後標記 booked
  let slotId = null;
  if (work_date) {
    const slot = db.prepare(`SELECT id FROM worker_slots WHERE worker_id=? AND status='available' AND date(start_time) <= ? AND date(end_time) >= ? LIMIT 1`).get(req.params.id, work_date, work_date);
    slotId = slot?.id || null;
  }

  db.prepare(`INSERT INTO worker_invitations (id,invitation_no,worker_id,project_id,slot_id,project_name,client_name,client_phone,location,city,work_date,work_types,description,offer_price)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, invitation_no, req.params.id, project_id || null, slotId, project_name, client_name || '', client_phone || '', location || '', city || '', work_date || '', JSON.stringify(work_types || []), description || '', offer_price || 0);
  res.json({ ok: true, id, invitation_no });
});

// 全部邀約（發案方/管理視角）
router.get('/invitations/all', (req, res) => {
  const { status } = req.query;
  let q = `SELECT i.*, w.name as worker_name, w.phone as worker_phone, w.rating as worker_rating FROM worker_invitations i LEFT JOIN workers w ON w.id=i.worker_id`;
  if (status && status !== 'all') q += ' WHERE i.status=?';
  q += ' ORDER BY i.created_at DESC LIMIT 100';
  const rows = status && status !== 'all' ? db.prepare(q).all(status) : db.prepare(q).all();
  res.json(rows.map(i => ({ ...i, work_types: parseJSON(i.work_types, []) })));
});

// 點工回應邀約（接受/拒絕）
router.patch('/invitations/:invId/respond', (req, res) => {
  const { status } = req.body; // accepted / rejected
  const inv = db.prepare('SELECT * FROM worker_invitations WHERE id=?').get(req.params.invId);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE worker_invitations SET status=?, responded_at=? WHERE id=?').run(status, dayjs().format('YYYY-MM-DD HH:mm:ss'), req.params.invId);

  // 接受 → 自動建立今日工作 + 消耗對應時段
  if (status === 'accepted') {
    const existing = db.prepare('SELECT id FROM worker_jobs WHERE invitation_id=?').get(req.params.invId);
    if (!existing) {
      db.prepare(`INSERT INTO worker_jobs (id,invitation_id,worker_id,project_name,work_date,status) VALUES (?,?,?,?,?,'in_progress')`)
        .run(uuidv4(), inv.id, inv.worker_id, inv.project_name, inv.work_date);
    }
    // 時段標記為已預約
    if (inv.slot_id) db.prepare("UPDATE worker_slots SET status='booked' WHERE id=?").run(inv.slot_id);
  }
  // 婉拒 → 釋放時段
  if (status === 'rejected' && inv.slot_id) {
    db.prepare("UPDATE worker_slots SET status='available' WHERE id=?").run(inv.slot_id);
  }
  res.json({ ok: true });
});

// ───── 今日工作 ─────
router.get('/:id/jobs', (req, res) => {
  const list = db.prepare(`
    SELECT j.*, i.invitation_no, i.location, i.city, i.client_name, i.offer_price
    FROM worker_jobs j LEFT JOIN worker_invitations i ON i.id=j.invitation_id
    WHERE j.worker_id=? ORDER BY j.started_at DESC
  `).all(req.params.id);
  res.json(list.map(j => ({ ...j, photos: parseJSON(j.photos, []) })));
});

// 上傳完工照片（base64）
router.post('/jobs/:jobId/photos', (req, res) => {
  const { photo } = req.body; // base64 data URL
  if (!photo) return res.status(400).json({ error: '無照片資料' });
  const job = db.prepare('SELECT * FROM worker_jobs WHERE id=?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const photos = parseJSON(job.photos, []);
  photos.push({ data: photo, at: dayjs().format('YYYY-MM-DD HH:mm:ss') });
  db.prepare('UPDATE worker_jobs SET photos=? WHERE id=?').run(JSON.stringify(photos), req.params.jobId);
  res.json({ ok: true, count: photos.length });
});

router.delete('/jobs/:jobId/photos/:idx', (req, res) => {
  const job = db.prepare('SELECT * FROM worker_jobs WHERE id=?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const photos = parseJSON(job.photos, []);
  photos.splice(parseInt(req.params.idx), 1);
  db.prepare('UPDATE worker_jobs SET photos=? WHERE id=?').run(JSON.stringify(photos), req.params.jobId);
  res.json({ ok: true });
});

// 完工（含簽名）
router.post('/jobs/:jobId/complete', (req, res) => {
  const { signature, completion_note } = req.body;
  const job = db.prepare('SELECT * FROM worker_jobs WHERE id=?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare("UPDATE worker_jobs SET status='completed', signature=?, completion_note=?, completed_at=? WHERE id=?")
    .run(signature || '', completion_note || '', now, req.params.jobId);

  const inv = job.invitation_id ? db.prepare('SELECT * FROM worker_invitations WHERE id=?').get(job.invitation_id) : null;
  if (inv) db.prepare("UPDATE worker_invitations SET status='completed' WHERE id=?").run(job.invitation_id);

  // 完工 → 自動寫入專案人工成本（打卡自動），避免重複
  if (inv && inv.project_id && !job.project_cost_id) {
    const worker = db.prepare('SELECT name FROM workers WHERE id=?').get(job.worker_id);
    const amount = inv.offer_price || 0;
    if (amount > 0) {
      const costId = uuidv4();
      db.prepare(`INSERT INTO project_costs (id,project_id,cost_type,subject,task_name,amount,qty,unit_price,worker_name,source,cost_date,description)
        VALUES (?,?,'labor','人工',?,?,1,?,?, 'auto', ?, ?)`)
        .run(costId, inv.project_id, inv.project_name, amount, amount, worker?.name || '', now.slice(0, 10), `完工自動計入：${inv.project_name}`);
      db.prepare('UPDATE worker_jobs SET project_cost_id=? WHERE id=?').run(costId, req.params.jobId);
    }
  }
  res.json({ ok: true });
});

// 某點工在期間內的出勤明細（薪資結算展開用）
router.get('/:id/attendance', (req, res) => {
  const { start, end } = req.query;
  const jobs = db.prepare(`
    SELECT j.id, j.project_name, j.completed_at, i.location, i.offer_price, i.invitation_no
    FROM worker_jobs j LEFT JOIN worker_invitations i ON i.id=j.invitation_id
    WHERE j.worker_id=? AND j.status='completed' AND date(j.completed_at) BETWEEN ? AND ?
    ORDER BY j.completed_at
  `).all(req.params.id, start, end);
  res.json(jobs);
});

// ───── 評價 ─────
router.post('/:id/reviews', (req, res) => {
  const { rating, comment, reviewer_name, invitation_id } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: '評分需 1-5' });
  db.prepare(`INSERT INTO worker_reviews (id,worker_id,invitation_id,rating,comment,reviewer_name) VALUES (?,?,?,?,?,?)`)
    .run(uuidv4(), req.params.id, invitation_id || null, rating, comment || '', reviewer_name || '');
  // 重算平均
  const agg = db.prepare('SELECT AVG(rating) avg, COUNT(*) n FROM worker_reviews WHERE worker_id=?').get(req.params.id);
  db.prepare('UPDATE workers SET rating=?, rating_count=? WHERE id=?').run(Math.round(agg.avg * 10) / 10, agg.n, req.params.id);
  res.json({ ok: true });
});

// 派工行事曆：彙整某點工的時段/邀約/工作（依日期）
router.get('/:id/calendar', (req, res) => {
  const { month } = req.query; // YYYY-MM
  const m = month || dayjs().format('YYYY-MM');
  const start = `${m}-01`;
  const end = dayjs(start).endOf('month').format('YYYY-MM-DD');
  const events = [];

  // 可接案時段（跨日展開為起訖）
  db.prepare('SELECT * FROM worker_slots WHERE worker_id=?').all(req.params.id).forEach(s => {
    const sd = dayjs(s.start_time).format('YYYY-MM-DD');
    const ed = dayjs(s.end_time).format('YYYY-MM-DD');
    if (ed >= start && sd <= end) {
      events.push({ type: 'slot', date: sd < start ? start : sd, end_date: ed > end ? end : ed, status: s.status, title: '可接案', area: s.service_area });
    }
  });
  // 邀約（依需求日期）
  db.prepare('SELECT * FROM worker_invitations WHERE worker_id=? AND work_date BETWEEN ? AND ?').all(req.params.id, start, end).forEach(i => {
    events.push({ type: 'invitation', date: i.work_date, status: i.status, title: i.project_name, area: i.location, price: i.offer_price });
  });
  // 已完工工作（依完工日）
  db.prepare(`SELECT * FROM worker_jobs WHERE worker_id=? AND status='completed' AND date(completed_at) BETWEEN ? AND ?`).all(req.params.id, start, end).forEach(j => {
    events.push({ type: 'job', date: dayjs(j.completed_at).format('YYYY-MM-DD'), status: 'completed', title: j.project_name });
  });

  res.json({ month: m, start, end, events });
});

// 元資料（工種、區域、計價）
router.get('/meta/options', (req, res) => {
  res.json({
    work_types: ['泥作', '木作', '水電', '油漆', '防水', '拆除', '鋪設', '清潔', '板模', '鋼筋', '粗工', '其他'],
    pricing_methods: ['日薪', '點工（半日）', '論件', '議價'],
    cities: Object.keys(CITY_COORDS).filter(c => !c.startsWith('臺')),
  });
});

module.exports = router;
