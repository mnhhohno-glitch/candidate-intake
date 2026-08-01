# CANDIDATE-INTAKE-V2（Google Apps Script）

## これは何か

portal の「Google フォーム作成」機能で、実際に Google フォームと回答スプレッドシートを生成している Apps Script のソース。

呼び出し経路:

portal UI → portal API（`/api/candidates/[candidateId]/google-form/create-form`）
→ candidate-intake API（`/api/intake/create_form_v2`）
→ この GAS ウェブアプリ

## 重要：これはミラーであり、実行される本体ではない

実際に動いているのは Apps Script プロジェクト側のコード。このファイルはバックアップ兼レビュー用のコピー。

**GAS を修正するときの手順（順序厳守）**

1. このリポジトリの `scripts/gas-v2/CANDIDATE-INTAKE-V2.gs` を先に修正してコミット
2. その内容を Apps Script エディタに全文貼り付けて保存
3. デプロイ →「デプロイを管理」→ 鉛筆 → バージョン「新バージョン」→ デプロイ

逆順（GAS を先に直して後から写す）にすると写し忘れが発生し、ミラーが実態と乖離する。

**「新しいデプロイ」を選ばないこと。** ウェブアプリ URL が変わり、candidate-intake の環境変数 `GAS_WEB_APP_URL_V2` と一致しなくなってフォーム作成が停止する。

## スクリプトプロパティ

Apps Script のプロジェクト設定に以下を保持している（このリポジトリには値を置かない）。

| プロパティ | 用途 |
|--|--|
| `INVOKE_TOKEN` | candidate-intake からの呼び出し認証 |
| `SHARED_DRIVE_FOLDER_ID` | 生成物の保存先フォルダ（共有ドライブ内） |

`SHARED_DRIVE_FOLDER_ID` が未設定または無効な場合、エラーにはならずマイドライブに作成され、`FORM_EDITORS` への個別権限付与にフォールバックする。**設定ミスに気づきにくい**ため、変更後は必ず共有ドライブ内に実物ができているか目視確認すること。

## 既知の制約

- Apps Script のトリガー上限は 1 スクリプトあたり 20 個。フォーム 1 件につき 1 個消費するため、`pruneFormSubmitTriggers()` で 18 個を超えた分を古い順に削除している。古いフォームの回答通知は順次無効になるので、回答確認は共有ドライブの回答スプレッドシートで行う運用が前提。
- `ScriptApp.getProjectTriggers()` の並び順が作成順である保証は公式にはない。削除対象が想定とずれる可能性がある。
- このスクリプトはフォームに紐づいていない独立スクリプトのため、`FormApp.getActiveForm()` は常に null を返す。フォーム送信トリガー内では `e.source` を使うこと。

## 履歴

- 2026-08-01: 共有ドライブ保存対応、回答スプレッドシートの共有漏れ修正、回答通知メールの送信失敗修正、トリガー上限対策を追加。同日、本ファイルをバージョン管理下に追加。
