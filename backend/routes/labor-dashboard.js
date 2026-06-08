const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const db = require('../db');

const parseJSON = (s, def) => { try { return JSON.parse(s); } catch { return def; } };

// 台灣縣市座標（與 workers.js 同步,推薦/地圖用）
const CITY_COORDS = {
  '台北市': [25.0330, 121.5654], '新北市': [25.0169, 121.4628], '桃園市': [24.9936, 121.3010],
  '台中市': [24.1477, 120.6736], '台南市': [22.9999, 120.2270], '高雄市': [22.6273, 120.3014],
  '基隆市': [25.1276, 121.7392], '新竹市': [24.8138, 120.9675], '新竹縣': [24.8387, 121.0177],
  '苗栗縣': [24.5602, 120.8214], '彰化縣': [24.0518, 120.5161], '南投縣': [23.9609, 120.9719],
  '雲林縣': [23.7092, 120.4313], '嘉義市': [23.4801, 120.4491], '嘉義縣': [23.4518, 120.2555],
  '屏東縣': [22.5519, 120.5487], '宜蘭縣': [24.7021, 121.7378], '花蓮縣': [23.9871, 121.6015],
  '台東縣': [22.7583, 121.1444], '澎湖縣': [23.5712, 119.5793], '金門縣': [24.4321, 118.3171], '連江縣': [26.1602, 119.9499],
};

// ───── 營運儀表板 ─────
router.get('/', (req, res) => {
  const thisMonth = dayjs().format('YYYY-MM');
  const monthStart = `${thisMonth}-01`;
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');

  // 點工概況
  const workerStats = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='listed' THEN 1 ELSE 0 END) listed FROM workers`).get();

  // 本月媒合漏斗
  const invStats = db.prepare(`
    SELECT COUNT(*) total,
      SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END) accepted,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) rejected
    FROM worker_invitations WHERE date(created_at) BETWEEN ? AND ?
  `).get(monthStart, monthEnd);
  const responded = (invStats.accepted || 0) + (invStats.rejected || 0);
  const acceptRate = responded > 0 ? Math.round((invStats.accepted || 0) / responded * 100) : 0;

  // 本月財務
  const fin = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(amount),0) FROM project_receipts WHERE strftime('%Y-%m',received_date)=?) received,
      (SELECT COALESCE(SUM(amount),0) FROM project_costs WHERE strftime('%Y-%m',cost_date)=?) cost
  `).get(thisMonth, thisMonth);

  // 工種分布
  const workers = db.prepare("SELECT work_types, service_areas FROM workers WHERE status='listed'").all();
  const workTypeCount = {}, areaCount = {};
  workers.forEach(w => {
    parseJSON(w.work_types, []).forEach(t => { workTypeCount[t] = (workTypeCount[t] || 0) + 1; });
    parseJSON(w.service_areas, []).forEach(a => { areaCount[a] = (areaCount[a] || 0) + 1; });
  });
  const topWorkTypes = Object.entries(workTypeCount).map(([k, v]) => ({ name: k, count: v })).sort((a, b) => b.count - a.count).slice(0, 8);
  const topAreas = Object.entries(areaCount).map(([k, v]) => ({ name: k, count: v })).sort((a, b) => b.count - a.count).slice(0, 6);

  // 點工排行（完工數 + 評分）
  const topWorkers = db.prepare(`
    SELECT w.id, w.name, w.rating, w.rating_count,
      (SELECT COUNT(*) FROM worker_jobs j WHERE j.worker_id=w.id AND j.status='completed') as completed_jobs
    FROM workers w ORDER BY completed_jobs DESC, w.rating DESC LIMIT 5
  `).all();

  // 近 7 日媒合趨勢
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
    const row = db.prepare(`
      SELECT COUNT(*) invitations, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed
      FROM worker_invitations WHERE date(created_at)=?
    `).get(d);
    trend.push({ date: d, label: dayjs(d).format('MM/DD'), invitations: row.invitations || 0, completed: row.completed || 0 });
  }

  // 待辦提醒
  const pendingInv = db.prepare("SELECT COUNT(*) n FROM worker_invitations WHERE status='pending'").get().n;
  const activeJobs = db.prepare("SELECT COUNT(*) n FROM worker_jobs WHERE status='in_progress'").get().n;

  res.json({
    workers: { total: workerStats.total || 0, listed: workerStats.listed || 0 },
    matching: { invitations: invStats.total || 0, accepted: invStats.accepted || 0, completed: invStats.completed || 0, accept_rate: acceptRate },
    finance: { received: fin.received || 0, cost: fin.cost || 0, profit: (fin.received || 0) - (fin.cost || 0) },
    top_work_types: topWorkTypes,
    top_areas: topAreas,
    top_workers: topWorkers,
    trend,
    todos: { pending_invitations: pendingInv, active_jobs: activeJobs },
    month: thisMonth,
  });
});

// ───── 智慧媒合推薦 ─────
// 依工種/區域/日期/預算 為發案方推薦最適點工
router.get('/recommend', (req, res) => {
  const { work_type, city, date, budget } = req.query;
  const workers = db.prepare("SELECT * FROM workers WHERE status='listed'").all();

  const scored = workers.map(w => {
    const wt = parseJSON(w.work_types, []);
    const sa = parseJSON(w.service_areas, []);
    let score = 0;
    const reasons = [];

    // 工種匹配 (40)
    if (work_type) {
      if (wt.includes(work_type)) { score += 40; reasons.push(`工種符合：${work_type}`); }
    } else { score += 20; }

    // 區域匹配 (25)
    if (city) {
      if (sa.includes(city)) { score += 25; reasons.push(`服務區域涵蓋：${city}`); }
    } else { score += 12; }

    // 當日可接案 (20)
    if (date) {
      const slot = db.prepare(`SELECT COUNT(*) n FROM worker_slots WHERE worker_id=? AND status='available' AND date(start_time)<=? AND date(end_time)>=?`).get(w.id, date, date);
      if (slot.n > 0) { score += 20; reasons.push('該日有可接案時段'); }
    } else { score += 10; }

    // 評分 (10)
    score += Math.round((w.rating || 0) / 5 * 10);
    if (w.rating_count > 0) reasons.push(`評分 ${w.rating}（${w.rating_count} 則）`);

    // 預算匹配 (5)
    if (budget) {
      if ((w.price_min || 0) <= parseFloat(budget)) { score += 5; reasons.push('價格符合預算'); }
    } else { score += 3; }

    // 完工經驗加成
    const completed = db.prepare("SELECT COUNT(*) n FROM worker_jobs WHERE worker_id=? AND status='completed'").get(w.id).n;
    if (completed >= 5) { score += 5; reasons.push(`完工經驗 ${completed} 件`); }

    return {
      id: w.id, name: w.name, intro: w.intro,
      work_types: wt, service_areas: sa,
      pricing_method: w.pricing_method, price_min: w.price_min, price_max: w.price_max,
      rating: w.rating, rating_count: w.rating_count, phone: w.phone,
      completed_jobs: completed,
      score: Math.min(100, score),
      reasons,
    };
  }).sort((a, b) => b.score - a.score);

  res.json({ criteria: { work_type, city, date, budget }, recommendations: scored.slice(0, 10) });
});

// ───── 出勤報表 ─────
router.get('/attendance', (req, res) => {
  const start = req.query.start || dayjs().startOf('month').format('YYYY-MM-DD');
  const end = req.query.end || dayjs().endOf('month').format('YYYY-MM-DD');

  const jobs = db.prepare(`
    SELECT j.id, j.worker_id, w.name as worker_name, w.skill_level,
      j.project_name, j.completed_at, i.location, i.city, i.offer_price, i.invitation_no
    FROM worker_jobs j
    LEFT JOIN workers w ON w.id=j.worker_id
    LEFT JOIN worker_invitations i ON i.id=j.invitation_id
    WHERE j.status='completed' AND date(j.completed_at) BETWEEN ? AND ?
    ORDER BY j.completed_at DESC
  `).all(start, end);

  // 依點工彙總
  const byWorker = {};
  jobs.forEach(j => {
    if (!byWorker[j.worker_id]) byWorker[j.worker_id] = { worker_id: j.worker_id, worker_name: j.worker_name, skill_level: j.skill_level, days: 0, income: 0, jobs: [] };
    byWorker[j.worker_id].days++;
    byWorker[j.worker_id].income += j.offer_price || 0;
    byWorker[j.worker_id].jobs.push(j);
  });

  res.json({
    start, end,
    total_days: jobs.length,
    total_income: jobs.reduce((s, j) => s + (j.offer_price || 0), 0),
    by_worker: Object.values(byWorker).sort((a, b) => b.days - a.days),
    records: jobs,
  });
});

module.exports = router;
