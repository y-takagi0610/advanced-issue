const { Router } = require('express');
const pool = require('../db/pool');

const router = Router();

// name・employee_number のバリデーション
function validateEmployeeInput({ name, employee_number }) {
  if (typeof name !== 'string' || name.trim() === '') {
    return 'name は空にできません';
  }
  if (typeof employee_number !== 'string' || employee_number.trim() === '') {
    return 'employee_number は空にできません';
  }
  return null;
}

// 指定した年月の平日（土日を除く）日数を計算する
function countWeekdaysInMonth(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0=日, 6=土
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
  }
  return count;
}

// 一覧取得
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM employees ORDER BY created_at DESC');
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 単一取得
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: '無効な ID です' });
    }

    const { rows } = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '指定された社員が見つかりません' });
    }
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 新規登録
router.post('/', async (req, res) => {
  try {
    const { name, employee_number, department } = req.body;
    const validationError = validateEmployeeInput({ name, employee_number });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { rows } = await pool.query(
      'INSERT INTO employees (name, employee_number, department) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), employee_number.trim(), department ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      // employee_number の UNIQUE制約違反
      return res.status(400).json({ error: 'この employee_number は既に登録されています' });
    }
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 削除
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: '無効な ID です' });
    }

    const { rowCount } = await pool.query('DELETE FROM employees WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: '指定された社員が見つかりません' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 月次サマリー取得（勤務時間集計・出勤/欠勤/休暇日数）
router.get('/:id/summary', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: '無効な ID です' });
    }

    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'year と month を正しく指定してください' });
    }

    const employeeCheck = await pool.query('SELECT 1 FROM employees WHERE id = $1', [id]);
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({ error: '指定された社員が見つかりません' });
    }

    const pad = (n) => String(n).padStart(2, '0');
    const monthStart = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`;

    // 当月の祝日日数（土日と重複しないよう平日の祝日のみカウント）
    const holidayResult = await pool.query(
      'SELECT COUNT(*) AS count FROM holidays WHERE date BETWEEN $1 AND $2 AND EXTRACT(DOW FROM date) NOT IN (0, 6)',
      [monthStart, monthEnd]
    );

    // 出勤日数・総勤務時間（分）
    const attendanceResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE clock_in_at IS NOT NULL) AS attended_days,
         COALESCE(SUM(EXTRACT(EPOCH FROM (clock_out_at - clock_in_at)) / 60), 0) AS total_minutes
       FROM attendance_records
       WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3`,
      [id, monthStart, monthEnd]
    );

    // 休暇日数（当月にかかる分だけを日数按分してカウント）
    const leaveResult = await pool.query(
      `SELECT COALESCE(SUM((LEAST(end_date, $3::date) - GREATEST(start_date, $2::date) + 1)), 0) AS leave_days
       FROM leave_requests
       WHERE employee_id = $1 AND start_date <= $3 AND end_date >= $2`,
      [id, monthStart, monthEnd]
    );

    const weekdayCount = countWeekdaysInMonth(year, month);
    const holidayCount = Number(holidayResult.rows[0].count);
    const attendedDays = Number(attendanceResult.rows[0].attended_days);
    const totalMinutes = Number(attendanceResult.rows[0].total_minutes);
    const leaveDays = Number(leaveResult.rows[0].leave_days);
    const absentDays = Math.max(0, weekdayCount - holidayCount - attendedDays - leaveDays);

    res.status(200).json({
      employee_id: id,
      year,
      month,
      attended_days: attendedDays,
      absent_days: absentDays,
      leave_days: leaveDays,
      total_work_minutes: Math.round(totalMinutes),
      total_work_hours: Math.round((totalMinutes / 60) * 100) / 100,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 月次レポート取得（出勤日数・遅刻回数・総勤務時間）
router.get('/:id/monthly-report', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: '無効な ID です' });
    }

    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'year と month を正しく指定してください' });
    }

    const employeeCheck = await pool.query('SELECT 1 FROM employees WHERE id = $1', [id]);
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({ error: '指定された社員が見つかりません' });
    }

    const pad = (n) => String(n).padStart(2, '0');
    const monthStart = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`;

    // 出勤日数・遅刻回数（始業時刻9:00 JST基準）・総勤務時間（分）
    const attendanceResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE clock_in_at IS NOT NULL) AS attended_days,
         COUNT(*) FILTER (
           WHERE clock_in_at IS NOT NULL
             AND (clock_in_at AT TIME ZONE 'Asia/Tokyo')::time > TIME '09:00:00'
         ) AS late_count,
         COALESCE(SUM(EXTRACT(EPOCH FROM (clock_out_at - clock_in_at)) / 60), 0) AS total_minutes
       FROM attendance_records
       WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3`,
      [id, monthStart, monthEnd]
    );

    const attendedDays = Number(attendanceResult.rows[0].attended_days);
    const lateCount = Number(attendanceResult.rows[0].late_count);
    const totalMinutes = Number(attendanceResult.rows[0].total_minutes);

    res.status(200).json({
      employee_id: id,
      year,
      month,
      attended_days: attendedDays,
      late_count: lateCount,
      total_work_minutes: Math.round(totalMinutes),
      total_work_hours: Math.round((totalMinutes / 60) * 100) / 100,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

module.exports = router;
