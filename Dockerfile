FROM node:22-alpine

WORKDIR /app

# 复制依赖清单并安装
COPY server/package.json server/package-lock.json* ./
RUN npm install --production --registry=https://registry.npmmirror.com

# 复制后端代码
COPY server/ .

# 复制前端静态文件
COPY index.html ./public/

# 环境变量默认值
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/shop.db

# 数据卷
VOLUME ["/app/data"]

EXPOSE 3000

# 启动命令
CMD ["node", "app.js"]
