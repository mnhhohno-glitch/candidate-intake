import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import { buildFilemakerExcelPrompt } from "@/services/loadSpec";
import { buildXlsxBuffer } from "@/services/excelBuilder";
import type { ExcelFilesOutput } from "@/types/excelExport";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";

const MAX_RETRIES = 2;

function hasValidExcelFiles(obj: unknown): obj is ExcelFilesOutput {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  const ef = o.excel_files;
  if (!ef || typeof ef !== "object") return false;
  const sheets = (ef as Record<string, unknown>).sheets;
  return Array.isArray(sheets) && sheets.length > 0;
}

function getCandidateName(common: CommonAnalysisJson): string {
  const name = common?.extracted_facts?.candidate_name;
  if (typeof name === "string" && name.trim()) return name.trim();
  const no = common?.extracted_facts?.candidate_no;
  if (typeof no === "string") return no;
  return "候補者";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const commonAnalysisJson = body.common_analysis_json as CommonAnalysisJson | undefined;
    if (commonAnalysisJson === undefined) {
      return NextResponse.json(
        { error: "common_analysis_json is required" },
        { status: 400 }
      );
    }

    const { systemInstruction, userPrompt } = buildFilemakerExcelPrompt(commonAnalysisJson);

    let lastError: Error | null = null;
    let parsed: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateWithGemini({
          systemInstruction,
          userPrompt,
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        });
        parsed = parseJsonResponse<ExcelFilesOutput>(raw);

        if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).code) {
          const err = parsed as { code: string; message?: string };
          return NextResponse.json(
            { error: err.message || err.code },
            { status: 400 }
          );
        }

        if (hasValidExcelFiles(parsed)) {
          break;
        }
        lastError = new Error("Invalid excel_files structure");
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }

    if (!parsed || !hasValidExcelFiles(parsed)) {
      return NextResponse.json(
        { error: lastError?.message ?? "Failed to generate valid excel_files JSON" },
        { status: 500 }
      );
    }

    const buffer = await buildXlsxBuffer(parsed);
    const baseName = getCandidateName(commonAnalysisJson);
    const filename = `FileMaker用_${baseName}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("intake/excel error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
