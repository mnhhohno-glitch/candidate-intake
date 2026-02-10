"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [records, setRecords] = useState<StoredRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [reoutputLoading, setReoutputLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size >= filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.candidateId)));
    }
  }, [filtered, selectedIds.size]);

  const handleReoutput = useCallback(async (candidateId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setReoutputLoading(candidateId);
    try {
      const res = await fetch(`/api/records/${encodeURIComponent(candidateId)}/excel`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "再出力できません");
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

  const handleDeleteOne = useCallback(async (candidateId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("この求職者を削除しますか？")) return;
    try {
      const res = await fetch(`/api/records/${encodeURIComponent(candidateId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("削除に失敗しました");
      await fetchRecords();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }, [fetchRecords]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`選択した ${ids.length} 件を削除しますか？`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/records/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: ids }),
      });
      if (!res.ok) throw new Error("一括削除に失敗しました");
      setSelectedIds(new Set());
      await fetchRecords();
    } catch (err) {
      alert(err instanceof Error ? err.message : "一括削除に失敗しました");
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, fetchRecords]);

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

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-[200px] flex-1">
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

        {selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {bulkDeleting ? "削除中..." : `選択した ${selectedIds.size} 件を一括削除`}
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-10 px-2 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onChange={toggleSelectAll}
                      aria-label="すべて選択"
                      className="rounded border-gray-300"
                    />
                  </th>
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
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      読み込み中...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      {records.length === 0
                        ? "登録された求職者はいません。"
                        : "検索に一致するレコードがありません。"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr
                      key={r.candidateId}
                      onClick={() => router.push(`/records/${r.candidateId}`)}
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/records/${r.candidateId}`);
                        }
                      }}
                    >
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.candidateId)}
                          onChange={() => toggleSelect(r.candidateId)}
                          aria-label={`${r.candidateName} を選択`}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-900">{r.candidateId}</td>
                      <td className="px-4 py-3 text-gray-900">
                        <Link
                          href={`/records/${r.candidateId}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.candidateName || "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{r.careerAdvisor}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {attachmentLabel(r)}
                        {r.lastOutputAt && (
                          <span className="ml-1 text-xs text-gray-400">（出力済）</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(ev) => handleReoutput(r.candidateId, ev)}
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
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(ev) => handleDeleteOne(r.candidateId, ev)}
                          aria-label={`${r.candidateName} を削除`}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
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
