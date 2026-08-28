# アーキテクチャドキュメント

## 1. システム概要

Node.js + Express + PostgreSQL で構築された勤怠記録アプリ（`kintai-app`）。社員は出勤・退勤の打刻、休暇申請の登録・確認を行う。管理者は社員情報の登録・一覧・削除ができる。社員ごとの月次勤務時間の集計、当月の出勤・欠勤・休暇の日数のサマリー表示、月次レポート（出勤日数・遅刻回数・総勤務時間）の確認ができる。

承認ワークフロー・工数登録機能・AD連携はスコープ外（詳細は`docs/requirements.md`参照）。

## 2. 技術スタック一覧

| 種別 | 技術 | 理由 |
|---|---|---|
| ランタイム | Node.js | Month 1と同じスタックで統一 |
| Webフレームワーク | Express 4 | シンプルなルーティング・ミドルウェア |
| DB | PostgreSQL | リレーショナルなデータ整合性・トランザクションが必要 |
| DBクライアント | pg (node-postgres) | パラメータ化クエリでSQLインジェクションを防止 |
| テスト | Jest + supertest | APIテストとDBモックを1つのフレームワークで完結 |
| フロントエンド | 素のHTML/CSS/JS | ビルド不要でexpress.staticから直接配信 |
| プロセス管理（本番） | PM2 | EC2上でのデーモン化・再起動管理 |
| リバースプロキシ（本番） | Nginx | 8080番ポートでの待受とNode(3001番)へのプロキシ |
| CI/CD | GitHub Actions | push時のテスト・EC2への自動デプロイ |
| AI協働 | Claude Code Subagents / Agent Teams | backend-architect / frontend-developer / security-auditorの専門化、追加機能はAgent Teamsで並列実装 |

## 3. ディレクトリ構成と各ファイルの役割

```
advanced-issue/
├── src/
│   ├── index.js               # Expressサーバーのエントリポイント
│   ├── db/
│   │   └── pool.js            # PostgreSQL接続プール
│   └── routes/
│       ├── employees.js       # 社員CRUD・月次サマリー・月次レポート
│       ├── attendance.js      # 出退勤打刻・一覧取得
│       └── leaveRequests.js   # 休暇申請の登録・一覧
├── public/
│   ├── index.html             # 社員一覧画面（登録・削除）
│   ├── form.html              # 打刻フォーム（出勤/退勤）
│   ├── report.html            # 月次レポート画面（C-後半で追加）
│   └── style.css              # 共通スタイル
├── db/migrations/
│   └── 001_create_kintai_schema.sql  # 4テーブル作成＋2026年祝日データ投入
├── __tests__/routes/          # employees/attendance/leaveRequestsの単体テスト
├── .claude/
│   ├── agents/                # backend-architect, frontend-developer, security-auditor
│   └── settings.json          # Agent Teams有効化設定
├── .github/workflows/
│   ├── ci.yml                 # テスト・カバレッジ計測
│   └── deploy.yml             # EC2への自動デプロイ
├── docs/                      # 要件定義・Subagent定義・Agent Teams設計・タスクログ・本ドキュメント
└── CLAUDE.md                  # プロジェクト規約・Agent Team役割定義
```

## 4. データフロー図

```
┌───────────┐   HTTP (fetch)   ┌──────────────────┐   SQL (pg)   ┌──────────────┐
│  ブラウザ   │ ───────────────▶ │  Express サーバー   │ ───────────▶ │  PostgreSQL   │
│(index/form │ ◀─────────────── │  (src/index.js)   │ ◀─────────── │ (4テーブル)    │
│ /report)   │   JSON レスポンス  └──────────────────┘   クエリ結果   └──────────────┘
└───────────┘
```

`index.js`は`src/routes/`配下の3つのルーターのみを直接requireし、各ルーターが`src/db/pool.js`経由でDBにアクセスする。

## 5. APIエンドポイント一覧

### 社員 (`/api/employees`)

| メソッド | パス | 概要 |
|---|---|---|
| GET | `/api/employees` | 社員一覧を取得する |
| GET | `/api/employees/:id` | 社員の詳細を取得する |
| POST | `/api/employees` | 社員を新規登録する（`employee_number`は一意） |
| DELETE | `/api/employees/:id` | 社員を削除する |
| GET | `/api/employees/:id/summary?year=&month=` | 月次の出勤/欠勤/休暇日数・総勤務時間を取得する（C-前半） |
| GET | `/api/employees/:id/monthly-report?year=&month=` | 月次の出勤日数・遅刻回数・総勤務時間を取得する（C-後半で追加） |

`late_count`は始業時刻9:00（JST）を基準に、`clock_in_at`がそれより後だった日数をカウントする。

### 勤怠打刻 (`/api/attendance`)

| メソッド | パス | 概要 |
|---|---|---|
| GET | `/api/attendance?employee_id=&year=&month=` | 指定社員・月の打刻一覧を取得する |
| POST | `/api/attendance/clock-in` | 出勤打刻を登録する |
| POST | `/api/attendance/clock-out` | 退勤打刻を登録する。body: `{ employee_id, clock_out_at? }`。`clock_out_at`省略時はサーバー時刻を使用。明示指定時は出勤時刻より前でないかを検証する（C-後半で追加） |

### 休暇申請 (`/api/leave-requests`)

| メソッド | パス | 概要 |
|---|---|---|
| GET | `/api/leave-requests?employee_id=` | 指定社員の休暇申請一覧を取得する |
| POST | `/api/leave-requests` | 休暇申請を登録する |

エラー時は共通で`{ error: "メッセージ" }`形式で400/404/500を返す。

## 6. DBスキーマ

**employees（社員）**

| カラム | 型 | 制約 |
|---|---|---|
| id | BIGSERIAL | PRIMARY KEY |
| name | TEXT | NOT NULL |
| employee_number | TEXT | NOT NULL, UNIQUE |
| department | TEXT | - |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**attendance_records（勤怠打刻）**

| カラム | 型 | 制約 |
|---|---|---|
| id | BIGSERIAL | PRIMARY KEY |
| employee_id | BIGINT | NOT NULL, FK → employees(id) ON DELETE CASCADE |
| work_date | DATE | NOT NULL |
| clock_in_at | TIMESTAMPTZ | null可 |
| clock_out_at | TIMESTAMPTZ | null可 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| - | - | UNIQUE (employee_id, work_date) |

**leave_requests（休暇申請）**

| カラム | 型 | 制約 |
|---|---|---|
| id | BIGSERIAL | PRIMARY KEY |
| employee_id | BIGINT | NOT NULL, FK → employees(id) ON DELETE CASCADE |
| start_date | DATE | NOT NULL |
| end_date | DATE | NOT NULL, CHECK (end_date >= start_date) |
| reason | TEXT | null可 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**holidays（祝日マスタ）**

| カラム | 型 | 制約 |
|---|---|---|
| date | DATE | PRIMARY KEY |
| name | TEXT | NOT NULL |

2026年の祝日17件（振替休日含む）をマイグレーションでシード済み。春分の日・秋分の日は近似値。

## 7. 環境変数一覧

| 変数名 | 説明 | ローカル例 | 本番(EC2)例 |
|---|---|---|---|
| DB_HOST | PostgreSQLホスト | `localhost` | `localhost` |
| DB_PORT | PostgreSQLポート | `5432` | `5432` |
| DB_NAME | データベース名 | `advanced_issue_db` | `kintai_db` |
| DB_USER | DB接続ユーザー | `todo_user` | `kintai_user` |
| DB_PASSWORD | DB接続パスワード | （秘匿情報） | （秘匿情報） |
| PORT | Expressの待受ポート | `3003` | `3001`（nginxが8080から中継） |

## 8. ローカル開発の起動手順

```bash
npm install
cp .env.example .env   # ローカルのPostgreSQL接続情報に書き換える

createdb <DB_NAME>
psql -h localhost -U <DB_USER> -d <DB_NAME> -f db/migrations/001_create_kintai_schema.sql

npm start          # 通常起動
npm run dev        # nodemonによる監視付き起動

npm test                 # テスト実行
npm run test:coverage    # カバレッジ計測付き
```

## 9. 本番環境（EC2）構成

- インスタンス: `0909-takagi-ec2`（05_EC2デプロイで使用したインスタンスを再利用）
- デプロイ先: `~/kintai-app`（既存の`~/app`＝my-claude-project TODOアプリとは別ディレクトリで共存）
- 内部ポート3001 ← nginx（`listen 8080`）が外部公開
- PM2プロセス名: `kintai-app`
- CI/CD: `main`へのpushで`ci.yml`→`deploy.yml`が自動実行（`git fetch`＋`reset --hard`でローカル差分を排除してからデプロイ）
