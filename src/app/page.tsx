"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadPanel, type UploadFiles } from "@/components/UploadPanel";
import { ResultPanel } from "@/components/ResultPanel";
import { PreviewEditor } from "@/components/PreviewEditor";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";
import type { GoogleFormDefinition } from "@/types/googleForm";

type Step = "idle" | "analyzing" | "questions" | "excel" | "done" | "error";

export default function Home() {
  const [files, setFiles] = useState<UploadFiles>({
    pdf: null,
    interviewLog: null,
    flagList: null,
  });
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [commonAnalysis, setCommonAnalysis] = useState<CommonAnalysisJson | null>(null);
  const [questions, setQuestions] = useState<GoogleFormDefinition | null>(null);
  const [excelBlobUrl, setExcelBlobUrl] = useState<string | null>(null);
  const [excelDownloadName, setExcelDownloadName] = useState<string>("FileMaker用_候補者.xlsx");

  useEffect(() => {
    return () => {
      if (excelBlobUrl) URL.revokeObjectURL(excelBlobUrl);
    };
  }, [excelBlobUrl]);

  const runPipeline = useCallback(async () => {
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
      const analysis = (await analyzeRes.json()) as CommonAnalysisJson;
      setCommonAnalysis(analysis);
      setStep("questions");

      const questionsRes = await fetch("/api/intake/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ common_analysis_json: analysis }),
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
        body: JSON.stringify({ common_analysis_json: analysis }),
      });
      if (!excelRes.ok) {
        const err = await excelRes.json().catch(() => ({}));
        throw new Error(err.error || `Excel生成エラー: ${excelRes.status}`);
      }
      const blob = await excelRes.blob();
      const url = URL.createObjectURL(blob);
      const disp = excelRes.headers.get("Content-Disposition");
      const match = disp?.match(/filename\*?=(?:UTF-8'')?([^;]+)/);
      const name = match ? decodeURIComponent(match[1].replace(/^["']|["']$/g, "")) : "FileMaker用_候補者.xlsx";
      setExcelDownloadName(name);
      setExcelBlobUrl(url);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
      setStep("error");
    }
  }, [files, excelBlobUrl]);

  const handleDownloadExcel = useCallback(() => {
    if (!excelBlobUrl) return;
    const a = document.createElement("a");
    a.href = excelBlobUrl;
    a.download = excelDownloadName;
    a.click();
  }, [excelBlobUrl, excelDownloadName]);

  const running = step === "analyzing" || step === "questions" || step === "excel";

  return (
    <main className="min-h-screen p-6 md:p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">候補者情報取り込み</h1>
      <p className="mb-6 text-gray-600">
        PDF・面談ログ・フラグリストをアップロードし、「実行」で ①共通解析 → ②質問JSON生成 → ③Excel出力 を一括実行します。
      </p>

      <div className="space-y-6">
        <UploadPanel files={files} onFilesChange={setFiles} disabled={running} />

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={runPipeline}
            disabled={running}
            className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? "実行中…" : "実行"}
          </button>
        </div>

        <ResultPanel
          step={step}
          error={error}
          commonAnalysis={commonAnalysis}
          questions={questions}
          excelBlobUrl={excelBlobUrl}
          onDownloadExcel={handleDownloadExcel}
        />

        {questions && (
          <PreviewEditor
            questions={questions}
            onQuestionsChange={setQuestions}
            disabled={running}
          />
        )}
      </div>
    </main>
  );
}
