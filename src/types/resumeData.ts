/**
 * T-029 新設計 Phase A: 履歴書PDF + 面談ログから抽出する構造化データ型
 * extract_resume エンドポイントのレスポンス resumeData の TypeScript 型定義
 */

export type AddressComponents = {
  prefecture: string | null;
  city: string | null;
  banchi: string | null;
  building: string | null;
  room: string | null;
};

export type PersonalInfo = {
  name: string | null;
  furigana: string | null;
  birthday: string | null;
  gender: string | null;
  address_full: string | null;
  address_components: AddressComponents;
  phone: string | null;
  email: string | null;
};

export type SchoolInfo = {
  name: string | null;
  entry_date: string | null;
  graduation_date: string | null;
};

export type UniversityInfo = SchoolInfo & {
  faculty: string | null;
  department: string | null;
};

export type Education = {
  high_school: SchoolInfo | null;
  university: UniversityInfo | null;
};

export type Qualification = {
  name: string;
  acquired_date: string | null;
};

export type WorkHistoryItem = {
  company: string;
  period: string;
  position: string | null;
  description: string | null;
};

export type Preferences = {
  industry: string | null;
  location: string | null;
  salary: string | null;
  employment_type: string | null;
};

export type ExtractionQuality = {
  confidence: "high" | "medium" | "low";
  notes: string | null;
};

export type ResumeData = {
  personal_info: PersonalInfo;
  education: Education;
  qualifications: Qualification[];
  work_history: WorkHistoryItem[];
  self_pr: string | null;
  preferences: Preferences;
  extraction_quality: ExtractionQuality;
};

/**
 * 抽出結果の最小限の構造妥当性検証。
 * 必須トップレベルフィールドが揃っていることのみを保証する（中身の値は問わない）。
 */
export function isValidResumeData(obj: unknown): obj is ResumeData {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (!o.personal_info || typeof o.personal_info !== "object") return false;
  if (!o.education || typeof o.education !== "object") return false;
  if (!Array.isArray(o.qualifications)) return false;
  if (!Array.isArray(o.work_history)) return false;
  if (!o.preferences || typeof o.preferences !== "object") return false;
  if (!o.extraction_quality || typeof o.extraction_quality !== "object") return false;
  const eq = o.extraction_quality as Record<string, unknown>;
  if (eq.confidence !== "high" && eq.confidence !== "medium" && eq.confidence !== "low") return false;
  return true;
}
