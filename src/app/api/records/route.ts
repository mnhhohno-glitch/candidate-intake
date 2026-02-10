import { NextRequest, NextResponse } from "next/server";
import { listRecords, addOrUpdateRecord } from "@/lib/recordsStore";

export async function GET() {
  try {
    const records = await listRecords();
    return NextResponse.json({ records });
  } catch (e) {
    console.error("[api/records] GET error:", e);
    return NextResponse.json(
      { error: "Failed to list records" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { candidateId, candidateName, careerAdvisor } = body;
    if (!candidateId || typeof candidateName !== "string" || typeof careerAdvisor !== "string") {
      return NextResponse.json(
        { error: "candidateId, candidateName, careerAdvisor are required" },
        { status: 400 }
      );
    }
    await addOrUpdateRecord({
      candidateId: String(candidateId).trim(),
      candidateName: String(candidateName).trim(),
      careerAdvisor: String(careerAdvisor).trim(),
    });
    const records = await listRecords();
    return NextResponse.json({ records });
  } catch (e) {
    console.error("[api/records] POST error:", e);
    return NextResponse.json(
      { error: "Failed to add record" },
      { status: 500 }
    );
  }
}
