import { NextRequest, NextResponse } from "next/server";
import { getRecord, deleteRecord, addOrUpdateRecord, updateRecordQuestionText } from "@/lib/recordsStore";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    const record = await getRecord(candidateId);
    if (!record) {
      return NextResponse.json(
        { error: "Record not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(record);
  } catch (e) {
    console.error("[api/records/[candidateId]] GET error:", e);
    return NextResponse.json(
      { error: "Failed to get record" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    const body = await request.json();
    const candidateName = body.candidateName != null ? String(body.candidateName) : undefined;
    const careerAdvisor = body.careerAdvisor != null ? String(body.careerAdvisor) : undefined;
    const questionText = body.questionText != null ? String(body.questionText) : undefined;
    const existing = await getRecord(candidateId);
    if (!existing) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    await addOrUpdateRecord({
      candidateId,
      candidateName: candidateName ?? existing.candidateName,
      careerAdvisor: careerAdvisor ?? existing.careerAdvisor,
    });
    if (questionText !== undefined) {
      await updateRecordQuestionText(candidateId, questionText);
    }
    const record = await getRecord(candidateId);
    return NextResponse.json(record!);
  } catch (e) {
    console.error("[api/records/[candidateId]] PATCH error:", e);
    return NextResponse.json(
      { error: "Failed to update record" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    await deleteRecord(candidateId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/records/[candidateId]] DELETE error:", e);
    return NextResponse.json(
      { error: "Failed to delete record" },
      { status: 500 }
    );
  }
}
