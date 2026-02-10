/**
 * Web履歴書PDFのファイル名から求職者NO（5から始まる7桁）を抽出する。
 * 正本プロンプト: 求職者NOはファイル名からのみ取得。会話メモ・PDF本文の番号は使用しない。
 */

const CANDIDATE_NO_REGEX = /5[0-9]{6}/;

/**
 * ファイル名に「5から始まる7桁の数字」が含まれるか検証する。
 */
export function isValidWebResumeFilename(filename: string | null): boolean {
  if (!filename || typeof filename !== "string") return false;
  return CANDIDATE_NO_REGEX.test(filename);
}

/**
 * ファイル名から求職者NO（7桁文字列）を抽出する。見つからなければ null。
 */
export function extractCandidateNoFromFilename(filename: string | null): string | null {
  if (!filename || typeof filename !== "string") return null;
  const match = filename.match(CANDIDATE_NO_REGEX);
  return match ? match[0] : null;
}

/** ファイル名エラー時に返すメッセージ（正本プロンプトの dialog.message に準拠） */
export const WEB_RESUME_FILENAME_ERROR_MESSAGE = `添付されたWeb履歴書PDFのファイル名が条件を満たしていません。

【必要な条件】
・ファイル名に「5から始まる7桁の番号」が含まれていること
・例：5123456.pdf

現在のファイル名が条件を満たしていないことを確認しました。
ファイル名を修正のうえ、再度アップロードしてください。

※修正が確認できるまで、以降の処理は実行されません。`;
