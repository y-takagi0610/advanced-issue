const { Router } = require('express');
const pool = require('../db/pool');

const router = Router();

// サーバーの現在日付を YYYY-MM-DD 形式で取得する
function todayDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// 一覧取得（社員・年月を指定、勤務表画面用）
router.get('/', async (req, res) => {
  try {
    const employeeId = parseInt(req.query.employee_id, 10);
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'employee_id を指定してください' });
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'year と month を正しく指定してください' });
    }

    const pad = (n) => String(n).padStart(2, '0');
    const monthStart = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`;

    const { rows } = await pool.query(
      'SELECT * FROM attendance_records WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3 ORDER BY work_date',
      [employeeId, monthStart, monthEnd]
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 出勤打刻
router.post('/clock-in', async (req, res) => {
  try {
    const employeeId = parseInt(req.body.employee_id, 10);
    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'employee_id を指定してください' });
    }

    const employeeCheck = await pool.query('SELECT 1 FROM employees WHERE id = $1', [employeeId]);
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({ error: '指定された社員が見つかりません' });
    }

    const workDate = todayDate();
    const existing = await pool.query(
      'SELECT * FROM attendance_records WHERE employee_id = $1 AND work_date = $2',
      [employeeId, workDate]
    );
    if (existing.rows.length > 0 && existing.rows[0].clock_in_at !== null) {
      return res.status(400).json({ error: '本日は既に出勤打刻済みです' });
    }

    const { rows } = await pool.query(
      `INSERT INTO attendance_records (employee_id, work_date, clock_in_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (employee_id, work_date) DO UPDATE SET clock_in_at = EXCLUDED.clock_in_at
       RETURNING *`,
      [employeeId, workDate]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 退勤打刻
router.post('/clock-out', async (req, res) => {
  try {
    const employeeId = parseInt(req.body.employee_id, 10);
    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'employee_id を指定してください' });
    }

    const employeeCheck = await pool.query('SELECT 1 FROM employees WHERE id = $1', [employeeId]);
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({ error: '指定された社員が見つかりません' });
    }

    const workDate = todayDate();
    const existing = await pool.query(
      'SELECT * FROM attendance_records WHERE employee_id = $1 AND work_date = $2',
      [employeeId, workDate]
    );
    if (existing.rows.length === 0 || existing.rows[0].clock_in_at === null) {
      return res.status(400).json({ error: '出勤打刻がありません' });
    }
    if (existing.rows[0].clock_out_at !== null) {
      return res.status(400).json({ error: '本日は既に退勤打刻済みです' });
    }

    // clock_out_at を省略した場合はサーバー時刻(NOW)を使う。手動修正等で明示指定された場合は、
    // 出勤時刻より前でないかを事前に検証する（省略時はNOW()なので原理上この検証には掛からない）
    let clockOutAt = null;
    if (req.body.clock_out_at !== undefined) {
      const parsed = new Date(req.body.clock_out_at);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'clock_out_at の形式が不正です' });
      }
      if (parsed < new Date(existing.rows[0].clock_in_at)) {
        return res.status(400).json({ error: '退勤時刻は出勤時刻より後にしてください' });
      }
      clockOutAt = parsed;
    }

    const { rows } = await pool.query(
      clockOutAt
        ? 'UPDATE attendance_records SET clock_out_at = $3 WHERE employee_id = $1 AND work_date = $2 AND clock_out_at IS NULL RETURNING *'
        : 'UPDATE attendance_records SET clock_out_at = NOW() WHERE employee_id = $1 AND work_date = $2 AND clock_out_at IS NULL RETURNING *',
      clockOutAt ? [employeeId, workDate, clockOutAt] : [employeeId, workDate]
    );
    if (rows.length === 0) {
      // 直前のチェックとUPDATEの間に別リクエストが退勤打刻を完了させた（レース）
      return res.status(400).json({ error: '本日は既に退勤打刻済みです' });
    }
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = router;
