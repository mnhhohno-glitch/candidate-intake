"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { UploadPanel, type UploadFiles } from "@/components/UploadPanel";
import { CAREER_ADVISORS } from "@/components/RecordRegister";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";
import type { GoogleFormDefinition } from "@/types/googleForm";

type PipelineStep = "idle" | "analyzing" | "questions" | "excel" | "done" | "error";

interface StoredRecord {
  candidateId: string;
  candidateName: string;
  careerAdvisor: string;
  lastOutputAt?: string;
  attachmentSummary?: { pdfName?: string; interviewLogName?: string; flagListName?: string };
}

export default function RecordDetailPage() {
  const params = useParams();
  const router = useRouter();
  const candidateId = typeof params.candidateId === "string" ? params.candidateId : "";
  const [record, setRecord] = useState<StoredRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [advisor, setAdvisor] = useState<string>("");
  const [saveMessage, setSaveMessage] = useState<"saved" | "error" | null>(null);

  const [files, setFiles] = useState<UploadFiles>({ pdf: null, interviewLog: null, flagList: null });
  const [step, setStep] = useState<PipelineStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [commonAnalysis, setCommonAnalysis] = useState<CommonAnalysisJson | null>(null);
  const [questions, setQuestions] = useState<GoogleFormDefinition | null>(null);
  const [excelBlobUrl, setExcelBlobUrl] = useState<string | null>(null);
  const [excelDownloadName, setExcelDownloadName] = useState("");

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/records/${encodeURIComponent(candidateId)}`);
        if (!res.ok) {
          if (res.status === 404) setNotFound(true);
          return;
        }
        const data = (await res.json()) as StoredRecord;
        if (!cancelled) {
          setRecord(data);
          setName(data.candidateName ?? "");
          setAdvisor(data.careerAdvisor ?? "");
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  useEffect(() => {
    return () => { if (excelBlobUrl) URL.revokeObjectURL(excelBlobUrl); };
  }, [excelBlobUrl]);

  const handleSave = useCallback(async () => {
    if (!candidateId) return;
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/records/${encodeURIComponent(candidateId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateName: name.trim(), careerAdvisor: advisor }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      const updated = (await res.json()) as StoredRecord;
      setRecord(updated);
      setSaveMessage("saved");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      setSaveMessage("error");
    }
  }, [candidateId, name, advisor]);

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
      const analyzeRes = await fetch("/api/intake/analyze", { method: "POST", body: formData });
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
      const fileName = match ? decodeURIComponent(match[1].replace(/^["']|["']$/g, "")) : "基本情報シート.xlsx";
      setExcelDownloadName(fileName);
      setExcelBlobUrl(url);
      setStep("done");
      const attachmentSummary = {
        pdfName: files.pdf?.name ?? undefined,
        interviewLogName: files.interviewLog?.name ?? undefined,
        flagListName: files.flagList?.name ?? undefined,
      };
      const cacheFormData = new FormData();
      cacheFormData.append("attachmentSummary", JSON.stringify(attachmentSummary));
      cacheFormData.append("excel", blob, fileName);
      try {
        await fetch(`/api/records/${encodeURIComponent(record.candidateId)}/cache`, {
          method: "POST",
          body: cacheFormData,
        });
      } catch {
        // ignore
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
      setStep("error");
    }
  }, [record, files, excelBlobUrl]);

  const handleReoutput = useCallback(async () => {
    if (!candidateId) return;
    try {
      const res = await fetch(`/api/records/${encodeURIComponent(candidateId)}/excel`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "再出力できません");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `再出力_${candidateId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "再出力に失敗しました");
    }
  }, [candidateId]);

  const handleDownloadExcel = useCallback(() => {
    if (!excelBlobUrl) return;
    const a = document.createElement("a");
    a.href = excelBlobUrl;
    a.download = excelDownloadName;
    a.click();
  }, [excelBlobUrl, excelDownloadName]);

  const running = step === "analyzing" || step === "questions" || step === "excel";
  const hasFiles = !!(files.pdf || files.interviewLog || files.flagList);

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-2xl text-center text-gray-500">読み込み中...</div>
      </main>
    );
  }
  if (notFound || !record) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Link href="/" className="text-blue-600 hover:underline">← トップへ戻る</Link>
          <p className="mt-4 text-gray-600">レコードが見つかりません。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/" className="inline-flex text-sm text-blue-600 hover:underline">
          ← トップへ戻る
        </Link>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-xl font-semibold text-gray-900">詳細</h1>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">求職者ID</label>
              <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {record.candidateId}
              </p>
            </div>
            <div>
              <label htmlFor="detail-name" className="mb-1 block text-sm font-medium text-gray-700">氏名</label>
              <input
                id="detail-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="detail-advisor" className="mb-1 block text-sm font-medium text-gray-700">担当キャリアアドバイザー</label>
              <select
                id="detail-advisor"
                value={advisor}
                onChange={(e) => setAdvisor(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {CAREER_ADVISORS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                保存
              </button>
              {saveMessage === "saved" && <span className="text-sm text-green-600">保存しました</span>}
              {saveMessage === "error" && <span className="text-sm text-red-600">保存に失敗しました</span>}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">ファイル投入</h2>
          <p className="mb-4 text-sm text-gray-500">PDF・面談ログ・フラグリストをアップロードします。</p>
          <UploadPanel files={files} onFilesChange={setFiles} disabled={running} showTitle={false} />
          {!hasFiles && step === "idle" && (
            <p className="mt-2 text-sm text-amber-700">ファイルを選択してください。</p>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          {record.lastOutputAt && (
            <button
              type="button"
              onClick={handleReoutput}
              disabled={running}
              className="rounded-lg bg-gray-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              再出力（キャッシュからダウンロード）
            </button>
          )}
          {step === "idle" && (
            <button
              type="button"
              onClick={runPipeline}
              disabled={!hasFiles}
              className="rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              出力開始
            </button>
          )}
        </div>

        {(running || step === "done" || step === "error") && (
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {running && (
              <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-gray-800">
                <p className="font-medium">出力を開始しました。納品をお待ちください。</p>
                <p className="mt-1 text-xs text-gray-500">納品待ち（出力処理中）</p>
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
