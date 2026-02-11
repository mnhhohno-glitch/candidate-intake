# 本番で「Googleフォームを作成」ボタンが表示されない場合の確認手順

リポジトリの最新（ddb59ba 以降）には「Googleフォームを作成」ボタンが**常時表示**される実装があります。本番（candidate-intake-production.up.railway.app）で見えない場合は、**デプロイが古いコミットのまま**か、**ブラウザキャッシュ**の可能性があります。

---

## 1. Railway でデプロイされているコミットを確認する

1. Railway ダッシュボードで該当プロジェクトを開く。
2. **Deployments** タブを開く。
3. **現在本番で動いているデプロイ**（Active など）をクリックし、**コミット SHA** を確認する。

- **ddb59ba**（またはそれより新しいコミット）になっていれば、コードは最新です。→ **2. ブラウザキャッシュ** を試す。
- **ddb59ba より古いコミット**なら、そのデプロイにはボタンが含まれていません。→ **3. 最新コミットで再デプロイ** を行う。

---

## 2. ブラウザキャッシュを疑う場合

- **スーパーリロード**: `Ctrl + Shift + R`（Windows） / `Cmd + Shift + R`（Mac）
- または **シークレットウィンドウ**で `https://candidate-intake-production.up.railway.app/records/5003965` を開き、ボタンが出るか確認する。

---

## 3. 最新コミットで再デプロイする（Railway）

### 方法 A: ダッシュボードから「最新コミットをデプロイ」

- **Deployments** または **Source** で「**Deploy Latest Commit**」など、最新コミットをデプロイする操作を実行する。
- デフォルトブランチの最新（例: main の ddb59ba）がビルド・デプロイされます。

### 方法 B: 空コミットで再デプロイをトリガー

```bash
git commit --allow-empty -m "chore: trigger redeploy for Google Form button"
git push origin main
```

GitHub 連携でオートデプロイしていれば、新しいデプロイが走ります。

### 方法 C: ビルドキャッシュを無効にしてから再デプロイ

古いビルドがキャッシュされている場合に有効です。

1. Railway の該当サービス → **Variables** を開く。
2. **`NO_CACHE=1`** を追加（値は `1` でよい）。
3. **Redeploy** を実行する（Deployments から「Redeploy」など）。
4. デプロイ完了後、必要なら `NO_CACHE` は削除してよい（次回以降のビルド時間短縮のため）。

---

## 4. デプロイ後もう一度確認する

1. **Deployments** で、新しく成功したデプロイの **コミット SHA** が **ddb59ba** 以降になっているか確認する。
2. ブラウザで **スーパーリロード**（`Ctrl+Shift+R`）して `/records/[候補者ID]` を開く。
3. 「生成された質問文（候補者送付用）」のテキストエリアの下、「コピー」ボタンの右に **「Googleフォームを作成」**（緑ボタン）が表示されるか確認する。

---

## 参照

- ボタン実装: `src/app/records/[candidateId]/page.tsx` 480–501 行付近
- コミット: `ddb59ba` — "fix: show Google Form button always; add GAS setup doc and 422 log note"
