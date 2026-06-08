const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');

// 取得技能矩陣（所有師傅 × 機台/產品）
router.get('/', (req, res) => {
  const skills = db.prepare(`
    SELECT os.*, m.name as machine_name, m.code as machine_code, p.name as product_name, p.code as product_code
    FROM operator_skills os
    LEFT JOIN machines m ON m.id=os.machine_id
    LEFT JOIN products p ON p.id=os.product_id
    ORDER BY os.operator, m.code, p.code
  `).all();

  // 所有有回報記錄的師傅
  const operators = db.prepare(`SELECT DISTINCT operator FROM progress_logs WHERE operator != '' ORDER BY operator`).all().map(r => r.operator);

  res.json({ skills, operators });
});

// 取得特定師傅的技能
router.get('/:operator', (req, res) => {
  const skills = db.prepare(`
    SELECT os.*, m.name as machine_name, m.code as machine_code, p.name as product_name, p.code as product_code
    FROM operator_skills os
    LEFT JOIN machines m ON m.id=os.machine_id
    LEFT JOIN products p ON p.id=os.product_id
    WHERE os.operator=?
    ORDER BY os.certified DESC, m.code, p.code
  `).all(req.params.operator);

  // 此師傅歷史產量（從 progress_logs 自動分析）
  const history = db.prepare(`
    SELECT wo.product_name, wo.product_code, wo.machine_name,
      COUNT(*) as log_count, SUM(pl.qty) as total_qty, SUM(pl.defect_qty) as total_defect
    FROM progress_logs pl
    JOIN work_orders wo ON wo.id=pl.work_order_id
    WHERE pl.operator=? GROUP BY wo.product_code, wo.machine_name ORDER BY total_qty DESC
  `).all(req.params.operator);

  res.json({ skills, history, operator: req.params.operator });
});

router.post('/', (req, res) => {
  const { operator, machine_id, product_id, skill_level, certified, note } = req.body;
  if (!operator) return res.status(400).json({ error: '師傅姓名為必填' });
  const id = uuidv4();
  const now = dayjs().format('YYYY-MM-DD');
  db.prepare(`INSERT OR REPLACE INTO operator_skills (id,operator,machine_id,product_id,skill_level,certified,certified_at,note)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, operator, machine_id || null, product_id || null, skill_level || 1, certified ? 1 : 0, certified ? now : null, note || '');
  res.json({ ok: true, id });
});

router.patch('/:id', (req, res) => {
  const { skill_level, certified, note } = req.body;
  const now = dayjs().format('YYYY-MM-DD');
  db.prepare('UPDATE operator_skills SET skill_level=COALESCE(?,skill_level), certified=COALESCE(?,certified), certified_at=CASE WHEN ?=1 THEN ? ELSE certified_at END, note=COALESCE(?,note) WHERE id=?')
    .run(skill_level, certified !== undefined ? (certified ? 1 : 0) : null, certified ? 1 : 0, now, note, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM operator_skills WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 自動從歷史 progress_logs 建議可以認證的師傅-機台/產品
router.get('/suggest/auto', (req, res) => {
  const suggestions = db.prepare(`
    SELECT pl.operator, wo.machine_id, wo.machine_name, wo.product_id, wo.product_name,
      COUNT(*) as log_count, SUM(pl.qty) as total_qty,
      ROUND(SUM(pl.qty)*100.0/(SUM(pl.qty)+SUM(pl.defect_qty)+0.001),1) as yield_rate
    FROM progress_logs pl
    JOIN work_orders wo ON wo.id=pl.work_order_id
    WHERE pl.operator != '' AND wo.machine_id IS NOT NULL
    GROUP BY pl.operator, wo.machine_id, wo.product_id
    HAVING total_qty >= 50
    ORDER BY pl.operator, total_qty DESC
  `).all();

  // 過濾已有紀錄的
  const existing = new Set(
    db.prepare('SELECT operator||\'|\'+COALESCE(machine_id,\'\')+\'|\'+COALESCE(product_id,\'\') as key FROM operator_skills').all().map(r => r.key)
  );
  const newSuggestions = suggestions.filter(s => !existing.has(`${s.operator}|${s.machine_id || ''}|${s.product_id || ''}`));
  res.json(newSuggestions);
});

module.exports = router;
