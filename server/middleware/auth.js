const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/db');
const { fail } = require('../utils/helpers');

// 验证 JWT，将 user 挂载到 req.user
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return fail(res, '未登录或登录已过期', 401, 401);
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    const user = db.prepare('SELECT id, username, email, role, balance, status FROM users WHERE id = ?').get(payload.uid);
    if (!user) return fail(res, '用户不存在', 401, 401);
    if (user.status === 'banned') return fail(res, '账号已被封禁', 403, 403);
    req.user = user;
    next();
  } catch (e) {
    return fail(res, '登录已过期，请重新登录', 401, 401);
  }
}

// 可选鉴权：有 token 则解析，无 token 也放行（游客可浏览商品）
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.jwt.secret);
      const user = db.prepare('SELECT id, username, email, role, balance, status FROM users WHERE id = ?').get(payload.uid);
      if (user && user.status !== 'banned') req.user = user;
    } catch (e) { /* ignore */ }
  }
  next();
}

// 管理员鉴权
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return fail(res, '无权限，仅管理员可访问', 403, 403);
  }
  next();
}

module.exports = { auth, optionalAuth, adminOnly };
