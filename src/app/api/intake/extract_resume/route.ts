/**
 * T-029 新設計 Phase A: 履歴書PDF + 面談ログ統合解析エンドポイント
 *
 * - Gemini PDF Inline で PDF を直接解析（pdfjs-dist の cMap エラーを完全回避）
 * - specs/extract_resume_prompt.yaml + responseSchema で構造化 JSON を取得
 * - 既存エンドポイント（analyze, hearing-question-text 等）には一切影響しない
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { NextRequest, NextResponse } from "next/server";
import { generateWithGeminiWithPdf, parseJsonResponse } from "@/services/geminiClient";
import { isValidResumeData, type ResumeData } from "@/types/resumeData";
import { RESUME_DATA_RESPONSE_SCHEMA } from "@/types/resumeDataSchema";

const MAX_RETRIES = 1;
const SPEC_FILENAME = "extract_resume_prompt.yaml";

type SpecExtractResume = {
  system_prompt?: string;
  output_instruction?: string;
};

function loadSpec(): { systemInstruction: string } {
  const specPath = path.join(process.cwd(), "specs", SPEC_FILENAME);
  const raw = fs.readFileSync(specPath, "utf8");
  const spec = yaml.load(raw) as SpecExtractResume;
  const systemInstruction = [spec.system_prompt ?? "", spec.output_instruction ?? ""].join("\n\n").trim();
  return { systemInstruction };
}

function buildUserPrompt(interviewLog: string): string {
  return `【履歴書PDF】
（PDFは inline で添付されています。最初から最後まで読み切ってください。）

【面談ログ】
${interviewLog || "(なし)"}

上記の履歴書PDFと面談ログを統合的に解析し、指定の JSON 形式のみを出力してください。説明文・マークダウンは不要です。`;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let candidateId = "";
  try {
    const formData = await request.formData();
    candidateId = (formData.get("candidateId") as string | null)?.trim() ?? "";
    const pdfFile = formData.get("pdf") as File | null;
    const interviewLogFile = formData.get("interviewLog") as File | null;

    if (!candidateId || !/^5\d{6}$/.test(candidateId)) {
      return NextResponse.json(
        { error: "candidateId は5から始まる7桁の数字で指定してください。" },
        { status: 400 }
      );
    }
    if (!pdfFile || pdfFile.size === 0) {
      return NextResponse.json(
        { error: "pdf は必須です。履歴書PDFを添付してください。" },
        { status: 400 }
      );
    }
    if (pdfFile.type && pdfFile.type !== "application/pdf") {
      return NextResponse.json(
        { error: "pdf の MIME タイプが application/pdf ではありません。" },
        { status: 400 }
      );
    }

    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const pdfBase64 = pdfBuffer.toString("base64");

    let interviewLog = "";
    if (interviewLogFile && interviewLogFile.size > 0) {
      interviewLog = await interviewLogFile.text();
    }

    const { systemInstruction } = loadSpec();
    const userPrompt = buildUserPrompt(interviewLog);

    console.log(
      `[extract_resume] start candidateId=${candidateId} pdfBytes=${pdfBuffer.length} interviewChars=${interviewLog.length}`
    );

    let useSchema = true;
    let lastError: Error | null = null;
    let resumeData: ResumeData | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateWithGeminiWithPdf({
          systemInstruction,
          userPrompt,
          pdfBase64,
          responseMimeType: "application/json",
          maxOutputTokens: 16384,
          temperature: 0.1,
          ...(useSchema && { responseSchema: RESUME_DATA_RESPONSE_SCHEMA }),
        });
        const parsed = parseJsonResponse<unknown>(raw);
        if (isValidResumeData(parsed)) {
          resumeData = parsed;
          break;
        }
        lastError = new Error("Invalid resumeData structure");
        console.warn(
          `[extract_resume] attempt ${attempt + 1} invalid structure. keys=`,
          parsed && typeof parsed === "object" ? Object.keys(parsed as Record<string, unknown>).join(",") : typeof parsed
        );
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.warn(`[extract_resume] attempt ${attempt + 1} failed:`, lastError.message);
        if (useSchema && lastError.message.includes("400")) {
          console.warn("[extract_resume] disabling responseSchema due to API error and retrying");
          useSchema = false;
        }
      }
    }

    if (!resumeData) {
      console.error(
        `[extract_resume] failed candidateId=${candidateId} error=${lastError?.message ?? "unknown"}`
      );
      return NextResponse.json(
        {
          error: "履歴書の解析に失敗しました。しばらくしてから再試行してください。",
          detail: lastError?.message ?? "unknown",
        },
        { status: 500 }
      );
    }

    const latencyMs = Date.now() - startedAt;
    console.log(
      `[extract_resume] done candidateId=${candidateId} latency_ms=${latencyMs} qualifications=${resumeData.qualifications.length} has_address=${!!resumeData.personal_info.address_full} has_university=${!!resumeData.education.university} confidence=${resumeData.extraction_quality.confidence}`
    );

    return NextResponse.json({
      candidateId,
      resumeData,
      latency_ms: latencyMs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[extract_resume] fatal candidateId=${candidateId} error=${message}`);
    return NextResponse.json(
      {
        error: "履歴書の解析中に予期しないエラーが発生しました。",
        detail: message,
      },
      { status: 500 }
    );
  }
}
