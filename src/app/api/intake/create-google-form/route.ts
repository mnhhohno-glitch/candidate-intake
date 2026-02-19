import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecordFormUrls, updateRecordStatus } from "@/lib/recordsStore";

const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL ?? "";
const GAS_INVOKE_TOKEN = process.env.GAS_INVOKE_TOKEN ?? "";

/**
 * 質問文テキスト（candidate_question_text_only）をGASに送り、
 * Googleフォーム実体を作成して回答URL・編集URLを取得する。
 * 成功時はレコードに formUrl / formEditUrl / formId を保存する。
 */
export async function POST(request: NextRequest) {
  try {
    if (!GAS_WEB_APP_URL) {
      return NextResponse.json(
        {
          error:
            "Googleフォーム作成機能は設定されていません。GAS_WEB_APP_URL を設定してください。",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const candidateId =
      typeof body.candidateId === "string" ? body.candidateId.trim() : "";
    const candidateName =
      typeof body.candidateName === "string" ? body.candidateName.trim() : "";
    const questionText =
      typeof body.questionText === "string" ? body.questionText.trim() : "";

    if (!candidateId || !/^5\d{6}$/.test(candidateId)) {
      return NextResponse.json(
        { error: "candidateId は5から始まる7桁の数字で指定してください。" },
        { status: 400 }
      );
    }
    if (!questionText) {
      return NextResponse.json(
        { error: "questionText は必須です。質問文を生成してからフォームを作成してください。" },
        { status: 400 }
      );
    }

    const existing = await getRecord(candidateId);
    if (!existing) {
      return NextResponse.json(
        { error: "指定された求職者IDのレコードがありません。" },
        { status: 404 }
      );
    }

    const payload = {
      candidateId,
      candidateName: candidateName || existing.candidateName || "",
      questionText,
      token: GAS_INVOKE_TOKEN,
    };

    const blockSepCount = questionText.match(/\n回答[：:]\n?/g)?.length ?? 0;
    const questionBlocksSent = blockSepCount + 1;
    console.log("[create-google-form] sending to GAS candidateId=", candidateId, "questionTextChars=", questionText.length, "questionBlocks=", questionBlocksSent);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000); // 90秒でタイムアウト
    let gasRes: Response;
    try {
      gasRes = await fetch(GAS_WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error("[create-google-form] GAS fetch failed:", msg);
      const isTimeout = msg.includes("abort") || msg.includes("timeout");
      return NextResponse.json(
        {
          error: isTimeout
            ? "Googleフォーム作成の呼び出しがタイムアウトしました。GASの実行時間を確認してください。"
            : "GASへの接続に失敗しました。GAS_WEB_APP_URL とネットワークを確認してください。",
        },
        { status: 502 }
      );
    }
    clearTimeout(timeoutId);

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
      const bodyPreview = raw.slice(0, 800);
      const isLikelyConsent =
        /authorization|許可|consent|Access|アクセスを許可|このアプリへのアクセス/i.test(bodyPreview);
      const hintMessage = isLikelyConsent
        ? "初回に、GASの「デプロイを管理」にあるウェブアプリのURLをブラウザで開き、「アクセスを許可しますか？」と出たら「許可」をクリックしてください。未実施だと502になります。"
        : "GASの「実行数」で失敗時のエラー内容を確認し、Code.gsを最新版にしたうえで「新バージョン」でデプロイし直してください。";
      console.error(
        "[create-google-form] GAS response not JSON. status=%s bodyPreview=%s",
        gasRes.status,
        bodyPreview
      );
      console.error(
        "[create-google-form] 考えられる原因: (1)ウェブアプリURLをブラウザで一度開き許可していない (2)デプロイが古い/別のURLを参照 (3)GAS実行ログで例外確認"
      );
      return NextResponse.json(
        {
          error:
            "Googleフォームの作成に失敗しました。GASがHTMLを返しています。" + hintMessage,
        },
        { status: 502 }
      );
    }

    if (!gasRes.ok || data.error) {
      console.warn("[create-google-form] GAS error:", data.error ?? gasRes.status, raw.slice(0, 500));
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

    await updateRecordFormUrls(candidateId, {
      formUrl: data.responseUrl,
      formEditUrl: typeof data.editUrl === "string" ? data.editUrl : undefined,
      formId: typeof data.formId === "string" ? data.formId : undefined,
    });

    await updateRecordStatus(candidateId, { formStatus: "done", formError: undefined });

    return NextResponse.json({
      formId: data.formId ?? null,
      responseUrl: data.responseUrl,
      editUrl: data.editUrl ?? null,
      shareWarning:
        typeof data.shareWarning === "string" && data.shareWarning
          ? data.shareWarning
          : undefined,
    });
  } catch (e) {
    console.error("[create-google-form] Fatal error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
