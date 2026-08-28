'use strict';

const request = require('supertest');
const express = require('express');

jest.mock('../../src/db/pool', () => ({ query: jest.fn() }));
const pool = require('../../src/db/pool');

const app = express();
app.use(express.json());
app.use('/api/leave-requests', require('../../src/routes/leaveRequests'));

beforeEach(() => {
  pool.query.mockClear();
});

// ─────────────────────────────
// GET /api/leave-requests
// ─────────────────────────────
describe('GET /api/leave-requests', () => {
  test('正常系: 指定社員の申請一覧を返す', async () => {
    const rows = [{ id: 1, employee_id: 1, start_date: '2026-08-10', end_date: '2026-08-11' }];
    pool.query.mockResolvedValueOnce({ rows });
    const res = await request(app).get('/api/leave-requests?employee_id=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });

  test('異常系: employee_idが無いとき400を返しDBは呼ばれない', async () => {
    const res = await request(app).get('/api/leave-requests');
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────
// POST /api/leave-requests
// ─────────────────────────────
describe('POST /api/leave-requests', () => {
  test('正常系: 登録できて201を返す', async () => {
    const created = { id: 1, employee_id: 1, start_date: '2026-08-10', end_date: '2026-08-11' };
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // employeeCheck
      .mockResolvedValueOnce({ rows: [created] }); // insert
    const res = await request(app)
      .post('/api/leave-requests')
      .send({ employee_id: 1, start_date: '2026-08-10', end_date: '2026-08-11', reason: '私用' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });

  test('異常系: employee_idが無いとき400を返しDBは呼ばれない', async () => {
    const res = await request(app)
      .post('/api/leave-requests')
      .send({ start_date: '2026-08-10', end_date: '2026-08-11' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('異常系: 日付形式が不正なとき400を返す', async () => {
    const res = await request(app)
      .post('/api/leave-requests')
      .send({ employee_id: 1, start_date: '2026/08/10', end_date: '2026-08-11' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('異常系: end_dateがstart_dateより前のとき400を返す', async () => {
    const res = await request(app)
      .post('/api/leave-requests')
      .send({ employee_id: 1, start_date: '2026-08-11', end_date: '2026-08-10' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('異常系: 存在しない社員IDのとき404を返す', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // employeeCheck
    const res = await request(app)
      .post('/api/leave-requests')
      .send({ employee_id: 999, start_date: '2026-08-10', end_date: '2026-08-11' });
    expect(res.status).toBe(404);
  });

  test('異常系: DBエラー時に500を返す', async () => {
    pool.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .post('/api/leave-requests')
      .send({ employee_id: 1, start_date: '2026-08-10', end_date: '2026-08-11' });
    expect(res.status).toBe(500);
  });
});
