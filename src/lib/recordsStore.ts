import fs from "fs/promises";
import path from "path";

/**
 * データ保存先。Railway などで Volume をマウントする場合は
 * 環境変数 DATA_DIR にそのパスを指定する（例: DATA_DIR=/data）。
 * 未指定時はプロジェクト直下の data/ を使用（デプロイごとに消える）。
 */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const RECORDS_FILE = path.join(DATA_DIR, "records.json");

if (process.env.NODE_ENV !== "test") {
  console.log("[recordsStore] DATA_DIR =", DATA_DIR, process.env.DATA_DIR ? "(from env)" : "(default, デプロイで消えます)");
}

export interface AttachmentSummary {
  pdfName?: string;
  interviewLogName?: string;
  flagListName?: string;
}

export interface FormUrlInfo {
  formUrl?: string;
  formEditUrl?: string;
  formId?: string;
}

export interface StoredRecord {
  candidateId: string;
  candidateName: string;
  careerAdvisor: string;
  createdAt: string;
  lastOutputAt?: string;
  attachmentSummary?: AttachmentSummary;
  /** 質問文から作成したGoogleフォームの回答URL（候補者送付用） */
  formUrl?: string;
  /** フォーム編集用URL（社内用） */
  formEditUrl?: string;
  /** フォームID */
  formId?: string;
  /** 生成された質問文テキスト */
  questionText?: string;
  /** 解析結果が保存されているか */
  hasAnalysisResult?: boolean;
  /** 解析結果の保存日時 */
  analysisResultAt?: string;
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readRecords(): Promise<StoredRecord[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(RECORDS_FILE, "utf-8");
    const data = JSON.parse(raw) as { records: StoredRecord[] };
    return Array.isArray(data.records) ? data.records : [];
  } catch {
    return [];
  }
}

async function writeRecords(records: StoredRecord[]) {
  await ensureDataDir();
  await fs.writeFile(
    RECORDS_FILE,
    JSON.stringify({ records }, null, 2),
    "utf-8"
  );
}

export async function listRecords(): Promise<StoredRecord[]> {
  const records = await readRecords();
  // 求職者番号（candidateId）の降順でソート
  return records.sort((a, b) => b.candidateId.localeCompare(a.candidateId));
}

export async function addOrUpdateRecord(record: {
  candidateId: string;
  candidateName: string;
  careerAdvisor: string;
}): Promise<StoredRecord[]> {
  const records = await readRecords();
  const now = new Date().toISOString();
  const idx = records.findIndex((r) => r.candidateId === record.candidateId);
  if (idx >= 0) {
    records[idx] = {
      ...records[idx],
      candidateName: record.candidateName,
      careerAdvisor: record.careerAdvisor,
    };
  } else {
    records.push({
      candidateId: record.candidateId,
      candidateName: record.candidateName,
      careerAdvisor: record.careerAdvisor,
      createdAt: now,
    });
  }
  await writeRecords(records);
  return records;
}

export async function updateRecordCache(
  candidateId: string,
  attachmentSummary: AttachmentSummary,
  excelBuffer: Buffer
): Promise<void> {
  await ensureDataDir();
  const records = await readRecords();
  const now = new Date().toISOString();
  const idx = records.findIndex((r) => r.candidateId === candidateId);
  if (idx >= 0) {
    records[idx] = {
      ...records[idx],
      lastOutputAt: now,
      attachmentSummary,
    };
  } else {
    records.push({
      candidateId,
      candidateName: "",
      careerAdvisor: "",
      createdAt: now,
      lastOutputAt: now,
      attachmentSummary,
    });
  }
  await writeRecords(records);
  const excelPath = path.join(CACHE_DIR, `${candidateId}_last.xlsx`);
  await fs.writeFile(excelPath, excelBuffer);
}

export async function getCachedExcelPath(candidateId: string): Promise<string | null> {
  const p = path.join(CACHE_DIR, `${candidateId}_last.xlsx`);
  try {
    await fs.access(p);
    return p;
  } catch {
    return null;
  }
}

export async function getRecord(candidateId: string): Promise<StoredRecord | null> {
  const records = await readRecords();
  return records.find((r) => r.candidateId === candidateId) ?? null;
}

/**
 * 求職者レコードのフォームURL情報のみを更新する（Googleフォーム作成後に呼ぶ）。
 */
export async function updateRecordFormUrls(
  candidateId: string,
  urls: FormUrlInfo
): Promise<StoredRecord | null> {
  const records = await readRecords();
  const idx = records.findIndex((r) => r.candidateId === candidateId);
  if (idx < 0) return null;
  records[idx] = {
    ...records[idx],
    formUrl: urls.formUrl ?? records[idx].formUrl,
    formEditUrl: urls.formEditUrl ?? records[idx].formEditUrl,
    formId: urls.formId ?? records[idx].formId,
  };
  await writeRecords(records);
  return records[idx];
}

/**
 * 求職者レコードの質問文テキストを更新する（質問文生成後に呼ぶ）。
 */
export async function updateRecordQuestionText(
  candidateId: string,
  questionText: string
): Promise<StoredRecord | null> {
  const records = await readRecords();
  const idx = records.findIndex((r) => r.candidateId === candidateId);
  if (idx < 0) return null;
  records[idx] = {
    ...records[idx],
    questionText,
  };
  await writeRecords(records);
  return records[idx];
}

export async function deleteRecord(candidateId: string): Promise<void> {
  const records = await readRecords();
  const next = records.filter((r) => r.candidateId !== candidateId);
  await writeRecords(next);
  const excelPath = path.join(CACHE_DIR, `${candidateId}_last.xlsx`);
  try {
    await fs.unlink(excelPath);
  } catch {
    // ignore
  }
}

export async function deleteRecords(candidateIds: string[]): Promise<void> {
  const ids = new Set(candidateIds);
  const records = await readRecords();
  const next = records.filter((r) => !ids.has(r.candidateId));
  await writeRecords(next);
  await ensureDataDir();
  for (const id of ids) {
    const excelPath = path.join(CACHE_DIR, `${id}_last.xlsx`);
    const analysisPath = path.join(CACHE_DIR, `${id}_analysis.json`);
    try {
      await fs.unlink(excelPath);
    } catch {
      // ignore
    }
    try {
      await fs.unlink(analysisPath);
    } catch {
      // ignore
    }
  }
}

/**
 * 解析結果を保存する。
 * 解析結果は別ファイル（{candidateId}_analysis.json）に保存し、
 * レコードには hasAnalysisResult フラグと日時のみ記録。
 */
export async function saveAnalysisResult(
  candidateId: string,
  analysisResult: unknown
): Promise<StoredRecord | null> {
  await ensureDataDir();
  const records = await readRecords();
  const idx = records.findIndex((r) => r.candidateId === candidateId);
  if (idx < 0) return null;

  const now = new Date().toISOString();
  records[idx] = {
    ...records[idx],
    hasAnalysisResult: true,
    analysisResultAt: now,
  };
  await writeRecords(records);

  const analysisPath = path.join(CACHE_DIR, `${candidateId}_analysis.json`);
  await fs.writeFile(analysisPath, JSON.stringify(analysisResult, null, 2), "utf-8");

  return records[idx];
}

/**
 * 保存済みの解析結果を取得する。
 * 存在しない場合は null を返す。
 */
export async function getAnalysisResult(candidateId: string): Promise<unknown | null> {
  const analysisPath = path.join(CACHE_DIR, `${candidateId}_analysis.json`);
  try {
    const raw = await fs.readFile(analysisPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 解析結果を削除する。
 */
export async function clearAnalysisResult(candidateId: string): Promise<void> {
  const records = await readRecords();
  const idx = records.findIndex((r) => r.candidateId === candidateId);
  if (idx >= 0) {
    records[idx] = {
      ...records[idx],
      hasAnalysisResult: false,
      analysisResultAt: undefined,
    };
    await writeRecords(records);
  }

  const analysisPath = path.join(CACHE_DIR, `${candidateId}_analysis.json`);
  try {
    await fs.unlink(analysisPath);
  } catch {
    // ignore
  }
}
