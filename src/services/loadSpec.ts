import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const SPECS_DIR = path.join(process.cwd(), "specs");

export type Spec01 = {
  role?: string;
  tone?: string;
  absolute_rules?: string[];
  output_structure?: unknown;
  input_sections?: { name: string; description: string }[];
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

/**
 * 01 共通解析プロンプトを読み、Gemini用の systemInstruction と userPrompt を組み立てる
 */
export function buildCommonAnalysisPrompt(
  pdfText: string,
  interviewLog: string,
  flagListText: string
): { systemInstruction: string; userPrompt: string } {
  const raw = fs.readFileSync(path.join(SPECS_DIR, "01_common_analysis_prompt.yaml"), "utf8");
  const spec = yaml.load(raw) as Spec01;

  const role = spec.role ?? "";
  const tone = spec.tone ?? "";
  const rules = (spec.absolute_rules ?? []).join("\n  - ");
  const procedure = spec.procedure ?? "";
  const finalInstruction = spec.final_instruction ?? "";

  const systemInstruction = `${role}\n\ntone: ${tone}\n\nabsolute_rules:\n  - ${rules}\n\nprocedure:\n${procedure}\n\n${finalInstruction}`;

  const userPrompt = `以下3つの入力ブロックを解析し、共通解析JSON（extracted_facts, filemaker_mapping, missing_items）を出力してください。

【PDFテキスト（履歴書・登録シート等）】
${pdfText || "(なし)"}

【面談ログ・面談メモ】
${interviewLog || "(なし)"}

【フラグリスト】
${flagListText || "(なし)"}

上記以外を参照せず、記載がある事実のみを抽出してください。出力はJSONのみ。`;
  return { systemInstruction, userPrompt };
}

/**
 * 02 Googleフォーム質問プロンプトを読み、Gemini用のプロンプトを組み立てる
 */
export function buildGoogleFormPrompt(commonAnalysisJson: unknown): {
  systemInstruction: string;
  userPrompt: string;
} {
  const raw = fs.readFileSync(path.join(SPECS_DIR, "02_google_form_prompt.yaml"), "utf8");
  const spec = yaml.load(raw) as Spec02;

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
  const raw = fs.readFileSync(path.join(SPECS_DIR, "03_filemaker_excel_prompt.yaml"), "utf8");
  const spec = yaml.load(raw) as Spec03;
  const fullPrompt = spec.prompt ?? "";

  const systemInstruction = fullPrompt;
  const userPrompt = `以下の common_analysis_json を入力として、仕様どおり excel_files 形式のJSON（基本情報シート・職歴情報シートの columns と rows）を出力してください。説明文は一切含めず、JSONのみを返してください。

【common_analysis_json】
${JSON.stringify(commonAnalysisJson, null, 2)}`;
  return { systemInstruction, userPrompt };
}
