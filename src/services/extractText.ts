import ExcelJS from "exceljs";

/** テキスト抽出がこの文字数未満かつページがある場合、OCRフォールバックを試す */
const MIN_TEXT_LENGTH_BEFORE_OCR = 20;

/**
 * PDFのBufferからテキストを抽出（Nodeのみ）。
 * まずpdf-parseでテキストレイヤーを取得。0文字（または極端に短い）かつページがある場合はOCRで再試行。
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const len = buffer?.length ?? 0;
  try {
    const mod = await import("pdf-parse");
    const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text?: string; numpages?: number }> }).default ?? mod;
    const data = await (pdfParse as (b: Buffer) => Promise<{ text?: string; numpages?: number }>)(buffer);
    let text = typeof data?.text === "string" ? data.text.trim() : "";
    const numpages = typeof data?.numpages === "number" ? data.numpages : 0;
    if (process.env.NODE_ENV !== "test") {
      console.log(`[extractText] PDF: buffer=${len} bytes, pages=${numpages}, extracted=${text.length} chars`);
    }
    if (text.length < MIN_TEXT_LENGTH_BEFORE_OCR && numpages > 0) {
      if (process.env.NODE_ENV !== "test") {
        console.log("[extractText] Text too short, trying OCR fallback...");
      }
      const { extractTextFromPdfWithOcr } = await import("./extractTextPdfOcr");
      const ocrText = await extractTextFromPdfWithOcr(buffer);
      if (ocrText.length > text.length) {
        text = ocrText;
        if (process.env.NODE_ENV !== "test") {
          console.log("[extractText] OCR fallback succeeded, chars:", text.length);
        }
      } else if (text.length === 0 && process.env.NODE_ENV !== "test") {
        console.warn(
          "[extractText] PDF returned 0 characters; OCR did not add text. PDF may be image-only (scanned)."
        );
      }
    }
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extractText] PDF extraction failed. buffer=", len, "bytes, error:", msg);
    return "";
  }
}

/**
 * xlsxのBufferからテキストを生成。
 * 正本プロンプトに従い、シート名「リスト」があればそれを優先、なければ1シート目。
 */
export async function extractTextFromXlsx(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const listSheet = workbook.getWorksheet("リスト");
  const sheet = listSheet ?? workbook.worksheets[0];
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
