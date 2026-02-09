import ExcelJS from "exceljs";

/**
 * PDFのBufferからテキストを抽出（Nodeのみ。pdf-parse使用）
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text?: string }> }).default ?? mod;
  const data = await (pdfParse as (b: Buffer) => Promise<{ text?: string }>)(buffer);
  return typeof data?.text === "string" ? data.text.trim() : "";
}

/**
 * xlsxのBufferから「列名: 値」形式のテキストを生成（1シート目）
 */
export async function extractTextFromXlsx(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return "";

  const rows: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const val = cell.value;
      let s = "";
      if (val !== null && val !== undefined) {
        if (typeof val === "object" && "text" in val) {
          s = String((val as { text: string }).text);
        } else {
          s = String(val);
        }
      }
      cells.push(s);
    });
    rows.push(cells.join("\t"));
  });
  return rows.join("\n");
}
