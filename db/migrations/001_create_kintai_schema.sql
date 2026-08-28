-- 勤怠記録アプリ 初期スキーマ作成
-- 社員・勤怠打刻・休暇申請・祝日マスタの4テーブルを作成する

-- 社員テーブル
CREATE TABLE employees (
  id              BIGSERIAL    PRIMARY KEY,
  name            TEXT         NOT NULL,
  employee_number TEXT         NOT NULL UNIQUE,
  department      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 勤怠打刻テーブル（社員・対象日の組み合わせで1レコード、出勤・退勤時刻を保持する）
CREATE TABLE attendance_records (
  id           BIGSERIAL    PRIMARY KEY,
  employee_id  BIGINT       NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date    DATE         NOT NULL,
  clock_in_at  TIMESTAMPTZ,
  clock_out_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, work_date)
);

-- 休暇申請テーブル（開始日・終了日の期間で申請を管理する）
CREATE TABLE leave_requests (
  id          BIGSERIAL    PRIMARY KEY,
  employee_id BIGINT       NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

-- 祝日マスタテーブル（欠勤日数の算出で土日祝日を除外するために使用する）
CREATE TABLE holidays (
  date DATE PRIMARY KEY,
  name TEXT NOT NULL
);

-- 2026年の祝日データを投入する（春分の日・秋分の日は天文計算に基づく近似値、振替休日を含む）
INSERT INTO holidays (date, name) VALUES
  ('2026-01-01', '元日'),
  ('2026-01-12', '成人の日'),
  ('2026-02-11', '建国記念の日'),
  ('2026-02-23', '天皇誕生日'),
  ('2026-03-20', '春分の日'),
  ('2026-04-29', '昭和の日'),
  ('2026-05-03', '憲法記念日'),
  ('2026-05-04', 'みどりの日'),
  ('2026-05-05', 'こどもの日'),
  ('2026-05-06', '振替休日'),
  ('2026-07-20', '海の日'),
  ('2026-08-11', '山の日'),
  ('2026-09-21', '敬老の日'),
  ('2026-09-23', '秋分の日'),
  ('2026-10-12', 'スポーツの日'),
  ('2026-11-03', '文化の日'),
  ('2026-11-23', '勤労感謝の日');
