# Agent Teams 設計書

## 追加機能の概要

勤怠記録アプリに対して、以下2つの機能を追加する。

- **月次レポートAPI**：社員ごとの月次勤務時間・出勤日数・遅刻回数を返すAPIを追加する
- **バリデーション強化**：退勤打刻が出勤打刻より前の場合はエラーを返す

## APIコントラクト（事前確定・Backend/Frontend共通の前提）

Backend AgentとFrontend Agentを並列実行するため、事前に以下の契約を確定させる。

**① 月次レポートAPI**

`GET /api/employees/:id/monthly-report?year=YYYY&month=M`
- 200: `{ employee_id, year, month, attended_days, late_count, total_work_minutes, total_work_hours }`
- 400: `{ error: "year と month を正しく指定してください" }`
- 404: `{ error: "指定された社員が見つかりません" }`
- `late_count`：始業時刻を9:00（JST）と定義し、`clock_in_at`（JST換算）が9:00より後だった日数をカウントする

**② バリデーション強化（退勤打刻）**

`POST /api/attendance/clock-out`（既存エンドポイントを拡張）
- body: `{ employee_id, clock_out_at? }`（`clock_out_at`は任意、ISO 8601形式。省略時は従来通りサーバー時刻`NOW()`を使用）
- `clock_out_at`が指定され、記録済みの`clock_in_at`より前の場合：400 `{ error: "退勤時刻は出勤時刻より後にしてください" }`
- `clock_out_at`の形式が不正な場合：400 `{ error: "clock_out_at の形式が不正です" }`
- 同時打刻によるレース（更新対象が既に他リクエストで退勤済みになっていた）場合：400 `{ error: "本日は既に退勤打刻済みです" }`（バリデーションエラーとは別メッセージ）

※ `clock_out_at`を省略した場合、退勤は常にサーバー現在時刻となり出勤時刻より前になり得ないため、このバリデーションは実質的に発火しない。手動修正等で時刻を明示指定できるようにすることで、要件の検証を実効性のあるものにしている。

## Agent構成

| Agent名 | 役割 | 担当タスク |
|---------|------|------------|
| Backend Agent | バックエンド処理を担当 | 上記APIコントラクトに従い、`src/routes/employees.js`に`monthly-report`エンドポイントを追加し、`src/routes/attendance.js`の`clock-out`に退勤時刻バリデーションを追加する |
| Frontend Agent | フロントエンド処理を担当 | 上記APIコントラクトに従い、`public/`の既存ファイル（`index.html`または新規画面）に月次レポート表示を組み込み、`form.html`の退勤時にバリデーションエラーメッセージを表示できるようにする |
| Test Agent | テスト担当 | Backend Agentが実装したエンドポイントについて`__tests__/routes/`にテストを追加し実行する |
| Review Agent | 評価担当 | テスト結果だけでなく、テストの精度・コード品質を評価し改善を促す。特にBackend/Frontendが同一のAPIコントラクトに沿っているかを確認する |

## タスクの依存関係

- Backend Agent と Frontend Agent：事前確定したAPIコントラクトをもとに、互いの成果物を待たずに着手する
- Test Agent：Backend Agentの実装完了を受けて着手する（Frontend Agentの完了は待たない）
- Review Agent：Backend Agent・Frontend Agent・Test Agentすべての完了を受けて最終レビューする

## 並列実行できるタスク

Backend Agent と Frontend Agent は、APIコントラクトが事前に確定しているため並列実行できる。

## 統合時の確認ポイント

- 期待値とのずれ、想定外の事象が発生していないか
- 正確な数値などの定量的閾値（カバレッジなど）
- 要件や設計との齟齬がないかどうか
- **Backend AgentとFrontend Agentが、事前確定したAPIコントラクト（パス・レスポンス形式・エラーメッセージ）通りに実装できているか**（並列実行特有のリスクとして追加）
