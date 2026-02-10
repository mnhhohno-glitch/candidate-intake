import type { ExcelFilesOutput, ExcelSheet } from "@/types/excelExport";
import type { CommonAnalysisJson } from "@/types/commonAnalysis";

const WORK_HISTORY_COLUMNS = [
  "求職者NO",
  "何社目",
  "企業名",
  "事業内容",
  "在籍期間_年",
  "在籍期間_ヶ月",
  "職種フラグ",
  "職種メモ",
  "退職理由_大",
  "退職理由_中",
  "退職理由_小",
  "転職理由メモ",
];

/** 求職者番号（7桁）の後に「1」を付けた8桁のインポート照合キーを返す。不正な場合は null。 */
function computeImportKey(candidateNo: unknown): number | null {
  if (candidateNo == null) return null;
  const s = String(candidateNo).trim();
  if (!/^5\d{6}$/.test(s)) return null;
  return parseInt(s + "1", 10);
}

/** 値が求職者NO（5で始まる7桁）のみの場合はメモ列に不適切なので true */
function looksLikeCandidateNoOnly(val: unknown): boolean {
  if (val == null) return false;
  const s = String(val).trim();
  return /^5\d{6}$/.test(s);
}

/**
 * Gemini出力の excel_files に、common_analysis_json の filemaker_mapping を反映する。
 * 基本情報シート: 行が0件なら1行作成。各列は filemaker_mapping で補完。
 * インポート用照合キーはサーバー側で「求職者NO＋1」に強制する。
 */
export function applyFilemakerBackfill(
  data: ExcelFilesOutput,
  common: CommonAnalysisJson
): ExcelFilesOutput {
  const mapping = common?.filemaker_mapping ?? {};
  const candidateNo = common?.extracted_facts?.candidate_no ?? null;
  const importKeyValue = computeImportKey(candidateNo);

  const sheets = data.excel_files?.sheets ?? [];
  for (const sheet of sheets) {
    if (sheet.sheet_name !== "基本情報シート") continue;
    const columns = sheet.columns ?? [];
    let rows = sheet.rows ?? [];
    if (rows.length === 0 && columns.length > 0) {
      rows = [Array(columns.length).fill(null) as (string | number | boolean | null)[]];
      sheet.rows = rows;
    }
    const colIndexImportKey = columns.findIndex(
      (c) => c === "インポート用照合キー" || c === "照合キー"
    );
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (let i = 0; i < columns.length; i++) {
        const colName = columns[i];
        if (!colName || typeof colName !== "string") continue;
        const mapVal = mapping[colName];
        if (mapVal === undefined || mapVal === null) continue;
        const current = row[i];
        if (current === null || current === undefined || current === "") {
          let val = mapVal as string | number | boolean | null;
          if (colName.includes("メモ") && looksLikeCandidateNoOnly(val)) {
            val = null;
          }
          row[i] = val;
        }
      }
      if (colIndexImportKey >= 0 && importKeyValue !== null) {
        row[colIndexImportKey] = importKeyValue;
      }
      for (let i = 0; i < columns.length; i++) {
        if (columns[i]?.includes("メモ") && looksLikeCandidateNoOnly(row[i])) {
          row[i] = null;
        }
      }
    }
    break;
  }
  return data;
}

/**
 * 職歴情報シートが無い場合は常に追加する（ヘッダーだけでもシートを用意する）。
 */
export function ensureWorkHistorySheetExists(
  data: ExcelFilesOutput,
  _common?: CommonAnalysisJson
): void {
  const sheets = data.excel_files?.sheets ?? [];
  if (sheets.some((s) => s.sheet_name === "職歴情報シート")) return;
  sheets.push({
    sheet_name: "職歴情報シート",
    columns: [...WORK_HISTORY_COLUMNS],
    rows: [],
  });
}

/**
 * 職歴情報シートの行を work_history から生成・補完する。
 * シートが無い場合は ensureWorkHistorySheetExists で追加済みの前提。
 * Geminiが行を返していない場合は、work_history の件数分の行を追加してから埋める。
 */
export function applyWorkHistoryBackfill(
  data: ExcelFilesOutput,
  common: CommonAnalysisJson
): ExcelFilesOutput {
  ensureWorkHistorySheetExists(data, common);

  const workHistory = common?.extracted_facts?.work_history;
  if (!Array.isArray(workHistory) || workHistory.length === 0) return data;

  const candidateNo = common?.extracted_facts?.candidate_no ?? null;
  const sheets = data.excel_files?.sheets ?? [];
  for (const sheet of sheets) {
    if (sheet.sheet_name !== "職歴情報シート") continue;
    if ((sheet.columns ?? []).length === 0) {
      sheet.columns = [...WORK_HISTORY_COLUMNS];
    }
    const columns = sheet.columns ?? [];
    let rows = sheet.rows ?? [];
    const colLen = columns.length;
    while (rows.length < workHistory.length) {
      rows.push(Array(colLen).fill(null) as (string | number | boolean | null)[]);
    }
    sheet.rows = rows;

    const colIndex: Record<string, number> = {};
    columns.forEach((c, i) => {
      colIndex[c] = i;
    });
    for (let r = 0; r < rows.length && r < workHistory.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const item = workHistory[r];
      if (!item || typeof item !== "object") continue;
      if (candidateNo != null && colIndex["求職者NO"] !== undefined) {
        row[colIndex["求職者NO"]] = candidateNo;
      }
      if (colIndex["何社目"] !== undefined) {
        row[colIndex["何社目"]] = r + 1;
      }
      const it = item as Record<string, unknown>;
      const map: Record<string, string | number | null | undefined> = {
        企業名: (it.company_name ?? it.企業名 ?? it.company) as string | undefined,
        事業内容: (it.business_content ?? it.事業内容 ?? it.business) as string | undefined,
        職種フラグ: (it.job_type ?? it.職種フラグ ?? it.職種) as string | undefined,
        職種メモ: (it.job_type_memo ?? it.職種メモ ?? it.job_type ?? it.職種) as string | undefined,
        退職理由_大: (it.resignation_reason ?? it.退職理由_大 ?? it.退職理由) as string | undefined,
        退職理由_中: (it.resignation_reason_mid ?? it.退職理由_中) as string | undefined,
        退職理由_小: (it.resignation_reason_small ?? it.退職理由_小) as string | undefined,
        転職理由メモ: (it.resignation_reason ?? it.転職理由メモ ?? it.転職理由) as string | undefined,
      };
      const period = it.period ?? it.在籍期間 ?? it.period_years;
      if (period != null) {
        const periodStr = String(period);
        const yearMatch = periodStr.match(/(\d+)\s*年/);
        const monthMatch = periodStr.match(/(\d+)\s*[ヶか]月/);
        if (colIndex["在籍期間_年"] !== undefined) {
          row[colIndex["在籍期間_年"]] = yearMatch
            ? Number(yearMatch[1])
            : (typeof it.在籍期間_年 === "number" || typeof it.在籍期間_年 === "string" ? it.在籍期間_年 : periodStr);
        }
        if (colIndex["在籍期間_ヶ月"] !== undefined) {
          row[colIndex["在籍期間_ヶ月"]] = monthMatch
            ? Number(monthMatch[1])
            : (typeof it.在籍期間_ヶ月 === "number" ? it.在籍期間_ヶ月 : null);
        }
      }
      for (const [colName, val] of Object.entries(map)) {
        if (colIndex[colName] === undefined) continue;
        if (val != null && val !== "") {
          row[colIndex[colName]] = val;
        }
      }
    }
    break;
  }
  return data;
}
