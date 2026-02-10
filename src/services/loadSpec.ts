import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const SPECS_DIR = path.join(process.cwd(), "specs");

function loadYamlSafe<T>(filename: string): T {
  const filePath = path.join(SPECS_DIR, filename);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return yaml.load(raw) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`specs/${filename} の読み込みに失敗しました: ${msg}`);
  }
}

export type Spec01 = {
  role?: string;
  tone?: string;
  absolute_rules?: string[];
  output_structure?: unknown;
  input_sections?: { name: string; description: string }[];
  basic_info_sheet_columns?: string[];
  work_history_sheet_columns?: string[];
  input_rules?: string[];
  procedure?: string;
  final_instruction?: string;
};

export type Spec02 = {
  role?: string;
  tone?: string;
  absolute_rules?: string[];
  output_structure?: unknown;
  input_rules?: string[];
  final_instruction?: string;
};

export type Spec03 = {
  prompt?: string;
};

export type Spec04 = {
  base_prompt?: string;
  input_instruction?: string;
};

/** job_type 未指定時は呼び出し側で1行のみ返すこと。指定時のみ本関数でプロンプトを組み立てる。 */
export function buildHearingQuestionTextPrompt(
  jobType: string,
  resumePdfText: string,
  interviewMemoText: string
): { systemInstruction: string; userPrompt: string } {
  const spec = loadYamlSafe<Spec04>("04_hearing_question_text_prompt.yaml");
  const basePrompt = spec.base_prompt ?? "";
  const inputInstruction = spec.input_instruction ?? "";
  const systemInstruction = `${basePrompt}\n\n---\n\n${inputInstruction}`.trim();
  const userPrompt = `【job_type】
${jobType}

【候補者WEB履歴書PDF抽出テキスト】
${resumePdfText || "(なし)"}

【面談メモ】
${interviewMemoText || "(なし)"}

上記を解析し、プロンプトに従い候補者に送る質問本文のみを出力してください。見出し・内部メモ・解析過程・GoogleフォームやURLは一切出力しないでください。`;
  return { systemInstruction, userPrompt };
}

/**
 * 01 共通解析プロンプトを読み、Gemini用の systemInstruction と userPrompt を組み立てる。
 * pdfFileName を渡した場合、求職者NOはファイル名からのみ抽出する旨を明示する（正本プロンプト準拠）。
 */
export function buildCommonAnalysisPrompt(
  pdfText: string,
  interviewLog: string,
  flagListText: string,
  pdfFileName?: string | null
): { systemInstruction: string; userPrompt: string } {
  const spec = loadYamlSafe<Spec01>("01_common_analysis_prompt.yaml");

  const role = spec.role ?? "";
  const tone = spec.tone ?? "";
  const rules = (spec.absolute_rules ?? []).join("\n  - ");
  const procedure = spec.procedure ?? "";
  const finalInstruction = spec.final_instruction ?? "";

  const systemInstruction = `${role}\n\ntone: ${tone}\n\nabsolute_rules:\n  - ${rules}\n\nprocedure:\n${procedure}\n\n${finalInstruction}`;

  const filenameBlock =
    pdfFileName && pdfFileName.trim()
      ? `

【重要】求職者NOについて
・Web履歴書PDFのファイル名: ${pdfFileName}
・extracted_facts.candidate_no には、上記ファイル名に含まれる「5から始まる7桁の数字」のみを設定すること。
・面談メモやPDF本文内の番号は求職者NOとして使用しないでください。`
      : "";

  const basicColumns = (spec.basic_info_sheet_columns ?? []).join("、");
  const inputRulesBlock =
    Array.isArray(spec.input_rules) && spec.input_rules.length > 0
      ? `\n【出力時のルール】\n${spec.input_rules.map((r) => `・${r}`).join("\n")}\n`
      : "";

  const userPrompt = `【タスク】添付3つのファイル（面談の通話文字起こしメモ・Web履歴書PDF・フラグリスト）をすべて読み取り、必要な情報をフラグリストの形式に合わせて書き出してください。filemaker_mapping のキーは「基本情報シートの列名」と完全一致させること。表記が1文字でも違うとExcelに反映されません。フラグ列の値はフラグリストに記載されている選択肢の文言をそのまま使ってください。

【基本情報シートの列名（filemaker_mapping のキーはこのいずれかと完全一致させること）】
${basicColumns}
${inputRulesBlock}
以下は3つの資料の全文です。面談メモ・PDF・フラグリストをそれぞれ個別に解析し、すべて最初から最後まで読んだうえで、記載がある項目を漏れなく filemaker_mapping に追加し、メモ列には要約を書いてください。確認用ステップで漏れがないか見直したうえで出力してください。
${filenameBlock}

【面談の通話文字起こしメモ（会話内容の文字起こし）】
${interviewLog || "(なし)"}

【Web履歴書（PDFから抽出した本文）】
${pdfText || "(なし)"}

【フラグリスト（シート「リスト」。フラグ列の値はここに記載されている文言をそのままコピーすること）】
${flagListText || "(なし)"}

上記3つをすべて読み、言及がある列は上記の列名のどれかと完全一致するキーで filemaker_mapping に追加すること。フラグはフラグリストの表記をそのまま使うこと。出力はJSONのみ。`;
  return { systemInstruction, userPrompt };
}

/**
 * 02 Googleフォーム質問プロンプトを読み、Gemini用のプロンプトを組み立てる
 */
export function buildGoogleFormPrompt(commonAnalysisJson: unknown): {
  systemInstruction: string;
  userPrompt: string;
} {
  const spec = loadYamlSafe<Spec02>("02_google_form_prompt.yaml");

  const role = spec.role ?? "";
  const tone = spec.tone ?? "";
  const rules = (spec.absolute_rules ?? []).join("\n  - ");
  const finalInstruction = spec.final_instruction ?? "";

  const systemInstruction = `${role}\n\ntone: ${tone}\n\nabsolute_rules:\n  - ${rules}\n\n${finalInstruction}`;

  const userPrompt = `以下の共通解析JSONを入力として、Googleフォーム用の質問定義（form_metadata と questions）を生成してください。missing_items を補う質問を優先し、出力はJSONのみで説明は含めないでください。

【common_analysis_json】
${JSON.stringify(commonAnalysisJson, null, 2)}`;
  return { systemInstruction, userPrompt };
}

/**
 * 03 FileMaker用Excelプロンプトを読み、Gemini用のプロンプトを組み立てる
 */
export function buildFilemakerExcelPrompt(commonAnalysisJson: unknown): {
  systemInstruction: string;
  userPrompt: string;
} {
  const spec = loadYamlSafe<Spec03>("03_filemaker_excel_prompt.yaml");
  const fullPrompt = spec.prompt ?? "";

  const systemInstruction = fullPrompt;
  const userPrompt = `以下の common_analysis_json を入力として、仕様どおり excel_files 形式のJSON（基本情報シート・職歴情報シートの columns と rows）を出力してください。説明文は一切含めず、JSONのみを返してください。

【common_analysis_json】
${JSON.stringify(commonAnalysisJson, null, 2)}`;
  return { systemInstruction, userPrompt };
}
