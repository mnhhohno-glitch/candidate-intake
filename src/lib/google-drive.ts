import { google } from "googleapis";

function getAuth() {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません");
  }
  const credentials = JSON.parse(serviceAccountKey);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

/**
 * Google Drive からファイルをダウンロード（メタデータ + コンテンツ）
 */
export async function downloadFileFromDrive(
  fileId: string
): Promise<{ name: string; mimeType: string; base64: string; size: number }> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const metaResponse = await drive.files.get({
    fileId,
    fields: "name,mimeType,size",
    supportsAllDrives: true,
  });
  const name = metaResponse.data.name || "unknown";
  const mimeType = metaResponse.data.mimeType || "application/octet-stream";

  const contentResponse = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );

  const buffer = Buffer.from(contentResponse.data as ArrayBuffer);
  return {
    name,
    mimeType,
    base64: buffer.toString("base64"),
    size: buffer.length,
  };
}
