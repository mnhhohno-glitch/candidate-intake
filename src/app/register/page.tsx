"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  type RegisteredRecord,
} from "@/components/RecordRegister";
import { fetchCandidates, type Candidate } from "@/lib/portalApi";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_API_URL || 'https://bizstudio-portal-production.up.railway.app';

export default function RegisterPage() {
  const router = useRouter();

  // URLパラメータをクライアント側で直接読み取り
  const [paramCandidateId, setParamCandidateId] = useState<string | null>(null);
  const [paramFiles, setParamFiles] = useState<string | null>(null);

  const [selectedCandidateNo, setSelectedCandidateNo] = useState("");
  const [selectedCandidateName, setSelectedCandidateName] = useState("");
  const [careerAdvisor, setCareerAdvisor] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);

  // マウント時にURLパラメータを読み取る
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setParamCandidateId(params.get("candidateId"));
    setParamFiles(params.get("files"));
  }, []);

  // Portal APIから求職者一覧を取得
  useEffect(() => {
    const loadData = async () => {
      try {
        const candData = await fetchCandidates();
        setCandidates(candData);
      } catch (err) {
        console.error("求職者データの取得に失敗しました:", err);
      } finally {
        setIsLoadingCandidates(false);
      }
    };
    loadData();
  }, []);

  // URLパラメータによる求職者自動選択
  useEffect(() => {
    if (!paramCandidateId || candidates.length === 0) return;
    if (selectedCandidateNo) return; // 既に選択済み（手動変更含む）ならスキップ
    // candidateIdパラメータはPortalのcuid ID — idフィールドで検索
    const found = candidates.find((c) => c.id === paramCandidateId);
    if (found) {
      setSelectedCandidateNo(found.candidateNo);
      setSelectedCandidateName(found.name);
      setCareerAdvisor(found.careerAdvisor || "");
    }
  }, [paramCandidateId, candidates, selectedCandidateNo]);

  // 検索でフィルタリングされた求職者一覧
  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidates;
    const query = searchQuery.toLowerCase();
    return candidates.filter(c =>
      c.candidateNo.toLowerCase().includes(query) ||
      c.name.toLowerCase().includes(query)
    );
  }, [candidates, searchQuery]);

  // ポータルで新規登録
  const openPortalRegister = () => {
    window.open(`${PORTAL_URL}/admin/master`, '_blank');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedCandidateNo) {
      setFormError("求職者を選択してください。");
      return;
    }
    const newRecord: RegisteredRecord = {
      candidateId: selectedCandidateNo,
      candidateName: selectedCandidateName,
      careerAdvisor: careerAdvisor,
    };
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: newRecord.candidateId,
          candidateName: newRecord.candidateName,
          careerAdvisor: newRecord.careerAdvisor,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "登録の保存に失敗しました");
      }
      // filesパラメータがあれば転送
      const query = paramFiles ? `?files=${encodeURIComponent(paramFiles)}` : "";
      router.push(`/records/${newRecord.candidateId}${query}`);
      return;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "登録の保存に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            ← トップへ戻る
          </Link>
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="mb-2 flex items-center gap-2 text-xl font-semibold text-gray-900">
              <span className="text-2xl" aria-hidden>👤</span>
              新規求職者作成
            </h1>
            <p className="mb-6 text-sm text-gray-500">ポータルに登録された求職者から選択してください。</p>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="candidate" className="block text-sm font-medium text-gray-700">
                    求職者 <span className="text-red-600">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={openPortalRegister}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    新規登録
                  </button>
                </div>

                {/* 検索入力 */}
                <div className="relative mb-2">
                  <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="NO または氏名で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded border border-gray-300 py-2 pl-10 pr-3 text-sm"
                  />
                </div>

                {/* 求職者選択リスト */}
                <div
                  className="h-40 w-full overflow-y-auto rounded border border-gray-300 bg-white"
                  role="listbox"
                  aria-label="求職者選択"
                >
                  {isLoadingCandidates ? (
                    <div className="px-3 py-2 text-sm text-gray-500">読み込み中...</div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">該当なし</div>
                  ) : (
                    filteredCandidates.map((c) => (
                      <div
                        key={c.candidateNo}
                        role="option"
                        aria-selected={selectedCandidateNo === c.candidateNo}
                        tabIndex={0}
                        onClick={() => {
                          setSelectedCandidateNo(c.candidateNo);
                          setSelectedCandidateName(c.name);
                          setCareerAdvisor(c.careerAdvisor || "");
                          setFormError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedCandidateNo(c.candidateNo);
                            setSelectedCandidateName(c.name);
                            setCareerAdvisor(c.careerAdvisor || "");
                            setFormError(null);
                          }
                        }}
                        className={`cursor-pointer px-3 py-2 text-sm ${
                          selectedCandidateNo === c.candidateNo
                            ? "bg-blue-600 text-white"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        {c.candidateNo} - {c.name}
                      </div>
                    ))
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {filteredCandidates.length} 件表示 / 全 {candidates.length} 件
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  担当キャリアアドバイザー
                </label>
                <div className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {careerAdvisor || (selectedCandidateNo ? "未設定" : "求職者を選択してください")}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  ポータルで設定された担当CAが自動表示されます
                </p>
              </div>
              {formError && (
                <p className="text-sm text-red-600" role="alert">{formError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <Link
                  href="/"
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  キャンセル
                </Link>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "登録中…" : "作成する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    );
}
