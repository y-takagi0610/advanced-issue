'use strict';

const request = require('supertest');
const express = require('express');

jest.mock('../../src/db/pool', () => ({ query: jest.fn() }));
const pool = require('../../src/db/pool');

const app = express();
app.use(express.json());
app.use('/api/attendance', require('../../src/routes/attendance'));

beforeEach(() => {
  pool.query.mockClear();
});

// ─────────────────────────────
// GET /api/attendance
// ─────────────────────────────
describe('GET /api/attendance', () => {
  test('正常系: 指定社員・月の一覧を返す', async () => {
    const rows = [{ id: 1, employee_id: 1, work_date: '2026-08-01' }];
    pool.query.mockResolvedValueOnce({ rows });
    const res = await request(app).get('/api/attendance?employee_id=1&year=2026&month=8');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });

  test('異常系: employee_idが無いとき400を返しDBは呼ばれない', async () => {
    const res = await request(app).get('/api/attendance?year=2026&month=8');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('異常系: monthが不正なとき400を返す', async () => {
    const res = await request(app).get('/api/attendance?employee_id=1&year=2026&month=0');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────
// POST /api/attendance/clock-in
// ─────────────────────────────
describe('POST /api/attendance/clock-in', () => {
  test('正常系: 出勤打刻できて201を返す', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [] }) // existing（未打刻）
      .mockResolvedValueOnce({ rows: [{ id: 1, employee_id: 1, clock_in_at: '2026-08-28T00:00:00Z' }] }); // insert
    const res = await request(app).post('/api/attendance/clock-in').send({ employee_id: 1 });
    expect(res.status).toBe(201);
  });

  test('異常系: 存在しない社員IDのとき404を返す', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // employeeCheck
    const res = await request(app).post('/api/attendance/clock-in').send({ employee_id: 999 });
    expect(res.status).toBe(404);
  });

  test('異常系: 本日既に出勤打刻済みのとき400を返す', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ clock_in_at: '2026-08-28T00:00:00Z' }] }); // existing（打刻済み）
    const res = await request(app).post('/api/attendance/clock-in').send({ employee_id: 1 });
    expect(res.status).toBe(400);
  });

  test('異常系: employee_idが無いとき400を返しDBは呼ばれない', async () => {
    const res = await request(app).post('/api/attendance/clock-in').send({});
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────
// POST /api/attendance/clock-out
// ─────────────────────────────
describe('POST /api/attendance/clock-out', () => {
  test('正常系: 退勤打刻できて200を返す', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ clock_in_at: '2026-08-28T00:00:00Z', clock_out_at: null }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: 1, clock_out_at: '2026-08-28T09:00:00Z' }] }); // update
    const res = await request(app).post('/api/attendance/clock-out').send({ employee_id: 1 });
    expect(res.status).toBe(200);
  });

  test('異常系: 出勤打刻がないとき400を返す', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [] }); // existing（打刻記録なし）
    const res = await request(app).post('/api/attendance/clock-out').send({ employee_id: 1 });
    expect(res.status).toBe(400);
  });

  test('異常系: 既に退勤打刻済みのとき400を返す', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ clock_in_at: '2026-08-28T00:00:00Z', clock_out_at: '2026-08-28T09:00:00Z' }] }); // existing
    const res = await request(app).post('/api/attendance/clock-out').send({ employee_id: 1 });
    expect(res.status).toBe(400);
  });

  test('異常系: 存在しない社員IDのとき404を返す', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // employeeCheck
    const res = await request(app).post('/api/attendance/clock-out').send({ employee_id: 999 });
    expect(res.status).toBe(404);
  });

  test('異常系: clock_out_atを明示指定し出勤時刻より前のとき400を返す（UPDATEは呼ばれない）', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ clock_in_at: '2026-08-28T09:00:00Z', clock_out_at: null }] }); // existing
    const res = await request(app)
      .post('/api/attendance/clock-out')
      .send({ employee_id: 1, clock_out_at: '2026-08-28T08:00:00Z' }); // 出勤(09:00)より前の退勤(08:00)
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '退勤時刻は出勤時刻より後にしてください' });
    expect(pool.query).toHaveBeenCalledTimes(2); // UPDATEは実行されない
  });

  test('正常系: clock_out_atを明示指定し出勤時刻より後のとき200を返す', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ clock_in_at: '2026-08-28T09:00:00Z', clock_out_at: null }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: 1, clock_out_at: '2026-08-28T18:00:00Z' }] }); // update
    const res = await request(app)
      .post('/api/attendance/clock-out')
      .send({ employee_id: 1, clock_out_at: '2026-08-28T18:00:00Z' });
    expect(res.status).toBe(200);
  });

  test('異常系: clock_out_atの形式が不正なとき400を返す', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ clock_in_at: '2026-08-28T09:00:00Z', clock_out_at: null }] }); // existing
    const res = await request(app)
      .post('/api/attendance/clock-out')
      .send({ employee_id: 1, clock_out_at: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  test('異常系: レース条件（UPDATE対象0件）のとき「既に退勤打刻済み」を返す', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [{ clock_in_at: '2026-08-28T00:00:00Z', clock_out_at: null }] }) // existing
      .mockResolvedValueOnce({ rows: [] }); // update（別リクエストが先に退勤済みにしていた）
    const res = await request(app).post('/api/attendance/clock-out').send({ employee_id: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '本日は既に退勤打刻済みです' });
  });
});
