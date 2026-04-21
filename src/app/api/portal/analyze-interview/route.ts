import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import { extractTextFromPdf } from "@/services/extractText";
import { FLAG_LIST_TSV } from "@/constants/flags";
import { buildCommonAnalysisPrompt } from "@/services/loadSpec";
import {
  buildCommonAnalysisResponseSchema,
  adaptGeminiResponseToCommonAnalysis,
} from "@/services/flagListSchema";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";

const MAX_RETRIES = 2;

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

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

function normalizeCommonAnalysis(
  parsed: unknown
): CommonAnalysisJson & { thought_process?: Record<string, unknown> } {
  let o = parsed as Record<string, unknown>;
  if (
    o?.common_analysis_json &&
    typeof o.common_analysis_json === "object" &&
    o.common_analysis_json !== null
  ) {
    o = o.common_analysis_json as Record<string, unknown>;
  }

  const analysisThought = o.analysis_thought as
    | Record<string, unknown>
    | undefined;
  const legacyThoughtProcess = o.thought_process as
    | Record<string, unknown>
    | undefined;
  const thought_process =
    typeof analysisThought === "object" &&
    analysisThought !== null &&
    !Array.isArray(analysisThought)
      ? analysisThought
      : typeof legacyThoughtProcess === "object" &&
          legacyThoughtProcess !== null &&
          !Array.isArray(legacyThoughtProcess)
        ? legacyThoughtProcess
        : undefined;

  const adapted = adaptGeminiResponseToCommonAnalysis(o);

  const extracted_facts = adapted.extracted_facts;
  let work_history = extracted_facts.work_history;
  if (!Array.isArray(work_history)) {
    const raw = (extracted_facts.workHistory ??
      (extracted_facts as Record<string, unknown>).職歴 ??
      extracted_facts["work history"]) as unknown;
    work_history = Array.isArray(raw) ? raw : [];
  }
  extracted_facts.work_history = work_history;

  if (
    extracted_facts.tense === undefined &&
    (extracted_facts as Record<string, unknown>).時制 !== undefined
  ) {
    extracted_facts.tense = (extracted_facts as Record<string, unknown>)
      .時制 as string;
  }
  if (!Array.isArray(extracted_facts.reading_targets)) {
    const alt = (extracted_facts as Record<string, unknown>).読むべき内容;
    extracted_facts.reading_targets = Array.isArray(alt)
      ? (alt as string[])
      : [];
  }

  const result = {
    extracted_facts,
    filemaker_mapping: adapted.filemaker_mapping,
    missing_items: adapted.missing_items,
  } as CommonAnalysisJson & { thought_process?: Record<string, unknown> };

  if (thought_process) {
    result.thought_process = thought_process;
  }
  return result;
}

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
      (r.resignation_reason != null &&
        String(r.resignation_reason).trim() !== "")
    )
      return false;
  }
  return true;
}

function mergeResignationFromSecond(
  first: CommonAnalysisJson,
  second: CommonAnalysisJson
): void {
  const fm1 = first.filemaker_mapping as Record<string, unknown>;
  const fm2 = second.filemaker_mapping as Record<string, unknown>;
  const setIfEmpty = (key: string) => {
    const v2 = fm2[key];
    if (
      v2 != null &&
      String(v2).trim() !== "" &&
      (fm1[key] == null || String(fm1[key]).trim() === "")
    ) {
      fm1[key] = v2;
    }
  };
  setIfEmpty("転職時期メモ");
  setIfEmpty("転職活動期間メモ");
  const wh2 = second.extracted_facts?.work_history;
  const wh1 = first.extracted_facts?.work_history;
  if (
    Array.isArray(wh2) &&
    Array.isArray(wh1) &&
    wh2.length === wh1.length
  ) {
    const keys = [
      "退職理由_大",
      "退職理由_中",
      "退職理由_小",
      "転職理由メモ",
      "resignation_reason",
    ];
    for (let i = 0; i < wh1.length; i++) {
      const a = wh1[i] as Record<string, unknown>;
      const b = wh2[i] as Record<string, unknown>;
      for (const k of keys) {
        const bv = b[k];
        if (
          bv != null &&
          String(bv).trim() !== "" &&
          (a[k] == null || String(a[k]).trim() === "")
        ) {
          a[k] = bv;
        }
      }
    }
  } else if (Array.isArray(wh2) && wh2.length > 0) {
    first.extracted_facts.work_history = wh2;
  }
  if (
    second.extracted_facts?.tense != null &&
    String(second.extracted_facts.tense).trim() !== "" &&
    (first.extracted_facts.tense == null ||
      String(first.extracted_facts.tense).trim() === "")
  ) {
    first.extracted_facts.tense = second.extracted_facts.tense;
  }
}

export async function POST(request: NextRequest) {
  // --- Authentication ---
  const secret = process.env.PORTAL_SHARED_SECRET;
  if (!secret) {
    console.error("[portal/analyze-interview] PORTAL_SHARED_SECRET is not configured");
    return jsonError("Server misconfiguration", 500);
  }
  const provided = request.headers.get("x-portal-secret");
  if (provided !== secret) {
    return jsonError("Invalid portal secret", 401);
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;

    // --- Validation ---
    const { pdfBuffer, interviewLog, candidateNumber } = body as {
      pdfBuffer: unknown;
      interviewLog: unknown;
      candidateNumber: unknown;
    };

    if (!pdfBuffer || typeof pdfBuffer !== "string") {
      return jsonError("pdfBuffer is required and must be a base64 string", 400);
    }
    if (!interviewLog || typeof interviewLog !== "string" || (interviewLog as string).trim() === "") {
      return jsonError("interviewLog is required and must be a non-empty string", 400);
    }
    if (!candidateNumber || typeof candidateNumber !== "string" || !/^\d+$/.test(candidateNumber as string)) {
      return jsonError("candidateNumber is required and must be a numeric string", 400);
    }

    let pdfBuf: Buffer;
    try {
      pdfBuf = Buffer.from(pdfBuffer as string, "base64");
      if (pdfBuf.length === 0) {
        return jsonError("pdfBuffer decoded to empty buffer", 400);
      }
    } catch {
      return jsonError("pdfBuffer is not valid base64", 400);
    }

    // --- PDF text extraction ---
    const pdfText = await extractTextFromPdf(pdfBuf);
    const flagListText = FLAG_LIST_TSV;

    const { systemInstruction, userPrompt } = buildCommonAnalysisPrompt(
      pdfText,
      interviewLog as string,
      flagListText,
      null
    );

    // --- Gemini call with retries ---
    const analyzeStart = Date.now();
    console.log(
      `[portal/analyze-interview] candidate=${candidateNumber} PDF=${pdfText.length}chars interview=${(interviewLog as string).length}chars`
    );

    const responseSchema = buildCommonAnalysisResponseSchema();
    let useSchema = true;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateWithGemini({
          systemInstruction,
          userPrompt,
          responseMimeType: "application/json",
          maxOutputTokens: 16384,
          temperature: 0.1,
          ...(useSchema && { responseSchema }),
        });
        const parsed = parseJsonResponse<unknown>(raw);
        const normalized = normalizeCommonAnalysis(parsed);

        if (isValidCommonAnalysis(normalized)) {
          normalized.extracted_facts.candidate_no = candidateNumber as string;
          let geminiTimeMs = Date.now() - analyzeStart;

          // Multi-pass: resignation re-extract
          if ((interviewLog as string).trim().length > 100 && isResignationEmpty(normalized)) {
            console.log("[portal/analyze-interview] Resignation empty — running 2nd pass");
            const secondPassSuffix = `\n\n【2パス目・退職理由の再抽出】\n上記の面談メモを再読し、退職理由・転職理由に該当する発話が1つでもあれば、filemaker_mapping（転職時期メモ・転職活動期間メモ等）または work_history の退職理由_大/中/小・転職理由メモに必ず反映してください。該当する発話が本当に無い場合のみ空のままにしてください。出力は同じ共通解析JSON形式で返してください。`;
            try {
              const raw2 = await generateWithGemini({
                systemInstruction,
                userPrompt: userPrompt + secondPassSuffix,
                responseMimeType: "application/json",
                maxOutputTokens: 16384,
              });
              const parsed2 = parseJsonResponse<unknown>(raw2);
              const second = normalizeCommonAnalysis(parsed2);
              if (isValidCommonAnalysis(second)) {
                mergeResignationFromSecond(normalized, second);
                geminiTimeMs = Date.now() - analyzeStart;
                console.log("[portal/analyze-interview] 2nd pass (resignation) merged");
              }
            } catch (e2) {
              console.warn("[portal/analyze-interview] 2nd pass failed:", e2 instanceof Error ? e2.message : String(e2));
            }
          }

          // Multi-pass: work_history re-extract
          const workHistoryEmpty =
            !Array.isArray(normalized.extracted_facts.work_history) ||
            normalized.extracted_facts.work_history.length === 0;
          if ((interviewLog as string).trim().length > 500 && workHistoryEmpty) {
            console.log("[portal/analyze-interview] work_history empty — running 2nd pass");
            const workHistoryPassSuffix = `\n\n【2パス目・職歴の再抽出】\n上記の面談メモ（とPDF）を再読し、職歴（在籍した会社・在籍期間・職種・退職理由など）を在籍順にすべて抽出してください。extracted_facts.work_history に、企業名・事業内容・在籍期間_年・在籍期間_ヶ月・職種フラグ・職種メモ・退職理由_大・退職理由_中・退職理由_小・転職理由メモ を日本語キーで必ず出力してください。1社でも言及があれば配列に含め、空配列にしないでください。出力は共通解析JSON形式（extracted_facts, filemaker_mapping, missing_items）で返し、work_history を必ず埋めてください。`;
            try {
              const rawWh = await generateWithGemini({
                systemInstruction,
                userPrompt: userPrompt + workHistoryPassSuffix,
                responseMimeType: "application/json",
                maxOutputTokens: 16384,
              });
              const parsedWh = parseJsonResponse<unknown>(rawWh);
              const normWh = normalizeCommonAnalysis(parsedWh);
              const wh = normWh.extracted_facts?.work_history;
              if (Array.isArray(wh) && wh.length > 0) {
                normalized.extracted_facts.work_history = wh;
                geminiTimeMs = Date.now() - analyzeStart;
                console.log(`[portal/analyze-interview] 2nd pass (work_history) merged, rows=${wh.length}`);
              }
            } catch (eWh) {
              console.warn("[portal/analyze-interview] work_history 2nd pass failed:", eWh instanceof Error ? eWh.message : String(eWh));
            }
          }

          console.log(`[portal/analyze-interview] Done in ${geminiTimeMs}ms`);

          return NextResponse.json({
            success: true,
            filemaker_mapping: normalized.filemaker_mapping,
            work_history: normalized.extracted_facts.work_history ?? [],
            missing_items: normalized.missing_items,
            analysis_metadata: {
              candidate_number: candidateNumber as string,
              analyzed_at: new Date().toISOString(),
              model: "gemini-3-flash-preview",
              pdf_text_length: pdfText.length,
              log_text_length: (interviewLog as string).length,
            },
          });
        }

        lastError = new Error("Invalid common_analysis_json structure");
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.error(`[portal/analyze-interview] Attempt ${attempt} error:`, lastError.message);

        if (useSchema && lastError.message.includes("400")) {
          console.warn("[portal/analyze-interview] Disabling responseSchema due to API error");
          useSchema = false;
        }
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "Analysis failed",
        detail: lastError?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("[portal/analyze-interview] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Analysis failed",
        detail: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
