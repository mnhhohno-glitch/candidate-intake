import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini } from "@/services/geminiClient";
import { buildHearingQuestionTextPrompt } from "@/services/loadSpec";
import { extractTextFromPdf } from "@/services/extractText";

const JOB_TYPE_UNSPECIFIED_OUTPUT =
  "応募先の職種を指定してください：「 」に入力してください";

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

    let resumePdfText = "";
    if (pdfFile && pdfFile.size > 0 && pdfFile.type === "application/pdf") {
      const buf = Buffer.from(await pdfFile.arrayBuffer());
      resumePdfText = await extractTextFromPdf(buf);
    }

    let interviewMemoText = "";
    if (
      interviewLogFile &&
      interviewLogFile.size > 0 &&
      (interviewLogFile.type === "text/plain" || interviewLogFile.name?.toLowerCase().endsWith(".txt"))
    ) {
      interviewMemoText = await interviewLogFile.text();
    }

    const { systemInstruction, userPrompt } = buildHearingQuestionTextPrompt(
      jobType,
      resumePdfText,
      interviewMemoText
    );

    const raw = await generateWithGemini({
      systemInstruction,
      userPrompt,
      responseMimeType: "text/plain",
      maxOutputTokens: 8192,
    });

    let text = (raw ?? "").trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
    }
    if (!text) {
      text = JOB_TYPE_UNSPECIFIED_OUTPUT;
    }

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
