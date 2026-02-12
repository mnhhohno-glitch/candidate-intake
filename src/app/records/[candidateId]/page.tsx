"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { UploadPanel, type UploadFiles } from "@/components/UploadPanel";
import { CAREER_ADVISORS } from "@/components/RecordRegister";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";
import type { GoogleFormDefinition } from "@/types/googleForm";

type PipelineStep = "idle" | "analyzing" | "questions" | "excel" | "done" | "error";

const JOB_TYPE_UNSPECIFIED_MESSAGE =
  "応募先の職種を指定してください：「 」に入力してください";

interface StoredRecord {
  candidateId: string;
  candidateName: string;
  careerAdvisor: string;
  lastOutputAt?: string;
  attachmentSummary?: { pdfName?: string; interviewLogName?: string; flagListName?: string };
  formUrl?: string;
  formEditUrl?: string;
  formId?: string;
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

  const [jobType, setJobType] = useState("");
  const [achievementCategory, setAchievementCategory] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [questionGenLoading, setQuestionGenLoading] = useState(false);
  const [questionGenError, setQuestionGenError] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const [formCreateLoading, setFormCreateLoading] = useState(false);
  const [formCreateError, setFormCreateError] = useState<string | null>(null);
  const [formCreateWarning, setFormCreateWarning] = useState<string | null>(null);
  const [formResponseUrl, setFormResponseUrl] = useState<string | null>(null);
  const [formEditUrl, setFormEditUrl] = useState<string | null>(null);
  const [formUrlCopyToast, setFormUrlCopyToast] = useState(false);

  const ACHIEVEMENT_OPTIONS = [
    "営業・販売（数字を追う職種）",
    "事務・サポート職",
    "専門・技術職",
    "マネジメント職",
  ] as const;

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
      const fileName = match ? decodeURIComponent(match[1].replace(/^["']|["']$/g, "").trim()) : "基本情報シート_候補者.xlsx";
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

  const handleGenerateQuestionText = useCallback(async () => {
    setQuestionGenError(null);
    const jobTypeTrim = jobType.trim();
    if (!jobTypeTrim) {
      setQuestionText(JOB_TYPE_UNSPECIFIED_MESSAGE);
      return;
    }
    if (!achievementCategory || !ACHIEVEMENT_OPTIONS.includes(achievementCategory as (typeof ACHIEVEMENT_OPTIONS)[number])) {
      setQuestionGenError("実績ヒアリングの職種カテゴリを選択してください。");
      return;
    }
    if (!files.pdf) {
      setQuestionGenError("PDFをアップロードしてください。");
      return;
    }
    setQuestionGenLoading(true);
    setQuestionText("");
    try {
      const formData = new FormData();
      formData.append("job_type", jobTypeTrim);
      formData.append("achievement_category", achievementCategory);
      if (record?.candidateName) formData.append("candidate_name", record.candidateName);
      formData.append("pdf", files.pdf);
      if (files.interviewLog) formData.append("interviewLog", files.interviewLog);
      const res = await fetch("/api/intake/hearing-question-text", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "質問文の生成に失敗しました");
      }
      const text = (data as { candidate_question_text_only?: string }).candidate_question_text_only;
      setQuestionText(typeof text === "string" ? text : JOB_TYPE_UNSPECIFIED_MESSAGE);
    } catch (e) {
      setQuestionGenError(e instanceof Error ? e.message : "質問文の生成に失敗しました");
      setQuestionText("");
    } finally {
      setQuestionGenLoading(false);
    }
  }, [jobType, achievementCategory, record?.candidateName, files.pdf, files.interviewLog]);

  const handleCopyQuestionText = useCallback(() => {
    if (!questionText) return;
    navigator.clipboard.writeText(questionText).then(
      () => {
        setCopyToast(true);
        setTimeout(() => setCopyToast(false), 2000);
      },
      () => {
        setQuestionGenError("コピーに失敗しました");
      }
    );
  }, [questionText]);

  const handleCreateGoogleForm = useCallback(async () => {
    if (!candidateId || !questionText.trim()) return;
    setFormCreateError(null);
    setFormCreateWarning(null);
    setFormCreateLoading(true);
    setFormResponseUrl(null);
    setFormEditUrl(null);
    try {
      const res = await fetch("/api/intake/create-google-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          candidateName: record?.candidateName ?? name,
          questionText: questionText.trim(),
        }),
      });
      const data = (await res.json()) as {
        responseUrl?: string;
        editUrl?: string;
        formId?: string;
        error?: string;
        shareWarning?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "フォームの作成に失敗しました");
      }
      if (data.responseUrl) {
        setFormResponseUrl(data.responseUrl);
        setFormEditUrl(data.editUrl ?? null);
      }
      if (data.shareWarning) {
        setFormCreateWarning(data.shareWarning);
      }
      if (record) {
        setRecord({
          ...record,
          formUrl: data.responseUrl ?? record.formUrl,
          formEditUrl: data.editUrl ?? record.formEditUrl,
          formId: data.formId ?? record.formId,
        });
      }
    } catch (e) {
      setFormCreateError(e instanceof Error ? e.message : "フォームの作成に失敗しました");
    } finally {
      setFormCreateLoading(false);
    }
  }, [candidateId, questionText, record, name]);

  const handleCopyFormUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url).then(
      () => {
        setFormUrlCopyToast(true);
        setTimeout(() => setFormUrlCopyToast(false), 2000);
      },
      () => {}
    );
  }, []);

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

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">質問文テキスト生成（候補者送付用）</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="job-type" className="mb-1 block text-sm font-medium text-gray-700">
                応募先の職種（job_type）
              </label>
              <input
                id="job-type"
                type="text"
                value={jobType}
                onChange={(e) => {
                  setJobType(e.target.value);
                  setQuestionGenError(null);
                }}
                placeholder="例：営業、事務"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="achievement-category" className="mb-1 block text-sm font-medium text-gray-700">
                実績ヒアリングの職種カテゴリ（achievement_category） <span className="text-red-600">必須</span>
              </label>
              <select
                id="achievement-category"
                value={achievementCategory}
                onChange={(e) => {
                  setAchievementCategory(e.target.value);
                  setQuestionGenError(null);
                }}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">選択してください</option>
                {ACHIEVEMENT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="button"
                onClick={handleGenerateQuestionText}
                disabled={questionGenLoading || running}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {questionGenLoading ? "生成中…" : "質問文を生成"}
              </button>
            </div>
            {questionGenError && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                {questionGenError}
              </div>
            )}
            <div>
              <label htmlFor="question-text" className="mb-1 block text-sm font-medium text-gray-700">
                生成された質問文（候補者送付用）
              </label>
              <textarea
                id="question-text"
                readOnly
                value={questionText}
                rows={12}
                className="w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono"
                placeholder="「質問文を生成」を押すとここに表示されます"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyQuestionText}
                  disabled={!questionText}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  コピー
                </button>
                {copyToast && (
                  <span className="text-sm text-green-600">コピーしました</span>
                )}
                <button
                  type="button"
                  onClick={handleCreateGoogleForm}
                  disabled={formCreateLoading || !questionText.trim()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={questionText.trim() ? "生成された質問文からGoogleフォームを作成" : "先に「質問文を生成」を実行してください"}
                >
                  {formCreateLoading ? "作成中…" : "Googleフォームを作成"}
                </button>
              </div>
              {formCreateError && (
                <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                  {formCreateError}
                </div>
              )}
              {formCreateWarning && (
                <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
                  {formCreateWarning}
                </div>
              )}
              {(formResponseUrl || record?.formUrl) && (
                <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-4">
                  <h3 className="mb-2 text-sm font-medium text-gray-700">作成済みフォーム（回答用URL・候補者に送付）</h3>
                  <p className="mb-2 break-all text-sm text-blue-700">
                    <a
                      href={formResponseUrl || record?.formUrl || ""}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {formResponseUrl || record?.formUrl}
                    </a>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyFormUrl(formResponseUrl || record?.formUrl || "")}
                      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      URLをコピー
                    </button>
                    {formUrlCopyToast && <span className="text-sm text-green-600">コピーしました</span>}
                  </div>
                  {(formEditUrl || record?.formEditUrl) && (
                    <p className="mt-2 text-xs text-gray-500">
                      編集用:{" "}
                      <a
                        href={formEditUrl || record?.formEditUrl || ""}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {formEditUrl || record?.formEditUrl}
                      </a>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
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
