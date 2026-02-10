"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UploadPanel, type UploadFiles } from "@/components/UploadPanel";
import {
  CAREER_ADVISORS,
  CANDIDATE_ID_REGEX,
  type CareerAdvisor,
  type RegisteredRecord,
} from "@/components/RecordRegister";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";
import type { GoogleFormDefinition } from "@/types/googleForm";

type PipelineStep = "idle" | "analyzing" | "questions" | "excel" | "done" | "error";

const CANDIDATE_ID_ERROR = "求職者番号は5から始まる7桁の数字で入力してください。";

export default function RegisterPage() {
  const [record, setRecord] = useState<RegisteredRecord | null>(null);
  const [candidateNumber, setCandidateNumber] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [careerAdvisor, setCareerAdvisor] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const [files, setFiles] = useState<UploadFiles>({
    pdf: null,
    interviewLog: null,
    flagList: null,
  });
  const [step, setStep] = useState<PipelineStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [commonAnalysis, setCommonAnalysis] = useState<CommonAnalysisJson | null>(null);
  const [questions, setQuestions] = useState<GoogleFormDefinition | null>(null);
  const [excelBlobUrl, setExcelBlobUrl] = useState<string | null>(null);
  const [excelDownloadName, setExcelDownloadName] = useState<string>("基本情報シート_候補者.xlsx");

  useEffect(() => {
    return () => {
      if (excelBlobUrl) URL.revokeObjectURL(excelBlobUrl);
    };
  }, [excelBlobUrl]);

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
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "登録の保存に失敗しました");
      return;
    }
    setRecord(newRecord);
  };

  const runPipeline = useCallback(async () => {
    if (!record?.candidateId) return;
    if (!files.pdf && !files.interviewLog && !files.flagList) {
      setError("PDF・面談ログ・フラグリストのいずれか1つ以上をアップロードしてください。");
      return;
    }
    setError(null);
    setStep("analyzing");
    setCommonAnalysis(null);
    setQuestions(null);
    if (excelBlobUrl) {
      URL.revokeObjectURL(excelBlobUrl);
      setExcelBlobUrl(null);
    }

    try {
      const formData = new FormData();
      formData.append("candidateId", record.candidateId);
      if (files.pdf) formData.append("pdf", files.pdf);
      if (files.interviewLog) formData.append("interviewLog", files.interviewLog);
      if (files.flagList) formData.append("flagList", files.flagList);

      const analyzeRes = await fetch("/api/intake/analyze", {
        method: "POST",
        body: formData,
      });
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({}));
        throw new Error(err.error || `共通解析エラー: ${analyzeRes.status}`);
      }
      const analysisPayload = await analyzeRes.json();
      setCommonAnalysis(analysisPayload);
      setStep("questions");

      const questionsRes = await fetch("/api/intake/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ common_analysis_json: analysisPayload }),
      });
      if (!questionsRes.ok) {
        const err = await questionsRes.json().catch(() => ({}));
        throw new Error(err.error || `質問生成エラー: ${questionsRes.status}`);
      }
      const questionsData = (await questionsRes.json()) as GoogleFormDefinition;
      setQuestions(questionsData);
      setStep("excel");

      const excelRes = await fetch("/api/intake/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ common_analysis_json: analysisPayload }),
      });
      if (!excelRes.ok) {
        const err = await excelRes.json().catch(() => ({}));
        throw new Error(err.error || `Excel生成エラー: ${excelRes.status}`);
      }
      const blob = await excelRes.blob();
      const url = URL.createObjectURL(blob);
      const disp = excelRes.headers.get("Content-Disposition");
      const match = disp?.match(/filename\*?=(?:UTF-8'')?([^;]+)/);
      const name = match ? decodeURIComponent(match[1].replace(/^["']|["']$/g, "")) : "基本情報シート_候補者.xlsx";
      setExcelDownloadName(name);
      setExcelBlobUrl(url);
      setStep("done");

      const attachmentSummary = {
        pdfName: files.pdf?.name ?? undefined,
        interviewLogName: files.interviewLog?.name ?? undefined,
        flagListName: files.flagList?.name ?? undefined,
      };
      const cacheFormData = new FormData();
      cacheFormData.append("attachmentSummary", JSON.stringify(attachmentSummary));
      cacheFormData.append("excel", blob, name);
      try {
        await fetch(`/api/records/${encodeURIComponent(record.candidateId)}/cache`, {
          method: "POST",
          body: cacheFormData,
        });
      } catch (cacheErr) {
        console.warn("Cache save failed:", cacheErr);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
      setStep("error");
    }
  }, [record, files, excelBlobUrl]);

  const handleDownloadExcel = useCallback(() => {
    if (!excelBlobUrl) return;
    const a = document.createElement("a");
    a.href = excelBlobUrl;
    a.download = excelDownloadName;
    a.click();
  }, [excelBlobUrl, excelDownloadName]);

  const running = step === "analyzing" || step === "questions" || step === "excel";
  const hasFiles = !!(files.pdf || files.interviewLog || files.flagList);

  if (!record) {
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
                  className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  作成する
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          ← トップへ戻る
        </Link>

        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-gray-800">
          <span className="font-medium">登録済み:</span> {record.candidateName} / 求職者番号 {record.candidateId} / 担当 {record.careerAdvisor}
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">ファイル投入</h2>
          <p className="mb-4 text-sm text-gray-500">PDFファイル・面談ログ・フラグリストをアップロードします。</p>
          <UploadPanel
            files={files}
            onFilesChange={setFiles}
            disabled={running}
            showTitle={false}
          />
          {!hasFiles && step === "idle" && (
            <p className="mt-2 text-sm text-amber-700">ファイルを選択してください。</p>
          )}
        </section>

        {step === "idle" && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={runPipeline}
              disabled={!hasFiles}
              className="rounded-lg bg-blue-600 px-8 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="出力開始"
            >
              出力開始
            </button>
          </div>
        )}

        {(running || step === "done" || step === "error") && (
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {running && (
              <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-gray-800">
                <p className="font-medium">出力を開始しました。納品をお待ちください。</p>
                <p className="mt-1 text-xs text-gray-500">納品待ち（出力処理中）</p>
                <p className="mt-2 text-xs text-gray-600">
                  {step === "analyzing" && "① 共通解析中…"}
                  {step === "questions" && "② 質問JSON生成中…"}
                  {step === "excel" && "③ Excel生成中…"}
                </p>
              </div>
            )}
            {step === "done" && excelBlobUrl && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-green-800">出力が完了しました。</p>
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Excel をダウンロード
                </button>
              </div>
            )}
            {step === "error" && error && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                {error}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
