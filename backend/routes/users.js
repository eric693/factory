const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { generateToken, authMiddleware, requireRole, bcrypt, ROLES } = require('../auth');

// 登入
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }
  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

// 取得自己的資訊
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id,username,name,role,created_at FROM users WHERE id=?').get(req.user.id);
  res.json(user);
});

// 使用者列表（admin only）
router.get('/', authMiddleware, requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT id,username,name,role,is_active,created_at FROM users ORDER BY role,name').all());
});

// 新增使用者
router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const { username, name, password, role } = req.body;
  if (!ROLES[role]) return res.status(400).json({ error: '無效角色' });
  const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (existing) return res.status(400).json({ error: '帳號已存在' });
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)').run(id, username, name, hash, role);
  res.json({ ok: true, id });
});

// 修改密碼
router.patch('/:id/password', authMiddleware, (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '只能修改自己的密碼' });
  }
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: '密碼至少 6 個字元' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ ok: true });
});

// 停用/啟用
router.patch('/:id/toggle', authMiddleware, requireRole('admin'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE users SET is_active=? WHERE id=?').run(user.is_active ? 0 : 1, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
