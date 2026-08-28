'use strict';

const request = require('supertest');
const express = require('express');

// pool.js をモック --- 実 DB には接続しない
jest.mock('../../src/db/pool', () => ({ query: jest.fn() }));
const pool = require('../../src/db/pool');

const app = express();
app.use(express.json());
app.use('/api/employees', require('../../src/routes/employees'));

beforeEach(() => {
  pool.query.mockClear();
});

// ─────────────────────────────
// GET /api/employees
// ─────────────────────────────
describe('GET /api/employees', () => {
  test('正常系: 200と一覧を返す', async () => {
    // Arrange
    const rows = [{ id: 1, name: '山田太郎', employee_number: 'E001' }];
    pool.query.mockResolvedValueOnce({ rows });
    // Act
    const res = await request(app).get('/api/employees');
    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });

  test('異常系: DBエラー時に500を返す', async () => {
    pool.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────
// GET /api/employees/:id
// ─────────────────────────────
describe('GET /api/employees/:id', () => {
  test('正常系: 存在するIDのとき200を返す', async () => {
    const row = { id: 1, name: '山田太郎' };
    pool.query.mockResolvedValueOnce({ rows: [row] });
    const res = await request(app).get('/api/employees/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(row);
  });

  test('異常系: 存在しないIDのとき404を返す', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/employees/999');
    expect(res.status).toBe(404);
  });

  test('異常系: IDが非数値のとき400を返しDBは呼ばれない', async () => {
    const res = await request(app).get('/api/employees/abc');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────
// POST /api/employees
// ─────────────────────────────
describe('POST /api/employees', () => {
  test('正常系: 登録できて201を返す', async () => {
    const created = { id: 1, name: '山田太郎', employee_number: 'E001', department: '営業' };
    pool.query.mockResolvedValueOnce({ rows: [created] });
    const res = await request(app)
      .post('/api/employees')
      .send({ name: '山田太郎', employee_number: 'E001', department: '営業' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });

  test('異常系: nameが空のとき400を返しDBは呼ばれない', async () => {
    const res = await request(app).post('/api/employees').send({ employee_number: 'E001' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('異常系: employee_numberが空のとき400を返す', async () => {
    const res = await request(app).post('/api/employees').send({ name: '山田太郎', employee_number: '' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('異常系: employee_number重複時に400を返す', async () => {
    const dupError = new Error('duplicate key value violates unique constraint');
    dupError.code = '23505';
    pool.query.mockRejectedValueOnce(dupError);
    const res = await request(app)
      .post('/api/employees')
      .send({ name: '重複太郎', employee_number: 'E001' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('employee_number');
  });

  test('異常系: DBエラー時に500を返す', async () => {
    pool.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .post('/api/employees')
      .send({ name: '山田太郎', employee_number: 'E001' });
    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────
// DELETE /api/employees/:id
// ─────────────────────────────
describe('DELETE /api/employees/:id', () => {
  test('正常系: 削除できて204を返す', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/api/employees/1');
    expect(res.status).toBe(204);
  });

  test('異常系: 存在しないIDのとき404を返す', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app).delete('/api/employees/999');
    expect(res.status).toBe(404);
  });

  test('異常系: IDが非数値のとき400を返す', async () => {
    const res = await request(app).delete('/api/employees/abc');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────
// GET /api/employees/:id/summary
// ─────────────────────────────
describe('GET /api/employees/:id/summary', () => {
  test('正常系: 出勤/欠勤/休暇日数と勤務時間を返す', async () => {
    // Arrange: employeeCheck → holiday → attendance → leave の順でモック
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // holiday
      .mockResolvedValueOnce({ rows: [{ attended_days: '1', total_minutes: '480' }] }) // attendance
      .mockResolvedValueOnce({ rows: [{ leave_days: '2' }] }); // leave

    // Act
    const res = await request(app).get('/api/employees/1/summary?year=2026&month=8');

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      employee_id: 1,
      year: 2026,
      month: 8,
      attended_days: 1,
      absent_days: 17, // 21平日 - 1祝日 - 1出勤 - 2休暇
      leave_days: 2,
      total_work_minutes: 480,
      total_work_hours: 8,
    });
  });

  test('異常系: 存在しない社員IDのとき404を返す', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // employeeCheck
    const res = await request(app).get('/api/employees/999/summary?year=2026&month=8');
    expect(res.status).toBe(404);
  });

  test('異常系: monthが範囲外(13)のとき400を返しDBは呼ばれない', async () => {
    const res = await request(app).get('/api/employees/1/summary?year=2026&month=13');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('異常系: yearが数値でないとき400を返す', async () => {
    const res = await request(app).get('/api/employees/1/summary?year=abc&month=8');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────
// GET /api/employees/:id/monthly-report
// ─────────────────────────────
describe('GET /api/employees/:id/monthly-report', () => {
  test('正常系: 遅刻ありのケースで200と正しい集計結果を返す', async () => {
    // Arrange: employeeCheck → attendance集計 の順でモック
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ attended_days: '20', late_count: '3', total_minutes: '9600' }] }); // attendance集計

    // Act
    const res = await request(app).get('/api/employees/1/monthly-report?year=2026&month=8');

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      employee_id: 1,
      year: 2026,
      month: 8,
      attended_days: 20,
      late_count: 3,
      total_work_minutes: 9600,
      total_work_hours: 160,
    });
  });

  test('正常系: 遅刻なしのケースで200を返す（late_count: 0）', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ attended_days: '15', late_count: '0', total_minutes: '7200' }] }); // attendance集計

    const res = await request(app).get('/api/employees/1/monthly-report?year=2026&month=8');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      employee_id: 1,
      year: 2026,
      month: 8,
      attended_days: 15,
      late_count: 0,
      total_work_minutes: 7200,
      total_work_hours: 120,
    });
  });

  test('異常系: 存在しない社員IDのとき404を返す', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // employeeCheck
    const res = await request(app).get('/api/employees/999/monthly-report?year=2026&month=8');
    expect(res.status).toBe(404);
  });

  test('異常系: monthが範囲外(13)のとき400を返しDBは呼ばれない', async () => {
    const res = await request(app).get('/api/employees/1/monthly-report?year=2026&month=13');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('異常系: yearが数値でないとき400を返す', async () => {
    const res = await request(app).get('/api/employees/1/monthly-report?year=abc&month=8');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('異常系: IDが非数値のとき400を返す', async () => {
    const res = await request(app).get('/api/employees/abc/monthly-report?year=2026&month=8');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
