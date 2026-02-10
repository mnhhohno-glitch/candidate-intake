import { NextRequest, NextResponse } from "next/server";
import { updateRecordCache } from "@/lib/recordsStore";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    const formData = await request.formData();
    const summaryStr = formData.get("attachmentSummary");
    const excelFile = formData.get("excel") as File | null;
    if (!excelFile || typeof excelFile.arrayBuffer !== "function") {
      return NextResponse.json(
        { error: "excel file is required" },
        { status: 400 }
      );
    }
    let attachmentSummary: { pdfName?: string; interviewLogName?: string; flagListName?: string } = {};
    if (typeof summaryStr === "string") {
      try {
        attachmentSummary = JSON.parse(summaryStr) as typeof attachmentSummary;
      } catch {
        // ignore
      }
    }
    const buffer = Buffer.from(await excelFile.arrayBuffer());
    await updateRecordCache(candidateId, attachmentSummary, buffer);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/records/[candidateId]/cache] POST error:", e);
    return NextResponse.json(
      { error: "Failed to save cache" },
      { status: 500 }
    );
  }
}
