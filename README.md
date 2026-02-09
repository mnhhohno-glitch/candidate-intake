# 候補者情報取り込み（Candidate Intake）

PDF・面談ログ・フラグリストから共通解析JSONを生成し、Googleフォーム質問定義とFileMaker用Excel（.xlsx）を一気通貫で出力するアプリです。

## 起動方法

```bash
# 依存関係インストール
npm install

# 開発サーバー起動（http://localhost:3000）
npm run dev
```

本番ビルド・起動:

```bash
npm run build
npm start
```

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `GEMINI_API_KEY` | Google Gemini API キー | はい |

**ユーザー作業**: `.env.local` に以下を設定してください（リポジトリにコミットされません）。

```
GEMINI_API_KEY=あなたのAPIキー
```

## 入力ファイル形式

- **PDF**: 履歴書・登録シート（テキスト抽出して送信）
- **テキスト（.txt）**: 面談メモ・面談ログ
- **Excel（.xlsx）**: フラグリスト（列名と値の対応）

アップロードは画面上のドラッグ&ドロップで行います。いずれか1つ以上を投入後、「実行」で ①共通解析 → ②質問JSON生成 → ③Excel出力 を順に実行します。

## 運用フロー

1. ブラウザで http://localhost:3000 を開く
2. PDF / 面談ログテキスト / フラグリストxlsx をドラッグ&ドロップでアップロード
3. 「実行」ボタンをクリック
4. ① 共通解析JSON（common_analysis_json）が生成される
5. ② 質問定義JSONが生成され、プレビューで編集可能（任意）
6. ③ FileMaker用Excel（基本情報シート・職歴情報シート）が生成される
7. 画面からExcelをダウンロード

## フォルダ構成

```
candidate-intake/
├── specs/                    # プロンプト仕様（YAML）
│   ├── 01_common_analysis_prompt.yaml
│   ├── 02_google_form_prompt.yaml
│   └── 03_filemaker_excel_prompt.yaml
├── src/
│   ├── app/                   # Next.js ページ・API
│   ├── components/            # UI（UploadPanel, ResultPanel, PreviewEditor）
│   ├── services/              # Gemini呼び出し・Excel生成
│   └── types/                 # 型定義
└── README.md
```

## 仕様

- ① 共通解析: `specs/01_common_analysis_prompt.yaml` に従い、PDF/面談/フラグから common_analysis_json を生成
- ② 質問生成: `specs/02_google_form_prompt.yaml` に従い、common_analysis_json のみを入力に質問JSONを生成
- ③ Excel出力: `specs/03_filemaker_excel_prompt.yaml` に従い、common_analysis_json のみを入力に excel_files JSON を生成し、.xlsx に変換

既存のYAMLプロンプトは改変せず、差分が必要な場合は新規ファイルで管理してください。
