/**
 * T-029 新設計 Phase B-1: フォーム質問構造の TypeScript 型定義
 * generate_form エンドポイントが返す questionsJson の型
 */

export type QuestionItemType =
  | "short_text"
  | "long_text"
  | "single_select"
  | "multi_select"
  | "dropdown"
  | "section_header";

export type QuestionItem = {
  type: QuestionItemType;
  title: string;
  help_text: string | null;
  choices: string[] | null;
  required: boolean | null;
};

export type FormSection = {
  id: string;
  header: string;
  items: QuestionItem[];
};

export type QuestionsJson = {
  candidate_name: string;
  greeting: string;
  sections: FormSection[];
};

const VALID_ITEM_TYPES: ReadonlySet<QuestionItemType> = new Set([
  "short_text",
  "long_text",
  "single_select",
  "multi_select",
  "dropdown",
  "section_header",
]);

export function isValidQuestionsJson(obj: unknown): obj is QuestionsJson {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.candidate_name !== "string") return false;
  if (typeof o.greeting !== "string") return false;
  if (!Array.isArray(o.sections)) return false;
  for (const s of o.sections) {
    if (!s || typeof s !== "object") return false;
    const sec = s as Record<string, unknown>;
    if (typeof sec.id !== "string") return false;
    if (typeof sec.header !== "string") return false;
    if (!Array.isArray(sec.items)) return false;
    for (const it of sec.items) {
      if (!it || typeof it !== "object") return false;
      const item = it as Record<string, unknown>;
      if (typeof item.type !== "string" || !VALID_ITEM_TYPES.has(item.type as QuestionItemType)) return false;
      if (typeof item.title !== "string") return false;
    }
  }
  return true;
}
