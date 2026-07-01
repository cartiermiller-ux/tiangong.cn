#!/bin/bash
# 阿凡达在海上 - Render.com 启动脚本
# 自动检测并初始化数据库，然后启动后端服务
set -e

cd "$(dirname "$0")/server"

echo "🌊 阿凡达在海上 - Render 启动中..."
echo "📍 端口: ${PORT:-3000}"
echo "📍 数据库路径: ${DB_PATH:-data/shop.db}"

# 确保数据目录存在
DB_DIR=$(dirname "${DB_PATH:-data/shop.db}")
mkdir -p "$DB_DIR"

# 如果数据库不存在，自动初始化
if [ ! -f "${DB_PATH:-data/shop.db}" ]; then
  echo "🗄️  首次部署，初始化数据库..."
  node init-db.js
  echo "✅ 数据库初始化完成"
else
  echo "✅ 数据库已存在，跳过初始化"
fi

# 启动服务
echo "🚀 启动后端服务..."
exec node app.js
