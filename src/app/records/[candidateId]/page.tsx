"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { UploadPanel, type UploadFiles } from "@/components/UploadPanel";
import { fetchEmployees, type Employee } from "@/lib/portalApi";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";
import type { GoogleFormDefinition } from "@/types/googleForm";

type PipelineStep = "idle" | "analyzing" | "questions" | "excel" | "question_text" | "done" | "error";

type StatusType = "not_started" | "in_progress" | "done" | "error";

interface StoredRecord {
  candidateId: string;
  candidateName: string;
  careerAdvisor: string;
  lastOutputAt?: string;
  attachmentSummary?: { pdfName?: string; interviewLogName?: string; flagListName?: string };
  formUrl?: string;
  formEditUrl?: string;
  formId?: string;
  questionText?: string;
  hasAnalysisResult?: boolean;
  analysisResultAt?: string;
  analysisStatus?: StatusType;
  analysisError?: string;
  formStatus?: StatusType;
  formError?: string;
  achievementCategory?: string;
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

  const [files, setFiles] = useState<UploadFiles>({ pdf: null, interviewLog: null });
  const [step, setStep] = useState<PipelineStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [commonAnalysis, setCommonAnalysis] = useState<CommonAnalysisJson | null>(null);
  const [questions, setQuestions] = useState<GoogleFormDefinition | null>(null);
  const [excelBlobUrl, setExcelBlobUrl] = useState<string | null>(null);
  const [excelDownloadName, setExcelDownloadName] = useState("");

  const [achievementCategory, setAchievementCategory] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [questionGenError, setQuestionGenError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [formCreateError, setFormCreateError] = useState<string | null>(null);
  const [formCreateWarning, setFormCreateWarning] = useState<string | null>(null);
  const [formResponseUrl, setFormResponseUrl] = useState<string | null>(null);
  const [formEditUrl, setFormEditUrl] = useState<string | null>(null);
  const [formUrlCopyToast, setFormUrlCopyToast] = useState(false);
  const [formCreating, setFormCreating] = useState(false);
  const [useCachedAnalysis, setUseCachedAnalysis] = useState(false);
  const [retryPdfFile, setRetryPdfFile] = useState<File | null>(null);
  type LeftMenuKey = "detail" | "upload" | "output";
  const [activeMenu, setActiveMenu] = useState<LeftMenuKey>("upload");

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
          if (data.questionText) {
            setQuestionText(data.questionText);
          }
          if (data.achievementCategory) {
            setAchievementCategory(data.achievementCategory);
          }
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

  // Portal APIから社員一覧を取得
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const data = await fetchEmployees();
        setEmployees(data);
      } catch (err) {
        console.error("社員一覧の取得に失敗しました:", err);
      } finally {
        setIsLoadingEmployees(false);
      }
    };
    loadEmployees();
  }, []);

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
    const useCache = useCachedAnalysis && record.hasAnalysisResult;
    if (!useCache && !files.pdf && !files.interviewLog) {
      setError("PDF・面談ログのいずれか1つ以上をアップロードしてください。");
      return;
    }
    if (!achievementCategory || !ACHIEVEMENT_OPTIONS.includes(achievementCategory as (typeof ACHIEVEMENT_OPTIONS)[number])) {
      setError("実績ヒアリングの職種カテゴリを選択してください。");
      return;
    }
    if (!useCache && !files.pdf) {
      setError("質問文・フォーム生成のためPDFのアップロードが必須です。");
      return;
    }
    setError(null);
    setQuestionGenError(null);
    setFormCreateError(null);
    setFormCreateWarning(null);
    setQuestionText("");
    setFormResponseUrl(null);
    setFormEditUrl(null);
    setStep("analyzing");
    setActiveMenu("output");
    setCommonAnalysis(null);
    setQuestions(null);
    if (excelBlobUrl) {
      URL.revokeObjectURL(excelBlobUrl);
      setExcelBlobUrl(null);
    }
    try {
      const formData = new FormData();
      formData.append("candidateId", record.candidateId);
      if (useCache) {
        formData.append("useCachedAnalysis", "true");
      }
      if (files.pdf) formData.append("pdf", files.pdf);
      if (files.interviewLog) formData.append("interviewLog", files.interviewLog);
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
      const recommendedRaw = excelRes.headers.get("X-Recommended-Filename")?.trim();
      const recommended = recommendedRaw
        ? (recommendedRaw.includes("%") ? decodeURIComponent(recommendedRaw) : recommendedRaw)
        : "";
      const disp = excelRes.headers.get("Content-Disposition");
      const match = disp?.match(/filename\*?=(?:UTF-8'')?([^;]+)/);
      const fromDisp = match ? decodeURIComponent(match[1].replace(/^["']|["']$/g, "").trim()) : "";
      const fileName = recommended || fromDisp || "FM_インポートデータ_候補者.xlsx";
      const fileNameWithExt = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
      setExcelDownloadName(fileNameWithExt);
      setExcelBlobUrl(url);
      const attachmentSummary = {
        pdfName: files.pdf?.name ?? undefined,
        interviewLogName: files.interviewLog?.name ?? undefined,
        flagListName: undefined,
      };
      const cacheFormData = new FormData();
      cacheFormData.append("attachmentSummary", JSON.stringify(attachmentSummary));
      cacheFormData.append("excel", blob, fileNameWithExt);
      try {
        await fetch(`/api/records/${encodeURIComponent(record.candidateId)}/cache`, {
          method: "POST",
          body: cacheFormData,
        });
      } catch {
        // ignore
      }

      await fetch(`/api/records/${encodeURIComponent(record.candidateId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ achievementCategory }),
      }).catch(() => {});

      setStep("question_text");
      let generatedQuestionText = "";
      try {
        const qtFormData = new FormData();
        qtFormData.append("achievement_category", achievementCategory);
        if (record.candidateName) qtFormData.append("candidate_name", record.candidateName);
        qtFormData.append("pdf", files.pdf!);
        if (files.interviewLog) qtFormData.append("interviewLog", files.interviewLog);
        const qtRes = await fetch("/api/intake/hearing-question-text", {
          method: "POST",
          body: qtFormData,
        });
        const qtData = await qtRes.json().catch(() => ({}));
        if (!qtRes.ok) {
          const baseMsg = (qtData as { error?: string }).error || "質問文の生成に失敗しました";
          const hint = qtRes.status === 503
            ? " サービスが一時的に利用できません。しばらくしてから「質問文・フォームを再試行」を押してください。"
            : "";
          throw new Error(baseMsg + hint);
        }
        const text = (qtData as { candidate_question_text_only?: string }).candidate_question_text_only;
        generatedQuestionText = typeof text === "string" ? text : "";
        setQuestionText(generatedQuestionText);
        if (generatedQuestionText) {
          try {
            await fetch(`/api/records/${encodeURIComponent(record.candidateId)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ questionText: generatedQuestionText }),
            });
          } catch {
            // ignore save error
          }
        }
      } catch (e) {
        setQuestionGenError(e instanceof Error ? e.message : "質問文の生成に失敗しました");
        await fetch(`/api/records/${encodeURIComponent(record.candidateId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formStatus: "error",
            formError: "質問文生成に失敗しました（タイムアウトの可能性）",
          }),
        }).catch(() => {});
      }

      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
      setStep("error");
    }
  }, [record, files, excelBlobUrl, achievementCategory, name, useCachedAnalysis]);

  const handleCopyFormUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url).then(
      () => {
        setFormUrlCopyToast(true);
        setTimeout(() => setFormUrlCopyToast(false), 2000);
      },
      () => {}
    );
  }, []);

  const handleCreateForm = useCallback(async () => {
    if (!record?.candidateId) return;
    if (!questionText.trim()) {
      setFormCreateError("質問文が生成されていないため、フォームを作成できません。先に「出力開始」を実行してください。");
      return;
    }
    setFormCreating(true);
    setFormCreateError(null);
    setFormCreateWarning(null);
    try {
      const formRes = await fetch("/api/intake/create-google-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: record.candidateId,
          candidateName: record.candidateName ?? name,
          questionText: questionText.trim(),
        }),
      });
      const formDataRes = (await formRes.json()) as {
        responseUrl?: string;
        editUrl?: string;
        formId?: string;
        error?: string;
        shareWarning?: string;
      };
      if (!formRes.ok) {
        throw new Error(formDataRes.error || "フォームの作成に失敗しました");
      }
      if (formDataRes.responseUrl) {
        setFormResponseUrl(formDataRes.responseUrl);
        setFormEditUrl(formDataRes.editUrl ?? null);
      }
      if (formDataRes.shareWarning) {
        setFormCreateWarning(formDataRes.shareWarning);
      }
      setRecord((prev) =>
        prev
          ? {
              ...prev,
              formUrl: formDataRes.responseUrl ?? prev.formUrl,
              formEditUrl: formDataRes.editUrl ?? prev.formEditUrl,
              formId: formDataRes.formId ?? prev.formId,
            }
          : prev
      );
    } catch (e) {
      setFormCreateError(e instanceof Error ? e.message : "フォームの作成に失敗しました");
    } finally {
      setFormCreating(false);
    }
  }, [record, questionText, name]);

  const handleRetryQuestionAndForm = useCallback(
    async (pdfFile: File, interviewLog?: File | null) => {
      if (!record?.candidateId || !achievementCategory || !ACHIEVEMENT_OPTIONS.includes(achievementCategory as (typeof ACHIEVEMENT_OPTIONS)[number])) {
        setFormCreateError("再試行には実績ヒアリングの職種カテゴリ選択が必要です。");
        return;
      }
      setQuestionGenError(null);
      setFormCreateError(null);
      setFormCreating(true);
      try {
        const qtFormData = new FormData();
        qtFormData.append("achievement_category", achievementCategory);
        if (record.candidateName) qtFormData.append("candidate_name", record.candidateName);
        qtFormData.append("pdf", pdfFile);
        if (interviewLog) qtFormData.append("interviewLog", interviewLog);
        const qtRes = await fetch("/api/intake/hearing-question-text", {
          method: "POST",
          body: qtFormData,
        });
        const qtData = await qtRes.json().catch(() => ({}));
        if (!qtRes.ok) {
          const baseMsg = (qtData as { error?: string }).error || "質問文の生成に失敗しました";
          const hint = qtRes.status === 503
            ? " サービスが一時的に利用できません。しばらく経ってから再度お試しください。"
            : "";
          throw new Error(baseMsg + hint);
        }
        const text = (qtData as { candidate_question_text_only?: string }).candidate_question_text_only;
        const generatedQuestionText = typeof text === "string" ? text : "";
        setQuestionText(generatedQuestionText);
        if (!generatedQuestionText) {
          setFormCreating(false);
          return;
        }
        const formRes = await fetch("/api/intake/create-google-form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateId: record.candidateId,
            candidateName: record.candidateName ?? name,
            questionText: generatedQuestionText.trim(),
          }),
        });
        const formDataRes = (await formRes.json()) as {
          responseUrl?: string;
          editUrl?: string;
          formId?: string;
          error?: string;
          shareWarning?: string;
        };
        if (!formRes.ok) {
          throw new Error(formDataRes.error || "フォームの作成に失敗しました");
        }
        if (formDataRes.responseUrl) {
          setFormResponseUrl(formDataRes.responseUrl);
          setFormEditUrl(formDataRes.editUrl ?? null);
        }
        if (formDataRes.shareWarning) {
          setFormCreateWarning(formDataRes.shareWarning);
        }
        setRecord((prev) =>
          prev
            ? {
                ...prev,
                formUrl: formDataRes.responseUrl ?? prev.formUrl,
                formEditUrl: formDataRes.editUrl ?? prev.formEditUrl,
                formId: formDataRes.formId ?? prev.formId,
              }
            : prev
        );
        setQuestionGenError(null);
      } catch (e) {
        setQuestionGenError(e instanceof Error ? e.message : "質問文の生成に失敗しました");
      } finally {
        setFormCreating(false);
      }
    },
    [record, achievementCategory, name]
  );

  const handleRetryQuestionTextAndForm = useCallback(() => {
    const pdf = files.pdf ?? retryPdfFile;
    if (!record?.candidateId || !pdf || !achievementCategory || !ACHIEVEMENT_OPTIONS.includes(achievementCategory as (typeof ACHIEVEMENT_OPTIONS)[number])) {
      setFormCreateError("再試行にはPDFの選択と実績ヒアリングの職種カテゴリ選択が必要です。");
      return;
    }
    handleRetryQuestionAndForm(pdf, files.interviewLog);
  }, [record, files.pdf, files.interviewLog, retryPdfFile, achievementCategory, handleRetryQuestionAndForm]);

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

  const running =
    step === "analyzing" ||
    step === "questions" ||
    step === "excel" ||
    step === "question_text";
  const hasFiles = !!(files.pdf || files.interviewLog);
  const canUseCachedAnalysis = useCachedAnalysis && record?.hasAnalysisResult;
  const canStartOutput =
    (hasFiles || canUseCachedAnalysis) &&
    !!achievementCategory &&
    ACHIEVEMENT_OPTIONS.includes(achievementCategory as (typeof ACHIEVEMENT_OPTIONS)[number]);

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

  const stepLabel =
    step === "analyzing"
      ? "解析中…"
      : step === "questions"
        ? "質問生成中…"
        : step === "excel"
          ? "Excel生成中…"
          : step === "question_text"
            ? "質問文生成中…"
            : null;

  const menuItems: { key: LeftMenuKey; label: string; sub: string }[] = [
    { key: "detail", label: "詳細", sub: "基本情報・保存" },
    { key: "upload", label: "アップロード", sub: "ファイルを投入" },
    { key: "output", label: "出力結果", sub: "Excel・質問文・フォーム" },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 上部: 戻るリンク + 対象求職者情報バー */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <Link href="/" className="inline-flex text-sm text-blue-600 hover:underline">
            ← トップへ戻る
          </Link>
          <div className="mt-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-gray-800">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span>
                <span className="font-medium">対象求職者：</span>
                {name || "—"} （ID: {record.candidateId}）
              </span>
              <span>
                <span className="font-medium">キャリアアドバイザー：</span>
                {advisor || "—"}
              </span>
              <span>
                <span className="font-medium">レコードID：</span>
                {record.candidateId}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col md:flex-row md:min-h-[calc(100vh-10rem)]">
        {/* 左サイドメニュー */}
        <nav className="w-full border-b border-gray-200 bg-white md:w-56 md:flex-shrink-0 md:border-b-0 md:border-r">
          <ul className="flex flex-row gap-0 md:flex-col md:py-4">
            {menuItems.map(({ key, label, sub }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setActiveMenu(key)}
                  className={`w-full px-4 py-3 text-left text-sm md:py-2.5 md:pl-4 md:pr-3 ${
                    activeMenu === key
                      ? "border-b-2 border-blue-600 bg-blue-50 text-blue-800 md:border-b-0 md:border-r-2 md:bg-blue-50"
                      : "border-b border-gray-100 text-gray-700 hover:bg-gray-50 md:border-b-0"
                  }`}
                >
                  <span className="font-medium">{label}</span>
                  <span className="ml-2 text-xs text-gray-500 md:block md:ml-0 md:mt-0.5">{sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* メインコンテンツ */}
        <div className="min-w-0 flex-1 p-4 md:p-6">
          {activeMenu === "detail" && (
            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h1 className="mb-4 text-lg font-semibold text-gray-900">詳細</h1>
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
                    className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="detail-advisor" className="mb-1 block text-sm font-medium text-gray-700">担当キャリアアドバイザー</label>
                  <select
                    id="detail-advisor"
                    value={advisor}
                    onChange={(e) => setAdvisor(e.target.value)}
                    className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    {isLoadingEmployees ? (
                      <option value="">読み込み中...</option>
                    ) : (
                      employees.map((emp) => (
                        <option key={emp.employeeNo} value={emp.name}>{emp.name}</option>
                      ))
                    )}
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
          )}

          {activeMenu === "upload" && (
            <section className="space-y-6">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-2 text-lg font-semibold text-gray-900">ファイルアップロード</h2>
                <p className="mb-4 text-sm text-gray-500">PDF・面談ログをドラッグ＆ドロップまたはクリックで選択</p>
                <UploadPanel files={files} onFilesChange={setFiles} disabled={running} showTitle={false} />
                {!hasFiles && step === "idle" && (
                  <p className="mt-3 text-sm text-amber-700">ファイルを選択してください。</p>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-2 text-base font-semibold text-gray-900">出力に必要な入力</h2>
                <div className="max-w-md">
                  <label htmlFor="achievement-category" className="mb-1 block text-sm font-medium text-gray-700">
                    実績ヒアリングの職種カテゴリ <span className="text-red-600">必須</span>
                  </label>
                  <select
                    id="achievement-category"
                    value={achievementCategory}
                    onChange={(e) => {
                      setAchievementCategory(e.target.value);
                      setQuestionGenError(null);
                    }}
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
                {record.hasAnalysisResult && (
                  <div className="mt-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={useCachedAnalysis}
                        onChange={(e) => setUseCachedAnalysis(e.target.checked)}
                        disabled={running}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">
                        保存済みの解析結果を使用（Gemini APIをスキップ）
                      </span>
                    </label>
                    {record.analysisResultAt && (
                      <p className="ml-6 mt-1 text-xs text-gray-500">
                        保存日時: {new Date(record.analysisResultAt).toLocaleString("ja-JP")}
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  {record.lastOutputAt && (
                    <button
                      type="button"
                      onClick={handleReoutput}
                      disabled={running}
                      className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      再出力（キャッシュ）
                    </button>
                  )}
                  {step === "idle" && (
                    <button
                      type="button"
                      onClick={runPipeline}
                      disabled={!canStartOutput}
                      className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      出力開始
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeMenu === "output" && (
            <section className="flex flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm md:min-h-0">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">出力結果</h2>
              {running && (
                <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <p className="font-medium animate-pulse">{stepLabel}</p>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">解析中です。少々お待ちください。</p>
                </div>
              )}
              {step === "error" && error && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                  {error}
                </div>
              )}
              {step === "done" && (
                <div className="flex flex-col gap-6 overflow-auto">
                  {excelBlobUrl && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-green-800">Excel</p>
                      <button
                        type="button"
                        onClick={handleDownloadExcel}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Excel をダウンロード
                      </button>
                    </div>
                  )}
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-700">Googleフォーム</p>
                    {questionGenError && (
                      <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800" role="alert">
                        {questionGenError}
                      </div>
                    )}
                    {formCreateError && (
                      <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800" role="alert">
                        {formCreateError}
                      </div>
                    )}
                    {formCreateWarning && (
                      <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800" role="status">
                        {formCreateWarning}
                      </div>
                    )}
                    {(formResponseUrl || record?.formUrl) ? (
                      <div className="rounded border border-gray-200 bg-gray-50 p-3">
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
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            URLをコピー
                          </button>
                          {formUrlCopyToast && <span className="text-xs text-green-600">コピーしました</span>}
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
                    ) : (
                      <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-3">
                        {questionGenError && (
                          <p className="text-sm text-gray-700">
                            {achievementCategory
                              ? "503 などで質問文の生成に失敗した場合は、しばらく経ってから下のPDFを選択し「質問文・フォームを再試行」を押してください。"
                              : "質問文を生成するには「アップロード」でファイルを再度添付し、実績ヒアリングの職種カテゴリを選択して「出力開始」を実行してください。"}
                          </p>
                        )}
                        {!questionText && achievementCategory && (
                          <div className="space-y-2">
                            <p className="text-sm text-gray-700">
                              質問文が生成されていません。PDFを選択して再試行してください。
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                <input
                                  type="file"
                                  accept=".pdf"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    setRetryPdfFile(f ?? null);
                                  }}
                                />
                                PDFファイル選択
                              </label>
                              {retryPdfFile && <span className="text-xs text-gray-600">{retryPdfFile.name}</span>}
                              <button
                                type="button"
                                onClick={handleRetryQuestionTextAndForm}
                                disabled={formCreating || !(files.pdf || retryPdfFile)}
                                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                              >
                                {formCreating ? "再試行中..." : "質問文・フォームを再試行"}
                              </button>
                            </div>
                          </div>
                        )}
                        {questionText && (
                            <button
                              type="button"
                              onClick={handleCreateForm}
                              disabled={formCreating}
                              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {formCreating ? "作成中..." : "Googleフォームを作成"}
                            </button>
                          )}
                        </div>
                    )}
                  </div>
                </div>
              )}
              {step === "idle" && !running && (
                <>
                  {(record?.lastOutputAt || record?.formUrl || record?.analysisStatus) ? (
                    <div className="flex flex-col gap-6 overflow-auto">
                      {record?.lastOutputAt && (
                        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                          <p className="font-medium">前回の出力結果</p>
                          <p className="mt-1 text-xs">最終出力: {new Date(record.lastOutputAt).toLocaleString("ja-JP")}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          record?.analysisStatus === "done" ? "bg-green-100 text-green-800" :
                          record?.analysisStatus === "error" ? "bg-red-100 text-red-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          解析: {record?.analysisStatus === "done" ? "完了" : record?.analysisStatus === "error" ? "エラー" : "未実行"}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          record?.formStatus === "done" ? "bg-green-100 text-green-800" :
                          record?.formStatus === "error" ? "bg-red-100 text-red-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          フォーム: {record?.formStatus === "done" ? "作成済" : record?.formStatus === "error" ? "エラー" : "未作成"}
                        </span>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium text-gray-700">Googleフォーム</p>
                        {formCreateError && (
                          <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800" role="alert">
                            {formCreateError}
                          </div>
                        )}
                        {formCreateWarning && (
                          <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800" role="status">
                            {formCreateWarning}
                          </div>
                        )}
                        {(formResponseUrl || record?.formUrl) ? (
                          <div className="rounded border border-gray-200 bg-gray-50 p-3">
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
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                URLをコピー
                              </button>
                              {formUrlCopyToast && <span className="text-xs text-green-600">コピーしました</span>}
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
                        ) : !questionText && achievementCategory ? (
                          <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-3">
                            <p className="text-sm text-gray-700">
                              質問文が生成されていません。PDFを選択して再試行してください。
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                <input
                                  type="file"
                                  accept=".pdf"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    setRetryPdfFile(f ?? null);
                                  }}
                                />
                                PDFファイル選択
                              </label>
                              {retryPdfFile && <span className="text-xs text-gray-600">{retryPdfFile.name}</span>}
                              <button
                                type="button"
                                onClick={() => retryPdfFile && handleRetryQuestionAndForm(retryPdfFile, undefined)}
                                disabled={formCreating || !retryPdfFile}
                                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                              >
                                {formCreating ? "再試行中..." : "質問文・フォームを再試行"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded border border-gray-200 bg-gray-50 p-3">
                            <button
                              type="button"
                              onClick={handleCreateForm}
                              disabled={formCreating}
                              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {formCreating ? "作成中..." : "Googleフォームを作成"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">「アップロード」でファイルを添付し、実績ヒアリングの職種カテゴリを選択して「出力開始」を押すと、ExcelとGoogleフォームが作成されます。</p>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
