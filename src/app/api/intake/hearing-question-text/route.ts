import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import {
  buildHearingQuestionTextPrompt,
  buildStructuredExtractPrompt,
  type StructuredExtractResult,
} from "@/services/loadSpec";
import { extractTextFromPdf } from "@/services/extractText";

const JOB_TYPE_UNSPECIFIED_OUTPUT =
  "応募先の職種を指定してください：「 」に入力してください";

/**
 * Phase1: 抽出品質ゲート。不足時は422。
 * 判定対象は「PDF 1通の抽出テキスト全体の文字数」のみ。
 * デフォルトは1（0文字以外は通過）。本番で pdfjs CMap 未読で OCR のみ38文字になるPDFでも通過させる。
 * 厳格にしたい場合は HEARING_GATE_MIN_CHARS=101 等を設定。
 */
function getGateMinChars(): number {
  const v = process.env.HEARING_GATE_MIN_CHARS;
  if (v === "" || v == null) return 1;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 1 : n;
}
/** 空ならスキップ（デフォルト）。特定PDF用に厳格化したいときだけ env で指定 */
function getGateQualificationSubstrings(): string[] {
  const v = process.env.HEARING_GATE_QUALIFICATION_SUBSTRINGS;
  if (v === "" || v == null) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
/** 空ならスキップ（デフォルト）。特定PDF用に厳格化したいときだけ env で指定 */
function getGateAddressSubstrings(): string[] {
  const v = process.env.HEARING_GATE_ADDRESS_SUBSTRINGS;
  if (v === "" || v == null) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function runExtractionQualityGate(resumePdfText: string): { ok: true } | { ok: false; reason: string } {
  const resumePdfChars = resumePdfText.length;
  const minChars = getGateMinChars();
  if (resumePdfChars < minChars) {
    return { ok: false, reason: `resumePdfChars=${resumePdfChars} < ${minChars}` };
  }
  const qualSubs = getGateQualificationSubstrings();
  if (qualSubs.length > 0) {
    const hasQualification = qualSubs.some((s) => resumePdfText.includes(s));
    if (!hasQualification) {
      return { ok: false, reason: "qualification_substring_not_found" };
    }
  }
  const addrSubs = getGateAddressSubstrings();
  if (addrSubs.length > 0) {
    const hasAddress = addrSubs.some((s) => resumePdfText.includes(s));
    if (!hasAddress) {
      return { ok: false, reason: "address_substring_not_found" };
    }
  }
  return { ok: true };
}

/** Phase3: 出力自己検査。資格ブロック必須 / 住所ブロック禁止違反を検出 */
function checkOutputRules(
  output: string,
  structured: StructuredExtractResult
): { passed: true } | { passed: false; reason: string } {
  const quals = structured.qualifications_list ?? [];
  if (quals.length >= 1) {
    const hasQualificationBlock =
      output.includes("取得年月を教えてください") || output.includes("資格");
    if (!hasQualificationBlock) {
      return { passed: false, reason: "qualifications_list>=1 but output missing qualification block" };
    }
  }
  const hasBanchi = structured.address_has_banchi === true;
  const hasRoom = structured.address_has_room === true;
  if (hasBanchi && hasRoom) {
    const hasAddressConfirmBlock =
      output.includes("ご住所について確認") || output.includes("番地や建物名、部屋番号の記載が確認できなかった");
    if (hasAddressConfirmBlock) {
      return { passed: false, reason: "address_has_banchi+room but output contains address confirmation block" };
    }
  }
  return { passed: true };
}

/**
 * 応募資料作成・追加情報ヒアリング用「質問文テキスト」のみを生成する。
 * - job_type 未指定時は上記1行のみを返す（処理は実行しない）。
 * - 出力は候補者に送る質問本文のみ（GoogleフォームURL・内部メモ・見出しは含めない）。
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const jobTypeRaw = formData.get("job_type");
    const jobType =
      typeof jobTypeRaw === "string" ? jobTypeRaw.trim() : "";

    if (!jobType) {
      return NextResponse.json({
        candidate_question_text_only: JOB_TYPE_UNSPECIFIED_OUTPUT,
      });
    }

    const pdfFile = formData.get("pdf") as File | null;
    const interviewLogFile = formData.get("interviewLog") as File | null;

    const pdfReceived = !!(pdfFile && pdfFile.size > 0 && pdfFile.type === "application/pdf");
    if (!pdfReceived && pdfFile) {
      console.warn("[hearing-question-text] PDF rejected: size=", pdfFile.size, "type=", pdfFile.type);
    }

    let resumePdfText = "";
    if (pdfReceived && pdfFile) {
      const buf = Buffer.from(await pdfFile.arrayBuffer());
      resumePdfText = await extractTextFromPdf(buf);
      if (resumePdfText.length === 0) {
        console.error("[hearing-question-text] PDF extraction returned 0 characters. size=", buf.length);
        return NextResponse.json(
          {
            error:
              "PDFからテキストを1文字も抽出できませんでした。テキストが選択・コピーできる形式のPDFでお試しください。スキャン画像のみのPDFや、形式・保護の影響で読み取れない場合があります。",
            detail: "抽出結果が0文字のため処理を中断しました。",
          },
          { status: 400 }
        );
      }
    }

    if (resumePdfText.length === 0) {
      return NextResponse.json(
        {
          error: "PDFをアップロードし、テキストが抽出できるPDFをご利用ください。",
        },
        { status: 400 }
      );
    }

    const resumePdfChars = resumePdfText.length;

    const gateResult = runExtractionQualityGate(resumePdfText);
    if (!gateResult.ok) {
      const minChars = getGateMinChars();
      console.warn("[hearing-question-text] gate_checks_failed reason=", gateResult.reason, "resumePdfChars=", resumePdfChars);
      return NextResponse.json(
        {
          error:
            "PDFテキスト抽出が不十分で、住所/資格などの必須項目が取得できませんでした。別PDF、またはスキャンでないPDFでお試しください。",
          detail: `抽出文字数: ${resumePdfChars} 文字。${gateResult.reason}${gateResult.reason.includes("resumePdfChars") ? "" : ` （${minChars}文字以上必要）`}`,
        },
        { status: 422 }
      );
    }
    console.log("[hearing-question-text] gate_checks_passed resumePdfChars=", resumePdfChars);

    let interviewMemoText = "";
    if (
      interviewLogFile &&
      interviewLogFile.size > 0 &&
      (interviewLogFile.type === "text/plain" || interviewLogFile.name?.toLowerCase().endsWith(".txt"))
    ) {
      interviewMemoText = await interviewLogFile.text();
    }

    const totalStartMs = Date.now();

    // --- Step A: 構造化抽出 ---
    const stepAStart = Date.now();
    const stepAPrompt = buildStructuredExtractPrompt(resumePdfText, interviewMemoText);
    let structuredExtract: StructuredExtractResult;
    try {
      const stepARaw = await generateWithGemini({
        systemInstruction: stepAPrompt.systemInstruction,
        userPrompt: stepAPrompt.userPrompt,
        responseMimeType: "application/json",
        maxOutputTokens: 4096,
      });
      const parsed = parseJsonResponse<StructuredExtractResult>(stepARaw);
      structuredExtract = {
        highest_education_category: parsed.highest_education_category,
        qualifications_list: Array.isArray(parsed.qualifications_list) ? parsed.qualifications_list : [],
        address_full: typeof parsed.address_full === "string" ? parsed.address_full : "",
        address_has_banchi: parsed.address_has_banchi === true,
        address_has_building: parsed.address_has_building === true,
        address_has_room: parsed.address_has_room === true,
        education_has_faculty_keywords: parsed.education_has_faculty_keywords === true,
      };
    } catch (e) {
      console.error("[hearing-question-text] step_a failed:", e);
      return NextResponse.json(
        { error: "構造化抽出に失敗しました。しばらくしてから再試行してください。" },
        { status: 500 }
      );
    }
    const stepALatencyMs = Date.now() - stepAStart;
    const stepALogSafe = {
      highest_education_category: structuredExtract.highest_education_category,
      qualifications_count: structuredExtract.qualifications_list?.length ?? 0,
      address_has_banchi: structuredExtract.address_has_banchi,
      address_has_building: structuredExtract.address_has_building,
      address_has_room: structuredExtract.address_has_room,
      education_has_faculty_keywords: structuredExtract.education_has_faculty_keywords,
    };
    console.log("[hearing-question-text] step_a done latency_ms=", stepALatencyMs, "extract=", JSON.stringify(stepALogSafe));

    // --- Step B: 質問文生成（base_prompt は変更せず、user に structured を追加） ---
    let text = "";
    let retryCount = 0;
    const maxRetries = 1;

    const runStepB = async (): Promise<string> => {
      const { systemInstruction, userPrompt } = buildHearingQuestionTextPrompt(
        jobType,
        resumePdfText,
        interviewMemoText,
        structuredExtract
      );
      const stepBStart = Date.now();
      const raw = await generateWithGemini({
        systemInstruction,
        userPrompt,
        responseMimeType: "text/plain",
        maxOutputTokens: 8192,
      });
      const stepBLatencyMs = Date.now() - stepBStart;
      console.log("[hearing-question-text] step_b done latency_ms=", stepBLatencyMs, "outputChars=", (raw ?? "").length);
      let out = (raw ?? "").trim();
      if (out.startsWith("```")) {
        out = out.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
      }
      return out;
    };

    text = await runStepB();
    const outputCheck = checkOutputRules(text, structuredExtract);
    if (!outputCheck.passed && retryCount < maxRetries) {
      retryCount += 1;
      console.warn("[hearing-question-text] output_self_check failed reason=", outputCheck.reason, "retry_count=", retryCount);
      text = await runStepB();
      const recheck = checkOutputRules(text, structuredExtract);
      if (!recheck.passed) {
        console.error("[hearing-question-text] output_self_check still failed after retry reason=", recheck.reason);
        return NextResponse.json(
          {
            error:
              "AI出力がルールに適合しませんでした。PDF抽出テキストと出力結果を確認してください（管理者対応が必要）。",
          },
          { status: 500 }
        );
      }
    } else if (!outputCheck.passed) {
      console.error("[hearing-question-text] output_self_check failed reason=", outputCheck.reason);
      return NextResponse.json(
        {
          error:
            "AI出力がルールに適合しませんでした。PDF抽出テキストと出力結果を確認してください（管理者対応が必要）。",
        },
        { status: 500 }
      );
    }

    if (!text) {
      text = JOB_TYPE_UNSPECIFIED_OUTPUT;
    }

    const totalLatencyMs = Date.now() - totalStartMs;
    console.log("[hearing-question-text] total latency_ms=", totalLatencyMs, "retry_count=", retryCount);

    return NextResponse.json({
      candidate_question_text_only: text,
    });
  } catch (e) {
    console.error("[api/intake/hearing-question-text] error:", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "質問文の生成に失敗しました",
      },
      { status: 500 }
    );
  }
}
