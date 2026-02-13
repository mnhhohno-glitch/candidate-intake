"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CAREER_ADVISORS,
  CANDIDATE_ID_REGEX,
  type CareerAdvisor,
  type RegisteredRecord,
} from "@/components/RecordRegister";

const CANDIDATE_ID_ERROR = "求職者番号は5から始まる7桁の数字で入力してください。";

export default function RegisterPage() {
  const router = useRouter();
  const [candidateNumber, setCandidateNumber] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [careerAdvisor, setCareerAdvisor] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const idTrim = candidateNumber.trim();
    const nameTrim = candidateName.trim();
    if (!idTrim || !nameTrim) {
      setFormError("すべての項目を入力してください。");
      return;
    }
    if (!CANDIDATE_ID_REGEX.test(idTrim)) {
      setFormError(CANDIDATE_ID_ERROR);
      return;
    }
    if (!careerAdvisor || !CAREER_ADVISORS.includes(careerAdvisor as CareerAdvisor)) {
      setFormError("キャリアアドバイザーを選択してください。");
      return;
    }
    const newRecord: RegisteredRecord = {
      candidateId: idTrim,
      candidateName: nameTrim,
      careerAdvisor: careerAdvisor as CareerAdvisor,
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
            <p className="mb-6 text-sm text-gray-500">すべての項目が必須です。</p>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label htmlFor="candidateNumber" className="mb-1 block text-sm font-medium text-gray-700">
                  求職者ナンバー <span className="text-red-600">*</span>
                </label>
                <input
                  id="candidateNumber"
                  type="text"
                  value={candidateNumber}
                  onChange={(e) => {
                    setCandidateNumber(e.target.value);
                    setFormError(null);
                  }}
                  maxLength={7}
                  placeholder="例）5001234"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  5から始まる7桁の数字で入力してください (例:5001234)
                </p>
              </div>
              <div>
                <label htmlFor="candidateName" className="mb-1 block text-sm font-medium text-gray-700">
                  求職者氏名 <span className="text-red-600">*</span>
                </label>
                <input
                  id="candidateName"
                  type="text"
                  value={candidateName}
                  onChange={(e) => {
                    setCandidateName(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="例:山田 太郎"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="careerAdvisor" className="mb-1 block text-sm font-medium text-gray-700">
                  担当キャリアアドバイザー <span className="text-red-600">*</span>
                </label>
                <select
                  id="careerAdvisor"
                  value={careerAdvisor}
                  onChange={(e) => {
                    setCareerAdvisor(e.target.value);
                    setFormError(null);
                  }}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  required
                  aria-required="true"
                >
                  <option value="">選択してください</option>
                  {CAREER_ADVISORS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
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
