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
  "上記『求職者向け個人情報の取扱いについて』を確認し、同意します。";

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

/**
 * POST で受け取った JSON をパースしてフォームを作成し、URL を返す。
 */
function doPost(e) {
  var result = { error: null, formId: null, responseUrl: null, editUrl: null };
  try {
    var body = e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};
  } catch (err) {
    result.error = "リクエストのJSON形式が不正です。";
    return createJsonResponse(result, 400);
  }

  var token = body.token;
  var expectedToken = PropertiesService.getScriptProperties().getProperty("INVOKE_TOKEN");
  if (expectedToken && expectedToken.length > 0 && token !== expectedToken) {
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

  var blocks = parseQuestionBlocks(questionText);
  var formTitle = candidateId + "_" + (candidateName || "候補者") + "_質問フォーム";

  var form = FormApp.create(formTitle);
  form.setDescription("候補者向けヒアリングフォーム（Candidate Intake から作成）");

  for (var i = 0; i < blocks.length; i++) {
    form.addParagraphTextItem().setTitle(blocks[i]).setRequired(false);
  }

  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle(PRIVACY_POLICY_TITLE);
  form.addParagraphTextItem().setTitle(PRIVACY_POLICY_BODY).setRequired(false);
  var consentItem = form.addCheckboxItem();
  consentItem.setTitle(CONSENT_CHECKBOX_LABEL);
  consentItem.setChoices([consentItem.createChoice("同意する")]);
  consentItem.setRequired(true);

  var spreadsheet = SpreadsheetApp.create("回答_" + formTitle);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  // スマホ・社外などから回答URLで開けるよう、フォームを「リンクを知っている全員が閲覧可能」に共有
  var formFile = DriveApp.getFileById(form.getId());
  formFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

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
