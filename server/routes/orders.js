const express = require('express');
const router = express.Router();
const db = require('../config/db');
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
  if (!['alipay', 'wechat', 'usdt', 'balance'].includes(paymentMethod)) return fail(res, '请选择支付方式');

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

  // 支付宝/微信/USDT：创建待确认订单（用户扫码付款后联系客服确认）
  const r = db.prepare(`INSERT INTO orders (order_no, user_id, product_id, quantity, unit_price, total_amount, email, payment_method, payment_status, order_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'created')`)
    .run(orderNo, req.user ? req.user.id : null, productId, qty, product.price, totalAmount, email, paymentMethod);

  success(res, { orderId: r.lastInsertRowid, orderNo, totalAmount }, '订单创建成功，请扫码支付后联系客服确认');
}));

// ============ 我的订单列表 ============
// GET /api/orders/my/list （必须在 /:orderNo 之前）
router.get('/my/list', auth, asyncHandler(async (req, res) => {
  const list = db.prepare(`SELECT o.id, o.order_no, o.total_amount, o.payment_method, o.payment_status, o.order_status,
    o.created_at, p.name AS product_name, p.image AS product_img
    FROM orders o JOIN products p ON o.product_id = p.id WHERE o.user_id = ? ORDER BY o.id DESC`).all(req.user.id);
  success(res, list);
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

module.exports = router;
