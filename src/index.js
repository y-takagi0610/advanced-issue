require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON リクエストボディを解析する
app.use(express.json());

// public/ ディレクトリの静的ファイルを配信する
app.use(express.static(path.join(__dirname, '..', 'public')));

// ルートをマウント
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leave-requests', require('./routes/leaveRequests'));

// サーバーを起動
app.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});

module.exports = app;
