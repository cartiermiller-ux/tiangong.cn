const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const config = require('./config');

// 确保数据目录存在
const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = require('./config/db');

console.log('📦 初始化数据库:', config.db.path);

// ========== 建表 ==========
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',          -- user | admin
  balance REAL NOT NULL DEFAULT 0,
  avatar TEXT,
  status TEXT NOT NULL DEFAULT 'active',      -- active | banned
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,                     -- account | key | vip | software
  description TEXT NOT NULL,
  price REAL NOT NULL,
  original_price REAL,
  stock INTEGER NOT NULL DEFAULT 0,           -- 可售库存（卡密数量）
  badge TEXT,                                 -- hot | new | vip | null
  image TEXT,
  status TEXT NOT NULL DEFAULT 'active',      -- active | offline
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS card_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  content TEXT NOT NULL,                      -- 卡密内容（账号密码/激活码等）
  status TEXT NOT NULL DEFAULT 'unsold',      -- unsold | sold | locked
  order_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sold_at DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  user_id INTEGER,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  total_amount REAL NOT NULL,
  email TEXT NOT NULL,                        -- 接收卡密的邮箱
  payment_method TEXT NOT NULL,               -- alipay | wechat | balance
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed | refunded
  order_status TEXT NOT NULL DEFAULT 'created',   -- created | paid | delivered | closed | cancelled
  trade_no TEXT,                              -- 支付宝/微信交易号
  pay_url TEXT,                               -- 支付链接/二维码
  paid_at DATETIME,
  delivered_at DATETIME,
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS delivery_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  card_key_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  email TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,            -- 邮件是否发送成功
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (card_key_id) REFERENCES card_keys(id)
);

CREATE INDEX IF NOT EXISTS idx_card_keys_product ON card_keys(product_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status, payment_status);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);
console.log('✅ 表结构创建完成');

// 迁移：添加 detail 列（如果不存在）
try { db.exec('ALTER TABLE products ADD COLUMN detail TEXT'); console.log('✅ 添加 detail 列'); } catch (_) {}

// ========== 种子数据 ==========
// 1. 管理员账号
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get(config.admin.username);
if (!adminExists) {
  const hashed = bcrypt.hashSync(config.admin.password, 10);
  db.prepare(`INSERT INTO users (username, email, password, role, balance) VALUES (?, ?, ?, 'admin', 0)`)
    .run(config.admin.username, config.admin.email, hashed);
  console.log(`✅ 管理员账号已创建: ${config.admin.username} / ${config.admin.password}`);
} else {
  console.log('ℹ️ 管理员账号已存在，跳过');
}

// 2. 商品数据（与前端 12 个商品对应）
const products = [
  { name: 'Netflix 高级会员账号', category: 'account', desc: '4K超清画质，支持4设备同时观看，全球通用，独立账号', price: 29.9, original: 59.9, badge: 'hot', img: 'https://picture-search.tiangong.cn/image/rt/4162e3e826b3edee647e220028fd386f.jpg' },
  { name: 'ChatGPT Plus 订阅', category: 'account', desc: 'GPT-4模型完整访问权限，优先响应，新特性抢先体验', price: 45.0, original: 140.0, badge: 'hot', img: 'https://picture-search.tiangong.cn/image/rt/70853a6c30fbb5833225e7441196700e.jpg' },
  { name: 'Spotify Premium 年卡', category: 'vip', desc: '无广告畅听，离线下载，高音质，全球曲库无限制', price: 39.9, original: 118.0, badge: 'new', img: 'https://picture-search.tiangong.cn/image/rt/2bfc43d82b5e42faa06db3fc1e042838.jpg' },
  { name: 'Windows 11 Pro 激活码', category: 'key', desc: '正版永久激活，支持重装，绑定主板，官方渠道', price: 19.9, original: 99.0, badge: 'hot', img: 'https://picture-search.tiangong.cn/image/rt/80de76985aef1f981b9e2240be7bb46f.jpg' },
  { name: 'Adobe Creative Cloud 全家桶', category: 'software', desc: 'PS/AI/PR/AE等全套软件，正版授权，持续更新', price: 89.0, original: 299.0, badge: 'vip', img: 'https://picture-search.tiangong.cn/image/rt/3cf46dcadd4025c715543e68af8916f0.jpg' },
  { name: 'YouTube Premium 会员', category: 'vip', desc: '无广告观看，后台播放，YouTube Music会员同步', price: 25.0, original: 80.0, badge: 'new', img: 'https://picture-search.tiangong.cn/image/rt/2bfc43d82b5e42faa06db3fc1e042838.jpg' },
  { name: 'Office 365 个人版', category: 'software', desc: 'Word/Excel/PPT全套，1TB OneDrive云存储，5设备', price: 35.0, original: 128.0, badge: 'hot', img: 'https://picture-search.tiangong.cn/image/rt/6cff5db64d86cb7c21f29a8ef8fa028b.jpg' },
  { name: 'Disney+ 高级账号', category: 'account', desc: '漫威/星战/皮克斯独家内容，4K HDR，多设备共享', price: 22.0, original: 70.0, badge: 'new', img: 'https://picture-search.tiangong.cn/image/rt/38891c8a43adc803b60cf7a3b06c0593.jpg' },
  { name: 'Midjourney 订阅服务', category: 'software', desc: 'AI绘画神器，无限生成，商业授权，快速模式', price: 55.0, original: 180.0, badge: 'vip', img: 'https://picture-search.tiangong.cn/image/rt/1e711f8400bb8cb771fc0d1162319fdf.jpg' },
  { name: 'Steam 游戏充值卡', category: 'key', desc: '全球通用Steam钱包充值，即时到账，多面额可选', price: 48.0, original: 50.0, badge: 'hot', img: 'https://picture-search.tiangong.cn/image/rt/93f08ce4874a60bede0622006a79d047.jpg' },
  { name: 'iCloud+ 2TB 空间', category: 'vip', desc: '苹果iCloud扩容，家庭共享，照片备份，设备同步', price: 18.0, original: 68.0, badge: 'new', img: 'https://picture-search.tiangong.cn/image/rt/fb4eb753a8ce3a085bf7cac3e7433e0a.jpg' },
  { name: 'GitHub Copilot 订阅', category: 'software', desc: 'AI编程助手，代码补全，支持VS Code/JetBrains', price: 42.0, original: 120.0, badge: 'vip', img: 'https://picture-search.tiangong.cn/image/rt/97c7d35b0b21470237c76bfa60fb585d.jpg' },
];

const insertProduct = db.prepare(`INSERT INTO products (name, category, description, price, original_price, stock, badge, image, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertCardKey = db.prepare(`INSERT INTO card_keys (product_id, content, status) VALUES (?, ?, 'unsold')`);

const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
if (prodCount === 0) {
  products.forEach((p, i) => {
    const r = insertProduct.run(p.name, p.category, p.desc, p.price, p.original, 10, p.badge, p.img, i + 1);
    // 为每个商品预置 10 个测试卡密
    const pid = r.lastInsertRowid;
    for (let j = 0; j < 10; j++) {
      insertCardKey.run(pid, `TEST-CARDKEY-${pid}-${j + 1}-${Date.now()}`);
    }
  });
  console.log(`✅ 已导入 ${products.length} 个商品，每个预置 10 个测试卡密`);
} else {
  console.log(`ℹ️ 商品数据已存在（${prodCount} 条），跳过`);
}

console.log('\n🎉 数据库初始化完成！');
console.log(`   数据库路径: ${config.db.path}`);
console.log(`   管理员: ${config.admin.username} / ${config.admin.password}`);
db.close();
