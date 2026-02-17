"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  type RegisteredRecord,
} from "@/components/RecordRegister";
import { fetchCandidates, type Candidate } from "@/lib/portalApi";

export default function RegisterPage() {
  const router = useRouter();
  const [selectedCandidateNo, setSelectedCandidateNo] = useState("");
  const [selectedCandidateName, setSelectedCandidateName] = useState("");
  const [careerAdvisor, setCareerAdvisor] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);

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
      router.push(`/records/${newRecord.candidateId}`);
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
                <label htmlFor="candidate" className="mb-1 block text-sm font-medium text-gray-700">
                  求職者 <span className="text-red-600">*</span>
                </label>
                <select
                  id="candidate"
                  value={selectedCandidateNo}
                  onChange={(e) => {
                    const candidateNo = e.target.value;
                    const candidate = candidates.find(c => c.candidateNo === candidateNo);
                    setSelectedCandidateNo(candidateNo);
                    setSelectedCandidateName(candidate?.name || "");
                    setCareerAdvisor(candidate?.careerAdvisor || "");
                    setFormError(null);
                  }}
                  disabled={isLoadingCandidates}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">{isLoadingCandidates ? "読み込み中..." : "選択してください"}</option>
                  {candidates.map((c) => (
                    <option key={c.candidateNo} value={c.candidateNo}>
                      {c.candidateNo} - {c.name}
                    </option>
                  ))}
                </select>
                {candidates.length === 0 && !isLoadingCandidates && (
                  <p className="mt-1 text-xs text-amber-600">
                    ポータルで求職者を登録してください
                  </p>
                )}
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
