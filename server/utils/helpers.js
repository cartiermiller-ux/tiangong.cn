const { v4: uuidv4 } =require('uuid');

// 统一成功响应
function success(res, data = null, message = 'success') {
  return res.json({ code: 0, message, data });
}

// 统一错误响应
function fail(res, message = 'error', code = 1, status = 400) {
  return res.status(status).json({ code, message, data: null });
}

// 生成订单号: AS + 时间 + 随机
function generateOrderNo() {
  const now = new Date();
  const ts = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AS${ts}${rand}`;
}

// 异步包裹
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { success, fail, generateOrderNo, asyncHandler };
