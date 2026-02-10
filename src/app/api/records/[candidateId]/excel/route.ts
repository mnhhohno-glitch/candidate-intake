import { NextRequest, NextResponse } from "next/server";
import { getCachedExcelPath } from "@/lib/recordsStore";
import fs from "fs/promises";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    const filePath = await getCachedExcelPath(candidateId);
    if (!filePath) {
      return NextResponse.json(
        { error: "No cached Excel for this candidate" },
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
    console.error("[api/records/[candidateId]/excel] GET error:", e);
    return NextResponse.json(
      { error: "Failed to get Excel" },
      { status: 500 }
    );
  }
}
