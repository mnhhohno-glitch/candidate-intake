/**
 * PDFをページごとに画像化し、Tesseract.jsで日本語OCRする。
 * テキスト抽出が0文字のときのフォールバック用。Node環境のみ。
 */

const SCALE = 2; // 解像度（OCR精度のため2推奨）
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

    const loadingTask = pdfjs.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
    });
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
