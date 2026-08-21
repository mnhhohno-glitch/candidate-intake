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

/** 診断メッセージに載せる本文の最大文字数 */
const RAW_PREVIEW_LIMIT = 1200;

/**
 * 診断メッセージに出す前に機微情報を伏せる。
 * 求職者の氏名・質問文は portal 画面に元々出ている情報なのでマスク対象外。
 */
function maskSensitive(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***MASKED***")
    .replace(
      /\b([A-Za-z0-9_-]*(?:key|token|secret|password))(\s*[=:]\s*"?)([^\s"'&,;}\]]+)/gi,
      "$1$2***MASKED***"
    )
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "***MASKED_EMAIL***");
}

/**
 * GAS V2 の応答を1行の診断文字列にまとめる。
 * ステータス / content-type / リダイレクト後URL / 本文先頭を含む。
 */
function describeGasResponse(gasRes: Response, raw: string): string {
  const contentType = gasRes.headers.get("content-type") ?? "(none)";
  const collapsed = maskSensitive(raw).replace(/\s*[\r\n]+\s*/g, " ").trim();
  const bodyPreview = collapsed ? collapsed.slice(0, RAW_PREVIEW_LIMIT) : "(empty)";
  const truncated = collapsed.length > RAW_PREVIEW_LIMIT ? `...(+${collapsed.length - RAW_PREVIEW_LIMIT}文字)` : "";

  const parts = [`status=${gasRes.status}`, `content-type=${contentType}`];
  if (gasRes.redirected && gasRes.url) {
    parts.push(`finalUrl=${maskSensitive(gasRes.url)}`);
  }
  parts.push(`bodyPreview=${bodyPreview}${truncated}`);
  return parts.join(" ");
}

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
      const diagnostic = describeGasResponse(gasRes, raw);
      console.error(
        `[create_form_v2] GAS V2 response not JSON candidateId=${candidateId} ${diagnostic}`
      );
      const isLikelyConsent =
        /authorization|許可|consent|Access|アクセスを許可|このアプリへのアクセス/i.test(raw.slice(0, RAW_PREVIEW_LIMIT));
      const hint = isLikelyConsent
        ? "GAS V2 のウェブアプリURLをブラウザで一度開き、「アクセスを許可」をクリックしてください。"
        : "GAS V2 の「実行数」で失敗時のエラー内容を確認し、Code.gs を最新版にしたうえで「新バージョン」でデプロイし直してください。";
      return NextResponse.json(
        {
          error:
            "Googleフォームの作成に失敗しました。GAS V2 が JSON を返していません。" +
            hint +
            " [GAS応答] " +
            diagnostic,
          detail: diagnostic,
        },
        { status: 502 }
      );
    }

    if (!gasRes.ok || data?.error) {
      console.warn(
        `[create_form_v2] GAS V2 error candidateId=${candidateId} status=${gasRes.status} error=${data?.error ?? "(none)"}`
      );
      return NextResponse.json(
        { error: data?.error ?? "Googleフォームの作成に失敗しました。" },
        { status: 502 }
      );
    }

    // JSON パースには成功したが期待するキーが無いケースも、生の応答を残して原因を追えるようにする
    if (!data || typeof data !== "object" || !data.responseUrl || typeof data.responseUrl !== "string") {
      const diagnostic = describeGasResponse(gasRes, raw);
      console.error(
        `[create_form_v2] GAS V2 response missing responseUrl candidateId=${candidateId} ${diagnostic}`
      );
      return NextResponse.json(
        {
          error: "フォームURLを取得できませんでした。GAS V2 の応答に responseUrl がありません。 [GAS応答] " + diagnostic,
          detail: diagnostic,
        },
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
