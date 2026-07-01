# 阿凡达在海上 - 详细部署流程 & 一键部署脚本

> 本文档覆盖从源码到上线的完整流程，适用于当前 Vite + React 脚手架项目（自包含 HTML 模式）。

---

## 一、项目结构概览

```
avatar_sea_shop/
├── index.html              # 入口 HTML（自包含页面，含全部 CSS/JS）
├── package.json            # 依赖与构建脚本
├── vite.config.ts          # Vite 构建配置
├── postcss.config.js       # PostCSS 配置
├── tsconfig.json           # TypeScript 配置
├── public/                 # 静态资源（favicon 等）
│   ├── favicon.ico
│   └── robots.txt
├── src/                    # React 源码目录（本项目中 index.html 为自包含页面，src 仅作脚手架保留）
│   ├── main.tsx
│   ├── App.tsx
│   └── index.css
├── dist/                   # 构建产物（npm run build 后生成）
└── .gitignore
```

**关键说明：** 本项目的 `index.html` 是一个自包含页面——所有 CSS 写在 `<style>` 标签内，所有 JS 写在 `<script>` 标签内，商品图片使用 OSS 持久 CDN 链接。Vite 构建时会将其原样输出到 `dist/index.html`，无需额外编译。

---

## 二、环境准备（前置条件）

### 2.1 本地开发环境

| 工具 | 最低版本 | 用途 |
|------|---------|------|
| Node.js | ≥ 18.0 | 运行 Vite 构建工具 |
| npm | ≥ 9.0 | 包管理（或使用 pnpm/yarn） |
| Git | ≥ 2.30 | 版本控制与代码推送 |

验证环境：
```bash
node -v && npm -v && git --version
```

### 2.2 部署目标服务器

| 方案 | 要求 |
|------|------|
| 静态托管（推荐） | 任意可托管静态文件的服务：Nginx / Caddy / Vercel / Netlify / Cloudflare Pages / 对象存储（OSS/COS/S3） |
| 自建服务器 | Linux + Nginx，开放 80/443 端口 |

---

## 三、详细部署流程（分步）

### 步骤 1：安装依赖

```bash
cd avatar_sea_shop
npm install
```

> 首次安装约 1-2 分钟。若网络较慢，可使用国内镜像：
> `npm install --registry=https://registry.npmmirror.com`

### 步骤 2：本地预览验证

```bash
npm run dev
```
浏览器打开 `http://localhost:5173`，确认页面正常：
- 导航栏、公告栏、分类标签渲染正常
- 12 个商品卡片图片加载正常（OSS 链接）
- 点击「登录/注册」弹窗弹出、视频背景播放
- 搜索过滤、分类切换、Toast 通知均工作

### 步骤 3：生产构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录：
```
dist/
├── index.html        # 自包含页面（原样输出）
├── assets/           # 如有外部资源引用则在此
└── ...
```

验证构建产物：
```bash
npm run preview       # 本地预览构建结果 → http://localhost:4173
```

### 步骤 4：部署 dist/ 到托管平台

#### 方案 A：Nginx（自建服务器）

1. 上传 `dist/` 目录到服务器：
```bash
scp -r dist/* user@your-server:/var/www/avatar_sea_shop/
```

2. Nginx 配置 `/etc/nginx/conf.d/avatar_sea_shop.conf`：
```nginx
server {
    listen 80;
    server_name avatarsea.com avatarsea.cn;

    root /var/www/avatar_sea_shop;
    index index.html;

    # 静态资源缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # SPA 回退（本自包含页面无需回退，保留以防扩展）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Gzip 压缩
    gzip on;
    gzip_types text/css application/javascript text/html application/json;
    gzip_min_length 1024;
}
```

3. 重载 Nginx：
```bash
sudo nginx -t && sudo nginx -s reload
```

#### 方案 B：对象存储（OSS/COS/S3）

以阿里云 OSS 为例：
```bash
# 安装 ossutil
# 上传 dist/ 内容到 bucket
ossutil cp -r dist/ oss://your-bucket/ --recursive
# 在 bucket 配置中开启静态网站托管，默认首页设为 index.html
```

#### 方案 C：Vercel / Netlify / Cloudflare Pages

```bash
# Vercel
npm i -g vercel
vercel --prod           # 框架选 Vite，输出目录 dist

# Netlify
npm i -g netlify-cli
netlify deploy --prod --dir=dist

# Cloudflare Pages
npx wrangler pages deploy dist
```

### 步骤 5：配置 HTTPS（推荐）

自建服务器使用 Caddy（自动 HTTPS）或 Nginx + Certbot：
```bash
sudo certbot --nginx -d avatarsea.com -d avatarsea.cn
```

### 步骤 6：验证线上站点

- 访问域名，确认页面完整渲染
- 检查商品图片加载（OSS CDN 链接可达）
- 检查弹窗视频背景（pixabay CDN，CN 环境可能受限，遮罩层仍正常显示）
- 移动端响应式布局正常

---

## 四、一键部署脚本

以下脚本封装了「安装依赖 → 构建 → 部署」全流程。保存为 `deploy.sh`，赋予执行权限后运行。

```bash
#!/usr/bin/env bash
#=============================================================================
# 阿凡达在海上 - 一键部署脚本
# 用法: ./deploy.sh [dev|build|preview|deploy|all]
#   dev     - 启动本地开发服务器
#   build   - 生产构建
#   preview - 预览构建产物
#   deploy  - 部署 dist/ 到远程服务器（需配置 DEPLOY_TARGET）
#   all     - 安装依赖 + 构建 + 部署（默认）
#=============================================================================
set -euo pipefail

# ---------- 配置区（按需修改） ----------
PROJECT_NAME="avatar_sea_shop"
# 部署目标：nginx | oss | vercel | netlify | cloudflare
DEPLOY_TARGET="nginx"
# Nginx 方案的远程服务器信息（DEPLOY_TARGET=nginx 时必填）
NGINX_SERVER="user@your-server-ip"
NGINX_PATH="/var/www/avatar_sea_shop"
# OSS 方案的 bucket 名（DEPLOY_TARGET=oss 时必填）
OSS_BUCKET="your-bucket"
# ----------------------------------------

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 颜色输出
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# 环境检查
check_env() {
  command -v node >/dev/null 2>&1 || err "Node.js 未安装，请先安装 Node.js ≥ 18"
  command -v npm  >/dev/null 2>&1 || err "npm 未安装"
  [ "$(node -v | cut -d. -f1 | tr -d v)" -ge 18 ] || err "Node.js 版本需 ≥ 18"
  log "环境检查通过：$(node -v) / $(npm -v)"
}

# 安装依赖
install_deps() {
  log "安装依赖..."
  if [ -d node_modules ]; then
    warn "node_modules 已存在，跳过安装（如需重装请先 rm -rf node_modules）"
  else
    npm install --registry=https://registry.npmmirror.com
  fi
  log "依赖安装完成"
}

# 生产构建
build() {
  log "开始生产构建..."
  npm run build
  [ -d dist ] && [ -f dist/index.html ] || err "构建失败：dist/index.html 不存在"
  log "构建完成，产物在 dist/（$(du -sh dist | cut -f1)）"
}

# 预览构建产物
preview() {
  log "启动预览服务器 → http://localhost:4173"
  npm run preview
}

# 部署到 Nginx
deploy_nginx() {
  log "部署到 Nginx 服务器：$NGINX_SERVER:$NGINX_PATH"
  ssh "$NGINX_SERVER" "mkdir -p $NGINX_PATH"
  scp -r dist/* "$NGINX_SERVER:$NGINX_PATH/"
  ssh "$NGINX_SERVER" "sudo nginx -t && sudo nginx -s reload"
  log "Nginx 部署完成"
}

# 部署到 OSS
deploy_oss() {
  command -v ossutil >/dev/null 2>&1 || err "ossutil 未安装"
  log "部署到 OSS bucket：$OSS_BUCKET"
  ossutil cp -r dist/ "oss://$OSS_BUCKET/" --recursive --force
  log "OSS 部署完成（请在控制台确认静态网站托管已开启）"
}

# 部署到 Vercel
deploy_vercel() {
  command -v vercel >/dev/null 2>&1 || npm i -g vercel
  log "部署到 Vercel..."
  vercel --prod --yes
}

# 部署到 Netlify
deploy_netlify() {
  command -v netlify >/dev/null 2>&1 || npm i -g netlify-cli
  log "部署到 Netlify..."
  netlify deploy --prod --dir=dist
}

# 部署到 Cloudflare Pages
deploy_cloudflare() {
  log "部署到 Cloudflare Pages..."
  npx wrangler pages deploy dist
}

# 部署分发
deploy() {
  build
  case "$DEPLOY_TARGET" in
    nginx)     deploy_nginx ;;
    oss)       deploy_oss ;;
    vercel)    deploy_vercel ;;
    netlify)   deploy_netlify ;;
    cloudflare) deploy_cloudflare ;;
    *) err "未知 DEPLOY_TARGET=$DEPLOY_TARGET" ;;
  esac
}

# 用法
usage() {
  echo "用法: ./deploy.sh [dev|build|preview|deploy|all]"
  echo "  dev     启动本地开发服务器"
  echo "  build   生产构建"
  echo "  preview 预览构建产物"
  echo "  deploy  构建 + 部署到 $DEPLOY_TARGET"
  echo "  all     安装依赖 + 构建 + 部署（默认）"
}

# 主流程
main() {
  local action="${1:-all}"
  echo "========================================"
  echo "  $PROJECT_NAME 部署脚本  [$action]"
  echo "========================================"
  case "$action" in
    dev)     npm run dev ;;
    build)   check_env; build ;;
    preview) check_env; build; preview ;;
    deploy)  check_env; deploy ;;
    all)     check_env; install_deps; deploy ;;
    -h|--help) usage ;;
    *) err "未知命令: $action"; usage ;;
  esac
}

main "$@"
```

### 使用方法

```bash
# 1. 保存脚本到项目根目录
chmod +x deploy.sh

# 2. 一键全流程（安装依赖 + 构建 + 部署）
./deploy.sh all

# 3. 仅构建
./deploy.sh build

# 4. 仅本地开发
./deploy.sh dev

# 5. 切换部署目标：编辑脚本顶部配置区
#    DEPLOY_TARGET="oss"  → 部署到对象存储
#    DEPLOY_TARGET="vercel" → 部署到 Vercel
```

---

## 五、常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 商品图片不显示 | OSS CDN 链接过期或网络不通 | 重新执行图片搜索上传到 OSS，替换 `index.html` 中的 `img` 字段 |
| 弹窗视频背景黑屏 | pixabay CDN 在 CN 环境受限 | 视频不可达时遮罩层仍正常显示；如需替换，将 `<source src="...">` 换成自托管视频或 OSS 视频 |
| 构建报 `package.json not found` | 项目目录错误或未初始化 | 确认在 `avatar_sea_shop/` 根目录执行，且 `package.json` 存在 |
| `npm install` 慢 | 默认源网络不通 | 加 `--registry=https://registry.npmmirror.com` |
| Nginx 部署后 403 | 文件权限不足 | `sudo chown -R www-data:www-data /var/www/avatar_sea_shop` |
| 页面空白 | 构建产物未正确上传 | 检查 `dist/index.html` 是否存在于服务器目标路径 |
| HTTPS 证书失败 | 域名 DNS 未指向服务器 | 先配置 DNS A 记录，再执行 certbot |

---

## 六、部署后运维清单

- [ ] 定期检查 OSS 图片链接可达性（商品图片）
- [ ] 监控站点可用性（UptimeRobot / 阿里云监控）
- [ ] 商品数据更新：编辑 `index.html` 中 `products` 数组后重新构建部署
- [ ] 公告内容更新：编辑 `index.html` 中 `.announcement-content` 区块
- [ ] 备份：`git push` 推送到远程仓库保留版本历史
