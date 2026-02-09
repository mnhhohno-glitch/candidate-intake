"use client";

import type { CommonAnalysisJson } from "@/types/commonAnalysis";
import type { GoogleFormDefinition } from "@/types/googleForm";

type Step = "idle" | "analyzing" | "questions" | "excel" | "done" | "error";

export function ResultPanel({
  step,
  error,
  commonAnalysis,
  questions,
  excelBlobUrl,
  onDownloadExcel,
}: {
  step: Step;
  error: string | null;
  commonAnalysis: CommonAnalysisJson | null;
  questions: GoogleFormDefinition | null;
  excelBlobUrl: string | null;
  onDownloadExcel: () => void;
}) {
  const hasAnyInput = step !== "idle" || commonAnalysis !== null;

  return (
    <section className="rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">2. 結果</h2>

      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className={step === "analyzing" ? "animate-pulse font-medium" : ""}>
            {step === "analyzing" ? "① 共通解析中…" : commonAnalysis ? "① 共通解析済" : "① 共通解析 —"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={step === "questions" ? "animate-pulse font-medium" : ""}>
            {step === "questions" ? "② 質問JSON生成中…" : questions ? "② 質問JSON済" : "② 質問JSON —"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={step === "excel" ? "animate-pulse font-medium" : ""}>
            {step === "excel" ? "③ Excel生成中…" : excelBlobUrl ? "③ Excel済" : "③ Excel —"}
          </span>
          {excelBlobUrl && (
            <button
              type="button"
              onClick={onDownloadExcel}
              className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
            >
              ダウンロード
            </button>
          )}
        </div>
      </div>

      {hasAnyInput && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">プレビュー（JSON）</summary>
          <div className="mt-2 max-h-60 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs">
            {commonAnalysis && (
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(commonAnalysis, null, 2).slice(0, 3000)}
                {(JSON.stringify(commonAnalysis).length > 3000) ? "…" : ""}
              </pre>
            )}
            {questions && !commonAnalysis && (
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(questions, null, 2).slice(0, 3000)}
                {(JSON.stringify(questions).length > 3000) ? "…" : ""}
              </pre>
            )}
            {!commonAnalysis && !questions && <span className="text-gray-500">データなし</span>}
          </div>
        </details>
      )}
    </section>
  );
}
