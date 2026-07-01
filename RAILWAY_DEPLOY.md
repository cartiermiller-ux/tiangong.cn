# Railway 部署指南

> 阿凡达在海上 - 数字商品发卡平台后端 Railway 部署文档

## 📋 前置条件

- GitHub 仓库：`https://github.com/cartiermiller-ux/tiangong.cn`
- Railway 账号（已注册，当前为 TRIAL 试用版）
- 试用额度：$4.95 或 28 天（先到先止）

---

## 🚀 部署步骤（5 分钟搞定）

### 第 1 步：在 Railway 创建新项目

1. 登录 https://railway.com/dashboard
2. 点击右上角紫色按钮 **`+ New`**
3. 选择 **Deploy from GitHub repo**
4. 授权 Railway 访问你的 GitHub
5. 选择仓库 `cartiermiller-ux/tiangong.cn`
6. Railway 会自动检测到 `railway.json` 配置文件

### 第 2 步：配置环境变量

在 Railway 项目的 **Variables** 标签页中，添加以下环境变量：

#### 必填项

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DB_PATH` | `/data/shop.db` | ⚠️ 必须设为 `/data/shop.db`，挂载到持久化卷 |
| `JWT_SECRET` | `你的随机密钥` | 建议用 32 位以上随机字符串 |
| `NODE_ENV` | `production` | 生产环境标识 |
| `FRONTEND_URL` | `https://skyagent-artifacts.tiangong.cn` | 前端地址（CORS 白名单） |

#### 管理员（首次初始化用）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `ADMIN_USERNAME` | `admin` | 管理员用户名 |
| `ADMIN_PASSWORD` | `admin123456` | ⚠️ 部署后立即修改 |
| `ADMIN_EMAIL` | `admin@example.com` | 管理员邮箱 |

#### SMTP 邮件（可选，不配则卡密只显示在页面上）

| 变量名 | 说明 |
|--------|------|
| `SMTP_HOST` | SMTP 服务器地址（如 `smtp.qq.com`） |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | 发件邮箱 |
| `SMTP_PASS` | 邮箱授权码 |
| `SMTP_FROM` | 发件人显示名 |

#### 支付宝（可选，不配则使用模拟支付）

| 变量名 | 说明 |
|--------|------|
| `ALIPAY_APP_ID` | 支付宝应用 ID |
| `ALIPAY_APP_PRIVATE_KEY` | 应用私钥 |
| `ALIPAY_ALIPAY_PUBLIC_KEY` | 支付宝公钥 |
| `ALIPAY_NOTIFY_URL` | 回调地址（部署后填入 Railway 域名） |
| `ALIPAY_SANDBOX` | `true` 沙箱 / `false` 正式 |

### 第 3 步：添加持久化存储卷

1. 进入 Railway 项目的 **Settings** 标签页
2. 找到 **Volumes** 区域
3. 点击 **Add Volume**
4. 挂载路径填写：`/data`
5. 这确保 SQLite 数据库文件在重新部署后不会丢失

> ⚠️ **关键**：如果不挂载卷，每次重新部署数据库都会被清空！

### 第 4 步：部署并获取域名

1. 点击 **Deploy** 按钮
2. 等待构建完成（约 1-2 分钟）
3. 部署成功后，在 **Settings** → **Networking** 中：
   - 点击 **Generate Domain**
   - Railway 会分配一个域名，如 `avatar-sea-shop.up.railway.app`
4. 测试健康检查：访问 `https://你的域名/api/health`
   - 应返回 `{"ok":true,"time":"..."}`

### 第 5 步：更新前端 API 地址

部署成功后，需要把前端的 API 地址改为 Railway 分配的域名：

1. 打开前端 `index.html`
2. 找到 `API_BASE` 常量
3. 改为：`https://你的域名.up.railway.app/api`
4. 重新部署前端

---

## 🔧 Railway 配置说明

项目根目录已包含以下 Railway 配置文件：

### `railway.json`

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "cd server && npm install"
  },
  "deploy": {
    "startCommand": "bash railway-start.sh",
    "healthcheck": {
      "path": "/api/health"
    }
  },
  "volumes": [
    { "mountPath": "/data" }
  ]
}
```

### `railway-start.sh`

启动脚本会自动：
1. 创建 `/data` 目录（如果不存在）
2. 检测数据库是否存在，不存在则自动初始化（建表 + 种子数据）
3. 启动 Node.js 服务（带 `--experimental-sqlite` 标志）

---

## 💰 费用预估

| 项目 | 预估消耗 |
|------|---------|
| 构建阶段 | ~$0.01/次 |
| 运行时（512MB RAM） | ~$0.05/小时 ≈ $36/月 |
| 持久化卷（1GB） | ~$0.10/月 |
| **试用额度** | **$4.95（约够运行 4 天 24 小时不停）** |

> 💡 **省钱建议**：
> - 试用期内测试验证功能
> - 不用时在 Railway 里暂停服务（Suspend），不消耗额度
> - 确认没问题后升级 Hobby 计划（$5/月，含 $5 额度）

---

## 🧪 部署后验证

### 1. 健康检查
```bash
curl https://你的域名.up.railway.app/api/health
```

### 2. 获取商品列表
```bash
curl https://你的域名.up.railway.app/api/products
```

### 3. 管理员登录
```bash
curl -X POST https://你的域名.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"account":"admin","password":"admin123456"}'
```

### 4. 完整购买流程测试
1. 用前端页面注册新用户
2. 选择商品下单
3. 使用模拟支付（未配支付宝时自动走模拟支付）
4. 确认卡密返回

---

## ❓ 常见问题

### Q: 构建失败 "node:sqlite not found"？
A: Railway 的 Nixpacks 默认可能用 Node 18/20。`package.json` 已添加 `engines.node >= 22`，Railway 会自动安装 Node 22。如果仍失败，在 Railway Variables 中添加 `NODE_VERSION=22`。

### Q: 数据库每次部署都丢失？
A: 确保已添加 Volume，挂载路径为 `/data`，且环境变量 `DB_PATH=/data/shop.db`。

### Q: 支付宝回调怎么配？
A: 部署后拿到 Railway 域名，设置 `ALIPAY_NOTIFY_URL=https://你的域名.up.railway.app/api/payment/alipay/notify`。

### Q: 试用额度用完了怎么办？
A: 升级到 Hobby 计划（$5/月），或暂停服务。暂停时不计费。

### Q: 可以同时托管前端吗？
A: 可以。后端 `app.js` 已配置静态文件服务，把 `index.html` 放到 `server/public/` 目录即可。但建议前端用 Vercel 或当前 tiangong.cn 链接，后端单独跑在 Railway。

---

## 📞 技术支持

- Railway 文档：https://docs.railway.com
- 项目 GitHub：https://github.com/cartiermiller-ux/tiangong.cn
- 健康检查：`/api/health`
