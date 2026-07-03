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
app.use('/api/payment', require('./routes/orders')); // mock-pay / alipay/notify
app.use('/api/admin', require('./routes/admin'));

// ============ 健康检查 ============
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

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
