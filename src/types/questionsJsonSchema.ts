/**
 * T-029 新設計 Phase B-1: questionsJson の Gemini responseSchema (JSON Schema 互換)
 * Gemini API は OpenAPI 3.0 サブセット。型は大文字（OBJECT/STRING/ARRAY）。nullable: true で null 許容。
 */

const nullableString = { type: "STRING", nullable: true } as const;
const nullableBoolean = { type: "BOOLEAN", nullable: true } as const;
const nullableStringArray = {
  type: "ARRAY",
  nullable: true,
  items: { type: "STRING" },
} as const;

const questionItemSchema = {
  type: "OBJECT",
  properties: {
    type: {
      type: "STRING",
      enum: [
        "short_text",
        "long_text",
        "single_select",
        "multi_select",
        "dropdown",
        "section_header",
      ],
    },
    title: { type: "STRING" },
    help_text: nullableString,
    choices: nullableStringArray,
    required: nullableBoolean,
  },
  required: ["type", "title", "help_text", "choices", "required"],
} as const;

const formSectionSchema = {
  type: "OBJECT",
  properties: {
    id: { type: "STRING" },
    header: { type: "STRING" },
    items: { type: "ARRAY", items: questionItemSchema },
  },
  required: ["id", "header", "items"],
} as const;

export const QUESTIONS_JSON_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    candidate_name: { type: "STRING" },
    greeting: { type: "STRING" },
    sections: { type: "ARRAY", items: formSectionSchema },
  },
  required: ["candidate_name", "greeting", "sections"],
} as const;
