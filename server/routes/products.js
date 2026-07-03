const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { success, fail, asyncHandler } = require('../utils/helpers');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/products  公开接口，返回在售商品列表
router.get('/', asyncHandler(async (req, res) => {
  const { category, search } = req.query;
  let sql = `SELECT id, name, category, description, price, original_price, badge, image,
      (SELECT COUNT(*) FROM card_keys WHERE product_id = products.id AND status = 'unsold') AS stock,
      sort_order FROM products WHERE status = 'active'`;
  const params = [];
  if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category); }
  if (search) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY sort_order ASC, id ASC';
  const list = db.prepare(sql).all(...params);
  // 转为前端期望的字段名
  const data = list.map(p => ({
    id: p.id, name: p.name, category: p.category, desc: p.description,
    price: p.price, originalPrice: p.original_price, stock: p.stock,
    badge: p.badge, img: p.image,
  }));
  success(res, data);
}));

// GET /api/products/:id  商品详情
router.get('/:id', asyncHandler(async (req, res) => {
  const p = db.prepare(`SELECT id, name, category, description, detail, price, original_price, badge, image,
      (SELECT COUNT(*) FROM card_keys WHERE product_id = products.id AND status = 'unsold') AS stock
      FROM products WHERE id = ? AND status = 'active'`).get(req.params.id);
  if (!p) return fail(res, '商品不存在或已下架', 404, 404);
  success(res, {
    id: p.id, name: p.name, category: p.category, desc: p.description, detail: p.detail || '',
    price: p.price, originalPrice: p.original_price, stock: p.stock,
    badge: p.badge, img: p.image,
  });
}));

// ========== 以下为管理后台接口 ==========

// POST /api/products  新增商品
router.post('/', auth, adminOnly, asyncHandler(async (req, res) => {
  const { name, category, desc, detail, price, originalPrice, badge, img } = req.body;
  if (!name || !category || !desc || price == null) return fail(res, '缺少必填字段');
  const r = db.prepare(`INSERT INTO products (name, category, description, detail, price, original_price, badge, image, stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(name, category, desc, detail || '', price, originalPrice || null, badge || null, img || null);
  success(res, { id: r.lastInsertRowid }, '商品创建成功');
}));

// PUT /api/products/:id  更新商品
router.put('/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  const { name, category, desc, detail, price, originalPrice, badge, img, status } = req.body;
  const r = db.prepare(`UPDATE products SET name=COALESCE(?,name), category=COALESCE(?,category),
    description=COALESCE(?,description), detail=COALESCE(?,detail), price=COALESCE(?,price), original_price=COALESCE(?,original_price),
    badge=COALESCE(?,badge), image=COALESCE(?,image), status=COALESCE(?,status), updated_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(name, category, desc, detail, price, originalPrice, badge, img, status, req.params.id);
  if (r.changes === 0) return fail(res, '商品不存在', 404, 404);
  success(res, null, '商品更新成功');
}));

// DELETE /api/products/:id  下架商品（软删除）
router.delete('/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  db.prepare('UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('offline', req.params.id);
  success(res, null, '商品已下架');
}));

// POST /api/products/:id/cards  批量导入卡密
router.post('/:id/cards', auth, adminOnly, asyncHandler(async (req, res) => {
  const { cards } = req.body; // cards: 字符串数组
  if (!Array.isArray(cards) || cards.length === 0) return fail(res, '请提供卡密列表');
  const insert = db.prepare('INSERT INTO card_keys (product_id, content, status) VALUES (?, ?, ?)');
  const tx = db.transaction((items) => {
    for (const c of items) insert.run(req.params.id, String(c).trim(), 'unsold');
  });
  tx(cards);
  const stock = db.prepare("SELECT COUNT(*) AS c FROM card_keys WHERE product_id = ? AND status = 'unsold'").get(req.params.id).c;
  db.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(stock, req.params.id);
  success(res, { imported: cards.length, stock }, `成功导入 ${cards.length} 个卡密`);
}));

module.exports = router;
