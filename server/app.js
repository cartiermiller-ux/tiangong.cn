require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { fail } = require('./utils/helpers');

const app = express();

// ============ 中间件 ============
app.use(cors({
  origin: config.frontendUrl === '*' ? true : (config.frontendUrl ? config.frontendUrl.split(',') : false),
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, _res, next) => {
  if (!req.path.startsWith('/api/payment/mock-pay')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ============ 路由挂载 ============
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/admin', require('./routes/admin'));

// ============ 健康检查 ============
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ============ 公开设置（前端获取收款码等） ============
const settingsDb = require('./config/db');
app.get('/api/settings', (_req, res) => {
  const rows = settingsDb.prepare('SELECT key, value FROM settings').all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  res.json({ code: 0, data: {
    alipay_qr: s.alipay_qr || '',
    wechat_qr: s.wechat_qr || '',
    usdt_qr: s.usdt_qr || '',
    usdt_address: s.usdt_address || '',
    customer_qq: s.customer_qq || '834430381',
    customer_tg: s.customer_tg || '@asd666077',
    customer_wx: s.customer_wx || 'asd666077',
    announcement: s.announcement || '欢迎来到阿凡达在海上，数字商品自动发卡平台。购买后即时交付，如有问题请联系在线客服。',
  }});
});

// ============ 静态前端（可选：把 index.html 放到 ../public 由后端托管） ============
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'), err => err && next());
});

// ============ 后台任务：30 分钟超时自动关闭未支付订单 ============
const orderDb = require('./config/db');
const closeExpiredOrders = () => {
  try {
    const result = orderDb.prepare(`UPDATE orders SET order_status = 'closed', updated_at = CURRENT_TIMESTAMP
      WHERE payment_status = 'pending' AND order_status = 'created'
        AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`).run();
    if (result.changes > 0) {
      console.log(`[scheduler] 已自动关闭 ${result.changes} 个超时未支付订单`);
    }
  } catch (e) {
    console.error('[scheduler] 关闭过期订单失败:', e.message);
  }
};
// 启动时立即扫一次 + 每 60s 扫一次
closeExpiredOrders();
const EXPIRE_TIMER = setInterval(closeExpiredOrders, 60 * 1000);
process.on('SIGTERM', () => clearInterval(EXPIRE_TIMER));
process.on('SIGINT', () => clearInterval(EXPIRE_TIMER));

// ============ 404 ============
app.use((req, res) => fail(res, '接口不存在: ' + req.path, 404, 404));

// ============ 全局错误处理 ============
app.use((err, _req, res, _next) => {
  console.error('❌ 服务器错误:', err);
  fail(res, err.message || '服务器内部错误', 500, 500);
});

// ============ 启动 ============
const PORT = config.port;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🌊 阿凡达在海上 - 后端服务已启动        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║   端口: ${PORT}                              `.padEnd(44) + '║');
  console.log(`║   健康检查: http://localhost:${PORT}/api/health`);
  console.log(`║   前端托管: ${publicDir}`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
