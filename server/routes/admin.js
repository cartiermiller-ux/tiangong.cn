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

// PUT /api/admin/orders/:id/confirm  管理员手动确认支付并发货
router.put('/orders/:id/confirm', asyncHandler(async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return fail(res, '订单不存在', 404, 404);
  if (order.payment_status === 'paid') return fail(res, '订单已确认过');
  if (order.order_status === 'closed') return fail(res, '订单已关闭（超时或取消）');
  if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    db.prepare("UPDATE orders SET order_status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
    return fail(res, '订单已过期，无法确认');
  }

  // 标记为已支付
  db.prepare("UPDATE orders SET payment_status = 'paid', order_status = 'paid', trade_no = ?, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run('MANUAL_' + Date.now(), order.id);

  // 自动发卡
  const cards = db.prepare("SELECT id, content FROM card_keys WHERE product_id = ? AND status = 'unsold' LIMIT ?")
    .all(order.product_id, order.quantity);
  if (cards.length < order.quantity) return fail(res, '库存不足，无法发货');

  const updateCard = db.prepare("UPDATE card_keys SET status = 'sold', order_id = ?, sold_at = CURRENT_TIMESTAMP WHERE id = ?");
  const insertDelivery = db.prepare("INSERT INTO delivery_records (order_id, card_key_id, content, email) VALUES (?, ?, ?, ?)");
  const tx = db.transaction(() => {
    for (const c of cards) {
      updateCard.run(order.id, c.id);
      insertDelivery.run(order.id, c.id, c.content, order.email);
    }
    const stock = db.prepare("SELECT COUNT(*) AS c FROM card_keys WHERE product_id = ? AND status = 'unsold'").get(order.product_id).c;
    db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(stock, order.product_id);
    db.prepare("UPDATE orders SET order_status = 'delivered', delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
  });
  tx();

  // 异步发邮件
  const product = db.prepare('SELECT name FROM products WHERE id = ?').get(order.product_id);
  try {
    const { sendCardDeliveryEmail } = require('../emails/mailer');
    sendCardDeliveryEmail(order.email, order.order_no, product.name, cards.map(c => c.content)).catch(e => console.error('邮件发送失败:', e.message));
  } catch (_) {}

  success(res, null, '已确认支付并发货');
}));

// GET /api/admin/cards  密钥列表（按商品）
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

// GET /api/admin/settings  获取所有设置项
router.get('/settings', asyncHandler(async (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  // smtp_pass 不回传明文，用 configured 标志告诉前端是否已配置
  success(res, {
    alipay_qr: settings.alipay_qr || '',
    wechat_qr: settings.wechat_qr || '',
    usdt_qr: settings.usdt_qr || '',
    usdt_address: settings.usdt_address || '',
    customer_qq: settings.customer_qq || '834430381',
    customer_tg: settings.customer_tg || '@asd666077',
    customer_wx: settings.customer_wx || 'asd666077',
    announcement: settings.announcement || '欢迎来到阿凡达在海上，数字商品自动发卡平台。购买后即时交付，如有问题请联系在线客服。',
    smtp_host: settings.smtp_host || '',
    smtp_port: settings.smtp_port || '',
    smtp_user: settings.smtp_user || '',
    smtp_pass: settings.smtp_pass ? '********' : '',   // 不回传明文
    smtp_from: settings.smtp_from || '',
    smtp_configured: !!(settings.smtp_host && settings.smtp_user && settings.smtp_pass),
  });
}));

// PUT /api/admin/settings  批量更新设置
router.put('/settings', asyncHandler(async (req, res) => {
  const upsert = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`);
  const keys = ['alipay_qr', 'wechat_qr', 'usdt_qr', 'usdt_address', 'customer_qq', 'customer_tg', 'customer_wx', 'announcement',
                'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'];
  let smtpChanged = false;
  const tx = db.transaction(() => {
    for (const k of keys) {
      if (req.body[k] !== undefined) {
        // 密码字段占位符不覆盖（前端回传 ******** 表示未修改）
        if (k === 'smtp_pass' && req.body[k] === '********') continue;
        upsert.run(k, String(req.body[k]));
        if (k.startsWith('smtp_')) smtpChanged = true;
      }
    }
  });
  tx();
  // SMTP 变更后强制刷新 transporter，下次发邮件用新配置
  if (smtpChanged) {
    try { require('../emails/mailer').resetTransporter(); } catch (_) {}
  }
  success(res, null, '设置已保存');
}));

// POST /api/admin/test-email  发送测试邮件
router.post('/test-email', asyncHandler(async (req, res) => {
  const { to } = req.body;
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return fail(res, '请输入有效的测试收件邮箱');
  const { sendTestEmail } = require('../emails/mailer');
  try {
    const messageId = await sendTestEmail(to);
    success(res, { messageId }, '测试邮件已发送');
  } catch (e) {
    fail(res, '发送失败: ' + (e.message || e), 500, 500);
  }
}));

// POST /api/admin/upload  上传图片（收款码等）
const multer = require('multer');
const path = require('path');
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, ''))
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('只能上传图片或视频文件'));
  }
});
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, '未上传文件');
  const url = '/uploads/' + req.file.filename;
  success(res, { url }, '上传成功');
}));

module.exports = router;
