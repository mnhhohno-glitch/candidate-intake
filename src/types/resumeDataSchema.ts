/**
 * T-029 新設計 Phase A: ResumeData の Gemini responseSchema (JSON Schema 互換)
 * Gemini API は OpenAPI 3.0 サブセットを受け付ける。型は大文字（OBJECT/STRING/ARRAY 等）を使用。
 * nullable: true で null 許容を表現する。
 */

const nullableString = { type: "STRING", nullable: true } as const;

const addressComponentsSchema = {
  type: "OBJECT",
  properties: {
    prefecture: nullableString,
    city: nullableString,
    banchi: nullableString,
    building: nullableString,
    room: nullableString,
  },
  required: ["prefecture", "city", "banchi", "building", "room"],
} as const;

const personalInfoSchema = {
  type: "OBJECT",
  properties: {
    name: nullableString,
    furigana: nullableString,
    birthday: nullableString,
    gender: nullableString,
    address_full: nullableString,
    address_components: addressComponentsSchema,
    phone: nullableString,
    email: nullableString,
  },
  required: [
    "name",
    "furigana",
    "birthday",
    "gender",
    "address_full",
    "address_components",
    "phone",
    "email",
  ],
} as const;

const highSchoolSchema = {
  type: "OBJECT",
  nullable: true,
  properties: {
    name: nullableString,
    entry_date: nullableString,
    graduation_date: nullableString,
  },
  required: ["name", "entry_date", "graduation_date"],
} as const;

const universitySchema = {
  type: "OBJECT",
  nullable: true,
  properties: {
    name: nullableString,
    faculty: nullableString,
    department: nullableString,
    entry_date: nullableString,
    graduation_date: nullableString,
  },
  required: ["name", "faculty", "department", "entry_date", "graduation_date"],
} as const;

const educationSchema = {
  type: "OBJECT",
  properties: {
    high_school: highSchoolSchema,
    university: universitySchema,
  },
  required: ["high_school", "university"],
} as const;

const qualificationItemSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    acquired_date: nullableString,
  },
  required: ["name", "acquired_date"],
} as const;

const workHistoryItemSchema = {
  type: "OBJECT",
  properties: {
    company: { type: "STRING" },
    period: { type: "STRING" },
    position: nullableString,
    description: nullableString,
  },
  required: ["company", "period", "position", "description"],
} as const;

const preferencesSchema = {
  type: "OBJECT",
  properties: {
    industry: nullableString,
    location: nullableString,
    salary: nullableString,
    employment_type: nullableString,
  },
  required: ["industry", "location", "salary", "employment_type"],
} as const;

const extractionQualitySchema = {
  type: "OBJECT",
  properties: {
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
    notes: nullableString,
  },
  required: ["confidence", "notes"],
} as const;

export const RESUME_DATA_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    personal_info: personalInfoSchema,
    education: educationSchema,
    qualifications: { type: "ARRAY", items: qualificationItemSchema },
    work_history: { type: "ARRAY", items: workHistoryItemSchema },
    self_pr: nullableString,
    preferences: preferencesSchema,
    extraction_quality: extractionQualitySchema,
  },
  required: [
    "personal_info",
    "education",
    "qualifications",
    "work_history",
    "self_pr",
    "preferences",
    "extraction_quality",
  ],
} as const;
