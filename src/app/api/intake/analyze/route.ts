import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import { buildCommonAnalysisPrompt } from "@/services/loadSpec";
import { extractTextFromPdf, extractTextFromXlsx } from "@/services/extractText";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";

const MAX_RETRIES = 2;

function isValidCommonAnalysis(obj: unknown): obj is CommonAnalysisJson {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.extracted_facts === "object" &&
    typeof o.filemaker_mapping === "object" &&
    Array.isArray(o.missing_items)
  );
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const pdfFile = formData.get("pdf") as File | null;
    const interviewFile = formData.get("interviewLog") as File | null;
    const flagListFile = formData.get("flagList") as File | null;

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
      flagListText
    );

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateWithGemini({
          systemInstruction,
          userPrompt,
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        });
        const parsed = parseJsonResponse<CommonAnalysisJson>(raw);
        if (isValidCommonAnalysis(parsed)) {
          return NextResponse.json(parsed);
        }
        lastError = new Error("Invalid common_analysis_json structure");
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
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
