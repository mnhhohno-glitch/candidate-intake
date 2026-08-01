/**
 * Google Apps Script V2: questionsJson（構造化 JSON）から
 * Google フォームを生成し、回答URL・編集URLを返す。
 *
 * 2026-08 変更（その1）:
 * - スクリプトプロパティ SHARED_DRIVE_FOLDER_ID があれば、
 *   フォームと回答スプレッドシートの両方を共有ドライブへ移動する
 * - 共有ドライブへ移動できた場合は個別の addEditors を行わない
 * - 共有ドライブへ移動できなかった場合のフォールバックでは、
 *   フォームだけでなく回答スプレッドシートにも編集権限を付与する
 *
 * 2026-08 変更（その2・通知メール修正）:
 * - onFormSubmitNotification が FormApp.getActiveForm() を使っていたため、
 *   独立スクリプトでは常に null となり通知メールが送信できていなかった。
 *   e.source からフォームを取得する形に修正。
 * - トリガー上限（1スクリプト20個）到達で新規フォームに通知が付かなくなる問題に対し、
 *   作成前に古いトリガーを整理する pruneFormSubmitTriggers() を追加。
 * - 通知作成に失敗した場合、エラー自体を通知するようにした。
 *
 * デプロイ: 「デプロイ」→「デプロイを管理」→ 編集 → バージョン「新バージョン」
 *  - 実行ユーザー: 自分
 *  - アクセス: 全員
 */

const NOTIFICATION_EMAIL = "agent@bizstudio.co.jp";

const PRIVACY_POLICY_TITLE = "求職者向け個人情報の取扱いについて";

const PRIVACY_POLICY_BODY =
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

const CONSENT_CHECKBOX_LABEL = "上記内容を確認し、同意します。";
const CONSENT_INSTRUCTION =
  "※内容を確認する場合のみ以下をご覧ください。同意される場合は下のチェックを入れて送信してください。";

// 共有ドライブへ移動できなかった場合のフォールバック用
const FORM_EDITORS = [
  "masayuki_oono@bizstudio.co.jp",
  "yoshitomi_ando@bizstudio.co.jp",
  "yuji_okumura@bizstudio.co.jp",
  "kanako_okada@bizstudio.co.jp",
  "yuzo_nanjo@bizstudio.co.jp",
  "aoi_sato@bizstudio.co.jp"
];

// 1スクリプトあたりのトリガー上限（Google仕様20個）に対する安全値
const MAX_FORM_TRIGGERS = 18;

/**
 * フォーム送信時の通知メール
 * 注意: このスクリプトはフォームに紐づいていない独立スクリプトのため、
 *       FormApp.getActiveForm() は常に null を返す。必ず e.source を使う。
 */
function onFormSubmitNotification(e) {
  try {
    const form = e && e.source ? e.source : null;
    const formTitle = form ? form.getTitle() : "不明なフォーム";
    const responses = e.response.getItemResponses();

    let body = "【フォーム回答通知】\n\n";
    body += `フォーム名: ${formTitle}\n`;
    body += `回答日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}\n\n`;
    body += "--- 回答内容 ---\n\n";
    for (const item of responses) {
      const question = item.getItem().getTitle();
      const answer = item.getResponse();
      if (answer && String(answer).trim() !== "") {
        body += `Q: ${question}\nA: ${answer}\n\n`;
      }
    }
    body += "--- 以上 ---\n";
    if (form) {
      body += `フォーム編集URL: ${form.getEditUrl()}\n`;
    }

    MailApp.sendEmail({
      to: NOTIFICATION_EMAIL,
      subject: `【回答あり】${formTitle}`,
      body: body
    });
    Logger.log(`回答通知メール送信成功: ${formTitle}`);
  } catch (err) {
    Logger.log(`回答通知メール送信失敗: ${err.message}`);
    // 失敗が完全に埋もれないよう、エラー自体を通知する
    try {
      MailApp.sendEmail({
        to: NOTIFICATION_EMAIL,
        subject: "【要確認】フォーム回答通知の送信に失敗しました",
        body:
          "回答は記録されていますが、通知メールの作成に失敗しました。\n\n" +
          `エラー内容: ${err.message}\n\n` +
          "回答内容は共有ドライブの回答スプレッドシートをご確認ください。"
      });
    } catch (ignore) {}
  }
}

/**
 * 回答通知トリガーが上限に達しないよう、古いものから削除する。
 * 注意: getProjectTriggers() の並び順が作成順である保証はGoogle公式にはない。
 */
function pruneFormSubmitTriggers() {
  try {
    const triggers = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === "onFormSubmitNotification";
    });
    Logger.log(`現在の回答通知トリガー数: ${triggers.length}`);
    let index = 0;
    while (triggers.length - index >= MAX_FORM_TRIGGERS) {
      const oldest = triggers[index];
      ScriptApp.deleteTrigger(oldest);
      Logger.log(`古い回答通知トリガーを削除: ${oldest.getUniqueId()}`);
      index++;
    }
  } catch (pruneErr) {
    Logger.log(`トリガー整理失敗: ${pruneErr.message}`);
  }
}

/**
 * メインエントリポイント
 */
function doPost(e) {
  const result = {
    error: null,
    formId: null,
    responseUrl: null,
    editUrl: null,
    shareWarning: null
  };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      result.error = "リクエストボディがありません。POSTでJSONを送信してください。";
      return jsonResponse(result);
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      result.error = "リクエストのJSON形式が不正です。";
      return jsonResponse(result);
    }

    // 認証
    let expectedToken = "";
    try {
      const props = PropertiesService.getScriptProperties();
      if (props) expectedToken = String(props.getProperty("INVOKE_TOKEN") || "");
    } catch (propErr) {}
    if (expectedToken.length > 0 && body.token !== expectedToken) {
      result.error = "認証トークンが無効です。";
      return jsonResponse(result);
    }

    const candidateId = body.candidateId ? String(body.candidateId).trim() : "";
    const questionsJson = body.questionsJson;

    if (!candidateId || !/^5\d{6}$/.test(candidateId)) {
      result.error = "candidateId は5から始まる7桁で指定してください。";
      return jsonResponse(result);
    }
    if (!questionsJson || typeof questionsJson !== "object") {
      result.error = "questionsJson は必須です。";
      return jsonResponse(result);
    }
    if (!Array.isArray(questionsJson.sections)) {
      result.error = "questionsJson.sections は配列で指定してください。";
      return jsonResponse(result);
    }

    return doCreateFormFromJson(candidateId, questionsJson, result);
  } catch (outerErr) {
    result.error = `予期しないエラー: ${outerErr.message || String(outerErr)}`;
    return jsonResponse(result);
  }
}

/**
 * questionsJson から Form を作成
 */
function doCreateFormFromJson(candidateId, questionsJson, result) {
  const candidateName = questionsJson.candidate_name || "候補者";
  const greeting = questionsJson.greeting || "";
  const formTitle = `${candidateName}様_質問フォーム`;

  const form = FormApp.create(formTitle);
  form.setDescription("候補者向けヒアリングフォーム（Candidate Intake から作成）");
  form.setRequireLogin(false);

  // 冒頭挨拶（greeting がある場合は SectionHeader として配置）
  if (greeting) {
    const greetingTitle = `${candidateName}様\n\n${greeting}`;
    form.addSectionHeaderItem().setTitle(greetingTitle);
  }

  // セクション + アイテム
  for (const section of questionsJson.sections) {
    if (section.header) {
      form.addSectionHeaderItem().setTitle(section.header);
    }
    if (Array.isArray(section.items)) {
      for (const item of section.items) {
        addFormItem(form, item);
      }
    }
  }

  // ページ区切り + 同意確認
  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle(PRIVACY_POLICY_TITLE);
  form.addSectionHeaderItem().setTitle(CONSENT_INSTRUCTION);
  form.addParagraphTextItem().setTitle(PRIVACY_POLICY_BODY).setRequired(false);
  const consentItem = form.addCheckboxItem();
  consentItem.setTitle(CONSENT_CHECKBOX_LABEL);
  consentItem.setChoices([consentItem.createChoice("同意する")]);
  consentItem.setRequired(true);

  // 回答先スプレッドシート
  const spreadsheet = SpreadsheetApp.create(`回答_${formTitle}`);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  // 共有ドライブへ移動（フォーム + 回答スプレッドシートの両方）
  let movedToSharedDrive = false;
  try {
    let sharedFolderId = "";
    const props = PropertiesService.getScriptProperties();
    if (props) {
      sharedFolderId = String(props.getProperty("SHARED_DRIVE_FOLDER_ID") || "").trim();
    }
    if (sharedFolderId) {
      const targetFolder = DriveApp.getFolderById(sharedFolderId);
      DriveApp.getFileById(form.getId()).moveTo(targetFolder);
      DriveApp.getFileById(spreadsheet.getId()).moveTo(targetFolder);
      movedToSharedDrive = true;
      Logger.log(`共有ドライブへ移動成功: folderId=${sharedFolderId}`);
    } else {
      Logger.log("SHARED_DRIVE_FOLDER_ID 未設定のためマイドライブに作成");
    }
  } catch (moveErr) {
    Logger.log(`共有ドライブへの移動失敗: ${moveErr.message}`);
    result.shareWarning =
      "フォームは作成されましたが、共有ドライブへの移動に失敗しました（マイドライブに作成されています）。";
  }

  // 求職者が回答URLを開けるようにする（フォーム本体のみ）
  try {
    DriveApp.getFileById(form.getId())
      .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log(`リンク共有設定成功: formId=${form.getId()}`);
  } catch (shareErr) {
    Logger.log(`リンク共有設定失敗: ${shareErr.message}`);
  }

  // 共有ドライブへ移動できなかった場合のみ、個別に編集権限を付与
  if (!movedToSharedDrive) {
    try {
      DriveApp.getFileById(form.getId()).addEditors(FORM_EDITORS);
      DriveApp.getFileById(spreadsheet.getId()).addEditors(FORM_EDITORS);
      Logger.log(`addEditors 成功: formId=${form.getId()}`);
    } catch (driveErr) {
      Logger.log(`addEditors 失敗: ${driveErr.message}`);
      result.shareWarning = "フォームは作成されましたが、共有設定ができていません。";
    }
  }

  // 回答通知トリガー（上限に達しないよう先に古いものを整理）
  pruneFormSubmitTriggers();
  try {
    ScriptApp.newTrigger("onFormSubmitNotification")
      .forForm(form)
      .onFormSubmit()
      .create();
    Logger.log(`回答通知トリガー設定成功: formId=${form.getId()}`);
  } catch (triggerErr) {
    Logger.log(`回答通知トリガー設定失敗: ${triggerErr.message}`);
    result.shareWarning =
      (result.shareWarning ? result.shareWarning + " " : "") +
      "回答通知の設定に失敗しました。";
  }

  result.formId = form.getId();
  result.responseUrl = form.getPublishedUrl();
  result.editUrl = form.getEditUrl();
  return jsonResponse(result);
}

/**
 * 質問アイテムを Form に追加（type 別ディスパッチ）
 */
function addFormItem(form, item) {
  if (!item || !item.type || !item.title) {
    Logger.log(`不正なアイテムをスキップ: ${JSON.stringify(item)}`);
    return;
  }

  const type = item.type;
  const title = item.title;
  const helpText = item.help_text || "";
  const required = item.required === true;
  const choices = Array.isArray(item.choices) ? item.choices : [];

  switch (type) {
    case "section_header":
      form.addSectionHeaderItem().setTitle(title).setHelpText(helpText);
      break;

    case "short_text": {
      const textItem = form.addTextItem().setTitle(title).setRequired(required);
      if (helpText) textItem.setHelpText(helpText);
      break;
    }

    case "long_text": {
      const paraItem = form.addParagraphTextItem().setTitle(title).setRequired(required);
      if (helpText) paraItem.setHelpText(helpText);
      break;
    }

    case "single_select": {
      const radioItem = form.addMultipleChoiceItem().setTitle(title).setRequired(required);
      if (helpText) radioItem.setHelpText(helpText);
      if (choices.length > 0) radioItem.setChoiceValues(choices);
      break;
    }

    case "multi_select": {
      const checkItem = form.addCheckboxItem().setTitle(title).setRequired(required);
      if (helpText) checkItem.setHelpText(helpText);
      if (choices.length > 0) checkItem.setChoiceValues(choices);
      break;
    }

    case "dropdown": {
      const listItem = form.addListItem().setTitle(title).setRequired(required);
      if (helpText) listItem.setHelpText(helpText);
      if (choices.length > 0) listItem.setChoiceValues(choices);
      break;
    }

    default: {
      Logger.log(`未対応 type をスキップ: ${type}`);
      // フォールバック: long_text として追加
      const fallbackItem = form.addParagraphTextItem().setTitle(title).setRequired(required);
      if (helpText) fallbackItem.setHelpText(helpText);
      break;
    }
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function authorizeApp() {
  DriveApp.getRootFolder().getName();
  MailApp.getRemainingDailyQuota();
}

function doGet() {
  const html =
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>CANDIDATE-INTAKE-V2</title></head><body>" +
    "<p>このウェブアプリは稼働中です（V2: questionsJson 対応）。</p>" +
    "<p>フォーム作成は Candidate Intake アプリから POST で呼び出してください。</p>" +
    "</body></html>";
  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
}
