import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import { buildCommonAnalysisPrompt } from "@/services/loadSpec";
import { extractTextFromPdf, extractTextFromXlsx } from "@/services/extractText";
import {
  isValidWebResumeFilename,
  extractCandidateNoFromFilename,
  WEB_RESUME_FILENAME_ERROR_MESSAGE,
} from "@/services/candidateNoFromFilename";
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

  const filemaker_mapping = typeof o.filemaker_mapping === "object" && o.filemaker_mapping !== null && !Array.isArray(o.filemaker_mapping)
    ? o.filemaker_mapping as Record<string, unknown>
    : {};
  const missing_items = Array.isArray(o.missing_items) ? o.missing_items : [];
  return { extracted_facts, filemaker_mapping, missing_items } as CommonAnalysisJson;
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

    let pdfText = "";
    let interviewLog = "";
    let flagListText = "";

    if (pdfFile?.size) {
      const buf = Buffer.from(await pdfFile.arrayBuffer());
      pdfText = await extractTextFromPdf(buf);
    }
    if (interviewFile?.size) {
      interviewLog = await interviewFile.text();
    }
    if (flagListFile?.size) {
      const buf = Buffer.from(await flagListFile.arrayBuffer());
      flagListText = await extractTextFromXlsx(buf);
    }

    const { systemInstruction, userPrompt } = buildCommonAnalysisPrompt(
      pdfText,
      interviewLog,
      flagListText,
      pdfFile?.name ?? null
    );

    const analyzeStart = Date.now();
    const pdfLen = pdfText.length;
    const interviewLen = interviewLog.length;
    const flagLen = flagListText.length;
    console.log(
      `[intake/analyze] Input lengths: PDF=${pdfLen} chars, interview=${interviewLen} chars, flagList=${flagLen} chars, total prompt ~${systemInstruction.length + userPrompt.length} chars`
    );
    if (pdfLen === 0 && pdfFile?.size) {
      console.warn(
        "[intake/analyze] PDF file was uploaded but extracted 0 characters. Excel/list may lack PDF-sourced data (e.g. work history, resume fields)."
      );
    }
    console.log("[intake/analyze] Calling Gemini (common analysis)...");
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateWithGemini({
          systemInstruction,
          userPrompt,
          responseMimeType: "application/json",
          maxOutputTokens: 16384,
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
              pdfChars: pdfText.length,
              interviewChars: interviewLog.length,
              flagListChars: flagListText.length,
              totalPromptChars: systemInstruction.length + userPrompt.length,
              geminiTimeMs,
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
