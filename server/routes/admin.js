const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { success, fail, asyncHandler } = require('../utils/helpers');
const { auth, adminOnly } = require('../middleware/auth');

// 所有接口均需管理员权限
router.use(auth, adminOnly);

// GET /api/admin/dashboard  概览数据
router.get('/dashboard', asyncHandler(async (req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    products: db.prepare("SELECT COUNT(*) AS c FROM products WHERE status='active'").get().c,
    orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
    paidOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE payment_status='paid'").get().c,
    revenue: db.prepare("SELECT COALESCE(SUM(total_amount),0) AS s FROM orders WHERE payment_status='paid'").get().s,
    pendingCards: db.prepare("SELECT COUNT(*) AS c FROM card_keys WHERE status='unsold'").get().c,
    soldCards: db.prepare("SELECT COUNT(*) AS c FROM card_keys WHERE status='sold'").get().c,
  };
  success(res, stats);
}));

// GET /api/admin/orders  订单列表（分页）
router.get('/orders', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 20));
  const offset = (page - 1) * size;
  const total = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const list = db.prepare(`SELECT o.*, p.name AS product_name, u.username FROM orders o
    JOIN products p ON o.product_id = p.id LEFT JOIN users u ON o.user_id = u.id
    ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(size, offset);
  success(res, { list, total, page, size });
}));

// GET /api/admin/users  用户列表
router.get('/users', asyncHandler(async (req, res) => {
  const list = db.prepare('SELECT id, username, email, role, balance, status, created_at FROM users ORDER BY id DESC').all();
  success(res, list);
}));

// PUT /api/admin/users/:id/ban  封禁/解封用户
router.put('/users/:id/ban', asyncHandler(async (req, res) => {
  const { status } = req.body; // active | banned
  db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  success(res, null, status === 'banned' ? '已封禁用户' : '已解封用户');
}));

// GET /api/admin/cards  卡密列表（按商品）
router.get('/cards', asyncHandler(async (req, res) => {
  const { productId } = req.query;
  let sql = `SELECT ck.id, ck.content, ck.status, ck.created_at, ck.sold_at, p.name AS product_name
    FROM card_keys ck JOIN products p ON ck.product_id = p.id`;
  const params = [];
  if (productId) { sql += ' WHERE ck.product_id = ?'; params.push(productId); }
  sql += ' ORDER BY ck.id DESC LIMIT 200';
  const list = db.prepare(sql).all(...params);
  success(res, list);
}));

module.exports = router;
