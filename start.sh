#!/bin/bash
# 阿凡达在海上 - 后端一键启动脚本
set -e

cd "$(dirname "$0")/server"

# 检查 .env
if [ ! -f .env ]; then
  echo "📋 首次运行，从模板创建 .env ..."
  cp .env.example .env
  echo "⚠️  请编辑 server/.env 填写真实配置（JWT密钥、SMTP、支付宝等）"
fi

# 检查依赖
if [ ! -d node_modules ]; then
  echo "📦 安装依赖 ..."
  npm install --registry=https://registry.npmmirror.com
fi

# 检查数据库
if [ ! -f data/shop.db ]; then
  echo "🗄️  初始化数据库 ..."
  node --experimental-sqlite init-db.js
fi

# 启动服务
echo "🚀 启动后端服务 ..."
node --experimental-sqlite app.js
