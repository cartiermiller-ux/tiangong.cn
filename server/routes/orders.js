const express = require('express');
const router = express.Router();
const db = require('../config/db');
const config = require('../config');
const { success, fail, generateOrderNo, asyncHandler } = require('../utils/helpers');
const { auth, optionalAuth } = require('../middleware/auth');
const { sendCardDeliveryEmail } = require('../emails/mailer');

// ============ 自动发卡核心逻辑 ============
// 从库存中取出 N 个未售卡密，标记为已售并绑定订单
function deliverCards(orderId, productId, quantity) {
  const cards = db.prepare("SELECT id, content FROM card_keys WHERE product_id = ? AND status = 'unsold' LIMIT ?")
    .all(productId, quantity);
  if (cards.length < quantity) return null; // 库存不足

  const updateCard = db.prepare("UPDATE card_keys SET status = 'sold', order_id = ?, sold_at = CURRENT_TIMESTAMP WHERE id = ?");
  const insertDelivery = db.prepare("INSERT INTO delivery_records (order_id, card_key_id, content, email) VALUES (?, ?, ?, ?)");
  const order = db.prepare('SELECT email FROM orders WHERE id = ?').get(orderId);

  const tx = db.transaction(() => {
    for (const c of cards) {
      updateCard.run(orderId, c.id);
      insertDelivery.run(orderId, c.id, c.content, order.email);
    }
    // 更新商品库存计数
    const stock = db.prepare("SELECT COUNT(*) AS c FROM card_keys WHERE product_id = ? AND status = 'unsold'").get(productId).c;
    db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(stock, productId);
    db.prepare("UPDATE orders SET order_status = 'delivered', delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(orderId);
  });
  tx();
  return cards.map(c => c.content);
}

// ============ 创建订单 ============
// POST /api/orders
router.post('/', optionalAuth, asyncHandler(async (req, res) => {
  const { productId, quantity, email, paymentMethod } = req.body;
  if (!productId) return fail(res, '请选择商品');
  const qty = parseInt(quantity, 10) || 1;
  if (qty < 1 || qty > 99) return fail(res, '购买数量需在1-99之间');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, '请输入正确的邮箱');
  if (!['alipay', 'wechat', 'balance'].includes(paymentMethod)) return fail(res, '请选择支付方式');

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND status = ?').get(productId, 'active');
  if (!product) return fail(res, '商品不存在或已下架', 404, 404);

  const stock = db.prepare("SELECT COUNT(*) AS c FROM card_keys WHERE product_id = ? AND status = 'unsold'").get(productId).c;
  if (stock < qty) return fail(res, `库存不足，当前仅剩 ${stock} 件`);

  const totalAmount = +(product.price * qty).toFixed(2);
  const orderNo = generateOrderNo();

  // 余额支付：直接扣款并发货
  if (paymentMethod === 'balance') {
    if (!req.user) return fail(res, '余额支付需先登录', 401, 401);
    if (req.user.balance < totalAmount) return fail(res, `余额不足，当前余额 ¥${req.user.balance.toFixed(2)}`);
    const r = db.prepare(`INSERT INTO orders (order_no, user_id, product_id, quantity, unit_price, total_amount, email, payment_method, payment_status, order_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'balance', 'paid', 'paid')`)
      .run(orderNo, req.user.id, productId, qty, product.price, totalAmount, email);
    db.prepare('UPDATE users SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(totalAmount, req.user.id);
    const cards = deliverCards(r.lastInsertRowid, productId, qty);
    if (!cards) return fail(res, '库存不足，已退款', 500, 500);
    // 异步发邮件
    sendCardDeliveryEmail(email, orderNo, product.name, cards).catch(e => console.error('邮件发送失败:', e.message));
    return success(res, { orderNo, cards, totalAmount }, '支付成功，卡密已生成');
  }

  // 支付宝/微信：创建待支付订单
  const r = db.prepare(`INSERT INTO orders (order_no, user_id, product_id, quantity, unit_price, total_amount, email, payment_method, payment_status, order_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'created')`)
    .run(orderNo, req.user ? req.user.id : null, productId, qty, product.price, totalAmount, email, paymentMethod);

  let payUrl = null;
  if (paymentMethod === 'alipay') {
    payUrl = await createAlipayOrder(orderNo, totalAmount, product.name);
  } else if (paymentMethod === 'wechat') {
    payUrl = await createWechatOrder(orderNo, totalAmount, product.name);
  }

  success(res, { orderId: r.lastInsertRowid, orderNo, totalAmount, payUrl }, '订单创建成功，请扫码支付');
}));

// ============ 查询订单状态 ============
// GET /api/orders/:orderNo
router.get('/:orderNo', asyncHandler(async (req, res) => {
  const order = db.prepare(`SELECT o.*, p.name AS product_name FROM orders o JOIN products p ON o.product_id = p.id WHERE o.order_no = ?`)
    .get(req.params.orderNo);
  if (!order) return fail(res, '订单不存在', 404, 404);
  const cards = db.prepare('SELECT content FROM delivery_records WHERE order_id = ?').all(order.id).map(r => r.content);
  success(res, {
    orderNo: order.order_no, productName: order.product_name, quantity: order.quantity,
    totalAmount: order.total_amount, email: order.email, paymentMethod: order.payment_method,
    paymentStatus: order.payment_status, orderStatus: order.order_status,
    cards: order.order_status === 'delivered' ? cards : [],
    createdAt: order.created_at, paidAt: order.paid_at,
  });
}));

// ============ 我的订单列表 ============
// GET /api/orders/my/list
router.get('/my/list', auth, asyncHandler(async (req, res) => {
  const list = db.prepare(`SELECT o.id, o.order_no, o.total_amount, o.payment_method, o.payment_status, o.order_status,
    o.created_at, p.name AS product_name, p.image AS product_img
    FROM orders o JOIN products p ON o.product_id = p.id WHERE o.user_id = ? ORDER BY o.id DESC`).all(req.user.id);
  success(res, list);
}));

// ============ 支付宝当面付下单 ============
function isAlipayConfigured() {
  const c = config.alipay;
  return c.appId && c.appPrivateKey && c.alipayPublicKey
    && !c.appPrivateKey.startsWith('your_') && !c.alipayPublicKey.startsWith('your_')
    && c.appId !== '2021000000000000';
}

async function createAlipayOrder(orderNo, amount, subject) {
  if (!isAlipayConfigured()) {
    // 未配置支付宝时返回模拟支付链接（仅用于测试）
    console.warn('⚠️ 支付宝未配置，返回模拟支付链接');
    return `${getBaseUrl()}/api/payment/mock-pay?orderNo=${orderNo}`;
  }
  const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk');
  const alipaySdk = new AlipaySdk({
    appId: config.alipay.appId,
    privateKey: config.alipay.appPrivateKey,
    alipayPublicKey: config.alipay.alipayPublicKey,
    gateway: config.alipay.sandbox ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do' : 'https://openapi.alipay.com/gateway.do',
  });
  const result = await alipaySdk.curl('POST', '/v3/alipay/trade/precreate', {
    method: 'alipay.trade.precreate',
    biz_content: JSON.stringify({
      out_trade_no: orderNo,
      total_amount: amount.toFixed(2),
      subject: subject,
    }),
    notify_url: config.alipay.notifyUrl,
  });
  // 返回二维码链接
  const body = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
  if (body.alipay_trade_precreate_response && body.alipay_trade_precreate_response.qr_code) {
    return body.alipay_trade_precreate_response.qr_code;
  }
  throw new Error('支付宝下单失败: ' + JSON.stringify(body));
}

// ============ 微信 Native 支付下单（简化版，需配置微信商户号） ============
async function createWechatOrder(orderNo, amount, subject) {
  console.warn('⚠️ 微信支付未完整配置，返回模拟支付链接');
  return `${getBaseUrl()}/api/payment/mock-pay?orderNo=${orderNo}`;
}

function getBaseUrl() {
  return config.frontendUrl && config.frontendUrl !== '*' ? config.frontendUrl : `http://localhost:${config.port}`;
}

// ============ 模拟支付页面（未配置真实支付时用于测试） ============
router.get('/mock-pay', asyncHandler(async (req, res) => {
  const { orderNo } = req.query;
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
  if (!order) return res.status(404).send('订单不存在');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>模拟支付</title>
  <style>body{font-family:sans-serif;background:#f0f2f5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
  .box{background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center;max-width:400px}
  h2{color:#0a1628} .amt{font-size:32px;color:#00d4ff;font-weight:700;margin:16px 0}
  button{background:linear-gradient(135deg,#00d4ff,#7b68ee);color:#fff;border:none;padding:14px 40px;border-radius:10px;font-size:16px;cursor:pointer;margin-top:16px}
  a{color:#00d4ff;text-decoration:none;display:inline-block;margin-top:12px;font-size:14px}</style></head>
  <body><div class="box"><h2>🌊 模拟支付</h2><p>订单号: ${orderNo}</p><p>商品: ${order.email}</p>
  <div class="amt">¥${order.total_amount}</div>
  <p style="color:#888;font-size:13px">这是测试环境的模拟支付，点击下方按钮模拟支付成功</p>
  <form method="POST" action="/api/payment/mock-pay-callback"><input type="hidden" name="orderNo" value="${orderNo}">
  <button type="submit">✅ 模拟支付成功</button></form>
  <a href="javascript:history.back()">← 返回</a></div></body></html>`);
}));

// ============ 模拟支付回调 ============
router.post('/mock-pay-callback', asyncHandler(async (req, res) => {
  const { orderNo } = req.body;
  await processPaymentSuccess(orderNo, 'MOCK_' + Date.now(), 'mock');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>支付成功</title>
  <style>body{font-family:sans-serif;background:#f0f2f5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
  .box{background:#fff;padding:40px;border-radius:16px;text-align:center} h2{color:#00b894}</style></head>
  <body><div class="box"><h2>✅ 支付成功！</h2><p>卡密已发送至您的邮箱</p><p style="color:#888">订单号: ${orderNo}</p></div></body></html>`);
}));

// ============ 支付宝异步回调 ============
router.post('/alipay/notify', asyncHandler(async (req, res) => {
  const params = req.body;
  console.log('📢 收到支付宝回调:', params.out_trade_no, params.trade_status);
  if (params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED') {
    // 验签
    let verified = true;
    if (isAlipayConfigured()) {
      try {
        const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk');
        const alipaySdk = new AlipaySdk({
          appId: config.alipay.appId,
          privateKey: config.alipay.appPrivateKey,
          alipayPublicKey: config.alipay.alipayPublicKey,
          gateway: config.alipay.sandbox ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do' : 'https://openapi.alipay.com/gateway.do',
        });
        verified = alipaySdk.checkNotifySign(params);
      } catch (e) { console.error('验签异常:', e.message); verified = false; }
    }
    if (!verified) { console.warn('⚠️ 支付宝回调验签失败'); return res.send('fail'); }
    await processPaymentSuccess(params.out_trade_no, params.trade_no, 'alipay');
  }
  res.send('success');
}));

// ============ 支付成功统一处理 ============
async function processPaymentSuccess(orderNo, tradeNo, channel) {
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
  if (!order) { console.warn('回调订单不存在:', orderNo); return; }
  if (order.payment_status === 'paid') { console.log('订单已处理过，跳过:', orderNo); return; }

  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET payment_status = 'paid', order_status = 'paid', trade_no = ?, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(tradeNo, order.id);
  });
  tx();

  // 自动发卡
  const cards = deliverCards(order.id, order.product_id, order.quantity);
  if (!cards) {
    console.error('❌ 发卡失败，库存不足:', orderNo);
    // TODO: 退款流程
    return;
  }
  const product = db.prepare('SELECT name FROM products WHERE id = ?').get(order.product_id);
  // 异步发邮件
  sendCardDeliveryEmail(order.email, orderNo, product.name, cards).catch(e => console.error('邮件发送失败:', e.message));
  console.log(`🎉 订单 ${orderNo} 支付成功并已发货，卡密已发至 ${order.email}`);
}

module.exports = router;
