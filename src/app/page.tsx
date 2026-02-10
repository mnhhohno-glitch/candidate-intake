"use client";

import Link from "next/link";

export default function TopPage() {
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-center text-2xl font-bold text-gray-900">
          候補者情報取り込み
        </h1>
        <p className="mb-10 text-center text-gray-600">
          Candidate Intake
        </p>
        <div className="flex flex-col items-center gap-6">
          <Link
            href="/register"
            className="rounded-lg bg-blue-600 px-8 py-3 text-lg font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            ＋ 新規求職者登録
          </Link>
        </div>
      </div>
    </main>
  );
}
