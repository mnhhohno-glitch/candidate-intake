import { NextRequest, NextResponse } from "next/server";
import { generateWithGeminiWithPdf, parseJsonResponse } from "@/services/geminiClient";
import { extractTextFromXlsx } from "@/services/extractText";
import {
  isValidWebResumeFilename,
  extractCandidateNoFromFilename,
  WEB_RESUME_FILENAME_ERROR_MESSAGE,
} from "@/services/candidateNoFromFilename";
import { buildCommonAnalysisResponseSchema } from "@/services/flagListSchema";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";

const MAX_RETRIES = 2;

function isValidCommonAnalysis(obj: unknown): obj is CommonAnalysisJson {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.extracted_facts === "object" &&
    o.extracted_facts !== null &&
    !Array.isArray(o.extracted_facts) &&
    typeof o.filemaker_mapping === "object" &&
    o.filemaker_mapping !== null &&
    !Array.isArray(o.filemaker_mapping) &&
    Array.isArray(o.missing_items)
  );
}

/**
 * Geminiの返却がラップされていたり欠けている場合に正規化する。
 * work_history は workHistory / 職歴 等の別名でも受け取り、必ず配列で extracted_facts に設定する。
 */
function normalizeCommonAnalysis(parsed: unknown): CommonAnalysisJson {
  let o = parsed as Record<string, unknown>;
  if (o?.common_analysis_json && typeof o.common_analysis_json === "object" && o.common_analysis_json !== null) {
    o = o.common_analysis_json as Record<string, unknown>;
  }
  const extracted_facts = typeof o.extracted_facts === "object" && o.extracted_facts !== null && !Array.isArray(o.extracted_facts)
    ? (o.extracted_facts as Record<string, unknown>)
    : {};
  let work_history = extracted_facts.work_history;
  if (!Array.isArray(work_history)) {
    const raw = (extracted_facts.workHistory ?? extracted_facts.職歴 ?? extracted_facts["work history"]) as unknown;
    work_history = Array.isArray(raw) ? raw : [];
  }
  extracted_facts.work_history = work_history;
  if (extracted_facts.tense === undefined && (extracted_facts as Record<string, unknown>).時制 !== undefined) {
    extracted_facts.tense = (extracted_facts as Record<string, unknown>).時制 as string;
  }
  if (!Array.isArray(extracted_facts.reading_targets)) {
    const alt = (extracted_facts as Record<string, unknown>).読むべき内容;
    extracted_facts.reading_targets = Array.isArray(alt) ? (alt as string[]) : [];
  }
  if (extracted_facts.evidence_map !== undefined && (typeof extracted_facts.evidence_map !== "object" || Array.isArray(extracted_facts.evidence_map))) {
    delete extracted_facts.evidence_map;
  }

  const filemaker_mapping = typeof o.filemaker_mapping === "object" && o.filemaker_mapping !== null && !Array.isArray(o.filemaker_mapping)
    ? o.filemaker_mapping as Record<string, unknown>
    : {};
  const missing_items = Array.isArray(o.missing_items) ? o.missing_items : [];
  return { extracted_facts, filemaker_mapping, missing_items } as CommonAnalysisJson;
}

/** 退職理由・転職理由が filemaker_mapping と work_history の両方で空かどうか */
function isResignationEmpty(result: CommonAnalysisJson): boolean {
  const fm = result.filemaker_mapping as Record<string, unknown>;
  const fmVal = (key: string) => {
    const x = fm[key];
    return x != null && String(x).trim() !== "";
  };
  if (fmVal("転職時期メモ") || fmVal("転職活動期間メモ")) return false;
  const wh = result.extracted_facts?.work_history;
  if (!Array.isArray(wh)) return true;
  for (const item of wh) {
    const r = item as Record<string, unknown>;
    if (
      (r.退職理由_大 != null && String(r.退職理由_大).trim() !== "") ||
      (r.退職理由_中 != null && String(r.退職理由_中).trim() !== "") ||
      (r.退職理由_小 != null && String(r.退職理由_小).trim() !== "") ||
      (r.転職理由メモ != null && String(r.転職理由メモ).trim() !== "") ||
      (r.resignation_reason != null && String(r.resignation_reason).trim() !== "")
    )
      return false;
  }
  return true;
}

/** 2パス目の結果で退職理由関連を1パス目にマージする */
function mergeResignationFromSecond(
  first: CommonAnalysisJson,
  second: CommonAnalysisJson
): void {
  const fm1 = first.filemaker_mapping as Record<string, unknown>;
  const fm2 = second.filemaker_mapping as Record<string, unknown>;
  const setIfEmpty = (key: string) => {
    const v2 = fm2[key];
    if (v2 != null && String(v2).trim() !== "" && (fm1[key] == null || String(fm1[key]).trim() === "")) {
      fm1[key] = v2;
    }
  };
  setIfEmpty("転職時期メモ");
  setIfEmpty("転職活動期間メモ");
  const wh2 = second.extracted_facts?.work_history;
  const wh1 = first.extracted_facts?.work_history;
  if (Array.isArray(wh2) && Array.isArray(wh1) && wh2.length === wh1.length) {
    const keys = ["退職理由_大", "退職理由_中", "退職理由_小", "転職理由メモ", "resignation_reason"];
    for (let i = 0; i < wh1.length; i++) {
      const a = wh1[i] as Record<string, unknown>;
      const b = wh2[i] as Record<string, unknown>;
      for (const k of keys) {
        const bv = b[k];
        if (bv != null && String(bv).trim() !== "" && (a[k] == null || String(a[k]).trim() === "")) {
          a[k] = bv;
        }
      }
    }
  } else if (Array.isArray(wh2) && wh2.length > 0) {
    first.extracted_facts.work_history = wh2;
  }
  if (second.extracted_facts?.tense != null && String(second.extracted_facts.tense).trim() !== "" && (first.extracted_facts.tense == null || String(first.extracted_facts.tense).trim() === "")) {
    first.extracted_facts.tense = second.extracted_facts.tense;
  }
}

function logInvalidStructure(parsed: unknown): void {
  const o = parsed as Record<string, unknown>;
  const keys = o ? Object.keys(o) : [];
  console.error(
    "[intake/analyze] Invalid common_analysis_json structure. Keys:",
    keys.join(", "),
    "| extracted_facts:",
    typeof o?.extracted_facts,
    Array.isArray(o?.extracted_facts) ? "(array)" : "",
    "| filemaker_mapping:",
    typeof o?.filemaker_mapping,
    Array.isArray(o?.filemaker_mapping) ? "(array)" : "",
    "| missing_items:",
    Array.isArray(o?.missing_items) ? "array" : typeof o?.missing_items
  );
}

function buildSystemInstruction(): string {
  return `あなたは転職支援会社の業務システムにおいて、新規求職者データ用の「共通解析JSON」を出力するAIです。

【あなたの役割】
添付されたPDF（Web履歴書）を視覚的に正確に読み取り、面談メモ・フラグリストと照合して、FileMakerインポート用のデータを生成してください。

【絶対ルール】
1. PDFは画像として直接読み取る。テキスト抽出ではなく、視覚的なレイアウト（表・行・列）を正確に認識すること。
2. 職歴は在籍順に正確に特定する。会社数・在籍期間を間違えない。
3. フラグ項目は、提供されたJSON Schemaのenum値のいずれかを厳密に使用する。enumにない値は出力しない。
4. 推測・捏造は禁止。根拠がある情報のみ出力する。
5. 退職理由・時制は、面談メモから必ず読み取り、空欄にしない。
6. 出力はJSON Schemaに完全に準拠したJSONのみ。説明文は含めない。

【特に注意】
- 在籍期間_年・在籍期間_ヶ月は、入社・退社日から計算し、空欄にしない
- 職種フラグ・退職理由_大/中/小は、フラグリストの選択肢から選ぶ（言い換え禁止）
- 初回面談まとめには面談要約のみ。求職者NOやキー情報は含めない
- インポート用照合キーは求職者NO（7桁）に1を足した8桁の数値`;
}

function buildUserPrompt(
  interviewLog: string,
  flagListText: string,
  pdfFileName: string | null,
  candidateNo: string
): string {
  const filenameBlock = pdfFileName
    ? `【求職者NO】PDFファイル名「${pdfFileName}」から「${candidateNo}」を使用してください。`
    : `【求職者NO】${candidateNo}`;

  return `${filenameBlock}

【タスク】
添付のPDF（Web履歴書）を視覚的に読み取り、下記の面談メモ・フラグリストと照合して、共通解析JSONを生成してください。

【重要な処理順序】
1. PDFを画像として読み取り、職歴（会社名・期間・職種）を在籍順に正確に特定する
2. 面談メモから退職理由・転職意向・希望条件を抽出する
3. フラグリストの選択肢に合わせてフラグ値を設定する
4. 全ての情報をJSON Schemaに従って出力する

【面談の通話文字起こしメモ】
${interviewLog || "(なし)"}

【フラグリスト（選択肢の参照用）】
${flagListText || "(なし)"}

【出力形式】
JSON Schemaに完全準拠したJSONのみを出力してください。`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const pdfFile = formData.get("pdf") as File | null;
    const interviewFile = formData.get("interviewLog") as File | null;
    const flagListFile = formData.get("flagList") as File | null;
    const registeredCandidateId = (formData.get("candidateId") as string | null)?.trim() ?? null;
    const validRegisteredId = registeredCandidateId && /^5\d{6}$/.test(registeredCandidateId);

    if (!validRegisteredId) {
      return NextResponse.json(
        { error: "求職者番号（5から始まる7桁の数字）が登録されていません。先に新規レコード追加で登録してください。" },
        { status: 400 }
      );
    }

    if (pdfFile?.size && !isValidWebResumeFilename(pdfFile.name)) {
      return NextResponse.json(
        { error: WEB_RESUME_FILENAME_ERROR_MESSAGE },
        { status: 400 }
      );
    }

    const candidateNoFromFilename = pdfFile?.name
      ? extractCandidateNoFromFilename(pdfFile.name)
      : null;

    let pdfBase64 = "";
    let interviewLog = "";
    let flagListText = "";

    if (pdfFile?.size) {
      const buf = Buffer.from(await pdfFile.arrayBuffer());
      pdfBase64 = buf.toString("base64");
    }
    if (interviewFile?.size) {
      interviewLog = await interviewFile.text();
    }
    if (flagListFile?.size) {
      const buf = Buffer.from(await flagListFile.arrayBuffer());
      flagListText = await extractTextFromXlsx(buf);
    }

    const systemInstruction = buildSystemInstruction();
    const userPrompt = buildUserPrompt(
      interviewLog,
      flagListText,
      pdfFile?.name ?? null,
      registeredCandidateId!
    );
    const responseSchema = buildCommonAnalysisResponseSchema();

    const analyzeStart = Date.now();
    const pdfSizeKb = pdfBase64.length > 0 ? Math.round((pdfBase64.length * 3 / 4) / 1024) : 0;
    const interviewLen = interviewLog.length;
    const flagLen = flagListText.length;
    console.log(
      `[intake/analyze] Input: PDF=${pdfSizeKb}KB (direct), interview=${interviewLen} chars, flagList=${flagLen} chars`
    );
    console.log("[intake/analyze] Calling Gemini with PDF attachment (multimodal)...");
    
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateWithGeminiWithPdf({
          systemInstruction,
          userPrompt,
          pdfBase64,
          responseMimeType: "application/json",
          responseSchema,
          maxOutputTokens: 16384,
          temperature: 0.1,
        });
        const parsed = parseJsonResponse<unknown>(raw);
        const normalized = normalizeCommonAnalysis(parsed);
        if (isValidCommonAnalysis(normalized)) {
          normalized.extracted_facts.candidate_no = registeredCandidateId!;
          const geminiTimeMs = Date.now() - analyzeStart;
          console.log(`[intake/analyze] Gemini done in ${geminiTimeMs}ms`);
          return NextResponse.json({
            ...normalized,
            _debug: {
              pdfSizeKb,
              interviewChars: interviewLog.length,
              flagListChars: flagListText.length,
              geminiTimeMs,
              mode: "multimodal_pdf",
            },
          });
        }
        logInvalidStructure(parsed);
        lastError = new Error("Invalid common_analysis_json structure");
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.error("[intake/analyze] Attempt error:", lastError.message);
      }
    }

    return NextResponse.json(
      { error: lastError?.message ?? "Failed to generate valid common_analysis_json" },
      { status: 500 }
    );
  } catch (error) {
    console.error("intake/analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
