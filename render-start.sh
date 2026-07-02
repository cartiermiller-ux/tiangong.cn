#!/bin/bash
# 阿凡达在海上 - Render.com 启动脚本
# 自动检测并初始化数据库，然后启动后端服务
set -e

# 进入 server 目录
cd "$(dirname "$0")/server"

echo "🌊 阿凡达在海上 - Render 启动中..."
echo "📍 端口: ${PORT:-3000}"
echo "📍 数据库路径: ${DB_PATH:-data/shop.db}"

# 确保数据目录存在
DB_DIR=$(dirname "${DB_PATH:-data/shop.db}")
mkdir -p "$DB_DIR"

# 【修复版】无论数据库文件是否存在，都执行一次初始化脚本
# 这样可以解决“文件存在但表缺失”导致的 500 错误
# (前提是 init-db.js 内部使用了 CREATE TABLE IF NOT EXISTS，重复执行是安全的)
echo "🗄️  正在检查并初始化数据库表结构..."
node init-db.js
echo "✅ 数据库表结构检查/初始化完成"

# 启动服务
echo "🚀 启动后端服务..."
exec node app.js
