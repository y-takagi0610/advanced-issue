const { Router } = require('express');
const pool = require('../db/pool');

const router = Router();

// YYYY-MM-DD 形式かつ実在する日付かを検証する
function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
}

// 一覧取得（申請者本人の申請のみ）
router.get('/', async (req, res) => {
  try {
    const employeeId = parseInt(req.query.employee_id, 10);
    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'employee_id を指定してください' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY start_date DESC',
      [employeeId]
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 新規登録
router.post('/', async (req, res) => {
  try {
    const employeeId = parseInt(req.body.employee_id, 10);
    const { start_date, end_date, reason } = req.body;

    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'employee_id を指定してください' });
    }
    if (!isValidDateString(start_date) || !isValidDateString(end_date)) {
      return res.status(400).json({ error: 'start_date・end_date は YYYY-MM-DD 形式で指定してください' });
    }
    if (end_date < start_date) {
      return res.status(400).json({ error: 'end_date は start_date 以降にしてください' });
    }

    const employeeCheck = await pool.query('SELECT 1 FROM employees WHERE id = $1', [employeeId]);
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({ error: '指定された社員が見つかりません' });
    }

    const { rows } = await pool.query(
      'INSERT INTO leave_requests (employee_id, start_date, end_date, reason) VALUES ($1, $2, $3, $4) RETURNING *',
      [employeeId, start_date, end_date, reason ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = router;
