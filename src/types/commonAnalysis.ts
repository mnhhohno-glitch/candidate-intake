/**
 * 共通解析JSON（common_analysis_json）の型定義
 */

export interface WorkHistoryItem {
  company_name?: string | null;
  period?: string | null;
  job_type?: string | null;
  resignation_reason?: string | null;
  [key: string]: unknown;
}

export interface ExtractedFacts {
  candidate_no?: string | null;
  candidate_name?: string | null;
  work_history?: WorkHistoryItem[];
  [key: string]: unknown;
}

export interface FilemakerMapping {
  [columnName: string]: string | number | boolean | null | undefined;
}

export interface CommonAnalysisJson {
  extracted_facts: ExtractedFacts;
  filemaker_mapping: FilemakerMapping;
  missing_items: string[];
}
