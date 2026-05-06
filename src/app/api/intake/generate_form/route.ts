/**
 * T-029 新設計 Phase B-1: 構造化フォーム質問生成エンドポイント
 *
 * 入力: resumeData + interviewLog + achievement_category + candidate_name
 * 出力: questionsJson (8 セクション固定構造)
 *
 * 既存の hearing-question-text とは並列稼働。GAS 連携・フロント連携は Phase B-2 / B-3 で実施。
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import { isValidQuestionsJson, type QuestionsJson } from "@/types/questionsJson";
import { QUESTIONS_JSON_RESPONSE_SCHEMA } from "@/types/questionsJsonSchema";

const MAX_RETRIES = 1;
const SPEC_FILENAME = "generate_form_prompt.yaml";

type SpecGenerateForm = {
  system_prompt?: string;
  output_instruction?: string;
};

function loadSpec(): { systemInstruction: string } {
  const specPath = path.join(process.cwd(), "specs", SPEC_FILENAME);
  const raw = fs.readFileSync(specPath, "utf8");
  const spec = yaml.load(raw) as SpecGenerateForm;
  const systemInstruction = [spec.system_prompt ?? "", spec.output_instruction ?? ""].join("\n\n").trim();
  return { systemInstruction };
}

function buildUserPrompt(
  candidateName: string,
  resumeData: unknown,
  interviewLog: string,
  achievementCategory: string,
  achievementCategoryOtherLabel: string | null
): string {
  return `【candidate_name】
${candidateName}

【resumeData】
${JSON.stringify(resumeData, null, 2)}

【interviewLog】
${interviewLog || "(なし)"}

【achievement_category】
${achievementCategory}
${achievementCategoryOtherLabel ? `\n【achievement_category_other_label】\n${achievementCategoryOtherLabel}` : ""}

上記入力からプロンプトの仕様に従い questionsJson を生成し、JSON のみを返してください。`;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let candidateId = "";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
    const candidateName = typeof body.candidateName === "string" ? body.candidateName.trim() : "";
    const resumeData = body.resumeData;
    const interviewLog = typeof body.interviewLog === "string" ? body.interviewLog : "";
    const achievementCategory =
      typeof body.achievementCategory === "string" ? body.achievementCategory.trim() : "";
    const achievementCategoryOtherLabel =
      typeof body.achievementCategoryOtherLabel === "string"
        ? body.achievementCategoryOtherLabel.trim()
        : null;

    if (!candidateId || !/^5\d{6}$/.test(candidateId)) {
      return NextResponse.json(
        { error: "candidateId は5から始まる7桁の数字で指定してください。" },
        { status: 400 }
      );
    }
    if (!candidateName) {
      return NextResponse.json(
        { error: "candidateName は必須です。" },
        { status: 400 }
      );
    }
    if (!resumeData || typeof resumeData !== "object") {
      return NextResponse.json(
        { error: "resumeData は必須のオブジェクトです（extract_resume の出力をそのまま渡してください）。" },
        { status: 400 }
      );
    }
    if (!achievementCategory) {
      return NextResponse.json(
        { error: "achievementCategory は必須です。" },
        { status: 400 }
      );
    }

    const { systemInstruction } = loadSpec();
    const userPrompt = buildUserPrompt(
      candidateName,
      resumeData,
      interviewLog,
      achievementCategory,
      achievementCategoryOtherLabel
    );

    console.log(
      `[generate_form] start candidateId=${candidateId} achievementCategory=${achievementCategory} interviewChars=${interviewLog.length}`
    );

    let useSchema = true;
    let lastError: Error | null = null;
    let questionsJson: QuestionsJson | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateWithGemini({
          systemInstruction,
          userPrompt,
          responseMimeType: "application/json",
          maxOutputTokens: 16384,
          temperature: 0.2,
          ...(useSchema && { responseSchema: QUESTIONS_JSON_RESPONSE_SCHEMA }),
        });
        const parsed = parseJsonResponse<unknown>(raw);
        if (isValidQuestionsJson(parsed)) {
          questionsJson = parsed;
          break;
        }
        lastError = new Error("Invalid questionsJson structure");
        console.warn(
          `[generate_form] attempt ${attempt + 1} invalid structure. keys=`,
          parsed && typeof parsed === "object"
            ? Object.keys(parsed as Record<string, unknown>).join(",")
            : typeof parsed
        );
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.warn(`[generate_form] attempt ${attempt + 1} failed:`, lastError.message);
        if (useSchema && lastError.message.includes("400")) {
          console.warn("[generate_form] disabling responseSchema due to API error and retrying");
          useSchema = false;
        }
      }
    }

    if (!questionsJson) {
      console.error(
        `[generate_form] failed candidateId=${candidateId} error=${lastError?.message ?? "unknown"}`
      );
      return NextResponse.json(
        {
          error: "フォーム構造の生成に失敗しました。しばらくしてから再試行してください。",
          detail: lastError?.message ?? "unknown",
        },
        { status: 500 }
      );
    }

    const latencyMs = Date.now() - startedAt;
    const totalItems = questionsJson.sections.reduce((acc, s) => acc + s.items.length, 0);
    console.log(
      `[generate_form] done candidateId=${candidateId} latency_ms=${latencyMs} sections=${questionsJson.sections.length} total_items=${totalItems}`
    );

    return NextResponse.json({
      candidateId,
      questionsJson,
      latency_ms: latencyMs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[generate_form] fatal candidateId=${candidateId} error=${message}`);
    return NextResponse.json(
      {
        error: "フォーム構造の生成中に予期しないエラーが発生しました。",
        detail: message,
      },
      { status: 500 }
    );
  }
}
