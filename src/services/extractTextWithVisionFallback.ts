import { extractTextFromPdf } from "./extractText";
import { renderPdfToPngBase64List } from "./pdfToImages";
import {
  generateWithGeminiWithImage,
  generateWithGeminiWithPdf,
} from "./geminiClient";

const TEXT_EXTRACTION_THRESHOLD = 200;

const VISION_SYSTEM =
  "あなたは画像に写った文書を読み取り、その内容をプレーンテキストで抽出する役割です。ルール: 画像に明記されている内容のみを抽出し、推測は禁止。説明や前置きは一切出力せず、読み取ったテキストのみをそのまま出力してください。";

const VISION_USER =
  "この画像から読み取れるテキストをすべて抽出し、プレーンテキストのみで返してください。説明は不要です。";

export async function extractTextWithVisionFallback(
  pdfBuffer: Buffer,
  context: string = ""
): Promise<{ text: string; method: string }> {
  const tag = `[extractTextWithVisionFallback] ${context}`.trimEnd();

  const normalText = await extractTextFromPdf(pdfBuffer);

  if (normalText.length >= TEXT_EXTRACTION_THRESHOLD) {
    console.log(`${tag} normal extraction succeeded: ${normalText.length} chars`);
    return { text: normalText, method: "normal" };
  }

  console.log(
    `${tag} normal extraction insufficient (${normalText.length} chars), trying Gemini Vision...`
  );

  try {
    const pngList = await renderPdfToPngBase64List(pdfBuffer, 10);
    if (pngList.length > 0) {
      console.log(`${tag} rendered ${pngList.length} pages to PNG`);
      const pageTexts: string[] = [];
      for (let i = 0; i < pngList.length; i++) {
        try {
          const pageText = await generateWithGeminiWithImage({
            systemInstruction: VISION_SYSTEM,
            userPrompt: VISION_USER,
            imageBase64: pngList[i],
            responseMimeType: "text/plain",
            maxOutputTokens: 8192,
            temperature: 0.1,
          });
          const trimmed = (pageText ?? "").trim();
          pageTexts.push(trimmed);
          console.log(`${tag} page ${i + 1}: ${trimmed.length} chars via Vision`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`${tag} page ${i + 1} Vision failed: ${msg}`);
          break;
        }
      }
      const combined = pageTexts.join("\n\n").trim();
      if (combined.length >= TEXT_EXTRACTION_THRESHOLD) {
        return { text: combined, method: "vision-image" };
      }
      console.log(
        `${tag} Vision image insufficient (${combined.length} chars), trying PDF inline...`
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`${tag} Vision image rendering failed: ${msg}`);
  }

  try {
    const pdfBase64 = pdfBuffer.toString("base64");
    let pdfText = await generateWithGeminiWithPdf({
      systemInstruction: VISION_SYSTEM,
      userPrompt:
        "添付のPDFから読み取れるテキストをすべて抽出し、プレーンテキストのみで返してください。説明は不要です。",
      pdfBase64,
      responseMimeType: "text/plain",
      maxOutputTokens: 8192,
      temperature: 0.1,
    });
    pdfText = (pdfText ?? "").trim();
    console.log(`${tag} PDF inline extracted: ${pdfText.length} chars`);
    if (pdfText.length > normalText.length) {
      return { text: pdfText, method: "vision-pdf-inline" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${tag} PDF inline failed: ${msg}`);
  }

  console.warn(
    `${tag} all methods failed, returning normal text (${normalText.length} chars)`
  );
  return { text: normalText, method: "normal-fallback" };
}
