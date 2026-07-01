# 阿凡达在海上 - 后端部署文档

## 📋 系统要求

- Node.js >= 22.0（使用内置 `node:sqlite` 模块，无需编译原生依赖）
- npm 或 pnpm
- 服务器端口 3000（可自定义）

## 🚀 快速启动

### 方式一：一键脚本

```bash
chmod +x start.sh
./start.sh
```

脚本会自动完成：检查 .env → 安装依赖 → 初始化数据库 → 启动服务。

### 方式二：手动启动

```bash
cd server

# 1. 创建配置文件
cp .env.example .env
# 编辑 .env，至少修改 JWT_SECRET

# 2. 安装依赖
npm install --registry=https://registry.npmmirror.com

# 3. 初始化数据库（创建表 + 种子数据）
node --experimental-sqlite init-db.js

# 4. 启动服务
npm start
# 或开发模式（文件改动自动重启）
npm run dev
```

启动后访问 `http://localhost:3000/api/health` 确认服务正常。

### 方式三：Docker 部署

```bash
# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

## ⚙️ 环境变量配置（.env）

| 变量 | 说明 | 示例 |
|------|------|------|
| `PORT` | 服务端口 | `3000` |
| `JWT_SECRET` | JWT签名密钥（**必须修改**） | `your_random_secret_32chars` |
| `JWT_EXPIRES` | Token有效期 | `7d` |
| `FRONTEND_URL` | 前端地址（CORS白名单） | `https://yourdomain.com` |
| `DB_PATH` | 数据库文件路径 | `./data/shop.db` |
| `SMTP_HOST` | 邮件服务器 | `smtp.qq.com` |
| `SMTP_PORT` | 邮件端口 | `465` |
| `SMTP_SECURE` | 是否SSL | `true` |
| `SMTP_USER` | 邮箱账号 | `noreply@yourdomain.com` |
| `SMTP_PASS` | 邮箱授权码 | `your_auth_code` |
| `SMTP_FROM` | 发件人地址 | `阿凡达在海上 <noreply@yourdomain.com>` |
| `ALIPAY_APP_ID` | 支付宝应用ID | `2021xxxx` |
| `ALIPAY_APP_PRIVATE_KEY` | 应用私钥 | `MIIEvQIB...` |
| `ALIPAY_ALIPAY_PUBLIC_KEY` | 支付宝公钥 | `MIIBIjAN...` |
| `ALIPAY_NOTIFY_URL` | 异步回调地址 | `https://api.yourdomain.com/api/payment/alipay/notify` |
| `ALIPAY_SANDBOX` | 沙箱模式 | `false` |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `your_secure_password` |

## 🔑 支付配置

### 支付宝当面付

1. 登录 [支付宝开放平台](https://open.alipay.com/)
2. 创建「网页&移动应用」→ 获取 App ID
3. 下载「支付宝密钥生成器」生成 RSA2 密钥对
4. 上传「应用公钥」到支付宝，获取「支付宝公钥」
5. 在 `.env` 中填写：
   - `ALIPAY_APP_ID` = 应用App ID
   - `ALIPAY_APP_PRIVATE_KEY` = 应用私钥
   - `ALIPAY_ALIPAY_PUBLIC_KEY` = 支付宝公钥
   - `ALIPAY_NOTIFY_URL` = `https://你的域名/api/payment/alipay/notify`

> ⚠️ 未配置支付宝时，系统自动使用**模拟支付**流程（仅用于测试）。

### 微信支付

微信支付需配置商户号、API密钥等，当前为简化集成，未配置时同样回退到模拟支付。

## 📧 邮件配置（QQ邮箱示例）

1. 登录 QQ邮箱 → 设置 → 账户
2. 开启 `IMAP/SMTP` 服务
3. 生成「授权码」
4. 在 `.env` 中填写：
   ```
   SMTP_HOST=smtp.qq.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=your_qq@qq.com
   SMTP_PASS=授权码
   SMTP_FROM=阿凡达在海上 <your_qq@qq.com>
   ```

> 未配置 SMTP 时，卡密会打印到服务器控制台（不发送邮件）。

## 🌐 前端 API 地址配置

前端 `index.html` 顶部有：
```javascript
const API_BASE = window.API_BASE || 'http://localhost:3000/api';
```

**生产部署时**，在 `index.html` 的 `<script>` 标签前加一行：
```html
<script>window.API_BASE = 'https://api.yourdomain.com/api';</script>
```

或通过 Nginx 反向代理统一域名：
```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3000/api/;
}
```
这样前端 `API_BASE` 可保持 `/api` 相对路径。

## 📁 项目结构

```
avatar_sea_shop/
├── index.html              # 前端页面（自包含）
├── DEPLOY.md               # 前端部署文档
├── BACKEND_DEPLOY.md       # 本文档
├── start.sh                # 一键启动脚本
├── Dockerfile              # Docker 镜像配置
├── docker-compose.yml      # Docker Compose 编排
├── .dockerignore
└── server/                 # 后端代码
    ├── app.js              # 主入口
    ├── init-db.js          # 数据库初始化
    ├── package.json
    ├── .env.example        # 环境变量模板
    ├── config/
    │   ├── index.js        # 配置加载
    │   └── db.js           # SQLite 连接
    ├── middleware/
    │   └── auth.js         # JWT 鉴权中间件
    ├── routes/
    │   ├── auth.js         # 用户认证
    │   ├── products.js     # 商品管理
    │   ├── orders.js       # 订单与支付
    │   └── admin.js        # 管理后台
    ├── emails/
    │   └── mailer.js       # 邮件发货
    ├── utils/
    │   └── helpers.js      # 工具函数
    ├── public/             # 前端静态文件（后端托管）
    │   └── index.html
    └── data/               # 数据库文件（自动创建）
        └── shop.db
```

## 📡 API 接口一览

### 公开接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/products` | 商品列表（支持 category/search 参数）|
| GET | `/api/products/:id` | 商品详情 |
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/orders` | 创建订单 |
| GET | `/api/orders/:orderNo` | 查询订单状态 |
| GET | `/api/payment/mock-pay` | 模拟支付页（测试用）|
| POST | `/api/payment/mock-pay-callback` | 模拟支付回调 |
| POST | `/api/payment/alipay/notify` | 支付宝异步回调 |

### 需登录接口（Header: `Authorization: Bearer <token>`）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/me` | 获取当前用户 |
| PUT | `/api/auth/password` | 修改密码 |
| GET | `/api/orders/my/list` | 我的订单 |

### 管理员接口（需 admin 角色）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/dashboard` | 概览统计 |
| GET | `/api/admin/orders` | 订单列表 |
| GET | `/api/admin/users` | 用户列表 |
| PUT | `/api/admin/users/:id/ban` | 封禁/解封 |
| GET | `/api/admin/cards` | 卡密列表 |
| POST | `/api/products` | 新增商品 |
| PUT | `/api/products/:id` | 编辑商品 |
| DELETE | `/api/products/:id` | 下架商品 |
| POST | `/api/products/:id/cards` | 批量导入卡密 |

## 🧪 测试流程

```bash
# 1. 启动后端
cd server && npm start

# 2. 健康检查
curl http://localhost:3000/api/health

# 3. 获取商品
curl http://localhost:3000/api/products

# 4. 管理员登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"account":"admin","password":"admin123456"}'

# 5. 创建订单（模拟支付）
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"productId":1,"quantity":1,"email":"test@test.com","paymentMethod":"alipay"}'
# → 返回 payUrl，浏览器打开模拟支付 → 回调 → 自动发卡

# 6. 查询订单（支付后返回卡密）
curl http://localhost:3000/api/orders/AS20260701xxxxx
```

## 🔒 安全注意事项

1. **务必修改 JWT_SECRET** — 使用 32+ 位随机字符串
2. **修改管理员密码** — 默认 `admin123456` 仅供测试
3. **配置 HTTPS** — 生产环境必须使用 SSL
4. **限制 CORS** — `FRONTEND_URL` 设为你的真实域名
5. **数据库备份** — 定期备份 `data/shop.db`
6. **支付宝密钥安全** — 私钥不要提交到 Git

## ❓ 常见问题

| 问题 | 解决方案 |
|------|---------|
| `node:sqlite` 实验性警告 | 正常现象，不影响使用。Node 22 内置 SQLite |
| 邮件发送失败 | 检查 SMTP 配置、邮箱授权码是否正确 |
| 支付宝回调验签失败 | 确认公钥/私钥配对，notify_url 可公网访问 |
| 前端跨域错误 | 检查 `.env` 的 `FRONTEND_URL` 是否包含前端域名 |
| 库存不足 | 管理员后台导入更多卡密 |
| `db.transaction is not a function` | 已修复，确保使用最新 `config/db.js` |
