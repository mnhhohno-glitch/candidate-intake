/**
 * T-029 新設計 Phase B-1.5: 業種別質問テンプレ + 動的展開
 *
 * - specs/generate_form_prompt.yaml から決定論的に questionsJson を組み立てる（Gemini 呼び出しなし）
 * - resumeData.qualifications で資格を個別質問展開
 * - resumeData.work_history で会社ごとに業務内容セクションを動的展開
 * - 21 サブカテゴリの担当業務 11 + Other / 工夫 11 + Other / 業界別 KPI 3-5 質問を展開
 * - 出力スキーマは Phase B-1 と互換（candidate_name + greeting + sections=[{id, header, items}]）
 *   → GAS V2（Phase B-2 で稼働確認済み）と継続して連携可能
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseJsonResponse } from "@/services/geminiClient";
import {
  isValidQuestionsJson,
  type FormSection,
  type QuestionItem,
  type QuestionItemType,
  type QuestionsJson,
} from "@/types/questionsJson";
import type { ResumeData, WorkHistoryItem } from "@/types/resumeData";

const SPEC_FILENAME = "generate_form_prompt.yaml";

// ---- spec 型 ----

type SpecItem = {
  title: string;
  help_text?: string;
  type: QuestionItemType;
  choices?: string[];
  required?: boolean;
};

type SpecCommonHighSchool = {
  section_title: string;
  items: SpecItem[];
};

type SpecCommonQualifications = {
  section_title: string;
  dynamic_per_qualification: SpecItem;
  additional: SpecItem;
};

type SpecCommonAddress = {
  section_title: string;
  items: SpecItem[];
};

type SpecWorkContent = {
  section_title: string;
  dynamic_per_company: {
    company_header: { title_template: string };
    placement_info: SpecItem[];
    duties_check: {
      title: string;
      help_text?: string;
      type: QuestionItemType;
      choices_ref: string;
      include_other?: boolean;
      required?: boolean;
    };
    kpi_questions_ref: string;
    notable_work: SpecItem;
  };
};

type SpecMindset = {
  section_title: string;
  mindset_check: {
    title: string;
    help_text?: string;
    type: QuestionItemType;
    choices_ref: string;
    include_other?: boolean;
    required?: boolean;
  };
  mindset_episode: SpecItem;
};

type SpecGenericSection = {
  section_title: string;
  items: SpecItem[];
};

type SpecSubcategory = {
  label: string;
  duties_choices: string[];
  mindset_choices: string[];
  kpi_questions: SpecItem[];
};

type GenerateFormSpec = {
  version?: string;
  greeting: { title: string; description: string; body: string };
  common_sections: {
    high_school: SpecCommonHighSchool;
    qualifications: SpecCommonQualifications;
    address: SpecCommonAddress;
  };
  work_content_section: SpecWorkContent;
  mindset_section: SpecMindset;
  generic_sections: {
    work_consciousness: SpecGenericSection;
    self_pr: SpecGenericSection;
    photo_submission: SpecGenericSection;
    consent: SpecGenericSection;
  };
  subcategories: Record<string, SpecSubcategory>;
  section_order: string[];
};

function loadSpec(): GenerateFormSpec {
  const specPath = path.join(process.cwd(), "specs", SPEC_FILENAME);
  const raw = fs.readFileSync(specPath, "utf8");
  return yaml.load(raw) as GenerateFormSpec;
}

// ---- 入出力型 ----

type GenerateFormInput = {
  candidateId: string;
  candidateName: string;
  resumeData: ResumeData;
  interviewLog: string;
  achievementCategory: string;
  achievementCategoryOtherLabel: string | null;
  /**
   * 会社別 subcategory マップ（T-035: 業界混在対応、後方互換 optional）
   * - キー: work_history 配列インデックスの文字列（例: "0", "1", "2"）
   * - 値: subcategory コード（例: "sales_corporate", "office_general", "other"）
   * - 未指定 / 空 / 該当キー無し → achievementCategory にフォールバック
   */
  companyCategoryMap?: Record<string, string>;
  /**
   * 会社別 自由記入ラベルマップ（T-052: その他系の会社別ラベル対応、後方互換 optional）
   * - キー: work_history 配列インデックスの文字列（"0", "1", "2"）
   * - 値: その会社の「何の◯◯か」を表す自由記入ラベル（例: "特許事務", "法務事務"）
   * - 対象コード（OTHER_TYPE_CODES: other / office_other / planning_other / care_other）の会社にのみ
   *   反映される。それ以外のコードでは無視。
   * - 該当キー無し → 従来通り（"other" のときのみ achievementCategoryOtherLabel にフォールバック）
   */
  companyCategoryLabelMap?: Record<string, string>;
};

// 対象コード（自由記入ラベルを見出しに反映する subcategory コード）
const OTHER_TYPE_CODES: ReadonlySet<string> = new Set([
  "other",
  "office_other",
  "planning_other",
  "care_other",
]);

function isOtherTypeCode(code: string): boolean {
  return OTHER_TYPE_CODES.has(code);
}

const OTHER_OPTION_LABEL = "その他（自由記述）";

// "other" 仮対応用の汎用フォールバック（Phase B-3 以降で Gemini 動的生成に置換）
const OTHER_FALLBACK: SpecSubcategory = {
  label: "その他",
  duties_choices: [
    "顧客・利用者対応",
    "資料・書類の作成",
    "データ入力・集計",
    "電話・メール対応",
    "在庫・備品管理",
    "業務マニュアル作成",
    "後輩・新人指導",
    "業務改善・効率化提案",
    "関係部署との連携・調整",
    "会議・打ち合わせ参加",
    "報告書・議事録の作成",
  ],
  mindset_choices: [
    "正確性を最優先する",
    "期日・締め切りを厳守する",
    "業務効率化のための工夫",
    "チーム内での情報共有",
    "丁寧なコミュニケーション",
    "ミス防止のためのダブルチェック",
    "業務マニュアルの整備",
    "自己研鑽・スキルアップ",
    "コスト意識を持って業務遂行",
    "整理整頓・書類管理の徹底",
    "報連相を徹底する",
  ],
  kpi_questions: [
    {
      title: "{company.name}での月間処理件数・対応件数を教えてください",
      help_text: "数値のみで入力してください。例：100\n※該当しない場合は空白で構いません",
      type: "short_text",
      required: false,
    },
    {
      title: "{company.name}で関わった同僚・関係者の人数規模を教えてください",
      help_text: "数値のみで入力してください。例：20\n※該当しない場合は空白で構いません",
      type: "short_text",
      required: false,
    },
    {
      title: "{company.name}で行った業務改善・工夫があれば教えてください",
      help_text: "改善前→改善後を具体的にお聞かせください。\n※該当しない場合は空白で構いません",
      type: "long_text",
      required: false,
    },
  ],
};

// "other" 選択時の SpecSubcategory を構築する。
// otherLabel が与えられた場合は label にだけ差し込む（duties/mindset/kpi 内容は OTHER_FALLBACK と同一）。
function buildOtherSubcategory(otherLabel: string | null): SpecSubcategory {
  const trimmed = otherLabel && otherLabel.trim() ? otherLabel.trim() : "";
  return {
    ...OTHER_FALLBACK,
    label: trimmed ? `その他（${trimmed}）` : OTHER_FALLBACK.label,
  };
}

// =============================================================================
// T-053: その他系の質問を Gemini で動的生成
// =============================================================================

/**
 * 動的生成の出力スキーマ（Gemini responseSchema 用）。
 * duties_choices: string[] / mindset_choices: string[] / kpi_questions: SpecItem[]
 */
const DYNAMIC_SUBCATEGORY_SCHEMA = {
  type: "object",
  properties: {
    duties_choices: { type: "array", items: { type: "string" } },
    mindset_choices: { type: "array", items: { type: "string" } },
    kpi_questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          help_text: { type: "string" },
          type: { type: "string", enum: ["short_text", "long_text"] },
          required: { type: "boolean" },
        },
        required: ["title", "type"],
      },
    },
  },
  required: ["duties_choices", "mindset_choices", "kpi_questions"],
} as const;

/**
 * 動的生成用プロンプトを組み立てる。
 * 既存サブカテゴリ（営業事務）の件数・書式・トーンを few-shot として提示し、
 * 指定職種に合わせて作り直すよう指示する。
 */
function buildDynamicSubcategoryPrompt(
  label: string,
  parentCategoryLabel: string
): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = [
    "あなたは人材紹介会社の質問フォーム設計の専門家であり、各職種の実務に精通しています。",
    "求職者の職務経歴ヒアリング用に、指定された職種「ならでは」の専門的な質問テンプレートを作成します。",
    "重要: 備品管理・電話対応・データ入力・来客対応 等のどの事務職でも共通する汎用作業は避け、",
    "その職種に固有の専門業務・専門用語・専門的なKPIを中心に構成してください。",
    "出力は必ず指定された JSON スキーマに厳密に従ってください。説明文やマークダウンは一切含めないでください。",
  ].join("\n");

  // few-shot 例（営業事務）。書式・件数・トーンの参考。内容は職種に合わせて作り直させる。
  const example = {
    duties_choices: [
      "受発注処理・データ入力",
      "見積書・請求書・契約書の作成",
      "在庫管理・納期管理",
      "顧客からの電話・メール対応",
      "営業担当のサポート（資料作成・スケジュール調整）",
      "売上・売掛金・買掛金の管理",
      "取引先との納品・検収調整",
      "各種帳票・伝票の管理・整理",
      "システム入力・データ集計（Excel/基幹システム）",
      "議事録・会議資料の作成",
      "来客対応・備品管理",
    ],
    mindset_choices: [
      "正確性を最優先に処理ミスを防ぐ",
      "業務効率化のためのフォーマット整備・テンプレ化",
      "営業担当のスケジュール・進捗を先回りで把握する",
      "顧客対応では迅速・丁寧を徹底する",
      "期日・納期管理を徹底する",
      "システム・Excel 等のスキルを継続的に向上させる",
      "チーム内で業務情報を共有し属人化を防ぐ",
      "取引先との関係構築・継続的なコミュニケーション",
      "コスト意識を持って業務遂行する",
      "ミス防止のためのダブルチェック",
      "後輩・新人への業務マニュアル整備・引継ぎ",
    ],
    kpi_questions: [
      {
        title: "{company.name}での月間処理件数を教えてください",
        help_text:
          "受発注・伝票処理・データ入力等の月間件数を数値で入力してください。例：200\n※該当しない場合は空白で構いません",
        type: "short_text",
        required: false,
      },
      {
        title: "{company.name}で行った業務効率化の実績があれば教えてください",
        help_text:
          "例：月20時間の削減、Excelマクロ化で処理時間50%短縮 等\n※該当しない場合は空白で構いません",
        type: "long_text",
        required: false,
      },
    ],
  };

  const userPrompt = [
    `対象の職種: 「${label}」`,
    `（参考: 大分類は「${parentCategoryLabel}」だが、必ず具体的な職種「${label}」に特化させること）`,
    "",
    `あなたは「${label}」の実務に精通した専門家です。この職種「ならでは」の、`,
    `他の職種では出てこないような専門的な業務・知識・実績を引き出す質問テンプレートを作成してください。`,
    "",
    "## 要件",
    `1. duties_choices: 「${label}」に固有の専門的な業務内容の選択肢をちょうど11個。`,
    "   各項目は簡潔な名詞句。その職種特有の専門用語・専門工程を積極的に使うこと。",
    "   （例えば特許事務なら「特許出願書類の作成・提出」「中間処理（拒絶理由対応）の補助」「年金・期限管理」等）",
    `2. mindset_choices: 「${label}」で意識・工夫すべきことの選択肢をちょうど11個。各項目は簡潔な句。`,
    `3. kpi_questions: 「${label}」の実績・数値・専門性を引き出す質問を3〜5個。各質問は以下の構造:`,
    "   - title: 質問文。会社名を差し込む箇所は必ず {company.name} というプレースホルダーを使う（例：「{company.name}での年間出願件数を教えてください」）",
    "   - help_text: 記入例を含む補足。末尾に必ず「※該当しない場合は空白で構いません」を付ける",
    '   - type: 数値・短い回答は "short_text"、自由記述・エピソードは "long_text"',
    "   - required: 必ず false",
    "",
    "## 禁止事項",
    "・「備品管理」「電話対応」「データ入力」「来客対応」「郵便物の仕分け」等、どの事務職にも当てはまる汎用作業を中心にしないこと。",
    "・下記の営業事務の例の内容をそのまま流用しないこと（形式のみ参考）。",
    "",
    "## 形式参考（営業事務の例。JSON の構造・件数・文体のみ参考にし、内容は必ず対象職種向けに作り直すこと）",
    JSON.stringify(example, null, 2),
  ].join("\n");

  return { systemInstruction, userPrompt };
}

/**
 * Gemini 出力を検証し、SpecSubcategory の中身（duties/mindset/kpi）に正規化する。
 * 不正・空配列・要素欠落は null を返す（呼び出し側でフォールバック）。
 */
function validateDynamicSubcategory(obj: unknown): {
  duties_choices: string[];
  mindset_choices: string[];
  kpi_questions: SpecItem[];
} | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const dutiesRaw = o.duties_choices;
  const mindsetRaw = o.mindset_choices;
  const kpisRaw = o.kpi_questions;
  if (!Array.isArray(dutiesRaw) || !Array.isArray(mindsetRaw) || !Array.isArray(kpisRaw)) {
    return null;
  }

  const duties = dutiesRaw.filter(
    (d): d is string => typeof d === "string" && d.trim().length > 0
  );
  const mindset = mindsetRaw.filter(
    (m): m is string => typeof m === "string" && m.trim().length > 0
  );
  if (duties.length === 0 || mindset.length === 0) return null;

  const kpis: SpecItem[] = [];
  for (const k of kpisRaw) {
    if (!k || typeof k !== "object") continue;
    const kk = k as Record<string, unknown>;
    if (typeof kk.title !== "string" || !kk.title.trim()) continue;
    const type: QuestionItemType = kk.type === "long_text" ? "long_text" : "short_text";
    kpis.push({
      title: kk.title.trim(),
      help_text: typeof kk.help_text === "string" && kk.help_text.trim() ? kk.help_text : undefined,
      type,
      required: false,
    });
  }
  if (kpis.length === 0) return null;

  return { duties_choices: duties, mindset_choices: mindset, kpi_questions: kpis };
}

/**
 * 指定職種ラベルから Gemini で SpecSubcategory を動的生成する。
 * 失敗（API エラー / タイムアウト / 不正 JSON / バリデーション失敗）時は throw。
 * 呼び出し側で固定フォールバックに切り替える。
 */
async function generateDynamicSubcategory(
  label: string,
  parentCategoryLabel: string
): Promise<SpecSubcategory> {
  const { systemInstruction, userPrompt } = buildDynamicSubcategoryPrompt(label, parentCategoryLabel);
  const raw = await generateWithGemini({
    systemInstruction,
    userPrompt,
    responseMimeType: "application/json",
    responseSchema: DYNAMIC_SUBCATEGORY_SCHEMA,
    temperature: 0.3,
    maxOutputTokens: 4096,
  });
  const parsed = parseJsonResponse<unknown>(raw);
  const validated = validateDynamicSubcategory(parsed);
  if (!validated) {
    throw new Error("dynamic subcategory validation failed (empty or malformed)");
  }
  return {
    label: `${parentCategoryLabel}（${label}）`,
    duties_choices: validated.duties_choices,
    mindset_choices: validated.mindset_choices,
    kpi_questions: validated.kpi_questions,
  };
}

/**
 * 会社別 subcategory の「解決プラン」。動的生成が必要な場合は dynamic に記述子を持つ。
 * subcategory は固定フォールバック（動的生成成功時は cache の生成結果で置換される）。
 */
type CompanySubcategoryPlan = {
  subcategory: SpecSubcategory;
  resolvedCode: string;
  source: "map" | "default";
  appliedLabel: string | null;
  /** 動的生成が必要なときの記述子。cacheKey で会社横断にキャッシュ・集約する。 */
  dynamic: { cacheKey: string; label: string; parentLabel: string } | null;
};

/**
 * 会社別 subcategory の解決プランを作る（同期）。T-035 / T-052 / T-053。
 * - companyCategoryMap に該当インデックスがあればそれを使う
 * - 値が "other" → buildOtherSubcategory(会社別ラベル or 全社共通 otherLabel)
 * - 対象コード（OTHER_TYPE_CODES）かつラベル非空 → 固定フォールバックを subcategory に、
 *   dynamic 記述子（cacheKey/label/parentLabel）を付与（後段で Gemini 生成 or フォールバック）
 * - 値が未知のコード → 警告ログを出して defaultSubcategory にフォールバック
 * - 該当キーが無い / マップ自体が undefined → defaultSubcategory にフォールバック
 *
 * appliedLabel は会社別自由記入ラベルが反映された場合のみ非 null（見出し織り込み用）。
 */
function planCompanySubcategory(
  index: number,
  companyCategoryMap: Record<string, string> | undefined,
  companyCategoryLabelMap: Record<string, string> | undefined,
  spec: GenerateFormSpec,
  otherLabel: string | null,
  defaultSubcategory: SpecSubcategory
): CompanySubcategoryPlan {
  const key = String(index);
  const code = companyCategoryMap?.[key];
  const rawCompanyLabel = companyCategoryLabelMap?.[key];
  const companyLabel =
    typeof rawCompanyLabel === "string" && rawCompanyLabel.trim() ? rawCompanyLabel.trim() : null;

  if (!code) {
    return {
      subcategory: defaultSubcategory,
      resolvedCode: "(default)",
      source: "default",
      appliedLabel: null,
      dynamic: null,
    };
  }

  if (code === "other") {
    // 会社別ラベルがあればそれを優先、なければ全社共通 otherLabel にフォールバック
    const rawEffective = companyLabel ?? otherLabel;
    const effectiveLabel = rawEffective && rawEffective.trim() ? rawEffective.trim() : null;
    return {
      subcategory: buildOtherSubcategory(effectiveLabel),
      resolvedCode: "other",
      source: "map",
      appliedLabel: effectiveLabel,
      dynamic: effectiveLabel
        ? { cacheKey: `other::${effectiveLabel}`, label: effectiveLabel, parentLabel: "その他" }
        : null,
    };
  }

  const sub = spec.subcategories[code];
  if (!sub) {
    console.warn(
      `[generate_form] Unknown subcategory code "${code}" at index ${index}, falling back to default`
    );
    return {
      subcategory: defaultSubcategory,
      resolvedCode: "(default)",
      source: "default",
      appliedLabel: null,
      dynamic: null,
    };
  }

  // その他系コード + 会社別ラベルあり → 固定フォールバックを relabel し、動的生成を予約
  if (companyLabel && isOtherTypeCode(code)) {
    return {
      subcategory: { ...sub, label: `${sub.label}（${companyLabel}）` },
      resolvedCode: code,
      source: "map",
      appliedLabel: companyLabel,
      dynamic: { cacheKey: `${code}::${companyLabel}`, label: companyLabel, parentLabel: sub.label },
    };
  }

  return {
    subcategory: sub,
    resolvedCode: code,
    source: "map",
    appliedLabel: null,
    dynamic: null,
  };
}

/**
 * dynamic 記述子のユニークキー群を並列生成し、cache に充填する。
 * 失敗したキーは fallback（プラン内の固定 subcategory）を cache に格納する（再試行抑制）。
 * 同一 cacheKey は1回のみ生成（複数社で同じ職種ラベル → Gemini 呼び出し1回に集約）。
 */
async function fillDynamicCache(
  plans: CompanySubcategoryPlan[],
  cache: Map<string, SpecSubcategory>
): Promise<void> {
  // ユニークな生成要求を集約（cacheKey → {label, parentLabel, fallback}）
  const requests = new Map<string, { label: string; parentLabel: string; fallback: SpecSubcategory }>();
  for (const p of plans) {
    if (p.dynamic && !cache.has(p.dynamic.cacheKey) && !requests.has(p.dynamic.cacheKey)) {
      requests.set(p.dynamic.cacheKey, {
        label: p.dynamic.label,
        parentLabel: p.dynamic.parentLabel,
        fallback: p.subcategory,
      });
    }
  }
  if (requests.size === 0) return;

  await Promise.all(
    [...requests.entries()].map(async ([cacheKey, req]) => {
      try {
        const started = Date.now();
        const gen = await generateDynamicSubcategory(req.label, req.parentLabel);
        cache.set(cacheKey, gen);
        console.log(
          `[generate_form] dynamic gen OK key="${cacheKey}" latency_ms=${Date.now() - started} ` +
            `duties=${gen.duties_choices.length} mindset=${gen.mindset_choices.length} kpi=${gen.kpi_questions.length}`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[generate_form] dynamic gen FAILED key="${cacheKey}" → fallback. error=${msg}`);
        cache.set(cacheKey, req.fallback);
      }
    })
  );
}

// ---- ヘルパー ----

function replaceCompanyVars(template: string, company: WorkHistoryItem): string {
  const name = (company.company || "前職").trim();
  // {company.department or "未取得"} 形式（YAML 内ではプレースホルダー）。
  // resumeData の WorkHistoryItem に department フィールドは現状無いため "未取得" で固定。
  const department = "未取得";
  const position = (company.position && company.position.trim()) || "未取得";
  return template
    .replaceAll("{company.name}", name)
    .replaceAll('{company.department or "未取得"}', department)
    .replaceAll('{company.position or "未取得"}', position);
}

function replaceCandidateVars(template: string, candidateName: string): string {
  return template.replaceAll("{candidate_name}", candidateName);
}

function replaceAddressVars(template: string, addressFull: string | null): string {
  return template.replaceAll(
    "{resumeData.personal_info.address_full}",
    addressFull && addressFull.trim() ? addressFull : "（未取得）"
  );
}

function toItem(spec: SpecItem): QuestionItem {
  return {
    type: spec.type,
    title: spec.title,
    help_text: spec.help_text ?? null,
    choices: spec.choices ?? null,
    required: typeof spec.required === "boolean" ? spec.required : null,
  };
}

// ---- セクション構築 ----

function buildHighSchoolSection(common: SpecCommonHighSchool): FormSection {
  return {
    id: "high_school",
    header: common.section_title,
    items: common.items.map(toItem),
  };
}

function buildQualificationsSection(
  common: SpecCommonQualifications,
  qualifications: ResumeData["qualifications"]
): FormSection {
  const items: QuestionItem[] = [];
  const tpl = common.dynamic_per_qualification;
  for (const q of qualifications) {
    items.push({
      type: tpl.type,
      title: tpl.title.replaceAll("{qualification.name}", q.name),
      help_text: tpl.help_text ?? null,
      choices: null,
      required: typeof tpl.required === "boolean" ? tpl.required : null,
    });
  }
  items.push(toItem(common.additional));
  return {
    id: "qualifications",
    header: common.section_title,
    items,
  };
}

function buildAddressSection(
  common: SpecCommonAddress,
  addressFull: string | null
): FormSection {
  return {
    id: "address",
    header: common.section_title,
    items: common.items.map((it) => ({
      type: it.type,
      title: it.title,
      help_text: it.help_text ? replaceAddressVars(it.help_text, addressFull) : null,
      choices: it.choices ?? null,
      required: typeof it.required === "boolean" ? it.required : null,
    })),
  };
}

/**
 * 会社別セクション見出しに、会社別ラベルが適用された subcategory のカテゴリ名を織り込む。
 * 例: 「テスト株式会社での業務内容について追加でご確認させてください。」
 *  → 「テスト株式会社でのその他事務（特許事務）の業務内容について追加でご確認させてください。」
 *
 * spec の title_template に "業務内容" が含まれることを前提に置換する。含まれない場合は末尾に
 * 角括弧でフォールバック付加する（堅牢性のため）。
 */
function applyCategoryLabelToHeader(baseHeader: string, categoryLabel: string): string {
  if (baseHeader.includes("業務内容")) {
    return baseHeader.replace("業務内容", `${categoryLabel}の業務内容`);
  }
  return `${baseHeader} [${categoryLabel}]`;
}

/**
 * 業務内容セクションを組み立てる（同期）。
 * 動的生成は事前に fillDynamicCache で cache へ充填済みである前提。
 * plans[i] が dynamic を持つ場合は cache から生成結果（or フォールバック）を引く。
 */
function buildWorkContentSections(
  spec: SpecWorkContent,
  workHistory: WorkHistoryItem[],
  plans: CompanySubcategoryPlan[],
  dynamicCache: Map<string, SpecSubcategory>
): FormSection[] {
  const dyn = spec.dynamic_per_company;
  const sections: FormSection[] = [];

  if (workHistory.length === 0) {
    sections.push({
      id: "work_content_fallback",
      header: spec.section_title,
      items: [
        {
          type: "long_text",
          title: "これまでの主な業務内容を教えてください",
          help_text:
            "在籍していた会社・期間・業務内容・役職等を順にお書きください。\n※該当しない場合は空白で構いません",
          choices: null,
          required: false,
        },
      ],
    });
    return sections;
  }

  for (let i = 0; i < workHistory.length; i++) {
    const company = workHistory[i];
    const items: QuestionItem[] = [];

    const plan = plans[i];
    const { resolvedCode, source, appliedLabel } = plan;
    // 動的生成があれば cache から（成功=生成結果 / 失敗=フォールバック）。無ければプランの固定 subcategory。
    const subcategory =
      plan.dynamic && dynamicCache.has(plan.dynamic.cacheKey)
        ? dynamicCache.get(plan.dynamic.cacheKey)!
        : plan.subcategory;
    const dynamicUsed = plan.dynamic
      ? dynamicCache.get(plan.dynamic.cacheKey) === subcategory && subcategory !== plan.subcategory
      : false;
    console.log(
      `[generate_form] index=${i} company="${company.company ?? ""}" resolvedSubcategory=${resolvedCode} source=${source} appliedLabel=${appliedLabel ?? "(none)"} dynamic=${plan.dynamic ? (dynamicUsed ? "gen" : "fallback") : "no"}`
    );

    // 配属情報 3 質問
    for (const info of dyn.placement_info) {
      items.push({
        type: info.type,
        title: replaceCompanyVars(info.title, company),
        help_text: info.help_text ? replaceCompanyVars(info.help_text, company) : null,
        choices: null,
        required: typeof info.required === "boolean" ? info.required : null,
      });
    }

    // 担当業務チェック（11 + Other）
    const dutiesChoices = [...subcategory.duties_choices];
    if (dyn.duties_check.include_other) {
      dutiesChoices.push(OTHER_OPTION_LABEL);
    }
    items.push({
      type: dyn.duties_check.type,
      title: replaceCompanyVars(dyn.duties_check.title, company),
      help_text: dyn.duties_check.help_text ?? null,
      choices: dutiesChoices,
      required: typeof dyn.duties_check.required === "boolean" ? dyn.duties_check.required : null,
    });

    // 業界別 KPI 3-5 質問
    for (const kpi of subcategory.kpi_questions) {
      items.push({
        type: kpi.type,
        title: replaceCompanyVars(kpi.title, company),
        help_text: kpi.help_text ? replaceCompanyVars(kpi.help_text, company) : null,
        choices: null,
        required: typeof kpi.required === "boolean" ? kpi.required : null,
      });
    }

    // 自由記述 1 質問
    items.push({
      type: dyn.notable_work.type,
      title: replaceCompanyVars(dyn.notable_work.title, company),
      help_text: dyn.notable_work.help_text
        ? replaceCompanyVars(dyn.notable_work.help_text, company)
        : null,
      choices: null,
      required: typeof dyn.notable_work.required === "boolean" ? dyn.notable_work.required : null,
    });

    const baseHeader = replaceCompanyVars(dyn.company_header.title_template, company);
    const header = appliedLabel
      ? applyCategoryLabelToHeader(baseHeader, subcategory.label)
      : baseHeader;

    sections.push({
      id: `work_content_${i}`,
      header,
      items,
    });
  }

  return sections;
}

function buildMindsetSection(
  spec: SpecMindset,
  subcategory: SpecSubcategory
): FormSection {
  const items: QuestionItem[] = [];

  const mindsetChoices = [...subcategory.mindset_choices];
  if (spec.mindset_check.include_other) {
    mindsetChoices.push(OTHER_OPTION_LABEL);
  }
  items.push({
    type: spec.mindset_check.type,
    title: spec.mindset_check.title,
    help_text: spec.mindset_check.help_text ?? null,
    choices: mindsetChoices,
    required:
      typeof spec.mindset_check.required === "boolean" ? spec.mindset_check.required : null,
  });

  items.push(toItem(spec.mindset_episode));

  return {
    id: "mindset",
    header: spec.section_title,
    items,
  };
}

function buildGenericSection(id: string, spec: SpecGenericSection): FormSection {
  return {
    id,
    header: spec.section_title,
    items: spec.items.map(toItem),
  };
}

// ---- メイン展開 ----

async function buildQuestionsJson(input: GenerateFormInput): Promise<QuestionsJson> {
  const spec = loadSpec();

  // achievementCategory から default(全社共通フォールバック / mindset_section 用) subcategory を解決
  const defaultSubcategory =
    spec.subcategories[input.achievementCategory] ??
    (input.achievementCategory === "other"
      ? buildOtherSubcategory(input.achievementCategoryOtherLabel)
      : null);
  if (!defaultSubcategory) {
    const knownCount = Object.keys(spec.subcategories).length;
    throw new Error(
      `Unknown achievementCategory: ${input.achievementCategory}. Must be one of ${knownCount} subcategories or "other".`
    );
  }

  // ---- T-053: その他系の動的生成 ----
  // 会社別プランを作成（同期）→ 動的生成が必要なユニークキーを並列生成して cache へ充填。
  const dynamicCache = new Map<string, SpecSubcategory>();
  const workHistory = Array.isArray(input.resumeData.work_history)
    ? input.resumeData.work_history
    : [];
  const workPlans = workHistory.map((_, i) =>
    planCompanySubcategory(
      i,
      input.companyCategoryMap,
      input.companyCategoryLabelMap,
      spec,
      input.achievementCategoryOtherLabel,
      defaultSubcategory
    )
  );

  // mindset_section 用のグローバル default も、その他系 + 全社共通ラベル非空なら動的化する。
  const globalLabel = (input.achievementCategoryOtherLabel ?? "").trim();
  let defaultPlan: CompanySubcategoryPlan | null = null;
  if (globalLabel && isOtherTypeCode(input.achievementCategory)) {
    const parentLabel =
      input.achievementCategory === "other"
        ? "その他"
        : spec.subcategories[input.achievementCategory].label;
    defaultPlan = {
      subcategory: defaultSubcategory,
      resolvedCode: input.achievementCategory,
      source: "default",
      appliedLabel: globalLabel,
      dynamic: {
        cacheKey: `${input.achievementCategory}::${globalLabel}`,
        label: globalLabel,
        parentLabel,
      },
    };
  }

  // グローバル default + 全社分をまとめて並列生成（同一 cacheKey は1回に集約）
  const allPlans = defaultPlan ? [defaultPlan, ...workPlans] : workPlans;
  await fillDynamicCache(allPlans, dynamicCache);

  // mindset_section 用の実効 default（動的生成成功時は置換）
  const effectiveDefaultSubcategory =
    defaultPlan?.dynamic && dynamicCache.has(defaultPlan.dynamic.cacheKey)
      ? dynamicCache.get(defaultPlan.dynamic.cacheKey)!
      : defaultSubcategory;

  const sections: FormSection[] = [];
  for (const sectionKey of spec.section_order) {
    if (sectionKey === "high_school") {
      sections.push(buildHighSchoolSection(spec.common_sections.high_school));
    } else if (sectionKey === "qualifications") {
      sections.push(
        buildQualificationsSection(
          spec.common_sections.qualifications,
          input.resumeData.qualifications
        )
      );
    } else if (sectionKey === "address") {
      sections.push(
        buildAddressSection(
          spec.common_sections.address,
          input.resumeData.personal_info.address_full
        )
      );
    } else if (sectionKey === "work_content_section") {
      sections.push(
        ...buildWorkContentSections(
          spec.work_content_section,
          workHistory,
          workPlans,
          dynamicCache
        )
      );
    } else if (sectionKey === "mindset_section") {
      // mindset_section は候補者全体の仕事観を問う質問のため（動的化された）default を使用
      sections.push(buildMindsetSection(spec.mindset_section, effectiveDefaultSubcategory));
    } else if (sectionKey === "work_consciousness") {
      sections.push(
        buildGenericSection("work_consciousness", spec.generic_sections.work_consciousness)
      );
    } else if (sectionKey === "self_pr") {
      sections.push(buildGenericSection("self_pr", spec.generic_sections.self_pr));
    } else if (sectionKey === "photo_submission") {
      sections.push(
        buildGenericSection("photo_submission", spec.generic_sections.photo_submission)
      );
    } else if (sectionKey === "consent") {
      sections.push(buildGenericSection("consent", spec.generic_sections.consent));
    } else {
      console.warn(`[generate_form] unknown section_order key: ${sectionKey}`);
    }
  }

  return {
    candidate_name: input.candidateName,
    greeting: replaceCandidateVars(spec.greeting.body, input.candidateName).trim(),
    sections,
  };
}

// ---- POST ハンドラ ----

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let candidateId = "";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
    const candidateName = typeof body.candidateName === "string" ? body.candidateName.trim() : "";
    const resumeData = body.resumeData as ResumeData | undefined;
    const interviewLog = typeof body.interviewLog === "string" ? body.interviewLog : "";
    const achievementCategory =
      typeof body.achievementCategory === "string" ? body.achievementCategory.trim() : "";
    const achievementCategoryOtherLabel =
      typeof body.achievementCategoryOtherLabel === "string"
        ? body.achievementCategoryOtherLabel.trim()
        : null;

    // companyCategoryMap (T-035: 業界混在対応 / optional)
    let companyCategoryMap: Record<string, string> | undefined;
    if (body.companyCategoryMap !== undefined && body.companyCategoryMap !== null) {
      const raw = body.companyCategoryMap;
      if (typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json(
          { error: "companyCategoryMap はオブジェクト（{ \"0\": \"sales_corporate\", ... }形式）で指定してください。" },
          { status: 400 }
        );
      }
      const entries = Object.entries(raw as Record<string, unknown>);
      const validated: Record<string, string> = {};
      for (const [k, v] of entries) {
        if (!/^\d+$/.test(k)) {
          return NextResponse.json(
            { error: `companyCategoryMap のキーは数値文字列である必要があります（不正なキー: "${k}"）。` },
            { status: 400 }
          );
        }
        if (typeof v !== "string" || !v.trim()) {
          return NextResponse.json(
            { error: `companyCategoryMap の値は文字列である必要があります（キー "${k}" の値が不正）。` },
            { status: 400 }
          );
        }
        validated[k] = v.trim();
      }
      companyCategoryMap = validated;
    }

    // companyCategoryLabelMap (T-052: その他系の会社別自由記入ラベル / optional)
    let companyCategoryLabelMap: Record<string, string> | undefined;
    if (body.companyCategoryLabelMap !== undefined && body.companyCategoryLabelMap !== null) {
      const raw = body.companyCategoryLabelMap;
      if (typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json(
          { error: "companyCategoryLabelMap はオブジェクト（{ \"0\": \"特許事務\", ... }形式）で指定してください。" },
          { status: 400 }
        );
      }
      const entries = Object.entries(raw as Record<string, unknown>);
      const validated: Record<string, string> = {};
      for (const [k, v] of entries) {
        if (!/^\d+$/.test(k)) {
          return NextResponse.json(
            { error: `companyCategoryLabelMap のキーは数値文字列である必要があります（不正なキー: "${k}"）。` },
            { status: 400 }
          );
        }
        if (typeof v !== "string") {
          return NextResponse.json(
            { error: `companyCategoryLabelMap の値は文字列である必要があります（キー "${k}" の値が不正）。` },
            { status: 400 }
          );
        }
        const trimmed = v.trim();
        if (trimmed) {
          validated[k] = trimmed;
        }
      }
      if (Object.keys(validated).length > 0) {
        companyCategoryLabelMap = validated;
      }
    }

    if (!candidateId || !/^5\d{6}$/.test(candidateId)) {
      return NextResponse.json(
        { error: "candidateId は5から始まる7桁の数字で指定してください。" },
        { status: 400 }
      );
    }
    if (!candidateName) {
      return NextResponse.json({ error: "candidateName は必須です。" }, { status: 400 });
    }
    if (!resumeData || typeof resumeData !== "object") {
      return NextResponse.json(
        { error: "resumeData は必須のオブジェクトです（extract_resume の出力をそのまま渡してください）。" },
        { status: 400 }
      );
    }
    if (!achievementCategory) {
      return NextResponse.json({ error: "achievementCategory は必須です。" }, { status: 400 });
    }

    const workHistoryCount = Array.isArray(resumeData.work_history)
      ? resumeData.work_history.length
      : 0;
    console.log(
      `[generate_form] start candidateId=${candidateId} defaultCategory=${achievementCategory} ` +
        `companyCategoryMap=${companyCategoryMap ? JSON.stringify(companyCategoryMap) : "none"} ` +
        `companyCategoryLabelMap=${companyCategoryLabelMap ? JSON.stringify(companyCategoryLabelMap) : "none"} ` +
        `workHistoryCount=${workHistoryCount}`
    );

    const input: GenerateFormInput = {
      candidateId,
      candidateName,
      resumeData,
      interviewLog,
      achievementCategory,
      achievementCategoryOtherLabel,
      companyCategoryMap,
      companyCategoryLabelMap,
    };

    let questionsJson: QuestionsJson;
    try {
      questionsJson = await buildQuestionsJson(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[generate_form] build failed candidateId=${candidateId} error=${msg}`);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!isValidQuestionsJson(questionsJson)) {
      console.error(`[generate_form] invalid questionsJson candidateId=${candidateId}`);
      return NextResponse.json(
        { error: "questionsJson の構造が不正です（内部エラー）。" },
        { status: 500 }
      );
    }

    const latencyMs = Date.now() - startedAt;
    console.log(
      `[generate_form] done candidateId=${candidateId} latency_ms=${latencyMs} sectionsCount=${questionsJson.sections.length}`
    );

    return NextResponse.json({
      candidateId,
      questionsJson,
      latency_ms: latencyMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[generate_form] fatal candidateId=${candidateId} error=${msg}`);
    return NextResponse.json(
      { error: "フォーム構造の生成中に予期しないエラーが発生しました。", detail: msg },
      { status: 500 }
    );
  }
}
