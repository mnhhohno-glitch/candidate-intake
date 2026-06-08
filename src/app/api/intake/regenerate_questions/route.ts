/**
 * T-054: 指示付き部分再生成エンドポイント
 *
 * 確認画面（portal）で「直したい質問だけチェック＋チャットで指示」して再生成する。
 * 方式 Y: 対象 item のみ Gemini で作り直し、サーバ側で前回 questionsJson にマージする。
 *
 * - 入力: { previousQuestionsJson, instruction, targets: [{ sectionId, itemIndex }] }
 * - 出力: { questionsJson(改訂版), regenerated:[{sectionId,itemIndex}], rejected:[...], latency_ms }
 * - 失敗時は前回 item をそのまま残す（部分/全失敗ともフォーム壊滅させない）。
 *
 * 安全網: 再生成を許可する sectionId はホワイトリストで限定（work_content_N / mindset のみ）。
 *   high_school / qualifications / address / consent / photo / self_pr / work_consciousness 等は不許可。
 *
 * 既存 generate_form / create_form_v2 / questionsJson 型は不変（後方互換）。
 */

import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import {
  isValidQuestionsJson,
  type FormSection,
  type QuestionItem,
  type QuestionItemType,
  type QuestionsJson,
} from "@/types/questionsJson";

const VALID_ITEM_TYPES: ReadonlySet<string> = new Set([
  "short_text",
  "long_text",
  "single_select",
  "multi_select",
  "dropdown",
  "section_header",
]);

/**
 * 再生成を許可する sectionId 判定（ホワイトリスト＝サーバ側二重防御）。
 * - 許可: "mindset"（意識/工夫）, "work_content_<数字>"（会社別の業務内容セクション。その他系の AI 生成質問を含む）
 * - 不許可: high_school / qualifications / address / consent / photo_submission /
 *           self_pr / work_consciousness / work_content_fallback など（固定・個人情報・同意系）
 *
 * 注: questionsJson には「AI生成か固定か」を判別するメタ情報が無い（generate_form は変更不可）。
 *   そのため work_content セクション単位での許可に留め、「その他系のみ」の細かい出し分けは
 *   portal 側（職種コード/ラベルを把握）でチェックボックス表示を制御して担保する。
 */
function isRegenerableSectionId(sectionId: string): boolean {
  return sectionId === "mindset" || /^work_content_\d+$/.test(sectionId);
}

// ---- 改訂版アイテムの構造化出力スキーマ ----

const REVISION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "short_text",
              "long_text",
              "single_select",
              "multi_select",
              "dropdown",
              "section_header",
            ],
          },
          title: { type: "string" },
          help_text: { type: "string" },
          choices: { type: "array", items: { type: "string" } },
          required: { type: "boolean" },
        },
        required: ["type", "title"],
      },
    },
  },
  required: ["items"],
} as const;

// 改訂版アイテムの上限（暴走防止）。
const MAX_REVISED_ITEMS = 20;

/**
 * 指定 item 群を「指示」に沿って書き直すプロンプトを組み立てる。
 * 元の質問の意図・構造を尊重し、最小限の修正にとどめさせる。
 */
function buildItemRevisionPrompt(
  originalItems: QuestionItem[],
  instruction: string,
  contextLabel: string
): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = [
    "あなたは採用ヒアリング用 Google フォームの質問編集の専門家です。",
    "与えられた既存の質問を、ユーザーの指示に沿って書き直します。",
    "原則:",
    "・元の質問の意図・形式・構造を尊重し、指示で求められた範囲の最小限の修正にとどめる。",
    "・指示と無関係な新規質問を勝手に追加しない。",
    "・各質問の type（short_text / long_text / multi_select 等）は、指示で明示的に変更を求められない限り維持する。",
    "・元の質問文に {company.name} 等のプレースホルダーがある場合はそのまま残す。",
    "・help_text 末尾の「※該当しない場合は空白で構いません」等の注意書きは原則維持する。",
    "・選択肢(choices)は multi_select / single_select / dropdown のときのみ設定し、他の type では設定しない。",
    "出力は必ず指定された JSON スキーマに厳密に従い、説明文やマークダウンは一切含めないこと。",
  ].join("\n");

  const userPrompt = [
    `対象セクション: ${contextLabel}`,
    "",
    "## 書き直し指示（ユーザー入力）",
    instruction,
    "",
    "## 書き直し対象の既存質問（この順序・件数を基準に）",
    JSON.stringify(originalItems, null, 2),
    "",
    "## 要件",
    "- 上記の質問を指示に沿って書き直し、items 配列で返してください。",
    "- 通常は元と同じ件数で1問ずつ書き直します。指示で「まとめる/1つに」等とあれば件数を減らし、",
    "  「分ける/追加」等とあれば妥当な範囲で増やしても構いません（最大20件）。",
    "- 各 item は { type, title, help_text, choices, required } の構造。",
    "  - title: 質問文（必須）",
    "  - help_text: 補足（不要なら省略可）",
    "  - choices: 選択式のときのみ文字列配列（それ以外は省略）",
    "  - required: 真偽（不明なら省略可。元の値を踏襲）",
  ].join("\n");

  return { systemInstruction, userPrompt };
}

/**
 * Gemini 出力を検証し、QuestionItem[] に正規化する。
 * 不正（空配列 / type 不正 / title 欠落）は null を返す（セクション単位でフォールバック）。
 */
function validateRevisedItems(obj: unknown): QuestionItem[] | null {
  if (!obj || typeof obj !== "object") return null;
  const rawItems = (obj as Record<string, unknown>).items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;
  if (rawItems.length > MAX_REVISED_ITEMS) return null;

  const items: QuestionItem[] = [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    if (typeof o.type !== "string" || !VALID_ITEM_TYPES.has(o.type)) return null;
    if (typeof o.title !== "string" || !o.title.trim()) return null;

    const type = o.type as QuestionItemType;
    const helpText =
      typeof o.help_text === "string" && o.help_text.trim() ? o.help_text : null;
    let choices: string[] | null = null;
    if (Array.isArray(o.choices)) {
      const cleaned = o.choices.filter(
        (c): c is string => typeof c === "string" && c.trim().length > 0
      );
      choices = cleaned.length > 0 ? cleaned : null;
    }
    const required = typeof o.required === "boolean" ? o.required : null;

    items.push({ type, title: o.title.trim(), help_text: helpText, choices, required });
  }
  return items;
}

/**
 * 対象 item 群を指示で書き直す（Gemini）。失敗時は throw（呼び出し側でフォールバック）。
 */
async function generateItemRevision(
  originalItems: QuestionItem[],
  instruction: string,
  contextLabel: string
): Promise<QuestionItem[]> {
  const { systemInstruction, userPrompt } = buildItemRevisionPrompt(
    originalItems,
    instruction,
    contextLabel
  );
  const raw = await generateWithGemini({
    systemInstruction,
    userPrompt,
    responseMimeType: "application/json",
    responseSchema: REVISION_SCHEMA,
    temperature: 0.2,
    maxOutputTokens: 4096,
  });
  const parsed = parseJsonResponse<unknown>(raw);
  const items = validateRevisedItems(parsed);
  if (!items) {
    throw new Error("revised items validation failed (empty or malformed)");
  }
  return items;
}

/**
 * セクションに改訂版 items を適用する。
 * - 件数が対象 index 数と一致 → 位置を維持して 1:1 置換（並び順を完全保持）
 * - 件数が異なる（統合/分割）→ 対象 index 群を取り除き、最小 index 位置に改訂版を差し込む
 */
function applyRevision(
  section: FormSection,
  sortedTargetIndices: number[],
  revisedItems: QuestionItem[]
): void {
  if (revisedItems.length === sortedTargetIndices.length) {
    sortedTargetIndices.forEach((idx, k) => {
      section.items[idx] = revisedItems[k];
    });
    return;
  }

  const targetSet = new Set(sortedTargetIndices);
  const newItems: QuestionItem[] = [];
  let inserted = false;
  for (let i = 0; i < section.items.length; i++) {
    if (targetSet.has(i)) {
      if (!inserted) {
        newItems.push(...revisedItems);
        inserted = true;
      }
      // 元の対象 item はスキップ（置換）
    } else {
      newItems.push(section.items[i]);
    }
  }
  if (!inserted) newItems.push(...revisedItems);
  section.items = newItems;
}

// ---- 入力型 ----

type RegenTarget = { sectionId: string; itemIndex: number };
type RejectedTarget = RegenTarget & {
  reason: "not_regenerable" | "section_not_found" | "index_out_of_range";
};

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as Record<string, unknown>;

    // ---- previousQuestionsJson ----
    const previousQuestionsJson = body.previousQuestionsJson;
    if (!isValidQuestionsJson(previousQuestionsJson)) {
      return NextResponse.json(
        {
          error:
            "previousQuestionsJson が不正です（generate_form の出力 questionsJson をそのまま渡してください）。",
        },
        { status: 400 }
      );
    }

    // ---- instruction ----
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) {
      return NextResponse.json(
        { error: "instruction（書き直し指示）は必須です。" },
        { status: 400 }
      );
    }

    // ---- targets ----
    const targets: RegenTarget[] = [];
    if (body.targets !== undefined && body.targets !== null) {
      if (!Array.isArray(body.targets)) {
        return NextResponse.json(
          { error: "targets は配列（[{ sectionId, itemIndex }]）で指定してください。" },
          { status: 400 }
        );
      }
      for (const t of body.targets) {
        if (!t || typeof t !== "object") {
          return NextResponse.json(
            { error: "targets の要素は { sectionId, itemIndex } オブジェクトである必要があります。" },
            { status: 400 }
          );
        }
        const tt = t as Record<string, unknown>;
        if (typeof tt.sectionId !== "string" || !tt.sectionId.trim()) {
          return NextResponse.json(
            { error: "targets の sectionId は非空文字列である必要があります。" },
            { status: 400 }
          );
        }
        if (typeof tt.itemIndex !== "number" || !Number.isInteger(tt.itemIndex) || tt.itemIndex < 0) {
          return NextResponse.json(
            { error: "targets の itemIndex は 0 以上の整数である必要があります。" },
            { status: 400 }
          );
        }
        targets.push({ sectionId: tt.sectionId, itemIndex: tt.itemIndex });
      }
    }

    // ---- ベースを deep copy（維持質問はここを一切触らない）----
    const result: QuestionsJson = JSON.parse(
      JSON.stringify(previousQuestionsJson)
    ) as QuestionsJson;
    const sectionById = new Map<string, FormSection>(
      result.sections.map((s) => [s.id, s])
    );

    // ---- targets 空 + instruction あり → ホワイトリスト全 item に展開（全体指示）----
    let effectiveTargets = targets;
    if (effectiveTargets.length === 0) {
      effectiveTargets = [];
      for (const s of result.sections) {
        if (isRegenerableSectionId(s.id)) {
          s.items.forEach((_, idx) =>
            effectiveTargets.push({ sectionId: s.id, itemIndex: idx })
          );
        }
      }
    }

    // ---- 検証・ホワイトリストで仕分け ----
    const rejected: RejectedTarget[] = [];
    const bySection = new Map<string, Set<number>>();
    for (const t of effectiveTargets) {
      if (!isRegenerableSectionId(t.sectionId)) {
        rejected.push({ ...t, reason: "not_regenerable" });
        continue;
      }
      const sec = sectionById.get(t.sectionId);
      if (!sec) {
        rejected.push({ ...t, reason: "section_not_found" });
        continue;
      }
      if (t.itemIndex < 0 || t.itemIndex >= sec.items.length) {
        rejected.push({ ...t, reason: "index_out_of_range" });
        continue;
      }
      if (!bySection.has(t.sectionId)) bySection.set(t.sectionId, new Set());
      bySection.get(t.sectionId)!.add(t.itemIndex);
    }

    console.log(
      `[regenerate_questions] start sections=${bySection.size} targets=${effectiveTargets.length} ` +
        `rejected=${rejected.length} instructionChars=${instruction.length}`
    );

    // ---- セクション単位で並列に再生成し、改訂版をマージ ----
    const regenerated: RegenTarget[] = [];
    await Promise.all(
      [...bySection.entries()].map(async ([sectionId, idxSet]) => {
        const sec = sectionById.get(sectionId)!;
        const sortedIdx = [...idxSet].sort((a, b) => a - b);
        const originalItems = sortedIdx.map((i) => sec.items[i]);
        try {
          const started = Date.now();
          const revised = await generateItemRevision(originalItems, instruction, sec.header);
          applyRevision(sec, sortedIdx, revised);
          sortedIdx.forEach((i) => regenerated.push({ sectionId, itemIndex: i }));
          console.log(
            `[regenerate_questions] section="${sectionId}" revised OK ` +
              `targets=${sortedIdx.length} newItems=${revised.length} latency_ms=${Date.now() - started}`
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(
            `[regenerate_questions] section="${sectionId}" revise FAILED → keep original. error=${msg}`
          );
          // フォールバック: 何もしない（前回 item をそのまま維持）
        }
      })
    );

    // ---- 最終構造ガード（万一壊れていたら前回 JSON をそのまま返す）----
    let finalJson: QuestionsJson = result;
    let finalRegenerated = regenerated;
    if (!isValidQuestionsJson(finalJson)) {
      console.error(
        "[regenerate_questions] result became invalid after merge → returning previous as-is"
      );
      finalJson = previousQuestionsJson as QuestionsJson;
      finalRegenerated = [];
    }

    const latencyMs = Date.now() - startedAt;
    console.log(
      `[regenerate_questions] done regenerated=${finalRegenerated.length} latency_ms=${latencyMs}`
    );

    return NextResponse.json({
      questionsJson: finalJson,
      regenerated: finalRegenerated,
      rejected,
      latency_ms: latencyMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[regenerate_questions] fatal error=${msg}`);
    return NextResponse.json(
      { error: "質問の再生成中に予期しないエラーが発生しました。", detail: msg },
      { status: 500 }
    );
  }
}
