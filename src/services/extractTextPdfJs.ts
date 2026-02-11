/**
 * pdfjs-dist でテキストレイヤーを抽出する。
 * システムダウンロードPDFなど、pdf-parse が 0 文字を返す場合のフォールバック用。
 * cMapUrl / standardFontDataUrl を指定し日本語PDFに対応する。
 */

import path from "path";
import { pathToFileURL } from "url";

function getPdfJsBasePath(): string {
  try {
    return path.join(process.cwd(), "node_modules", "pdfjs-dist");
  } catch {
    return "";
  }
}

export type PdfJsExtractResult = { text: string; numPages: number };

export async function extractTextFromPdfWithPdfJs(buffer: Buffer): Promise<string> {
  const r = await extractTextFromPdfWithPdfJsFull(buffer);
  return r.text;
}

/**
 * テキストとページ数を返す。extractText.ts で OCR 要不要の判定に numPages を使う。
 */
export async function extractTextFromPdfWithPdfJsFull(buffer: Buffer): Promise<PdfJsExtractResult> {
  const len = buffer?.length ?? 0;
  if (process.env.NODE_ENV !== "test") {
    console.log("[extractTextPdfJs] Extracting text with pdfjs-dist, buffer size:", len);
  }

  try {
    const uint8 = new Uint8Array(buffer);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const basePath = getPdfJsBasePath();
    const getDocumentOptions: Record<string, unknown> = {
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
    };
    if (basePath) {
      try {
        getDocumentOptions.cMapUrl = pathToFileURL(path.join(basePath, "cmaps") + path.sep).href;
        getDocumentOptions.cMapPacked = true;
        getDocumentOptions.standardFontDataUrl = pathToFileURL(path.join(basePath, "standard_fonts") + path.sep).href;
      } catch {
        // パス解決に失敗した場合はオプションなしで続行
      }
    }

    const loadingTask = pdfjs.getDocument(getDocumentOptions as Parameters<typeof pdfjs.getDocument>[0]);
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const textParts: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = (textContent.items as { str?: string }[])
        .map((item) => (typeof item.str === "string" ? item.str : ""))
        .join(" ");
      textParts.push(pageText);
    }

    pdfDoc.destroy();

    const result = textParts.join("\n\n").trim();
    if (process.env.NODE_ENV !== "test") {
      console.log("[extractTextPdfJs] Done, pages:", numPages, "chars:", result.length);
    }
    return { text: result, numPages };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extractTextPdfJs] Failed:", msg);
    return { text: "", numPages: 0 };
  }
}
