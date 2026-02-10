import { NextRequest, NextResponse } from "next/server";
import { deleteRecords } from "@/lib/recordsStore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const candidateIds = body.candidateIds;
    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return NextResponse.json(
        { error: "candidateIds array is required" },
        { status: 400 }
      );
    }
    const ids = candidateIds.map((id: unknown) => String(id));
    await deleteRecords(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/records/bulk-delete] POST error:", e);
    return NextResponse.json(
      { error: "Failed to delete records" },
      { status: 500 }
    );
  }
}
