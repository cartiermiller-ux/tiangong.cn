const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_me_in_production',
    expiresIn: '7d',
  },

  frontendUrl: process.env.FRONTEND_URL || '*',

  db: {
    path: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'shop.db'),
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },

  alipay: {
    appId: process.env.ALIPAY_APP_ID,
    appPrivateKey: process.env.ALIPAY_APP_PRIVATE_KEY,
    alipayPublicKey: process.env.ALIPAY_ALIPAY_PUBLIC_KEY,
    notifyUrl: process.env.ALIPAY_NOTIFY_URL,
    sandbox: process.env.ALIPAY_SANDBOX === 'true',
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123456',
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
  },
};

module.exports = config;
