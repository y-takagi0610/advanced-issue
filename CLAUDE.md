# CLAUDE.md

## プロジェクト概要

Node.js + Express + PostgreSQL の勤怠記録アプリ。社員管理・出退勤打刻・休暇申請・月次集計を扱う。詳細は`docs/requirements.md`・`docs/architecture.md`を参照。

## ディレクトリ構成

```
src/
  index.js          # Express サーバーのエントリポイント
  routes/            # /api 配下のルートハンドラ
  db/pool.js        # DB 接続プール
public/
  index.html        # 社員一覧画面
  form.html         # 打刻フォーム
```

## コーディング規約

- **エラーハンドリングは必ず実装する** — API ルートは適切な HTTP ステータスコードとエラーメッセージを返す。フロントエンドは fetch の失敗をキャッチしてユーザーに表示する。
- **コメントは日本語で書く**
- パラメータ化クエリを使用し、SQLインジェクションを防ぐこと

## テスト

- テストフレームワークは **Jest + supertest** を使う
- テストファイルは `__tests__/routes/` 配下に `*.test.js` の命名で置く
- DBは `jest.mock` でモックする

## Agent Team の役割定義

Agent Teams でこのプロジェクトを開発する際は以下の役割を使用すること：

- **Backend Agent**: `src/` 配下のサーバーサイドコードを担当
  - Express ルートと pg を使った DB 操作のパターンに従う
  - バリデーション・エラーハンドリングを必ず実装する
- **Frontend Agent**: `public/` 配下のクライアントサイドコードを担当
  - バニラ HTML/CSS/JavaScript で実装する
  - fetch API でバックエンドの REST API と通信する
- **Test Agent**: `__tests__/` 配下のテストコードを担当
  - Jest + supertest でテストし、DBは jest.mock でモックする
- **Review Agent**: 全出力のセキュリティ・コード品質をレビューする
  - 特にBackend AgentとFrontend Agentが同一のAPIコントラクト（`docs/agent-teams.md`参照）に沿っているかを確認する
