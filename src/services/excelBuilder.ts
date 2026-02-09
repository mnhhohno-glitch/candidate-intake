import ExcelJS from "exceljs";
import type { ExcelFilesOutput } from "@/types/excelExport";

/**
 * excel_files 形式のJSONを .xlsx バイナリに変換する（2シートを1ファイルに）
 */
export async function buildXlsxBuffer(data: ExcelFilesOutput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheets = data.excel_files?.sheets ?? [];

  for (const sh of sheets) {
    const sheetName = (sh.sheet_name || "Sheet").slice(0, 31);
    const worksheet = workbook.addWorksheet(sheetName, { headerFooter: { firstHeader: "", firstFooter: "" } });
    const columns = sh.columns ?? [];
    const rows = sh.rows ?? [];

    if (columns.length > 0) {
      worksheet.addRow(columns);
    }
    for (const row of rows) {
      const values = Array.isArray(row) ? row : [];
      const cells = columns.length ? values.slice(0, columns.length) : values;
      const padded = [...cells];
      while (padded.length < columns.length) {
        padded.push(null);
      }
      worksheet.addRow(padded.map((v) => (v === null || v === undefined ? "" : v)));
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
