"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadPanel, type UploadFiles } from "@/components/UploadPanel";
import { ResultPanel } from "@/components/ResultPanel";
import { PreviewEditor } from "@/components/PreviewEditor";
import { RecordRegister, type RegisteredRecord } from "@/components/RecordRegister";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";
import type { GoogleFormDefinition } from "@/types/googleForm";

type Step = "idle" | "analyzing" | "questions" | "excel" | "done" | "error";

export default function Home() {
  const [record, setRecord] = useState<RegisteredRecord | null>(null);
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
  const [excelDownloadName, setExcelDownloadName] = useState<string>("基本情報シート_候補者.xlsx");

  useEffect(() => {
    return () => {
      if (excelBlobUrl) URL.revokeObjectURL(excelBlobUrl);
    };
  }, [excelBlobUrl]);

  const runPipeline = useCallback(async () => {
    if (!record?.candidateId) {
      setError("先に「新規レコード追加」で求職者番号を登録してください。");
      return;
    }
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

  return (
    <main className="min-h-screen p-6 md:p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">候補者情報取り込み</h1>
      <p className="mb-6 text-gray-600">
        PDF・面談ログ・フラグリストをアップロードし、「実行」で ①共通解析 → ②質問JSON生成 → ③Excel出力 を一括実行します。
      </p>
      <details className="mb-6 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        <summary className="cursor-pointer font-medium">このアプリでやっていること（ChatGPTの「プロンプト＋ファイル→Excel」と同じ）</summary>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li><strong>①共通解析</strong> … 3つのファイル（面談メモ・Web履歴書PDF・フラグリスト）を読み、1つの中間データ（共通解析JSON）にまとめます。ここでPDFが0文字だと履歴書由来の項目が入りません。</li>
          <li><strong>②質問JSON</strong> … 共通解析で「記載が無かった項目」を補うためのGoogleフォーム用の質問定義を作ります。</li>
          <li><strong>③Excel</strong> … 共通解析の結果から、FileMaker用の基本情報シート・職歴情報シートを生成します。</li>
        </ul>
        <p className="mt-2">ChatGPTのシンキングモードにプロンプトとファイルを渡してExcelを作るのと同じことを、ここでは「アップロード→実行」で自動で行っています。</p>
      </details>

      <div className="space-y-6">
        <RecordRegister
          record={record}
          onRegister={setRecord}
          onValidationError={setError}
          disabled={running}
          error={error}
          onErrorClear={() => setError(null)}
        />
        <UploadPanel
          files={files}
          onFilesChange={setFiles}
          disabled={running || !record?.candidateId}
        />

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={runPipeline}
            disabled={running || !record?.candidateId}
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
