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

## 実際に使った構成と気づき（実施後追記）

**うまくいった点**

- APIコントラクトを先に確定してからBackend/Frontendを並列実行したことで、実際に契約のズレは一切発生しなかった（Backend実装のレスポンスフィールド名とFrontendの参照フィールド名を後から直接照合し確認済み）
- Frontend Agentが「`form.html`は既存の汎用エラー表示ロジックで新しいエラーメッセージも表示できるため変更不要」と自己判断し、不要な修正を加えなかった点は的確だった
- Review Agentが「同時に2件の退勤打刻リクエストが来た場合の二重更新（レース条件）」を静的レビューだけで発見し、`AND clock_out_at IS NULL`の追加を提案した

**想定と違った点・学び**

- Review Agentに`security-auditor`サブエージェント（tools: Read/Grep/Glob）を割り当てたところ、`npm test`を自ら実行できず静的レビューのみになった。Agent構成を設計する段階で、各Agentに割り当てるSubagentのツール権限（実行系ツールの有無）まで考慮すべきだった
- 当初実装した`clock_in_at <= NOW()`によるバリデーションは、出勤・退勤どちらもサーバー時刻`NOW()`から生成されるため実質的に発火し得ないことが統合後の評価で判明した。要件の文言（「退勤打刻が出勤打刻より前の場合はエラーを返す」）を満たすことと、実際に意味のある検証になっていることは別問題だと学んだ。最終的に`clock_out_at`を任意の明示指定項目として追加し、手動修正等の現実的なシナリオで実際に検証が発火するよう修正した
- レース条件対策（`clock_out_at IS NULL`）とバリデーション（時刻の前後関係）を同じSQL条件・同じエラーメッセージに混在させていたため、原因の異なる2つの0件更新を区別できていなかった。エラーメッセージを分離して修正した
