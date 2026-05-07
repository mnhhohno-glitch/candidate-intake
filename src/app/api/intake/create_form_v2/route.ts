/**
 * T-029 新設計 Phase B-2 Part 2: questionsJson から Google フォームを作成するエンドポイント
 *
 * - Phase B-1 の generate_form が出力した questionsJson を受け取り、GAS V2 (CANDIDATE-INTAKE-V2) に転送
 * - GAS V2 が FormApp で実フォームを生成し、formId / responseUrl / editUrl を返す
 * - 既存 create-google-form エンドポイント（V1）は無傷で並列稼働
 */

import { NextRequest, NextResponse } from "next/server";

const GAS_V2_WEB_APP_URL = process.env.GAS_WEB_APP_URL_V2 ?? "";
const GAS_V2_INVOKE_TOKEN = process.env.GAS_INVOKE_TOKEN_V2 ?? "";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let candidateId = "";
  try {
    if (!GAS_V2_WEB_APP_URL) {
      console.error("[create_form_v2] GAS_WEB_APP_URL_V2 is not configured");
      return NextResponse.json(
        { error: "Googleフォーム作成機能（V2）は設定されていません。GAS_WEB_APP_URL_V2 を設定してください。" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
    const questionsJson = body.questionsJson;

    if (!candidateId || !/^5\d{6}$/.test(candidateId)) {
      return NextResponse.json(
        { error: "candidateId は5から始まる7桁の数字で指定してください。" },
        { status: 400 }
      );
    }
    if (!questionsJson || typeof questionsJson !== "object") {
      return NextResponse.json(
        { error: "questionsJson は必須のオブジェクトです（generate_form の出力をそのまま渡してください）。" },
        { status: 400 }
      );
    }

    const sectionsCount = Array.isArray((questionsJson as Record<string, unknown>).sections)
      ? ((questionsJson as { sections: unknown[] }).sections.length)
      : 0;
    console.log(`[create_form_v2] start candidateId=${candidateId} sections=${sectionsCount}`);

    const payload = {
      candidateId,
      questionsJson,
      token: GAS_V2_INVOKE_TOKEN,
    };

    let gasRes: Response;
    try {
      gasRes = await fetch(GAS_V2_WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`[create_form_v2] GAS V2 fetch failed candidateId=${candidateId}: ${msg}`);
      return NextResponse.json(
        { error: "GAS V2 への接続に失敗しました。GAS_WEB_APP_URL_V2 とネットワークを確認してください。", detail: msg },
        { status: 502 }
      );
    }

    const raw = await gasRes.text();
    let data: {
      formId?: string;
      responseUrl?: string;
      editUrl?: string;
      error?: string;
      shareWarning?: string;
    };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      const bodyPreview = raw.slice(0, 500);
      console.error(
        `[create_form_v2] GAS V2 response not JSON candidateId=${candidateId} status=${gasRes.status} bodyPreview=${bodyPreview}`
      );
      const isLikelyConsent =
        /authorization|許可|consent|Access|アクセスを許可|このアプリへのアクセス/i.test(bodyPreview);
      const hint = isLikelyConsent
        ? "GAS V2 のウェブアプリURLをブラウザで一度開き、「アクセスを許可」をクリックしてください。"
        : "GAS V2 の「実行数」で失敗時のエラー内容を確認し、Code.gs を最新版にしたうえで「新バージョン」でデプロイし直してください。";
      return NextResponse.json(
        { error: "Googleフォームの作成に失敗しました。GAS V2 が JSON を返していません。" + hint },
        { status: 502 }
      );
    }

    if (!gasRes.ok || data.error) {
      console.warn(
        `[create_form_v2] GAS V2 error candidateId=${candidateId} status=${gasRes.status} error=${data.error ?? "(none)"}`
      );
      return NextResponse.json(
        { error: data.error ?? "Googleフォームの作成に失敗しました。" },
        { status: 502 }
      );
    }

    if (!data.responseUrl || typeof data.responseUrl !== "string") {
      return NextResponse.json(
        { error: "フォームURLを取得できませんでした。" },
        { status: 502 }
      );
    }

    const latencyMs = Date.now() - startedAt;
    console.log(
      `[create_form_v2] done candidateId=${candidateId} latency_ms=${latencyMs} formId=${data.formId ?? "(none)"}`
    );

    return NextResponse.json({
      candidateId,
      formId: data.formId ?? null,
      responseUrl: data.responseUrl,
      editUrl: data.editUrl ?? null,
      shareWarning:
        typeof data.shareWarning === "string" && data.shareWarning ? data.shareWarning : null,
      latency_ms: latencyMs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[create_form_v2] fatal candidateId=${candidateId} error=${message}`);
    return NextResponse.json(
      { error: "Googleフォーム作成中に予期しないエラーが発生しました。", detail: message },
      { status: 500 }
    );
  }
}
