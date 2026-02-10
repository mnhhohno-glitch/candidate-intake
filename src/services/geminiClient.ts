/**
 * Gemini API 呼び出しクライアント
 * 環境変数 GEMINI_API_KEY を使用
 */

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export interface GeminiGenerateParams {
  systemInstruction: string;
  userPrompt: string;
  responseMimeType?: "application/json" | "text/plain";
  responseSchema?: object;
  maxOutputTokens?: number;
}

export async function generateWithGemini(params: GeminiGenerateParams): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "ここにあなたのAPIキー") {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const requestBody = {
    system_instruction: {
      parts: [{ text: params.systemInstruction }],
    },
    contents: [
      {
        parts: [{ text: params.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: params.maxOutputTokens ?? 32768,
      responseMimeType: params.responseMimeType ?? "application/json",
      ...(params.responseSchema && { responseSchema: params.responseSchema }),
    },
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const candidates = data.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error("No response from Gemini");
  }

  const content = candidates[0].content;
  if (!content?.parts?.length) {
    throw new Error("Invalid response structure from Gemini");
  }

  const text = content.parts[0].text;
  if (typeof text !== "string") {
    throw new Error("Empty response from Gemini");
  }

  return text;
}

/**
 * JSON応答をパース。マークダウンコードブロック・前後の説明文を除去してパース
 */
export function parseJsonResponse<T = unknown>(raw: string): T {
  let cleaned = raw.trim();
  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const slice = cleaned.slice(firstBrace, lastBrace + 1);
      return JSON.parse(slice) as T;
    }
    throw new Error("Response is not valid JSON");
  }
}
