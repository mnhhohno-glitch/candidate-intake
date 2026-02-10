import { NextRequest, NextResponse } from "next/server";
import { getCachedExcelPath } from "@/lib/recordsStore";
import fs from "fs/promises";

const isNotFound = (e: unknown) =>
  e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    const filePath = await getCachedExcelPath(candidateId);
    if (!filePath) {
      return NextResponse.json(
        { error: "キャッシュにExcelがありません。再出力するには、詳細画面でファイルを投入し「出力開始」を実行してください。" },
        { status: 404 }
      );
    }
    const buf = await fs.readFile(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="再出力_${candidateId}.xlsx"`,
      },
    });
  } catch (e) {
    if (isNotFound(e)) {
      return NextResponse.json(
        { error: "キャッシュにExcelがありません。再デプロイで消えた場合があります。詳細画面で再度「出力開始」を実行してください。" },
        { status: 404 }
      );
    }
    console.error("[api/records/[candidateId]/excel] GET error:", e);
    return NextResponse.json(
      { error: "Failed to get Excel" },
      { status: 500 }
    );
  }
}
