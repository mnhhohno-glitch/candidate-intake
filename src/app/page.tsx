export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">候補者情報取り込み</h1>
      <p className="mt-2 text-gray-600">
        PDF・面談ログ・フラグリストをアップロードし、共通解析→質問生成→Excel出力を実行します。
      </p>
      <p className="mt-4 text-sm text-gray-500">
        準備中。UploadPanel・ResultPanel・実行フローは続くステップで実装します。
      </p>
    </main>
  );
}
