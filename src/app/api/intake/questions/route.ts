import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import { buildGoogleFormPrompt } from "@/services/loadSpec";
import type { GoogleFormDefinition } from "@/types/googleForm";

const MAX_RETRIES = 2;

function isValidGoogleFormDefinition(obj: unknown): obj is GoogleFormDefinition {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.form_metadata === "object" &&
    Array.isArray(o.questions) &&
    o.questions.every(
      (q) =>
        typeof q === "object" &&
        q !== null &&
        typeof (q as Record<string, unknown>).id === "string" &&
        typeof (q as Record<string, unknown>).title === "string"
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const commonAnalysisJson = body.common_analysis_json;
    if (commonAnalysisJson === undefined) {
      return NextResponse.json(
        { error: "common_analysis_json is required" },
        { status: 400 }
      );
    }

    const { systemInstruction, userPrompt } = buildGoogleFormPrompt(commonAnalysisJson);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateWithGemini({
          systemInstruction,
          userPrompt,
          responseMimeType: "application/json",
          maxOutputTokens: 4096,
        });
        const parsed = parseJsonResponse<GoogleFormDefinition>(raw);
        if (isValidGoogleFormDefinition(parsed)) {
          return NextResponse.json(parsed);
        }
        lastError = new Error("Invalid google form definition structure");
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }

    return NextResponse.json(
      { error: lastError?.message ?? "Failed to generate valid question JSON" },
      { status: 500 }
    );
  } catch (error) {
    console.error("intake/questions error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
