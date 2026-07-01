const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const config = require('../config');
const { success, fail, asyncHandler } = require('../utils/helpers');
const { auth } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password, password2 } = req.body;
  if (!username || !email || !password || !password2) return fail(res, '请填写完整信息');
  if (password !== password2) return fail(res, '两次密码不一致');
  if (password.length < 6) return fail(res, '密码至少6位');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return fail(res, '用户名只能用字母数字下划线，3-20位');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, '邮箱格式不正确');

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return fail(res, '用户名已被注册');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return fail(res, '邮箱已被注册');

  const hashed = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (username, email, password, balance) VALUES (?, ?, ?, 5)').run(username, email, hashed);
  // 新用户赠送5元
  const token = jwt.sign({ uid: r.lastInsertRowid }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const user = db.prepare('SELECT id, username, email, role, balance FROM users WHERE id = ?').get(r.lastInsertRowid);
  success(res, { token, user }, '注册成功！新用户赠送5元优惠券');
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { account, password } = req.body; // account 可以是用户名或邮箱
  if (!account || !password) return fail(res, '请填写完整信息');
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(account, account);
  if (!user) return fail(res, '账号或密码错误');
  if (user.status === 'banned') return fail(res, '账号已被封禁');
  if (!bcrypt.compareSync(password, user.password)) return fail(res, '账号或密码错误');

  const token = jwt.sign({ uid: user.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const safe = { id: user.id, username: user.username, email: user.email, role: user.role, balance: user.balance };
  success(res, { token, user: safe }, '登录成功！欢迎回来');
}));

// GET /api/auth/me  获取当前用户信息
router.get('/me', auth, asyncHandler(async (req, res) => {
  success(res, req.user);
}));

// PUT /api/auth/password  修改密码
router.put('/password', auth, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return fail(res, '请填写完整信息');
  if (newPassword.length < 6) return fail(res, '新密码至少6位');
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.password)) return fail(res, '原密码错误');
  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashed, req.user.id);
  success(res, null, '密码修改成功');
}));

module.exports = router;
