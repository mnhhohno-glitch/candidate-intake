import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import { buildGoogleFormPrompt } from "@/services/loadSpec";
import type { GoogleFormDefinition, FormQuestion } from "@/types/googleForm";

const MAX_RETRIES = 2;

function isValidGoogleFormDefinition(obj: unknown): obj is GoogleFormDefinition {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.form_metadata === "object" &&
    o.form_metadata !== null &&
    !Array.isArray(o.form_metadata) &&
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

/**
 * Geminiの返却を正規化。ラップされていたり form_metadata/questions の形が違う場合に対応。
 */
function normalizeGoogleFormDefinition(parsed: unknown): GoogleFormDefinition {
  let o = parsed as Record<string, unknown>;
  if (!o || typeof o !== "object") {
    return { form_metadata: {}, questions: [] };
  }
  if (o.form_metadata === undefined && o.questions === undefined) {
    const keys = Object.keys(o);
    if (keys.length === 1 && typeof o[keys[0]] === "object" && o[keys[0]] !== null) {
      o = o[keys[0]] as Record<string, unknown>;
    }
  }
  const form_metadata =
    typeof o.form_metadata === "object" && o.form_metadata !== null && !Array.isArray(o.form_metadata)
      ? (o.form_metadata as Record<string, unknown>)
      : {};
  let questions = o.questions;
  if (!Array.isArray(questions)) {
    questions = [];
  }
  const normalizedQuestions: FormQuestion[] = questions.map((q, i) => {
    if (!q || typeof q !== "object") {
      return { id: `q${i + 1}`, title: "質問", required: false, type: "text" };
    }
    const r = q as Record<string, unknown>;
    const id =
      typeof r.id === "string"
        ? r.id
        : typeof r.question_id === "string"
          ? r.question_id
          : `q${i + 1}`;
    const title =
      typeof r.title === "string"
        ? r.title
        : typeof r.question === "string"
          ? r.question
          : typeof r.label === "string"
            ? r.label
            : "質問";
    const required = typeof r.required === "boolean" ? r.required : false;
    const type = typeof r.type === "string" ? r.type : "text";
    const options = Array.isArray(r.options) ? (r.options as string[]) : undefined;
    return { id, title, required, type, options };
  });
  return {
    form_metadata: form_metadata as { title?: string; description?: string },
    questions: normalizedQuestions,
  };
}

function logInvalidStructure(parsed: unknown, rawPreview: string): void {
  const o = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const keys = Object.keys(o);
  const formMetaType = o.form_metadata === undefined ? "undefined" : typeof o.form_metadata;
  const questionsType = o.questions === undefined ? "undefined" : Array.isArray(o.questions) ? "array" : typeof o.questions;
  const questionsLen = Array.isArray(o.questions) ? o.questions.length : 0;
  const firstQ = Array.isArray(o.questions) && o.questions[0] && typeof o.questions[0] === "object"
    ? Object.keys(o.questions[0] as object)
    : [];
  console.error(
    "[intake/questions] Invalid structure after parse. TopKeys:",
    keys.join(", "),
    "| form_metadata:",
    formMetaType,
    "| questions:",
    questionsType,
    "len=" + questionsLen,
    "| first question keys:",
    firstQ.join(", "),
    "| raw preview:",
    rawPreview.slice(0, 200)
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const commonAnalysisJson = body.common_analysis_json;
    if (commonAnalysisJson === undefined) {
      console.error("[intake/questions] Missing common_analysis_json in body");
      return NextResponse.json(
        { error: "common_analysis_json is required" },
        { status: 400 }
      );
    }

    const { systemInstruction, userPrompt } = buildGoogleFormPrompt(commonAnalysisJson);

    const questionsStart = Date.now();
    console.log("[intake/questions] Calling Gemini (question JSON)...");
    let lastError: Error | null = null;
    let rawResponse = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateWithGemini({
          systemInstruction,
          userPrompt,
          responseMimeType: "application/json",
          maxOutputTokens: 4096,
        });
        rawResponse = raw;
        console.log("[intake/questions] Raw response length:", raw.length, "chars");

        const parsed = parseJsonResponse<unknown>(raw);
        const normalized = normalizeGoogleFormDefinition(parsed);

        if (isValidGoogleFormDefinition(normalized)) {
          console.log(
            `[intake/questions] Gemini done in ${Date.now() - questionsStart}ms, questions=${normalized.questions.length}`
          );
          return NextResponse.json(normalized);
        }

        logInvalidStructure(parsed, rawResponse);
        lastError = new Error("Invalid google form definition structure");
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.error("[intake/questions] Attempt", attempt + 1, "error:", lastError.message);
      }
    }

    console.warn(
      "[intake/questions] Returning minimal form definition so pipeline can continue to Excel."
    );
    const fallback: GoogleFormDefinition = { form_metadata: {}, questions: [] };
    return NextResponse.json(fallback);
  } catch (error) {
    console.error("[intake/questions] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
