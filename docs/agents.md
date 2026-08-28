# Subagent定義書

## backend-architect
- 役割：API設計、データベーススキーマ、バックエンド実装を担当する
- 担当するタスク：`docs/requirements.md`に基づく`src/routes/`のCRUD実装、`db/migrations/`のマイグレーション作成、勤務時間・休暇日数の集計ロジックの実装
- 特に注意させること：パラメータ化クエリの使用、エラーハンドリング・入力バリデーションの徹底、`employee_id`等の外部キー制約を適切に設定すること

## frontend-developer
- 役割：フロントエンド全般（`public/`配下）を担当する
- 担当するタスク：社員一覧・勤怠登録・勤務表・休暇申請の各画面実装、`fetch`によるAPI連携、Expressの静的ファイル配信設定
- 特に注意させること：`fetch`のエラーハンドリング（try/catchまたはres.okチェック）、フォーム送信時の`e.preventDefault()`、ユーザーに伝わる成功・エラーメッセージ表示

## security-auditor
- 役割：セキュリティ脆弱性、入力バリデーションを監査する
- 担当するタスク：実装後の`src/routes/`配下のコードレビュー、OWASP Top 10観点でのチェック
- 特に注意させること：SQLインジェクション・XSSの検知、`employee_id`等のなりすまし・不正参照リスクの指摘、問題発見時は重大度（Critical/High/Medium/Low）と具体的な修正方法を提示すること
