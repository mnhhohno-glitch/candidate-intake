# GitHub へのプッシュと Railway でのサーバー公開 — 手順書

知識がなくても、この手順の**番号どおり**に進めれば、コードを GitHub に上げて、Railway で本番用のサーバーを立ち上げられます。

---

## 全体の流れ（3ステップ）

| ステップ | やること | 誰がやるか |
|----------|----------|------------|
| **A** | コードを Git でコミットする | ✅ こちらで対応済み（あなたは何もしなくてOK） |
| **B** | GitHub にリポジトリを作り、コードをプッシュする | 👤 **あなた**（下の「B. GitHub にプッシュする」を参照） |
| **C** | Railway で「GitHub からデプロイ」して、環境変数を設定する | 👤 **あなた**（下の「C. Railway でサーバーを上げる」を参照） |

---

## A. コードのコミット（済）

プロジェクト内の変更は、すべて Git にコミット済みです。  
あなたがやることはありません。

---

## B. GitHub にプッシュする

ここは**あなただけ**ができます（GitHub のアカウントとリポジトリが必要です）。

### B-1. GitHub でリポジトリを1つ作る

1. ブラウザで **https://github.com** を開き、ログインする。
2. 画面右上の **「+」** をクリック → **「New repository」** を選ぶ。
3. 次のように入力する：
   - **Repository name**: 例）`candidate-intake`（好きな名前でOK）
   - **Public** を選ぶ。
   - **「Add a README file」** は**チェックしない**（中身はすでに手元にあるため）。
4. **「Create repository」** をクリックする。
5. 作成されたページに、**リポジトリのURL** が表示される。  
   例：`https://github.com/あなたのユーザー名/candidate-intake.git`  
   → このURLをコピーしておく。

### B-2. 手元のフォルダから GitHub に送る（プッシュ）

1. **Cursor や VSCode** で、このプロジェクト（`candidate-intake`）のフォルダを開いた状態にする。
2. **ターミナル**を開く（メニュー「ターミナル」→「新しいターミナル」）。
3. 次のコマンドを**1行ずつ**実行する（`あなたのユーザー名` と `リポジトリ名` は、B-1で作ったリポジトリのURLに合わせて書き換える）。

```powershell
cd c:\bizstudio\modules\candidate-intake
git remote add origin https://github.com/あなたのユーザー名/リポジトリ名.git
git push -u origin master
```

- 例：ユーザー名が `tanaka`、リポジトリ名が `candidate-intake` なら  
  `git remote add origin https://github.com/tanaka/candidate-intake.git`
- `git push` のとき、GitHub の**ユーザー名**と**パスワード**を聞かれたら入力する。  
  （パスワードは「Personal Access Token」を使う場合があります。その場合は GitHub の設定でトークンを作成し、パスワードの代わりにトークンを入力します。）

ここまでで、**GitHub にコードがプッシュされた状態**になります。

---

## C. Railway でサーバーを上げる

ここも**あなただけ**ができます（Railway のアカウントと、画面上の操作が必要です）。

### C-1. Railway にログインする

1. ブラウザで **https://railway.app** を開く。
2. **「Login」** をクリックする。
3. **「Login with GitHub」** を選び、GitHub で認証する。  
   → Railway のダッシュボード（最初の画面）が開けばOK。

### C-2. 新しいプロジェクトを「GitHub から」作る

1. Railway のダッシュボードで **「New Project」** をクリックする。
2. **「Deploy from GitHub repo」**（GitHub のリポジトリからデプロイ）を選ぶ。
3. 表示された一覧から、**B でプッシュしたリポジトリ**（例：`candidate-intake`）を選ぶ。
4. **「Deploy Now」** や **「Add to project」** など、デプロイを開始するボタンをクリックする。  
   → ビルドが始まり、数分待つと「Deployed」や「Success」のような表示になる。

### C-3. 環境変数（GEMINI_API_KEY）を設定する

アプリが Gemini API を使うため、**Railway 側**に API キーを登録する必要があります。

1. Railway のプロジェクト画面で、**今デプロイしたサービス（アプリ名）** をクリックする。
2. 上または横のタブから **「Variables」**（変数）を開く。
3. **「+ New Variable」** または **「Add Variable」** をクリックする。
4. 次のように入力する：
   - **Name（名前）**: `GEMINI_API_KEY`（この文字列をそのまま）
   - **Value（値）**: あなたがローカルで使っている **Gemini API キー**（`.env.local` に書いている値）
5. **保存**する。
6. 多くの場合、**再デプロイ**が自動で走る。走らない場合は、**「Redeploy」** や **「Deploy」** を一度クリックする。

これで、Railway 上のサーバーが **GEMINI_API_KEY** を使って動くようになります。

### C-4. 本番のURLを確認する

1. 同じサービス（アプリ）の画面で **「Settings」** や **「Deployments」** を開く。
2. **「Generate Domain」** や **「Public Networking」** のような項目を探す。
3. **「Generate Domain」** をクリックすると、`xxxx.up.railway.app` のような **本番URL** が発行される。
4. そのURLをブラウザで開くと、**候補者情報取り込み**の画面が表示されれば成功です。

---

## まとめ：あなたがやることだけ

| 順番 | やること |
|------|----------|
| 1 | GitHub で新しいリポジトリを1つ作る（B-1） |
| 2 | ターミナルで `git remote add origin ...` と `git push -u origin master` を実行する（B-2） |
| 3 | Railway に GitHub でログインする（C-1） |
| 4 | 「Deploy from GitHub repo」でこのリポジトリを選び、デプロイする（C-2） |
| 5 | Railway の「Variables」で `GEMINI_API_KEY` を設定する（C-3） |
| 6 | 「Generate Domain」でURLを発行し、ブラウザで開いて動作確認する（C-4） |

**用語がわからなくても大丈夫です。** 上から順に「同じボタン・同じ項目」を探してクリックしていけば、サーバーアップまで完了します。

---

## トラブルのとき

| 症状 | 対処 |
|------|------|
| `git push` で「認証できない」「403」 | GitHub の設定で **Personal Access Token** を作成し、パスワードの代わりにそのトークンを入力する。 |
| Railway のビルドが「Failed」 | 画面の **「View Logs」** を開き、赤いエラー文をコピーして開発者に渡す。 |
| 本番URLを開いても「APIキー」エラー | Railway の **Variables** に `GEMINI_API_KEY` が正しく1つだけ入っているか確認し、保存後に **Redeploy** する。 |

---

*この手順書は、GitHub と Railway の画面・用語は 2025 年時点の情報です。サイトのデザインが変わっていても、「New Project」「Deploy from GitHub」「Variables」「Generate Domain」といった名前の項目を探して進めれば同じように設定できます。*
