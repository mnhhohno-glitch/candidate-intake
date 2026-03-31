import { NextRequest, NextResponse } from "next/server";
import { downloadFileFromDrive } from "@/lib/google-drive";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ error: "ids parameter is required" }, { status: 400 });
  }

  // 環境変数チェック
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません。管理者に問い合わせてください。" },
      { status: 500 }
    );
  }

  const driveFileIds = ids.split(",").filter(Boolean);
  if (driveFileIds.length === 0) {
    return NextResponse.json({ files: [] });
  }

  try {
    const results = await Promise.all(
      driveFileIds.map(async (id) => {
        try {
          return await downloadFileFromDrive(id);
        } catch (e) {
          console.error(`Failed to download drive file ${id}:`, e);
          return null;
        }
      })
    );
    const files = results.filter(Boolean);
    return NextResponse.json({ files });
  } catch (e) {
    console.error("Drive files download error:", e);
    return NextResponse.json(
      { error: "Google Drive からのファイルダウンロードに失敗しました" },
      { status: 500 }
    );
  }
}
