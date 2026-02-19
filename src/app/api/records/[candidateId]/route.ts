import { NextRequest, NextResponse } from "next/server";
import { getRecord, deleteRecord, addOrUpdateRecord, updateRecordQuestionText, updateRecordStatus } from "@/lib/recordsStore";

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
    const analysisStatus = body.analysisStatus as string | undefined;
    const analysisError = body.analysisError as string | undefined;
    const formStatus = body.formStatus as string | undefined;
    const formError = body.formError as string | undefined;
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
    if (analysisStatus || analysisError || formStatus || formError) {
      await updateRecordStatus(candidateId, {
        analysisStatus: analysisStatus as "not_started" | "in_progress" | "done" | "error" | undefined,
        analysisError,
        formStatus: formStatus as "not_started" | "in_progress" | "done" | "error" | undefined,
        formError,
      });
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
