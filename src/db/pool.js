const { Pool } = require('pg');

// 環境変数から接続設定を読み込む (dotenv は src/index.js で事前にロード済み)
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

module.exports = pool;
