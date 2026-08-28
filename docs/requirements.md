# 要件定義書

## システム概要

企業や事業者に所属する社員が日々使用する勤怠記録アプリ。社員は出勤・退勤の打刻、休暇申請の登録・確認を行う。管理者は社員情報の登録・一覧・削除ができる。社員ごとの月次勤務時間の集計や、当月の出勤・欠勤・休暇の日数をサマリーとして確認できる。勤怠計算や給与計算に活用できるデータを蓄積・可視化する。

**スコープ外（今回は対象外とする機能）:**
- 承認ワークフロー（休暇申請は登録・一覧のみ。承認・却下の機能は持たない）
- 工数登録機能
- AD（Active Directory）等の外部システム連携

## 画面一覧

C-前半では研修PDF記載のテーマB最小要件に合わせ、2画面（index.html, form.html）のみを実装した。C-後半でAgent Teamsにより月次レポート画面を追加した。

| 画面名 | 主な操作 |
|---|---|
| 社員一覧画面（index.html） | 社員リスト表示・社員登録・削除。打刻フォーム・月次レポートへのリンクあり |
| 打刻フォーム（form.html） | 社員選択・出勤/退勤ボタン |
| 月次レポート画面（report.html、C-後半で追加） | 社員・年月を選択し、出勤日数・遅刻回数・総勤務時間を表示する |

休暇申請・月次サマリー（勤務表画面）は要件3・4・5としてAPIは実装しているが、画面は用意せずcurlでの動作確認に留めている。

## APIエンドポイント一覧

| メソッド | パス | 概要 |
|---|---|---|
| GET | `/api/employees` | 社員一覧を取得する |
| GET | `/api/employees/:id` | 社員の詳細を取得する |
| POST | `/api/employees` | 社員を新規登録する |
| DELETE | `/api/employees/:id` | 社員を削除する |
| GET | `/api/attendance?employee_id=&year=&month=` | 指定社員・月の打刻一覧を取得する（勤務表画面） |
| POST | `/api/attendance/clock-in` | 出勤打刻を登録する |
| POST | `/api/attendance/clock-out` | 退勤打刻を登録する。body: `{ employee_id, clock_out_at? }`（`clock_out_at`任意、省略時はサーバー時刻。明示時は出勤時刻より前でないか検証する。C-後半で拡張） |
| GET | `/api/employees/:id/summary?year=&month=` | 指定月の勤務時間集計・出勤/欠勤/休暇日数を取得する |
| GET | `/api/employees/:id/monthly-report?year=&month=` | 指定月の出勤日数・遅刻回数・総勤務時間を取得する（C-後半で追加）。`late_count`は始業時刻9:00(JST)基準 |
| GET | `/api/leave-requests?employee_id=` | 休暇申請一覧を取得する |
| POST | `/api/leave-requests` | 休暇申請を登録する |

## DBテーブル設計

**employees（社員）**
| カラム | 型 | 制約 |
|---|---|---|
| id | BIGSERIAL | PRIMARY KEY |
| name | TEXT | NOT NULL |
| employee_number | TEXT | NOT NULL, UNIQUE（社員番号） |
| department | TEXT | （所属） |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**attendance_records（勤怠打刻）**
| カラム | 型 | 制約 |
|---|---|---|
| id | BIGSERIAL | PRIMARY KEY |
| employee_id | BIGINT | NOT NULL, FK → employees(id) |
| work_date | DATE | NOT NULL（対象日） |
| clock_in_at | TIMESTAMPTZ | （出勤時刻、null可） |
| clock_out_at | TIMESTAMPTZ | （退勤時刻、null可） |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**leave_requests（休暇申請）**
| カラム | 型 | 制約 |
|---|---|---|
| id | BIGSERIAL | PRIMARY KEY |
| employee_id | BIGINT | NOT NULL, FK → employees(id) |
| start_date | DATE | NOT NULL |
| end_date | DATE | NOT NULL |
| reason | TEXT | （任意） |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**holidays（祝日マスタ）**
| カラム | 型 | 制約 |
|---|---|---|
| date | DATE | PRIMARY KEY |
| name | TEXT | NOT NULL（祝日名） |

2026年分の祝日データ（振替休日含む）をマイグレーションでシードする。春分の日・秋分の日は天文計算に基づく近似値（3/20, 9/23）を採用し、公式発表とずれる可能性がある前提とする。

**欠勤日数の計算ロジック（`summary` API）:**
```
欠勤日数 = 当月の平日日数（土日を除く）
         − holidaysテーブルに存在する当月の日数
         − 出勤日数（attendance_recordsでclock_in_atが記録されている日数）
         − 休暇日数（leave_requestsの日数、start_date〜end_dateの当月分）
```

## 状態遷移

該当なし（承認ワークフローをスコープ外としたため、ステータス管理は行わない）。
