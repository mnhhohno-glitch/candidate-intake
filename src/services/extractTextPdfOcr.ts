/**
 * PDFをページごとに画像化し、Tesseract.jsで日本語OCRする。
 * テキスト抽出が0文字のときのフォールバック用。Node環境のみ。
 * cMapUrl/standardFontDataUrl を指定し、日本語PDFのフォント描画エラーを軽減する。
 */

import path from "path";
import { pathToFileURL } from "url";

const SCALE = 2; // 解像度（OCR精度のため2推奨）

function getPdfJsBasePath(): string {
  try {
    return path.join(process.cwd(), "node_modules", "pdfjs-dist");
  } catch {
    return "";
  }
}

export async function extractTextFromPdfWithOcr(buffer: Buffer): Promise<string> {
  const len = buffer?.length ?? 0;
  if (process.env.NODE_ENV !== "test") {
    console.log("[extractTextPdfOcr] Starting OCR fallback, buffer size:", len);
  }

  try {
    const uint8 = new Uint8Array(buffer);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");
    const { createWorker } = await import("tesseract.js");

    const basePath = getPdfJsBasePath();
    const getDocumentOptions: Record<string, unknown> = {
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
    };
    if (basePath) {
      try {
        getDocumentOptions.cMapUrl = pathToFileURL(path.join(basePath, "cmaps")).href;
        getDocumentOptions.cMapPacked = true;
        getDocumentOptions.standardFontDataUrl = pathToFileURL(path.join(basePath, "standard_fonts")).href;
      } catch {
        // パス解決に失敗した場合はオプションなしで続行
      }
    }

    const loadingTask = pdfjs.getDocument(getDocumentOptions as Parameters<typeof pdfjs.getDocument>[0]);
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const textParts: string[] = [];

    const worker = await createWorker("jpn", 1, {
      logger: () => {},
    });

    try {
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: SCALE });
        const w = Math.floor(viewport.width);
        const h = Math.floor(viewport.height);
        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext("2d");
        const renderTask = page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          canvas: null,
          viewport,
        });
        await renderTask.promise;
        const imageBuffer = canvas.toBuffer("image/png");
        const {
          data: { text },
        } = await worker.recognize(imageBuffer);
        textParts.push(text?.trim() ?? "");
      }
    } finally {
      await worker.terminate();
    }
    pdfDoc.destroy();

    const result = textParts.join("\n\n").trim();
    if (process.env.NODE_ENV !== "test") {
      console.log("[extractTextPdfOcr] OCR done, pages:", numPages, "chars:", result.length);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extractTextPdfOcr] OCR failed:", msg);
    return "";
  }
}
