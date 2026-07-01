const nodemailer = require('nodemailer');
const config = require('../config');
const { asyncHandler } = require('../utils/helpers');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    console.warn('⚠️ SMTP 未配置，邮件发货将跳过。请在 .env 中设置 SMTP_* 变量。');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transporter;
}

// 发送卡密邮件
async function sendCardDeliveryEmail(toEmail, orderNo, productName, cards) {
  const t = getTransporter();
  if (!t) {
    console.log(`📧 [SMTP未配置] 订单 ${orderNo} 卡密（${productName}）：`, cards);
    return false;
  }

  const cardList = cards.map((c, i) => `<tr><td style="padding:8px 12px;border:1px solid #e0e0e0;background:#f8f9fa;font-family:monospace;font-size:14px;">${i + 1}</td><td style="padding:8px 12px;border:1px solid #e0e0e0;font-family:monospace;font-size:14px;word-break:break-all;">${escapeHtml(c)}</td></tr>`).join('');

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#0a1628,#0d2137);border-radius:16px 16px 0 0;padding:30px;text-align:center;">
      <div style="font-size:32px;">🌊</div>
      <h1 style="color:#00d4ff;margin:10px 0 5px;font-size:22px;">阿凡达在海上</h1>
      <p style="color:#8899aa;margin:0;font-size:13px;">高端数字商品发卡平台</p>
    </div>
    <div style="background:#fff;padding:30px;border-radius:0 0 16px 16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
      <h2 style="color:#0a1628;margin:0 0 16px;font-size:18px;">✅ 订单发货成功</h2>
      <p style="color:#333;font-size:14px;line-height:1.8;">您好，您的订单已支付成功，以下是您的卡密信息：</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px 0;color:#888;font-size:13px;">订单号</td><td style="padding:8px 0;color:#333;font-size:14px;font-weight:600;">${orderNo}</td></tr>
        <tr><td style="padding:8px 0;color:#888;font-size:13px;">商品</td><td style="padding:8px 0;color:#333;font-size:14px;font-weight:600;">${escapeHtml(productName)}</td></tr>
      </table>
      <h3 style="color:#0a1628;font-size:15px;margin:20px 0 10px;">卡密内容：</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr><th style="padding:8px 12px;border:1px solid #0d2137;background:#0d2137;color:#fff;font-size:13px;text-align:left;">序号</th><th style="padding:8px 12px;border:1px solid #0d2137;background:#0d2137;color:#fff;font-size:13px;text-align:left;">卡密</th></tr>
        ${cardList}
      </table>
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin:20px 0;font-size:13px;color:#856404;">
        ⚠️ 请妥善保管您的卡密，切勿泄露给他人。如有问题请联系客服。
      </div>
      <p style="color:#888;font-size:12px;text-align:center;margin-top:24px;">此邮件由系统自动发送，请勿回复。<br>© 阿凡达在海上</p>
    </div>
  </div>
</body></html>`;

  const info = await t.sendMail({
    from: config.smtp.from,
    to: toEmail,
    subject: `【阿凡达在海上】卡密发货 - ${productName}（订单${orderNo}）`,
    html,
  });
  console.log(`📧 邮件已发送: ${toEmail} | messageId: ${info.messageId}`);
  return true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sendCardDeliveryEmail };
