# Googleフォーム作成用 Apps Script（GAS）

質問文テキスト（`candidate_question_text_only`）から Google フォームの実体を作成するスクリプトです。会社の Google Workspace アカウントで所有・実行してください。

## セットアップ

1. [Google Apps Script](https://script.google.com/) を開き、会社アカウントでログインする。
2. 「新しいプロジェクト」で空のプロジェクトを作成する。
3. `CreateGoogleFormFromQuestionText.js` の内容をコピーし、GAS エディタの `Code.gs` を置き換える（または新規ファイルとして追加する）。
4. （任意）認証トークンを使う場合:
   - エディタで「プロジェクトの設定」→「スクリプト プロパティ」を開く。
   - プロパティを追加: 名前 `INVOKE_TOKEN`、値にランダムな文字列（例: UUID）を設定。
   - Next.js の `.env.local` に同じ値を `GAS_INVOKE_TOKEN` で設定する。
5. 「デプロイ」→「新しいデプロイ」→ 種類で「ウェブアプリ」を選択。
   - 説明: 任意（例: Candidate Intake フォーム作成）
   - 実行ユーザー: **自分**
   - アクセス: **全員**（トークンで制限する場合）または「組織内」
6. 「デプロイ」をクリックし、表示される **ウェブアプリの URL** をコピーする。
7. Next.js の `.env.local` に `GAS_WEB_APP_URL=https://script.google.com/...` を設定する。

## 動作

- Next.js から `POST` で JSON `{ candidateId, candidateName?, questionText, token? }` を送信する。
- テキストを「回答：」で区切り、1 ブロック＝1 フォーム項目（段落テキスト）として作成する。
- 末尾にプライバシーポリシー全文と同意チェック（必須）を追加する。
- 回答先スプレッドシートを自動作成して紐付ける。
- フォームを **「リンクを知っている全員が閲覧可能」** に共有する（スマホ・社外から回答URLで開けるようにする）。
- レスポンスで `formId`, `responseUrl`, `editUrl` を返す。

## 注意

- プライバシーポリシー本文は要件どおり改変していません。変更が必要な場合はスクリプト内の `PRIVACY_POLICY_BODY` を編集してください。
- 同意チェックのラベルは固定です: 「上記『求職者向け個人情報の取扱いについて』を確認し、同意します。」
