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
};

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

function buildWorkContentSections(
  spec: SpecWorkContent,
  workHistory: WorkHistoryItem[],
  subcategory: SpecSubcategory
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

    sections.push({
      id: `work_content_${i}`,
      header: replaceCompanyVars(dyn.company_header.title_template, company),
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

function buildQuestionsJson(input: GenerateFormInput): QuestionsJson {
  const spec = loadSpec();

  const subcategory =
    spec.subcategories[input.achievementCategory] ??
    (input.achievementCategory === "other" ? OTHER_FALLBACK : null);
  if (!subcategory) {
    throw new Error(
      `Unknown achievementCategory: ${input.achievementCategory}. Must be one of 21 subcategories or "other".`
    );
  }

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
          input.resumeData.work_history,
          subcategory
        )
      );
    } else if (sectionKey === "mindset_section") {
      sections.push(buildMindsetSection(spec.mindset_section, subcategory));
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
      `[generate_form] start candidateId=${candidateId} subcategory=${achievementCategory} workHistoryCount=${workHistoryCount}`
    );

    const input: GenerateFormInput = {
      candidateId,
      candidateName,
      resumeData,
      interviewLog,
      achievementCategory,
      achievementCategoryOtherLabel,
    };

    let questionsJson: QuestionsJson;
    try {
      questionsJson = buildQuestionsJson(input);
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
