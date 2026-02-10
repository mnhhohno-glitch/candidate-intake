"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export interface StoredRecord {
  candidateId: string;
  candidateName: string;
  careerAdvisor: string;
  createdAt: string;
  lastOutputAt?: string;
  attachmentSummary?: {
    pdfName?: string;
    interviewLogName?: string;
    flagListName?: string;
  };
}

export default function TopPage() {
  const [records, setRecords] = useState<StoredRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [reoutputLoading, setReoutputLoading] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/records");
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records ?? []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filtered = search.trim()
    ? records.filter(
        (r) =>
          r.candidateId.includes(search.trim()) ||
          r.candidateName.includes(search.trim()) ||
          r.careerAdvisor.includes(search.trim())
      )
    : records;

  const handleReoutput = useCallback(async (candidateId: string) => {
    setReoutputLoading(candidateId);
    try {
      const res = await fetch(`/api/records/${encodeURIComponent(candidateId)}/excel`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "再出力できません");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `再出力_${candidateId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "再出力に失敗しました");
    } finally {
      setReoutputLoading(null);
    }
  }, []);

  const attachmentLabel = (r: StoredRecord) => {
    const a = r.attachmentSummary;
    if (!a) return "—";
    const parts = [];
    if (a.pdfName) parts.push("PDF");
    if (a.interviewLogName) parts.push("面談");
    if (a.flagListName) parts.push("フラグ");
    return parts.length ? parts.join("・") : "—";
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">
          初回面談後アプリ
        </h1>
        <p className="mb-8 text-center text-gray-600">
          Candidate Intake
        </p>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="search" className="sr-only">
              検索
            </label>
            <input
              id="search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="求職者ID・氏名・担当CAで検索..."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex shrink-0 justify-end">
            <Link
              href="/register"
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              ＋ 新規求職者登録
            </Link>
          </div>
        </div>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-700">
                    求職者ID
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">
                    求職者氏名
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">
                    担当キャリアアドバイザー
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">
                    添付・出力
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      読み込み中...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      {records.length === 0
                        ? "登録された求職者はいません。"
                        : "検索に一致するレコードがありません。"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr
                      key={r.candidateId}
                      role="button"
                      tabIndex={0}
                      onClick={() => r.lastOutputAt && handleReoutput(r.candidateId)}
                      onKeyDown={(e) => {
                        if (
                          (e.key === "Enter" || e.key === " ") &&
                          r.lastOutputAt
                        ) {
                          e.preventDefault();
                          handleReoutput(r.candidateId);
                        }
                      }}
                      className={`border-b border-gray-100 ${
                        r.lastOutputAt
                          ? "cursor-pointer hover:bg-gray-50"
                          : "cursor-default"
                      }`}
                      aria-label={
                        r.lastOutputAt
                          ? `${r.candidateName} のExcelを再出力`
                          : undefined
                      }
                    >
                      <td className="px-4 py-3 text-gray-900">{r.candidateId}</td>
                      <td className="px-4 py-3 text-gray-900">{r.candidateName || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{r.careerAdvisor}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {attachmentLabel(r)}
                        {r.lastOutputAt && (
                          <span className="ml-1 text-xs text-gray-400">
                            （出力済）
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleReoutput(r.candidateId)}
                          disabled={!!reoutputLoading || !r.lastOutputAt}
                          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {reoutputLoading === r.candidateId
                            ? "取得中..."
                            : r.lastOutputAt
                              ? "再出力"
                              : "—"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
