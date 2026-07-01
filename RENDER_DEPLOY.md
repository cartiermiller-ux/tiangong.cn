# Render.com 部署指南

> 阿凡达在海上 - 数字商品发卡平台后端 Render 部署文档

## 📋 关于 Render 免费计划

| 项目 | 免费计划 (Free) | Starter 计划 ($7/月) |
|------|:---:|:---:|
| 运行时长 | 750 小时/月 | 无限 |
| 内存 | 512MB | 512MB |
| 休眠 | ⚠️ 15分钟无访问自动休眠 | 不休眠 |
| 冷启动 | 休眠后首次访问需 ~30秒 | 无冷启动 |
| 持久磁盘 | ❌ 不支持 | ✅ $0.25/GB/月 |
| 自定义域名 | ❌ | ✅ |

> ⚠️ **免费计划限制**：每次重新部署（git push）后 SQLite 数据库会被重置。如果需要数据持久化，建议升级到 Starter 计划（$7/月）并挂载磁盘。

---

## 🚀 部署步骤

### 方法一：Blueprint 自动部署（推荐）

1. 登录 https://dashboard.render.com
2. 点击 **New +** → **Blueprint**
3. 选择 GitHub 仓库 `cartiermiller-ux/tiangong.cn`
4. Render 会自动检测到 `render.yaml` 配置文件
5. 确认配置后点击 **Apply**
6. Render 自动构建和部署

### 方法二：手动创建 Web Service

1. 登录 https://dashboard.render.com
2. 点击 **New +** → **Web Service**
3. 连接 GitHub 仓库 `cartiermiller-ux/tiangong.cn`
4. 填写以下配置：

| 配置项 | 值 |
|--------|-----|
| Name | `avatar-sea-shop` |
| Runtime | `Node` |
| Region | `Singapore` (离中国最近) |
| Branch | `main` |
| Root Directory | `.` (留空或填 `.`) |
| Build Command | `cd server && npm install` |
| Start Command | `bash render-start.sh` |
| Instance Type | `Free` |

5. 添加环境变量（见下方）
6. 点击 **Create Web Service**

---

## 🔧 环境变量配置

在 Render 的 **Environment** 标签页添加：

### 必填项

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NODE_VERSION` | `22.0.0` | ⚠️ 必须指定 Node 22，否则 node:sqlite 不可用 |
| `NODE_ENV` | `production` | 生产环境 |
| `DB_PATH` | `/opt/render/project/src/data/shop.db` | 数据库文件路径 |
| `JWT_SECRET` | `你的随机密钥` | 32位以上随机字符串 |
| `FRONTEND_URL` | `https://skyagent-artifacts.tiangong.cn` | 前端地址（CORS） |

### 管理员（首次初始化）

| 变量名 | 默认值 |
|--------|--------|
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | `admin123456` |
| `ADMIN_EMAIL` | `admin@example.com` |

### SMTP 邮件（可选）

| 变量名 | 说明 |
|--------|------|
| `SMTP_HOST` | `smtp.qq.com` 等 |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | 发件邮箱 |
| `SMTP_PASS` | 邮箱授权码 |
| `SMTP_FROM` | 发件人显示名 |

### 支付宝（可选，不配则用模拟支付）

| 变量名 | 说明 |
|--------|------|
| `ALIPAY_APP_ID` | 应用 ID |
| `ALIPAY_APP_PRIVATE_KEY` | 应用私钥 |
| `ALIPAY_ALIPAY_PUBLIC_KEY` | 支付宝公钥 |
| `ALIPAY_NOTIFY_URL` | 部署后填入 Render 域名 |
| `ALIPAY_SANDBOX` | `true` 沙箱 |

---

## 📦 持久磁盘配置（推荐）

> 免费计划不支持磁盘。如需数据持久化，升级到 Starter 计划后操作：

1. 在 Render 控制台进入你的 Web Service
2. 点击 **Settings** → **Disks**
3. 点击 **Add Disk**
4. 填写：
   - Name: `shop-data`
   - Mount Path: `/data`
   - Size: `1` GB
5. 修改环境变量 `DB_PATH` 为 `/data/shop.db`
6. 保存并重新部署

---

## ✅ 部署后验证

Render 会分配一个域名，如 `avatar-sea-shop.onrender.com`

### 1. 健康检查
```
https://avatar-sea-shop.onrender.com/api/health
```
应返回 `{"ok":true,"time":"..."}`

### 2. 获取商品列表
```
https://avatar-sea-shop.onrender.com/api/products
```

### 3. 管理员登录
```bash
curl -X POST https://avatar-sea-shop.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"account":"admin","password":"admin123456"}'
```

### 4. 更新前端 API 地址
拿到 Render 域名后，修改前端 `index.html` 中的 `API_BASE`：
```javascript
const API_BASE = 'https://avatar-sea-shop.onrender.com/api';
```

---

## ❓ 常见问题

### Q: 免费计划数据库会丢失吗？
A: 是的。免费计划每次重新部署（git push）会重置文件系统。运行期间数据正常保留，但重新部署后丢失。解决方案：升级 Starter 计划 + 挂载磁盘，或使用外部数据库。

### Q: 冷启动很慢怎么办？
A: 免费计划 15 分钟无访问会休眠，下次访问需 ~30 秒唤醒。可升级到 Starter 计划（$7/月）消除休眠。也可以用定时 ping 工具（如 UptimeRobot）每 10 分钟访问一次保持唤醒。

### Q: 构建失败 "node:sqlite not found"？
A: 确保环境变量 `NODE_VERSION=22.0.0` 已设置。Render 默认可能用 Node 18。

### Q: 支付宝回调地址怎么填？
A: 部署后拿到 Render 域名，设置 `ALIPAY_NOTIFY_URL=https://你的域名.onrender.com/api/payment/alipay/notify`。

---

## 💡 省钱建议

| 方案 | 费用 | 适合场景 |
|------|------|---------|
| 免费计划 | $0 | 测试验证功能 |
| 免费计划 + UptimeRobot 保活 | $0 | 低频使用的小站 |
| Starter 计划 + 1GB 磁盘 | $7.25/月 | 正式上线推荐 |
