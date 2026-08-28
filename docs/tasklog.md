# タスクログ

### 課題C：勤怠記録アプリ
- ゴール（C-前半）：ローカルで基本CRUDとフロントエンドが動く状態
- ゴール（C-後半）：追加機能実装・EC2デプロイ完了
- 分解（C-前半）：
  - STEP1 要件定義書作成
  - STEP2 subagent定義
  - STEP3 DB設計、マイグレーション
  - STEP4 基本CRUD実装
  - STEP5 テスト追加
  - STEP6 フロントエンド実装
- 検証：正常系→要件や仕様通りであること、異常系→要件や仕様と差分が発生すること、テスト時にエラーが起き全体のカバレッジが70%を下回る事
- 失敗予測：渡している要件や設計のみで作成するため、何かチェック処理等に不足の漏れが発生する（しかし全体のテスト時にfindしやすい）、テストケースの作成が不十分で網羅できない事象やパターンが発生する

### 選択テーマ：B 勤怠記録アプリ

**機能要件:**
1. 社員（employees）の登録・一覧・削除ができる
2. 出勤・退勤の打刻ができる（日時を記録）
3. 休暇申請（leave_requests）の登録・一覧ができる
4. 社員ごとの月次勤務時間を集計できる
5. 当月の出勤・欠勤・休暇の日数を表示できる

**非機能要件:**
- N1: Node.js + Express + PostgreSQL のスタック（Month 1と同じ）
- N2: テストカバレッジ 70% 以上
- N3: コメントは日本語
- N4: tasklog.md にタスクログを記録する
- N5: docs/architecture.md を作成する
- N6: GitHub にプッシュする

### STEP1 完了記録：要件定義書のブラッシュアップ

- 自分で書いた叩き台をベースに、Claudeとの答え合わせでスコープを整理
- スコープ外に決定：承認ワークフロー、工数登録機能、AD連携（元の5要件に無く、演習規模を超えるため）
- 要件4・5（月次集計・当月サマリー）用に `GET /api/employees/:id/summary` を追加（記載漏れの修正）
- 欠勤日数の算出は土日・祝日を除外する方式とし、祝日は`holidays`テーブルで管理（2026年分をマイグレーションでシード、春分・秋分の日は近似値）
- 確定内容は `docs/requirements.md` に記録

### STEP2 完了記録：Subagent定義
- `docs/agents.md` に backend-architect / frontend-developer / security-auditor の役割定義を記載
- `.claude/agents/` 配下に3つのSubagentファイルを作成
- Subagentの実際の起動・並列委任の動作確認はターミナルで別途実施する方針

### STEP3 完了記録：DB設計・マイグレーション
- `db/migrations/001_create_kintai_schema.sql` を作成（employees, attendance_records, leave_requests, holidays の4テーブル）
- `advanced_issue_db` に適用し `\dt` で4テーブルの存在を確認、holidaysに17件のシードデータが入っていることも確認

### STEP4 完了記録：基本CRUD実装
- `src/routes/employees.js`（一覧・単一取得・登録・削除・月次サマリー）、`src/routes/attendance.js`（一覧・出勤打刻・退勤打刻）、`src/routes/leaveRequests.js`（一覧・登録）を実装
- curlで全エンドポイントを確認：社員登録/一覧/重複エラー(400)、出勤打刻/二重打刻エラー(400)/退勤打刻/存在しない社員(404)、休暇申請登録/一覧、勤怠一覧、月次サマリー
- 月次サマリーの欠勤日数計算を手計算で検証し一致を確認（2026年8月: 平日21日−祝日1日−出勤1日−休暇2日=欠勤17日）

### 画面一覧の修正
- PDF末尾「テーマ別：実装する画面」の記載に気づき、docs/requirements.mdの画面一覧を4画面→2画面（社員一覧画面index.html、打刻フォームform.html）に修正
- 休暇申請・月次サマリーはAPIのみでC-前半では画面化しない（月次レポート画面はC-後半で追加予定）

### STEP5 完了記録：テスト追加
- `__tests__/routes/`にemployees.test.js・attendance.test.js・leaveRequests.test.jsを作成（正常系・異常系を網羅、pool.jsをjest.mockでモック）
- `npm run test:coverage`で36件全テストグリーン、カバレッジ Stmts 89.44% / Branch 91.56% / Funcs 100% / Lines 89.14%（閾値70%を全項目で上回る）

### STEP6 完了記録：フロントエンド実装
- `public/style.css`（共通スタイル）、`public/index.html`（社員一覧・登録・削除）、`public/form.html`（社員選択・出勤/退勤打刻）を実装
- ブラウザで実際に確認：登録済みデータの一覧表示、フォームからの新規登録（Yusuke Takagi / E002を追加）が一覧に反映、打刻フォームのセレクトボックスへの反映、コンソールにエラーなしを確認済み

## C-後半

### STEP1 完了記録：Agent Teams設計
- 自分で書いた叩き台をベースに、Claudeとの答え合わせで「タスクの依存関係（完全順次）」と「並列実行できるタスク（Backend/Frontend並列）」の矛盾を発見・修正
- 解決策として、月次レポートAPI・退勤バリデーション強化のAPIコントラクトを先に確定し、それをもとにBackend AgentとFrontend Agentを並列実行する設計を採用
- `docs/agent-teams.md`に確定内容を記録（Agent構成の担当タスクも具体的なファイルパスまで明記するよう修正）

### 課題C-後半：追加機能実装
- Agent Teamsへの依頼内容：
  - `docs/agent-teams.md`のAPIコントラクト（① `GET /api/employees/:id/monthly-report`、② `POST /api/attendance/clock-out`への退勤時刻バリデーション追加）を事前確定として提示し、Backend Agent（`src/routes/employees.js`・`src/routes/attendance.js`）とFrontend Agent（`public/report.html`新規作成・`index.html`へのリンク追加・`form.html`のエラー表示確認）を並列起動
  - Backend Agent完了後にTest Agent（`__tests__/routes/`へのテスト追加・`npm test`実行）を起動、Backend/Frontend/Test全員の完了後にReview Agent（コントラクト整合性・セキュリティ・コード品質レビュー）を起動、という依存関係で実行
- 各Agentの出力で気になった点：
  - Backend Agent：指示通り`clock_in_at <= NOW()`をSQLのWHERE句に入れてクロックスキューを回避する実装は正確だったが、同時に2件の退勤打刻リクエストが来た場合の二重更新（レース条件）には自ら気づかず、そこはReview Agentの指摘で判明した
  - Frontend Agent：`form.html`について「既存の汎用エラー表示ロジックで新しいエラーメッセージも表示できるため変更不要」と自己判断し、不要な修正を加えなかった点は良い判断だった
- 統合時に自分で修正した箇所：
  - Review Agentの指摘を受け、`src/routes/attendance.js`のclock-out更新クエリのWHERE句に`AND clock_out_at IS NULL`を追加（同時打刻時の二重更新防止）。修正後に`npm test`を再実行し43/43件成功を確認
- 期待と違った箇所・なぜそうなったか：
  - Review Agentに`security-auditor`サブエージェントを割り当てたところ、使用可能ツールがRead/Grep/Globのみで`npm test`を自ら実行できず、静的レビューのみでの判定になった（サブエージェント種別ごとのツール権限差を考慮していなかったため）。実行結果の確認はオーケストレーター側（自分）が代わりに`npm test`を実施して補った

### 追加修正：退勤バリデーションの実効性強化
- Claudeとの評価で、`clock_in_at <= NOW()`によるSQL側チェックは、出勤・退勤どちらもサーバー時刻`NOW()`から生成されるため実質的に発火し得ない（要件の文言は満たすが意図を検証できていない）ことが判明
- `POST /api/attendance/clock-out`に任意項目`clock_out_at`（ISO 8601）を追加。明示指定時のみ出勤時刻との前後関係を検証し、省略時は従来通り`NOW()`を使う設計に変更
- レース条件（同時打刻）と時刻バリデーションのエラーメッセージも分離（前者「本日は既に退勤打刻済みです」、後者「退勤時刻は出勤時刻より後にしてください」）
- テストを実際に意味のあるシナリオ（`clock_out_at`を明示的に出勤時刻より前に指定）へ修正し、curlで実サーバーに対しても400/200が期待通り返ることを確認。`npm test`は46/46件成功、カバレッジも70%超を維持

### STEP6：EC2デプロイ
- `advanced-issue`をGitHubにpush（C-前半の未実施分もここでまとめて実施）
- EC2（`0909-takagi-ec2`, 3.113.204.109）は05_EC2デプロイで使ったインスタンスを再利用していると判明。既存の`~/app`（my-claude-projectのTODOアプリ）はそのまま残し、kintaiアプリは`~/kintai-app`という別ディレクトリ・別DB（`kintai_db`/`kintai_user`）・別内部ポート(3001)でデプロイする方針にした（05_EC2デプロイとCICD.mdの手順を参考にしたため、ここに記録）
- nginxに新規`server`ブロック（`listen 8080` → `proxy_pass http://localhost:3001`）を追加し、両アプリを共存させた
- AWS CLIがこのサンドボックスでは別アカウントに認証されておりセキュリティグループを操作できなかったため、ポート8080の開放はコンソールで手動対応してもらった（ソースは既存ルールとの一貫性を優先し0.0.0.0/0を選択）
- `http://3.113.204.109:8080`で外部からの疎通・社員登録/一覧/削除を確認。既存TODOアプリ（ポート80）も引き続き生存していることを確認
- GitHub Secrets（EC2_HOST/EC2_USER/EC2_KEY/DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD/GH_TOKEN）を登録し、GitHub Actions（CI・Deploy to EC2）が自動実行され両方successで完了したことをAPI経由で確認
- ブラウザで`http://3.113.204.109:8080`にアクセスし、社員一覧・打刻フォーム・月次レポートの画面遷移とデータ反映を確認
- 実データでC-後半追加機能を検証：出勤打刻→月次レポートで出勤日数1日・遅刻1回を正しく反映、退勤バリデーション（出勤時刻より前を明示指定→400、通常の退勤→200）も実サーバーで動作確認
- STEP6完了確認チェックリスト（基本CRUD/追加機能/フロントエンド/CI-CD）全項目クリア

### 別途対応：SSH秘密鍵の誤共有
- キーペア(`0909-takagi-keypair.pem`)の中身がチャットに貼り付けられ露出した。研修用の個人インスタンスのため緊急対応はせずスキップと判断（記録のみ残す）
