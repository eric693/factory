const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'factoryos-secret-2026';

const ROLES = {
  admin: { label: '管理員', level: 4 },
  boss: { label: '老闆', level: 3 },
  manager: { label: '廠長', level: 2 },
  sales: { label: '業務', level: 1 },
  worker: { label: '師傅', level: 0 },
};

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: '請先登入' });
  const token = header.replace('Bearer ', '');
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Token 無效或已過期' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未授權' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: '權限不足' });
    next();
  };
}

function seedAdminUser() {
  const existing = db.prepare('SELECT id FROM users WHERE username=?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    const { v4: uuidv4 } = require('uuid');
    db.prepare('INSERT INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(), 'admin', '管理員', hash, 'admin');
    db.prepare('INSERT OR IGNORE INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(), 'boss', '老闆', bcrypt.hashSync('boss123', 10), 'boss');
    db.prepare('INSERT OR IGNORE INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(), 'manager', '王廠長', bcrypt.hashSync('manager123', 10), 'manager');
    db.prepare('INSERT OR IGNORE INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(), 'sales', '李業務', bcrypt.hashSync('sales123', 10), 'sales');
    db.prepare('INSERT OR IGNORE INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(), 'worker', '張師傅', bcrypt.hashSync('worker123', 10), 'worker');
    console.log('Demo users seeded: admin/admin123, boss/boss123, manager/manager123, sales/sales123, worker/worker123');
  }
}

module.exports = { generateToken, verifyToken, authMiddleware, requireRole, seedAdminUser, bcrypt, SECRET, ROLES };
