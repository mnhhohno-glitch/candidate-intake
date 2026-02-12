/**
 * Google Apps Script: 質問文テキスト（candidate_question_text_only）から
 * Googleフォームを生成し、回答URL・編集URLを返す。
 *
 * デプロイ: エディタで「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
 * - 実行ユーザー: 自分
 * - アクセス: 全員（または「組織内」＋トークン検証）
 * デプロイ後のURLを Next.js の環境変数 GAS_WEB_APP_URL に設定する。
 *
 * リクエスト (POST JSON):
 *   { candidateId, candidateName?, questionText, token? }
 * レスポンス (JSON):
 *   { formId, responseUrl, editUrl } または { error: "..." }
 *   Drive 共有に失敗した場合は shareWarning が付与され、フォームURLはそのまま返る（手動共有が必要）。
 * 必要な権限: Forms, Spreadsheets, Drive（appsscript.json の oauthScopes に drive を追加し、再認証すること）。
 */

var PRIVACY_POLICY_TITLE = "求職者向け個人情報の取扱いについて";

// 全文を改変・要約しない（要件どおりそのまま掲載）
var PRIVACY_POLICY_BODY =
  "求職者向け個人情報の取扱いについて\n" +
  "株式会社ビズスタジオ（以下、「当社」）は、人材紹介サービスをご利用いただく求職者\n" +
  "（以下、「利用者」）から取得する個人情報を、以下の通り適切に取り扱い、保護します。\n\n" +
  "個人情報の提供の任意性\n" +
  "個人情報の提供は任意ですが、必要な情報をご提供いただけない場合、適切な求人紹介・選考支援サービスを提供できないことがあります。\n" +
  "取得する個人情報の項目\n" +
  "当社は、以下の情報を取得する場合があります。\n" +
  "・ 氏名、生年月日、住所、電話番号、メールアドレス\n" +
  "・ 学歴、職歴、資格、スキル等の履歴書・職務経歴情報\n" +
  "・ 希望職種、希望勤務地、希望年収等の希望条件\n" +
  "・ 面談内容、応募状況、選考結果\n" +
  "・ 適性検査結果、アンケート情報\n" +
  "・ その他、サービス提供に必要な情報\n" +
  "個人情報の利用目的\n" +
  "取得した個人情報は、以下の目的で利用します。\n" +
  "・ 求職者への求人紹介・キャリアカウンセリングの提供\n" +
  "・ 求人企業への推薦および選考手続き\n" +
  "・ 面接日程調整、応募管理、選考結果連絡\n" +
  "・ キャリア支援サービスの案内・提供\n" +
  "・ 各種お問い合わせへの対応\n" +
  "・ 統計データの作成（個人を特定できない形での利用）\n" +
  "・ 法令に基づく手続や対応\n" +
  "個人情報の第三者提供\n" +
  "当社は、以下の場合に限り第三者に提供します。\n" +
  "・ 利用者の同意がある場合\n" +
  "・ 求人企業への応募に伴い必要な情報を提供する場合\n" +
  "・ 法令に基づき提供が必要な場合\n" +
  "外国にある求人企業へ提供する場合、提供先の情報を本人に通知し、同意を得た上で提供します。\n" +
  "個人情報の委託\n" +
  "当社は、サービス提供に必要な範囲で個人情報の取り扱いを委託する場合があります。\n" +
  "その際は、委託先に対して適切な監督を行います。\n" +
  "個人情報の開示・訂正・削除等\n" +
  "利用者は、保有個人情報の開示、訂正、追加、削除、利用停止等を請求できます。\n" +
  "本人確認の上、法令に基づき速やかに対応します。\n" +
  "開示等の請求は、下記お問い合わせ窓口宛にメールでご連絡ください。手数料は不要です。\n" +
  "回答方法は、原則としてメールにてご案内いたします。\n" +
  "クッキー等の利用（必要に応じて）\n" +
  "当社はサービス改善を目的としてCookieやアクセス解析ツールを利用する場合があります。\n" +
  "詳細は別途「Cookieポリシー」をご確認ください。\n" +
  "プライバシーポリシーの変更\n" +
  "法令等の改正や必要に応じ、本ポリシーを変更する場合があります。\n" +
  "【お問い合わせ窓口】\n" +
  "株式会社ビズスタジオ\n" +
  "人材紹介事業部 個人情報担当\n" +
  "E・mail：agent@bizstudio.co.jp\n" +
  "住所：〒102・0083 東京都千代田区麹町4・5・20 KSビル8階";

var CONSENT_CHECKBOX_LABEL =
  "上記内容を確認し、同意します。";

// 個人情報同意：内容は「確認する場合のみ」表示するための説明文
var CONSENT_INSTRUCTION =
  "※内容を確認する場合のみ以下をご覧ください。同意される場合は下のチェックを入れて送信してください。";

// 写真データの提出：ラジオボタン用の3択
var PHOTO_OPTIONS = [
  "証明写真データを持っているため、別途提出。",
  "証明写真データを持っていないが、証明写真機で別途撮影後提出。",
  "自宅でスマホの撮影をして後日提出。"
];

var ACHIEVEMENT_ANNOTATION = "（※不明な場合は空白で構いません）";
/** 業務内容の全質問に付与する注釈（要件③） */
var BUSINESS_ANNOTATION = "該当するものもしくは不明の場合は空白で構いません";
var QUALIFICATION_EXTRA_DESC =
  "他に追加で記載する資格がある場合は資格名：取得年月を追加記入してください。";

/** カテゴリー枠（説明のみ）の文言 */
var SECTION_HEADER_HIGH_SCHOOL = "高校についてお尋ねします";
var SECTION_HEADER_QUALIFICATION = "資格についてお尋ねします";
var SECTION_HEADER_BUSINESS = "業務内容について詳細をお聞きします";
var SECTION_HEADER_ADDRESS = "ご住所についてお尋ねします";
var SECTION_HEADER_PHOTO = "証明写真の提出について";

/** APIが付与する挨拶文の末尾。この直後からが第1質問なので、blocks[0]から挨拶と第1質問を分離する */
var INTRO_END_MARKER = "ご記入頂けますと幸いです。";
/** APIが付与するフッターの先頭。最終ブロックに含まれていたら除去する */
var FOOTER_START_MARKER = "以上となります。";

/**
 * テキストを「回答：」または「回答:」で区切り、1質問＝1ブロックの配列にする。
 * 各ブロック末尾の「回答：」行は設問からは削除する（フォームでは入力欄が回答のため）。
 */
function parseQuestionBlocks(questionText) {
  if (!questionText || typeof questionText !== "string") return [];
  var parts = questionText.split(/\n回答[：:]\n?/);
  var blocks = [];
  for (var i = 0; i < parts.length; i++) {
    var block = parts[i].replace(/\n?回答[：:]\s*$/, "").trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

function isAchievementBlock(block) {
  return /実績/.test(block);
}

function isJobConsciousnessBlock(block) {
  return /仕事において意識していたこと/.test(block);
}

function isSelfPRBlock(block) {
  return /自己PR|自己 pr/i.test(block);
}

function isPhotoBlock(block) {
  return /写真/.test(block) && /提出|データ/.test(block);
}

function isQualificationBlock(block) {
  return /資格/.test(block);
}

/**
 * ブロックがどのカテゴリーに属するか判定する（カテゴリー枠の挿入用）。
 * 「仕事で意識していたこと」「自己PR」はカテゴリ枠を出さないため other とする。
 * 戻り値: "photo" | "high_school" | "qualification" | "business" | "address" | "other"
 */
function getCategory(block) {
  if (isPhotoBlock(block)) return "photo";
  if (isQualificationBlock(block)) return "qualification";
  if (isJobConsciousnessBlock(block) || isSelfPRBlock(block)) return "other";
  if (/高校|高卒|大学|学歴|中学|卒業/.test(block)) return "high_school";
  if (/住所|ご住所|住まい|建物名|戸建て/.test(block)) return "address";
  if (isAchievementBlock(block) || /業務|実績|目標|売上|達成率|顧客|商材|職務|担当|記入例/.test(block)) return "business";
  return "other";
}

/**
 * カテゴリーに対応する「説明のみの枠」の文言を返す。
 */
function getSectionHeaderForCategory(cat) {
  switch (cat) {
    case "photo": return SECTION_HEADER_PHOTO;
    case "high_school": return SECTION_HEADER_HIGH_SCHOOL;
    case "qualification": return SECTION_HEADER_QUALIFICATION;
    case "business": return SECTION_HEADER_BUSINESS;
    case "address": return SECTION_HEADER_ADDRESS;
    default: return null;
  }
}

/**
 * ブロックが業務内容に該当するか（注釈を付けるか）。
 * 意識していたこと・自己PRも注釈は付与する（カテゴリ枠は出さない）。
 */
function isBusinessCategoryBlock(block) {
  return getCategory(block) === "business" || isJobConsciousnessBlock(block) || isSelfPRBlock(block);
}

/**
 * ブロックから「1. 〇〇」「2. 〇〇」形式の選択肢を抽出して配列で返す。
 * 先頭の見出し行は除外し、番号付き行だけを choices にする。
 */
function parseNumberedChoices(block) {
  var lines = block.split(/\n/);
  var choices = [];
  var re = /^[\d一二三四五六七八九十]+[．.．:：]\s*(.+)$/;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var m = line.match(re);
    if (m) choices.push(m[1].trim());
  }
  return choices;
}

/**
 * 資格ブロックを1行1資格として分割。空行・見出しのみは除外。
 * 戻り値: [ "資格1", "資格2", ... ]
 */
function parseQualificationLines(block) {
  var lines = block.split(/\n/);
  var items = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    // 「資格質問欄」「資格」だけの行は見出しとしてスキップ
    if (/^資格質問?欄?$/.test(line) || /^資格$/.test(line)) continue;
    items.push(line);
  }
  return items;
}

/**
 * POST で受け取った JSON をパースしてフォームを作成し、URL を返す。
 * 例外時も必ず JSON で返し、Next.js 側で 502 の原因を特定しやすくする。
 * 最外殻の try-catch で予期しない例外（PropertiesService 等）も捕捉し、HTML ではなく JSON を返す。
 */
function doPost(e) {
  var result = { error: null, formId: null, responseUrl: null, editUrl: null, shareWarning: null };
  try {
    if (!e || !e.postData || !e.postData.contents) {
      result.error = "リクエストボディがありません。POSTでJSONを送信してください。";
      return createJsonResponse(result, 400);
    }
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      result.error = "リクエストのJSON形式が不正です。";
      return createJsonResponse(result, 400);
    }

    var expectedToken = "";
    try {
      var props = PropertiesService.getScriptProperties();
      if (props) expectedToken = (props.getProperty("INVOKE_TOKEN") || "").toString();
    } catch (propErr) {
      // スクリプトプロパティ取得に失敗しても続行（トークン未設定扱い）
    }
    var token = body.token;
    if (expectedToken.length > 0 && token !== expectedToken) {
      result.error = "認証トークンが無効です。";
      return createJsonResponse(result, 401);
    }

    var candidateId = body.candidateId ? String(body.candidateId).trim() : "";
    var candidateName = body.candidateName ? String(body.candidateName).trim() : "";
    var questionText = body.questionText ? String(body.questionText) : "";

    if (!candidateId || !/^5\d{6}$/.test(candidateId)) {
      result.error = "candidateId は5から始まる7桁で指定してください。";
      return createJsonResponse(result, 400);
    }
    if (!questionText) {
      result.error = "questionText は必須です。";
      return createJsonResponse(result, 400);
    }

    try {
      return doCreateForm(candidateId, candidateName, questionText, result);
    } catch (formErr) {
      var errMsg = formErr && formErr.message ? formErr.message : String(formErr);
      result.error = "フォーム作成中にエラーが発生しました: " + errMsg;
      return createJsonResponse(result, 500);
    }
  } catch (outerErr) {
    var outerMsg = outerErr && outerErr.message ? outerErr.message : String(outerErr);
    result.error = "予期しないエラー: " + outerMsg;
    return createJsonResponse(result, 500);
  }
}

/**
 * blocks[0] が API 付与の挨拶＋第1質問の連結の場合、挨拶と第1質問に分離する。
 * 戻り値: { introTitle: string|null, firstQuestion: string }
 * - introTitle が null のときは挨拶が含まれていない（blocks[0] がそのまま第1質問）。
 */
function splitIntroAndFirstQuestion(block0) {
  if (!block0 || typeof block0 !== "string") return { introTitle: null, firstQuestion: block0 || "" };
  var idx = block0.indexOf(INTRO_END_MARKER);
  if (idx === -1) return { introTitle: null, firstQuestion: block0.trim() };
  var introTitle = block0.substring(0, idx + INTRO_END_MARKER.length).trim();
  var firstQuestion = block0.substring(idx + INTRO_END_MARKER.length).replace(/^\s+/, "").trim();
  return { introTitle: introTitle, firstQuestion: firstQuestion };
}

/**
 * 最終ブロック末尾に API 付与のフッターが含まれていれば除去する。
 */
function stripFooterFromLastBlock(block) {
  if (!block || typeof block !== "string") return block || "";
  var idx = block.indexOf(FOOTER_START_MARKER);
  if (idx === -1) return block;
  return block.substring(0, idx).replace(/\s+$/, "").trim();
}

/**
 * フォーム実体を作成し、result に URL を詰めて返す。
 * 重要: API は「挨拶\n\n質問1\n回答：\n質問2\n回答：\n...」を返すため、
 * blocks[0] = 挨拶＋第1質問が連結している。挨拶と第1質問を分離し、第1質問もフォーム項目にする。
 */
function doCreateForm(candidateId, candidateName, questionText, result) {
  var blocks = parseQuestionBlocks(questionText);
  var formTitle = (candidateName || "候補者") + "様_質問フォーム";

  var form = FormApp.create(formTitle);
  form.setDescription("候補者向けヒアリングフォーム（Candidate Intake から作成）");
  form.setRequireLogin(false);

  // ① 挨拶と第1質問の分離。挨拶のみを説明セクションに、第1質問は後続と同様にフォーム項目にする
  var introTitle = null;
  var questionBlocks = [];
  if (blocks.length > 0) {
    var split = splitIntroAndFirstQuestion(blocks[0]);
    introTitle = split.introTitle;
    if (split.firstQuestion) questionBlocks.push(split.firstQuestion);
  }
  for (var j = 1; j < blocks.length; j++) {
    var b = blocks[j];
    if (j === blocks.length - 1) b = stripFooterFromLastBlock(b);
    if (b) questionBlocks.push(b);
  }

  if (introTitle) {
    form.addSectionHeaderItem().setTitle(introTitle);
    form.addPageBreakItem();
  }

  var lastCategory = null;
  var businessSectionAlreadyAdded = false;
  for (var i = 0; i < questionBlocks.length; i++) {
    var block = questionBlocks[i];
    var cat = getCategory(block);

    // ② カテゴリー枠：質問の前に「説明のみの枠」を1つ追加（業務内容は①の直前に1回だけ）
    if (cat !== lastCategory) {
      lastCategory = cat;
      var sectionTitle = getSectionHeaderForCategory(cat);
      if (sectionTitle) {
        if (cat === "business") {
          if (!businessSectionAlreadyAdded) {
            form.addSectionHeaderItem().setTitle(sectionTitle);
            businessSectionAlreadyAdded = true;
          }
        } else {
          form.addSectionHeaderItem().setTitle(sectionTitle);
        }
      }
    }

    if (isPhotoBlock(block)) {
      var photoItem = form.addMultipleChoiceItem();
      photoItem.setTitle(block);
      photoItem.setChoiceValues(PHOTO_OPTIONS);
      photoItem.setRequired(false);
      continue;
    }

    if (isJobConsciousnessBlock(block) || isSelfPRBlock(block)) {
      var choices = parseNumberedChoices(block);
      var help = isBusinessCategoryBlock(block) ? BUSINESS_ANNOTATION : null;
      if (choices.length > 0) {
        var checkItem = form.addCheckboxItem();
        checkItem.setTitle(block);
        checkItem.setChoiceValues(choices);
        checkItem.setRequired(false);
        if (help) checkItem.setHelpText(help);
      } else {
        var p = form.addParagraphTextItem().setTitle(block).setRequired(false);
        if (help) p.setHelpText(help);
      }
      continue;
    }

    if (isQualificationBlock(block)) {
      var qualLines = parseQualificationLines(block);
      for (var q = 0; q < qualLines.length; q++) {
        form.addParagraphTextItem()
          .setTitle(qualLines[q])
          .setRequired(false);
      }
      form.addParagraphTextItem()
        .setTitle("その他（追加の資格）")
        .setHelpText(QUALIFICATION_EXTRA_DESC)
        .setRequired(false);
      continue;
    }

    if (isAchievementBlock(block)) {
      // ③ 業務内容の質問には必ず BUSINESS_ANNOTATION を付与
      var achItem = form.addParagraphTextItem().setTitle(block).setRequired(false);
      achItem.setHelpText(BUSINESS_ANNOTATION);
      continue;
    }

    // 一般の段落質問：業務内容なら注釈を付ける
    var paraItem = form.addParagraphTextItem().setTitle(block).setRequired(false);
    if (isBusinessCategoryBlock(block)) {
      paraItem.setHelpText(BUSINESS_ANNOTATION);
    }
  }

  // ④ 個人情報同意：説明ブロックは説明のみ（回答欄なし）、同意チェックは外に配置
  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle(PRIVACY_POLICY_TITLE);
  form.addSectionHeaderItem().setTitle(CONSENT_INSTRUCTION);
  form.addParagraphTextItem().setTitle(PRIVACY_POLICY_BODY).setRequired(false);
  var consentItem = form.addCheckboxItem();
  consentItem.setTitle(CONSENT_CHECKBOX_LABEL);
  consentItem.setChoices([consentItem.createChoice("同意する")]);
  consentItem.setRequired(true);

  var spreadsheet = SpreadsheetApp.create("回答_" + formTitle);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  try {
    var formFile = DriveApp.getFileById(form.getId());
    formFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (driveErr) {
    result.shareWarning =
      "フォームは作成されましたが、共有設定（リンクを知っている全員）ができていません。編集画面の「公開」→「管理」で「リンクを知っている全員」に変更するか、GASプロジェクトにDriveの権限を追加して再デプロイしてください。";
  }

  result.formId = form.getId();
  result.responseUrl = form.getPublishedUrl();
  result.editUrl = form.getEditUrl();
  return createJsonResponse(result, 200);
}

function createJsonResponse(obj, statusCode) {
  var status = statusCode || 200;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * エディタで「実行」→ この関数を選んで実行すると、Drive 等の認証が求められます。
 * 「承認が必要です」→「許可」で認証を完了させてから、ウェブアプリ URL を開き直してください。
 */
function authorizeApp() {
  DriveApp.getRootFolder().getName();
}

/**
 * ブラウザで URL を開いたとき（GET）に呼ばれる。認証フローを出しやすくし、「ファイルを開くことができません」を避ける。
 */
function doGet() {
  var html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>ウェブアプリ</title></head><body>" +
    "<p>このウェブアプリは稼働中です。</p>" +
    "<p>フォーム作成は Candidate Intake アプリから POST で呼び出してください。</p>" +
    "</body></html>";
  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
}
