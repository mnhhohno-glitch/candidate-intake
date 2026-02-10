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

export interface AttachmentSummary {
  pdfName?: string;
  interviewLogName?: string;
  flagListName?: string;
}

export interface StoredRecord {
  candidateId: string;
  candidateName: string;
  careerAdvisor: string;
  createdAt: string;
  lastOutputAt?: string;
  attachmentSummary?: AttachmentSummary;
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
  return readRecords();
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
    try {
      await fs.unlink(excelPath);
    } catch {
      // ignore
    }
  }
}
